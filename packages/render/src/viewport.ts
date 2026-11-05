import type { AssetRigInfo, CanonicalPose, Figure, HdriSettings, Light, Prop, Scene as SceneModel } from '@poser/core';
import type { QualitySettings } from '@poser/platform';
import {
  AmbientLight,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  HemisphereLight,
  Quaternion,
  Scene,
  Spherical,
  LineSegments,
  NeutralToneMapping,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  ShadowNodeMaterial,
  TextureLoader,
  type Texture,
  Vector3,
  WebGPURenderer,
  type Object3D,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { ImportedFigure } from './figure/imported';
import { baseFigureRig, baseFigureUrl, isBaseFigure } from './figure/baseFigures';
import { BUILTIN_FIGURES, FigureObject, type AnatomyLayer, type BuiltinFigureId } from './figure/mannequin';
import type { PosableFigure } from './figure/types';
import { PoseTools } from './posing/poseTools';
import { overrideMaterials } from './props/materials';
import { collectTriangles, measureBody, type BodyMeasurements } from './figure/measure';
import { NotanPass, applyStudyMaterials, studyStage, type StudyMode } from './study';
import type { PoseSkeleton } from '@poser/posing';

export type RendererBackend = 'webgpu' | 'webgl2';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface DeviceLostEvent {
  api: string;
  message: string;
  reason: string | null;
}

export interface ViewportOptions {
  canvas: HTMLCanvasElement;
  quality: QualitySettings;
  /** Use three.js's WebGL2 backend (compatibility mode, PLAN.md section 3.5). */
  forceWebGL?: boolean;
  onDeviceLost?: (event: DeviceLostEvent) => void;
  /** Show the simple mannequins instead of loading the base figures (Safe Mode). */
  simpleFigures?: boolean;
}

const VIEW_DIRECTIONS: Record<ViewName, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0], // the figure's left side
  right: [-1, 0, 0],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
};

/**
 * The 3D viewport (PLAN.md section 3.4): three.js WebGPU renderer, orbit
 * camera, grid, floor, lights, and figures, kept in sync with the scene
 * model. Renders on demand to save battery; frame timings are reported
 * while it is actively rendering, for adaptive quality.
 */
