import { Bone, BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, type Texture } from 'three';

/**
 * MikuMikuDance models: PMX (2.0/2.1) and the older PMD. Read: geometry,
 * UVs, skin weights (SDEF and QDEF read as plain blends), bones, vertex
 * morphs, and materials with their textures. Physics, IK chains, and
 * display frames aren't needed for posing and are skipped.
 *
 * MMD is left-handed with one unit = 8 cm; models come out in metres,
 * right-handed, facing +Z. "D" bones that copy another bone's rotation
 * (足D following 足, used by most modern rigs to carry the skin) are folded
 * into the bone they copy, so posing the main bone moves the mesh; the
 * upper body (上半身), which MMD keeps beside the lower body, is moved under
 * it so turning the hips turns the whole figure.
 */

const UNIT = 0.08;

export interface MmdModel {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  indices: Uint32Array;
  textures: string[];
  materials: { name: string; diffuse: [number, number, number, number]; texture: number; faces: number; doubleSided: boolean }[];
  bones: { name: string; parent: number; position: [number, number, number]; inheritFrom: number; inheritRatio: number; inheritRotation: boolean }[];
  morphs: { name: string; offsets: { vertex: number; delta: [number, number, number] }[] }[];
  skipped: string[];
}

class Reader {
  o = 0;
  readonly dv: DataView;
  constructor(readonly buf: ArrayBuffer) {
    this.dv = new DataView(buf);
  }
  need(n: number) {
    if (this.o + n > this.buf.byteLength) throw new Error('This MMD model is damaged or incomplete.');
  }
  u8() {
    this.need(1);
    return this.dv.getUint8(this.o++);
  }
  i8() {
    this.need(1);
    return this.dv.getInt8(this.o++);
  }
  u16() {
    this.need(2);
    const v = this.dv.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  i16() {
    this.need(2);
    const v = this.dv.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.dv.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.dv.getInt32(this.o, true);
    this.o += 4;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.dv.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  f(n: number): number[] {
    return Array.from({ length: n }, () => this.f32());
  }
  bytes(n: number) {
    this.need(n);
    const b = new Uint8Array(this.buf, this.o, n);
    this.o += n;
    return b;
  }
  /** Signed index of 1, 2, or 4 bytes (-1 = none). */
  index(size: number) {
    return size === 1 ? this.i8() : size === 2 ? this.i16() : this.i32();
  }
  /** Vertex index: unsigned for 1 and 2 bytes. */
  vertex(size: number) {
    return size === 1 ? this.u8() : size === 2 ? this.u16() : this.i32();
  }
}

function sjis(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  const b = end < 0 ? bytes : bytes.subarray(0, end);
  try {
    return new TextDecoder('shift_jis').decode(b).trim();
  } catch {
    return new TextDecoder().decode(b).trim();
  }
}

export function parsePmx(buffer: ArrayBuffer): MmdModel {
  const r = new Reader(buffer);
  const magic = new TextDecoder().decode(r.bytes(4));
  if (magic !== 'PMX ') throw new Error('Not a PMX file.');
  r.f32();
  const g = Array.from({ length: r.u8() }, () => r.u8());
  const [encoding, addUv, vSize, tSize, mSize, bSize, morphSize] = g as [number, number, number, number, number, number, number];
  const dec = new TextDecoder(encoding === 0 ? 'utf-16le' : 'utf-8');
  const text = () => dec.decode(r.bytes(r.i32()));
  const name = text();
  const nameEn = text();
  text();
  text();
  const skipped: string[] = [];

  const nv = r.i32();
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  let sdef = 0;
  for (let i = 0; i < nv; i++) {
    positions.set(r.f(3), i * 3);
    normals.set(r.f(3), i * 3);
    uvs.set(r.f(2), i * 2);
    r.o += addUv * 16;
    const type = r.u8();
    const setW = (bones: number[], weights: number[]) => {
      for (let k = 0; k < 4; k++) {
        skinIndex[i * 4 + k] = Math.max(0, bones[k] ?? 0);
        skinWeight[i * 4 + k] = (bones[k] ?? -1) < 0 ? 0 : (weights[k] ?? 0);
      }
    };
    if (type === 0) setW([r.index(bSize)], [1]);
    else if (type === 1 || type === 3) {
      const b = [r.index(bSize), r.index(bSize)];
      const w = r.f32();
      setW(b, [w, 1 - w]);
      if (type === 3) {
        r.o += 36; // SDEF C, R0, R1: spherical blending, read as a plain blend.
        sdef++;
      }
    } else if (type === 2 || type === 4) {
      const b = [r.index(bSize), r.index(bSize), r.index(bSize), r.index(bSize)];
      setW(b, r.f(4));
    } else throw new Error('This PMX model uses a skin weight type that isn’t known.');
    r.f32(); // edge scale
  }
  if (sdef) skipped.push(`${sdef} vertices use spherical skinning (SDEF), read as ordinary blending`);

  const ni = r.i32();
  const indices = new Uint32Array(ni);
  for (let i = 0; i < ni; i++) indices[i] = r.vertex(vSize);

  const textures = Array.from({ length: r.i32() }, () => text());

  const materials: MmdModel['materials'] = [];
  const nm = r.i32();
  for (let i = 0; i < nm; i++) {
    const mName = text();
    text();
    const diffuse = r.f(4) as [number, number, number, number];
    r.f(3);
    r.f32();
    r.f(3);
    const flags = r.u8();
    r.f(4);
    r.f32();
    const texture = r.index(tSize);
    r.index(tSize); // sphere map
    r.u8();
    const toonShared = r.u8();
    if (toonShared === 0) r.index(tSize);
    else r.u8();
    text();
    const faces = r.i32();
    materials.push({ name: mName, diffuse, texture, faces, doubleSided: !!(flags & 1) });
  }

  const bones: MmdModel['bones'] = [];
  const nb = r.i32();
  for (let i = 0; i < nb; i++) {
    const bName = text();
    text();
    const p = r.f(3) as [number, number, number];
    const parent = r.index(bSize);
    r.i32(); // layer
    const flags = r.u16();
    if (flags & 0x1) r.index(bSize);
    else r.f(3);
    let inheritFrom = -1;
    let inheritRatio = 0;
    if (flags & 0x300) {
      inheritFrom = r.index(bSize);
      inheritRatio = r.f32();
    }
    if (flags & 0x400) r.f(3);
    if (flags & 0x800) r.f(6);
    if (flags & 0x2000) r.i32();
    if (flags & 0x20) {
      r.index(bSize);
      r.i32();
      r.f32();
      const links = r.i32();
      for (let k = 0; k < links; k++) {
        r.index(bSize);
        if (r.u8()) r.f(6);
      }
    }
    bones.push({ name: bName, parent, position: p, inheritFrom, inheritRatio, inheritRotation: !!(flags & 0x100) });
  }

  const morphs: MmdModel['morphs'] = [];
  let otherMorphs = 0;
  const nmo = r.i32();
  for (let i = 0; i < nmo; i++) {
    const mName = text();
    text();
    r.u8();
    const type = r.u8();
    const n = r.i32();
    if (type === 1) {
      const offsets: MmdModel['morphs'][number]['offsets'] = [];
      for (let k = 0; k < n; k++) offsets.push({ vertex: r.vertex(vSize), delta: r.f(3) as [number, number, number] });
      morphs.push({ name: mName, offsets });
      continue;
    }
    otherMorphs++;
    const per =
      type === 0 || type === 9 ? morphSize + 4
      : type === 2 ? bSize + 28
      : type >= 3 && type <= 7 ? vSize + 16
      : type === 8 ? mSize + 113
      : type === 10 ? (g[7] ?? 4) + 25
      : -1;
    if (per < 0) break;
    r.o += per * n;
  }
  if (otherMorphs) skipped.push(`${otherMorphs} group, bone, UV, or material morphs (only shape morphs are kept)`);
  return { name: name || nameEn, positions, normals, uvs, skinIndex, skinWeight, indices, textures, materials, bones, morphs, skipped };
}

export function parsePmd(buffer: ArrayBuffer): MmdModel {
  const r = new Reader(buffer);
  if (new TextDecoder().decode(r.bytes(3)) !== 'Pmd') throw new Error('Not a PMD file.');
  r.f32();
  const name = sjis(r.bytes(20));
  r.bytes(256);
  const nv = r.u32();
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    positions.set(r.f(3), i * 3);
    normals.set(r.f(3), i * 3);
    uvs.set(r.f(2), i * 2);
    skinIndex[i * 4] = r.u16();
    skinIndex[i * 4 + 1] = r.u16();
    const w = r.u8() / 100;
    skinWeight[i * 4] = w;
    skinWeight[i * 4 + 1] = 1 - w;
    r.u8();
  }
  const ni = r.u32();
  const indices = new Uint32Array(ni);
  for (let i = 0; i < ni; i++) indices[i] = r.u16();
  const textures: string[] = [];
  const materials: MmdModel['materials'] = [];
  const nm = r.u32();
  for (let i = 0; i < nm; i++) {
    const diffuse = r.f(4) as [number, number, number, number];
    r.f32();
    r.f(3);
    r.f(3);
    r.u8();
    r.u8();
    const faces = r.u32();
    // "body.png*sphere.sph": the texture, then an optional sphere map.
    const file = sjis(r.bytes(20)).split('*').find((f) => f && !/\.sp[ha]$/i.test(f));
    let texture = -1;
    if (file) {
      texture = textures.indexOf(file);
      if (texture < 0) texture = textures.push(file) - 1;
    }
    materials.push({ name: `Material ${i + 1}`, diffuse, texture, faces, doubleSided: diffuse[3] < 1 });
  }
  const bones: MmdModel['bones'] = [];
  const nb = r.u16();
  for (let i = 0; i < nb; i++) {
    const bName = sjis(r.bytes(20));
    const parent = r.u16();
    r.u16();
    const type = r.u8();
    const ik = r.u16();
    const p = r.f(3) as [number, number, number];
    // Type 5: rotation follows another bone (the "IK parent" field holds it); type 9 follows partially.
    bones.push({ name: bName, parent: parent === 0xffff ? -1 : parent, position: p, inheritFrom: type === 5 ? ik : -1, inheritRatio: type === 5 ? 1 : 0, inheritRotation: type === 5 });
  }
  const nik = r.u16();
  for (let i = 0; i < nik; i++) {
    r.u16();
    r.u16();
    const len = r.u8();
    r.u16();
    r.f32();
    r.o += len * 2;
  }
  const morphs: MmdModel['morphs'] = [];
  const ns = r.u16();
  let base: number[] = [];
  for (let i = 0; i < ns; i++) {
    const mName = sjis(r.bytes(20));
    const n = r.u32();
    const type = r.u8();
    const list: { vertex: number; delta: [number, number, number] }[] = [];
    for (let k = 0; k < n; k++) list.push({ vertex: r.u32(), delta: r.f(3) as [number, number, number] });
    // The "base" morph lists which vertices the others index into.
    if (type === 0) base = list.map((x) => x.vertex);
    else morphs.push({ name: mName, offsets: list.map((x) => ({ vertex: base[x.vertex] ?? 0, delta: x.delta })) });
  }
  return { name, positions, normals, uvs, skinIndex, skinWeight, indices, textures, materials, bones, morphs, skipped: [] };
}

/**
 * Older models have no 上半身2 (chest): one is added halfway between the
 * upper body and the neck, carrying the neck and shoulders, so the chest
 * can bend on its own like on other rigs.
 */
function withChestBone(model: MmdModel): MmdModel {
  const idx = (n: string) => model.bones.findIndex((b) => b.name.normalize('NFKC') === n);
  const upper = idx('上半身');
  const neck = idx('首');
  if (idx('上半身2') >= 0 || upper < 0 || neck < 0 || model.bones[neck]!.parent !== upper) return model;
  const u = model.bones[upper]!.position;
  const n = model.bones[neck]!.position;
  const chest = model.bones.length;
  const bones = model.bones.map((b) => (b.parent === upper && /^(首|左肩|右肩)$/.test(b.name.normalize('NFKC')) ? { ...b, parent: chest } : b));
  bones.push({ name: '上半身2', parent: upper, position: [(u[0] + n[0]) / 2, (u[1] + n[1]) / 2, (u[2] + n[2]) / 2], inheritFrom: -1, inheritRatio: 0, inheritRotation: false });
  return { ...model, bones };
}

/** Builds a skinned figure from a parsed MMD model. `texture` loads a texture by its path in the model. */
export function buildMmd(source: MmdModel, texture: (path: string) => Texture | null): Group {
  const model = withChestBone(source);
  const nb = model.bones.length;
  const pos = (i: number) => model.bones[i]!.position;
  const near = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 0.02;

  // Fold "D" bones (full rotation copies at the same place) into the bone they copy.
  const remap = Int32Array.from({ length: nb }, (_, i) => i);
  model.bones.forEach((b, i) => {
    if (b.inheritRotation && Math.abs(b.inheritRatio - 1) < 1e-4 && b.inheritFrom >= 0 && b.inheritFrom < nb && near(b.position, pos(b.inheritFrom))) remap[i] = b.inheritFrom;
  });
  for (let i = 0; i < nb; i++) {
    let j = remap[i]!;
    for (let guard = 0; remap[j] !== j && guard < 8; guard++) j = remap[j]!;
    remap[i] = j;
  }

  const parents = model.bones.map((b) => (b.parent >= 0 && b.parent < nb ? b.parent : -1));
  const byName = new Map(model.bones.map((b, i) => [b.name.normalize('NFKC'), i]));
  const lower = byName.get('下半身');
  const upper = byName.get('上半身');
  if (lower !== undefined && upper !== undefined && parents[upper] === parents[lower]) parents[upper] = lower;

  const bones = model.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    return bone;
  });
  const roots: Bone[] = [];
  model.bones.forEach((b, i) => {
    const p = parents[i]!;
    // Guard against loops in damaged files.
    let up = p;
    let loops = false;
    for (let guard = 0; up >= 0 && guard < nb; guard++) {
      if (up === i) {
        loops = true;
        break;
      }
      up = parents[up]!;
    }
    const parentPos = p >= 0 && !loops ? pos(p) : [0, 0, 0];
    bones[i]!.position.set((b.position[0] - parentPos[0]!) * UNIT, (b.position[1] - parentPos[1]!) * UNIT, -(b.position[2] - parentPos[2]!) * UNIT);
    if (p >= 0 && !loops) bones[p]!.add(bones[i]!);
    else roots.push(bones[i]!);
  });

  const n = model.positions.length / 3;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    position[i * 3] = model.positions[i * 3]! * UNIT;
    position[i * 3 + 1] = model.positions[i * 3 + 1]! * UNIT;
    position[i * 3 + 2] = -model.positions[i * 3 + 2]! * UNIT;
    normal[i * 3] = model.normals[i * 3]!;
    normal[i * 3 + 1] = model.normals[i * 3 + 1]!;
    normal[i * 3 + 2] = -model.normals[i * 3 + 2]!;
  }
  const uv = new Float32Array(model.uvs.length);
  // MMD UVs start at the top; glTF/three at the bottom.
  for (let i = 0; i < n; i++) (uv[i * 2] = model.uvs[i * 2]!), (uv[i * 2 + 1] = 1 - model.uvs[i * 2 + 1]!);
  const skinIndex = model.skinIndex.map((b) => (b < nb ? remap[b]! : 0));
  // Mirroring z flips winding.
  const index = new Uint32Array(model.indices.length);
  for (let i = 0; i + 2 < model.indices.length; i += 3) (index[i] = model.indices[i]!), (index[i + 1] = model.indices[i + 2]!), (index[i + 2] = model.indices[i + 1]!);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(model.skinWeight, 4));
  geometry.setIndex(new BufferAttribute(index, 1));
  let start = 0;
  model.materials.forEach((m, i) => {
    geometry.addGroup(start, m.faces, i);
    start += m.faces;
  });

  if (model.morphs.length) {
    geometry.morphAttributes.position = model.morphs.map((m) => {
      const a = new Float32Array(n * 3);
      for (const { vertex, delta } of m.offsets)
        if (vertex < n) (a[vertex * 3] = delta[0] * UNIT), (a[vertex * 3 + 1] = delta[1] * UNIT), (a[vertex * 3 + 2] = -delta[2] * UNIT);
      return new BufferAttribute(a, 3);
    });
    geometry.morphTargetsRelative = true;
  }

  const materials = model.materials.map((m) => {
    const tex = m.texture >= 0 && model.textures[m.texture] ? texture(model.textures[m.texture]!) : null;
    if (tex) tex.colorSpace = SRGBColorSpace;
    const cutout = !!tex && /\.(png|tga|dds)$/i.test(model.textures[m.texture]!);
    return new MeshStandardMaterial({
      name: m.name,
      color: tex ? 0xffffff : (m.diffuse[0] * 255) << 16 | (m.diffuse[1] * 255) << 8 | (m.diffuse[2] * 255),
      map: tex,
      roughness: 0.8,
      transparent: m.diffuse[3] < 0.999,
      opacity: m.diffuse[3],
      alphaTest: cutout ? 0.5 : 0,
      side: m.doubleSided ? DoubleSide : FrontSide,
    });
  });

  const mesh = new SkinnedMesh(geometry, materials);
  mesh.name = model.name || 'MMD model';
  if (model.morphs.length) {
    mesh.morphTargetDictionary = Object.fromEntries(model.morphs.map((m, i) => [m.name || `Morph ${i + 1}`, i]));
    mesh.morphTargetInfluences = model.morphs.map(() => 0);
  }
  const root = new Group();
  root.name = mesh.name;
  for (const b of roots) mesh.add(b);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return root;
}
