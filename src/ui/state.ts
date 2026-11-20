// Pure state machine for the page: idle -> generating -> playing | failed. No DOM, no network.
import type { GenerateFailureBody, GenerateSuccessBody, ProgressEvent } from '../shared/api';
import type { GalleryEntry } from './gallery';
import type { GameOrigin } from './labels';

export type Phase = 'idle' | 'generating' | 'playing' | 'failed';

export interface Game {
  title: string;
  source: string;
  romBase64: string;
  origin: GameOrigin;
}

export interface State {
  phase: Phase;
  log: string[];
  game: Game | null;
  paused: boolean;
  message: string | null;
  /** The prompt of the request in flight, used as the title of its result. */
  pendingPrompt: string | null;
}

export type Action =
  | { type: 'submit'; prompt: string }
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'resultOk'; body: GenerateSuccessBody }
  | { type: 'resultFail'; body: GenerateFailureBody }
  | { type: 'streamError'; message: string }
  | { type: 'loadGallery'; entry: GalleryEntry }
  | { type: 'togglePause' }
  | { type: 'reset' };

export const EMPTY_PROMPT_MESSAGE = 'Describe the game in a sentence first.';

export const initialState: State = {
  phase: 'idle',
  log: [],
  game: null,
  paused: false,
  message: null,
  pendingPrompt: null,
};

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'submit': {
      if (state.phase === 'generating') return state;
      const prompt = action.prompt.trim();
      if (prompt === '') return { ...state, message: EMPTY_PROMPT_MESSAGE };
      return { ...state, phase: 'generating', log: [], message: null, pendingPrompt: prompt };
    }
    case 'progress':
      if (state.phase !== 'generating') return state;
      return { ...state, log: [...state.log, action.event.message] };
    case 'resultOk': {
      if (state.phase !== 'generating') return state;
      const { body } = action;
      return {
        ...state,
        phase: 'playing',
        paused: false,
        message: null,
        pendingPrompt: null,
        game: {
          title: state.pendingPrompt ?? 'Reanimated game',
          source: body.source,
          romBase64: body.romBase64,
          origin: { kind: 'live', provider: body.provider, offline: body.offline },
        },
      };
    }
    case 'resultFail':
      if (state.phase !== 'generating') return state;
      return { ...state, phase: 'failed', message: action.body.message, pendingPrompt: null };
    case 'streamError':
      if (state.phase !== 'generating') return state;
      return { ...state, phase: 'failed', message: action.message, pendingPrompt: null };
    case 'loadGallery': {
      if (state.phase === 'generating') return state;
      const { entry } = action;
      return {
        ...state,
        phase: 'playing',
        log: [],
        paused: false,
        message: null,
        pendingPrompt: null,
        game: {
          title: entry.title,
          source: entry.source,
          romBase64: entry.romBase64,
          origin: entry.note === undefined ? { kind: 'gallery' } : { kind: 'gallery', note: entry.note },
        },
      };
    }
    case 'togglePause':
      if (state.game === null) return state;
      return { ...state, paused: !state.paused };
    case 'reset':
      return { ...state, paused: false };
  }
}
