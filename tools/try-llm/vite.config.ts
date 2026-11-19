// Bundles the manual LLM check into one Node ESM file (src imports are extensionless).
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'tools/try-llm/try-llm.ts',
    outDir: 'tools/try-llm/dist',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'try-llm.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
