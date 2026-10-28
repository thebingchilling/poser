# Poser: app plan

A web app for **realistic, physics-based anatomy reference**. Artists import their own figures (Daz3D, Virt-a-Mate, VRM, generic rigs), clothing, and props. They pose figures with joint handles like VRM Posing Desktop, let real physics settle bodies, soft tissue, and cloth, then light, frame, and capture reference images.

> **Status:** planning only. Nothing gets built until the go-ahead.

---

## 1. Scope

### In scope
- **Self-import only.** Users bring files from their own disk. The app never downloads from the internet, browses stores, or proxies websites.
- Realistic human figures, including anatomically complete nude figures, for art reference (18+).
- Posing with FK rotation handles, IK effectors, pins, joint limits, mirroring, hand presets, and a pose library.
- Physics: gravity and contact settling (ragdoll), soft tissue, cloth draping, prop collisions.
- Importing props and environments that figures and cloth interact with.
- Lighting, cameras, study modes, and image capture.

### Out of scope for v1
- Any online model sources, accounts, cloud sync, or sharing.
- Animation timelines (single poses only; a timeline may come later).
- Mobile phones (tablet support is a stretch goal; desktop browsers first).

### Principles
1. **Local-first and private.** Files never leave the device. Storage is the browser's private file system (OPFS) plus IndexedDB.
2. **Bring your own assets.** No third-party content is bundled. Built-in content is original or CC0 only.
3. **Anatomy first.** Realistic joint limits, proportions, weight, and lighting take priority over game-style features.
4. **Never block on exotic formats.** Standard formats (glTF/FBX/OBJ/VRM) work from day one; native Daz/VaM reading is added on top.

---

## 2. Key research findings

| Topic | Finding | Consequence |
|---|---|---|
| **Daz3D files** | There's no official glTF export. The common routes are Daz Studio → FBX, or the Diffeomorphic add-on → Blender → glTF. Genesis 9 has known export issues (HD mesh, armature scaling, some hair/shoe problems). Daz's native `.dsf/.duf` files are gzipped JSON. | v1 imports user-exported FBX/glTF and ships an in-app export guide. Phase 3 adds a native reader for the user's installed Daz library folder. |
| **Daz licensing** | Using Daz 3D data inside an application (rather than as renders) needs an **Interactive License**. | Never bundle or host Daz content. Users load their own files locally. *(Not legal advice; get it reviewed before launch.)* |
| **Virt-a-Mate** | `.var` packages are zip files with a `meta.json` (license, dependencies), plus morphs, clothing, and textures. VaM 1.x figures use a Daz Genesis 2 base mesh that **isn't inside the packages**. | Read `.var` zips and the VaM install folder. Apply morphs and clothing onto the base mesh from the user's own VaM install. |
| **Physics engine** | Jolt (WASM) has rigid bodies, ragdolls with motors, constraints, and soft bodies. Rapier has no soft bodies. | Use Jolt for bodies and props. |
| **Cloth** | There is no mature, reusable browser cloth library; only demos (XPBD on WebGPU, mass-spring papers). | Write our own XPBD cloth solver on WebGPU compute, with a CPU fallback. |
| **WebGPU** | Available in Chrome, Edge, Safari 17.4+, and Firefox (default since late 2025). | WebGPU is the primary target; WebGL2 is the fallback with reduced features. |
| **Marvelous Designer** | OBJ export with an optional XML sidecar holding physical properties. Units default to millimetres. | Import MD garments with auto-scaling and fabric mapping. |
| **Built-in figures** | MakeHuman/MPFB core assets and exports are CC0. Exports must come from an official, unmodified MakeHuman build, and third-party add-on assets keep their own licenses. | Use them as the bundled starter male and female figures, so the app is usable before anything is imported. |

---

## 3. User experience

