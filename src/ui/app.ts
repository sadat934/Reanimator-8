// Page wiring: builds the CRT view, player, audio and lightning, keeps the state machine and
// renders it into the DOM. Browser only. Everything that needs a key goes through POST /api/generate
// (src/ui/api-client.ts); nothing here imports server code (tests/ui/no-secrets.test.ts).
import { base64ToBytes, MAX_PROMPT_CHARS } from '../shared/api';
import { createAudioController } from './audio';
import { createBrowserContext } from './audio-browser';
import { generate } from './api-client';
import { createCrtView } from './crt';
import { describeEntry } from './gallery';
import { gallery } from './gallery-data';
import { labelFor, LABEL_OFFLINE } from './labels';
import { createLightning } from './lightning';
import { createPlayer } from './player';
import { initialState, reduce, type Action, type State } from './state';

function must<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const el = root.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`Missing element ${selector}`);
  return el;
}

/** File-name friendly version of a title, for the downloaded ROM. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug === '' ? 'game' : slug;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the hidden-textarea fallback.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function startApp(root: ParentNode): void {
  const screen = must(root, '#screen', HTMLCanvasElement);
  const overlay = must(root, '#lightning', HTMLCanvasElement);
  const hint = must(root, '#crt-hint', HTMLElement);
  const badge = must(root, '#badge', HTMLElement);
  const gameTitle = must(root, '#game-title', HTMLElement);
  const gameLabel = must(root, '#game-label', HTMLElement);
  const gameNote = must(root, '#game-note', HTMLElement);
  const statusEl = must(root, '#status', HTMLElement);
  const pauseBtn = must(root, '#pause', HTMLButtonElement);
  const resetBtn = must(root, '#reset', HTMLButtonElement);
  const speed = must(root, '#speed', HTMLInputElement);
  const speedValue = must(root, '#speed-value', HTMLOutputElement);
  const downloadBtn = must(root, '#download', HTMLButtonElement);
  const copyBtn = must(root, '#copy', HTMLButtonElement);
  const soundBtn = must(root, '#sound', HTMLButtonElement);
  const soundState = must(root, '#sound-state', HTMLElement);
  const actionStatus = must(root, '#action-status', HTMLElement);
  const form = must(root, '#spell', HTMLFormElement);
  const prompt = must(root, '#prompt', HTMLTextAreaElement);
  const counter = must(root, '#prompt-count', HTMLElement);
  const submitBtn = must(root, '#submit', HTMLButtonElement);
  const alertEl = must(root, '#alert', HTMLElement);
  const logEl = must(root, '#log', HTMLElement);
  const galleryEl = must(root, '#gallery', HTMLElement);

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const forceCss = new URLSearchParams(window.location.search).get('renderer') === 'css';

  const view = createCrtView(screen, { forceCss, reducedMotion: reducedQuery.matches });
  const lightning = createLightning(overlay, { reducedMotion: reducedQuery.matches });
  const audio = createAudioController({ createContext: createBrowserContext });
  const player = createPlayer({ canvas: screen, view, audio, statusEl });
  reducedQuery.addEventListener('change', () => {
    view.setReducedMotion(reducedQuery.matches);
    lightning.setReducedMotion(reducedQuery.matches);
  });

  let state: State = initialState;
  let loadError: string | null = null;
  let renderedLog = 0;
  let controller: AbortController | null = null;

  function renderLog(): void {
    if (state.log.length === 0) {
      logEl.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'log__empty';
      empty.textContent = 'Waiting for an incantation.';
      logEl.append(empty);
      renderedLog = 0;
      return;
    }
    if (renderedLog === 0 || state.log.length < renderedLog) {
      logEl.replaceChildren();
      renderedLog = 0;
    }
    for (; renderedLog < state.log.length; renderedLog++) {
      const line = document.createElement('p');
      line.textContent = `> ${state.log[renderedLog]}`;
      logEl.append(line);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function render(): void {
    const generating = state.phase === 'generating';
    const game = state.game;
    submitBtn.disabled = generating;
    badge.hidden = !generating;
    if (generating) lightning.start();
    else lightning.stop();
    hint.hidden = game !== null;

    if (game) {
      const label = labelFor(game.origin);
      gameTitle.textContent = game.title;
      gameLabel.hidden = false;
      gameLabel.textContent = label;
      gameLabel.classList.toggle('badge--offline', label === LABEL_OFFLINE);
      gameNote.textContent =
        game.origin.kind === 'gallery' ? (game.origin.note ?? '') : `via ${game.origin.provider}`;
    } else {
      gameTitle.textContent = 'Nothing loaded';
      gameLabel.hidden = true;
      gameLabel.textContent = '';
      gameNote.textContent = '';
    }
    downloadBtn.disabled = game === null;
    copyBtn.disabled = game === null;
    pauseBtn.setAttribute('aria-pressed', String(state.paused));
    pauseBtn.disabled = game === null;
    resetBtn.disabled = game === null;
    alertEl.textContent = loadError ?? state.message ?? '';
    renderLog();
  }

  function dispatch(action: Action): void {
    const prev = state;
    state = reduce(state, action);
    loadError = null;
    if (state.game && state.game !== prev.game) {
      try {
        player.load(base64ToBytes(state.game.romBase64));
        player.setSpeed(Number(speed.value));
      } catch (error) {
        loadError = `Could not load this game: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (state.paused !== prev.paused) player.setPaused(state.paused);
    render();
  }

  // ---- spell form ----
  function updateCounter(): void {
    counter.textContent = `${prompt.value.length} / ${MAX_PROMPT_CHARS}`;
  }
  prompt.addEventListener('input', updateCounter);

  async function run(text: string): Promise<void> {
    controller = new AbortController();
    const { signal } = controller;
    try {
      const result = await generate(text, {
        signal,
        onProgress: (event) => dispatch({ type: 'progress', event }),
      });
      dispatch(result.ok ? { type: 'resultOk', body: result } : { type: 'resultFail', body: result });
    } catch (error) {
      if (signal.aborted) return;
      dispatch({ type: 'streamError', message: error instanceof Error ? error.message : 'Request failed' });
    } finally {
      controller = null;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const before = state.phase;
    dispatch({ type: 'submit', prompt: prompt.value });
    if (before !== 'generating' && state.phase === 'generating' && state.pendingPrompt !== null) {
      void run(state.pendingPrompt);
    }
  });
  window.addEventListener('pagehide', () => controller?.abort());

  // ---- controls ----
  pauseBtn.addEventListener('click', () => dispatch({ type: 'togglePause' }));
  resetBtn.addEventListener('click', () => {
    dispatch({ type: 'reset' });
    player.reset();
  });
  speed.addEventListener('input', () => {
    speedValue.textContent = speed.value;
    try {
      player.setSpeed(Number(speed.value));
    } catch {
      // The slider range is 1..60, so this cannot happen. Ignore rather than break the page.
    }
  });

  downloadBtn.addEventListener('click', () => {
    const rom = player.getRom();
    if (!rom || !state.game) return;
    const url = URL.createObjectURL(new Blob([rom.slice()], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(state.game.title)}.ch8`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    actionStatus.textContent = `Downloaded ${link.download}.`;
  });

  copyBtn.addEventListener('click', () => {
    const game = state.game;
    if (!game) return;
    void copyText(game.source).then((ok) => {
      actionStatus.textContent = ok ? 'Octo source copied to the clipboard.' : 'Could not copy. Select the source by hand instead.';
    });
  });

  function renderSound(): void {
    const on = !audio.isMuted();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundState.textContent = on ? 'on' : 'off';
    if (audio.isUnavailable()) actionStatus.textContent = 'Sound is not available in this browser.';
  }
  soundBtn.addEventListener('click', () => {
    audio.toggleMuted(); // inside the click handler so the browser allows audio
    renderSound();
  });
  renderSound();

  // ---- gallery ----
  if (gallery.entries.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No gallery games yet.';
    galleryEl.append(item);
  }
  for (const entry of gallery.entries) {
    const info = describeEntry(entry);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('span');
    title.className = 'gallery__title';
    title.textContent = info.title;
    const label = document.createElement('span');
    label.className = 'badge';
    label.textContent = info.label;
    button.append(title, label);
    if (info.note) {
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = info.note;
      button.append(note);
    }
    button.addEventListener('click', () => dispatch({ type: 'loadGallery', entry }));
    item.append(button);
    galleryEl.append(item);
  }
  for (const problem of gallery.errors) console.warn(`gallery: ${problem}`);

  updateCounter();
  render();
}
