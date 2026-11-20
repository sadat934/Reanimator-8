import { describe, expect, it } from 'vitest';
import type { GenerateFailureBody, GenerateSuccessBody } from '../../src/shared/api';
import type { GalleryEntry } from '../../src/ui/gallery';
import { EMPTY_PROMPT_MESSAGE, initialState, reduce } from '../../src/ui/state';
import type { Action, State } from '../../src/ui/state';

const okBody = (over: Partial<GenerateSuccessBody> = {}): GenerateSuccessBody => ({
  ok: true,
  source: ': main\n',
  romBase64: 'AA==',
  report: {} as GenerateSuccessBody['report'],
  provider: 'gemini',
  attempts: 1,
  offline: false,
  origin: 'generated just now by gemini',
  log: [],
  ...over,
});

const failBody: GenerateFailureBody = {
  ok: false,
  message: 'The experiment failed.',
  attempts: 3,
  lastProblem: 'x',
  lastSource: null,
  provider: null,
  offline: false,
  log: [],
};

const entry: GalleryEntry = { title: 'Bounce', prompt: 'p', source: 's', romBase64: 'AA==' };
const run = (actions: Action[], from: State = initialState): State => actions.reduce(reduce, from);
const generating = (): State => run([{ type: 'submit', prompt: 'a ball' }]);

describe('state machine', () => {
  it('starts idle with no game', () => {
    expect(initialState).toMatchObject({ phase: 'idle', game: null, paused: false, message: null, log: [] });
  });

  it('submit moves to generating and clears the old log and message', () => {
    const s = run([{ type: 'submit', prompt: '  a ball ' }], { ...initialState, log: ['old'], message: 'old' });
    expect(s).toMatchObject({ phase: 'generating', log: [], message: null, pendingPrompt: 'a ball' });
  });

  it('ignores an empty or whitespace prompt and sets a message', () => {
    const s = run([{ type: 'submit', prompt: '   ' }]);
    expect(s.phase).toBe('idle');
    expect(s.message).toBe(EMPTY_PROMPT_MESSAGE);
  });

  it('ignores submit while generating', () => {
    const s = generating();
    expect(reduce(s, { type: 'submit', prompt: 'another' })).toBe(s);
  });

  it('appends progress messages only while generating', () => {
    const event = { attempt: 1, kind: 'generating', message: 'hello' } as const;
    expect(run([{ type: 'progress', event }]).log).toEqual([]);
    expect(reduce(generating(), { type: 'progress', event }).log).toEqual(['hello']);
  });

  it('resultOk starts a live game titled with the prompt', () => {
    const s = reduce(generating(), { type: 'resultOk', body: okBody() });
    expect(s.phase).toBe('playing');
    expect(s.game).toMatchObject({ title: 'a ball', origin: { kind: 'live', provider: 'gemini', offline: false } });
  });

  it('resultOk marks an offline answer as offline', () => {
    const s = reduce(generating(), { type: 'resultOk', body: okBody({ provider: 'mock', offline: true }) });
    expect(s.game?.origin).toEqual({ kind: 'live', provider: 'mock', offline: true });
  });

  it('resultFail goes to failed with the server message and keeps the log', () => {
    const progressed = run([
      { type: 'submit', prompt: 'a ball' },
      { type: 'progress', event: { attempt: 1, kind: 'generating', message: 'line' } },
      { type: 'resultFail', body: failBody },
    ]);
    expect(progressed).toMatchObject({ phase: 'failed', message: 'The experiment failed.', log: ['line'] });
  });

  it('streamError goes to failed', () => {
    const s = reduce(generating(), { type: 'streamError', message: 'network down' });
    expect(s).toMatchObject({ phase: 'failed', message: 'network down' });
  });

  it('results and errors outside generating are ignored', () => {
    expect(reduce(initialState, { type: 'resultOk', body: okBody() })).toBe(initialState);
    expect(reduce(initialState, { type: 'resultFail', body: failBody })).toBe(initialState);
    expect(reduce(initialState, { type: 'streamError', message: 'x' })).toBe(initialState);
  });

  it('allows a new submit after a failure', () => {
    const failed = reduce(generating(), { type: 'streamError', message: 'x' });
    expect(reduce(failed, { type: 'submit', prompt: 'again' }).phase).toBe('generating');
  });

  it('loadGallery works in idle, playing and failed, clears the log and uses the gallery origin', () => {
    const failed = reduce(generating(), { type: 'streamError', message: 'x' });
    for (const from of [initialState, failed, { ...initialState, phase: 'playing' as const, log: ['x'] }]) {
      const s = reduce(from, { type: 'loadGallery', entry });
      expect(s).toMatchObject({ phase: 'playing', log: [], message: null, game: { title: 'Bounce', origin: { kind: 'gallery' } } });
    }
  });

  it('loadGallery carries the note into the origin', () => {
    const s = reduce(initialState, { type: 'loadGallery', entry: { ...entry, note: 'placeholder' } });
    expect(s.game?.origin).toEqual({ kind: 'gallery', note: 'placeholder' });
  });

  it('loadGallery is ignored while generating', () => {
    const s = generating();
    expect(reduce(s, { type: 'loadGallery', entry })).toBe(s);
  });

  it('togglePause is a no-op without a game and toggles with one', () => {
    expect(reduce(initialState, { type: 'togglePause' })).toBe(initialState);
    const playing = reduce(initialState, { type: 'loadGallery', entry });
    const paused = reduce(playing, { type: 'togglePause' });
    expect(paused.paused).toBe(true);
    expect(reduce(paused, { type: 'togglePause' }).paused).toBe(false);
  });

  it('reset unpauses and a new game starts unpaused', () => {
    const paused = run([{ type: 'loadGallery', entry }, { type: 'togglePause' }]);
    expect(reduce(paused, { type: 'reset' }).paused).toBe(false);
    expect(reduce(paused, { type: 'loadGallery', entry }).paused).toBe(false);
  });
});
