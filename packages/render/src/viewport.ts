import type { AssetRigInfo, CanonicalPose, Figure, Light, Prop, Scene as SceneModel } from '@poser/core';
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
  Vector3,
  WebGPURenderer,
  type Object3D,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ImportedFigure } from './figure/imported';
import { BUILTIN_FIGURES, FigureObject, type AnatomyLayer, type BuiltinFigureId } from './figure/mannequin';
import type { PosableFigure } from './figure/types';
import { PoseTools } from './posing/poseTools';
import { ShapeProp, overrideMaterials } from './props/builder';
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

  private readonly figures = new Map<string, { object: PosableFigure; assetId: string; shapeKey?: string }>();
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
  private study: StudyMode = 'normal';
  private notan: NotanPass | null = null;
  private lastModel: SceneModel | null = null;
  /** Built-prop shapes and material settings by prop id. */
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
    this.backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.scene.background = new Color(0x3a3a3a);

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

    this.floor = new Mesh(new CircleGeometry(12, 64), new MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 }));
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
      // Keep the last frame readable for screenshot capture.
      alpha: false,
    });
    renderer.onDeviceLost = (info) => options.onDeviceLost?.({ api: info.api, message: info.message, reason: info.reason });
    await renderer.init();
    renderer.shadowMap.enabled = true;
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
    this.floor.visible = stage.floor ?? model.environment.floor;
    this.grid.visible = stage.grid ?? model.environment.grid;
    (this.scene.background as Color).copy(stage.background ?? new Color(model.environment.background));
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
      const prop = this.propData.get(fig.id);
      const shapeKey = prop?.shape ? JSON.stringify(prop.shape) : undefined;
      if (entry && (entry.assetId !== fig.assetId || entry.shapeKey !== shapeKey)) {
        this.removeFigure(fig.id);
        entry = undefined;
      }
      if (!entry) {
        if (prop?.shape) {
          entry = this.addFigureObject(fig.id, fig.assetId, new ShapeProp(prop.shape, prop.material));
          entry.shapeKey = shapeKey;
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
    // A rebuilt prop (new shape) gets the gizmo back.
    const sel = this.selectedProp ? this.figures.get(this.selectedProp) : undefined;
    if (sel && this.propGizmo && this.propGizmo.object !== sel.object.root) this.selectProp(this.selectedProp, this.propGizmo.mode as 'translate' | 'rotate');
    this.poseTools?.refresh();
  }

  private addFigureObject(id: string, assetId: string, object: PosableFigure) {
    const entry: { object: PosableFigure; assetId: string; shapeKey?: string } = { object, assetId };
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
    // Imported props are recoloured once the study mode's own materials come off.
    if (!(object instanceof ShapeProp) && this.study !== 'normal') return;
    object.root.userData.materialKey = key;
    if (object instanceof ShapeProp) {
      if (prop.material) object.setMaterial(prop.material);
    } else overrideMaterials(object.root, prop.material ?? null);
  }

  /** Loads an imported model in the background, then shows it with the latest scene state. */
  private loadImported(figureId: string, assetId: string): void {
    if (this.loading.get(figureId) === assetId || !this.assetLoader) return;
    this.loading.set(figureId, assetId);
    this.assetLoader(assetId)
      .then(async (asset) => {
        if (!asset || this.disposed || this.loading.get(figureId) !== assetId) return;
        const object = await ImportedFigure.load(asset.model, asset.rig);
        this.loading.delete(figureId);
        const fig = this.lastFigures.find((f) => f.id === figureId);
        if (!fig || fig.assetId !== assetId || this.disposed) {
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
  }

  /** The posing skeleton of a figure (null for props or until loaded). */
  figureSkeleton(figureId: string): PoseSkeleton | null {
    return this.figures.get(figureId)?.object.poseSkeleton ?? null;
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
  async capture(): Promise<Blob> {
    this.renderFrame();
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), 'image/png'),
    );
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
