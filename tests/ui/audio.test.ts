import { describe, expect, it } from 'vitest';
import { createAudioController } from '../../src/ui/audio';
import type { AudioContextLike, GainLike, OscillatorLike } from '../../src/ui/audio';

class FakeOsc implements OscillatorLike {
  type: OscillatorType = 'sine';
  frequency = { value: 0 };
  starts = 0;
  stops = 0;
  disconnects = 0;
  connectedTo: unknown = null;
  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }
  disconnect(): void {
    this.disconnects++;
  }
  start(): void {
    this.starts++;
  }
  stop(): void {
    this.stops++;
  }
}

class FakeGain implements GainLike {
  gain = { value: 1 };
  connectedTo: unknown = null;
  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }
  disconnect(): void {}
}

class FakeContext implements AudioContextLike {
  state = 'suspended';
  currentTime = 0;
  destination = { name: 'speakers' };
  resumes = 0;
  closes = 0;
  oscillators: FakeOsc[] = [];
  gains: FakeGain[] = [];
  async resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.closes++;
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscillators.push(o);
    return o;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
}

function setup() {
  const contexts: FakeContext[] = [];
  const audio = createAudioController({
    createContext: () => {
      const c = new FakeContext();
      contexts.push(c);
      return c;
    },
  });
  return { audio, contexts };
}

describe('audio controller', () => {
  it('is muted by default and creates no context before the user unmutes', () => {
    const { audio, contexts } = setup();
    expect(audio.isMuted()).toBe(true);
    audio.update(5);
    audio.update(0);
    expect(contexts).toHaveLength(0);
  });

  it('makes no sound while muted, even with the sound timer running', () => {
    const { audio, contexts } = setup();
    audio.toggleMuted();
    audio.toggleMuted();
    expect(audio.isMuted()).toBe(true);
    audio.update(5);
    expect(contexts[0]?.oscillators).toHaveLength(0);
  });

  it('creates and resumes the context on the first unmute only', () => {
    const { audio, contexts } = setup();
    audio.toggleMuted();
    expect(audio.isMuted()).toBe(false);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resumes).toBe(1);
    audio.toggleMuted();
    audio.toggleMuted();
    expect(contexts).toHaveLength(1);
  });

  it('plays one 440 Hz square oscillator at gain 0.05 per sound burst', () => {
    const { audio, contexts } = setup();
    audio.setMuted(false);
    const ctx = contexts[0] as FakeContext;
    audio.update(3);
    audio.update(2);
    audio.update(1);
    expect(ctx.oscillators).toHaveLength(1);
    const osc = ctx.oscillators[0] as FakeOsc;
    expect(osc.type).toBe('square');
    expect(osc.frequency.value).toBe(440);
    expect(ctx.gains[0]?.gain.value).toBe(0.05);
    expect(osc.connectedTo).toBe(ctx.gains[0]);
    expect(ctx.gains[0]?.connectedTo).toBe(ctx.destination);
    expect(osc.starts).toBe(1);
    expect(osc.stops).toBe(0);
    audio.update(0);
    expect(osc.stops).toBe(1);
    expect(osc.disconnects).toBe(1);
    audio.update(0);
    expect(osc.stops).toBe(1);
    audio.update(2);
    expect(ctx.oscillators).toHaveLength(2);
  });

  it('stops the buzz when muted during it', () => {
    const { audio, contexts } = setup();
    audio.setMuted(false);
    audio.update(4);
    const osc = contexts[0]?.oscillators[0] as FakeOsc;
    audio.setMuted(true);
    expect(osc.stops).toBe(1);
    audio.update(4);
    expect(contexts[0]?.oscillators).toHaveLength(1);
  });

  it('stop() silences without muting', () => {
    const { audio, contexts } = setup();
    audio.setMuted(false);
    audio.update(4);
    audio.stop();
    expect((contexts[0]?.oscillators[0] as FakeOsc).stops).toBe(1);
    expect(audio.isMuted()).toBe(false);
  });

  it('stays muted and flags unavailable when createContext throws', () => {
    const audio = createAudioController({
      createContext: () => {
        throw new Error('no audio here');
      },
    });
    expect(() => audio.toggleMuted()).not.toThrow();
    expect(audio.isMuted()).toBe(true);
    expect(audio.isUnavailable()).toBe(true);
    expect(() => audio.update(5)).not.toThrow();
  });

  it('dispose closes the context, silences and mutes', () => {
    const { audio, contexts } = setup();
    audio.setMuted(false);
    audio.update(4);
    audio.dispose();
    expect(contexts[0]?.closes).toBe(1);
    expect((contexts[0]?.oscillators[0] as FakeOsc).stops).toBe(1);
    expect(audio.isMuted()).toBe(true);
  });
});