export class Viewport {
  readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(35, 1, 0.05, 200);
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, -50, 200);
  /** The active camera: perspective with a lens, or orthographic. */
  camera: PerspectiveCamera | OrthographicCamera = this.perspective;
  /** Lens focal length (35mm equivalent), or null when orthographic. */
  private focal: number | null = 50;
  readonly controls: OrbitControls;
  readonly backend: RendererBackend;
  /** Joint handles, gizmo, IK and pins (PLAN.md section 6). */
  readonly poseTools: PoseTools;

  private readonly figures = new Map<string, { object: PosableFigure; assetId: string }>();
  /** Figures whose model is still loading (asset id per figure id). */
  private readonly loading = new Map<string, string>();
  private lastFigures: Figure[] = [];
  /** Supplies imported models from the Library. */
  assetLoader: ((assetId: string) => Promise<{ model: Blob; rig?: AssetRigInfo } | null>) | null = null;
  private readonly lights = new Map<string, { object: DirectionalLight | AmbientLight | HemisphereLight; type: Light['type'] }>();
  private readonly grid = new Group();
  private readonly floor: Mesh;
  private quality: QualitySettings;
  private needsRender = true;
  private lastFrame = 0;
  private resizeObserver: ResizeObserver;
  private frameListeners = new Set<(frameMs: number) => void>();
  private cameraListeners = new Set<(q: Quaternion) => void>();
  private skinOpacity = 1;
  private layerVisibility: Record<AnatomyLayer, boolean> = { skin: true, fat: false, muscle: false, skeleton: false };
  private disposed = false;
  private readonly simpleFigures: boolean;
  private study: StudyMode = 'normal';
  private notan: NotanPass | null = null;
  private lastModel: SceneModel | null = null;
  private readonly backgroundColor = new Color(0x3a3a3a);
  private readonly floorMaterial = new MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 });
  private readonly shadowCatcher = new ShadowNodeMaterial({ opacity: 0.45 });
  private refTexture: Texture | null = null;
  /** The floor grid stays on while matching a photo's perspective. */
  private matchGrid = false;
  /** Prop settings (recolour, lock) by prop id. */
  private propData = new Map<string, Prop>();
  private propGizmo: TransformControls;
  private selectedProp: string | null = null;
  private propDragId = 0;
  /** Called while a prop is dragged with the gizmo (one coalesce key per drag). */
  onPropTransform: ((propId: string, position: [number, number, number], rotation: [number, number, number, number], coalesceKey: string) => void) | null = null;

  private constructor(
    readonly renderer: WebGPURenderer,
    private readonly canvas: HTMLCanvasElement,
    options: ViewportOptions,
  ) {
    this.quality = options.quality;
    this.simpleFigures = options.simpleFigures ?? false;
    this.backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.scene.background = this.backgroundColor;

    this.perspective.fov = fovFor(50);
    this.camera.position.set(2.2, 1.6, 5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 40;
    this.controls.addEventListener('change', () => {
      this.invalidate();
      for (const l of this.cameraListeners) l(this.camera.quaternion);
    });
    this.controls.update();

    this.floor = new Mesh(new CircleGeometry(12, 64), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    const minor = new GridHelper(10, 100, 0x555555, 0x444444);
    minor.position.y = 0.001;
    const major = new GridHelper(10, 10, 0x777777, 0x666666);
    major.position.y = 0.002;
    this.grid.add(minor, major);
    this.scene.add(this.grid);

    this.poseTools = new PoseTools(
      this.camera,
      canvas,
      this.controls,
      () => this.invalidate(),
      () => this.figures,
      (id) => this.lastFigures.find((f) => f.id === id)?.pose,
    );
    this.scene.add(this.poseTools.group, this.poseTools.helper);

    this.propGizmo = new TransformControls(this.camera, canvas);
    this.propGizmo.setSize(0.9);
    this.propGizmo.addEventListener('dragging-changed', (e) => {
      const dragging = !!(e as unknown as { value: boolean }).value;
      this.controls.enabled = !dragging;
      if (dragging) this.propDragId++;
    });
    this.propGizmo.addEventListener('objectChange', () => {
      const o = this.propGizmo.object;
      const id = this.selectedProp;
      if (!o || !id) return;
      // Props stand on the floor or on something; never sink below it.
      if (o.position.y < 0) o.position.y = 0;
      this.onPropTransform?.(id, o.position.toArray(), o.quaternion.toArray() as [number, number, number, number], `prop-drag-${this.propDragId}`);
      this.invalidate();
    });
    this.propGizmo.addEventListener('change', () => this.invalidate());
    this.scene.add(this.propGizmo.getHelper());

    this.lightHandles.visible = false;
    this.scene.add(this.lightHandles, this.guides);
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) this.pickLight(e);
      down = null;
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.applyQuality();
    this.resize();

    renderer.setAnimationLoop((time) => this.tick(time));
  }

  static async create(options: ViewportOptions): Promise<Viewport> {
    const renderer = new WebGPURenderer({
      canvas: options.canvas,
      antialias: options.quality.antialias,
      forceWebGL: options.forceWebGL ?? false,
      powerPreference: 'high-performance',
      // An alpha channel allows transparent-background captures; the scene background keeps the view opaque.
      alpha: true,
    });
    renderer.onDeviceLost = (info) => options.onDeviceLost?.({ api: info.api, message: info.message, reason: info.reason });
    await renderer.init();
    renderer.shadowMap.enabled = true;
    // HDR lighting (HDRIs, strong lights) needs tone mapping; PBR Neutral keeps colours faithful.
    renderer.toneMapping = NeutralToneMapping;
    return new Viewport(renderer, options.canvas, options);
  }

  // ---------- Sync with the scene model ----------

  sync(model: SceneModel): void {
    this.lastModel = model;
    // Props are imported models without a rig: they share the figure path with no pose.
    const props: Figure[] = (model.props ?? []).map((p) => ({ ...p, pose: {}, morphValues: {} }));
    this.propData = new Map((model.props ?? []).map((p) => [p.id, p]));
    this.syncFigures([...model.figures, ...props]);
    this.syncLights(model.lights);
    this.applyStage(model);
    this.invalidate();
  }

  private applyStage(model: SceneModel): void {
    const stage = studyStage(this.study);
    // A reference photo behind the scene replaces the backdrop; the floor then only catches shadows.
    const photo = this.refTexture && this.study === 'normal';
    this.floor.visible = photo ? true : (stage.floor ?? model.environment.floor);
    this.floor.material = photo ? this.shadowCatcher : this.floorMaterial;
    this.grid.visible = this.matchGrid || (photo ? false : (stage.grid ?? model.environment.grid));
    this.backgroundColor.copy(stage.background ?? new Color(model.environment.background));
    // Background: a study mode's own, then the reference photo, then the HDRI if shown, then the colour.
    const hdri = model.environment.hdri;
    const hdriBackground = !stage.background && hdri?.background && this.hdriTexture;
    this.scene.background = photo ? this.refTexture : hdriBackground ? this.hdriTexture : this.backgroundColor;
    this.applyHdri(hdri ?? null);
  }

  // ---------- HDRI environment lighting (PLAN.md section 18) ----------

  /** Supplies HDRI files saved in the Library (environment assets). */
  hdriLoader: ((assetId: string) => Promise<{ blob: Blob; name: string } | null>) | null = null;
  private hdriTexture: Texture | null = null;
  private hdriSource: string | null = null;

  private applyHdri(settings: HdriSettings | null): void {
    if (!settings) {
      if (this.hdriSource !== null) {
        this.hdriSource = null;
        this.hdriTexture?.dispose();
        this.hdriTexture = null;
      }
      this.scene.environment = null;
      return;
    }
    const s = this.scene as Scene & { environmentIntensity: number; environmentRotation: { y: number }; backgroundRotation: { y: number } };
    s.environmentIntensity = settings.intensity;
    s.environmentRotation.y = (settings.rotation * Math.PI) / 180;
    s.backgroundRotation.y = (settings.rotation * Math.PI) / 180;
    if (settings.source === this.hdriSource) {
      this.scene.environment = this.hdriTexture;
      return;
    }
    this.hdriSource = settings.source;
    const source = settings.source;
    void this.loadHdri(source)
      .then((tex) => {
        if (this.hdriSource !== source || this.disposed) {
          tex?.dispose();
          return;
        }
        this.hdriTexture?.dispose();
        this.hdriTexture = tex;
        if (this.lastModel) this.applyStage(this.lastModel);
        this.invalidate();
      })
      .catch(() => {
        // Lighting falls back to the lights alone.
        if (this.hdriSource === source) this.hdriSource = null;
      });
  }

  private async loadHdri(source: string): Promise<Texture | null> {
    let blob: Blob | null = null;
    let name = '';
    if (source.startsWith('builtin:')) {
      name = `${source.slice(8)}.hdr`;
      const res = await fetch(`${import.meta.env?.BASE_URL ?? '/'}builtin/hdri/${name}`);
      if (res.ok) blob = await res.blob();
    } else if (this.hdriLoader) {
      const found = await this.hdriLoader(source);
      if (found) ({ blob, name } = found);
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    try {
      const tex = /\.exr$/i.test(name) ? await new EXRLoader().loadAsync(url) : await new HDRLoader().loadAsync(url);
      tex.mapping = EquirectangularReflectionMapping;
      return tex;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- Reference photo and camera match (PLAN.md section 17.7) ----------

  /** Shows a photo behind the scene, filling the view (null removes it). */
  async setBackgroundImage(url: string | null): Promise<void> {
    this.refTexture?.dispose();
    this.refTexture = null;
    if (url) {
      const tex = await new TextureLoader().loadAsync(url);
      tex.colorSpace = SRGBColorSpace;
      this.refTexture = tex;
      this.fitBackground();
    }
    if (this.lastModel) this.applyStage(this.lastModel);
    this.invalidate();
  }

  /** Crops the photo to fill the view without stretching (like CSS object-fit: cover). */
  private fitBackground(aspect?: number): void {
    const tex = this.refTexture;
    const img = tex?.image as { width?: number; height?: number } | undefined;
    if (!tex || !img?.width || !img.height) return;
    const imageAspect = img.width / img.height;
    const viewAspect = aspect ?? this.aspect();
    if (viewAspect > imageAspect) {
      tex.repeat.set(1, imageAspect / viewAspect);
      tex.offset.set(0, (1 - tex.repeat.y) / 2);
    } else {
      tex.repeat.set(viewAspect / imageAspect, 1);
      tex.offset.set((1 - tex.repeat.x) / 2, 0);
    }
  }

  /**
   * Matches the camera to a photo: the camera stands `height` metres above
   * the floor and tilts so the horizon falls at `horizon` (0 = top of the
   * view, 1 = bottom), keeping its heading and distance to the subject.
   */
  setMatchGrid(on: boolean): void {
    this.matchGrid = on;
    if (this.lastModel) this.applyStage(this.lastModel);
    this.invalidate();
  }

  matchCamera(horizon: number, height: number): void {
    if (this.camera instanceof OrthographicCamera) return;
    const ndc = 1 - 2 * horizon;
    const tilt = Math.atan(ndc * Math.tan((this.perspective.fov * Math.PI) / 360));
    const target = this.controls.target.clone();
    const flat = this.camera.position.clone().sub(target).setY(0);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
    flat.normalize();
    const dist = Math.max(1, Math.hypot(this.camera.position.x - target.x, this.camera.position.z - target.z));
    this.camera.position.set(target.x + flat.x * dist, height, target.z + flat.z * dist);
    // Look along the heading, tilted down by `tilt` (up when negative).
    const forward = flat.clone().negate().multiplyScalar(Math.cos(tilt));
    forward.y = -Math.sin(tilt);
    this.controls.target.copy(this.camera.position).addScaledVector(forward, dist / Math.max(0.2, Math.cos(tilt)));
    this.controls.update();
    this.invalidate();
  }

  // ---------- Prop gizmo ----------

  /** Shows a move or turn gizmo on a prop (null hides it). */
  selectProp(propId: string | null, mode: 'translate' | 'rotate' = 'translate'): void {
    this.selectedProp = propId;
    const entry = propId ? this.figures.get(propId) : undefined;
    if (entry && this.propData.get(propId!)?.locked !== true) {
      this.propGizmo.attach(entry.object.root);
      this.propGizmo.setMode(mode);
      // Turning is about the vertical only; moving is free.
      this.propGizmo.showX = this.propGizmo.showZ = mode === 'translate';
    } else this.propGizmo.detach();
    this.invalidate();
  }

  // ---------- Study modes ----------

  /** Clay, silhouette, or notan view (PLAN.md section 18). */
  setStudyMode(mode: StudyMode, threshold?: number): void {
    if (mode !== this.study) {
      this.study = mode;
      for (const { object } of this.figures.values()) applyStudyMaterials(object.root, mode);
      if (this.lastModel) this.sync(this.lastModel);
    }
    const notan = mode === 'notan2' || mode === 'notan3';
    if (notan && !this.notan) this.notan = new NotanPass(this.renderer, this.scene, this.camera);
    if (!notan && this.notan) {
      this.notan.dispose();
      this.notan = null;
    }
    if (this.notan) {
      this.notan.setLevels(mode === 'notan2' ? 2 : 3);
      if (threshold !== undefined) this.notan.threshold.value = threshold;
    }
    this.invalidate();
  }

  get studyMode(): StudyMode {
    return this.study;
  }

  private renderFrame(): void {
    if (this.notan) this.notan.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private syncFigures(figures: Figure[]): void {
    this.lastFigures = figures;
    const seen = new Set<string>();
    for (const fig of figures) {
      seen.add(fig.id);
      let entry = this.figures.get(fig.id);
      if (entry && entry.assetId !== fig.assetId) {
        this.removeFigure(fig.id);
        entry = undefined;
      }
      if (!entry) {
        if (isBaseFigure(fig.assetId) && this.simpleFigures) {
          entry = this.addFigureObject(fig.id, fig.assetId, new FigureObject(mannequinFor(fig.assetId)));
        } else if (isBaseFigure(fig.assetId)) {
          this.loadFigure(fig.id, fig.assetId, async () => {
            const res = await fetch(baseFigureUrl(fig.assetId));
            if (!res.ok) throw new Error(`Couldn't load the built-in figure (${res.status})`);
            return ImportedFigure.parse(await res.arrayBuffer(), baseFigureRig(fig.assetId));
          });
          continue;
        } else if (fig.assetId in BUILTIN_FIGURES) {
          entry = this.addFigureObject(fig.id, fig.assetId, new FigureObject(fig.assetId as BuiltinFigureId));
        } else {
          this.loadImported(fig.id, fig.assetId);
          continue;
        }
      }
      this.applyFigure(entry.object, fig);
    }
    for (const id of [...this.figures.keys()]) if (!seen.has(id)) this.removeFigure(id);
    if (this.proportionFigure) this.updateProportionGrid();
    // A reloaded prop gets the gizmo back.
    const sel = this.selectedProp ? this.figures.get(this.selectedProp) : undefined;
    if (sel && this.propGizmo && this.propGizmo.object !== sel.object.root) this.selectProp(this.selectedProp, this.propGizmo.mode as 'translate' | 'rotate');
    this.poseTools?.refresh();
  }

  private addFigureObject(id: string, assetId: string, object: PosableFigure) {
    const entry: { object: PosableFigure; assetId: string } = { object, assetId };
    this.figures.set(id, entry);
    object.root.userData.figureId = id;
    this.scene.add(object.root);
    this.applyAnatomyView(object);
    if (this.study !== 'normal') applyStudyMaterials(object.root, this.study);
    return entry;
  }

  private applyFigure(object: PosableFigure, fig: Figure): void {
    const root = object.root;
    root.visible = fig.visible;
    root.position.set(...fig.transform.position);
    root.quaternion.set(...fig.transform.rotation);
    root.scale.set(...fig.transform.scale);
    object.applyPose(fig.pose);
    object.setMorphs(fig.morphValues);
    const prop = this.propData.get(fig.id);
    if (prop) this.applyPropMaterial(object, prop);
  }

  private applyPropMaterial(object: PosableFigure, prop: Prop): void {
    const key = JSON.stringify(prop.material ?? null);
    if (object.root.userData.materialKey === key) return;
    // Props are recoloured once the study mode's own materials come off.
    if (this.study !== 'normal') return;
    object.root.userData.materialKey = key;
    overrideMaterials(object.root, prop.material ?? null);
  }

  /** Loads an imported model in the background, then shows it with the latest scene state. */
  private loadImported(figureId: string, assetId: string): void {
    const loader = this.assetLoader;
    if (!loader) return;
    this.loadFigure(figureId, assetId, async () => {
      const asset = await loader(assetId);
      return asset ? ImportedFigure.load(asset.model, asset.rig) : null;
    });
  }

  private loadFigure(figureId: string, assetId: string, create: () => Promise<PosableFigure | null>): void {
    if (this.loading.get(figureId) === assetId) return;
    this.loading.set(figureId, assetId);
    create()
      .catch((err: unknown) => {
        // A built-in figure that fails to load falls back to its mannequin, so the scene still works.
        if (!isBaseFigure(assetId)) throw err;
        for (const l of this.errorListeners) l(figureId, err);
        return new FigureObject(mannequinFor(assetId));
      })
      .then((object) => {
        if (!object) return;
        if (this.disposed || this.loading.get(figureId) !== assetId) {
          object.dispose();
          return;
        }
        this.loading.delete(figureId);
        const fig = this.lastFigures.find((f) => f.id === figureId);
        if (!fig || fig.assetId !== assetId) {
          object.dispose();
          return;
        }
        this.applyFigure(this.addFigureObject(figureId, assetId, object).object, fig);
        this.poseTools.refresh();
        this.invalidate();
        for (const l of this.loadListeners) l(figureId);
      })
      .catch((err: unknown) => {
        this.loading.delete(figureId);
        for (const l of this.errorListeners) l(figureId, err);
      });
  }

  private loadListeners = new Set<(figureId: string) => void>();
  private errorListeners = new Set<(figureId: string, err: unknown) => void>();

  /** Called when an imported figure finishes loading, or fails to. */
  onFigureLoad(loaded: (figureId: string) => void, failed?: (figureId: string, err: unknown) => void): () => void {
    this.loadListeners.add(loaded);
    if (failed) this.errorListeners.add(failed);
    return () => {
      this.loadListeners.delete(loaded);
      if (failed) this.errorListeners.delete(failed);
    };
  }

  private removeFigure(id: string): void {
    const entry = this.figures.get(id);
    if (!entry) return;
    if (this.propGizmo.object === entry.object.root) this.propGizmo.detach();
    this.scene.remove(entry.object.root);
    entry.object.dispose();
    this.figures.delete(id);
  }

  private syncLights(lights: Light[]): void {
    const seen = new Set<string>();
    for (const l of lights) {
      seen.add(l.id);
      let entry = this.lights.get(l.id);
      if (entry && entry.type !== l.type) {
        this.scene.remove(entry.object);
        entry.object.dispose();
        entry = undefined;
      }
      if (!entry) {
        const object = l.type === 'ambient' ? new AmbientLight() : l.type === 'hemisphere' ? new HemisphereLight() : new DirectionalLight();
        entry = { object, type: l.type };
        this.lights.set(l.id, entry);
        this.scene.add(object);
        if (object instanceof DirectionalLight) this.scene.add(object.target);
      }
      const o = entry.object;
      o.visible = l.visible;
      o.color.set(l.color);
      o.intensity = l.intensity;
      o.position.set(...l.transform.position);
      if (o instanceof HemisphereLight) o.groundColor.set(l.groundColor ?? '#444444');
      if (o instanceof DirectionalLight) {
        o.target.position.set(...(l.target ?? [0, 0.9, 0]));
        o.castShadow = l.castShadow && this.quality.shadows;
        const cam = o.shadow.camera;
        cam.left = cam.bottom = -3;
        cam.right = cam.top = 3;
        cam.near = 0.1;
        cam.far = o.position.distanceTo(o.target.position) + 8;
        cam.updateProjectionMatrix();
        o.shadow.bias = -0.0004;
        o.shadow.normalBias = 0.02;
        if (o.shadow.mapSize.x !== this.quality.shadowMapSize) {
          o.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
          o.shadow.map?.dispose();
          o.shadow.map = null;
        }
      }
    }
    for (const [id, entry] of [...this.lights]) {
      if (!seen.has(id)) {
        this.scene.remove(entry.object);
        entry.object.dispose();
        this.lights.delete(id);
      }
    }
    this.syncLightHandles(lights);
  }

  // ---------- Light handles (PLAN.md section 18: movable lights with gizmos) ----------

  private readonly lightHandles = new Group();
  private readonly lightHandleMeshes = new Map<string, { handle: Mesh; line: Line }>();
  private lightGizmo: TransformControls | null = null;
  private selectedLight: string | null = null;
  private lightDragId = 0;
  /** Called while a light is dragged (one coalesce key per drag). */
  onLightMove: ((lightId: string, position: [number, number, number], coalesceKey: string) => void) | null = null;
  /** Called when a light handle is clicked. */
  onLightSelect: ((lightId: string) => void) | null = null;

  private syncLightHandles(lights: Light[]): void {
    const seen = new Set<string>();
    for (const l of lights) {
      if (l.type === 'ambient' || l.type === 'hemisphere') continue;
      seen.add(l.id);
      let h = this.lightHandleMeshes.get(l.id);
      if (!h) {
        const handle = new Mesh(new SphereGeometry(0.08, 16, 12), new MeshBasicMaterial({ color: 0xffe08a, depthTest: false, transparent: true, opacity: 0.9 }));
        handle.renderOrder = 999;
        handle.userData.lightId = l.id;
        const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.5, depthTest: false }));
        this.lightHandles.add(handle, line);
        h = { handle, line };
        this.lightHandleMeshes.set(l.id, h);
      }
      h.handle.position.set(...l.transform.position);
      const target = l.target ?? [0, 0.9, 0];
      h.line.geometry.setFromPoints([new Vector3(...l.transform.position), new Vector3(...target)]);
      (h.handle.material as MeshBasicMaterial).color.set(l.id === this.selectedLight ? 0xffffff : l.visible ? 0xffe08a : 0x777777);
    }
    for (const [id, h] of [...this.lightHandleMeshes]) {
      if (seen.has(id)) continue;
      this.lightHandles.remove(h.handle, h.line);
      h.handle.geometry.dispose();
      h.line.geometry.dispose();
      this.lightHandleMeshes.delete(id);
    }
    this.attachLightGizmo();
  }

  /** Shows light handles (in the Render workspace) and a move gizmo on the selected light. */
  setLightHandles(visible: boolean, selectedId: string | null): void {
    this.lightHandles.visible = visible;
    this.selectedLight = visible ? selectedId : null;
    for (const [id, h] of this.lightHandleMeshes) (h.handle.material as MeshBasicMaterial).color.set(id === this.selectedLight ? 0xffffff : 0xffe08a);
    this.attachLightGizmo();
    this.invalidate();
  }

  private attachLightGizmo(): void {
    if (!this.lightGizmo) {
      const g = new TransformControls(this.camera, this.canvas);
      g.setSize(0.8);
      g.addEventListener('dragging-changed', (e) => {
        const dragging = !!(e as unknown as { value: boolean }).value;
        this.controls.enabled = !dragging;
        if (dragging) this.lightDragId++;
      });
      g.addEventListener('objectChange', () => {
        const o = g.object;
        if (!o || !this.selectedLight) return;
        this.onLightMove?.(this.selectedLight, o.position.toArray(), `light-drag-${this.lightDragId}`);
      });
      g.addEventListener('change', () => this.invalidate());
      this.scene.add(g.getHelper());
      this.lightGizmo = g;
    }
    const h = this.selectedLight ? this.lightHandleMeshes.get(this.selectedLight) : undefined;
    if (h && this.lightHandles.visible) {
      if (this.lightGizmo.object !== h.handle) this.lightGizmo.attach(h.handle);
    } else this.lightGizmo.detach();
  }

  private pickLight(e: PointerEvent): boolean {
    if (!this.lightHandles.visible) return false;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects([...this.lightHandleMeshes.values()].map((h) => h.handle), false)[0];
    if (!hit) return false;
    this.onLightSelect?.(hit.object.userData.lightId as string);
    return true;
  }

  /** The posing skeleton of a figure (null for props or until loaded). */
  figureSkeleton(figureId: string): PoseSkeleton | null {
    return this.figures.get(figureId)?.object.poseSkeleton ?? null;
  }

  /**
   * Body measurements of a figure (PLAN.md section 17.3), taken in its rest
   * pose with its current body shape. Null until loaded, or for props.
   */
  measureFigure(figureId: string): BodyMeasurements | null {
    const entry = this.figures.get(figureId);
    const skel = entry?.object.poseSkeleton;
    if (!entry || !skel) return null;
    const current = this.lastFigures.find((f) => f.id === figureId);
    entry.object.applyPose({});
    const tris = collectTriangles(entry.object.root);
    if (current) entry.object.applyPose(current.pose);
    entry.object.root.updateMatrixWorld(true);
    return measureBody(tris, skel.rest as Record<string, [number, number, number]>);
  }

  /**
   * Height of a figure's lowest point (world space), optionally under a trial
   * pose, from the posed mesh itself. Used to keep a figure's contact height
   * when a pose changes (a kneeling figure stays on the floor, one on a bed
   * stays on the bed).
   */
  lowestPoint(figureId: string, pose?: CanonicalPose): number | null {
    const entry = this.figures.get(figureId);
    if (!entry) return null;
    const object = entry.object;
    const current = this.lastFigures.find((f) => f.id === figureId);
    if (pose) object.applyPose(pose);
    object.root.updateMatrixWorld(true);
    const y = new Box3().setFromObject(object.root, true).min.y;
    if (pose && current) object.applyPose(current.pose);
    object.root.updateMatrixWorld(true);
    return Number.isFinite(y) ? y : null;
  }

  // ---------- Anatomy layer view (placeholder anatomy) ----------

  setAnatomyView(visibility: Record<AnatomyLayer, boolean>, skinOpacity: number): void {
    this.layerVisibility = { ...visibility };
    this.skinOpacity = skinOpacity;
    for (const { object } of this.figures.values()) this.applyAnatomyView(object);
    this.invalidate();
  }

  private applyAnatomyView(object: PosableFigure): void {
    for (const [layer, visible] of Object.entries(this.layerVisibility)) object.setLayerVisible(layer as AnatomyLayer, visible);
    object.setSkinOpacity(this.skinOpacity);
  }

  // ---------- Camera ----------

  setView(view: ViewName): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const dir = new Vector3(...VIEW_DIRECTIONS[view]).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  /** Height of the view at the orbit target (metres). */
  private viewHeight(): number {
    if (this.camera instanceof OrthographicCamera) return (this.ortho.top - this.ortho.bottom) / this.ortho.zoom;
    const dist = this.camera.position.distanceTo(this.controls.target);
    return 2 * dist * Math.tan((this.perspective.fov * Math.PI) / 360);
  }

  /** Sets the view so `height` metres fit at the orbit target, keeping the view direction. */
  private setViewHeight(height: number): void {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (this.camera instanceof OrthographicCamera) {
      this.ortho.zoom = 1;
      this.ortho.top = height / 2;
      this.ortho.bottom = -height / 2;
      this.updateOrthoAspect();
      // Far enough back that nothing in the scene is behind the camera.
      this.camera.position.copy(this.controls.target).addScaledVector(dir, 20);
    } else {
      const dist = height / 2 / Math.tan((this.perspective.fov * Math.PI) / 360);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private updateOrthoAspect(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const aspect = w && h ? w / h : 1;
    const half = (this.ortho.top - this.ortho.bottom) / 2;
    this.ortho.left = -half * aspect;
    this.ortho.right = half * aspect;
    this.ortho.updateProjectionMatrix();
  }

  /**
   * Lens focal length in mm (35mm equivalent), or null for an orthographic
   * view (PLAN.md section 18). The subject keeps its size on screen, so a
   * longer lens moves the camera back and flattens perspective as in a photo.
   */
  setLens(focal: number | null): void {
    const height = this.viewHeight();
    const from = this.camera;
    if (focal === null) {
      this.ortho.position.copy(from.position);
      this.ortho.quaternion.copy(from.quaternion);
      this.camera = this.ortho;
    } else {
      this.perspective.fov = fovFor(focal);
      if (from === this.ortho) {
        this.perspective.position.copy(from.position);
        this.perspective.quaternion.copy(from.quaternion);
      }
      this.camera = this.perspective;
    }
    this.focal = focal;
    this.controls.object = this.camera;
    this.poseTools.setCamera(this.camera);
    this.propGizmo.camera = this.camera;
    if (this.lightGizmo) this.lightGizmo.camera = this.camera;
    this.setViewHeight(height);
    this.onProjectionChange();
    this.invalidate();
  }

  get lens(): number | null {
    return this.focal;
  }

  /** Called after a lens or orthographic switch (post-processing follows the camera). */
  private onProjectionChange = () => {
    if (!this.notan) return;
    const threshold = this.notan.threshold.value;
    this.notan.dispose();
    this.notan = null;
    this.setStudyMode(this.study, threshold);
  };

  /** Where the camera is, for bookmarks. */
  cameraState(): { position: [number, number, number]; target: [number, number, number]; focalLength: number | null; height: number } {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), focalLength: this.focal, height: this.viewHeight() };
  }

  /** Restores a bookmarked camera. */
  setCameraState(state: { position: [number, number, number]; target: [number, number, number]; focalLength: number | null; height?: number }): void {
    if (state.focalLength !== this.focal) this.setLens(state.focalLength);
    this.controls.target.set(...state.target);
    this.camera.position.set(...state.position);
    if (this.camera instanceof OrthographicCamera && state.height) this.setViewHeight(state.height);
    this.controls.update();
    this.invalidate();
  }

  /** Frame everything visible (figures, or the floor area if empty). */
  frameAll(): void {
    const objects: Object3D[] = [...this.figures.values()].filter((f) => f.object.root.visible).map((f) => f.object.root);
    const target = new Vector3(0, 0.9, 0);
    let height = 1.8;
    if (objects.length) {
      const box = new Box3();
      for (const o of objects) box.expandByObject(o, true);
      if (!box.isEmpty()) {
        box.getCenter(target);
        const size = box.getSize(new Vector3());
        // Seen at an angle, the wider side spans roughly three quarters of its length on screen.
        height = Math.max(size.y, (Math.max(size.x, size.z) * 0.75) / Math.max(0.5, this.aspect()));
      }
    }
    this.controls.target.copy(target);
    this.setViewHeight(height * 1.2);
  }

  private aspect(): number {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return w && h ? w / h : 1;
  }

  /** A random view around the figures (PLAN.md section 17: random camera). */
  randomView(random: () => number = Math.random): void {
    const offset = new Spherical(1, ((90 - (-5 + random() * 50)) * Math.PI) / 180, random() * Math.PI * 2);
    this.camera.position.copy(this.controls.target).add(new Vector3().setFromSpherical(offset));
    this.frameAll();
  }

  onCameraChange(listener: (q: Quaternion) => void): () => void {
    this.cameraListeners.add(listener);
    listener(this.camera.quaternion);
    return () => this.cameraListeners.delete(listener);
  }

  // ---------- Quality and rendering ----------

  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.applyQuality();
    for (const [, entry] of this.lights) {
      if (entry.object instanceof DirectionalLight && !quality.shadows) entry.object.castShadow = false;
    }
    this.resize();
  }

  private applyQuality(): void {
    const ratio = Math.min(window.devicePixelRatio * this.quality.pixelRatioScale, this.quality.maxPixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.invalidate();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    this.updateOrthoAspect();
    this.fitBackground();
    this.invalidate();
  }

  invalidate(): void {
    this.needsRender = true;
  }

  /** Called with the interval between consecutive rendered frames (ms). */
  onFrame(listener: (frameMs: number) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private tick(time: number): void {
    if (this.disposed) return;
    // Damping keeps moving the camera for a while after input stops.
    this.controls.update();
    if (!this.needsRender) {
      this.lastFrame = 0;
      return;
    }
    this.needsRender = false;
    this.renderFrame();
    if (this.lastFrame) {
      const ms = time - this.lastFrame;
      for (const l of this.frameListeners) l(ms);
    }
    this.lastFrame = time;
  }

  /** PNG of the current view at the canvas's resolution. */
  /**
   * PNG of the view (PLAN.md section 18: capture), at the view's size or a
   * chosen resolution, with handles, gizmos, and guides left out. A
   * transparent background drops the backdrop and floor.
   */
  async capture(opts: { width?: number; height?: number; transparent?: boolean } = {}): Promise<Blob> {
    const { clientWidth: vw, clientHeight: vh } = this.canvas;
    const width = Math.round(opts.width ?? vw * this.renderer.getPixelRatio());
    const height = Math.round(opts.height ?? vh * this.renderer.getPixelRatio());
    const helpers: Object3D[] = [this.poseTools.group, this.poseTools.helper, this.propGizmo.getHelper(), this.lightHandles, this.guides, this.grid];
    if (this.lightGizmo) helpers.push(this.lightGizmo.getHelper());
    const wasVisible = helpers.map((h) => h.visible);
    const background = this.scene.background;
    const floorVisible = this.floor.visible;
    const ratio = this.renderer.getPixelRatio();
    helpers.forEach((h) => (h.visible = false));
    if (opts.transparent) {
      this.scene.background = null;
      this.floor.visible = false;
      this.renderer.setClearColor(0x000000, 0);
    }
    try {
      // Render at the requested size (the frame keeps the view's framing; a different aspect widens or narrows it).
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.perspective.aspect = width / height;
      this.perspective.updateProjectionMatrix();
      const half = (this.ortho.top - this.ortho.bottom) / 2;
      this.ortho.left = -half * (width / height);
      this.ortho.right = half * (width / height);
      this.ortho.updateProjectionMatrix();
      this.fitBackground(width / height);
      this.renderFrame();
      return await new Promise<Blob>((resolve, reject) => this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), 'image/png'));
    } finally {
      helpers.forEach((h, i) => (h.visible = wasVisible[i]!));
      this.scene.background = background;
      this.floor.visible = floorVisible;
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.setPixelRatio(ratio);
      this.resize();
      this.renderFrame();
    }
  }

  // ---------- Proportion grid (PLAN.md section 18: anatomy overlays) ----------

  private readonly guides = new Group();
  private proportionFigure: string | null = null;

  /**
   * Horizontal lines dividing a figure's height into eight equal "heads"
   * (the classic figure-drawing canon), behind the figure and facing the
   * same way. Null hides it.
   */
  setProportionGrid(figureId: string | null): void {
    this.proportionFigure = figureId;
    this.updateProportionGrid();
  }

  private updateProportionGrid(): void {
    for (const c of [...this.guides.children]) {
      this.guides.remove(c);
      (c as Line).geometry?.dispose();
    }
    const entry = this.proportionFigure ? this.figures.get(this.proportionFigure) : undefined;
    if (!entry) return this.invalidate();
    const root = entry.object.root;
    // The figure's standing height (not the posed bounds, which raised arms would stretch).
    const h = entry.object.height * root.scale.y;
    const base = root.position.y;
    const unit = h / 8;
    const pts: Vector3[] = [];
    const w = 0.45;
    for (let i = 0; i <= 8; i++) {
      const y = base + i * unit;
      pts.push(new Vector3(-w, y, -0.25), new Vector3(w, y, -0.25));
    }
    pts.push(new Vector3(0, base, -0.25), new Vector3(0, base + h, -0.25));
    const lines = new LineSegments(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.6, depthTest: false }));
    lines.renderOrder = 998;
    // Placed at the figure, turned with it.
    lines.position.set(root.position.x, 0, root.position.z);
    lines.quaternion.copy(root.quaternion);
    this.guides.add(lines);
    this.invalidate();
  }

  /** Rough GPU memory estimate for the memory manager. */
  info(): { geometries: number; textures: number; drawCalls: number; triangles: number } {
    const i = this.renderer.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, drawCalls: i.render.drawCalls, triangles: i.render.triangles };
  }

  dispose(): void {
    this.disposed = true;
    void this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.poseTools.dispose();
    for (const id of [...this.figures.keys()]) this.removeFigure(id);
    this.renderer.dispose();
  }
}

/** Vertical field of view (degrees) for a 35mm-equivalent focal length (24 mm frame height). */
export function fovFor(focal: number): number {
  return (2 * Math.atan(12 / focal) * 180) / Math.PI;
}

/** The simple mannequin that stands in for a base figure (Safe Mode, or if it fails to load). */
function mannequinFor(assetId: string): BuiltinFigureId {
  return assetId === 'builtin:base-male' ? 'builtin:male' : 'builtin:female';
}
