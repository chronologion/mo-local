import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.{test,spec}.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
    },
  },
});
