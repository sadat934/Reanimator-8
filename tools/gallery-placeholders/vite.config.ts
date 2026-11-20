// Bundles the placeholder gallery generator into one Node ESM file (src imports are extensionless).
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'tools/gallery-placeholders/make.ts',
    outDir: 'tools/gallery-placeholders/dist',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'gallery-placeholders.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
