# Poser: app plan

A web app that is a **realistic, physics-based NSFW figure modeller and anatomy study tool**. It leans toward adult/NSFW use, with anatomy study as a strong secondary purpose. Artists import their own figures (Daz3D, Virt-a-Mate, VRM, generic rigs), clothing, and props. They pose figures with joint handles like VRM Posing Desktop, let real physics settle bodies, soft tissue, and cloth, explore the anatomy underneath layer by layer, cut into it, add realistic fluids, fine-tune expressions and body states, use objects such as toys, ropes, restraints, and latex, then light, frame, and capture images.

> **Website only, private use:** a browser app for personal use and a few invited users. Not published publicly and not paid. Requires **Chrome**. Runs on Windows, macOS, Android, and iPhone/iPad through one installable website (PWA): full quality on PCs and laptops, reduced by default on mobile, with GPU auto-detection and crash fallbacks (section 3.5).
>
> **Status:** building. Phase 0 (Foundation) is in place and waiting for device testing (docs/device-testing.md); the risky prototypes and Phase 1 are next.
>
> **Primary focus: female figures.** Female anatomy is built first and to the highest standard; male anatomy is fully supported but comes second (section 10).

---

## 1. Scope

### In scope
- **Self-import only.** Users bring files from their own disk. The app never downloads from the internet, browses stores, or proxies websites.
- Realistic adult (18+) human figures with fully detailed nude anatomy, for NSFW scenes and anatomy study.
- Multiple figures interacting physically, including intimate skin-to-skin contact (section 7.5).
- Physical interaction with objects: sex toys, ropes and bondage restraints, latex and tight materials, furniture, and cut or removed body parts (section 14), plus scenario realism extras such as skin marks, wax, clothing states, and scene snapshots (section 15).
- Posing with FK rotation handles, IK effectors, pins, joint limits, mirroring, hand presets, and a pose library.
- Physics: gravity and contact settling (ragdoll), soft tissue, cloth draping, prop collisions.
- Importing props and environments that figures and cloth interact with.
- Anatomical layers (skin, fat, muscle, bone, organs) inside every figure, with a cut tool that shows real cross-sections and can remove parts.
- Realistic fluids: blood, tears, sweat, saliva, urine, and custom liquids.
- Fine-tuned facial expressions (FACS), hands, feet, muscle tension, genital states, and whole-body states (cold, exertion, crying, and so on).
- Lighting, cameras, study modes, image capture, and a path-traced final render mode.
- Pose from photo/webcam, body customization (body hair, tan lines, scars, freckles), privacy features (app lock), and backups (section 16).

### Out of scope for v1
- Any online model sources, cloud sync, or server-side sharing (users share files directly, section 16.7).
- Public release, payments, and browsers other than Chrome.
- Full animation tools (curve editors, complex multi-track animation). A **simple keyframe animation** system is in scope (section 15.9).
- Tattoos, piercings, jewelry, nails, and makeup.

### Principles
1. **Local-first and private.** Files never leave the device. Storage is the browser's private file system (OPFS) plus IndexedDB.
2. **Bring your own assets.** No third-party content is bundled. Built-in content is original or CC0 only.
3. **Balanced realism by default.** A realistic real-time look tuned for good performance, with path tracing reserved for final stills.
4. **Realism first.** Realistic bodies, skin, soft tissue, contact, and fluids take priority over game-style features. Anatomy accuracy matters where it's visible or felt (shape, flesh behavior, genitals, cut surfaces); deep internal detail is lower priority.
5. **Female-first.** Defaults, templates, tests, and quality bars are set on female figures first, then extended to male.
6. **Never block on exotic formats.** Standard formats (glTF/FBX/OBJ/VRM) work from day one; native Daz/VaM reading is added on top.

---

## 2. Key research findings

| Topic | Finding | Consequence |
|---|---|---|
| **Daz3D files** | There's no official glTF export. The common routes are Daz Studio → FBX, or the Diffeomorphic add-on → Blender → glTF. Genesis 9 has known export issues (HD mesh, armature scaling, some hair/shoe problems). Daz's native `.dsf/.duf` files are gzipped JSON. | v1 imports user-exported FBX/glTF and ships an in-app export guide. Phase 3 adds a native reader for the user's installed Daz library folder. |
| **Daz licensing** | Using Daz 3D data inside an application (rather than as renders) needs an **Interactive License**. | Never bundle or host Daz content. Users load their own files locally. *(Not legal advice; get it reviewed before launch.)* |
| **Virt-a-Mate** | `.var` packages are zip files with a `meta.json` (license, dependencies), plus morphs, clothing, and textures. VaM 1.x figures use a Daz Genesis 2 base mesh that **isn't inside the packages**. | Read `.var` zips and the VaM install folder. Apply morphs and clothing onto the base mesh from the user's own VaM install. |
| **Physics engine** | Jolt (WASM) has rigid bodies, ragdolls with motors, constraints, and soft bodies. Rapier has no soft bodies. | Use Jolt for bodies and props. |
| **Cloth** | There is no mature, reusable browser cloth library; only demos (XPBD on WebGPU, mass-spring papers). | Write our own XPBD cloth solver on WebGPU compute. |
| **WebGPU** | Available in Chrome, Edge, Safari 17.4+, and Firefox (default since late 2025). | Require Chrome with WebGPU (desktop and Android). On iOS, Chrome uses Safari's engine, and Safari 26 ships WebGPU. If WebGPU is missing or fails, use three.js's built-in WebGL2 backend as a compatibility mode without GPU simulations. |
| **Mobile limits** | iOS kills browser tabs that use too much memory; mobile GPUs are several times weaker and throttle when hot; folder access (`showDirectoryPicker`) is desktop Chrome/Edge only; Safari can clear site data for sites not installed to the Home Screen. | Device quality tiers, aggressive memory budgets, file-picker imports on mobile, install as a PWA, desktop-prepared asset packs. |
| **Marvelous Designer** | OBJ export with an optional XML sidecar holding physical properties. Units default to millimetres. | Import MD garments with auto-scaling and fabric mapping. |
| **Anatomy data** | The open anatomy models (Z-Anatomy, built on BodyParts3D) are derived from real MRI scans, and the NIH Visible Human data are scans of real bodies. | **Policy: no real medical scan data.** Neither these nor scan-trained segmentation tools are used. All anatomy (female and male) is original, artist-made 3D work based on drawn atlases, artistic anatomy books, and photos of living adults. |
| **Mesh cutting** | Manifold (`manifold-3d`) is a WASM library with guaranteed-correct booleans, but it needs closed (watertight) meshes. | Use it for cuts; generate watertight cutting versions of skin at import. |
| **Fluids** | WebGPU MLS-MPM demos simulate around 100k particles in real time in the browser, and MPM avoids SPH's neighbor-search cost. | Use MLS-MPM for particle fluids plus a texture-space surface-flow method for thin films. |
| **Face rigs** | No openly licensed FACS template face was found. | Map existing Daz/ARKit face rigs; build or commission our own FACS template. |
| **Built-in figures** | MakeHuman/MPFB core assets and exports are CC0. Exports must come from an official, unmodified MakeHuman build, and third-party add-on assets keep their own licenses. | Use them as the bundled starter male and female figures, so the app is usable before anything is imported. |

---

## 3. User experience

### 3.1 Design system: Material Design 3
The whole interface follows **Material Design 3 (MD3)**: its components, color system, typography, shape, elevation, motion, and layout guidance.

**Icons always come with labels.**
- Every button, tab, navigation item, menu item, chip, and toolbar action shows an **icon plus a text label**.
- An icon may appear alone **only when its meaning is universally obvious**: close (×), back arrow, search (magnifier), play/pause, and the overflow menu (⋮). Even then it gets a tooltip and an accessible name.
- When space is tight (phones, narrow panels), labels get shorter or move below the icon (as in MD3 navigation bars), but they are never removed. Extra actions go into an overflow menu with labelled items rather than becoming bare icons.
- Icons: **Material Symbols** (Google's official MD3 icon set, Apache 2.0), self-hosted (no requests to Google's servers). A few custom icons in the same style cover app-specific tools (IK pin, rope wrap, cut, settle).

**How MD3 maps onto the app:**
| MD3 component | Used for |
|---|---|
| Top app bar | Project name and menu, undo/redo (labelled), capture, settings |
| Navigation rail (desktop/tablet) and navigation bar (phone) | Main workspaces: Library, Scene, Pose, Body, Physics, Objects, Render, Animate, each with icon and label |
| Segmented buttons | Mode switch (Pose / Settle / Live), quality level, view options |
| Extended FAB (icon + label) | The main action of each workspace (e.g. "Settle", "Capture", "Import") |
| Side sheets (desktop) and bottom sheets (phone) | Inspector panels, tool options, presets |
| Sliders | Morphs, expressions, muscle tension, states, physics settings (with value labels and number entry) |
| Filter and assist chips | Library filters, quick presets, favorites |
| Cards | Library assets, poses, presets, snapshots |
| Tabs | Inspector sections (Transform, Pose, Body, Physics, Cloth, Material) |
| Menus, dialogs, snackbars, tooltips | Context menus, confirmations, "Undo" snackbars, explanations |
| Progress indicators | Imports, anatomy fitting, baking, path-traced renders |

**Theme and color:**
- Color schemes are generated with Google's **material-color-utilities** (MD3's dynamic color algorithm) from a seed color; the user can pick their own.
- **Dark theme by default** (better for judging a lit 3D scene), with light theme available.
- The 3D viewport background and overlays stay neutral grey so the theme color never tints how skin and lighting look.
- MD3 typography (Roboto Flex, self-hosted) and shape scale.

**Layout and density:**
- MD3 window size classes: **compact** (phones), **medium** (tablets, small windows), **expanded/large** (desktop).
- Desktop uses a slightly denser variant of the MD3 components (smaller paddings, same structure), since there are many controls; touch devices keep the full 48 dp touch targets.
- Accessibility: keyboard navigation, focus rings, screen-reader names, and MD3 contrast levels.

**Implementation:** Google's official MD3 web components (`@material/web`) are in maintenance mode with no new features planned, so the app uses its **own React component set built to the MD3 spec**, on Radix UI primitives for behavior and accessibility, with MD3 design tokens (color, type, shape, elevation, motion) as CSS variables.

