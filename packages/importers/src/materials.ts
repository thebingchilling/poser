import { Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture, type Object3D } from 'three';

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap', 'lightMap', 'displacementMap'] as const;

function imageReady(t: Texture): boolean {
  const img = t.image as { width?: number; naturalWidth?: number; data?: unknown } | undefined;
  if (!img) return false;
  if ('naturalWidth' in img && img.naturalWidth === 0) return false;
  return (img.width ?? 0) > 0 || !!img.data;
}

/**
 * Prepares materials for the internal GLB: textures whose image never
 * arrived are dropped (the model imports without them, with a warning), and
 * older material types (Phong, Lambert from OBJ, FBX, Collada) become the
 * standard PBR material that glTF and the renderer expect.
 */
export function prepareMaterials(root: Object3D): string[] {
  const warnings: string[] = [];
  const converted = new Map<Material, Material>();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const next = list.map((m: Material) => {
      const record = m as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const t = record[slot];
        if (t instanceof Texture && !imageReady(t)) {
          record[slot] = null;
          m.needsUpdate = true;
          warnings.push(`A ${slot === 'map' ? 'colour' : slot.replace('Map', '')} texture was missing and was left out`);
        }
      }
      if (m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial) return m;
      let c = converted.get(m);
      if (!c) {
        const src = m as unknown as { color?: MeshStandardMaterial['color']; map?: Texture | null; normalMap?: Texture | null; shininess?: number; emissive?: MeshStandardMaterial['color']; alphaMap?: Texture | null };
        const std = new MeshStandardMaterial({
          name: m.name,
          transparent: m.transparent,
          opacity: m.opacity,
          side: m.side,
          // Phong shininess (0-1000ish) to roughness.
          roughness: src.shininess !== undefined ? Math.max(0.15, 1 - Math.sqrt(src.shininess / 100)) : 0.7,
          metalness: 0,
        });
        if (src.color) std.color.copy(src.color);
        if (src.emissive) std.emissive.copy(src.emissive);
        std.map = src.map ?? null;
        std.normalMap = src.normalMap ?? null;
        std.alphaMap = src.alphaMap ?? null;
        converted.set(m, std);
        c = std;
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0]!;
  });
  return [...new Set(warnings)];
}
