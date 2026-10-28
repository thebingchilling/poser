# Poser: plan for a physics-based anatomy reference poser on the web

## 1. What we're building

A browser app for artists who need **realistic human anatomy reference** in 3D. Users:

1. **Import** realistic figures, including fully nude/anatomically complete ones (Daz3D Genesis 8/8.1/9 exports, Virt-a-Mate assets, VRM, Mixamo/CC4/Unreal-style rigs, generic glTF/FBX/OBJ).
2. **Pose** them with joint handles, like VRM Posing Desktop: FK rotation rings, IK end-effectors, pins, mirroring, hand presets, and a pose library.
3. **Apply real physics.** Gravity and contact settle the body against the floor and props, soft tissue compresses and jiggles, and **cloth drapes and collides** realistically.
4. **Import other objects** (chairs, beds, weapons, props, environments) that the figures and cloth collide with.
5. **Frame and light** the scene like a photo shoot, then capture reference images.

Non-goals for v1: animation timelines, multiplayer, a public content marketplace, and hosting third-party assets.

### Guiding principles
- **Local-first and private.** All imported files stay in the user's browser (OPFS/IndexedDB). Nothing is uploaded. This protects users with NSFW content and keeps us out of redistributing licensed assets.
- **Bring your own assets.** We ship a few original/CC0 base figures. Users import what they own.
- **Anatomy first.** Joint limits, proportions, and lighting presets serve figure drawing, not games.

---

## 2. Research findings that shape the design

| Topic | Finding | Consequence |
|---|---|---|
| **Daz3D → web** | There is no official glTF export. The common routes are Daz Studio FBX export, or the **Diffeomorphic** Blender add-on followed by Blender's glTF export with shape keys enabled. Genesis 9 has known pain points: HD mesh, armature scaling, and some FBX hair/shoe issues. | v1 accepts **user-exported FBX/glTF** and provides a "Daz export guide" page. A native DSF/DUF parser is a later phase (DSF/DUF files are gzipped JSON, so it is feasible). |
| **Daz licensing** | Daz requires an **Interactive License** whenever its 3D data is used *in an application* rather than as rendered images, and not every product offers one. | **We never bundle or host Daz content.** Users import their own files locally for personal reference. Shipping Daz figures as built-in content would need per-product Interactive Licenses. *(Not legal advice; get it reviewed before launch.)* |
| **Virt-a-Mate** | `.var` packages are zip archives with a `meta.json`, plus morphs, clothing, textures, and scene JSON. Blender can't read them natively. VaM 1.x figures are built on Daz Genesis 2, and the **base mesh is not in the `.var`**; it comes from the VaM install. | Build a `.var` reader (zip → parse `meta.json` → extract textures, clothing meshes, morph deltas). Apply morphs only on top of a matching base mesh that the user supplies. Respect each package's license field. |
| **Physics engine** | Among maintained WASM engines, **Jolt (JoltPhysics.js)** has rigid bodies, ragdolls with motors, constraints, *and* soft bodies. **Rapier** is fast but has no soft bodies. | **Jolt** handles rigid bodies, ragdolls, and props. Cloth uses a custom GPU solver (next row). |
| **Cloth in the browser** | There is no mature, reusable WebGPU XPBD cloth library. Demos exist (jspdown/cloth uses XPBD with small steps entirely on the GPU) and three.js TSL compute examples exist. | **Write our own XPBD cloth solver** in three.js TSL/WebGPU compute, with a CPU worker fallback for browsers without WebGPU. |
| **WebGPU support** | Chrome 113+, Safari 17.4+, and Firefox (enabled by default from late 2025). | WebGPU is the primary renderer and compute target. WebGL2 is the fallback with reduced cloth resolution. |
| **Marvelous Designer** | OBJ export works in other tools, and an optional XML sidecar carries pattern, physical properties, and sewing data. Units default to millimetres. | Import MD OBJ garments, auto-detect mm scale, and map MD fabric properties onto our presets when the XML is present. |

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language/build | TypeScript, Vite, pnpm workspaces | Fast dev loop; monorepo for engine and UI |
| UI | React + Zustand, Radix UI primitives | Panels, outliner, property inspector |
| Rendering | **three.js** `WebGPURenderer` (auto-fallback to WebGL2), TSL node materials | Mature loaders (GLTF, FBX, OBJ, VRM via `@pixiv/three-vrm`), GPU compute |
| Skin shading | Physically based skin: subsurface scattering approximation, detail normals, roughness/specular maps from Daz/VaM textures | Realism matters for anatomy reference |
| Physics | **JoltPhysics.js** (WASM, in a Web Worker) | Ragdolls, motors, constraints, soft bodies, convex hulls |
| Cloth | Custom **XPBD on WebGPU compute**; CPU fallback in a worker | Nothing off the shelf fits |
| Soft tissue | Phase 1: spring bones. Phase 4: XPBD tetrahedral flesh | Incremental realism |
| IK | Custom solver: FABRIK for chains, analytic two-bone IK for limbs, full-body pass with pins | Pose-tool feel |
| Asset processing | `meshoptimizer` (wasm), Basis/KTX2 encoder (wasm), `fflate` for zip/gzip, V-HACD (wasm) for convex decomposition | Daz meshes and textures are huge |
| Storage | OPFS for asset blobs, IndexedDB for metadata/scenes | Local-first, large files |
| Testing | Vitest (unit), Playwright (E2E plus screenshot diffs) | |
| Deploy | Static hosting (Cloudflare Pages or Netlify) plus COOP/COEP headers for `SharedArrayBuffer` | Fully client-side, cheap |

