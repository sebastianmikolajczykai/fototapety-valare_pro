import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 600_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/output/**', 'src/server/**'],
      // Start procesu (3 linie) – sprawdzany w tests/integration/server-process.test.ts (osobny proces).
      exclude: ['src/server/main.ts', 'src/server/*.ps1'],
      thresholds: { lines: 80, branches: 70 },
      reporter: ['text-summary', 'text'],
    },
  },
});
