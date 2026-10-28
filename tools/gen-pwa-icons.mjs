// Renders apps/web/public/icons/icon.svg to the PNG sizes the PWA manifest
// needs, using the pre-installed Playwright Chromium. Run: node tools/gen-pwa-icons.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node-tools/node_modules/playwright');
}

const svg = readFileSync('apps/web/public/icons/icon.svg', 'utf8');
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  // Maskable: keep the artwork inside the 80% safe zone on a full-bleed background.
  { file: 'maskable-512.png', size: 512, pad: 0.12, bg: '#3b2a33' },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = t.size * (1 - 2 * t.pad);
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;height:${t.size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: `apps/web/public/icons/${t.file}`, omitBackground: t.bg === 'transparent' });
  console.log('wrote', t.file);
}
await browser.close();
