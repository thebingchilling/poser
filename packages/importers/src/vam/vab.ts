import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, SkinnedMesh, SRGBColorSpace, TextureLoader, Vector3, type Material } from 'three';

/**
 * VaM clothing and hair items: `.vam` (item info, JSON), `.vaj` (settings
 * and materials, JSON), and `.vab` (the mesh, binary). The `.vab` layout
 * follows the open-source Blender importer by my12doom (import_vab): eight
 * strings, vertices, material names, polygons (material, side count,
 * vertex indices), the same polygons again with UV indices, then UVs.
 */

export interface VabMesh {
  positions: Float32Array;
  materials: string[];
  /** Polygons: material index and vertex / UV indices (same length). */
  polygons: { material: number; vertices: number[]; uvs: number[] }[];
  uvs: Float32Array;
}

class Reader {
  private o = 0;
  private readonly dv: DataView;
  constructor(private readonly buf: ArrayBuffer) {
    this.dv = new DataView(buf);
  }
  get remaining() {
    return this.buf.byteLength - this.o;
  }
  i32(): number {
    if (this.remaining < 4) throw new Error('truncated');
    const v = this.dv.getInt32(this.o, true);
    this.o += 4;
    return v;
  }
  f32(): number {
    if (this.remaining < 4) throw new Error('truncated');
    const v = this.dv.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  /** A .NET BinaryWriter string: 7-bit-encoded length, then UTF-8. */
  str(): string {
    let len = 0;
    let shift = 0;
    for (;;) {
      if (this.remaining < 1) throw new Error('truncated');
      const b = this.dv.getUint8(this.o++);
      len |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    if (len > this.remaining) throw new Error('truncated');
    const s = new TextDecoder().decode(new Uint8Array(this.buf, this.o, len));
    this.o += len;
    return s;
  }
  count(max: number): number {
    const n = this.i32();
    if (n < 0 || n > max) throw new Error('bad count');
    return n;
  }
}

export function parseVab(buffer: ArrayBuffer): VabMesh {
  const r = new Reader(buffer);
  try {
    for (let i = 0; i < 8; i++) r.str();
    const nv = r.count(r.remaining / 12);
    const positions = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) positions[i] = r.f32();
    const nm = r.count(10000);
    const materials = Array.from({ length: nm }, () => r.str());
    const nf = r.count(r.remaining / 12);
    const polygons: VabMesh['polygons'] = [];
    for (let i = 0; i < nf; i++) {
      const material = r.i32();
      const sides = r.count(64);
      const vertices = Array.from({ length: sides }, () => r.i32());
      if (vertices.some((v) => v < 0 || v >= nv) || material < 0 || material >= Math.max(1, nm)) throw new Error('bad polygon');
      polygons.push({ material, vertices, uvs: [] });
    }
    for (let i = 0; i < nf; i++) {
      r.i32();
      const sides = r.count(64);
      polygons[i]!.uvs = Array.from({ length: sides }, () => r.i32());
    }
    const nuv = r.count(r.remaining / 8);
    const uvs = new Float32Array(nuv * 2);
    for (let i = 0; i < nuv * 2; i++) uvs[i] = r.f32();
    for (const p of polygons) if (p.uvs.length !== p.vertices.length || p.uvs.some((u) => u < 0 || u >= nuv)) p.uvs = [];
    return { positions, materials, polygons, uvs };
  } catch {
    throw new Error('This VaM item’s mesh (.vab) has a layout that couldn’t be read (VaM hair is stored differently from clothing). Please send it as a sample so support can be added.');
  }
}

/**
 * Triangulated geometry with one material group per VaM material. Vertices
 * are split where UVs differ; `sourceVertex` maps back to .vab vertices.
 * Positions are scaled to centimetres (VaM stores metres) and mirrored from
 * Unity's left-handed space when `mirror` is set.
 */
export function vabGeometry(vab: VabMesh, mirror: boolean): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const source: number[] = [];
  const key = new Map<string, number>();
  const byMaterial = new Map<number, number[]>();
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 1; i < vab.positions.length; i += 3) (maxY = Math.max(maxY, vab.positions[i]!)), (minY = Math.min(minY, vab.positions[i]!));
  // A person is under 3 units tall in metres; in centimetres, well over.
  const scale = maxY - minY < 5 ? 100 : 1;
  const vert = (v: number, t: number | undefined) => {
    const k = `${v}/${t ?? -1}`;
    let idx = key.get(k);
    if (idx === undefined) {
      idx = source.length;
      key.set(k, idx);
      source.push(v);
      pos.push(vab.positions[v * 3]! * scale * (mirror ? -1 : 1), vab.positions[v * 3 + 1]! * scale, vab.positions[v * 3 + 2]! * scale);
      uv.push(t === undefined ? 0 : vab.uvs[t * 2]!, t === undefined ? 0 : vab.uvs[t * 2 + 1]!);
    }
    return idx;
  };
  for (const p of vab.polygons) {
    const list = byMaterial.get(p.material) ?? [];
    const ids = p.vertices.map((v, i) => vert(v, p.uvs[i]));
    for (let i = 1; i + 1 < ids.length; i++) {
      // Mirroring flips the winding; swap to keep faces pointing out.
      if (mirror) list.push(ids[0]!, ids[i + 1]!, ids[i]!);
      else list.push(ids[0]!, ids[i]!, ids[i + 1]!);
    }
    byMaterial.set(p.material, list);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  const index: number[] = [];
  for (const [m, list] of [...byMaterial].sort((a, b) => a[0] - b[0])) {
    g.addGroup(index.length, list.length, m);
    index.push(...list);
  }
  g.setIndex(index);
  g.computeVertexNormals();
  g.userData.sourceVertex = Int32Array.from(source);
  return g;
}

