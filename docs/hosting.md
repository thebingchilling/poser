# Hosting on Cloudflare Pages

Poser is a static site with no backend (PLAN.md section 20). It is hosted on Cloudflare Pages, built from the `main` branch. There is no login gate in front of it: it stays private by sharing the address only with invited adults, and search engines are blocked.

## 1. Create the Pages project

1. In the Cloudflare dashboard, go to **Workers & Pages › Create › Pages › Connect to Git** and pick this repository.
2. Build settings:
   - Production branch: `main`
   - Framework preset: None
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Build output directory: `apps/web/dist`
   - Environment variable: `NODE_VERSION` = `22`
3. Save and deploy. Every push to `main` deploys again.

`apps/web/public/_headers` sets the security headers (cross-origin isolation for the simulation workers, no indexing, a strict content security policy), and `robots.txt` blocks search engines.

## 2. Check the deployment

Open the `*.pages.dev` address in Chrome, then open **Settings › Diagnostics** in the app:
- **Cross-origin isolated** should say **Yes** (the headers are being applied).
- **Renderer** should say **WebGPU** on devices that support it.

## 3. Install on each device

Open the site in Chrome, then install it (Settings › Install in the app, or Chrome's menu). On iPhone and iPad, use Share › Add to Home Screen. After the first visit the app works offline, and new versions install in the background.

## Keeping it private

- Share the address only with invited adults (PLAN.md section 22). Anyone with the address can load the app itself, but there is nothing on the server to see: everything users import and create stays in their own browser storage.
- Search engines are told not to index the site (`robots.txt` and the `X-Robots-Tag` header).
- The adults-only notice and the app lock (Settings › Privacy) are the in-app gates.
