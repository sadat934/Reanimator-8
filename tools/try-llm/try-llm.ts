// Manual check of real API keys. Sends one small prompt through the provider chain.
// Run: npm run llm:try            (reads keys from a local .env; never prints them)
//      npm run llm:try -- "your prompt"
import { AllProvidersFailedError, createProviderChain } from '../../src/llm';

const prompt = process.argv.slice(2).join(' ').trim() || 'Reply with the single word: ready';
const chain = createProviderChain(process.env);

if (chain.providers.length === 0) {
  console.error('No usable provider. Copy .env.example to .env and set at least one of GEMINI_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY plus its *_MODEL.');
}

try {
  const r = await chain.generate({ system: 'You are a terse assistant.', user: prompt, maxTokens: 64 });
  console.log(`Served by: ${r.provider}`);
  for (const f of r.failures) console.log(`  failed before: ${f.provider}: ${f.reason}`);
  for (const s of r.skipped) console.log(`  skipped: ${s.provider}: ${s.reason}`);
  console.log(`Response: ${r.text.trim().slice(0, 500)}`);
} catch (err) {
  if (err instanceof AllProvidersFailedError) {
    console.error(err.message);
    for (const f of err.failures) console.error(`  failed: ${f.provider}: ${f.reason}`);
    for (const s of err.skipped) console.error(`  skipped: ${s.provider}: ${s.reason}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