### 3.1 Screen layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Top bar: Project ▾ | Undo Redo | Mode: [Pose][Settle][Live] | ▶ Sim | 📷 │
├──────────────┬────────────────────────────────────────────┬───────────────┤
│ LEFT PANEL   │                                            │ RIGHT PANEL   │
│ ┌──────────┐ │                                            │ Inspector     │
│ │ Library  │ │              3D VIEWPORT                   │ tabs:         │
│ │ (assets) │ │                                            │  Transform    │
│ ├──────────┤ │   joint handles · IK effectors · gizmos    │  Pose         │
│ │ Outliner │ │   view cube · camera bookmarks             │  Body/Morphs  │
│ │ (scene)  │ │                                            │  Physics      │
│ └──────────┘ │                                            │  Cloth        │
│              │                                            │  Material     │
├──────────────┴────────────────────────────────────────────┴───────────────┤
│ Bottom strip: Pose library thumbnails · Hand presets · Lighting presets   │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Library** lists everything imported, with filters (Figures, Clothing, Hair, Morphs, Props, Poses, Environments), thumbnails, search, and tags. Drag an item into the viewport to add it; drop clothing onto a figure to dress it.
- **Outliner** shows the scene tree (figures → worn garments/hair, props, lights, cameras) with visibility and lock toggles.
- **Inspector** shows properties for the selection.
- Panels collapse for a full-screen viewport. Light and dark themes.

### 3.2 Main user flows
1. **First run:** age gate → short tour → a scene with a built-in CC0 figure, so posing can be tried immediately.
2. **Import:** drag in files, folders, or zips (or add a library folder) → import wizard → asset appears in the Library.
3. **Pose:** click a joint → rotate it, or drag a hand/foot effector → IK follows. Pin feet, mirror, apply a hand preset.
4. **Make it physical:** press **Settle** → the body drops under gravity onto the floor or props, soft tissue rests, clothes drape → the result freezes for editing.
5. **Dress:** drop a garment on the figure → pick a fabric preset → it drapes from the rest pose into the current pose.
6. **Stage:** add props (chair, bed), pick a lighting preset, pick a lens or orthographic view, switch a study mode.
7. **Capture:** screenshot, turnaround sheet, or gesture-drawing timer session.
8. **Save:** projects autosave locally; export/import a `.poser` project file for backup or moving between computers.

### 3.3 Viewport controls
- Orbit/pan/zoom (mouse, trackpad, touch) and a view cube for front/side/top/ortho views.
- Click a body part to select its nearest joint; Alt-click selects the mesh.
- Shortcuts: `W/E/R` move/rotate/scale gizmo, `Q` toggle IK/FK, `P` pin, `M` mirror, `F` frame selection, `Space` toggle simulation, `Ctrl+Z/Y` undo/redo, `1–9` camera bookmarks.

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
- **Hands:** presets (relaxed, fist, point, pinch, open, grip) plus per-finger curl and spread sliders.
- **Face:** expression morph sliders and eye gaze.
- **Body shape:** morph sliders for whatever shape morphs the figure has (Daz/VaM/glTF morph targets).
- **Pose library:** save, load, and thumbnail poses in canonical form, so they work across figures. Import/export BVH/VRMA single frames.
- **Multi-figure:** several figures in one scene, with contact between them in physics modes.
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
- Soft props (mattress, cushion, pillow) come in Phase 4 as Jolt soft bodies.

### 7.4 Soft tissue (staged)
| Phase | Technique | Result |
|---|---|---|
| 2 | Spring-bone chains on breasts, glutes, belly, and thighs, colliding with body capsules | Correct sag for the body's orientation (lying vs standing) and jiggle in Live mode |
| 2 | Contact compression: skin vertices pushed out of touching surfaces, with the displacement spread to neighbours as a bulge (GPU pass) | Thighs flatten on a seat, cheek squashes on a hand, body presses into a figure it leans on |
| 4 | Volumetric flesh: a coarse tetrahedral mesh between bone and skin, simulated with XPBD (volume-preserving), driving the visible mesh | True sag, compression, and wobble everywhere |

