// Sound for the CHIP-8 buzzer: a square wave while the sound timer is above zero.
// Muted by default. Audio becomes audible only after the user unmutes (that click creates and
// resumes the AudioContext, which browsers require). Nothing here unmutes by itself.

export interface OscillatorLike {
  type: OscillatorType;
  frequency: { value: number };
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike {
  gain: { value: number };
  connect(destination: unknown): unknown;
  disconnect(): void;
}

/** The small part of AudioContext this controller uses, so tests can pass a fake. */
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface AudioControllerOptions {
  createContext: () => AudioContextLike;
}

export interface AudioController {
  isMuted(): boolean;
  /** True after the context could not be created. The controller then stays muted. */
  isUnavailable(): boolean;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  /** Call once per frame with the machine's sound timer. */
  update(soundTimer: number): void;
  /** Silences the buzzer without changing the mute setting. */
  stop(): void;
  dispose(): void;
}

export const BUZZ_FREQUENCY_HZ = 440;
export const BUZZ_GAIN = 0.05;

export function createAudioController(options: AudioControllerOptions): AudioController {
  let muted = true;
  let unavailable = false;
  let context: AudioContextLike | null = null;
  let active: { osc: OscillatorLike; gain: GainLike } | null = null;

  const silence = (): void => {
    if (active === null) return;
    const { osc, gain } = active;
    active = null;
    try {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    } catch {
      // already stopped: nothing left to do
    }
  };

  const ensureContext = (): boolean => {
    if (context !== null) return true;
    try {
      context = options.createContext();
    } catch {
      unavailable = true;
      return false;
    }
    context.resume().catch(() => undefined);
    return true;
  };

  const startBuzz = (ctx: AudioContextLike): void => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = BUZZ_FREQUENCY_HZ;
    gain.gain.value = BUZZ_GAIN;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    active = { osc, gain };
  };

  return {
    isMuted: () => muted,
    isUnavailable: () => unavailable,
    setMuted(next) {
      if (next) {
        muted = true;
        silence();
        return;
      }
      if (ensureContext()) muted = false;
    },
    toggleMuted() {
      this.setMuted(!muted);
    },
    update(soundTimer) {
      const wanted = soundTimer > 0 && !muted && context !== null;
      if (wanted && active === null && context !== null) startBuzz(context);
      else if (!wanted) silence();
    },
    stop: silence,
    dispose() {
      silence();
      const ctx = context;
      context = null;
      muted = true;
      ctx?.close().catch(() => undefined);
    },
  };
}
