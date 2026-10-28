# Hosting behind Cloudflare Access

Poser is a static site with no backend (PLAN.md section 20). It is hosted on Cloudflare Pages and protected by Cloudflare Access, so only invited email addresses can open it. Both are free for fewer than 50 users.

## 1. Create the Pages project

1. In the Cloudflare dashboard, go to **Workers & Pages › Create › Pages › Connect to Git** and pick this repository.
2. Build settings:
   - Production branch: `main`
   - Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - Build output directory: `apps/web/dist`
   - Environment variable: `NODE_VERSION` = `22`
3. Deploy. `apps/web/public/_headers` sets the security headers (cross-origin isolation, no indexing, a strict content security policy), and `robots.txt` blocks search engines.

## 2. Put it behind Cloudflare Access

1. Go to **Zero Trust › Access › Applications › Add an application › Self-hosted**.
2. Application domain: your Pages domain (for example `poser-xyz.pages.dev`), and also add `*.poser-xyz.pages.dev` so preview deployments are protected too.
3. Session duration: 1 month is convenient for a PWA (it avoids frequent logins).
4. Add a policy: **Action: Allow**, **Include: Emails** and list each invited adult's email address.
5. Login method: **One-time PIN** (emailed code) works without any other setup.

Check it: open the site in a private window. You should see the Cloudflare Access login, and only listed emails should get a code.

## 3. Install on each device

Open the site in Chrome, sign in, then install it (Settings › Install in the app, or Chrome's menu). On iPhone and iPad, use Share › Add to Home Screen. After the first visit the app works offline.

## Notes

- Everything users import and create stays in their own browser storage; the server only serves the app's code.
- If the Access session expires while offline, the installed app keeps working from its cache; updates resume after signing in again.
- Only invite adults (PLAN.md section 22).
