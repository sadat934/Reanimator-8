import { defineConfig } from 'vitest/config';
import { devApiPlugin } from './tools/dev-api/vite-plugin.ts';
export default defineConfig({
  plugins: [devApiPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