---

## 4. Architecture

```
┌──────────────────────────── Main thread ─────────────────────────────┐
│ React UI (outliner, inspector, pose library, import wizard)          │
│        │                                                             │
│ Scene Store (Zustand) ── single source of truth (serializable JSON)  │
│        │                                                             │
│ Viewport: three.js WebGPURenderer, gizmos, IK handles, overlays      │
│        │                 ▲                                           │
│        ▼                 │ SharedArrayBuffer transforms              │
├──────────────────────────┼───────────────────────────────────────────┤
│ Physics Worker (Jolt)    │      GPU: Cloth XPBD compute (TSL)        │
│  ragdoll, props, contacts│      body SDF/capsule collision           │
├──────────────────────────┴───────────────────────────────────────────┤
│ Import Worker(s): parse → normalize rig → decimate/LOD → KTX2        │
│                   → write to OPFS asset library                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Core modules (`packages/`)
- `core`: scene graph schema, units (1 unit = 1 m, Y-up), undo/redo command stack, serialization.
- `importers`: one adapter per format, all producing a common `ImportedAsset`.
- `rig`: canonical humanoid skeleton, retarget maps, joint-limit tables, mirror tables.
- `posing`: FK gizmos, IK solvers, pins, pose library, hand/face presets.
- `physics`: Jolt worker, ragdoll builder, prop colliders, settle/simulate modes.
- `cloth`: XPBD solver, garment preparation, fabric presets, body collider.
- `softtissue`: spring bones, later tet-mesh flesh.
- `render`: materials (skin, eye, hair, cloth), lighting rigs, camera presets, overlays.
- `app`: the React shell.

### The canonical rig (the key abstraction)
Every humanoid is mapped onto a **canonical skeleton** that uses the VRM humanoid bone names (hips, spine, chest, upperChest, neck, head, shoulder/upperArm/lowerArm/hand, 15 finger bones per hand, upperLeg/lowerLeg/foot/toes), plus optional anatomy bones (breasts, glutes, belly, genitals) for soft tissue. Bone-name maps, auto-detected by matching names:

| Source | Example native names |
|---|---|
| Daz Genesis 8/8.1 | `hip`, `pelvis`, `abdomenLower`, `chestUpper`, `lShldrBend`/`lShldrTwist`, `lForearmBend`, `lThighBend` |
| Daz Genesis 9 | `hip`, `pelvis`, `spine1–4`, `l_upperarm`, `l_forearm`, `l_thigh` (plus twist bones) |
| VaM (Genesis 2) | `hip`, `abdomen`, `chest`, `lShldr`, `lForeArm`, `lThigh` |
| Mixamo | `mixamorig:Hips`, `mixamorig:LeftArm`, … |
| VRM | Already canonical |
| CC4 / Unreal | `CC_Base_*`, `pelvis`/`spine_01`/`upperarm_l` |

Daz **bend/twist bone pairs** are handled by driving both from a single canonical rotation, splitting the swing onto the bend bone and the twist onto the twist bone. This is what makes Daz figures deform correctly.

If no map matches, the user assigns bones manually in a wizard, as VRM tools do.

---

## 5. Import pipeline

```
File(s) dropped → sniff format → adapter → ImportedAsset
  → rig detection + retarget map
  → mesh processing (merge, weld seams, LOD 0/1/2, meshopt compress)
  → textures → KTX2 (UASTC for normals/skin, ETC1S for the rest)
  → morph targets: keep the useful ones, bake the rest
  → generate physics data (ragdoll capsules, body SDF, prop hulls)
  → store in OPFS library with a thumbnail
