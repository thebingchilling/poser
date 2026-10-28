import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Cross-origin isolation enables SharedArrayBuffer for the physics and
 * simulation workers in later phases (PLAN.md section 20). The production
 * host sets the same headers via public/_headers.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        // Throwaway prototypes (PLAN.md section 23), served at /prototypes/*.html.
        ragdoll: fileURLToPath(new URL('prototypes/ragdoll.html', import.meta.url)),
        cloth: fileURLToPath(new URL('prototypes/cloth.html', import.meta.url)),
        cut: fileURLToPath(new URL('prototypes/cut.html', import.meta.url)),
        fluids: fileURLToPath(new URL('prototypes/fluids.html', import.meta.url)),
        rope: fileURLToPath(new URL('prototypes/rope.html', import.meta.url)),
        channel: fileURLToPath(new URL('prototypes/channel.html', import.meta.url)),
      },
    },
  },
  worker: { format: 'es' },
});
