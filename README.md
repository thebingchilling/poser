# Poser

A private, browser-based figure modeller and anatomy study app. The full plan is in [PLAN.md](PLAN.md).

**Status:** Phase 0 (Foundation) and the six risky-tech prototypes are built. See the roadmap in PLAN.md section 23 for what is done and what's next.

## Requirements

- Node.js 22+ and pnpm 10 (`corepack enable`)
- Google Chrome to use the app

## Commands

```sh
pnpm install
pnpm dev         # dev server at http://localhost:5173
pnpm test        # unit tests (Vitest)
pnpm typecheck
pnpm build       # production build in apps/web/dist
pnpm e2e         # end-to-end tests (Playwright; run `npx playwright install chromium` once)
```

GPU tests run the real WebGPU shaders in Node through Dawn. Without a GPU driver they fall back to the SwiftShader software Vulkan that ships with Playwright's Chromium (correct but slow: the rope tests take a few minutes). Set `POSER_SNAPSHOT_DIR` to a folder to have simulation tests write frames for inspection.

The risky-tech prototypes are at `/prototypes/*.html`, linked from Settings › Diagnostics › Prototypes.

Useful while testing on a device:

- `?renderer=webgl` forces the WebGL2 compatibility mode (also in Settings › Diagnostics).
- Settings › Diagnostics shows the renderer, GPU details, benchmark result, and the local error log.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | The React app shell, workspaces, dialogs, startup gates |
| `packages/core` | Scene model, undo/redo, serialization, IndexedDB/OPFS storage, autosave |
| `packages/ui` | Material Design 3 tokens, color schemes, and React components |
| `packages/render` | three.js WebGPU viewport and the built-in placeholder figures |
| `packages/rig` | Canonical skeleton and body proportions |
| `packages/physics` | Jolt ragdoll and Settle (prototype 1) |
| `packages/xpbd` | Shared GPU XPBD particle solver, plus the Dawn test harness |
| `packages/cloth` | Skirt on a walking body (prototype 2) |
| `packages/cutting` | Anatomy fit and Manifold cut (prototype 3) |
| `packages/fluids` | MLS-MPM fluid and surface flow (prototype 4) |
| `packages/rope` | Rope on a soft limb (prototype 5) |
| `packages/interaction` | Toy in a guided soft channel (prototype 6) |
| `packages/platform` | Chrome check, quality detection, adaptive quality, memory manager, crash guard, app lock, backups, `.poser` files, PWA |
| `tools/` | Icon generators |
| `docs/` | Hosting and testing notes |

## Deploying

See [docs/hosting.md](docs/hosting.md) for deploying to Cloudflare Pages.
