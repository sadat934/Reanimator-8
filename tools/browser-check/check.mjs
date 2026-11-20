// Browser check for the crt-ui spec. Drives headless Microsoft Edge over the DevTools protocol
// (plain Node 22, global WebSocket and fetch, no dependencies) and writes screenshots into
// docs/screenshots/.
//
// Expects the dev server to be running already, with empty provider keys and a delay so the
// generating state can be caught:
//   $env:GEMINI_API_KEY=''; $env:MISTRAL_API_KEY=''; $env:GROQ_API_KEY=''; $env:DEV_API_DELAY_MS='500'
//   npm run dev -- --port 5199 --strictPort
// Then: node tools/browser-check/check.mjs
// Exit code 0 only if every assertion passed and the page logged no console errors.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CHECK_URL ?? 'http://localhost:5199';
const DEBUG_PORT = 9333;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots');
const OFFLINE_TEXT = 'offline stand-in, not generated just now';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

// ---- DevTools protocol client ----
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('DevTools WebSocket failed')), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(String(message.data));
    if (data.id !== undefined) {
      const entry = pending.get(data.id);
      pending.delete(data.id);
      if (!entry) return;
      if (data.error) entry.reject(new Error(`${entry.method}: ${data.error.message}`));
      else entry.resolve(data.result);
    } else if (data.method) {
      for (const fn of listeners.get(data.method) ?? []) fn(data.params);
    }
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
    },
    on(method, fn) {
      listeners.set(method, [...(listeners.get(method) ?? []), fn]);
    },
    once(method) {
      return new Promise((resolve) => {
        const fn = (params) => {
          listeners.set(method, (listeners.get(method) ?? []).filter((f) => f !== fn));
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), fn]);
      });
    },
    close: () => ws.close(),
  };
}

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Edge is still starting.
    }
    await sleep(200);
  }
  throw new Error('Edge did not open the DevTools port');
}

async function main() {
  try {
    const response = await fetch(BASE);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`Dev server not reachable at ${BASE}: ${error.message}`);
    console.error('Start it first (see the header of this file).');
    process.exit(2);
  }
  if (!existsSync(EDGE)) {
    console.error(`Edge not found at ${EDGE} (set EDGE_PATH)`);
    process.exit(2);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'reanimator-edge-'));
  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let exitCode = 1;
  let client = null;
  try {
    client = await connect(await waitForDebugger());
    exitCode = await run(client);
  } finally {
    client?.close();
    if (edge.pid) spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(1500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Edge may still hold a lock for a moment. The temp folder is harmless.
    }
  }
  process.exit(exitCode);
}