/** Texture paths in a .vaj (or a look's item storables), by material name and map. */
export function vajTextures(json: unknown): { material?: string; map: 'diffuse' | 'normal' | 'alpha'; url: string }[] {
  const out: { material?: string; map: 'diffuse' | 'normal' | 'alpha'; url: string }[] = [];
  const visit = (node: unknown, material?: string) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, material));
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : material;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /\.(png|jpe?g|tiff?|tga|webp)$/i.test(v)) {
        const map = /normal|bump/i.test(k) ? 'normal' : /alpha|cutout|transparen/i.test(k) ? 'alpha' : /diffuse|main|color|decal/i.test(k) || /url$/i.test(k) ? 'diffuse' : null;
        if (map) out.push({ material: id, map, url: v });
      } else visit(v, id);
    }
  };
  visit(json);
  return out;
}

/** Builds a mesh for a VaM item with its materials and textures. */
export async function buildVabItem(
  name: string,
  vab: VabMesh,
  options: { mirror: boolean; textures: { material?: string; map: 'diffuse' | 'normal' | 'alpha'; url: string }[]; read: (url: string) => Promise<Blob | null> },
): Promise<{ mesh: Mesh; warnings: string[] }> {
  const warnings: string[] = [];
  const geometry = vabGeometry(vab, options.mirror);
  const materials: Material[] = (vab.materials.length ? vab.materials : [name]).map((m) => new MeshStandardMaterial({ name: m, color: 0xbdb6ae, roughness: 0.8, side: 2 }));
  const loaded = new Map<string, Promise<unknown>>();
  for (const t of options.textures) {
    if (typeof document === 'undefined') break;
    const targets = materials.filter((m) => !t.material || t.material.toLowerCase().includes(m.name.toLowerCase())) as MeshStandardMaterial[];
    const use = targets.length ? targets : (materials as MeshStandardMaterial[]);
    let p = loaded.get(t.url);
    if (!p) {
      p = options.read(t.url).then(async (blob) => {
        if (!blob) {
          warnings.push(`Missing texture ${t.url.split('/').pop()}`);
          return null;
        }
        const url = URL.createObjectURL(blob);
        return new TextureLoader().loadAsync(url).finally(() => URL.revokeObjectURL(url));
      });
      loaded.set(t.url, p);
    }
    const tex = (await p) as import('three').Texture | null;
    if (!tex) continue;
    for (const m of use) {
      if (t.map === 'diffuse' && !m.map) {
        tex.colorSpace = SRGBColorSpace;
        m.map = tex;
        m.color.set(0xffffff);
      } else if (t.map === 'normal' && !m.normalMap) m.normalMap = tex;
      else if (t.map === 'alpha' && !m.alphaMap) {
        m.alphaMap = tex;
        m.alphaTest = 0.5;
      }
      m.needsUpdate = true;
    }
  }
  const mesh = new Mesh(geometry, materials);
  mesh.name = name;
  return { mesh, warnings };
}

/**
 * Wraps an item onto a skinned body the way VaM's skin wrap does, simplified:
 * each item vertex follows the skin weights of the nearest body vertex.
 * Returns the mean distance to the body (to pick the right mirroring).
 */
export function wrapToBody(item: Mesh, body: SkinnedMesh): SkinnedMesh {
  const g = item.geometry;
  const bodyPos = body.geometry.attributes.position as BufferAttribute;
  const bi = body.geometry.attributes.skinIndex as BufferAttribute;
  const bw = body.geometry.attributes.skinWeight as BufferAttribute;
  const near = nearestVertices(g.attributes.position as BufferAttribute, bodyPos);
  const n = g.attributes.position!.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = near.index[i]!;
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = bi.getComponent(j, k);
      sw[i * 4 + k] = bw.getComponent(j, k);
    }
  }
  g.setAttribute('skinIndex', new BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  const skinned = new SkinnedMesh(g, item.material);
  skinned.name = item.name;
  skinned.bind(body.skeleton, body.bindMatrix);
  return skinned;
}

/** Nearest body vertex for each item vertex (grid search) and the mean distance. */
export function nearestVertices(points: BufferAttribute, body: BufferAttribute): { index: Uint32Array; mean: number } {
  const cell = 4; // cm
  const grid = new Map<string, number[]>();
  const k = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let j = 0; j < body.count; j++) {
    const key = k(body.getX(j), body.getY(j), body.getZ(j));
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(j);
  }
  const out = new Uint32Array(points.count);
  const p = new Vector3();
  let total = 0;
  for (let i = 0; i < points.count; i++) {
    p.fromBufferAttribute(points, i);
    let best = -1;
    let bestD = Infinity;
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    for (let r = 0; r < 64 && best < 0; r++) {
      // Search shells of cells outward until something is found (then one more shell to be sure).
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
              const d = (body.getX(j) - p.x) ** 2 + (body.getY(j) - p.y) ** 2 + (body.getZ(j) - p.z) ** 2;
              if (d < bestD) (bestD = d), (best = j);
            }
          }
      if (best >= 0 && r === 0) {
        // Neighbouring cells may hold a closer vertex.
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
                const d = (body.getX(j) - p.x) ** 2 + (body.getY(j) - p.y) ** 2 + (body.getZ(j) - p.z) ** 2;
                if (d < bestD) (bestD = d), (best = j);
              }
      }
    }
    out[i] = Math.max(0, best);
    total += Math.sqrt(bestD);
  }
  return { index: out, mean: points.count ? total / points.count : Infinity };
}

export function vabGroup(meshes: Mesh[], name: string): Group {
  const g = new Group();
  g.name = name;
  for (const m of meshes) g.add(m);
  return g;
}