### 7.5 Simulation step (each frame)
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
- **CPU fallback:** the same solver in a Web Worker at lower resolution when WebGPU isn't available.

### 8.2 Garments
- Garments arrive fitted to a figure in its rest pose (Daz, VaM, Marvelous Designer, glTF).
- On import: transfer skin weights from the body (fallback when the sim is off), and auto-detect **pin regions** such as waistbands, straps, and cuffs. The user can adjust pins with a paint brush.
- **Drape from rest:** when a pose is applied, the figure moves smoothly from rest pose into the target pose over a short run while the cloth follows. This avoids the cloth starting inside the body (the same idea as Daz dForce).
- **Layers:** underwear → shirt → jacket, with collision offsets keeping them in order.
- **Hair:** rigid or spring-bone hair in v1; card or strand physics in Phase 4.

### 8.3 Fabric presets
Cotton, jersey/T-shirt, silk/satin, denim, leather, spandex/lycra, wool knit, chiffon, and latex. Each preset sets stretch, shear, bend stiffness, weight (g/m²), damping, friction, and thickness. Values from the Marvelous Designer XML are used when present. Advanced sliders allow fine-tuning.

---

## 9. Rendering and reference tools

- **Skin:** physically based skin with a subsurface-scattering approximation, detail normals, and translucency for ears and fingers. Daz/VaM texture channels are mapped automatically (diffuse, translucency, specular/roughness, normal, bump).
- **Eyes, hair, and cloth materials:** dedicated shaders (eye refraction, hair anisotropy, cloth sheen).
- **Lighting:** presets (Rembrandt, loop, split, butterfly, rim, overcast, harsh sun, studio three-point), movable lights with gizmos, and HDRI environments from user files or a few bundled CC0 ones. Shadows on.
- **Cameras:** lens presets (24/35/50/85/135 mm), orthographic front/side/top, camera bookmarks, rule-of-thirds and golden-ratio overlays.
- **Study modes:** clay (no textures), silhouette, 2- and 3-value notan, contour lines, and planes/low-poly simplification (Phase 4).
- **Anatomy overlays:** skeleton overlay, proportion grid in head units, center of gravity with support area (is the pose balanced?), and later muscle-group overlays.
- **Capture:**
  - PNG at any resolution, with a transparent background option.
  - Turnaround sheet (8 or 16 angles in a grid).
  - **Gesture-drawing mode:** random pose, camera, and lighting every N seconds, with a timer.

---

## 10. Data model and storage

```
Project
 ├─ settings (units, quality, physics defaults)
 ├─ scenes[]
 │   └─ Scene
 │       ├─ figures[]  { assetId, transform, canonicalPose, morphValues,
 │       │               pins, jointLimitPreset, muscleTone,
 │       │               garments[] { assetId, fabric, pins, layer } , hair[] }
 │       ├─ props[]    { assetId, transform, physicsType, material }
 │       ├─ lights[]   { type, transform, color, intensity, shadow }
 │       ├─ cameras[]  { lens | ortho, transform, bookmarkName }
 │       └─ environment { hdriAssetId, floor, background }
 └─ poses[] (saved canonical poses)

Asset (in Library)
 { id, kind: figure|garment|hair|morphs|prop|pose|hdri|texture,
   baseFigure, name, creator, license, sourcePath, importedAt,
   files: { meshLODs, textures, morphs, rigMap, colliders, simProxy },
   thumbnail, tags }
```

- **Storage:** asset binaries in the browser's private file system (OPFS); metadata, scenes, and poses in IndexedDB. Library folders are read in place, with only processed versions cached.
- **Storage manager:** shows space used, clears caches, and requests persistent storage so the browser doesn't evict data.
- **Project export:** `.poser` is a zip of the scene JSON plus the processed assets it uses. It's for the user's own backup or second computer, not for sharing.

---

## 11. Tech stack

