import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // GPU simulation tests (*.gpu.test.ts) are slow on a software GPU; run them with `pnpm test:gpu`.
    include: process.env.POSER_GPU_TESTS ? ['packages/*/src/**/*.gpu.test.ts'] : ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    exclude: process.env.POSER_GPU_TESTS ? [] : ['**/*.gpu.test.ts', '**/node_modules/**'],
    environment: 'node',
    // GPU tests run on a software GPU (SwiftShader) here, which is slow.
    testTimeout: 60_000,
    server: {
      deps: {
        // Ships ESM with extensionless imports that Node can't resolve on its own.
        inline: ['@material/material-color-utilities'],
      },
    },
  },
});
