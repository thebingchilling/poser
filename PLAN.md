# Poser: app plan

A web app that is a **realistic, physics-based NSFW figure modeller and anatomy study tool**. It leans toward adult/NSFW use, with anatomy study as a strong secondary purpose. Artists import their own figures (Daz3D, Virt-a-Mate, VRM, generic rigs), clothing, and props. They pose figures with joint handles like VRM Posing Desktop, let real physics settle bodies, soft tissue, and cloth, explore the anatomy underneath layer by layer, cut into it, add realistic fluids, fine-tune expressions and body states, use objects such as toys, ropes, restraints, and latex, then light, frame, and capture images.

> **Website only, private use:** a browser app for personal use and a few invited users. Not published publicly and not paid. Desktop Chrome/Edge with WebGPU is the only target.
>
> **Status:** planning only. Nothing gets built until the go-ahead.
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
- Pose from photo/webcam, body customization (tattoos, piercings, hair), privacy features (app lock, panic key), and backups (section 16).

### Out of scope for v1
- Any online model sources, cloud sync, or server-side sharing (users share files directly, section 16.7).
- Public release, payments, and browsers without WebGPU.
- Animation timelines (single poses only; a timeline may come later).
- Phones and tablets (desktop only).

### Principles
1. **Local-first and private.** Files never leave the device. Storage is the browser's private file system (OPFS) plus IndexedDB.
2. **Bring your own assets.** No third-party content is bundled. Built-in content is original or CC0 only.
3. **Realism first.** Realistic bodies, skin, soft tissue, contact, and fluids take priority over game-style features. Anatomy accuracy matters where it's visible or felt (shape, flesh behavior, genitals, cut surfaces); deep internal detail is lower priority.
4. **Female-first.** Defaults, templates, tests, and quality bars are set on female figures first, then extended to male.
5. **Never block on exotic formats.** Standard formats (glTF/FBX/OBJ/VRM) work from day one; native Daz/VaM reading is added on top.

---

## 2. Key research findings

| Topic | Finding | Consequence |
|---|---|---|
| **Daz3D files** | There's no official glTF export. The common routes are Daz Studio → FBX, or the Diffeomorphic add-on → Blender → glTF. Genesis 9 has known export issues (HD mesh, armature scaling, some hair/shoe problems). Daz's native `.dsf/.duf` files are gzipped JSON. | v1 imports user-exported FBX/glTF and ships an in-app export guide. Phase 3 adds a native reader for the user's installed Daz library folder. |
| **Daz licensing** | Using Daz 3D data inside an application (rather than as renders) needs an **Interactive License**. | Never bundle or host Daz content. Users load their own files locally. *(Not legal advice; get it reviewed before launch.)* |
| **Virt-a-Mate** | `.var` packages are zip files with a `meta.json` (license, dependencies), plus morphs, clothing, and textures. VaM 1.x figures use a Daz Genesis 2 base mesh that **isn't inside the packages**. | Read `.var` zips and the VaM install folder. Apply morphs and clothing onto the base mesh from the user's own VaM install. |
| **Physics engine** | Jolt (WASM) has rigid bodies, ragdolls with motors, constraints, and soft bodies. Rapier has no soft bodies. | Use Jolt for bodies and props. |
| **Cloth** | There is no mature, reusable browser cloth library; only demos (XPBD on WebGPU, mass-spring papers). | Write our own XPBD cloth solver on WebGPU compute. |
| **WebGPU** | Available in Chrome, Edge, Safari 17.4+, and Firefox (default since late 2025). | With only a few known users, require WebGPU (desktop Chrome/Edge) and skip WebGL2 and CPU fallbacks entirely. This saves significant work. |
| **Marvelous Designer** | OBJ export with an optional XML sidecar holding physical properties. Units default to millimetres. | Import MD garments with auto-scaling and fabric mapping. |
| **Anatomy data** | Z-Anatomy (CC BY-SA 4.0), built on BodyParts3D (CC BY-SA 2.1 JP), is a complete labelled 3D anatomy, mostly from one male body. The NIH Visible Human cross-sections are free to use with acknowledgment since 2019. | Bundle a fitted version of Z-Anatomy with attribution; build or commission a female template; use Visible Human as the cut-surface reference. |
| **Mesh cutting** | Manifold (`manifold-3d`) is a WASM library with guaranteed-correct booleans, but it needs closed (watertight) meshes. | Use it for cuts; generate watertight cutting versions of skin at import. |
| **Fluids** | WebGPU MLS-MPM demos simulate around 100k particles in real time in the browser, and MPM avoids SPH's neighbor-search cost. | Use MLS-MPM for particle fluids plus a texture-space surface-flow method for thin films. |
| **Face rigs** | No openly licensed FACS template face was found. | Map existing Daz/ARKit face rigs; build or commission our own FACS template. |
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
1. **First run:** sign in through the invite gate → set an app lock → short tour → a scene with a built-in CC0 figure, so posing can be tried immediately.
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
- **Hands and feet:** presets plus per-joint fine-tuning (section 13).
- **Face:** full FACS expression system (section 13).
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
Cotton, jersey/T-shirt, silk/satin, denim, leather, spandex/lycra, wool knit, chiffon, and latex. Each preset sets stretch, shear, bend stiffness, weight (g/m²), damping, friction, and thickness. Values from the Marvelous Designer XML are used when present. Advanced sliders allow fine-tuning.

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
- **Template:** Z-Anatomy (CC BY-SA 4.0), built on BodyParts3D (CC BY-SA 2.1 Japan). It is a complete, labelled, open human anatomy model. Both licenses allow bundling with attribution; share-alike applies to our edited anatomy meshes, not to the app's code.
- **Main gap:** this data is mostly based on one male body, so it becomes the **male** template and a reference for muscle names and structure. The **female template is built separately and first** (section 10). Fat layer thickness maps and bone interiors also need to be authored for both.
- **Cross-section textures:** the NIH Visible Human Project (male and female photographic cross-sections, free to use with acknowledgment of the National Library of Medicine since 2019) is the reference for realistic cut-surface textures.

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