| Layer | Choice |
|---|---|
| Language and build | TypeScript, Vite, pnpm workspaces (monorepo) |
| UI | React, Zustand (state), Radix UI (accessible components) |
| 3D | three.js with WebGPU renderer (WebGL2 fallback), TSL node materials; GLTF/FBX/OBJ loaders, `@pixiv/three-vrm` |
| Physics | JoltPhysics.js (WASM) in a Web Worker |
| Cloth and soft tissue | Custom XPBD on WebGPU compute, plus a CPU worker fallback |
| Asset processing | meshoptimizer (decimation and compression), KTX2/Basis encoder, fflate (zip/gzip), V-HACD (convex decomposition), all WASM in workers |
| Storage | OPFS + IndexedDB; File System Access API for library folders |
| Testing | Vitest (unit), Playwright (end-to-end and screenshot comparison), physics regression scenes |
| Hosting | Static site (Cloudflare Pages or Netlify) with the security headers that enable shared memory. No backend needed. |
| Optional later | Tauri desktop wrapper for very large libraries |

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
  packages/cloth/        XPBD solver (GPU + CPU), garment prep, fabrics
  packages/softtissue/   spring bones, contact compression, tet flesh
  packages/render/       materials, lighting, cameras, study modes, capture
  assets/builtin/        CC0 starter figures (MakeHuman/MPFB), props, HDRIs
  docs/                  import guides, architecture notes
