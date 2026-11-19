// Bundles the MCP server (and the compiler and harness it imports) into one Node ESM file.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'tools/mcp-chip8/server.ts',
    outDir: 'tools/mcp-chip8/dist',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
