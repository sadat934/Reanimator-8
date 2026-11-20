// The only place that touches the browser AudioContext, so audio.ts stays testable in Node.
import type { AudioContextLike } from './audio';

export function createBrowserContext(): AudioContextLike {
  return new AudioContext();
}