async function run(cdp) {
  const evalJs = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result.value;
  };
  const waitFor = async (expression, label, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evalJs(expression)) return true;
      await sleep(100);
    }
    console.log(`  (timed out waiting for ${label})`);
    return false;
  };
  const shot = async (name, { fullPage = false } = {}) => {
    const params = { format: 'png' };
    if (fullPage) {
      const metrics = await cdp.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize ?? metrics.contentSize;
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
    }
    const { data } = await cdp.send('Page.captureScreenshot', params);
    writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
    console.log(`  saved docs/screenshots/${name}`);
  };
  const navigate = async (url) => {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await loaded;
    await waitFor("document.querySelectorAll('#gallery button').length > 0", 'gallery to render');
  };
  const pressKey = async (key, holdMs) => {
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: key, ...base });
    await sleep(holdMs);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  const frames = () => evalJs("Number(/frames (\\d+)/.exec(document.querySelector('#status').textContent)?.[1] ?? -1)");
  const lit = () => evalJs("Number(document.querySelector('#screen').dataset.litPixels)");
  const clickGallery = (text) =>
    evalJs(`(() => { const b=[...document.querySelectorAll('#gallery button')].find(x=>x.textContent.includes(${JSON.stringify(text)})); if(!b) return false; b.click(); return true; })()`);
  const typePrompt = async (text) => {
    await evalJs("document.querySelector('#prompt').focus()");
    await cdp.send('Input.insertText', { text });
  };
  const startReanimate = async (text) => {
    await evalJs("(() => { const p = document.querySelector('#prompt'); p.value=''; p.dispatchEvent(new Event('input')); p.focus(); })()");
    await typePrompt(text);
    await evalJs("document.querySelector('#submit').click()");
  };
  const waitGenerating = () =>
    waitFor("document.querySelector('#submit').disabled && document.querySelectorAll('#log p:not(.log__empty)').length >= 1", 'generating state');
  const waitDone = () =>
    waitFor("!document.querySelector('#submit').disabled && !document.querySelector('#game-label').hidden", 'result');

  cdp.on('Runtime.exceptionThrown', (p) => consoleErrors.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') consoleErrors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // 01 home
  console.log('01 home');
  await navigate(BASE);
  check('page title is set', (await evalJs('document.title')).includes('Reanimator'));
  check('gallery lists at least one game', (await evalJs("document.querySelectorAll('#gallery button').length")) >= 1);
  check('CRT uses the WebGL shader in this browser', (await evalJs("document.querySelector('#screen').dataset.renderer")) === 'webgl');
  check('sound toggle starts muted', (await evalJs("document.querySelector('#sound').getAttribute('aria-pressed')")) === 'false');
  check('Download and Copy start disabled', await evalJs("document.querySelector('#download').disabled && document.querySelector('#copy').disabled"));
  const fonts = await evalJs("[getComputedStyle(document.body).fontFamily, getComputedStyle(document.querySelector('#log')).fontFamily].join(' | ')");
  check('only system fonts in use', !/(Roboto|Inter|Open Sans|Google)/i.test(fonts) && (await evalJs("document.fonts.size")) === 0, fonts);
  await sleep(300);
  await shot('01-home.png');

  // 02 gallery game plays and answers keys
  console.log('02 gallery playing');
  check('first gallery game clicked', await evalJs("(() => { document.querySelector('#gallery button').click(); return true; })()"));
  await waitFor("Number(document.querySelector('#screen').dataset.litPixels) > 0", 'lit pixels');
  const lit1 = await lit();
  check('gallery game lights pixels', lit1 > 0, `lit ${lit1}`);
  check('label reads pre-generated', (await evalJs("document.querySelector('#game-label').textContent")) === 'pre-generated');
  const f1 = await frames();
  for (const k of ['q', 'w', 'e', 'a', 's']) await pressKey(k, 120);
  await sleep(300);
  const f2 = await frames();
  check('frames advance while keys are sent', f2 > f1, `${f1} -> ${f2}`);
  check('key presses did not crash the game', !(await evalJs("document.querySelector('#status').textContent")).startsWith('CRASHED'));
  await shot('02-gallery-playing.png');

  // pause and reset buttons
  await evalJs("document.querySelector('#pause').click()");
  const paused1 = await frames();
  await sleep(300);
  check('Pause stops the frame counter and sets aria-pressed', (await frames()) === paused1 && (await evalJs("document.querySelector('#pause').getAttribute('aria-pressed')")) === 'true');
  await evalJs("document.querySelector('#pause').click()");
  await evalJs("document.querySelector('#reset').click()");
  await sleep(300);
  check('Reset then resume keeps the game running', (await frames()) >= 0 && (await lit()) > 0);

  // 03 generating
  console.log('03 generating');
  await startReanimate('a ball that bounces off the walls');
  check('generating state reached', await waitGenerating());
  check('Reanimate is disabled while generating', await evalJs("document.querySelector('#submit').disabled"));
  check('prompt counter updates', (await evalJs("document.querySelector('#prompt-count').textContent")).startsWith('33 / 200'));
  check('lightning animation runs with normal motion', (await evalJs("document.querySelector('#lightning').dataset.lightning")) === 'running');
  check('Reanimating badge visible', await evalJs("!document.querySelector('#badge').hidden"));
  await sleep(200);
  await shot('03-generating.png');

  // 04 offline result
  console.log('04 offline result');
  check('generation finished', await waitDone());
  const label = await evalJs("document.querySelector('#game-label').textContent");
  check('label says offline stand-in, not generated just now', label.includes(OFFLINE_TEXT), label);
  check('label is never "generated just now" alone', label.trim() !== 'generated just now');
  check('Download and Copy enabled after a result', await evalJs("!document.querySelector('#download').disabled && !document.querySelector('#copy').disabled"));
  await sleep(500);
  check('generated game lights pixels', (await lit()) > 0);
  check('log has the offline notice', await evalJs(`document.querySelector('#log').textContent.includes(${JSON.stringify(OFFLINE_TEXT)})`));
  check('lightning stopped after the result', (await evalJs("document.querySelector('#lightning').dataset.lightning")) === 'off');
  await evalJs("document.querySelector('#copy').click()");
  await sleep(300);
  check('Copy reports a result', (await evalJs("document.querySelector('#action-status').textContent")).length > 0);
  await shot('04-offline-result.png');

  // 05 mobile
  console.log('05 mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(500);
  check('no horizontal overflow on a phone screen', await evalJs('document.documentElement.scrollWidth <= window.innerWidth + 1'), String(await evalJs('document.documentElement.scrollWidth')));
  await shot('05-mobile.png', { fullPage: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // 06 reduced motion
  console.log('06 reduced motion');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(BASE);
  await startReanimate('a paddle that catches falling blocks');
  check('generating state reached (reduced motion)', await waitGenerating());
  check('no lightning animation under reduced motion', (await evalJs("document.querySelector('#lightning').dataset.lightning")) === 'off');
  check('lightning canvas is hidden by CSS', (await evalJs("getComputedStyle(document.querySelector('#lightning')).display")) === 'none');
  check('static Reanimating badge is shown instead', await evalJs("!document.querySelector('#badge').hidden"));
  await sleep(200);
  await shot('06-reduced-motion.png');
  check('reduced-motion generation finished', await waitDone());
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // 07 CSS fallback and paddle keys
  console.log('07 css fallback');
  await navigate(`${BASE}/?renderer=css`);
  check('?renderer=css selects the CSS fallback', (await evalJs("document.querySelector('#screen').dataset.renderer")) === 'css');
  check('wrapper has the crt--css class', await evalJs("document.querySelector('#crt').classList.contains('crt--css')"));
  check('Catch game clicked', await clickGallery('Catch'));
  await waitFor("Number(document.querySelector('#screen').dataset.litPixels) > 0", 'lit pixels');
  // The game draws with XOR, so a frame can catch the basket between erase and redraw. Retry a few frames.
  const basketX = async () => {
    for (let i = 0; i < 20; i++) {
      const x = await evalJs("(() => { const d = document.querySelector('#screen').getContext('2d').getImageData(0, 29, 64, 1).data; for (let x = 0; x < 64; x++) if (d[x * 4] > 16) return x; return -1; })()");
      if (x >= 0) return x;
      await sleep(20);
    }
    return -1;
  };
  // Headless Edge can run the game slowly, so wait for the basket to settle instead of using fixed delays.
  const settle = async () => {
    let last = await basketX();
    let stable = 0;
    for (let i = 0; i < 50 && stable < 5; i++) {
      await sleep(100);
      const x = await basketX();
      stable = x === last ? stable + 1 : 0;
      last = x;
    }
    return last;
  };
  const waitBasket = async (test) => {
    for (let i = 0; i < 60; i++) {
      if (test(await basketX())) return true;
      await sleep(100);
    }
    return false;
  };
  const x0 = await settle();
  await pressKey('q', 400);
  await waitBasket((x) => x >= 0 && x < x0);
  const x1 = await settle();
  await pressKey('e', 400);
  await waitBasket((x) => x > x1);
  const x2 = await settle();
  check('key Q (left) moves the basket left', x1 >= 0 && x1 < x0, `${x0} -> ${x1}`);
  check('key E (right) moves the basket right', x2 > x1, `${x1} -> ${x2}`);
  await shot('07-css-fallback.png');

  // typing in the prompt must not drive the game
  await evalJs("document.querySelector('#prompt').focus()");
  const before = await settle();
  await cdp.send('Input.insertText', { text: 'qqqq' });
  for (let i = 0; i < 4; i++) await pressKey('q', 60);
  await sleep(500);
  const after = await settle();
  check('keys typed into the prompt are ignored by the game', after >= before, `${before} -> ${after}`);

  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' || '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
