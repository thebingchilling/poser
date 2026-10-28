# Poser: app plan

A web app for **realistic, physics-based anatomy reference**. Artists import their own figures (Daz3D, Virt-a-Mate, VRM, generic rigs), clothing, and props. They pose figures with joint handles like VRM Posing Desktop, let real physics settle bodies, soft tissue, and cloth, explore the anatomy underneath layer by layer, cut into it, add realistic fluids, fine-tune expressions and body states, then light, frame, and capture reference images.

> **Status:** planning only. Nothing gets built until the go-ahead.
>
> **Primary focus: female figures.** Female anatomy is built first and to the highest standard; male anatomy is fully supported but comes second (section 10).

---

## 1. Scope

### In scope
- **Self-import only.** Users bring files from their own disk. The app never downloads from the internet, browses stores, or proxies websites.
- Realistic human figures, including anatomically complete nude figures, for art reference (18+).
- Posing with FK rotation handles, IK effectors, pins, joint limits, mirroring, hand presets, and a pose library.
- Physics: gravity and contact settling (ragdoll), soft tissue, cloth draping, prop collisions.
- Importing props and environments that figures and cloth interact with.
- Anatomical layers (skin, fat, muscle, bone, organs) inside every figure, with a cut tool that shows real cross-sections and can remove parts.
- Realistic fluids: blood, tears, sweat, saliva, urine, and custom liquids.
- Fine-tuned facial expressions (FACS), hands, feet, muscle tension, genital states, and whole-body states (cold, exertion, crying, and so on).
- Lighting, cameras, study modes, and image capture.

### Out of scope for v1
- Any online model sources, accounts, cloud sync, or sharing.
- Animation timelines (single poses only; a timeline may come later).
- Mobile phones (tablet support is a stretch goal; desktop browsers first).

### Principles
1. **Local-first and private.** Files never leave the device. Storage is the browser's private file system (OPFS) plus IndexedDB.
2. **Bring your own assets.** No third-party content is bundled. Built-in content is original or CC0 only.
3. **Anatomy first.** Realistic joint limits, proportions, weight, and lighting take priority over game-style features.
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
| **Cloth** | There is no mature, reusable browser cloth library; only demos (XPBD on WebGPU, mass-spring papers). | Write our own XPBD cloth solver on WebGPU compute, with a CPU fallback. |
| **WebGPU** | Available in Chrome, Edge, Safari 17.4+, and Firefox (default since late 2025). | WebGPU is the primary target; WebGL2 is the fallback with reduced features. |
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
- Soft props (mattress, cushion, pillow) come in Phase 4 as Jolt soft bodies.

### 7.4 Soft tissue (staged)
| Phase | Technique | Result |
|---|---|---|
| 2 | Spring-bone chains on breasts, glutes, belly, and thighs, colliding with body capsules | Correct sag for the body's orientation (lying vs standing) and jiggle in Live mode |
| 2 | Contact compression: skin vertices pushed out of touching surfaces, with the displacement spread to neighbours as a bulge (GPU pass) | Thighs flatten on a seat, cheek squashes on a hand, body presses into a figure it leans on |
| 5 | Layered flesh: the fat and muscle volumes from the anatomy layers simulated with XPBD (section 9.5), driving the visible skin | True sag, compression, wobble, and realistic wound behavior |

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
4. **Medical literature and atlases** for what imaging doesn't resolve well (clitoral anatomy, breast ligaments, pelvic floor).
5. **Optional purchase:** commercial female anatomy models (e.g. TurboSquid, CGTrader, RenderHub), only if their license allows embedding in an application. Most standard licenses don't, so check each one.
6. NIH 3D's female pelvis model is CC BY-NC-SA (non-commercial), so it can be a visual reference only, not shipped in a commercial app.

**Who builds it:** a medical 3D artist (contract or hire), reviewed by an anatomist or medical illustrator for accuracy. Budget about 3–6 months of specialist work. It is the longest-lead item in the project.

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
- **Menstrual cycle:** subtle changes (bloating, breast fullness), plus menstrual blood as a fluid emitter for medical and reference use.
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
Neutral, clinical controls for anatomy reference:
- **Male:** penis from flaccid to fully erect (length, girth, angle, curvature), foreskin from covered to retracted, scrotum from relaxed to tight (temperature and arousal).
- **Female:** labia and clitoral states (relaxed to engorged), vaginal opening, breast changes (fullness, nipple and areola).
- **Both:** nipple erection (cold or arousal), areola texture.
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

## 14. Rendering and reference tools