```

| Format | v1? | Notes |
|---|---|---|
| glTF/GLB | ✅ | Primary format. Keep shape keys. |
| FBX | ✅ | three.js FBXLoader. Fix units (cm → m) and axis. |
| OBJ (+MTL) | ✅ | Props and Marvelous Designer garments (auto mm → m). |
| VRM 0.x/1.0 | ✅ | `three-vrm`. Spring bones map directly onto our spring-bone system. |
| DAE, STL, PLY | ✅ | Props only. |
| Daz `.duf/.dsf` | Phase 3 | Gzipped JSON. Parse geometry, skin weights, morph deltas, and materials from a user-pointed Daz content folder (File System Access API). |
| VaM `.var` | Phase 3 | Zip reader. Extract textures, clothing, and morph deltas. Needs a user-supplied Genesis 2 base. Show each package's license. |
| Marvelous Designer XML sidecar | Phase 2 | Map fabric physical properties onto our cloth parameters. |

**Daz export guide (in-app help, v1):** step by step for Daz Studio → FBX (Genesis 8: base resolution, merge fitted clothing *off*, include morphs), and the Diffeomorphic → Blender → glTF path for Genesis 9.

**Performance budget:** a Genesis 9 figure at its HD level is too heavy for real time. Import defaults to the base-resolution mesh (or decimates to roughly 50–80k triangles) and uses normal maps to keep the detail. Textures are capped at 4K and downscaled to 2K on low-memory devices.

### 5.1 Getting models from online sources

The goal is to import models people post online and, where possible, download straight from official libraries. Here is how realistic each source is:

| Source | Content | Official API? | Realistic? | Plan |
|---|---|---|---|---|
| **Sketchfab** | Huge mix, including realistic and adult-flagged figures and props | ✅ **Download API**: OAuth login, glTF/GLB/USDZ, per-model license | **Yes** | **In-app browser:** search → pick → download glTF → import. The user signs in with their own Sketchfab account; downloads without a user login need a contract with Sketchfab. Show the license and attribution. Whether adult-flagged models come through the API is unverified, so test this early. |
| **Poly Haven** | CC0 props, HDRIs, textures | ✅ Public API, no key (per a third-party scraper; check Poly Haven's own docs) | **Yes, easy** | Built-in prop/HDRI browser. CC0, so the assets can even be cached and hosted by us. |
| **VRoid Hub** | Anime-style VRM avatars | ✅ OAuth API, but **apps need approval**; unapproved apps are restricted and rate-limited | Yes, but low priority | Not realistic-anatomy content. Add later if wanted; honor each creator's usage permissions. |
| **Daz3D store** | Genesis figures, morphs, clothing | ❌ No public download API. Downloads are tied to the user's account via Daz Install Manager | **Not directly** | **Read the user's local Daz content library** (folder picker via the File System Access API). The user installs content with Daz's own tools, and we read it from disk. This is the realistic "official library" path. |
| **Virt-a-Mate Hub** | `.var` looks, clothing, morphs | ❌ No documented public API. VaM's in-game browser talks to the Hub, but that interface is undocumented | **Only with permission** | v1: the user downloads `.var` files (or points us at their VaM `AddonPackages` folder). Ask the Hub operators for permission or an API before automating anything; don't scrape. |
| **CGTrader, TurboSquid, Renderosity, ArtStation, Booth, Patreon, Gumroad, forums** | Paid and free models | ❌ No download APIs | Manual only | The user downloads the file, then drags it in or the app picks it up from a watched folder. |
| **Any URL** | Direct file links | n/a | **Partly** | Browsers block cross-site downloads (CORS) for most hosts. Support pasting a direct link only for hosts that allow it, such as GitHub raw files. A server proxy that fetches for users is technically possible, but it would make us the downloader and is a legal risk (below). |

**Making manual downloads painless (Phase 1):**
- Drag and drop files, folders, or zips anywhere in the app. Zips, `.var` files, and Daz-style `.zip` installers are unpacked automatically.
- **Watched folders:** the user grants access to a folder, such as Downloads, a Daz library, or VaM `AddonPackages`. New models show up in the library automatically (Chromium browsers; other browsers use a re-scan button).
- **Auto-detection:** recognize what a file is (figure, garment, morph, prop, pose) and which base figure it needs, such as "Genesis 8 Female clothing" or "VaM look that needs the G2F base".
- **Dependencies:** a `.var` lists its dependencies in `meta.json`, and Daz content references its base figure. Show what's missing and where it usually comes from.
- **License panel:** record the source, license, and author for every imported asset, and show it in the library.

**Piracy and legal guardrail:** many "free Daz/VaM" sites re-host paid content without permission. The app should not integrate with, link to, or proxy those sites, and in-app browsing only covers sources with explicit licenses (Sketchfab, Poly Haven, VRoid Hub). What a user imports from their own disk is their responsibility under the terms of service. This keeps us clear of DMCA trouble and of the Daz and VaM creators whose work people will want to use.

---

## 6. Posing system (the "VRM Posing Desktop" feel)

- **Joint handles:** clickable spheres on every canonical joint. Click to select, then use the rotation gizmo (local, parent, or world space).
- **IK effectors:** hands, feet, hips, head, and gaze target. Drag an effector and the chain follows (two-bone analytic IK for limbs, FABRIK for the spine and neck, then a full-body balance pass).
- **Pins:** lock a hand or foot in world space while moving the hips, for example to keep feet planted.
- **Anatomical joint limits:** per-joint range-of-motion table (swing cone plus twist range) based on clinical ROM data. Toggle between *Realistic*, *Flexible* (gymnast), and *Unlimited*. Handles turn orange near the limit.
- **Mirror:** copy left↔right, or flip the whole pose.
- **Hands:** preset grips (relaxed, fist, point, pinch, open, grip-cylinder) plus a per-finger curl/spread slider panel.
- **Face/expressions:** imported morphs exposed as sliders, plus eye gaze.
- **Pose library:** save, load, and thumbnail poses as canonical JSON, so a pose made on a Daz figure applies to a VRM or Mixamo figure. Import/export `.vrma`/BVH single-frame poses.
- **Undo/redo** on every handle drag.
- **Multi-figure:** select and pose several figures, with contact between them in physics modes.

---

## 7. Physics

### 7.1 Three modes
| Mode | What happens | Use |
|---|---|---|
| **Pose** (default) | Kinematic, no simulation | Precise posing |
| **Settle** | The ragdoll runs with **joint motors driving toward the current pose**, under gravity, for a few seconds, then freezes. Limbs rest on the floor and props instead of floating; a reclining figure actually lies on the bed. | "Make it physically plausible" button |
| **Live** | Continuous simulation. Drag a body part and the rest reacts (motor strength slider from limp to stiff). | Exploring natural drapes and falls |

### 7.2 Ragdoll
- Auto-generated from the canonical rig: capsules and convex hulls sized from the skin-weighted vertices of each bone.
- Jolt `SwingTwistConstraint` per joint, with limits from the ROM table.
- Motors are set by a "muscle tone" parameter, and per-limb overrides allow e.g. a limp arm.
- Mass distribution follows anthropometric segment percentages (de Leva tables).

### 7.3 Props and environment
- Imported objects get colliders automatically: a primitive fit, a convex hull, or **V-HACD convex decomposition** for concave objects such as chairs and sofas.
- Static, dynamic, or kinematic. Mass and friction come from material presets (wood, metal, foam, fabric-covered).
- Soft props (mattress, cushion) are Jolt soft bodies in phase 4.

### 7.4 Soft tissue
- **Phase 1:** spring-bone (jiggle) chains on breasts, glutes, belly, and thighs, using the VRM spring-bone model, plus collision with body capsules. Settles realistically under gravity: breasts fall differently lying down than standing.
- **Phase 2:** **contact compression.** Where the body touches the floor, a prop, or another body, vertices are pushed out of the contact SDF and the bulge is spread to neighbours (GPU vertex pass). Thighs flatten on a chair; a cheek squashes against a hand.
- **Phase 4:** **volumetric flesh.** A coarse tetrahedral mesh per figure between bone and skin, simulated with XPBD (volume preservation plus a skinning attachment constraint), then embedded back onto the render mesh. This gives true sag, compression, and wobble.

---

## 8. Cloth simulation

### 8.1 Solver
- **XPBD** with substeps ("small steps") on WebGPU compute: stretch, shear, and bending (dihedral or isometric) constraints, plus long-range attachments to stop over-stretching.
- Graph-coloured constraint batches for parallel Gauss-Seidel.
- **Collision:** body as a low-res signed distance field (rebuilt per pose from the skinned mesh in a compute pass) plus capsules for speed. Props via SDF or hulls. Self-collision with a spatial hash (phase 2).
- **Friction** between cloth and skin, so a shirt doesn't slide off the shoulders.
- **Sim/render split:** simulate a remeshed proxy of 5–20k vertices and drive the high-res render mesh by barycentric embedding.

### 8.2 Garments
- Garments import as separate meshes, already fitted to a figure in rest pose (Daz, VaM, MD, or glTF).
- On import: auto-detect body attachment and skin-weight transfer from the body (fallback motion), and set **pin groups** (waistbands, straps, cuffs) painted or auto-detected.
- **Drape-from-rest** (like Daz dForce): when a pose is applied, the simulation interpolates the body from rest pose to the target over N frames while the cloth follows, which avoids interpenetration.
- Layering order: underwear → shirt → jacket, enforced by collision offsets.

### 8.3 Fabric presets
Cotton, silk/satin, denim, leather, spandex/lycra, wool knit, chiffon, latex. Each sets stretch/shear/bend stiffness, density (g/m²), damping, friction, and thickness. Imports MD physical properties when the XML sidecar is present.

---

## 9. Rendering and reference tools

- **Skin:** subsurface scattering approximation, detail normals, translucency for ears and fingers, and Daz/VaM texture channel mapping (diffuse, translucency, specular/roughness, normal, bump → normal).
- **Lighting presets:** Rembrandt, loop, split, butterfly, rim/back, overcast, harsh sun, plus HDRI environments. Light gizmos.
- **Cameras:** focal-length presets (24/35/50/85/135 mm), orthographic front/side/top, saved camera bookmarks, rule-of-thirds overlay.
- **Anatomy overlays:** toggle skeleton and muscle-group overlays (later: an optional écorché layer if a licensed or CC asset exists), proportion grid in head units, center-of-gravity and support-polygon display (shows whether a pose is balanced).
- **Study modes:** silhouette, 2- and 3-value notan, clay shading (removes texture), and line/contour.
- **Output:** PNG screenshots at arbitrary resolution with transparent background, turnaround sheets (8 angles), and a gesture-drawing timer mode (random pose and camera every N seconds).

---

## 10. Content policy, safety, and legal

- **18+ age gate** on first launch, with the reason (nudity for anatomy reference).
- **No server-side storage of user content** in v1. Scenes export and import as files.
- **Hard rule:** the app is for adult figures. The terms prohibit sexualized depictions of minors. If sharing or a gallery is ever added, it needs moderation, reporting, CSAM hash matching, and a ban on real-person likeness without consent.
- **Licensing:** never bundle Daz/VaM/MD content. Show each `.var` license on import. Built-in figures and props are original or CC0. Have counsel review the Daz Interactive License situation before any feature that shares scenes containing Daz geometry.
- Keep the app in a neutral, professional art-reference framing (it helps with hosting providers and app stores).

---

## 11. Roadmap

Each phase ends with something usable.

### Phase 0: Foundation (2 weeks)
- Monorepo, Vite, React shell, three.js WebGPU viewport with WebGL2 fallback, orbit camera, grid, and lighting.
- Scene store, undo/redo, OPFS asset library, age gate.
- **Exit:** load a GLB, orbit it, save and reload the scene.

### Phase 1: Posing MVP (4–5 weeks)
- Drag-and-drop (files, folders, zips), watched folders, asset library with license/source records.
- glTF/FBX/OBJ/VRM importers, canonical rig with Daz G8/G9, Mixamo, and VRM maps, plus the manual mapping wizard.
- FK gizmos, IK effectors, pins, joint limits, mirror, hand presets, pose library.
- Prop import (static colliders not needed yet), lighting and camera presets, screenshot export.
- **Exit:** import a Daz G8 FBX and a Mixamo character, pose both convincingly, and save reference shots.

### Phase 2: Body physics plus first cloth (6–8 weeks)
- Jolt worker, auto ragdoll, Settle and Live modes, prop colliders (V-HACD).
- Spring-bone soft tissue and contact compression.
- XPBD cloth v1: body SDF collision, pins, fabric presets, drape-from-rest, MD OBJ plus XML import.
- In-app browsers: Sketchfab (OAuth Download API) and Poly Haven (props/HDRIs).
- **Exit:** a figure sits in an imported chair via Settle; a shirt and skirt drape correctly in a seated pose.

### Phase 3: Native asset ecosystems (5–6 weeks)
- Daz DSF/DUF reader reading the user's installed Daz content library folder, including morph sliders and dForce garments.
- VaM `.var` reader: clothing, morphs, textures, license display, dependency check; `AddonPackages` folder support.
- Contact the VaM Hub operators about an official API or permission; integrate only if granted.
- Cloth self-collision, multi-layer garments, cloth-on-prop (a sheet on a bed).
- **Exit:** a Daz G9 figure plus dForce dress imported directly from a content folder, with no Blender.

### Phase 4: Realism (ongoing)
- Tetrahedral XPBD flesh, soft props (mattress, cushions), better skin shading, hair cards with simple strand physics.
- Anatomy overlays (skeleton and muscles), balance display, gesture-drawing mode, turnaround sheets.

### Phase 5 (optional): Desktop or VR
- Tauri wrapper for big local libraries; WebXR to pose in VR.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Daz/VaM formats are undocumented or changing | Lean on user-exported FBX/glTF first; native parsers are additive, not blocking |
| Mesh and texture size (G9 HD, 4K textures) | Decimate, KTX2, LOD, and morph pruning at import; memory budget warnings |
| Cloth stability (explosions, tunnelling) | Substepping, SDF collision with thickness, drape-from-rest, max-velocity clamp, "reset cloth" button |
| WebGPU gaps on some devices | WebGL2 fallback; CPU cloth at reduced resolution in a worker |
| Licensing and NSFW hosting issues | Local-only, no bundled third-party content, age gate, legal review |
| Bend/twist rigs deforming badly when posed | Dedicated Daz twist-split logic; corrective morph (JCM) support in Phase 3 |

---

## 13. Proposed repo layout

```
poser/
  apps/web/                # React app (Vite)
  packages/core/           # scene schema, commands, serialization
  packages/importers/      # gltf, fbx, obj, vrm, daz, vam, md
  packages/rig/            # canonical skeleton, retarget maps, ROM tables
  packages/posing/         # gizmos, IK, pose library
  packages/physics/        # Jolt worker, ragdoll, props
  packages/cloth/          # XPBD WebGPU solver + CPU fallback
  packages/softtissue/     # spring bones, contact compression, tet flesh
  packages/render/         # materials, lighting, overlays, capture
  assets/builtin/          # original/CC0 base figures, props, HDRIs
  docs/                    # import guides (Daz, VaM, MD), architecture notes