### 10.2 Sources for building it
No openly licensed, complete female anatomy model exists, so the plan combines several sources:
1. **NIH Visible Human Female** (main source): 0.33 mm photographic cross-sections plus CT and MRI of a real female body, free to use with acknowledgment. Tissues are segmented from these slices into 3D meshes.
2. **TotalSegmentator** (Apache 2.0 software) automatically segments 104 structures from CT (bones, organs, some muscles), which speeds up the work. Most muscles, breast tissue, and reproductive and pelvic-floor structures still need manual segmentation.
3. **Z-Anatomy (male)** as the reference for muscle naming and structure, transferred onto the female skeleton and then corrected by hand.
4. **Anatomy references** (atlases, photo references) for what imaging doesn't resolve well (clitoral anatomy, breast ligaments, pelvic floor, external genital variation).
5. **Optional purchase:** commercial female anatomy models (e.g. TurboSquid, CGTrader, RenderHub), only if their license allows embedding in an application. Most standard licenses don't, so check each one.
6. NIH 3D's female pelvis model is CC BY-NC-SA (non-commercial), so it can be a visual reference only, not shipped in a commercial app.

**Who builds it:** a 3D character artist experienced with realistic anatomy and NSFW figures (contract or hire). Accuracy is checked internally against the scan data and photo references; no formal medical review. Priority goes to what is visible and drives physics: skeleton, breasts, fat, muscles near the surface, and external and internal genitalia. Deep organs (liver, intestines, lungs) can be simpler, mainly so cuts look right. Budget about 2–4 months. It is still the longest-lead item in the project.

**Limitation:** the Visible Human Female is one person (a 59-year-old woman), so the template is made parametric (section 10.3) to cover the natural range of adult female bodies.

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
- Template from Z-Anatomy/BodyParts3D, with fat and bone-interior data authored the same way.
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
- **Cap surfaces:** each structure's cut face gets its own material: skin, fat lobules, muscle with fibers running in the muscle's direction, tendon, bone (cortical ring, trabecular interior, marrow), organ tissue, vessel lumens. Textures are procedural with Visible Human photos as the reference.
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
- **Figures' own face rigs:** Daz Genesis 8/9 faces and ARKit's 52-shape standard map onto the action units. Figures without facial morphs get action units transferred from a template face. This template needs to be built or commissioned, since no suitable openly licensed FACS face was found.
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
- All objects use real-world units, so sizes relative to the body are accurate. A **ruler/measure tool** shows lengths, diameters, and distances.

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
- This is a lightweight alternative to a full animation timeline, which stays a later option.

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
- **Tattoos:** painted or image decals on skin that stretch and fold with it.
- **Piercings and jewelry:** attachable to ears, nose, lips, tongue, navel, nipples, and genitals, with small-scale physics (rings swing, chains hang).
- **Makeup and nails:** color and gloss layers.
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
- **Panic key:** one key instantly hides everything behind a neutral screen.
- **Neutral tab title and icon** option.
- **Encrypted local storage** (optional): the library and scenes are encrypted on disk with the passphrase, using the browser's built-in cryptography.
- **Blurred thumbnails** option in the Library.