```

---

## 12. Quality targets

| Area | Target |
|---|---|
| Posing frame rate | 60 fps with 2 figures on a mid-range GPU (e.g. RTX 3060 / M1) |
| Cloth | About 20k simulated vertices at 30+ fps on WebGPU |
| Settle | Finishes in 3 seconds or less for one figure with clothing |
| Import | A Genesis 8 FBX with textures imported in under 30 seconds |
| Memory | Warn before going past roughly 2 GB of GPU memory |
| Browsers | Latest Chrome/Edge (full), Safari and Firefox (full where WebGPU is on; otherwise reduced) |

### Testing
- Unit tests for rig mapping, IK, joint limits, importers, and serialization.
- A **golden test set** of real files (Daz G8 FBX, G9 glTF, VaM `.var`, VRM, Mixamo, MD garment): each must import, map, and pose correctly.
- Screenshot tests for rendering and study modes.
- Physics regression scenes (sitting in a chair, lying on the floor, a skirt in a seated pose) checked for penetration and stability.

---

## 13. Content policy, safety, and legal

- **18+ age gate** on first launch, explaining that the app shows nudity for anatomy reference.
- Everything stays local: no uploads, accounts, or sharing in v1.
- **Terms of use:** adult figures only; sexualized depictions of minors are prohibited. Users are responsible for having the right to use the files they import.
- **No bundled third-party content.** Built-ins are original or CC0.
- Licenses recorded from `.var` metadata are shown in the Library.
- Professional art-reference framing throughout.
- Legal review before launch, especially the Daz Interactive License question and the terms of use.

---

## 14. Roadmap

Each phase ends with something usable. Week estimates assume one full-time developer.

### Phase 0: Foundation (about 2 weeks)
- [ ] Monorepo, Vite, React shell, panel layout, themes
- [ ] three.js WebGPU viewport with WebGL2 fallback, orbit camera, view cube, grid, floor
- [ ] Scene store, undo/redo, autosave to IndexedDB/OPFS
- [ ] Age gate, terms screen
- [ ] Load a bundled CC0 figure
- **Done when:** the app opens with a figure, the user can orbit it, and the scene saves and reloads.

### Phase 1: Import and posing MVP (about 5 weeks)
- [ ] Drag-and-drop, file/folder pickers, zip unpacking, import wizard, Library panel
- [ ] glTF, FBX, OBJ, VRM, DAE/STL/PLY importers; mesh and texture optimization in workers
- [ ] Canonical rig with Daz G8/G9, VaM-export, Mixamo, CC4, and VRM maps, plus the manual mapping wizard
- [ ] Joint handles, rotation gizmo, IK effectors, pins, joint limits, mirror, hand presets, morph sliders
- [ ] Pose library and BVH/VRMA pose import
- [ ] Props (visual only), lighting presets, lens/ortho cameras, study modes (clay, silhouette, notan)
- [ ] Screenshot capture; Daz export guide
- **Done when:** a Daz G8 FBX and a Mixamo character are imported, posed convincingly with IK and limits, lit, and captured.

### Phase 2: Physics and cloth (about 8 weeks)
- [ ] Jolt worker, automatic ragdoll, muscle motors, Settle and Live modes
- [ ] Prop colliders (primitives, hulls, V-HACD), physics materials
- [ ] Spring-bone soft tissue; contact compression
- [ ] XPBD cloth on WebGPU with CPU fallback: body collision field, friction, pins, fabric presets, drape from rest, simulation proxy
- [ ] Marvelous Designer OBJ + XML import
- [ ] Balance overlay (center of gravity)
- **Done when:** a figure Settles into an imported chair with thighs compressing on the seat, and a shirt and skirt drape realistically in that pose.

### Phase 3: Native Daz and VaM (about 6 weeks)
- [ ] Library folders with indexing and re-scan
- [ ] Daz `.duf/.dsf` reader: figures, shape morphs, corrective morphs, wardrobe (including dForce settings), hair, materials, poses
- [ ] VaM `.var` and install-folder reader: looks, morphs, clothing, hair, textures, licenses, dependencies
- [ ] Cloth self-collision, multiple garment layers, cloth on props (a sheet on a bed)
- **Done when:** a Genesis 9 figure with a dForce dress, and a VaM look with clothing, load straight from the user's folders with no Blender step.

### Phase 4: Realism and reference tools (ongoing)
- [ ] Tetrahedral XPBD flesh, soft props (mattress, cushions)
- [ ] Better skin shading; hair strand/card physics
- [ ] Muscle-group overlays, planes study mode, turnaround sheets, gesture-drawing mode

### Phase 5 (optional)
- [ ] Desktop app (Tauri) for very large libraries
- [ ] WebXR: pose figures in VR
- [ ] Simple timeline for pose-to-pose motion studies

### Prototype the hardest parts first
Before Phase 1 is finished, build two throwaway prototypes to prove the risky tech:
1. **Ragdoll Settle:** a Jolt ragdoll holding a pose with motors and sitting on a box.
2. **GPU cloth:** a XPBD skirt on WebGPU colliding with an animated capsule body at 30+ fps.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Daz/VaM formats are undocumented and change | Standard formats work first; native readers are additive. Golden test files catch breakage. |
| Heavy meshes and textures exhaust browser memory | Decimation, KTX2, LODs, morph pruning, memory warnings, quality levels |
| Cloth instability (explosions, poke-through) | Small substeps, thick collision fields, drape from rest, velocity clamping, "reset cloth" button |
| Daz bend/twist rigs deform poorly | Dedicated twist splitting; corrective morphs in Phase 3 |
| WebGPU missing or buggy on a device | WebGL2 render fallback and CPU cloth at lower resolution |
| Browser file-access differences (Safari/Firefox lack persistent folder access) | Manual re-scan; drag-and-drop always works; Tauri desktop option later |
| Legal and hosting issues around NSFW and licensed content | Local-only, nothing bundled, age gate, clear terms, legal review |

---

## 16. Open decisions for the owner
1. **App name and branding.** "Poser" is already the name of a commercial product, so a different public name is probably needed.
2. **Target hardware:** desktop only, or tablets (touch posing) too?
3. **Business model:** free, one-time purchase, or subscription? This affects the desktop wrapper and licensing work.
4. **Built-in content:** are CC0 MakeHuman/MPFB starter figures enough, or should we commission original realistic figures?
5. **Priority:** if the timeline gets tight, is native Daz/VaM import (Phase 3) or physics realism (Phase 2/4) more important?

---

## Sources
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
