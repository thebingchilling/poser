# Device testing checklist (Phase 0)

Claude's build environment has no real GPU, so WebGPU, performance, and feel are checked on the owner's devices (PLAN.md section 24). For each device, open Settings › Diagnostics and note the renderer, GPU, and benchmark.

| Check | Windows PC | Mac | Android phone | iPhone | iPad |
|---|---|---|---|---|---|
| App opens past the Chrome check, adults notice, and lock | | | | | |
| Renderer shows **WebGPU** (not compatibility mode) | | | | | |
| Detected quality and benchmark (ms) | | | | | |
| Orbit, pan, zoom feel smooth (mouse or touch) | | | | | |
| View cube faces match the view and snap correctly | | | | | |
| Add/remove figures, undo/redo, reload keeps the scene | | | | | |
| Body › anatomy layers and skin opacity look right | | | | | |
| Screenshot capture saves a PNG | | | | | |
| Install as an app; opens in its own window | | | | | |
| Backup folder writes `.poser` files (desktop only) | | | | | |
| Layout fits (phone: nav bar, bottom sheet, buttons not covered) | | | | | |

**Most important for Phase 0:** does Chrome on iPhone/iPad show WebGPU? If it shows compatibility mode, note the reason in Diagnostics (PLAN.md section 25 risk: allow Safari on iOS as an exception, or stay in compatibility mode there).

## Prototypes

Open each from Settings › Diagnostics › Prototypes and note the numbers it shows. Pages 2, 4, 5, and 6 need WebGPU.

| Prototype | What to check | Windows PC | Mac | Android | iPhone | iPad |
|---|---|---|---|---|---|---|
| 1 · Ragdoll Settle | Sits naturally; settles in under 3 s; physics step time | | | | | |
| 2 · GPU cloth | Skirt drapes and swings, no poke-through; 30+ fps | | | | | |
| 3 · Anatomy fit and cut | Cut face layers look right; cut time under 1 s | | | | | |
| 4 · Fluids | Blood runs off the arm and pools; film darkens the arm and drips; fluid step time | | | | | |
| 5 · Rope on a limb | Wraps hold on a tilted limb; flesh dents more with more load | | | | | |
| 6 · Insertion channel | Toy follows the curve, channel opens and closes, nothing explodes | | | | | |