### 3.2 Screen layout (desktop, expanded)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top app bar: [☰ Project] Scene name   [↶ Undo] [↷ Redo]   [📷 Capture] [⚙ Settings] │
├────────┬────────────────┬────────────────────────────────┬───────────────────┤
│ Nav    │ Workspace sheet│                                │ Inspector sheet   │
│ rail   │ (e.g. Library: │          3D VIEWPORT           │ Tabs: Transform · │
│ 📚 Library│ filter chips, │  joint handles · IK effectors │ Pose · Body ·     │
│ 🧍 Scene │  asset cards) │  gizmos · view cube           │ Physics · Cloth · │
│ 🤸 Pose  │               │                                │ Material          │
│ 💪 Body  │               │  [Pose | Settle | Live]        │ (sliders, fields) │
│ ⚛ Physics│               │                 [▶ Settle FAB] │                   │
│ 🪢 Objects│              │                                │                   │
│ 💡 Render│               │                                │                   │
│ 🎞 Animate│              │                                │                   │
├────────┴────────────────┴────────────────────────────────┴───────────────────┤
│ Quick bar (chips with icon + label): Poses · Hands · Expressions · Lighting  │
└──────────────────────────────────────────────────────────────────────────────┘
```
(Icons shown as emoji only for this sketch; the app uses Material Symbols, always with labels.)

- **Tablet (medium):** navigation rail plus one sheet at a time over the viewport.
- **Phone (compact):** full-screen viewport, a navigation bar with labels at the bottom, tools and inspector in bottom sheets.
- **Library** lists everything imported, with filter chips (Figures, Clothing, Hair, Morphs, Props, Poses, Environments), asset cards with thumbnails, search, and tags. Drag an item into the viewport to add it; drop clothing onto a figure to dress it.
- **Scene** shows the scene tree (figures → worn garments/hair, props, lights, cameras) with labelled visibility and lock toggles.
- **Inspector** shows properties for the selection.
- Sheets collapse for a full-screen viewport.

### 3.3 Main user flows
1. **First run:** confirm the adults-only notice → set an app lock → short tour → a scene with a built-in CC0 figure, so posing can be tried immediately.
2. **Import:** drag in files, folders, or zips (or add a library folder) → import wizard → asset appears in the Library.
3. **Pose:** click a joint → rotate it, or drag a hand/foot effector → IK follows. Pin feet, mirror, apply a hand preset.
4. **Make it physical:** press **Settle** → the body drops under gravity onto the floor or props, soft tissue rests, clothes drape → the result freezes for editing.
5. **Dress:** drop a garment on the figure → pick a fabric preset → it drapes from the rest pose into the current pose.
6. **Stage:** add props (chair, bed), pick a lighting preset, pick a lens or orthographic view, switch a study mode.
7. **Capture:** screenshot, turnaround sheet, or gesture-drawing timer session.
8. **Save:** projects autosave locally; export/import a `.poser` project file for backup or moving between computers.

### 3.4 Viewport controls
- Orbit/pan/zoom (mouse, trackpad, touch) and a view cube for front/side/top/ortho views.
- Click a body part to select its nearest joint; Alt-click selects the mesh.
- Shortcuts: `W/E/R` move/rotate/scale gizmo, `Q` toggle IK/FK, `P` pin, `M` mirror, `F` frame selection, `Space` toggle simulation, `Ctrl+Z/Y` undo/redo, `1–9` camera bookmarks.
- **Touch:** one finger orbits or drags handles, two fingers pan/zoom/rotate, long-press opens context menus, and handles and gizmo rings are enlarged for fingers.

### 3.5 Platforms, Chrome requirement, and quality
**Chrome is required** on every platform. The site checks the browser on load and shows a "please open in Chrome" page otherwise.
- Windows, macOS, Android: Chrome with WebGPU.
- iPhone/iPad: Chrome works, but Apple requires all iOS browsers to use Safari's engine underneath, so on iOS, Chrome behaves like Safari 26. WebGPU inside Chrome on iOS needs to be verified early. If it isn't available there, iOS users fall back to the compatibility mode below.
- One installable website (PWA) with a **responsive, touch-first UI** designed from the start (desktop three-panel layout, tablet collapsible panels, phone full-screen viewport with bottom sheets).

**Quality levels:** Low, Medium, High, Full.

| Device | Default | User can |
|---|---|---|
| PCs and laptops (Windows, macOS) | **Full**, unless auto-detection finds a weak GPU | Lower it at any time |
| Phones and tablets | **Reduced** (Low or Medium) | Raise it, up to Full |

**Auto-detection of GPU capacity:**
1. On first run, read what the browser reports about the GPU (WebGPU adapter limits and features, device memory, screen size).
2. Run a short benchmark (a few seconds) of cloth, soft-body, and particle workloads and measure frame times.
3. Pick the highest level that keeps a smooth frame rate, and suggest raising mobile above "Reduced" if the device can handle more.
4. **Adaptive quality while running:** if frame times stay too high (or the device heats up and slows down), simulation detail and render resolution step down automatically, and step back up when there's headroom. It can be turned off.
5. The result is stored per device and can be re-run from Settings.

**Memory manager:** tracks GPU and texture memory against a per-level budget, unloads hidden anatomy layers and unused assets, and warns before the browser would kill the tab (a real risk on iPhone/iPad).

**Crash and load-failure fallbacks:**
| Problem | What happens |
|---|---|
| **GPU device lost** (driver reset, out of GPU memory) | The app catches it, recreates the GPU device, drops one quality level, and reloads the scene from memory or the last autosave. |
| **Out-of-memory errors** while loading an asset | Load a smaller version of that asset (lower LOD and texture size) and tell the user. |
| **Tab crashed or was killed** (e.g. iOS memory limit) | A "loading started" flag is saved before heavy work and cleared when it finishes. If the next launch finds the flag still set, the app starts in **Safe Mode**: lowest quality, simulations off, heavy assets not loaded, with options to open the last autosave, open it at lower quality, or start empty. |
| **Scene keeps crashing** | Safe Mode offers loading the scene piece by piece (figures without clothing, without anatomy layers, without fluids) to find what's too heavy. |
| **WebGPU not available or failing at startup** | **Compatibility mode** using three.js's built-in WebGL2 backend: viewing, posing, expressions, lighting, and capture work; GPU simulations (cloth, fluids, ropes, soft bodies) are off. Little extra work, since three.js's WebGPU renderer already includes this backend. |
| Anything else | Frequent autosaves plus the automatic backup folder mean nothing is lost; a local error log helps debugging. |

**Other mobile details:**
- **Prepare on desktop, use anywhere:** heavy work (Daz/VaM processing, anatomy fitting, optimization) runs on a computer and is exported as ready-to-use **asset packs** with mobile-sized versions. Phones and tablets import those packs without redoing the work.
- **Imports on mobile** use the file picker (single files or zips); library-folder access is desktop-only.
- **Install to Home Screen** on iPhone/iPad, so the app's stored data isn't cleared, plus regular backups.

---|---|---|
| **Full** | Windows and macOS desktops with strong GPUs | Everything at full detail |
| **Medium** | Laptops, Apple Silicon Macs | Everything, with lower simulation resolution and fewer particles |
| **Tablet** | iPad (M-series best), high-end Android tablets | Posing, physics, cloth, ropes, fluids at reduced detail; anatomy layers loaded per region; no path-traced render |
| **Lite** | iPhone and Android phones | Posing, expressions, states, lighting, capture, cloth and soft tissue at low detail; single figure recommended; heavy features (full anatomy, cutting, large fluid sims) limited or off |

- The tier is picked automatically from the GPU and memory, and can be changed manually.
- **Memory manager:** tracks GPU and texture memory against a per-tier budget, unloads hidden layers and unused assets, and warns before iOS would kill the tab.
- **Prepare on desktop, use anywhere:** heavy work (Daz/VaM processing, anatomy fitting, optimization) runs on a computer and is exported as ready-to-use **asset packs** with mobile-sized versions. Phones and tablets import those packs without redoing the work.
- **Imports on mobile** use the file picker (single files or zips); library-folder access is desktop Chrome/Edge only.
- **Install prompt** on iPhone/iPad (Add to Home Screen) so Safari keeps the app's stored data, plus regular backups.
- Layouts: desktop (three panels), tablet (collapsible side panels), phone (full-screen viewport with bottom sheets).

---

## 4. Importing (self-import only)

### 4.1 Ways to bring files in
| Method | Details |
|---|---|
| **Drag and drop** | Files, whole folders, or zips anywhere in the app |
| **File / folder picker** | The usual open dialogs |
| **Library folders** | The user grants access to a folder (Daz content library, VaM install, a "3D models" folder). The app indexes it and re-scans for new files. Uses the File System Access API: persistent access on Chrome/Edge, a manual re-scan button on other browsers. Files are read in place, not duplicated, until used. |
| **Project files** | `.poser` export/import (a zip of scene JSON plus the assets it uses) |

### 4.2 Supported formats
| Format | Phase | Used for | Notes |
|---|---|---|---|
| glTF / GLB | 1 | Figures, garments, props | Primary format; keep morph targets |
| FBX | 1 | Figures (Daz/Mixamo/CC4 exports), props | Fix cm → m and axis orientation |
| OBJ + MTL | 1 | Props, Marvelous Designer garments | Auto-detect mm/cm scale |
| VRM 0.x / 1.0 | 1 | Figures | Spring-bone settings carried over |
| DAE, STL, PLY | 1 | Props | |
| Images (PNG/JPG/WebP/TIFF), HDR/EXR | 1 | Textures, environment lighting | |
| BVH / VRMA (single frame), our pose JSON | 1 | Poses | |
| Marvelous Designer XML sidecar | 2 | Fabric properties | |
| Daz `.duf` / `.dsf` (library folder) | 3 | Figures, morphs, clothing (incl. dForce), hair, poses, materials | Gzipped JSON; reads the user's installed content |
| VaM `.var` and install folder | 3 | Looks, morphs, clothing, hair, textures | Needs the user's VaM install for the base mesh |

### 4.3 Import wizard
1. **Detect:** identify the format and what the file is (figure, garment, hair, morph pack, prop, pose, environment) from its contents: bone names, mesh shape, folder path, Daz/VaM metadata.
2. **Identify the base figure:** e.g. "Genesis 8 Female", "Genesis 9", "VaM Female (G2F)", "Mixamo", "VRM", or Unknown.
3. **Map the skeleton:** match bone names automatically to the canonical rig (section 5). If that fails, the user clicks bones in a side-by-side wizard.
4. **Check scale and orientation:** show the detected height (e.g. "1.68 m — looks right?").
5. **Optimize:** pick a quality level (High / Balanced / Light). Decimate mesh, compress textures, prune unused morphs.
6. **Dependencies:** show what's missing (e.g. "this outfit needs Genesis 8 Female", "this .var depends on 3 other packages") and let the user point at them. Import still works with whatever is available.
7. **Record:** save name, creator, license (from `.var` meta or user-entered), source file path, and import date.

Heavy work runs in background **Web Workers** with a progress bar, so the UI never freezes.

### 4.4 Library folder knowledge
- **Daz library:** follow the standard layout (`data/` geometry and morphs, `People/<Figure>/` user-facing `.duf` files, `Runtime/Textures/`). Index `.duf` files by type (character, wardrobe, hair, pose, material) and resolve references into `data/`.
- **VaM install:** index `AddonPackages/*.var`, `Custom/Atom/Person/Morphs`, `Custom/Clothing`, `Custom/Hair`, and `Saves/` looks. Read `meta.json` for licenses and dependencies.
- **Generic folders:** index every supported format with thumbnails generated on first view.

### 4.5 Daz export guide (in-app help, Phase 1)
Step-by-step instructions with screenshots: Daz Studio → FBX for Genesis 8 (base resolution, include morphs, don't merge clothing), and Diffeomorphic → Blender → glTF for Genesis 9. This covers Daz content until the Phase 3 native reader exists.

### 4.6 Performance budget at import
- Figures: base resolution, or decimated to about 50–80k triangles with normal maps baked to keep detail. Genesis 9 HD is reduced by default.
- Textures: KTX2-compressed, capped at 4K, 2K on low-memory devices.
- Morphs: keep shape, expression, and corrective morphs that are actually used; drop or bake the rest.

---

## 5. The canonical rig

Every humanoid maps onto one **canonical skeleton** based on the VRM humanoid bone set (hips, spine, chest, upperChest, neck, head, shoulders, arms, hands with 15 finger bones each, legs, feet, toes). Optional extra bones cover soft tissue: breasts, glutes, belly, and genitals.

This is what lets one pose work on any figure, one ragdoll builder serve all of them, and one IK system drive Daz, VaM, VRM, and Mixamo rigs alike.

| Source rig | Example native bone names |
|---|---|
| Daz Genesis 8/8.1 | `hip`, `pelvis`, `abdomenLower`, `chestUpper`, `lShldrBend`/`lShldrTwist`, `lForearmBend`, `lThighBend` |
| Daz Genesis 9 | `hip`, `pelvis`, `spine1–4`, `l_upperarm`, `l_forearm`, `l_thigh` plus twist bones |
| VaM (Genesis 2) | `hip`, `abdomen`, `chest`, `lShldr`, `lForeArm`, `lThigh` |
| Mixamo | `mixamorig:Hips`, `mixamorig:LeftArm`, … |
| CC4 / Unreal | `CC_Base_*`, `pelvis`, `spine_01`, `upperarm_l` |
| VRM | Already canonical |

- **Bend/twist pairs (Daz):** one canonical rotation is split into swing on the bend bone and twist on the twist bone. Daz figures deform badly without this.
- **Corrective morphs (Daz JCMs):** driven from joint angles in Phase 3, which fixes elbow, knee, and shoulder deformation.
- **Rest-pose normalization:** A-pose and T-pose rigs are normalized, so poses transfer cleanly between them.

---

## 6. Posing

- **Joint handles:** spheres on every canonical joint. Click one for a rotation gizmo (local, parent, or world space). Drag a gizmo ring for precise rotation, or type exact degrees in the Pose tab.
- **IK effectors:** hands, feet, hips, chest, head, and a gaze target. Drag an effector and the chain follows. Limbs use exact two-bone IK, the spine and neck use FABRIK, and a final full-body pass keeps balance and respects pins.
- **Pins:** lock any effector in world space (e.g. feet planted while moving the hips).
- **Joint limits:** a per-joint range-of-motion table from clinical data, with presets *Realistic*, *Flexible*, and *Unlimited*. Handles turn orange near a limit and red past it.
- **Mirror:** copy left ↔ right, or flip the whole pose.
- **Hands and feet:** presets plus per-joint fine-tuning (section 13).
- **Face:** full FACS expression system (section 13).
- **Body shape:** morph sliders for whatever shape morphs the figure has (Daz/VaM/glTF morph targets).
- **Pose library:** save, load, and thumbnail poses in canonical form, so they work across figures. Import/export BVH/VRMA single frames.
- **Multi-figure:** scenes are designed and tuned for **1–2 figures** with full physics and contact. More figures are allowed, but extra figures run with simplified physics.
- **Undo/redo** for every change.

---

## 7. Physics

### 7.1 Modes
| Mode | Behavior | Purpose |
|---|---|---|
| **Pose** (default) | No simulation; exact control | Precise posing |
| **Settle** | A short simulation: the ragdoll tries to hold the current pose with muscle motors while gravity and contact act on it. Soft tissue and cloth settle, then everything freezes. | One-click "make it physically real": limbs rest on surfaces and the body sits *into* chairs |
| **Live** | Continuous simulation. Dragging a body part pulls the rest of the body. "Muscle tone" slider from limp to stiff. | Exploring natural slumps, falls, and drapes |

### 7.2 Body (ragdoll)
- Built automatically from the canonical rig: capsules and convex shapes sized from each bone's skinned vertices.
- One Jolt swing-twist constraint per joint, with limits from the range-of-motion table.
- Joint motors driven toward the target pose, strength set by muscle tone, with per-limb overrides (e.g. a limp arm).
- Mass distribution from standard human body-segment percentages, scaled by figure height and build.

### 7.3 Props and environment
- Colliders are generated automatically on import: simple shapes (box, sphere, capsule) when they fit, a convex hull, or convex decomposition (V-HACD) for complex objects such as chairs, sofas, and beds.
- Each prop is static, dynamic (falls and moves), or kinematic (moved by the user only).
- Material presets set friction and mass (wood, metal, plastic, foam, upholstered).
- Soft props (mattress, cushion, pillow) come in Phase 2 as soft bodies (section 15.5).

### 7.4 Soft tissue (staged)
| Phase | Technique | Result |
|---|---|---|
| 2 | Spring-bone chains on breasts, glutes, belly, and thighs, colliding with body capsules | Correct sag for the body's orientation (lying vs standing) and jiggle in Live mode |
| 2 | Contact compression: skin vertices pushed out of touching surfaces, with the displacement spread to neighbours as a bulge (GPU pass) | Thighs flatten on a seat, cheek squashes on a hand, body presses into a figure it leans on |
| 5 | Layered flesh: the fat and muscle volumes from the anatomy layers simulated with XPBD (section 9.5), driving the visible skin | True sag, compression, wobble, and realistic wound behavior |

### 7.5 Figure-to-figure contact
NSFW scenes depend on bodies touching convincingly, so contact between figures is a core feature, not an extra:
- **Two-way soft-body contact:** flesh on both bodies deforms where they press together (hands squeezing, bodies lying on each other, thighs and buttocks pressing).
- **Skin friction and sliding:** skin grips or slides depending on pressure and wetness (fluids and oils reduce friction).
- **Hands on bodies:** grip-to-body works like grip-to-prop (section 13.2), with fingers sinking into soft tissue instead of passing through.
- **Genital soft bodies:** genitals are their own soft-body regions with deformable openings, so contact and insertion between figures or with props deform the tissue realistically instead of intersecting.
- **Pose helpers:** two-figure pose library, snap/attach points (e.g. hand to hip, figure to figure), and IK targets on the other figure's body.
- Runs in Settle and Live modes like everything else.

### 7.6 Simulation step (each frame)
1. Pose/IK produces target joint rotations.
2. The physics worker (Jolt) steps the ragdoll and props → bone transforms, shared with the main thread through shared memory.
3. The GPU skins the body; spring bones and soft tissue update.
4. The body collision field is rebuilt on the GPU from the skinned mesh.
5. Cloth XPBD substeps run on the GPU against the body and props.
6. Render.

---

## 8. Cloth

### 8.1 Solver
- **XPBD with many small substeps** on WebGPU compute: stretch, shear, and bending constraints, plus long-range tethers to stop over-stretching.
- Constraints are graph-coloured into batches so they solve in parallel on the GPU.
- **Collision** against a signed distance field of the body, rebuilt each frame from the skinned mesh, plus capsules as a fast first pass. Props collide via their own distance fields or hulls. Self-collision with a spatial hash comes in Phase 3.
- **Friction** between cloth and skin, so straps stay on shoulders and waistbands hold.
- **Simulation proxy:** a 5–20k vertex simulation mesh drives the detailed visible garment.

### 8.2 Garments
- Garments arrive fitted to a figure in its rest pose (Daz, VaM, Marvelous Designer, glTF).
- On import: transfer skin weights from the body (fallback when the sim is off), and auto-detect **pin regions** such as waistbands, straps, and cuffs. The user can adjust pins with a paint brush.
- **Drape from rest:** when a pose is applied, the figure moves smoothly from rest pose into the target pose over a short run while the cloth follows. This avoids the cloth starting inside the body (the same idea as Daz dForce).
- **Layers:** underwear → shirt → jacket, with collision offsets keeping them in order.
- **Hair:** rigid or spring-bone hair in v1; card or strand physics in Phase 9.

### 8.3 Fabric presets
Cotton, jersey/T-shirt, silk/satin, denim, leather, spandex/lycra, wool knit, chiffon, latex, and sheer/open fabrics (lace, mesh, fishnet, sheer nylon; section 17.2). Each preset sets stretch, shear, bend stiffness, weight (g/m²), damping, friction, and thickness. Values from the Marvelous Designer XML are used when present. Advanced sliders allow fine-tuning.

---

## 9. Anatomical layers

The body is modelled from the outside in, not as a hollow skin shell, so cuts, X-ray views, and flesh physics show real anatomy.

### 9.1 Layers
| Layer | Contents | Display |
|---|---|---|
| Skin | Epidermis/dermis as a thick shell (2–4 mm, varies by region) | The imported figure's own skin and textures |
| Subcutaneous fat | Fat volume between skin and muscle; thickness varies by region and body type | Yellow, lobular tissue |
| Fascia | Thin sheets over muscle groups | Optional, semi-transparent |
| Muscles | Around 600 named muscles with fiber direction, origin, and insertion | Red-brown with fiber striations |
| Tendons and ligaments | Connecting muscles to bones and bones to bones | White, glossy |
| Skeleton | 206 bones, cartilage, teeth; bones have a cortical shell and trabecular (spongy) interior with marrow | Ivory surface, layered when cut |
| Organs | Brain, eyes, heart, lungs, digestive tract, liver, kidneys, bladder, reproductive organs (male and female) | Tissue-specific materials |
| Vessels and nerves | Major arteries, veins, and nerves | Optional; also used to decide how cuts bleed (section 12) |

### 9.2 Where the anatomy comes from
- **No real medical scan data.** The project does not use scans of real bodies (MRI, CT, cadaver cross-sections such as the NIH Visible Human), models derived from them (Z-Anatomy/BodyParts3D, which come from MRI), or segmentation tools trained on patient scans.
- **Templates are original artist-made work:** a female template first, then a male one (section 10), sculpted from drawn anatomy atlases, artistic anatomy books, and photo/video references of living adults. The project fully owns them, with no attribution or share-alike requirements.
- **Cross-section textures:** procedural tissue materials (fat lobules, muscle fibers, bone layers) designed from illustrated references, not photos of real cadaver slices.

### 9.3 Fitting the anatomy to any imported figure
Imported figures only have a skin surface, so the template anatomy is fitted inside each one:
1. Match the template skeleton to the figure's canonical rig (joint positions → bone lengths and proportions).
2. Fit the template skin to the figure's skin with a non-rigid surface registration (landmarks + iterative closest point).
3. Carry that deformation into the interior with a smooth volumetric warp, so bones follow the skeleton and muscles and organs fill the space.
4. Set fat thickness from the gap between the fitted muscles and the real skin: a lean figure gets thin fat, a heavy figure thick fat.
5. Pick the female or male template from the figure (detected, user-confirmable; female is the default).
6. Bind all layers to the same skeleton, so they move with posing. Muscle bulging comes from section 13.4.

The fit runs once at import in a worker and is cached. The user can tweak per-region fat and muscle sliders afterwards.

### 9.4 Viewing layers
- Per-layer visibility and transparency sliders, plus presets: **Skin**, **Muscles** (écorché), **Skeleton**, **Organs**, **X-ray**.
- A **peel brush** that hides layers locally (e.g. remove skin just over the forearm).
- **Labels:** hover any structure for its name; click for a short description, origin/insertion, and action for muscles.
- Layers load on demand and use level of detail; the full anatomy is millions of triangles and is never all drawn at once.

### 9.5 Layered flesh physics
This replaces the generic "tetrahedral flesh" idea. The fat and muscle layers become real simulated volumes (XPBD tetrahedral meshes) attached to the bones. That gives realistic sag, compression against surfaces, wobble, and wound behavior when cut (section 11).

---

## 10. Female anatomy (primary focus)

Female figures are the main use of the app, so the female anatomy template is the most important asset in the project. It is its own workstream, starts at the beginning of the project because of its long lead time, and gets the highest quality bar.

### 10.1 What the female template must cover
| Area | Detail |
|---|---|
| **Skeleton** | Female pelvis (wider and shallower, wider pubic arch, different sacrum angle), thigh-bone angle and resulting knee alignment, elbow carrying angle, ribcage and shoulder proportions, skull and jaw differences |
| **Breasts** | Full internal structure: glandular lobes and ducts, fat, suspensory (Cooper's) ligaments, nipple and areola, sitting on the pectoral muscles and ribcage. Must support cuts and realistic physics. |
| **Fat distribution** | Typical female pattern (hips, buttocks, thighs, breasts, lower belly), with thickness maps per region |
| **Muscles** | All muscles with female proportions, including the pelvic floor |
| **External genitalia** | Mons pubis, labia majora and minora, clitoral hood and glans, vestibule, urethral and vaginal openings, perineum, with natural-variation sliders (size, shape, symmetry) |
| **Internal reproductive organs** | The full clitoral structure (body, crura, vestibular bulbs, often missing from anatomy models), vagina, cervix, uterus, fallopian tubes, ovaries, and their ligaments |
| **Other pelvic organs** | Bladder, urethra, rectum, positioned correctly for a female pelvis |
| **Skin details** | Optional stretch marks, cellulite, scars (e.g. C-section), body and pubic hair styles, freckles and moles |

### 10.2 How it's built (in-house, mostly procedural)
No real medical scans or scan-derived models are used (section 9.2), and no outside artist is hired. The anatomy is built **in-house, mostly by code**, which suits an AI-written project: anatomy is generated from rules and measurements rather than hand-sculpted, then refined by hand in Blender where needed.

1. **Use the figure's own outside.** The skin, breasts, and external genitalia already come from the imported figure (Daz, VaM, MakeHuman), so the template only needs to fill the inside.
2. **Parametric skeleton:** bones built from measured proportions in illustrated anatomy references (lengths, widths, landmark points) as smooth parametric shapes, with female and male variants (pelvis, ribcage, skull, limb angles). Placed on the canonical rig.
3. **Procedural muscles:** each named muscle is generated from its origin and insertion points on the skeleton and a cross-section profile, lofted into a volume with a fiber direction. Then it is fitted under the skin so muscles fill the space the figure's shape implies.
4. **Fat from the skin inward:** the fat layer is the volume between the skin and the muscles, with per-region thickness maps (female pattern: hips, buttocks, thighs, breasts, lower belly).
5. **Breast internals generated:** glandular lobes, ducts, ligaments, and fat filled procedurally inside each breast's shape, with the gland-to-fat ratio as a slider.
6. **Internal genital and pelvic anatomy:** clitoral structure, vagina, cervix, uterus, ovaries, bladder, urethra, and rectum built as parametric shapes along anatomical guide curves inside the pelvis. These are also the body-opening channels used for contact (section 14.2), with natural variation as sliders.
7. **Organs:** simple procedural or hand-modelled shapes, good enough for cuts and X-ray views.
8. **Hand refinement:** Blender scripts generate everything reproducibly; the owner (or anyone in the group) can refine shapes by hand in Blender, and the pipeline keeps those edits.
9. **References:** drawn anatomy atlases, artistic anatomy books, and photos/video of living adults. No scans.

**Honest limits:** procedurally generated anatomy will look more schematic than an expert sculpt, especially muscles and organs up close. It is good enough for posing, physics, X-ray views, and cuts, and can be improved over time. Breasts, skin, and external genitalia, which matter most visually, come from the imported figures and stay fully realistic.

**Development order:** a rough placeholder anatomy early (for the Phase 0–2 prototypes), the full female version in Phase 5, then the male version.

**Variation:** the template is parametric from the start (section 10.3), so one base covers the natural range of adult female bodies.

### 10.3 Variation controls
- **Breasts:** size, shape, spacing, projection, sag (ptosis grade), areola size and color, nipple shape, and glandular-to-fat ratio (affects how they move).
- **Body:** height, waist-hip ratio, hip width, fat amount and distribution, muscle mass, bone structure.
- **Genitalia:** natural variation in labia size and shape, clitoral hood, mons fullness, pubic hair.
- **Age:** adults only (18+), from young adult to elderly, changing skin, fat distribution, breast tissue, and posture. The app does not allow child body proportions.
- The controls work on the anatomy layers and on the imported figure's own morphs where available.

### 10.4 Female-specific physics
- **Breast soft body is a Phase 2 priority,** not a later upgrade: a dedicated volume simulation with different stiffness for glandular tissue and fat, ligament support, and attachment to the chest wall. It must look right standing, lying on the back or side, bent forward, inverted, and pressed against surfaces or other bodies.
- **Two-way clothing and body interaction:** tight clothing compresses flesh (bra support and shaping, waistband and strap indentation, leggings), and a bra actually supports breast tissue in the simulation.
- Buttocks, hips, thighs, and belly use the same layered approach.

### 10.5 Female-specific states
In addition to the general body states (section 13.6):
- **Pregnancy:** a stage slider (by week) that grows the uterus inside the anatomy and changes the belly, breasts, areolae, fat, and posture. The center of gravity shifts and balance follows. Optional linea nigra and stretch marks.
- **Postpartum and lactation:** belly and breast changes.
- **Menstrual cycle:** subtle changes (bloating, breast fullness), plus menstrual blood as a fluid emitter.
- **Menopause and aging:** changes to breast tissue, fat distribution, skin, and bone.

### 10.6 Male anatomy (second, fully supported)
- Original artist-made template, built the same way as the female one (no scan data).
- Full male genital anatomy (internal and external) with the states in section 13.5.
- Same variation controls where they apply (body, age, genital variation).
- Built after the female template, reusing the same fitting, cutting, and physics systems.

---

## 11. Cutting and removing body parts

A cut has to show what is really inside at that spot: the skin rim, fat, the muscles crossing that plane, bone with its cortex and marrow, vessels, and organs.

### 11.1 Tools
| Tool | Behavior |
|---|---|
| **Section plane** | A movable plane that cuts through the whole body, like a CT/MRI slice or anatomy-atlas cross-section. Non-destructive and instant. |
| **Knife** | Draw a stroke on screen and set a depth; it cuts along that surface (a laceration, an incision, a deep cut). |
| **Scalpel/flap** | Cut and peel back a skin/fat flap to expose the muscles beneath, like a dissection. |
| **Saw/remove** | Cut fully through a limb or region; the removed part becomes a separate object that can be moved, deleted, or dropped and simulated. |
| **Hole/puncture** | A cylindrical cut of chosen diameter and depth. |

### 11.2 How it works
- **Closed volumes:** every anatomical structure is a closed (watertight) mesh. Imported skin often has holes (eyes, mouth, seams), so a watertight version of the skin is generated at import for cutting only.
- **Booleans:** cuts are computed with **Manifold** (`manifold-3d`, a WASM geometry library with guaranteed-correct mesh booleans), in a worker.
- **Cut in rest pose:** each cut is transformed into the figure's rest pose before it is applied, so cut geometry keeps its skin weights and still deforms correctly when the figure is re-posed.
- **Cap surfaces:** each structure's cut face gets its own material: skin, fat lobules, muscle with fibers running in the muscle's direction, tendon, bone (cortical ring, trabecular interior, marrow), organ tissue, vessel lumens. Textures are procedural, designed from illustrated references (no cadaver photos).
- **Non-destructive cut stack:** every cut is stored as an editable operation (shape, depth, position on the body). Cuts can be adjusted, reordered, or deleted, and are re-applied automatically after re-posing or changing a figure.
- **After a cut:** wound edges retract by tissue type (skin pulls back, contracted muscle retracts more), driven by the layered flesh simulation. Removed parts become physics objects with their own colliders, and the ragdoll drops the bones that were removed.
- **Bleeding:** cuts emit blood based on what they hit (section 12.3).
- **Clothing:** cuts can optionally go through garments too, so cloth tears along the same cut.

### 11.3 Performance
- A section plane is a shader-only effect and always real time.
- Knife and saw cuts take a short background computation (target: under 1 second per cut on a mid-range machine), with a preview first.

---

## 12. Fluids

### 12.1 Two simulation methods
| Method | Used for | How |
|---|---|---|
| **Surface flow** | Thin liquids on skin and cloth: tears, sweat, a trickle of blood, drool | Liquid stored as a "wetness and film-thickness" map on the body's texture space. It flows downhill according to the current pose and gravity, beads up, and drips off as particles when thick enough. Cheap and very realistic for thin films. |
| **Particle fluid** | Pouring, spurting, splashing, pooling: bleeding from wounds, urination, spilled liquids | **MLS-MPM** on WebGPU compute (browser demos run around 100k particles in real time), rendered as a smooth surface with refraction and thickness-based color. |

Particles that settle on a surface turn into surface flow or a puddle, and surface flow that gets thick drips as particles, so the two work together.

### 12.2 Fluid presets
Each fluid has viscosity, density, color, opacity, surface tension, stickiness, and drying/staining behavior. Presets:
- **Blood:** thick and slightly non-Newtonian; bright red when fresh, darkening to brown as it dries and clots; leaves stains.
- **Tears:** water-like, clear, with a slight film on the eye.
- **Sweat:** beads and sheen on skin; makes skin glossier.
- **Saliva:** clear, stringy, and sticky.
- **Urine:** water-like, pale yellow.
- **Water, oil,** and a **custom fluid editor** for anything else (mucus, vomit, other bodily fluids, paint).

### 12.3 Sources (emitters)
- **Wounds:** bleeding rate and pattern come from what a cut hit: oozing from skin and fat; steady flow from veins; pulsing spurts timed to a heart rate when an artery is hit.
- **Body openings:** tear ducts, mouth, nose, urethra, and others, each placed on the anatomy and following posing.
- **Skin:** sweat from regions (forehead, chest, armpits, back) at a chosen intensity.
- **Custom emitters:** placed anywhere, with flow rate, direction, and pressure.

### 12.4 Interactions
- Fluids collide with the body, clothing, and props.
- **Cloth absorbs fluid:** wet cloth darkens, gets heavier, and clings (it changes the cloth simulation's mass and friction).
- **Skin becomes wet:** glossier and slightly darker, with streaks along where fluid ran.
- **Pooling and stains** on floors and props, with spreading and drying over time.
- **Freeze** (like Settle): run the fluid for a few seconds, then freeze it as a mesh and stains so the scene can be posed and captured.

---

## 13. Face, hands, feet, muscles, and body states

### 13.1 Facial expressions (FACS)
- Expressions are built on **FACS** (the Facial Action Coding System used in psychology and film): around 45 action units such as inner brow raise, nose wrinkle, lip corner pull, jaw drop.
- **Fine-tuning:** every action unit has a slider with separate left and right sides, plus eyes (gaze, lid opening, pupil size), jaw, lips, tongue, teeth, and cheek puff.
- **Presets** as starting points, all adjustable: neutral, joy, laughter, sadness, crying, anger, fear, surprise, disgust, contempt, pain, exertion, fatigue, concentration, and others; blend several presets together.
- **Figures' own face rigs:** Daz Genesis 8/9 faces and ARKit's 52-shape standard map onto the action units. Figures without facial morphs get action units transferred from **our own template face** (female first), built in-house: action units are generated as procedural deformations driven by facial muscle positions, then refined by hand. MakeHuman's free (CC0) face expression controls may be a useful starting point; check this when building it.
- **Wrinkles:** wrinkle maps blended in as action units fire (forehead lines, crow's feet, nasolabial folds, frown lines).
- **Skin color changes:** blushing and flushing, paleness, red eyes and nose when crying.

### 13.2 Hands
- Sliders for every finger joint (curl, spread, twist), the thumb's opposition, and the wrist.
- **Fingertip IK:** drag a fingertip to place it on a surface.
- **Grip:** close the hand around a prop; fingers stop where they touch it.
- Presets (relaxed, fist, point, pinch, claw, open, grips, gestures), mirroring, saving custom hand poses.
- Tendons and veins on the back of the hand show more when the hand is tense.

### 13.3 Feet
- Sliders for the ankle, every toe joint (curl, spread), and the big toe separately.
- Arch height and foot flattening under weight: when a foot bears weight in Settle, the sole flattens and spreads.
- Presets (relaxed, pointed, flexed, tiptoe, gripping, splayed).

### 13.4 Muscle tension
- **Per muscle group:** a relaxed ↔ flexed slider for each group (biceps, triceps, abdominals, glutes, quadriceps, calves, neck, and so on), plus a global tension control.
- **What tension changes:**
  - Shape: a tensed muscle shortens and thickens (keeping its volume), pushing the skin out via the anatomy layers.
  - Definition: sharper muscle separation, visible striations, more visible veins and tendons.
  - Physics: ragdoll motor strength and flesh stiffness, so a tense body holds a pose and a relaxed one sags.
- **Body sliders:** overall muscle mass, body fat, and fat distribution, which also update the anatomy layers.
- **Automatic tension** (optional): muscles that are working to hold the pose against gravity tense up automatically after Settle.

### 13.5 Genital and secondary sexual anatomy states
Detailed controls, a core NSFW feature:
- **Male:** penis from flaccid to fully erect (length, girth, angle, curvature), foreskin from covered to retracted, scrotum from relaxed to tight (temperature and arousal).
- **Female:** labia and clitoral states (relaxed to engorged), vaginal opening, breast changes (fullness, nipple and areola).
- **Both:** nipple erection (cold or arousal), areola texture, pubic and body hair.
- **Arousal-linked changes** can be driven together from the Arousal state (section 13.6) or set individually.
- Driven by the anatomy layers (e.g. erectile tissue volume) where possible, and by the figure's own morphs (Daz and VaM genital add-ons usually include them).

### 13.6 Body states
A **State** panel where one slider drives many linked details at once. Each detail can still be fine-tuned separately.

| State | What it drives |
|---|---|
| **Cold** | Goosebumps, pale or bluish extremities, tight scrotum, erect nipples, tense posture, shivering in Live mode |
| **Hot** | Flushed skin, sweat, relaxed posture |
| **Exertion** | Sweat, flush, visible veins, muscle pump, heavy breathing |
| **Breathing** | Inhale ↔ exhale (chest and belly expansion), breathing rate in Live mode |
| **Crying** | Tears, red and swollen eyes, red nose, crying expression |
| **Fear / shock** | Paleness, dilated pupils, tension, sweat |
| **Embarrassment** | Blushing on face, ears, and neck |
| **Arousal** | Flushing, nipple changes, genital states (12.5), dilated pupils |
| **Fatigue** | Slumped posture tendencies, eye bags, lower muscle tone |
| **Injury marks** | Bruises (color changes with age: red → purple → green → yellow), scrapes, cuts, burns, painted as decals |
| **Skin condition** | Wet, oily, dirty, sunburned, tan lines |

States are saved with the scene and can be combined.

---

## 14. Objects, restraints, toys, and latex

Objects need to interact with bodies as physically as bodies interact with each other. Everything here builds on the same physics: the ragdoll (Jolt), layered flesh, cloth (XPBD), and figure contact (section 7.5).

### 14.1 Attachment and holding system (shared by everything below)
- **Attachment points** can be placed anywhere on a body's surface (they follow the skin as it moves and deforms), on props, or in the world.
- **Connection types:** rigid (welded), hinge/ball joint, distance (chain-like, slack allowed), spring (elastic), and slider.
- **Hold tool:** put any object in a hand; fingers close around it and stop on contact (section 13.2). Works for props, toys, rope ends, removed body parts, and other figures' limbs.
- **Place tool:** drop an object onto or against a body and let Settle find a resting position.
- All objects use real-world units, shown in **metric** (cm, m, kg), so sizes relative to the body are accurate. A **ruler/measure tool** shows lengths, diameters, and distances.

### 14.2 Sex toys and similar props
| Type | Simulation |
|---|---|
| **Rigid** (glass, metal, hard plastic) | Rigid body with accurate weight and friction |
| **Soft** (silicone, TPE, jelly) | Soft body (XPBD volume) with a firmness slider; bends and squashes on contact |
| **Flexible with a core** | Soft body around a bendable spine |
| **Strap-on / harness** | Toy attached to a strap garment (cloth with pins) worn on the body |
| **Motorized** (vibrating, thrusting/machines) | Vibration as high-frequency motion that ripples nearby soft tissue in Live mode; machines have a motor joint with stroke length and speed |

- **Body openings as deformable channels:** the mouth and throat, vagina, and anus are modelled as soft-body channels that follow the real anatomical path (from the anatomy layers). Inserted objects follow the channel; tissue stretches around them within realistic limits, with depth limited by anatomy. An X-ray/cut view shows the object inside the body.
- **Friction and lubrication:** dry, wet, and lubricated states change friction for insertion and sliding. Lubricant is a fluid preset (section 12.2) that also adds shine.
- **Import your own:** any imported mesh can be set as rigid or soft and given a material preset; toy presets set sensible defaults.

### 14.3 Ropes and bondage
**Rope simulation:**
- Ropes are simulated as rods (XPBD Cosserat rods on the GPU): stretch, bending, twisting, and thickness.
- **Rope-body contact with friction** (the capstan effect), so wraps grip the body and hold instead of sliding off.
- **Rope-on-rope contact** so wraps stack and cross correctly.
- **Flesh compression:** tight rope presses into the flesh layers, with bulging between wraps.
- **Rope types:** jute, hemp, cotton, nylon, silk, and synthetic, each with stiffness, friction, stretch, thickness, and texture.

**Tying tools** (tying real knots by hand in 3D isn't practical, so the app helps):
- **Wrap tool:** click body parts in order (e.g. wrist, wrist, around both) and the rope routes itself around them, then tightens under simulation.
- **Tie templates:** common ties and harnesses as templates that fit any figure via the canonical rig (single and double column ties, chest harnesses, hip harnesses, hogtie, frog tie, and others). Adjustable after placement.
- **Knots** are pre-modelled knot shapes placed at tie points, so they look right without simulating the tying.
- **Anchors:** attach rope ends to hard points (rings, hooks, beams, bed frames, other figures).
- **Tension control:** tighten or loosen each segment; see the tension as a color overlay.

**Suspension and load:**
- Ropes and straps can carry the body's weight. The ragdoll hangs from the ropes, and the load is shared realistically between them, with heavier compression where the load is higher.
- A **load overlay** shows tension in each rope and pressure on the body (useful for realism, and for spotting a setup that couldn't really hold a person's weight).

**Other restraints:**
- **Cuffs, collars, belts, straps, harnesses:** rigid or semi-rigid parts with buckles, connected by strap cloth or chains.
- **Chains:** linked rigid bodies.
- **Gags, blindfolds, hoods:** fitted garments or rigid parts on the head, with the mouth state (section 13.1) adjusted to match.
- **Tape and wraps:** cloth strips that stick to skin and to themselves.
- **Restraint furniture:** imported props with anchor points (beds, frames, crosses, benches, stocks).

### 14.4 Latex and tight materials
- **Latex as a cloth material:** very stretchy but snaps back; high friction on dry skin, very low when lubricated or with dressing aids; thin, so it follows the body closely.
- **Two-way compression:** tight latex compresses the flesh underneath (corsets, waist cinchers, catsuits, stockings), so the body shape changes realistically.
- **Shading:** high gloss with clear-coat reflections, adjustable from matte to wet look (polished), and **color thinning where stretched** (latex gets lighter and more translucent under strain), plus fine wrinkles at joints.
- **Special latex items:** vacuum bed/sheet (latex pulled tight around the body by negative pressure), inflatable items (pressure constraint), hoods and full enclosures.
- The same system covers other tight materials: PVC, vinyl, spandex, leather, nylon stockings.

### 14.5 Interacting with cuts and removed parts
- **Removed parts are props:** they can be held, placed, hung, or attached with the systems above, and keep their anatomy layers and bleeding.
- **Objects in wounds:** an object can be left inside a cut (e.g. a blade), with the wound edges deforming around it and bleeding continuing around it.
- **Touching wounds:** hands and objects pressing on a wound deform its edges through the layered flesh, and pressure changes bleeding (pressing slows it).
- **Wound dressings:** bandages and tourniquets as cloth strips and straps that compress and reduce bleeding.

---

## 15. Extra realism for modelling scenarios

Additions that make scenes look and behave like the real thing:

### 15.1 Marks on skin
- **Pressure marks:** rope marks, strap and waistband lines, clothing seams, latex edges. They appear where pressure was high (from the load overlay) and stay after the object is removed.
- **Impact marks:** redness from slapping or spanking, handprints, and the bruise color stages from section 13.6.
- **Other marks:** scratches, bite marks, hickeys, friction redness, wax residue.
- **Time slider:** marks fade and change color over a chosen time (minutes to days), so "just untied" and "the next day" look different.

### 15.2 Fluids with state changes
- **Candle wax:** a fluid that cools and solidifies on skin, keeping its drip shape, and can be peeled off.
- **Lubricant and oil:** glossy, slippery, and changing friction everywhere it spreads.
- **Water environments:** shower, bath, and pool (particle and surface fluids), making skin and hair wet, darkening clothes, and making cloth cling and turn translucent.
- **Mud, paint, and other messy substances** via the custom fluid editor.

### 15.3 Clothing states
- **Partially removed or displaced:** pulled down, pushed aside, lifted up, unbuttoned or unzipped, one strap off. Done by moving pins and letting the cloth re-drape.
- **Tearing:** cloth tears when stretched past its limit or cut (section 11), with frayed edges.
- **Wet clothing:** clinging and see-through depending on the fabric.

### 15.4 Hair interaction
- Hair can be grabbed, held, pulled, and tied (ponytails, braids), using the hold tool and hair physics; the head and neck respond in Live mode.
- Wet hair clumps and sticks to skin.

### 15.5 Soft surfaces
- Mattresses, cushions, pillows, and padded furniture as soft bodies (moved up from the old polish phase), so bodies sink in realistically and two figures on a bed affect each other.

### 15.6 Cameras and viewing
- **POV camera:** attached to a figure's eyes, following its head.
- **Mirrors and reflective surfaces** in scenes.
- **Cutaway/X-ray view** of internal interactions (inserted objects, compressed tissue), using the anatomy layers.

### 15.7 Strain and plausibility checks
- Warnings when a pose or setup goes past joint limits, when a rope or anchor would carry more than a realistic load, or when tissue is stretched past realistic limits. Can be turned off.
- Balance check (center of gravity) for standing and kneeling poses.

### 15.8 Scenario snapshots (lightweight progression)
- Save several **snapshots** of one scene (e.g. before, during, after) that share figures and props but differ in pose, ties, clothing state, marks, and fluids. Step through them or capture all at once.
- Snapshots can also be used as keyframes for the simple animation system below.

### 15.9 Simple animation
- **Timeline with keyframes:** set a few poses (plus expressions, states, muscle tension, clothing state, object positions) at points in time; the app blends between them with ease-in/ease-out.
- **Physics fills in the motion:** soft tissue, cloth, hair, ropes, and fluids are simulated through the motion, so jiggle, drape, swing, and drips happen naturally between keyframes.
- **Bake and scrub:** the simulation is recorded ("baked") frame by frame, so the timeline can be scrubbed and replayed exactly; change a keyframe and re-bake.
- **Loops:** seamless looping clips (the last keyframe blends back into the first).
- **Rhythmic motion helpers:** repeat a movement between two poses at a set speed and intensity (also drives motorized toys and machines).
- **Breathing and idle motion** can be layered on automatically.
- **Camera keyframes:** the camera can move along its own keyframes.
- **Export:** video (MP4/WebM via the browser's video encoder) and GIF, at a chosen resolution and frame rate; frame-by-frame rendering so exports are smooth even if live playback isn't.
- Not included: curve editors, animation layers, motion capture import beyond single poses, or long multi-shot sequences.

---

## 16. More features for realism and convenience

### 16.1 Pose and expression from photos or webcam
- Load a reference photo (or use a webcam) and auto-pose the figure from it: body, hands, and face.
- Uses Google's **MediaPipe** in the browser (pose, hand, and face landmark models; the face model outputs 52 ARKit-style expression values, which map onto the FACS system in section 13.1). Runs locally; images never leave the device.
- The result is a starting pose to refine with the normal tools.

### 16.2 Skin and body realism
- **Skin folds and creases:** belly rolls when bending or sitting, creases at hips, armpits, under breasts and buttocks, knuckle and toe wrinkles, driven by joint angles and flesh compression.
- **Skin sliding:** skin slides slightly over muscle and bone instead of stretching rigidly (e.g. over the ribs, shoulder blades, kneecaps).
- **Gravity effects:** a flushed, redder face when upside down for a while; pooling and sag follow body orientation.
- **Involuntary reactions:** presets and Live-mode effects such as trembling or fatigued muscles, back arch, toe curl, hand clench, shiver, linked to body states (section 13.6).
- **Male soft tissue:** scrotum and testicles as gravity-affected soft bodies; erection rigidity as a stiffness slider that affects contact (section 7.5).
- **Breast implants vs natural tissue:** implants behave differently (firmer, rounder upper shape, less sag, different motion), as a breast option.
- **Mouth interior:** posable tongue (several bones), teeth, gums, and saliva strings (fluids).
- **Eyes:** look-at target (camera, another figure, an object), blink amount, wet eyes.

### 16.3 Body customization
- **Body hair:** density and length per region (arms, legs, underarms, pubic), including stubble.
- **Tan lines, scars, freckles, moles, birthmarks.**

### 16.4 Image quality
- **Final render mode:** a path tracer for photo-realistic still images (**three-gpu-pathtracer**, MIT license, running on a separate WebGL2 renderer). Progressive: it improves over a few seconds to minutes while the scene is frozen.
- **Camera effects:** depth of field, lens blur, film grain, vignette, exposure, color grading presets.
- **Practical lights:** candles, neon, LED strips, window light; volumetric haze and light shafts.
- **Video and GIF capture** of Live-mode simulation (browser MediaRecorder), for short physics clips.

### 16.5 Built-in environments
- A few bundled rooms (bedroom, bathroom with shower, photo studio, dungeon-style room, living room) with furniture already set up as physics props with anchor points.
- Built from CC0 assets (e.g. Poly Haven props, textures, HDRIs, bundled with the app at build time, not downloaded by users).

### 16.6 Privacy for a personal NSFW app
- **App lock:** passphrase or PIN on opening the app (and after idle time).
- **Neutral tab title and icon** option.
- **Encrypted local storage** (optional): the library and scenes are encrypted on disk with the passphrase, using the browser's built-in cryptography.
- **Blurred thumbnails** option in the Library.

### 16.7 Backups and sharing between the few users
- **Automatic backup** to a folder the user picks (e.g. a synced cloud folder), so browser storage being cleared doesn't lose work.
- **Sharing:** users send each other `.poser` scene files and pose/tie/preset packs as files. There is no server-side sharing, which keeps the app simple and private.
- **Preset packs:** export and import poses, expressions, tie templates, fabric and fluid presets, and lighting setups as small files.

---

## 17. Additional tools

### 17.1 Posing helpers
- **Collision-aware posing:** while dragging joints or IK handles, limbs are stopped by the body, other figures, and props instead of passing through them. A **Resolve intersections** button pushes any overlapping parts apart with the smallest change to the pose.
- **Poke, pinch, squeeze, and slap tools:** brush-like force tools in Live mode. Flesh deforms and ripples realistically, and slaps or firm squeezes leave redness (section 17.3) that fades on the time slider.
- **Pose blending:** mix two or more saved poses with sliders (e.g. 70% sitting, 30% leaning), with joint limits and balance respected.
- **Randomizers:** random pose (within joint limits and balance), random body variation (within chosen ranges), and random camera, each with a lock for what should stay fixed. Useful for gesture drawing and inspiration.

### 17.2 Clothing
- **Garment auto-fit:** fit clothing made for one figure onto another (e.g. a Genesis 8 outfit onto Genesis 9, a VaM figure, or a MakeHuman figure). The garment is wrapped onto the new body by surface matching, skin weights are transferred, then a short cloth simulation settles it.
- **Sheer and open fabrics:** lace, mesh, fishnet, sheer nylon, and other see-through fabrics, with transparency that depends on stretch and viewing angle, and physics tuned for each (fishnet stretches into diamonds, sheer nylon clings).
- **High heels affect posture:** heel height is detected from the shoe, and the foot angle, ankle, knees, pelvis tilt, and balance adjust automatically, as in real life.

### 17.3 Body and physics details
- **Body measurements:** live readout of height, bust/underbust/waist/hips, bra size, estimated weight (from body volume), and limb lengths, in metric. Updates with body shape changes.
- **Pressure skin response:** skin blanches (turns pale) where pressed hard and flushes red when released. Impact force from slaps, falls, and collisions drives bruise intensity, which then ages on the time slider.
- **Wound healing over time:** cuts, scratches, and marks progress through healing stages (fresh, scabbed, pink new skin, scar) on the time slider.
- **Gravity, wind, and buoyancy:**
  - Change gravity strength and direction (including zero gravity) for unusual scenes.
  - Wind, including a placeable fan prop, moves hair, cloth, and loose fluids.
  - Buoyancy in water scenes (pool, bath): bodies, breasts, and hair float realistically.

### 17.4 Appearance editing
- **Skin tone editor:** adjust skin tone overall and by region (nipples, areolae, genitals, lips, palms and soles, knees and elbows), with realistic undertones and blending, on any imported figure's textures.
- **Skin detail generator:** adds pores, fine veins, freckling, imperfections, and natural redness variation to figures with low-quality or overly smooth textures; adjustable intensity.
- **Character mixer:** blend body and face shapes between figures that share the same base (e.g. 60% one Daz character, 40% another, or mix VaM looks), with separate body and face mix sliders.
- **Simple hair generator:** make basic hairstyles (straight, wavy, ponytail, bun, bob) and pubic and body hair shapes in-app when imported hair is missing or unsuitable; works with hair physics and wetness.

### 17.5 Physics control
- **Soft-tissue presets per region:** one-click firm, natural, soft, and very soft settings for breasts, buttocks, belly, and thighs (separately), adjusting stiffness, damping, and sag together. Fine-tuning sliders remain.
- **Time scale:** slow down or speed up Live mode and animation physics (e.g. 0.1× to study jiggle and drape, 2× to settle faster).
- **Sim pinning brush:** paint areas that stay still while the rest simulates: cloth (keep a top fixed at the shoulders), soft tissue (hold one region steady), or hair. Pins can be soft (gently held) or hard (fixed).

### 17.6 Scene building and output
- **Simple prop builder:** quick blocking props made in-app (box, cylinder, sphere, platform, steps, ramp, pole, ring, bar) with size in cm, physics material, and anchor points for ropes and restraints.
- **Time-of-day sun:** sun position from time and compass direction, with matching sky color, light warmth, and shadow length. Works with the lighting presets.
- **Recolor and material editor:** change color, pattern, shine, and fabric or material type for clothing, latex, ropes, toys, and props. Changing the type (e.g. cotton to latex) also updates its physics.
- **Posed 3D export:** export the posed figure (with clothing, soft-tissue shape, and fluids frozen as meshes) as glTF, OBJ, or STL for Blender or 3D printing. For personal use only, since Daz/VaM licenses don't allow redistributing their content.

### 17.7 Reference images
- **Overlay:** show a reference photo semi-transparently over the viewport to match a pose or shape.
- **Camera match:** load a background photo, line up a few guides (horizon, floor), and the 3D camera matches its perspective, so figures can be placed into the photo with matching lighting and shadows on the floor.

---

## 18. Rendering and reference tools

- **Skin:** physically based skin with a subsurface-scattering approximation, detail normals, and translucency for ears and fingers. Daz/VaM texture channels are mapped automatically (diffuse, translucency, specular/roughness, normal, bump).
- **Eyes, hair, and cloth materials:** dedicated shaders (eye refraction, hair anisotropy, cloth sheen).
- **Lighting:** presets (Rembrandt, loop, split, butterfly, rim, overcast, harsh sun, studio three-point), movable lights with gizmos, and HDRI environments from user files or a few bundled CC0 ones. Shadows on.
- **Cameras:** lens presets (24/35/50/85/135 mm), orthographic front/side/top, camera bookmarks, rule-of-thirds and golden-ratio overlays.
- **Study modes:** clay (no textures), silhouette, 2- and 3-value notan, contour lines, and planes/low-poly simplification (Phase 9).
- **Anatomy overlays:** proportion grid in head units, center of gravity with support area (is the pose balanced?). Full anatomy views come from the layer system (section 9).
- **Capture:**
  - PNG at any resolution, with a transparent background option.
  - Turnaround sheet (8 or 16 angles in a grid).
  - **Gesture-drawing mode:** random pose, camera, and lighting every N seconds, with a timer.

---

## 19. Data model and storage

```
Project
 ├─ settings (units, quality, physics defaults)
 ├─ scenes[]
 │   └─ Scene
 │       ├─ figures[]  { assetId, transform, canonicalPose, morphValues,
 │       │               pins, jointLimitPreset, muscleTone,
 │       │               face { actionUnits{L,R} }, hands, feet,
 │       │               muscleTension{group: value}, genitalState,
 │       │               states{cold, exertion, crying, …}, decals[],
 │       │               anatomy { fitId, layerVisibility, peelMasks },
 │       │               cuts[] { tool, shape, depth, bindSpaceTransform },
 │       │               garments[] { assetId, fabric, pins, layer } , hair[] }
 │       ├─ props[]    { assetId, transform, physicsType, material }
 │       ├─ fluids     { emitters[], frozenMeshes, wetnessMaps, stains }
 │       ├─ attachments[] { from (body point | prop | world), to, type, params }
 │       ├─ ropes[]    { material, path, wraps[], knots[], anchors[], tension }
 │       ├─ marks[]    { figureId, kind, uv region, intensity, age }
 │       ├─ snapshots[] (variants of this scene for before/during/after)
 │       ├─ lights[]   { type, transform, color, intensity, shadow }
 │       ├─ cameras[]  { lens | ortho, transform, bookmarkName }
 │       └─ environment { hdriAssetId, floor, background }
 └─ poses[] (saved canonical poses)

Asset (in Library)
 { id, kind: figure|garment|hair|morphs|prop|toy|restraint|tieTemplate|pose|hdri|texture,
   baseFigure, name, creator, license, sourcePath, importedAt,
   files: { meshLODs, textures, morphs, rigMap, colliders, simProxy,
            watertightSkin, anatomyFit, facsMap },
   thumbnail, tags }
```

- **Storage:** asset binaries in the browser's private file system (OPFS); metadata, scenes, and poses in IndexedDB. Library folders are read in place, with only processed versions cached.
- **Storage manager:** shows space used, clears caches, and requests persistent storage so the browser doesn't evict data.
- **Project export:** `.poser` is a zip of the scene JSON plus the processed assets it uses. It's for the user's own backup or second computer, not for sharing.

---

## 20. Tech stack

| Layer | Choice |
|---|---|
| Language and build | TypeScript, Vite, pnpm workspaces (monorepo) |
| UI | React and Zustand (state); **Material Design 3** via our own component set built to the MD3 spec on Radix UI primitives; MD3 tokens as CSS variables; `material-color-utilities` for color schemes; Material Symbols icons and Roboto Flex, self-hosted |
| 3D | three.js with WebGPU renderer (WebGPU required on all platforms), TSL node materials; GLTF/FBX/OBJ loaders, `@pixiv/three-vrm` |
| Physics | JoltPhysics.js (WASM) in a Web Worker |
| Cloth and soft tissue | Custom XPBD on WebGPU compute |
| Cutting | Manifold (`manifold-3d`, WASM) booleans in a worker |
| Ropes | Custom XPBD rod (Cosserat) solver on WebGPU compute |
| Fluids | Custom MLS-MPM on WebGPU compute, texture-space surface flow, screen-space fluid rendering |
| Anatomy data | In-house procedural female and male anatomy (Blender scripts plus in-app fitting), no medical scan data |
| Asset processing | meshoptimizer (decimation and compression), KTX2/Basis encoder, fflate (zip/gzip), V-HACD (convex decomposition), all WASM in workers |
| Storage | OPFS + IndexedDB; File System Access API for library folders (desktop Chrome/Edge) |
| App shell | Installable PWA (manifest and icons) **without offline caching** (owner's decision): no service worker, so every launch loads the latest version from the site and needs an internet connection. User data still stays on the device. |
| Testing | Vitest (unit), Playwright (end-to-end and screenshot comparison), physics regression scenes |
| Hosting and access | Static site on **Cloudflare Pages**, deployed from Git. No login gate in front of it (owner's decision: no Cloudflare Access); the address is shared only with invited users. Security headers that enable shared memory. Search engines blocked. No backend. |
| Photo/webcam posing | MediaPipe pose, hand, and face landmarkers (in-browser) |
| Final render | three-gpu-pathtracer (MIT) on a separate WebGL2 renderer, used only for still images |

### Code layout
```
poser/
  apps/web/              React app shell, panels, wizard
  packages/core/         scene model, commands/undo, serialization, storage
  packages/importers/    gltf, fbx, obj, vrm, daz, vam, md, bvh, images
  packages/library/      asset index, folder scanning, thumbnails, dependencies
  packages/rig/          canonical skeleton, rig maps, joint limits, mirror tables
  packages/posing/       gizmos, IK solvers, pins, pose library
  packages/physics/      Jolt worker, ragdoll builder, prop colliders
  packages/cloth/        XPBD solver (GPU), garment prep, fabrics
  packages/softtissue/   spring bones, contact compression, tet flesh
  packages/render/       materials, lighting, cameras, study modes, capture
  packages/anatomy/      layer templates, fitting, labels, peel, layered flesh
  packages/cutting/      cut tools, booleans, caps, cut stack, removed parts
  packages/fluids/       MPM solver, surface flow, emitters, wetness, stains
  packages/face/         FACS action units, rig mapping, wrinkles, presets
  packages/states/       body states, muscle tension, genital states, decals
  packages/interaction/  attachments, hold/place, toys, body-opening channels, latex
  packages/rope/         rope solver, wrap tool, tie templates, knots, load overlay
  packages/marks/        skin marks, aging over time
  assets/builtin/        CC0 starter figures (MakeHuman/MPFB), props, HDRIs
  assets/anatomy/        generated female and male anatomy templates
  tools/blender/         anatomy and FACS generation scripts
  docs/                  import guides, architecture notes
```

---

## 21. Quality targets

| Area | Target |
|---|---|
| Posing frame rate | 60 fps with 2 figures on a mid-range GPU (e.g. RTX 3060 / M1) |
| Animation | Bake a 10-second clip with 2 figures, cloth, and soft tissue in under 2 minutes at High; export at 1080p 30 fps |
| Cloth | About 20k simulated vertices at 30+ fps on WebGPU |
| Settle | Finishes in 3 seconds or less for one figure with clothing |
| Import | A Genesis 8 FBX with textures imported in under 30 seconds (plus under 60 seconds for anatomy fitting) |
| Cuts | Knife or saw cut applied in under 1 second, with an instant preview |
| Fluids | About 100k particles at 30+ fps on WebGPU; surface flow always real time |
| Ropes | A full harness plus suspension (about 20 rope segments) settles in under 5 seconds |
| Memory | Warn before going past roughly 2 GB of GPU memory |
| Browsers | Chrome only, on Windows, macOS, Android, and iPhone/iPad (installed as a PWA). WebGPU for full features; WebGL2 compatibility mode otherwise. |

### Testing
- Unit tests for rig mapping, IK, joint limits, importers, and serialization.
- A **golden test set** of real files, mostly female (Daz Genesis 8 Female, Genesis 9 with a female shape, VaM female looks, female VRM and Mixamo figures), plus some male figures and MD garments: each must import, map, and pose correctly.
- A **female body-diversity set** (slim, curvy, heavy, muscular, large and small breasts, young adult to elderly, pregnant) for anatomy fitting and breast physics checks.
- Visual accuracy checks of the female template against illustrated and photo references.
- Contact tests: two figures pressing, hand grip on flesh, and genital contact, checked for intersections and stability.
- Object tests: rope harness and suspension, latex catsuit, soft toy insertion, wax drip, checked for slipping, intersections, and stability.
- Screenshot tests for rendering and study modes.
- Physics regression scenes (sitting in a chair, lying on the floor, a skirt in a seated pose) checked for penetration and stability.
- Anatomy fitting checks on very different body types (no bones poking through skin, sensible fat thickness), and cut tests comparing cross-sections with reference atlas slices.

---

## 22. Content policy, safety, and legal

Because the app is private (personal use plus a few invited users, not public, not paid), most commercial adult-site rules don't apply: no payment processor, no public age-verification system, no app stores. What still matters:
- **Private access:** the site has no login gate; it stays private by sharing the address only with invited adults (18+), blocking search engines, and keeping all user content on each device. The adults-only notice and the app lock are the in-app gates.
- **Everything stays local:** user content never touches the server; the site only serves the app's code and built-in CC0 and original assets.
- **Graphic-content setting:** blood, open wounds, removed body parts, and bodily fluids are **on by default** and can be switched off per user, separately from nudity.
- **Adult figures only:** the app has no child body proportions, and depicting minors sexually is illegal. Keep this as a hard rule for anyone invited.
- **Real people:** sexual images of real people without consent (including digital fakes) are illegal in many places, especially if shared, so the group should avoid it.
- **Licensing:** personal use of your own Daz/VaM files is the normal use case; don't pass purchased Daz/VaM content between users unless its license allows it (`.var` licenses are shown in the Library). Anatomy data is credited on an About screen as its licenses require.
- **If it ever goes public or paid,** revisit age-verification laws, payment processors (Stripe doesn't accept adult content), hosting terms, and the Daz Interactive License.

---

## 23. Roadmap

Each phase ends with something usable. Week estimates assume one full-time developer.

### Phase 0: Foundation (about 2 weeks)
- [x] Monorepo, Vite, React shell
- [x] MD3 design system: tokens, dark/light themes from a seed color, core components (app bar, navigation rail/bar, sheets, segmented buttons, FAB, sliders, chips, cards, tabs, menus, dialogs, snackbars, tooltips), Material Symbols icons with labels, layouts for compact/medium/expanded windows
- [x] three.js WebGPU viewport, orbit camera, view cube, grid, floor
- [x] Scene store, undo/redo, autosave to IndexedDB/OPFS
- [x] Private hosting on Cloudflare Pages (no login gate, search engines blocked; setup guide in docs/hosting.md), adults-only notice
- [x] App lock, neutral tab option; automatic backup folder
- [x] Chrome check, PWA install, responsive touch-first layouts (desktop, tablet, phone)
- [x] Quality levels, GPU auto-detection and benchmark, adaptive quality, memory manager (benchmark thresholds to be tuned on real devices)
- [x] Crash handling: GPU device-lost recovery, Safe Mode after a crash, WebGL2 compatibility mode (also used automatically when WebGPU exists but fails a startup self-test)
- [ ] **Verify WebGPU in Chrome on iOS** on a real device
- [ ] Load a bundled CC0 female figure (a male figure is bundled too). *Partly done:* procedural female and male mannequins on the canonical rig stand in until MakeHuman/MPFB exports are added to `assets/builtin/` (needs Blender with MPFB, which isn't available in Claude's environment)
- [x] Rough placeholder anatomy (simple skeleton, muscle, and fat volumes) for the early prototypes
- **Done when:** the app opens with a figure, the user can orbit it, and the scene saves and reloads.

### Phase 1: Import and posing MVP (about 5 weeks)
- [ ] Drag-and-drop, file/folder pickers, zip unpacking, import wizard, Library panel
- [ ] glTF, FBX, OBJ, VRM, DAE/STL/PLY importers; mesh and texture optimization in workers
- [ ] Canonical rig with Daz G8/G9, VaM-export, Mixamo, CC4, and VRM maps, plus the manual mapping wizard
- [ ] Joint handles, rotation gizmo, IK effectors, pins, joint limits, mirror, hand presets, morph sliders
- [ ] Pose library and BVH/VRMA pose import
- [ ] Simple prop builder; time-of-day sun; recolor and material editor
- [ ] Body measurements readout; pose blending; random pose and camera; reference image overlay and camera match
- [ ] Built-in CC0 environments (bedroom, bathroom, studio, dungeon-style room, living room)
- [ ] Props (visual only), lighting presets, lens/ortho cameras, study modes (clay, silhouette, notan)
- [ ] Screenshot capture; Daz export guide
- **Done when:** a Daz G8 FBX and a Mixamo character are imported, posed convincingly with IK and limits, lit, and captured.

### Phase 2: Physics and cloth (about 8 weeks)
- [ ] Jolt worker, automatic ragdoll, muscle motors, Settle and Live modes
- [ ] Prop colliders (primitives, hulls, V-HACD), physics materials
- [ ] Scrotum/testicle soft bodies, erection rigidity slider; breast implant option
- [ ] **Breast soft-body simulation** (volume-based, glandular/fat stiffness, ligament support), checked standing, lying, on the side, bent forward, and pressed
- [ ] Two-way clothing ↔ flesh interaction (bra support, waistband and strap indentation)
- [ ] Spring-bone fallback for other soft tissue; contact compression
- [ ] Collision-aware posing and Resolve intersections; poke, pinch, squeeze, and slap tools
- [ ] Sheer and open fabrics; high heels adjusting posture
- [ ] Gravity direction/strength and wind (fan prop)
- [ ] Soft-tissue presets per region, time scale, sim pinning brush
- [ ] Figure-to-figure contact: two-way soft-body contact, skin friction, hands gripping flesh, two-figure pose helpers
- [ ] Attachment and holding system (attachment points on skin, joints, hold and place tools), measure tool
- [ ] Rigid toys and props, cuffs and chains, soft surfaces (mattresses, cushions)
- [ ] XPBD cloth on WebGPU: body collision field, friction, pins, fabric presets, drape from rest, simulation proxy
- [ ] Marvelous Designer OBJ + XML import
- [ ] Balance overlay (center of gravity)
- **Done when:** a female figure Settles into an imported chair with thighs compressing on the seat, her breasts rest correctly when she lies down or leans forward, and a bra, shirt, and skirt fit and drape realistically.

### Phase 3: Native Daz and VaM (about 6 weeks)
- [ ] Library folders with indexing and re-scan
- [ ] Daz `.duf/.dsf` reader: figures, shape morphs, corrective morphs, wardrobe (including dForce settings), hair, materials, poses
- [ ] VaM `.var` and install-folder reader: looks, morphs, clothing, hair, textures, licenses, dependencies
- [ ] Garment auto-fit between figures
- [ ] Character mixer (blend shapes between figures of the same base)
- [ ] Cloth self-collision, multiple garment layers, cloth on props (a sheet on a bed)
- **Done when:** a Genesis 9 figure with a dForce dress, and a VaM look with clothing, load straight from the user's folders with no Blender step.

### Phase 4: Face, hands, feet, muscles, and body states (about 7 weeks)
- [ ] Pose, hands, and expression from photo or webcam (MediaPipe)
- [ ] Random body variation
- [ ] Skin tone editor and skin detail generator; simple hair generator
- [ ] Tongue posing, teeth, eye look-at and blink
- [ ] Body hair density, tan lines, scars, freckles and moles
- [ ] FACS action-unit system with left/right sliders, presets, blending; mapping for Daz G8/G9 and ARKit 52 rigs
- [ ] Build our own FACS template face (procedural action units, female first); transfer action units to figures without face rigs
- [ ] Wrinkle maps, blush/flush/pallor skin color maps, eyes (pupil, lids, tear film)
- [ ] Per-joint hand and foot fine-tuning, fingertip IK, grip-to-prop, foot flattening under weight
- [ ] Muscle tension per group (shape via morphs/normal maps first; full volume bulge comes with Phase 5), body fat and muscle sliders
- [ ] Genital and secondary sexual anatomy states (morph-driven first)
- [ ] State panel (cold, hot, exertion, breathing, crying, fear, embarrassment, arousal, fatigue), injury and skin decals
- [ ] Female states: pregnancy stages, postpartum/lactation, menstrual cycle, menopause and aging (morph-driven first; anatomy-driven once Phase 5 lands)
- **Done when:** a figure can be set to "crying, cold, tense" with matching face, skin, posture, and anatomy details, all fine-tunable.

### Phase 5: Anatomical layers (about 10 weeks)
- [ ] Close every mesh, bind to the canonical rig, author fat and bone-interior data
- [ ] Procedural anatomy generator (Blender scripts plus in-app fitting): parametric skeleton, procedural muscles, fat from skin, breast internals, internal genital and pelvic anatomy, organs; female first, with variation controls
- [ ] Male version of the anatomy generator
- [ ] Genital soft bodies with deformable openings for figure-to-figure and figure-to-prop contact (section 7.5)
- [ ] Fitting pipeline: skeleton match, skin registration, volumetric warp, fat thickness, sex detection
- [ ] Layer viewer: visibility/transparency, presets, peel brush, labels and descriptions
- [ ] Skin folds and creases, skin sliding over bone and muscle
- [ ] Layered flesh simulation (fat and muscle volumes with XPBD), muscle volume bulge from tension, erectile tissue volume for genital states
- [ ] Credits screen for anatomy data
- **Done when:** every figure in the female body-diversity set, plus male figures, shows plausible fitted anatomy that moves with posing, with no bones through the skin.

### Phase 6: Restraints, toys, and latex (about 10 weeks)
- [ ] Rope simulation (XPBD rods on GPU) with body friction, rope-on-rope contact, and flesh compression
- [ ] Wrap tool, tie templates fitted via the canonical rig, knot shapes, anchors, tension control
- [ ] Suspension and load sharing; load and pressure overlay; strain warnings
- [ ] Straps, collars, harnesses, gags, blindfolds, tape; restraint furniture anchor points
- [ ] Soft and flexible toys, strap-ons, motorized toys and machines (vibration, stroke motors)
- [ ] Body-opening channels (mouth/throat, vagina, anus) following the anatomy, with stretch limits and lubrication-dependent friction; X-ray view of insertion
- [ ] Latex and tight materials: high-stretch cloth, two-way compression, gloss and stretch-thinning shading, vacuum and inflatable items
- [ ] Pressure skin response (blanching, flushing, force-driven bruising)
- [ ] Skin marks (pressure, impact, scratches) with time slider; clothing states (displaced, unbuttoned, torn)
- [ ] Hair grabbing, pulling, and tying
- [ ] Scenario snapshots
- **Done when:** a female figure in a rope chest harness and suspension hangs realistically with rope pressing into flesh and leaving marks after removal; a latex catsuit compresses and shines correctly; a soft toy deforms and follows the anatomical channel in X-ray view.

### Phase 7: Cutting (about 8 weeks)
- [ ] Watertight skin generation at import; Manifold booleans in a worker
- [ ] Section plane (shader-based), knife, scalpel/flap, saw/remove, puncture tools
- [ ] Cuts in rest pose so they survive re-posing; editable cut stack
- [ ] Tissue cap materials (skin, fat, muscle fibers, tendon, bone cortex/marrow, organs, vessels)
- [ ] Wound edge retraction via layered flesh; removed parts become physics objects; ragdoll updates
- [ ] Optional cutting through clothing
- [ ] Wound healing stages over time
- [ ] Removed parts as holdable props; objects left in wounds; pressing on wounds; dressings and tourniquets
- [ ] Graphic-content setting
- **Done when:** a cut through the thigh shows skin, fat, the correct muscles, femur cortex and marrow, and the femoral vessels in the right places, and stays correct after re-posing.

### Phase 8: Fluids (about 8 weeks)
- [ ] Surface flow on skin and cloth (texture-space wetness and film thickness, gravity-driven, dripping)
- [ ] MLS-MPM particle fluids on WebGPU with surface rendering
- [ ] Fluid presets (blood, tears, sweat, saliva, urine, water, oil) and custom fluid editor
- [ ] Emitters: wounds (ooze, venous flow, arterial pulsing from vessels hit), tear ducts, mouth, nose, urethra, sweat regions, custom
- [ ] Cloth absorption (darker, heavier, clingier), wet skin shading, pooling, stains, drying and blood darkening
- [ ] Freeze fluids into meshes and stains for capture
- [ ] Lubricant and oil (friction and shine), candle wax that solidifies, water environments (shower, bath, pool) with buoyancy, wet see-through clothing
- **Done when:** a forearm cut bleeds realistically down the arm, soaks a sleeve, and pools on the floor; a crying figure has tears running down the cheeks.

### Mobile and tablet tuning (alongside each phase, about 8–12 weeks in total)
- [ ] Every feature ships with tablet and phone quality settings and is tested on real iPhone, iPad, and Android devices
- [ ] Desktop-prepared asset packs with mobile-sized versions
- [ ] Touch interaction for gizmos, IK, rope wrap tool, cut tools, and brushes

### Phase 9: Simple animation (about 6 weeks)
- [ ] Timeline, keyframes (pose, face, states, clothing, objects, camera), easing, loops
- [ ] Physics baking and scrubbing; rhythmic motion helper; breathing and idle layers
- [ ] Video and GIF export (frame-by-frame)
- **Done when:** a looping 5-second clip of a female figure shifting her weight, with breast and cloth motion and a moving camera, exports smoothly as MP4.

### Phase 10: Polish and extra reference tools (ongoing)
- [ ] Path-traced final render mode, camera effects (depth of field, grain, grading), practical lights and haze
- [ ] Video/GIF capture of Live mode
- [ ] Posed 3D export (glTF/OBJ/STL)
- [ ] Involuntary reactions (trembling, arching, toe curl), upside-down face flush
- [ ] Optional encrypted storage, blurred thumbnails, preset packs
- [ ] Better skin shading, hair strand/card physics, mirrors, POV camera refinements
- [ ] Planes study mode, turnaround sheets, gesture-drawing mode

### Phase 11 (optional)
- [ ] WebXR: pose figures in VR

**Total:** roughly 95–100 weeks of work (including mobile and tablet support) for one full-time developer through Phase 9. Phases 4–8 can partly run in parallel with more people: face/states and fluids are mostly independent, while restraints/toys and cutting depend on the anatomy layers.

### Prototype the hardest parts first
These run **in parallel with Phase 0** (the owner's choice), as throwaway tests that prove the risky tech before it's built for real:
1. **Ragdoll Settle:** a Jolt ragdoll holding a pose with motors and sitting on a box.
2. **GPU cloth:** a XPBD skirt on WebGPU colliding with an animated capsule body at 30+ fps.
3. **Anatomy fit and cut:** fit a rough placeholder anatomy (simple sculpted skeleton, muscle, and fat volumes) into one imported figure and cut through a limb with Manifold, to measure fit quality and cut speed early.
4. **Fluids:** MLS-MPM blood colliding with a skinned body, plus a basic surface-flow trickle.
5. **Rope:** a GPU rope wrapped around a limb, holding by friction and pressing into a soft-body flesh layer.
6. **Insertion channel:** a soft toy following a soft-body channel with stretch limits, to prove stability early.

---

## 24. How we'll work

- **Claude writes the code**, phase by phase, committing and pushing directly to `main` (the owner's rule: only ever push to `main`), with tests and commits per milestone.
- **The owner tests on real devices** (Windows/macOS PCs, phones, tablets) after each milestone and reports what works, what looks wrong, and performance. This matters because Claude's environment has no real GPU or phone to test WebGPU, physics feel, or visuals.
- Each phase starts with a short check-in on its scope and ends with a demo build and a list of known issues.
- **Test assets:** the owner supplies Daz Genesis 8/9 exports, VaM `.var` packages, generic FBX/glTF figures and props, and a VRM avatar. They're used locally for testing and never committed to the repository.
- **Hosting:** a static build on Cloudflare Pages, deployed from `main` (set up by the owner, with Claude's instructions in docs/hosting.md).
- Week estimates in the roadmap are for a single full-time human developer; with Claude writing the code, the real pace depends mostly on how fast each milestone can be tested and refined.

---

## 25. Risks

| Risk | Mitigation |
|---|---|
| Daz/VaM formats are undocumented and change | Standard formats work first; native readers are additive. Golden test files catch breakage. |
| Heavy meshes and textures exhaust browser memory | Decimation, KTX2, LODs, morph pruning, memory warnings, quality levels |
| Cloth instability (explosions, poke-through) | Small substeps, thick collision fields, drape from rest, velocity clamping, "reset cloth" button |
| Daz bend/twist rigs deform poorly | Dedicated twist splitting; corrective morphs in Phase 3 |
| A device lacks WebGPU or a strong enough GPU | GPU auto-detection, quality levels, adaptive quality, WebGL2 compatibility mode |
| Crashes or tabs killed on heavy scenes (especially iOS) | Device-lost recovery, Safe Mode after a crash, piece-by-piece loading, autosaves and backups |
| WebGPU may not be available inside Chrome on iOS | Verify in Phase 0; fall back to compatibility mode on iOS, or allow Safari there as an exception |
| Browser file-access differences (only desktop Chrome/Edge have folder access) | Manual re-scan; drag-and-drop always works; recommend Chrome/Edge for large libraries |
| Browser storage limits for big libraries | Request persistent storage, show usage, read library folders in place instead of copying, cache only processed versions |
| Anatomy fit looks wrong on unusual body types | Landmark-guided fitting, per-region manual sliders, test set of very different bodies |
| Rope and knot simulation is unstable or slips | Friction-based holding, pre-modelled knots, tie templates, substeps, "pin rope" fallback |
| Insertion and soft-body channels explode or intersect | Guide-curve channels, stretch limits, small substeps, early prototype |
| Many simultaneous systems (two figures, ropes, latex, fluids) overload the GPU | Quality levels, freezing finished systems after Settle, budget meter |
| No suitable female anatomy model exists, scan data is ruled out, and no artist is hired | Procedural anatomy generator using the imported figure's own outside shape; hand refinement in Blender over time; placeholder anatomy for development. Morph-based female features ship first so the app is useful meanwhile. |
| Booleans fail on bad meshes, or cuts are slow | Generate watertight cutting meshes at import, run cuts in a worker with a preview, simplify far-from-cut regions |
| Memory and GPU load with full anatomy, flesh sim, cloth, and fluids together | Load layers on demand, LODs, quality levels, and a budget that limits simultaneous systems on weaker GPUs |
| No openly licensed FACS face template | Build our own procedurally (section 13.1) |
| Data loss from browser storage being cleared | Automatic backups to a user folder, persistent storage request |
| Private content exposed on a shared device | App lock, optional encryption, blurred thumbnails |

---

## 26. Open decisions for the owner
Already decided: Chrome required; private use; installable PWA without offline caching; balanced visual quality; free MakeHuman starter figures; 1–2 figures per scene; simple animation; graphic content on by default; no real medical scan data; all import sources (Daz, VaM, generic, VRM) supported; anatomy and FACS face built in-house (procedurally); Claude writes the code; sharing by sending files by hand (no server); metric units (cm/m/kg); building starts with Phase 0 and the risky prototypes in parallel; all feature areas (toys/ropes/latex, face/states, anatomy/cutting, fluids) are in scope, in the roadmap order below.

No open decisions remain. New questions will be added here as they come up during building.

---

## Sources
- Material Web maintenance mode: https://github.com/material-components/material-web/discussions/5642
- Material Web site: https://material-web.dev
- WebGPU in iOS 26: https://appdevelopermagazine.com/webgpu-in-ios-26/
- WebGPU supported in major browsers (web.dev): https://web.dev/blog/webgpu-supported-major-browsers
- WebKit bug: memory-pressure reload loop: https://bugs.webkit.org/show_bug.cgi?id=300782
- Opening a directory (browser support): https://web.dev/articles/files/open-a-directory
- MediaPipe Face Landmarker (52 blendshapes): https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- three-gpu-pathtracer: https://github.com/gkjohnson/three-gpu-pathtracer
- US state age-verification laws: https://avpassociation.com/us-state-age-verification-laws-for-adult-content/
- Age verification law overview 2026: https://www.jumio.com/age-verification-laws/
- Missouri age-verification law (2026): https://www.stlpr.org/government-politics-issues/2026-08-28/age-verification-law-for-porn-sites-now-in-effect-in-missouri
- Stripe prohibited businesses: https://support.stripe.com/questions/prohibited-and-restricted-businesses-faqs
- Example commercial female anatomy models (licenses vary): https://www.renderhub.com/nonecg/human-female-complete-anatomy and https://www.turbosquid.com/3d-models/3d-female-reproductive-system-anatomical-model-sagittal-section-on-stand-model-2456104
- Manifold (manifold-3d): https://www.npmjs.com/package/manifold-3d
- WebGPU MLS-MPM fluids (Codrops): https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/
- MLS-MPM with WebGPU and three.js: https://discourse.threejs.org/t/mls-mpm-simulation-with-webgpu-and-threejs/77686
- MPFB licensing FAQ: https://static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html
- MakeHuman license: https://static.makehumancommunity.org/about/license.html
- Daz Interactive License: https://www.daz3d.com/interactive-license-info
- Genesis 9 exporters (Daz forums): https://forum.daz3d.com/forums/discussion/comment/7716386/ and https://forum.daz3d.com/forums/discussion/641041/g9-diffeomorphic-general-help
- PlayCanvas on physics engines (Rapier/Jolt): https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/
- XPBD WebGPU cloth demo: https://github.com/jspdown/cloth
- WebGPU mass-spring cloth paper: https://arxiv.org/html/2507.11794v1
- WebGPU browser support in 2026: https://blog.codercops.com/blog/webgpu-browser-gpu-compute-2026
- Marvelous Designer OBJ export/import: https://support.marvelousdesigner.com/hc/en-us/articles/360037330751 and https://support.marvelousdesigner.com/hc/en-us/articles/47358223288601
- MD → Daz scale notes: https://www.versluis.com/2015/03/how-to-export-a-garment-from-marvelous-designer/
