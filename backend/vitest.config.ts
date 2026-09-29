import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    setupFiles: ['tests/setup.ts'],
    // A workspace path containing spaces breaks the default forks pool on Windows.
    pool: 'threads',
  },
});