### 16.7 Backups and sharing between the few users
- **Automatic backup** to a folder the user picks (e.g. a synced cloud folder), so browser storage being cleared doesn't lose work.
- **Sharing:** users send each other `.poser` scene files and pose/tie/preset packs as files. There is no server-side sharing, which keeps the app simple and private.
- **Preset packs:** export and import poses, expressions, tie templates, fabric and fluid presets, and lighting setups as small files.

---

## 17. Rendering and reference tools

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

## 18. Data model and storage

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

## 19. Tech stack

| Layer | Choice |
|---|---|
| Language and build | TypeScript, Vite, pnpm workspaces (monorepo) |
| UI | React, Zustand (state), Radix UI (accessible components) |
| 3D | three.js with WebGPU renderer (WebGPU required), TSL node materials; GLTF/FBX/OBJ loaders, `@pixiv/three-vrm` |
| Physics | JoltPhysics.js (WASM) in a Web Worker |
| Cloth and soft tissue | Custom XPBD on WebGPU compute |
| Cutting | Manifold (`manifold-3d`, WASM) booleans in a worker |
| Ropes | Custom XPBD rod (Cosserat) solver on WebGPU compute |
| Fluids | Custom MLS-MPM on WebGPU compute, texture-space surface flow, screen-space fluid rendering |
| Anatomy data | Z-Anatomy / BodyParts3D (CC BY-SA), fitted per figure; Visible Human as texture reference |
| Asset processing | meshoptimizer (decimation and compression), KTX2/Basis encoder, fflate (zip/gzip), V-HACD (convex decomposition), all WASM in workers |
| Storage | OPFS + IndexedDB; File System Access API for library folders |
| Testing | Vitest (unit), Playwright (end-to-end and screenshot comparison), physics regression scenes |
| Hosting and access | Static site (e.g. Cloudflare Pages) behind **Cloudflare Access** (free for teams under 50 users): only invited email addresses can open it. Security headers that enable shared memory. Search engines blocked. No backend. |
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
  assets/anatomy/        fitted-ready anatomy templates (CC BY-SA, with attribution)
  docs/                  import guides, architecture notes
