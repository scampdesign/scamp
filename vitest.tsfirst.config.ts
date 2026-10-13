import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@lib': resolve(__dirname, 'src/renderer/lib'),
      '@store': resolve(__dirname, 'src/renderer/store'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'], exclude: ['test/e2e/**', '**/node_modules/**'] },
});
