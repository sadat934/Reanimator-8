// Few-shot examples for the system prompt: our own hand-written games from examples/.
// Bundled at build time with Vite's ?raw import, so nothing is read from disk at run time.
import bounce from '../../examples/bounce.8o?raw';
import catchGame from '../../examples/catch.8o?raw';
import etch from '../../examples/etch.8o?raw';
import runner from '../../examples/runner.8o?raw';

export interface PromptExample {
  name: string;
  source: string;
}

export const DEFAULT_EXAMPLES: readonly PromptExample[] = [
  { name: 'bounce', source: bounce },
  { name: 'catch', source: catchGame },
  { name: 'etch', source: etch },
  { name: 'runner', source: runner },
];
