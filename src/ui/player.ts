// Player controller: owns one Chip8, runs it at a fixed 60 Hz, forwards keys, paints through a
// view and feeds the buzzer. No network and no server code here (see tests/ui/no-secrets.test.ts).
import { Chip8, describeCrash } from '../emulator';
import { keyToHex } from './keymap';

const FRAME_MS = 1000 / 60;
const MAX_FRAMES_PER_TICK = 5;

/** Anything that can draw the 64x32 display (the CRT view or a test fake). */
export interface DisplayView {
  paint(display: Uint8Array, timeSec: number): void;
}

/** The part of the audio controller the player uses. */
export interface BuzzerLike {
  update(soundTimer: number): void;
}

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  view: DisplayView;
  audio: BuzzerLike;
  statusEl: HTMLElement;
}

export interface Player {
  /** Loads a ROM and starts it from the beginning. Throws if the ROM is empty or too large. */
  load(rom: Uint8Array): void;
  /** Flips pause and returns the new value. */
  togglePause(): boolean;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  /** Restarts the loaded ROM. Does nothing before a ROM is loaded. */
  reset(): void;
  /** Instructions per frame, integer 1..1000. */
  setSpeed(cycles: number): void;
  /** A copy of the loaded ROM, or null. */
  getRom(): Uint8Array | null;
  dispose(): void;
}

/** Input types that keep the focus for typing, so game keys must not be taken from them. */
const NON_TEXT_INPUT_TYPES = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset']);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return false;
}

function countLit(display: Uint8Array): number {
  let lit = 0;
  for (let i = 0; i < display.length; i++) if (display[i]) lit++;
  return lit;
}

export function createPlayer({ canvas, view, audio, statusEl }: PlayerOptions): Player {
  const machine = new Chip8();
  let rom: Uint8Array | null = null;
  let paused = false;
  let loggedCrash = false;
  let lastStatus = '';

  function releaseAllKeys(): void {
    for (let k = 0; k < 16; k++) machine.releaseKey(k);
  }

  function setStatus(text: string): void {
    if (text === lastStatus) return;
    lastStatus = text;
    statusEl.textContent = text;
  }

  function updateStatus(): void {
    if (rom === null) {
      setStatus('no game loaded');
      return;
    }
    const s = machine.getStatus();
    if (s.crashed && s.reason) {
      const text = `CRASHED: ${describeCrash(s.reason)}`;
      setStatus(text);
      if (!loggedCrash) {
        loggedCrash = true;
        console.warn(text);
      }
      return;
    }
    const hex = s.pc.toString(16).toUpperCase().padStart(3, '0');
    const wait = s.waitingForKey ? ' | waiting for key' : '';
    setStatus(`${paused ? 'paused' : 'running'} | pc 0x${hex} | frames ${s.frames}${wait}`);
  }

  // Keys: forward to the machine; ignore auto-repeat, modified keys and typing in form fields.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const k = keyToHex(event.key);
    if (k === null) return;
    event.preventDefault();
    if (event.repeat) return;
    machine.pressKey(k);
  }
  function onKeyUp(event: KeyboardEvent): void {
    const k = keyToHex(event.key);
    if (k === null) return;
    // Releasing is always safe, even from a form field, so a key can never stay stuck.
    machine.releaseKey(k);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAllKeys);

  // Fixed-step loop: turn rAF timestamps into whole 60 Hz frames.
  let last: number | null = null;
  let accumulator = 0;
  let handle = 0;
  function tick(now: number): void {
    if (last !== null) accumulator += now - last;
    last = now;
    let frames = 0;
    if (rom !== null && !paused) {
      while (accumulator >= FRAME_MS && frames < MAX_FRAMES_PER_TICK) {
        machine.runFrame();
        accumulator -= FRAME_MS;
        frames++;
      }
    }
    if (frames === MAX_FRAMES_PER_TICK || paused || rom === null) accumulator = 0; // drop backlog
    const status = machine.getStatus();
    audio.update(paused || status.crashed || rom === null ? 0 : status.soundTimer);
    const display = machine.getDisplay();
    view.paint(display, now / 1000);
    canvas.dataset.litPixels = String(countLit(display));
    updateStatus();
    handle = requestAnimationFrame(tick);
  }
  canvas.dataset.litPixels = '0';
  updateStatus();
  handle = requestAnimationFrame(tick);

  return {
    load(bytes) {
      machine.loadRom(bytes);
      rom = Uint8Array.from(bytes);
      paused = false;
      loggedCrash = false;
      releaseAllKeys();
      updateStatus();
    },
    togglePause() {
      if (rom !== null) paused = !paused;
      updateStatus();
      return paused;
    },
    setPaused(value) {
      paused = rom !== null && value;
      updateStatus();
    },
    isPaused: () => paused,
    reset() {
      if (rom === null) return;
      machine.reset();
      loggedCrash = false;
      releaseAllKeys();
      updateStatus();
    },
    setSpeed(cycles) {
      machine.setCyclesPerFrame(cycles);
    },
    getRom: () => (rom === null ? null : Uint8Array.from(rom)),
    dispose() {
      cancelAnimationFrame(handle);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
      audio.update(0);
    },
  };
}
