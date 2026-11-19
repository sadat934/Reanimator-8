// Plain 2D canvas renderer and keyboard input for the CHIP-8 core. No CRT effects or audio yet.

import { Chip8, DISPLAY_HEIGHT, DISPLAY_WIDTH, describeCrash } from '../emulator';
import { keyToHex } from './keymap';

const FRAME_MS = 1000 / 60;
const MAX_FRAMES_PER_TICK = 5;
const LIT = [0x33, 0xff, 0x66];
const OFF = [0x00, 0x1a, 0x08];

export type RendererOptions = {
  canvas: HTMLCanvasElement;
  statusEl: HTMLElement;
  rom: Uint8Array;
};

export function startRenderer({ canvas, statusEl, rom }: RendererOptions): Chip8 | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    statusEl.textContent = 'Canvas not supported';
    console.error('2D canvas context unavailable');
    return null;
  }

  const machine = new Chip8();
  machine.loadRom(rom);
  const image = ctx.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);

  function paint(): void {
    const display = machine.getDisplay();
    for (let i = 0; i < display.length; i++) {
      const color = display[i] ? LIT : OFF;
      image.data[i * 4] = color[0] as number;
      image.data[i * 4 + 1] = color[1] as number;
      image.data[i * 4 + 2] = color[2] as number;
      image.data[i * 4 + 3] = 255;
    }
    ctx?.putImageData(image, 0, 0);
  }

  let loggedCrash = false;
  function updateStatus(): void {
    const s = machine.getStatus();
    if (s.crashed && s.reason) {
      statusEl.textContent = `CRASHED: ${describeCrash(s.reason)}`;
      if (!loggedCrash) {
        loggedCrash = true;
        console.error(statusEl.textContent);
      }
      return;
    }
    const hex = s.pc.toString(16).toUpperCase().padStart(3, '0');
    const wait = s.waitingForKey ? ' | waiting for key' : '';
    statusEl.textContent = `running | pc 0x${hex} | frames ${s.frames}${wait}`;
  }

  // Keys: forward to the machine, ignore auto-repeat and modified keys.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const k = keyToHex(event.key);
    if (k === null) return;
    event.preventDefault();
    if (event.repeat) return;
    machine.pressKey(k);
  });
  window.addEventListener('keyup', (event) => {
    const k = keyToHex(event.key);
    if (k === null) return;
    event.preventDefault();
    machine.releaseKey(k);
  });
  window.addEventListener('blur', () => {
    for (let k = 0; k < 16; k++) machine.releaseKey(k);
  });

  // Fixed-step loop: turn rAF timestamps into whole 60 Hz frames.
  let last: number | null = null;
  let accumulator = 0;
  function tick(now: number): void {
    if (last !== null) accumulator += now - last;
    last = now;
    let frames = 0;
    while (accumulator >= FRAME_MS && frames < MAX_FRAMES_PER_TICK) {
      machine.runFrame();
      accumulator -= FRAME_MS;
      frames++;
    }
    if (frames === MAX_FRAMES_PER_TICK) accumulator = 0; // drop backlog after a suspended tab
    paint();
    updateStatus();
    requestAnimationFrame(tick);
  }
  paint();
  updateStatus();
  requestAnimationFrame(tick);
  return machine;
}
