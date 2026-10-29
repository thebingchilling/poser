import type { MaterialType, PropMaterial, PropShape, ShapeKind } from '@poser/core';
import {
  BoxGeometry,
  CylinderGeometry,
  DataTexture,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three/webgpu';
import type { PosableFigure } from '../figure/types';

/**
 * Props made in the app (PLAN.md section 17.6): blocking shapes sized in
 * centimetres, and simple furniture. Everything is
 * built from primitives, so it is ours to ship (CC0). The origin is at the
 * centre of the base, on the floor.
 */

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  platform: 'Platform',
  steps: 'Steps',
  ramp: 'Ramp',
  pole: 'Pole',
  ring: 'Ring',
  bar: 'Bar',
  wall: 'Wall',
  bed: 'Bed',
  sofa: 'Sofa',
  chair: 'Chair',
  table: 'Table',
  stool: 'Stool',
  cabinet: 'Cabinet',
  rug: 'Rug',
  lamp: 'Floor lamp',
};

/** Shapes offered in the prop builder. */
export const BUILDER_SHAPES: ShapeKind[] = ['box', 'cylinder', 'sphere', 'platform', 'steps', 'ramp', 'pole', 'ring', 'bar', 'wall', 'bed', 'sofa', 'chair', 'table', 'stool', 'cabinet', 'rug', 'lamp'];

/** Default size (m) and material for each shape. */
export const SHAPE_DEFAULTS: Record<ShapeKind, { size: [number, number, number]; material: PropMaterial; steps?: number }> = {
  box: { size: [0.5, 0.5, 0.5], material: { type: 'matte', color: '#9a9a9a' } },
  cylinder: { size: [0.4, 0.6, 0.4], material: { type: 'matte', color: '#9a9a9a' } },
  sphere: { size: [0.4, 0.4, 0.4], material: { type: 'matte', color: '#9a9a9a' } },
  platform: { size: [1.2, 0.2, 0.8], material: { type: 'wood', color: '#8a6a4a' } },
  steps: { size: [0.9, 0.6, 0.9], steps: 3, material: { type: 'wood', color: '#8a6a4a' } },
  ramp: { size: [0.8, 0.4, 1.2], material: { type: 'wood', color: '#8a6a4a' } },
  pole: { size: [0.05, 2.4, 0.05], material: { type: 'metal', color: '#c8c8c8' } },
  ring: { size: [0.3, 0.3, 0.03], material: { type: 'metal', color: '#c8c8c8' } },
  bar: { size: [1.2, 1.8, 0.04], material: { type: 'metal', color: '#c8c8c8' } },
  wall: { size: [3, 2.6, 0.12], material: { type: 'matte', color: '#d9d2c8' } },
  bed: { size: [1.6, 0.55, 2.1], material: { type: 'fabric', color: '#e8e4dc', accent: '#6b4c35' } },
  sofa: { size: [2, 0.85, 0.9], material: { type: 'fabric', color: '#5f6b7a', accent: '#3a3a3a' } },
  chair: { size: [0.48, 0.9, 0.5], material: { type: 'wood', color: '#8a6a4a', accent: '#8a6a4a' } },
  table: { size: [1.4, 0.75, 0.8], material: { type: 'wood', color: '#8a6a4a', accent: '#6b4c35' } },
  stool: { size: [0.4, 0.5, 0.4], material: { type: 'wood', color: '#8a6a4a' } },
  cabinet: { size: [1, 0.85, 0.45], material: { type: 'wood', color: '#7a5a3e', accent: '#c8c8c8' } },
  rug: { size: [2, 0.01, 1.4], material: { type: 'fabric', color: '#8a3d3d' } },
  lamp: { size: [0.4, 1.6, 0.4], material: { type: 'fabric', color: '#efe6d2', accent: '#2a2a2a' } },
};

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  matte: 'Matte',
  wood: 'Wood',
  metal: 'Metal',
  plastic: 'Plastic',
  fabric: 'Fabric',
  leather: 'Leather',
  latex: 'Latex',
  rubber: 'Rubber',
  stone: 'Stone',
  glass: 'Glass',
};

const TYPE_PARAMS: Record<MaterialType, { roughness: number; metalness: number; opacity?: number }> = {
  matte: { roughness: 0.9, metalness: 0 },
  wood: { roughness: 0.65, metalness: 0 },
  metal: { roughness: 0.3, metalness: 1 },
  plastic: { roughness: 0.35, metalness: 0 },
  fabric: { roughness: 0.95, metalness: 0 },
  leather: { roughness: 0.5, metalness: 0 },
  latex: { roughness: 0.12, metalness: 0 },
  rubber: { roughness: 0.8, metalness: 0 },
  stone: { roughness: 0.92, metalness: 0 },
  glass: { roughness: 0.05, metalness: 0, opacity: 0.3 },
};

