// Local CLI for the reanimate loop. Uses real API keys from a local .env if present.
// Run: npm run reanimate -- "a ghost chases you through a haunted house"
// Writes out/<slug>.ch8 and out/<slug>.8o. Never prints keys.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProviderChain } from '../../src/llm';
import { sanitizeUserText } from '../../src/llm/prompt';
import { reanimate } from '../../src/loop/reanimate';

const OUT_DIR = 'out';
const prompt = process.argv.slice(2).join(' ').trim();
if (prompt === '') {
  console.error('Usage: npm run reanimate -- "describe the game"');
  process.exit(2);
}

const chain = createProviderChain(process.env);
if (chain.providers.length === 0) {
  console.error('No usable provider. Copy .env.example to .env and set a key plus its *_MODEL.');
}

const result = await reanimate(prompt, {
  provider: chain,
  onProgress: (e) => console.log(e.message),
});

const slug =
  sanitizeUserText(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'game';

mkdirSync(OUT_DIR, { recursive: true });
if (result.ok) {
  writeFileSync(join(OUT_DIR, `${slug}.ch8`), result.rom);
  writeFileSync(join(OUT_DIR, `${slug}.8o`), result.source + '\n');
  console.log(`Wrote ${join(OUT_DIR, slug)}.ch8 and .8o (${result.attempts} attempt(s), ${result.origin}).`);
} else {
  if (result.lastSource) {
    writeFileSync(join(OUT_DIR, `${slug}.failed.8o`), result.lastSource + '\n');
    console.log(`Last (non-working) source saved to ${join(OUT_DIR, slug)}.failed.8o`);
  }
  process.exitCode = 1;
}