- **Skin:** physically based skin with a subsurface-scattering approximation, detail normals, and translucency for ears and fingers. Daz/VaM texture channels are mapped automatically (diffuse, translucency, specular/roughness, normal, bump).
- **Eyes, hair, and cloth materials:** dedicated shaders (eye refraction, hair anisotropy, cloth sheen).
- **Lighting:** presets (Rembrandt, loop, split, butterfly, rim, overcast, harsh sun, studio three-point), movable lights with gizmos, and HDRI environments from user files or a few bundled CC0 ones. Shadows on.
- **Cameras:** lens presets (24/35/50/85/135 mm), orthographic front/side/top, camera bookmarks, rule-of-thirds and golden-ratio overlays.
- **Study modes:** clay (no textures), silhouette, 2- and 3-value notan, contour lines, and planes/low-poly simplification (Phase 4).
- **Anatomy overlays:** proportion grid in head units, center of gravity with support area (is the pose balanced?). Full anatomy views come from the layer system (section 9).
- **Capture:**
  - PNG at any resolution, with a transparent background option.
  - Turnaround sheet (8 or 16 angles in a grid).
  - **Gesture-drawing mode:** random pose, camera, and lighting every N seconds, with a timer.

---

## 15. Data model and storage

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
 │       ├─ lights[]   { type, transform, color, intensity, shadow }
 │       ├─ cameras[]  { lens | ortho, transform, bookmarkName }
 │       └─ environment { hdriAssetId, floor, background }
 └─ poses[] (saved canonical poses)

Asset (in Library)
 { id, kind: figure|garment|hair|morphs|prop|pose|hdri|texture,
   baseFigure, name, creator, license, sourcePath, importedAt,
   files: { meshLODs, textures, morphs, rigMap, colliders, simProxy,
            watertightSkin, anatomyFit, facsMap },
   thumbnail, tags }
```

- **Storage:** asset binaries in the browser's private file system (OPFS); metadata, scenes, and poses in IndexedDB. Library folders are read in place, with only processed versions cached.
- **Storage manager:** shows space used, clears caches, and requests persistent storage so the browser doesn't evict data.
- **Project export:** `.poser` is a zip of the scene JSON plus the processed assets it uses. It's for the user's own backup or second computer, not for sharing.

---

## 16. Tech stack

| Layer | Choice |
|---|---|
| Language and build | TypeScript, Vite, pnpm workspaces (monorepo) |
| UI | React, Zustand (state), Radix UI (accessible components) |
| 3D | three.js with WebGPU renderer (WebGL2 fallback), TSL node materials; GLTF/FBX/OBJ loaders, `@pixiv/three-vrm` |
| Physics | JoltPhysics.js (WASM) in a Web Worker |
| Cloth and soft tissue | Custom XPBD on WebGPU compute, plus a CPU worker fallback |
| Cutting | Manifold (`manifold-3d`, WASM) booleans in a worker |
| Fluids | Custom MLS-MPM on WebGPU compute, texture-space surface flow, screen-space fluid rendering |
| Anatomy data | Z-Anatomy / BodyParts3D (CC BY-SA), fitted per figure; Visible Human as texture reference |
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
  packages/anatomy/      layer templates, fitting, labels, peel, layered flesh
  packages/cutting/      cut tools, booleans, caps, cut stack, removed parts
  packages/fluids/       MPM solver, surface flow, emitters, wetness, stains
  packages/face/         FACS action units, rig mapping, wrinkles, presets
  packages/states/       body states, muscle tension, genital states, decals
  assets/builtin/        CC0 starter figures (MakeHuman/MPFB), props, HDRIs
  assets/anatomy/        fitted-ready anatomy templates (CC BY-SA, with attribution)
  docs/                  import guides, architecture notes
```

---

## 17. Quality targets

| Area | Target |
|---|---|
| Posing frame rate | 60 fps with 2 figures on a mid-range GPU (e.g. RTX 3060 / M1) |
| Cloth | About 20k simulated vertices at 30+ fps on WebGPU |
| Settle | Finishes in 3 seconds or less for one figure with clothing |
| Import | A Genesis 8 FBX with textures imported in under 30 seconds (plus under 60 seconds for anatomy fitting) |
| Cuts | Knife or saw cut applied in under 1 second, with an instant preview |
| Fluids | About 100k particles at 30+ fps on WebGPU; surface flow always real time |
| Memory | Warn before going past roughly 2 GB of GPU memory |
| Browsers | Latest Chrome/Edge (full), Safari and Firefox (full where WebGPU is on; otherwise reduced) |

