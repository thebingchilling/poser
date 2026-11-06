import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, type Texture } from 'three';

/**
 * XNALara / XPS models: `.xps` (binary with a header), `generic_item.mesh`
 * (binary, no header), and `.mesh.ascii` (text). Bones are stored at
 * absolute positions; each mesh lists its textures (the first is the
 * colour map), vertices with up to four (or, in newer files, any number
 * of) bone weights, and triangles.
 *
 * The binary layout changed between versions (tangents dropped, weight
 * counts made variable), and the header's flags aren't always reliable,
 * so each layout is tried and the one that reads the file exactly is kept.
 */

export interface XpsModel {
  bones: { name: string; parent: number; position: [number, number, number] }[];
  meshes: {
    name: string;
    textures: string[];
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    skin: { bones: number[]; weights: number[] }[];
    indices: Uint32Array;
  }[];
}

class Reader {
  o = 0;
  readonly dv: DataView;
  constructor(readonly buf: ArrayBuffer) {
    this.dv = new DataView(buf);
  }
  need(n: number) {
    if (n < 0 || this.o + n > this.buf.byteLength) throw new RangeError('truncated');
  }
  u8() {
    this.need(1);
    return this.dv.getUint8(this.o++);
  }
  i16() {
    this.need(2);
    const v = this.dv.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.dv.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.dv.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.dv.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  str() {
    const a = this.u8();
    const len = a >= 128 ? (a % 128) + this.u8() * 128 : a;
    this.need(len);
    const s = new TextDecoder().decode(new Uint8Array(this.buf, this.o, len));
    this.o += len;
    return s;
  }
  count(perItem: number) {
    const n = this.u32();
    if (n * perItem > this.buf.byteLength - this.o) throw new RangeError('bad count');
    return n;
  }
}

/** Reads the .xps header; returns where the model data starts and the version. */
function readHeader(r: Reader): { major: number; minor: number } | null {
  if (r.buf.byteLength < 8 || r.dv.getUint32(0, true) !== 323232) return null;
  r.u32();
  const major = r.u16();
  const minor = r.u16();
  r.str(); // "XNAaraL"
  const settings = r.u32();
  r.str(); // machine
  r.str(); // user
  r.str(); // file
  r.need(settings * 4);
  r.o += settings * 4;
  return { major, minor };
}

function readBody(r: Reader, tangents: boolean, variableWeights: boolean): XpsModel {
  const bones: XpsModel['bones'] = [];
  const nb = r.count(15);
  for (let i = 0; i < nb; i++) bones.push({ name: r.str(), parent: r.i16(), position: [r.f32(), r.f32(), r.f32()] });
  const meshes: XpsModel['meshes'] = [];
  const nm = r.count(13);
  for (let m = 0; m < nm; m++) {
    const name = r.str();
    const uvLayers = r.u32();
    if (uvLayers > 16) throw new RangeError('bad uv layers');
    const nt = r.count(5);
    const textures: string[] = [];
    for (let t = 0; t < nt; t++) {
      textures.push(r.str());
      r.u32();
    }
    const nv = r.count(28);
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    const skin: XpsModel['meshes'][number]['skin'] = [];
    for (let v = 0; v < nv; v++) {
      positions[v * 3] = r.f32();
      positions[v * 3 + 1] = r.f32();
      positions[v * 3 + 2] = r.f32();
      normals[v * 3] = r.f32();
      normals[v * 3 + 1] = r.f32();
      normals[v * 3 + 2] = r.f32();
      r.u32(); // colour
      for (let l = 0; l < uvLayers; l++) {
        const u = r.f32();
        const w = r.f32();
        if (l === 0) (uvs[v * 2] = u), (uvs[v * 2 + 1] = 1 - w);
      }
      if (tangents) {
        r.need(16 * uvLayers);
        r.o += 16 * uvLayers;
      }
      if (nb) {
        const n = variableWeights ? r.i16() : 4;
        if (n < 0 || n > 64) throw new RangeError('bad weight count');
        const ids = Array.from({ length: n }, () => r.i16());
        const ws = Array.from({ length: n }, () => r.f32());
        if (ids.some((b) => b < 0 || b >= nb) || ws.some((w) => !Number.isFinite(w))) throw new RangeError('bad weights');
        skin.push({ bones: ids, weights: ws });
      }
    }
    const nf = r.count(12);
    const indices = new Uint32Array(nf * 3);
    for (let i = 0; i < nf * 3; i++) {
      indices[i] = r.u32();
      if (indices[i]! >= nv) throw new RangeError('bad index');
    }
    meshes.push({ name, textures, positions, normals, uvs, skin, indices });
  }
  return { bones, meshes };
}

export function parseXpsBinary(buffer: ArrayBuffer): XpsModel {
  const probe = new Reader(buffer);
  const header = readHeader(probe);
  const start = probe.o;
  // Old files (up to 2.12) carry tangents; version 3 files have variable weight counts. Try the likely layout first.
  const likely: [boolean, boolean] = header ? [header.major <= 2 && header.minor <= 12, header.major >= 3] : [true, false];
  const layouts: [boolean, boolean][] = [likely, [true, false], [false, false], [false, true], [true, true]];
  let partial: XpsModel | null = null;
  for (const [tangents, variable] of layouts) {
    const r = new Reader(buffer);
    r.o = start;
    try {
      const model = readBody(r, tangents, variable);
      // Some files end with extra data (a pose); a layout that read everything up to it is accepted.
      if (r.o === buffer.byteLength) return model;
      partial ??= model;
    } catch {
      // Try the next layout.
    }
  }
  if (partial) return partial;
  throw new Error('This XNALara model couldn’t be read (an unknown version of the format).');
}

/** The text form (.mesh.ascii): one value group per line, `#` comments. */
export function parseXpsAscii(text: string): XpsModel {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter((l) => l.length);
  let i = 0;
  const line = () => {
    if (i >= lines.length) throw new Error('This .mesh.ascii file ends too early.');
    return lines[i++]!;
  };
  const nums = () => line().split(/\s+/).map(Number);
  const bones: XpsModel['bones'] = [];
  const nb = Number(line());
  for (let b = 0; b < nb; b++) {
    const name = line();
    const parent = Number(line());
    const p = nums();
    bones.push({ name, parent, position: [p[0]!, p[1]!, p[2]!] });
  }
  const meshes: XpsModel['meshes'] = [];
  const nm = Number(line());
  for (let m = 0; m < nm; m++) {
    const name = line();
    const uvLayers = Number(line());
    const nt = Number(line());
    const textures: string[] = [];
    for (let t = 0; t < nt; t++) {
      textures.push(line());
      line();
    }
    const nv = Number(line());
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    const skin: XpsModel['meshes'][number]['skin'] = [];
    for (let v = 0; v < nv; v++) {
      positions.set(nums().slice(0, 3), v * 3);
      normals.set(nums().slice(0, 3), v * 3);
      line(); // colour
      for (let l = 0; l < uvLayers; l++) {
        const uv = nums();
        if (l === 0) (uvs[v * 2] = uv[0]!), (uvs[v * 2 + 1] = 1 - uv[1]!);
      }
      if (nb) {
        const ids = nums();
        const ws = nums();
        skin.push({ bones: ids, weights: ws });
      }
    }
    const nf = Number(line());
    const indices = new Uint32Array(nf * 3);
    for (let f = 0; f < nf; f++) indices.set(nums().slice(0, 3), f * 3);
    meshes.push({ name, textures, positions, normals, uvs, skin, indices });
  }
  if (!Number.isInteger(nb) || !Number.isInteger(nm)) throw new Error('This .mesh.ascii file is not in a format that can be read.');
  return { bones, meshes };
}

/** XNALara mesh names carry render settings ("1_Body_0.4_0.4"); the readable part is kept. */
function meshLabel(name: string): string {
  const parts = name.split('_');
  if (parts.length > 1 && /^\d+$/.test(parts[0]!)) return parts.slice(1).filter((p) => !/^-?[\d.]+$/.test(p)).join(' ') || name;
  return name;
}

export function buildXps(model: XpsModel, texture: (path: string) => Texture | null): Group {
  const root = new Group();
  const bones = model.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    return bone;
  });
  const top: Bone[] = [];
  model.bones.forEach((b, i) => {
    const p = b.parent >= 0 && b.parent < bones.length && b.parent !== i ? b.parent : -1;
    const pp = p >= 0 ? model.bones[p]!.position : [0, 0, 0];
    bones[i]!.position.set(b.position[0] - pp[0]!, b.position[1] - pp[1]!, b.position[2] - pp[2]!);
    if (p >= 0 && !isAncestor(model, i, p)) bones[p]!.add(bones[i]!);
    else top.push(bones[i]!);
  });
  const skeleton = bones.length ? new Skeleton(bones) : null;
  let first: SkinnedMesh | null = null;
  for (const m of model.meshes) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new BufferAttribute(m.normals, 3));
    g.setAttribute('uv', new BufferAttribute(m.uvs, 2));
    g.setIndex(new BufferAttribute(m.indices, 1));
    const colour = m.textures.find((t) => !/(bump|normal|_nm\b|_n\.|light|mask|spec)/i.test(t)) ?? m.textures[0];
    const normalMap = m.textures.find((t) => /(bump|normal|_nm\b|_n\.)/i.test(t));
    const map = colour ? texture(colour) : null;
    if (map) map.colorSpace = SRGBColorSpace;
    const material = new MeshStandardMaterial({
      name: meshLabel(m.name),
      map,
      normalMap: normalMap ? texture(normalMap) : null,
      roughness: 0.8,
      alphaTest: map && /\.(png|tga|dds)$/i.test(colour!) ? 0.5 : 0,
      side: DoubleSide,
    });
    let mesh: Mesh;
    if (skeleton && m.skin.length === m.positions.length / 3) {
      const n = m.skin.length;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      m.skin.forEach((s, v) => {
        // Keep the four strongest influences.
        const order = s.weights.map((w, k) => [w, s.bones[k]!] as const).sort((a, b) => b[0] - a[0]).slice(0, 4);
        const total = order.reduce((t, [w]) => t + w, 0) || 1;
        order.forEach(([w, b], k) => {
          si[v * 4 + k] = b;
          sw[v * 4 + k] = w / total;
        });
      });
      g.setAttribute('skinIndex', new BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
      mesh = new SkinnedMesh(g, material);
      first ??= mesh as SkinnedMesh;
    } else {
      g.computeVertexNormals();
      mesh = new Mesh(g, material);
    }
    mesh.name = meshLabel(m.name);
    root.add(mesh);
  }
  if (skeleton && first) {
    for (const b of top) first.add(b);
    root.updateMatrixWorld(true);
    // Every mesh shares the one skeleton (bones live under the first mesh).
    root.traverse((o) => o instanceof SkinnedMesh && o.bind(skeleton));
  }
  return root;
}

function isAncestor(model: XpsModel, bone: number, of: number): boolean {
  for (let p = of, guard = 0; p >= 0 && guard < model.bones.length; guard++) {
    if (p === bone) return true;
    p = model.bones[p]!.parent;
  }
  return false;
}
