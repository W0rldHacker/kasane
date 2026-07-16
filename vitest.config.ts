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
          name: 'security',
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
