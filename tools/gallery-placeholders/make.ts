// Writes the two placeholder gallery entries from examples/*.8o. Run: npm run gallery:placeholders
// These are hand-written examples, not model output, and the files say so (title and note).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compile } from '../../src/compiler/compile';
import { bytesToBase64 } from '../../src/shared/api';

const NOTE = 'placeholder: hand-written example from examples/, not LLM output';

const PLACEHOLDERS = [
  { file: 'bounce', title: '[placeholder] Bounce', prompt: 'a ball bounces around the screen and you steer a paddle to keep it in play' },
  { file: 'catch', title: '[placeholder] Catch', prompt: 'blocks fall from the top and you move a basket to catch them' },
];

mkdirSync('gallery', { recursive: true });
for (const item of PLACEHOLDERS) {
  const source = readFileSync(`examples/${item.file}.8o`, 'utf8').replace(/\r\n/g, '\n');
  const compiled = compile(source);
  if (!compiled.ok) {
    console.error(`examples/${item.file}.8o does not compile: ${compiled.errors[0]?.message ?? 'unknown error'}`);
    process.exit(1);
  }
  const entry = { title: item.title, prompt: item.prompt, source, romBase64: bytesToBase64(compiled.rom), note: NOTE };
  const path = `gallery/placeholder-${item.file}.json`;
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);
  console.log(`wrote ${path} (${compiled.rom.length} bytes)`);
}
