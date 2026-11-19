// Headless test harness: runs a ROM for 300 frames with a scripted key sequence and
// reports the section 7 step 4 pass criteria. Deterministic: no clock, no Math.random
// (the emulator's CXNN uses a seeded PRNG), so the same ROM always gives the same report.
import { Chip8, describeCrash } from '../emulator';
import type { Chip8Config } from '../emulator';

export const HARNESS_FRAMES = 300;
/** Frames 1..WARMUP_FRAMES are ignored by the "non-blank" criterion. */
export const WARMUP_FRAMES = 5;
/** Keys pressed in turn: 1 2 3 4 Q W E R A S D F Z X C V (as CHIP-8 hex key indices). */
export const KEY_SEQUENCE: readonly number[] = [
  0x1, 0x2, 0x3, 0xc, 0x4, 0x5, 0x6, 0xd, 0x7, 0x8, 0x9, 0xe, 0xa, 0x0, 0xb, 0xf,
];
/** Each key goes down on the first frame of its slot and up after KEY_HOLD_FRAMES. */
export const KEY_SLOT_FRAMES = 18;
export const KEY_HOLD_FRAMES = 10;

export type HarnessReport = {
  /** True only if every criterion below holds. */
  passed: boolean;
  framesRun: number;
  /** Criterion 1: the machine did not crash. */
  crashed: boolean;
  crashReason: string | null;
  /** Criterion 2: some frame after frame 5 had at least one lit pixel. */
  nonBlankAfterFrame5: boolean;
  /** Criterion 3: the display differed between two consecutive frames after frame 5. */
  displayChanged: boolean;
  /** True if the display changed on the frame a key went down or the frame after. */
  changedAfterKeypress: boolean;
  /** Criterion 4 (inverted): no frame ever had a lit pixel, so the program never drew. */
  hungWithoutDrawing: boolean;
  /** Frames (1-based) whose display differed from the previous frame. */
  changedFrames: number;
  /** One human-readable line per failed criterion, for the repair prompt. */
  failures: string[];
};

export type HarnessOptions = Partial<Pick<Chip8Config, 'cyclesPerFrame' | 'quirks' | 'seed'>>;

const sameDisplay = (a: Uint8Array, b: Uint8Array): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const anyLit = (d: Uint8Array): boolean => d.some((p) => p !== 0);

/** Runs the ROM for HARNESS_FRAMES frames with the scripted keys and returns the report. */
export function runHeadless(rom: Uint8Array, options: HarnessOptions = {}): HarnessReport {
  const machine = new Chip8(options);
  machine.loadRom(rom);

  let prev = machine.getDisplay();
  let everLit = false;
  let litAfterWarmup = false;
  let changedFrames = 0;
  let changedAfterKeypress = false;
  let framesRun = 0;
  const keyFrames = new Set<number>();

  for (let frame = 1; frame <= HARNESS_FRAMES; frame++) {
    // Frames 1..WARMUP_FRAMES are idle; key slots start after that.
    const slotFrame = frame - 1 - WARMUP_FRAMES;
    if (slotFrame >= 0) {
      const slot = Math.floor(slotFrame / KEY_SLOT_FRAMES);
      const within = slotFrame % KEY_SLOT_FRAMES;
      if (slot < KEY_SEQUENCE.length) {
        if (within === 0) {
          machine.pressKey(KEY_SEQUENCE[slot]!);
          keyFrames.add(frame);
          keyFrames.add(frame + 1);
        } else if (within === KEY_HOLD_FRAMES) {
          machine.releaseKey(KEY_SEQUENCE[slot]!);
        }
      }
    }

    machine.runFrame();
    framesRun = frame;
    if (machine.getStatus().crashed) break;

    const display = machine.getDisplay();
    const lit = anyLit(display);
    if (lit) everLit = true;
    if (lit && frame > WARMUP_FRAMES) litAfterWarmup = true;
    if (frame > WARMUP_FRAMES && !sameDisplay(display, prev)) {
      changedFrames++;
      if (keyFrames.has(frame)) changedAfterKeypress = true;
    }
    prev = display;
  }

  const status = machine.getStatus();
  const crashed = status.crashed;
  const crashReason = status.reason ? describeCrash(status.reason) : null;
  const displayChanged = changedFrames > 0;
  const hungWithoutDrawing = !crashed && !everLit;

  const failures: string[] = [];
  if (crashed) failures.push(`The program crashed at frame ${framesRun}: ${crashReason}.`);
  if (!litAfterWarmup && !hungWithoutDrawing) {
    failures.push(
      `The display was blank in every frame after frame ${WARMUP_FRAMES}. Draw something and keep it visible.`,
    );
  }
  if (!displayChanged) {
    failures.push(
      'The display never changed between frames. Animate something or react to key presses.',
    );
  }
  if (hungWithoutDrawing) {
    failures.push(
      `The program never drew anything in ${HARNESS_FRAMES} frames (stuck in a loop or waiting without drawing${status.waitingForKey ? '; it is waiting for a key' : ''}).`,
    );
  }

  return {
    passed: !crashed && litAfterWarmup && displayChanged && !hungWithoutDrawing,
    framesRun,
    crashed,
    crashReason,
    nonBlankAfterFrame5: litAfterWarmup,
    displayChanged,
    changedAfterKeypress,
    hungWithoutDrawing,
    changedFrames,
    failures,
  };
}
