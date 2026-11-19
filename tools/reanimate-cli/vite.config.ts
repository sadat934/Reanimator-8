// Bundles the reanimate CLI into one Node ESM file (src imports are extensionless).
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'tools/reanimate-cli/reanimate-cli.ts',
    outDir: 'tools/reanimate-cli/dist',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'reanimate-cli.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
