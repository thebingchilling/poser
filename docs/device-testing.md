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
| Install as an app; opens offline (airplane mode) | | | | | |
| Backup folder writes `.poser` files (desktop only) | | | | | |
| Layout fits (phone: nav bar, bottom sheet, buttons not covered) | | | | | |

**Most important for Phase 0:** does Chrome on iPhone/iPad show WebGPU? If it shows compatibility mode, note the reason in Diagnostics (PLAN.md section 25 risk: allow Safari on iOS as an exception, or stay in compatibility mode there).