const patternCache = new Map<string, DataTexture>();

/** A small repeating pattern texture (stripes or checks) in two colours. */
function patternTexture(pattern: 'stripes' | 'checks', a: string, b: string): DataTexture {
  const key = `${pattern}${a}${b}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const n = 16;
  const data = new Uint8Array(n * n * 4);
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ca = rgb(a);
  const cb = rgb(b);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = pattern === 'stripes' ? x < n / 2 : (x < n / 2) !== (y < n / 2);
      const c = on ? ca : cb;
      data.set([c[0]!, c[1]!, c[2]!, 255], (y * n + x) * 4);
    }
  const tex = new DataTexture(data, n, n);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  patternCache.set(key, tex);
  return tex;
}

/** Applies material settings to a standard material. */
export function configureMaterial(m: MeshStandardMaterial, settings: PropMaterial, colorOverride?: string): void {
  const t = TYPE_PARAMS[settings.type];
  const pattern = settings.pattern && settings.pattern !== 'solid' && !colorOverride;
  m.map = pattern ? patternTexture(settings.pattern as 'stripes' | 'checks', settings.color, settings.patternColor ?? '#ffffff') : null;
  m.color.set(pattern ? '#ffffff' : (colorOverride ?? settings.color));
  m.roughness = settings.shine !== undefined ? 1 - settings.shine : t.roughness;
  m.metalness = t.metalness;
  m.transparent = t.opacity !== undefined;
  m.opacity = t.opacity ?? 1;
  m.depthWrite = t.opacity === undefined;
  m.needsUpdate = true;
}

type Part = { geo: BufferGeometry; x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; role?: 'main' | 'accent' | 'soft' };

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, role: Part['role'] = 'main'): Part {
  return { geo: new BoxGeometry(w, h, d), x, y: y + h / 2, z, role };
}

function cyl(r: number, h: number, x = 0, y = 0, z = 0, role: Part['role'] = 'main', seg = 24): Part {
  return { geo: new CylinderGeometry(r, r, h, seg), x, y: y + h / 2, z, role };
}

function legs(w: number, d: number, h: number, t: number, inset: number, role: Part['role'] = 'accent'): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(t, h, t, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), role));
  return out;
}

/** Geometry parts for a shape (origin at the centre of the base). */
function shapeParts(shape: PropShape): Part[] {
  const [w, h, d] = shape.size;
  switch (shape.kind) {
    case 'box':
    case 'platform':
    case 'wall':
    case 'rug':
      return [box(w, h, d)];
    case 'cylinder': {
      const p = cyl(w / 2, h, 0, 0, 0, 'main', 40);
      p.geo.scale(1, 1, d / w);
      return [p];
    }
    case 'sphere': {
      const g = new SphereGeometry(0.5, 40, 24);
      g.scale(w, h, d);
      return [{ geo: g, y: h / 2 }];
    }
    case 'steps': {
      const n = Math.max(1, Math.round(shape.steps ?? 3));
      return Array.from({ length: n }, (_, i) => box(w, (h * (i + 1)) / n, d / n, 0, 0, d / 2 - (d / n) * (i + 0.5)));
    }
    case 'ramp': {
      // A wedge rising toward −Z, extruded across the width.
      const s = new Shape([new Vector2(-d / 2, 0), new Vector2(d / 2, 0), new Vector2(-d / 2, h)]);
      const g = new ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2);
      g.rotateY(Math.PI / 2);
      return [{ geo: g }];
    }
    case 'pole':
      return [cyl(w / 2, h)];
    case 'ring':
      return [{ geo: new TorusGeometry(w / 2 - d / 2, d / 2, 16, 48), y: w / 2 }];
    case 'bar': {
      const g = new CylinderGeometry(d / 2, d / 2, w, 24);
      g.rotateZ(Math.PI / 2);
      return [{ geo: g, y: h }];
    }
    case 'bed': {
      const frame = 0.25;
      return [
        box(w, frame, d, 0, 0.08, 0, 'accent'),
        ...legs(w, d, 0.08, 0.08, 0.06),
        box(w - 0.04, h - frame - 0.08, d - 0.04, 0, frame + 0.08, 0.02, 'main'),
        box(w, 1.0, 0.08, 0, 0, -d / 2 - 0.02, 'accent'),
        box(w * 0.38, 0.12, 0.4, -w * 0.22, h, -d / 2 + 0.3, 'soft'),
        box(w * 0.38, 0.12, 0.4, w * 0.22, h, -d / 2 + 0.3, 'soft'),
      ];
    }
    case 'sofa': {
      const seat = 0.42;
      return [
        box(w, seat - 0.12, d, 0, 0.1, 0, 'accent'),
        ...legs(w, d, 0.1, 0.06, 0.08),
        box(w - 0.36, 0.14, d - 0.2, 0, seat - 0.02, 0.08, 'main'),
        box(w, h - 0.1, 0.22, 0, 0.1, -d / 2 + 0.11, 'main'),
        box(0.18, 0.62 - 0.1, d, -w / 2 + 0.09, 0.1, 0, 'main'),
        box(0.18, 0.62 - 0.1, d, w / 2 - 0.09, 0.1, 0, 'main'),
      ];
    }
    case 'chair': {
      const seat = 0.46;
      return [...legs(w, d, seat - 0.04, 0.04, 0.03), box(w, 0.04, d, 0, seat - 0.04, 0), box(w, h - seat, 0.04, 0, seat, -d / 2 + 0.02, 'accent')];
    }
    case 'table':
      return [box(w, 0.04, d, 0, h - 0.04, 0), ...legs(w, d, h - 0.04, 0.06, 0.06)];
    case 'stool':
      return [cyl(w / 2, 0.05, 0, h - 0.05, 0), ...legs(w * 0.7, d * 0.7, h - 0.05, 0.035, 0.03, 'main')];
    case 'cabinet':
      return [
        box(w, h - 0.08, d, 0, 0.08, 0),
        ...legs(w, d, 0.08, 0.05, 0.04, 'main'),
        ...[0.3, 0.6].map((f) => box(w * 0.25, 0.02, 0.02, 0, 0.08 + (h - 0.08) * f, d / 2 + 0.01, 'accent')),
      ];
    case 'lamp': {
      const shade = new LatheGeometry([new Vector2(w / 2, 0), new Vector2(w * 0.32, 0.3)], 32);
      return [cyl(w * 0.35, 0.03, 0, 0, 0, 'accent'), cyl(0.012, h - 0.25, 0, 0.03, 0, 'accent'), { geo: shade, y: h - 0.3, role: 'main' }];
    }
  }
}

/** A built prop in the viewport: same interface as figures, without a rig. */
export class ShapeProp implements PosableFigure {
  readonly root = new Group();
  readonly poseSkeleton = null;
  readonly height: number;
  private readonly materials: { main: MeshStandardMaterial; accent: MeshStandardMaterial; soft: MeshStandardMaterial };

  constructor(shape: PropShape, material?: PropMaterial) {
    this.height = shape.size[1];
    this.materials = { main: new MeshStandardMaterial(), accent: new MeshStandardMaterial(), soft: new MeshStandardMaterial() };
    this.setMaterial(material ?? SHAPE_DEFAULTS[shape.kind].material);
    for (const p of shapeParts(shape)) {
      const mesh = new Mesh(p.geo, this.materials[p.role ?? 'main']);
      mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
      mesh.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    this.root.userData.height = this.height;
  }

  setMaterial(m: PropMaterial): void {
    configureMaterial(this.materials.main, m);
    const accentType: MaterialType = m.type === 'glass' || m.type === 'metal' ? 'metal' : m.type === 'fabric' ? 'wood' : m.type;
    configureMaterial(this.materials.accent, { type: accentType, color: m.accent ?? m.color }, m.accent ?? m.color);
    configureMaterial(this.materials.soft, { type: 'fabric', color: '#f4f1ea' }, '#f4f1ea');
  }

  applyPose(): void {}
  setMorphs(): void {}
  setLayerVisible(): void {}
  setSkinOpacity(): void {}

  dispose(): void {
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

/**
 * Recolours an imported prop: every mesh gets the colour (multiplied with
 * its texture) and the type's surface; null restores the originals.
 */
export function overrideMaterials(root: Object3D, settings: PropMaterial | null): void {
  root.traverse((o) => {
    const mesh = o as Mesh & { userData: { originalMaterial?: Material | Material[] } };
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    if (!settings) {
      if (mesh.userData.originalMaterial) {
        mesh.material = mesh.userData.originalMaterial;
        delete mesh.userData.originalMaterial;
      }
      return;
    }
    mesh.userData.originalMaterial ??= mesh.material;
    const orig = mesh.userData.originalMaterial;
    const first = (Array.isArray(orig) ? orig[0] : orig) as MeshStandardMaterial;
    let m = mesh.material as MeshStandardMaterial;
    if (m === orig || Array.isArray(m)) {
      m = new MeshStandardMaterial();
      mesh.material = m;
    }
    configureMaterial(m, settings);
    // Keep the original texture under the new colour unless a pattern replaces it.
    if (!m.map && first?.map) m.map = first.map;
    m.needsUpdate = true;
  });
}
