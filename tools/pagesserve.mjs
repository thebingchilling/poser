// Static server for the built app that applies apps/web/public/_headers the
// way Cloudflare Pages does (security headers, including the Content
// Security Policy), so local and end-to-end tests see production behaviour.
// Usage: node tools/pagesserve.mjs [port]   (serves apps/web/dist)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = 'apps/web/dist';
const port = Number(process.argv[2] ?? 4180);

const rules = [];
let current = null;
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    current = { path: line.trim(), headers: [] };
    rules.push(current);
  } else if (current) {
    const i = line.indexOf(':');
    current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
}

const matches = (rule, path) => rule === path || (rule.endsWith('/*') && path.startsWith(rule.slice(0, -1)));

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  for (const r of rules) if (matches(r.path, path)) for (const [k, v] of r.headers) res.setHeader(k, v);
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Serving ${root} with _headers on http://localhost:${port}`));
