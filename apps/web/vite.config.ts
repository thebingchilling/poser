import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * rhino3dm (for Rhino .3dm imports) is served as-is under /vendor/rhino3dm/,
 * next to the worker that runs it (public/vendor/rhino3dm/worker.js). It
 * compiles code at runtime, so it only ever runs in that worker, which has
 * its own policy (public/_headers); the app itself never allows it.
 */
function rhinoVendor(): Plugin {
  const require = createRequire(fileURLToPath(new URL('../../packages/importers/package.json', import.meta.url)));
  const dir = dirname(require.resolve('rhino3dm/rhino3dm.wasm'));
  const files = { 'rhino3dm.js': 'text/javascript', 'rhino3dm.wasm': 'application/wasm' };
  return {
    name: 'rhino3dm-vendor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/vendor\/rhino3dm\/(rhino3dm\.(?:js|wasm))/)?.[1] as keyof typeof files | undefined;
        if (!name) return next();
        res.setHeader('Content-Type', files[name]);
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of Object.keys(files)) this.emitFile({ type: 'asset', fileName: `vendor/rhino3dm/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

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
  plugins: [react(), rhinoVendor()],
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