```

## 14. Immediate next steps
1. Scaffold Phase 0 (monorepo, viewport, scene store).
2. Collect test assets: one Daz G8 FBX export, one G9 via Diffeomorphic → glTF, one VRM, one Mixamo FBX, one MD garment.
3. Spike two risky pieces in parallel: (a) Jolt ragdoll Settle mode on a canonical rig, and (b) an XPBD cloth prototype on WebGPU with capsule collision.

## Sources
- Sketchfab Download API: https://api.sketchfab.com/developers/download-api
- VRoid Hub API: https://developer.vroid.com/en/api
- Poly Haven FAQ (CC0): https://docs.polyhaven.com/en/faq
- Poly Haven API (third-party note): https://apify.com/crawlerbros/polyhaven-scraper
- Daz re-download policy (forum): https://forum.daz3d.com/forums/discussion/674336/our-daz3d-files
- Daz Interactive License: https://www.daz3d.com/interactive-license-info
- Genesis 9 and exporters (Daz forums): https://forum.daz3d.com/forums/discussion/comment/7716386/ and https://forum.daz3d.com/forums/discussion/641041/g9-diffeomorphic-general-help
- PlayCanvas notes on Ammo alternatives (Rapier/Jolt): https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/
- XPBD WebGPU cloth demo: https://github.com/jspdown/cloth
- WebGPU mass-spring cloth paper: https://arxiv.org/html/2507.11794v1
- WebGPU browser support overview: https://blog.codercops.com/blog/webgpu-browser-gpu-compute-2026
- Marvelous Designer OBJ export/import: https://support.marvelousdesigner.com/hc/en-us/articles/360037330751 and https://support.marvelousdesigner.com/hc/en-us/articles/47358223288601
- MD → Daz scale notes: https://www.versluis.com/2015/03/how-to-export-a-garment-from-marvelous-designer/