### Testing
- Unit tests for rig mapping, IK, joint limits, importers, and serialization.
- A **golden test set** of real files, mostly female (Daz Genesis 8 Female, Genesis 9 with a female shape, VaM female looks, female VRM and Mixamo figures), plus some male figures and MD garments: each must import, map, and pose correctly.
- A **female body-diversity set** (slim, curvy, heavy, muscular, large and small breasts, young adult to elderly, pregnant) for anatomy fitting and breast physics checks.
- Accuracy review of the female template by a qualified anatomist or medical illustrator.
- Screenshot tests for rendering and study modes.
- Physics regression scenes (sitting in a chair, lying on the floor, a skirt in a seated pose) checked for penetration and stability.
- Anatomy fitting checks on very different body types (no bones poking through skin, sensible fat thickness), and cut tests comparing cross-sections with reference atlas slices.

---

## 18. Content policy, safety, and legal

- **18+ age gate** on first launch, explaining that the app shows nudity for anatomy reference.
- Everything stays local: no uploads, accounts, or sharing in v1.
- **Separate graphic-content setting:** blood, open wounds, removed body parts, and bodily fluids are off by default and turned on separately from nudity, with a warning. Anatomy layers (muscles, skeleton) are always available.
- Anatomy data is credited (BodyParts3D, Z-Anatomy, NLM Visible Human) on an About/credits screen, as their licenses require.
- **Terms of use:** adult figures only; sexualized depictions of minors are prohibited. Users are responsible for having the right to use the files they import.
- **No bundled third-party content.** Built-ins are original or CC0.
- Licenses recorded from `.var` metadata are shown in the Library.
- Professional art-reference framing throughout.
- Legal review before launch, especially the Daz Interactive License question and the terms of use.

---

## 19. Roadmap

Each phase ends with something usable. Week estimates assume one full-time developer.

### Phase 0: Foundation (about 2 weeks)
- [ ] Monorepo, Vite, React shell, panel layout, themes
- [ ] three.js WebGPU viewport with WebGL2 fallback, orbit camera, view cube, grid, floor
- [ ] Scene store, undo/redo, autosave to IndexedDB/OPFS
- [ ] Age gate, terms screen
- [ ] Load a bundled CC0 female figure (a male figure is bundled too)
- [ ] **Start the female anatomy template workstream:** contract or hire a medical 3D artist; runs in parallel for about 3–6 months
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
- [ ] **Breast soft-body simulation** (volume-based, glandular/fat stiffness, ligament support), checked standing, lying, on the side, bent forward, and pressed
- [ ] Two-way clothing ↔ flesh interaction (bra support, waistband and strap indentation)
- [ ] Spring-bone fallback for other soft tissue; contact compression
- [ ] XPBD cloth on WebGPU with CPU fallback: body collision field, friction, pins, fabric presets, drape from rest, simulation proxy
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
- [ ] Fitting pipeline: skeleton match, skin registration, volumetric warp, fat thickness, sex detection
- [ ] Layer viewer: visibility/transparency, presets, peel brush, labels and descriptions
- [ ] Layered flesh simulation (fat and muscle volumes with XPBD), muscle volume bulge from tension, erectile tissue volume for genital states
- [ ] Credits screen for anatomy data
- **Done when:** every figure in the female body-diversity set, plus male figures, shows plausible fitted anatomy that moves with posing, with no bones through the skin.

### Phase 6: Cutting (about 8 weeks)
- [ ] Watertight skin generation at import; Manifold booleans in a worker
- [ ] Section plane (shader-based), knife, scalpel/flap, saw/remove, puncture tools
- [ ] Cuts in rest pose so they survive re-posing; editable cut stack
- [ ] Tissue cap materials (skin, fat, muscle fibers, tendon, bone cortex/marrow, organs, vessels)
- [ ] Wound edge retraction via layered flesh; removed parts become physics objects; ragdoll updates
- [ ] Optional cutting through clothing
- [ ] Graphic-content setting
- **Done when:** a cut through the thigh shows skin, fat, the correct muscles, femur cortex and marrow, and the femoral vessels in the right places, and stays correct after re-posing.

### Phase 7: Fluids (about 8 weeks)
- [ ] Surface flow on skin and cloth (texture-space wetness and film thickness, gravity-driven, dripping)
- [ ] MLS-MPM particle fluids on WebGPU with surface rendering
- [ ] Fluid presets (blood, tears, sweat, saliva, urine, water, oil) and custom fluid editor
- [ ] Emitters: wounds (ooze, venous flow, arterial pulsing from vessels hit), tear ducts, mouth, nose, urethra, sweat regions, custom
- [ ] Cloth absorption (darker, heavier, clingier), wet skin shading, pooling, stains, drying and blood darkening
- [ ] Freeze fluids into meshes and stains for capture
- **Done when:** a forearm cut bleeds realistically down the arm, soaks a sleeve, and pools on the floor; a crying figure has tears running down the cheeks.

