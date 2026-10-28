import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        // Ships ESM with extensionless imports that Node can't resolve on its own.
        inline: ['@material/material-color-utilities'],
      },
    },
  },
});
