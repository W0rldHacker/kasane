import { defineConfig } from 'vitest/config';

const shared = {
  environment: 'node',
  globals: false,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
} as const;

export default defineConfig({
  test: {
    coverage: {
      exclude: ['test/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        'src/normalize/safe-key.ts': { branches: 100 },
        'src/secrets/redact.ts': { branches: 100 },
      },
    },
    projects: [
      {
        test: {
          ...shared,
          include: ['test/unit/**/*.test.ts'],
          name: 'unit',
        },
      },
      {
        test: {
          ...shared,
          include: ['test/integration/**/*.test.ts'],
          name: 'integration',
        },
      },
      {
        test: {
          ...shared,
          include: ['test/security/**/*.test.ts'],
          exclude: ['test/security/**/*.fuzz.test.ts'],
          name: 'security',
        },
      },
      {
        test: {
          ...shared,
          fileParallelism: false,
          include: ['test/security/**/*.fuzz.test.ts'],
          name: 'fuzz',
        },
      },
      {
        test: {
          ...shared,
          include: ['test/property/**/*.test.ts'],
          name: 'property',
        },
      },
      {
        test: {
          ...shared,
          fileParallelism: false,
          include: ['test/architecture/**/*.test.ts'],
          name: 'architecture',
        },
      },
    ],
  },
});
