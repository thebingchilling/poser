import type { MaterialType, PropMaterial } from '@poser/core';
import { DataTexture, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Material, type Object3D } from 'three/webgpu';

/**
 * Recolour and material editor for imported props (PLAN.md section 17.6):
 * colour, surface type, shine, and simple patterns.
 */

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
