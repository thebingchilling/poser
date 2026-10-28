import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/**
 * Cross-origin isolation enables SharedArrayBuffer for the physics and
 * simulation workers in later phases (PLAN.md section 20). The production
 * host sets the same headers via public/_headers.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Emits sw.js with the list of every built file, so the app works fully
 * offline after the first visit (PLAN.md section 20, App shell).
 */
function serviceWorker(): Plugin {
  return {
    name: 'poser-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['boot-check.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
      const precache = ['./', ...files, ...publicFiles].sort();
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, precache) });
    },
  };
}

function swSource(version: string, precache: string[]): string {
  return `// Generated at build time. Precaches the whole app for offline use.
const CACHE = 'poser-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('poser-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // App shell from cache; updates arrive through a new service worker.
    event.respondWith(caches.match('./', { cacheName: CACHE }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { cacheName: CACHE }).then((r) => r || fetch(req)));
});
`;
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
});
