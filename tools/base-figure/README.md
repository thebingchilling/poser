# Base figures

Builds the default female and male figures (`apps/web/public/builtin/base-*.glb`)
from MakeHuman's CC0 core assets.

- `fetch-source.mjs` downloads the official MPFB 2.0.0-a2 release, checks its
  SHA-256, and extracts only the data files used here into `source/` (committed).
  MakeHuman core assets are CC0 (https://static.makehumancommunity.org/about/license.html);
  none of MPFB's GPL code is used.
- `build.mjs` shapes the base mesh (a third of each race at age 25, MakeHuman's
  defaults), fits the canonical skeleton at the MakeHuman joint centres, merges
  the default skin weights onto canonical bones, keeps body-shape targets as
  sparse morph targets, and writes the GLBs plus
  `packages/render/src/figure/baseFigures.json` (morph and bone lists).

Run `node tools/base-figure/build.mjs` after changing either script, then
`pnpm test` (packages/render/src/figure/baseFigure.test.ts checks the output).

The rest pose is MakeHuman's A-pose; the retargeter straightens it to the
canonical T-pose like any imported A-pose rig. Height isn't a morph, because
it moves the joints; skeleton-moving shape changes need a refit, which comes
with the character tools later.