```

---

## 20. Quality targets

| Area | Target |
|---|---|
| Posing frame rate | 60 fps with 2 figures on a mid-range GPU (e.g. RTX 3060 / M1) |
| Cloth | About 20k simulated vertices at 30+ fps on WebGPU |
| Settle | Finishes in 3 seconds or less for one figure with clothing |
| Import | A Genesis 8 FBX with textures imported in under 30 seconds (plus under 60 seconds for anatomy fitting) |
| Cuts | Knife or saw cut applied in under 1 second, with an instant preview |
| Fluids | About 100k particles at 30+ fps on WebGPU; surface flow always real time |
| Ropes | A full harness plus suspension (about 20 rope segments) settles in under 5 seconds |
| Memory | Warn before going past roughly 2 GB of GPU memory |
| Browsers | Latest desktop Chrome/Edge with WebGPU |

### Testing
- Unit tests for rig mapping, IK, joint limits, importers, and serialization.
- A **golden test set** of real files, mostly female (Daz Genesis 8 Female, Genesis 9 with a female shape, VaM female looks, female VRM and Mixamo figures), plus some male figures and MD garments: each must import, map, and pose correctly.
- A **female body-diversity set** (slim, curvy, heavy, muscular, large and small breasts, young adult to elderly, pregnant) for anatomy fitting and breast physics checks.
- Visual accuracy checks of the female template against the Visible Human scans and photo references.
- Contact tests: two figures pressing, hand grip on flesh, and genital contact, checked for intersections and stability.
- Object tests: rope harness and suspension, latex catsuit, soft toy insertion, wax drip, checked for slipping, intersections, and stability.
- Screenshot tests for rendering and study modes.
- Physics regression scenes (sitting in a chair, lying on the floor, a skirt in a seated pose) checked for penetration and stability.
- Anatomy fitting checks on very different body types (no bones poking through skin, sensible fat thickness), and cut tests comparing cross-sections with reference atlas slices.

---

## 21. Content policy, safety, and legal

Because the app is private (personal use plus a few invited users, not public, not paid), most commercial adult-site rules don't apply: no payment processor, no public age-verification system, no app stores. What still matters:
- **Private access:** the site sits behind Cloudflare Access with an invite list, and search engines are blocked. Only invite adults (18+).
- **Everything stays local:** user content never touches the server; the site only serves the app's code and built-in CC0/CC BY-SA assets.
- **Separate graphic-content setting:** blood, open wounds, removed body parts, and bodily fluids can be switched on or off separately from nudity (per-user preference).
- **Adult figures only:** the app has no child body proportions, and depicting minors sexually is illegal. Keep this as a hard rule for anyone invited.
- **Real people:** sexual images of real people without consent (including digital fakes) are illegal in many places, especially if shared, so the group should avoid it.
- **Licensing:** personal use of your own Daz/VaM files is the normal use case; don't pass purchased Daz/VaM content between users unless its license allows it (`.var` licenses are shown in the Library). Anatomy data is credited on an About screen as its licenses require.
- **If it ever goes public or paid,** revisit age-verification laws, payment processors (Stripe doesn't accept adult content), hosting terms, and the Daz Interactive License.

---

## 22. Roadmap

Each phase ends with something usable. Week estimates assume one full-time developer.

### Phase 0: Foundation (about 2 weeks)
- [ ] Monorepo, Vite, React shell, panel layout, themes
- [ ] three.js WebGPU viewport (WebGPU required, with a clear message otherwise), orbit camera, view cube, grid, floor
- [ ] Scene store, undo/redo, autosave to IndexedDB/OPFS
- [ ] Private access via Cloudflare Access, adults-only notice
- [ ] App lock, panic key, neutral tab option; automatic backup folder
- [ ] Load a bundled CC0 female figure (a male figure is bundled too)
- [ ] **Start the female anatomy template workstream:** contract or hire a 3D character artist; runs in parallel for about 2–4 months
- **Done when:** the app opens with a figure, the user can orbit it, and the scene saves and reloads.

### Phase 1: Import and posing MVP (about 5 weeks)
- [ ] Drag-and-drop, file/folder pickers, zip unpacking, import wizard, Library panel
- [ ] glTF, FBX, OBJ, VRM, DAE/STL/PLY importers; mesh and texture optimization in workers
- [ ] Canonical rig with Daz G8/G9, VaM-export, Mixamo, CC4, and VRM maps, plus the manual mapping wizard
- [ ] Joint handles, rotation gizmo, IK effectors, pins, joint limits, mirror, hand presets, morph sliders
- [ ] Pose library and BVH/VRMA pose import
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
- [ ] Cloth self-collision, multiple garment layers, cloth on props (a sheet on a bed)
- **Done when:** a Genesis 9 figure with a dForce dress, and a VaM look with clothing, load straight from the user's folders with no Blender step.

### Phase 4: Face, hands, feet, muscles, and body states (about 7 weeks)
- [ ] Pose, hands, and expression from photo or webcam (MediaPipe)
- [ ] Tongue posing, teeth, eye look-at and blink
- [ ] Tattoos, makeup, nails, body hair density, tan lines, scars
- [ ] FACS action-unit system with left/right sliders, presets, blending; mapping for Daz G8/G9 and ARKit 52 rigs
- [ ] Build or commission the FACS template face; transfer action units to figures without face rigs
- [ ] Wrinkle maps, blush/flush/pallor skin color maps, eyes (pupil, lids, tear film)
- [ ] Per-joint hand and foot fine-tuning, fingertip IK, grip-to-prop, foot flattening under weight
- [ ] Muscle tension per group (shape via morphs/normal maps first; full volume bulge comes with Phase 5), body fat and muscle sliders
- [ ] Genital and secondary sexual anatomy states (morph-driven first)
- [ ] State panel (cold, hot, exertion, breathing, crying, fear, embarrassment, arousal, fatigue), injury and skin decals
- [ ] Female states: pregnancy stages, postpartum/lactation, menstrual cycle, menopause and aging (morph-driven first; anatomy-driven once Phase 5 lands)
- **Done when:** a figure can be set to "crying, cold, tense" with matching face, skin, posture, and anatomy details, all fine-tunable.

### Phase 5: Anatomical layers (about 10 weeks)
- [ ] Prepare the Z-Anatomy/BodyParts3D template: clean, close every mesh, bind to the canonical rig, author fat and bone-interior data
- [ ] Integrate the finished female anatomy template (from the parallel workstream) with full breast, genital, and pelvic anatomy and variation controls
- [ ] Male template from Z-Anatomy/BodyParts3D
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
- [ ] Skin marks (pressure, impact, scratches) with time slider; clothing states (displaced, unbuttoned, torn)
- [ ] Hair grabbing, pulling, and tying
- [ ] Piercings and jewelry with small-scale physics
- [ ] Scenario snapshots
- **Done when:** a female figure in a rope chest harness and suspension hangs realistically with rope pressing into flesh and leaving marks after removal; a latex catsuit compresses and shines correctly; a soft toy deforms and follows the anatomical channel in X-ray view.

### Phase 7: Cutting (about 8 weeks)
- [ ] Watertight skin generation at import; Manifold booleans in a worker
- [ ] Section plane (shader-based), knife, scalpel/flap, saw/remove, puncture tools
- [ ] Cuts in rest pose so they survive re-posing; editable cut stack
- [ ] Tissue cap materials (skin, fat, muscle fibers, tendon, bone cortex/marrow, organs, vessels)
- [ ] Wound edge retraction via layered flesh; removed parts become physics objects; ragdoll updates
- [ ] Optional cutting through clothing
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
- [ ] Lubricant and oil (friction and shine), candle wax that solidifies, water environments (shower, bath, pool), wet see-through clothing
- **Done when:** a forearm cut bleeds realistically down the arm, soaks a sleeve, and pools on the floor; a crying figure has tears running down the cheeks.

### Phase 9: Polish and extra reference tools (ongoing)
- [ ] Path-traced final render mode, camera effects (depth of field, grain, grading), practical lights and haze
- [ ] Video/GIF capture of Live mode
- [ ] Involuntary reactions (trembling, arching, toe curl), upside-down face flush
- [ ] Optional encrypted storage, blurred thumbnails, preset packs
- [ ] Better skin shading, hair strand/card physics, mirrors, POV camera refinements
- [ ] Planes study mode, turnaround sheets, gesture-drawing mode

### Phase 10 (optional)
- [ ] WebXR: pose figures in VR
- [ ] Simple timeline for pose-to-pose motion studies

**Total:** roughly 75–80 weeks of work for one full-time developer through Phase 8. Phases 4–8 can partly run in parallel with more people: face/states and fluids are mostly independent, while restraints/toys and cutting depend on the anatomy layers.

### Prototype the hardest parts first
Before Phase 1 is finished, build throwaway prototypes to prove the risky tech:
1. **Ragdoll Settle:** a Jolt ragdoll holding a pose with motors and sitting on a box.
2. **GPU cloth:** a XPBD skirt on WebGPU colliding with an animated capsule body at 30+ fps.
3. **Anatomy fit and cut:** fit Z-Anatomy into one imported figure and cut through a limb with Manifold, to measure fit quality and cut speed early.
4. **Fluids:** MLS-MPM blood colliding with a skinned body, plus a basic surface-flow trickle.
5. **Rope:** a GPU rope wrapped around a limb, holding by friction and pressing into a soft-body flesh layer.
6. **Insertion channel:** a soft toy following a soft-body channel with stretch limits, to prove stability early.

---

## 23. Risks

| Risk | Mitigation |
|---|---|
| Daz/VaM formats are undocumented and change | Standard formats work first; native readers are additive. Golden test files catch breakage. |
| Heavy meshes and textures exhaust browser memory | Decimation, KTX2, LODs, morph pruning, memory warnings, quality levels |
| Cloth instability (explosions, poke-through) | Small substeps, thick collision fields, drape from rest, velocity clamping, "reset cloth" button |
| Daz bend/twist rigs deform poorly | Dedicated twist splitting; corrective morphs in Phase 3 |
| A user's machine lacks WebGPU or a strong enough GPU | Known small user group: check hardware up front; quality levels for weaker GPUs |
| Browser file-access differences (Safari/Firefox lack persistent folder access) | Manual re-scan; drag-and-drop always works; recommend Chrome/Edge for large libraries |
| Browser storage limits for big libraries | Request persistent storage, show usage, read library folders in place instead of copying, cache only processed versions |
| Anatomy fit looks wrong on unusual body types | Landmark-guided fitting, per-region manual sliders, test set of very different bodies |
| Rope and knot simulation is unstable or slips | Friction-based holding, pre-modelled knots, tie templates, substeps, "pin rope" fallback |
| Insertion and soft-body channels explode or intersect | Guide-curve channels, stretch limits, small substeps, early prototype |
| Many simultaneous systems (two figures, ropes, latex, fluids) overload the GPU | Quality levels, freezing finished systems after Settle, budget meter |
| No open, complete female anatomy model exists | Dedicated workstream from day one: Visible Human Female segmentation plus a 3D character artist. Morph-based female features ship first so the app is useful meanwhile. |
| The female template comes from one 59-year-old body | Parametric variation controls and a body-diversity test set |
| Anatomy data is share-alike licensed | Keep anatomy data separate and attributed so share-alike only covers it. A female template built from Visible Human data can be fully ours. |
| Booleans fail on bad meshes, or cuts are slow | Generate watertight cutting meshes at import, run cuts in a worker with a preview, simplify far-from-cut regions |
| Memory and GPU load with full anatomy, flesh sim, cloth, and fluids together | Load layers on demand, LODs, quality levels, and a budget that limits simultaneous systems on weaker GPUs |
| No openly licensed FACS face template | Budget for building or commissioning one |
| Data loss from browser storage being cleared | Automatic backups to a user folder, persistent storage request |
| Private content exposed on a shared computer | App lock, panic key, optional encryption, blurred thumbnails |

---

## 24. Open decisions for the owner
1. **Users' hardware:** confirm each invited user has desktop Chrome/Edge and a reasonably strong GPU (WebGPU-only plan).
2. **Built-in content:** are CC0 MakeHuman/MPFB starter figures enough, or should we commission original realistic figures?
3. **Priority order** after the core (Phases 0–2): native Daz/VaM import, face and states, anatomy layers, cutting, or fluids? The plan's order is one option.
4. **Female anatomy template budget:** hire or contract a 3D character artist (about 2–4 months)? This is the most important external cost.
5. **FACS face template:** build in-house or commission (female face first)?
6. **Graphic content:** a per-user on/off setting (recommended), or always on?
7. **Sharing:** are `.poser` files and preset packs passed around by hand enough for the group, or is a small private shared library worth adding later?

---

## Sources
- Cloudflare Access (free plan under 50 users): https://www.cloudflare.com/en-au/products/cloudflare-access
- MediaPipe Face Landmarker (52 blendshapes): https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- three-gpu-pathtracer: https://github.com/gkjohnson/three-gpu-pathtracer
- US state age-verification laws: https://avpassociation.com/us-state-age-verification-laws-for-adult-content/
- Age verification law overview 2026: https://www.jumio.com/age-verification-laws/
- Missouri age-verification law (2026): https://www.stlpr.org/government-politics-issues/2026-08-28/age-verification-law-for-porn-sites-now-in-effect-in-missouri
- Stripe prohibited businesses: https://support.stripe.com/questions/prohibited-and-restricted-businesses-faqs
- NIH 3D female pelvis (CC BY-NC-SA): https://3d.nih.gov/entries/3DPX-015843
- TotalSegmentator paper: https://arxiv.org/abs/2208.05868
- TotalSegmentator package (Apache 2.0): https://mcp.depscope.dev/pkg/pypi/TotalSegmentator
- Example commercial female anatomy models (licenses vary): https://www.renderhub.com/nonecg/human-female-complete-anatomy and https://www.turbosquid.com/3d-models/3d-female-reproductive-system-anatomical-model-sagittal-section-on-stand-model-2456104
- Z-Anatomy models and license: https://github.com/Z-Anatomy/Models-of-human-anatomy
- Open 3D Model project (Z-Anatomy successor): https://anatomytool.org/node/63904
- Visible Human Project data access: https://www.nlm.nih.gov/research/visible/getting_data.html
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
