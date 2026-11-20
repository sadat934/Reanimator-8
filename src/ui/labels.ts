// Honest labels for where a game came from (reanimator.md section 2). Pure, no DOM.
// The offline text must match OFFLINE_NOTICE in src/loop/reanimate.ts (a test pins it).
// This file must not import src/loop: the browser never loads server code.

export type GameOrigin =
  | { kind: 'gallery'; note?: string }
  | { kind: 'live'; provider: string; offline: boolean };

export const LABEL_GALLERY = 'pre-generated';
export const LABEL_LIVE = 'generated just now';
export const LABEL_OFFLINE = 'offline stand-in, not generated just now';

export function labelFor(origin: GameOrigin): string {
  if (origin.kind === 'gallery') return LABEL_GALLERY;
  return origin.offline ? LABEL_OFFLINE : LABEL_LIVE;
}