### Phase 8: Polish and extra reference tools (ongoing)
- [ ] Soft props (mattress, cushions), better skin shading, hair strand/card physics
- [ ] Planes study mode, turnaround sheets, gesture-drawing mode

### Phase 9 (optional)
- [ ] Desktop app (Tauri) for very large libraries
- [ ] WebXR: pose figures in VR
- [ ] Simple timeline for pose-to-pose motion studies

**Total:** roughly 60+ weeks of work for one full-time developer through Phase 7. Phases 4–7 can partly run in parallel with more people, since the face/states, anatomy, and fluids work are mostly independent; cutting depends on anatomy.

### Prototype the hardest parts first
Before Phase 1 is finished, build two throwaway prototypes to prove the risky tech:
1. **Ragdoll Settle:** a Jolt ragdoll holding a pose with motors and sitting on a box.
2. **GPU cloth:** a XPBD skirt on WebGPU colliding with an animated capsule body at 30+ fps.
3. **Anatomy fit and cut:** fit Z-Anatomy into one imported figure and cut through a limb with Manifold, to measure fit quality and cut speed early.
4. **Fluids:** MLS-MPM blood colliding with a skinned body, plus a basic surface-flow trickle.

---

## 20. Risks

| Risk | Mitigation |
|---|---|
| Daz/VaM formats are undocumented and change | Standard formats work first; native readers are additive. Golden test files catch breakage. |
| Heavy meshes and textures exhaust browser memory | Decimation, KTX2, LODs, morph pruning, memory warnings, quality levels |
| Cloth instability (explosions, poke-through) | Small substeps, thick collision fields, drape from rest, velocity clamping, "reset cloth" button |
| Daz bend/twist rigs deform poorly | Dedicated twist splitting; corrective morphs in Phase 3 |
| WebGPU missing or buggy on a device | WebGL2 render fallback and CPU cloth at lower resolution |
| Browser file-access differences (Safari/Firefox lack persistent folder access) | Manual re-scan; drag-and-drop always works; Tauri desktop option later |
| Anatomy fit looks wrong on unusual body types | Landmark-guided fitting, per-region manual sliders, test set of very different bodies |
| No open, complete female anatomy model exists | Dedicated workstream from day one: Visible Human Female segmentation, a medical 3D artist, and an anatomist review. Morph-based female features ship first so the app is useful meanwhile. |
| The female template comes from one 59-year-old body | Parametric variation controls and a body-diversity test set |
| Anatomy data is share-alike licensed | Keep anatomy data separate and attributed so share-alike only covers it. A female template built from Visible Human data can be fully ours. |
| Booleans fail on bad meshes, or cuts are slow | Generate watertight cutting meshes at import, run cuts in a worker with a preview, simplify far-from-cut regions |
| Memory and GPU load with full anatomy, flesh sim, cloth, and fluids together | Load layers on demand, LODs, quality levels, and a budget that limits simultaneous systems on weaker GPUs |
| No openly licensed FACS face template | Budget for building or commissioning one |
| Hosting providers or app stores reject gore plus nudity | Graphic content off by default, clinical framing, Tauri desktop as a fallback distribution |
| Legal and hosting issues around NSFW and licensed content | Local-only, nothing bundled, age gate, clear terms, legal review |

---

## 21. Open decisions for the owner
1. **App name and branding.** "Poser" is already the name of a commercial product, so a different public name is probably needed.
2. **Target hardware:** desktop only, or tablets (touch posing) too?
3. **Business model:** free, one-time purchase, or subscription? This affects the desktop wrapper and licensing work.
4. **Built-in content:** are CC0 MakeHuman/MPFB starter figures enough, or should we commission original realistic figures?
5. **Priority order** after the core (Phases 0–2): native Daz/VaM import, face and states, anatomy layers, cutting, or fluids? The plan's order is one option.
6. **Female anatomy template budget:** hire or contract a medical 3D artist (about 3–6 months) plus an anatomist reviewer? This is the most important external cost.
7. **FACS face template:** build in-house or commission (female face first)?
8. **Graphic content:** keep blood and wounds behind a separate setting (recommended), or on by default?

---

## Sources
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
