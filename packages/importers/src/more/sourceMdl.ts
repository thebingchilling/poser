import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3, type Texture } from 'three';

/**
 * Compiled Source engine models (Source Filmmaker, Garry's Mod, workshop
 * downloads): `.mdl` (bones, body parts, materials) with `.vvd` (vertices
 * and skin weights) and `.vtx` (triangles) beside it. Versions 44–49 are
 * read; the first level of detail and body part choice are used.
 *
 * Source is Z-up in inches; models come out Y-up in metres (the same
 * cyclic axis swap as .smd, so handedness is kept).
 */

const INCH = 0.0254;
const SWAP = new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
const SWAP_INV = SWAP.clone().invert();

export interface SourceFiles {
  mdl: ArrayBuffer;
  vvd: ArrayBuffer | null;
  vtx: ArrayBuffer | null;
}

function cstr(buf: ArrayBuffer, offset: number): string {
  const b = new Uint8Array(buf);
  let end = offset;
  while (end < b.length && b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(offset, end));
}

interface MdlInfo {
  version: number;
  name: string;
  bones: { name: string; parent: number; world: Matrix4 }[];
  textures: string[];
  textureDirs: string[];
  skin: number[];
  bodyParts: { name: string; models: { name: string; vertexStart: number; meshes: { material: number; vertexOffset: number }[] }[] }[];
}

export function parseMdl(buf: ArrayBuffer): MdlInfo {
  const dv = new DataView(buf);
  if (buf.byteLength < 240 || cstr(buf, 0).slice(0, 4) !== 'IDST') throw new Error('Not a Source engine model (.mdl).');
  const version = dv.getInt32(4, true);
  if (version < 44 || version > 49) throw new Error(`Source model version ${version} isn’t supported (44–49 are).`);
  const i32 = (o: number) => dv.getInt32(o, true);
  const name = cstr(buf, 12);

  const bones: MdlInfo['bones'] = [];
  const nb = i32(156);
  const bi = i32(160);
  for (let i = 0; i < nb; i++) {
    const o = bi + i * 216;
    // poseToBone is the inverse of the bone's world transform at rest (3×4, rows).
    const m = new Matrix4();
    const r = (k: number) => dv.getFloat32(o + 96 + k * 4, true);
    m.set(r(0), r(1), r(2), r(3), r(4), r(5), r(6), r(7), r(8), r(9), r(10), r(11), 0, 0, 0, 1);
    bones.push({ name: cstr(buf, o + i32(o)), parent: i32(o + 4), world: m.invert() });
  }

  const textures: string[] = [];
  const nt = i32(204);
  const ti = i32(208);
  for (let i = 0; i < nt; i++) textures.push(cstr(buf, ti + i * 64 + i32(ti + i * 64)));
  const textureDirs: string[] = [];
  const nd = i32(212);
  const di = i32(216);
  for (let i = 0; i < nd; i++) textureDirs.push(cstr(buf, i32(di + i * 4)));
  const skinRefs = i32(220);
  const si = i32(228);
  const skin = Array.from({ length: skinRefs }, (_, i) => dv.getInt16(si + i * 2, true));

  const bodyParts: MdlInfo['bodyParts'] = [];
  const nbp = i32(232);
  const bpi = i32(236);
  for (let p = 0; p < nbp; p++) {
    const bo = bpi + p * 16;
    const models: MdlInfo['bodyParts'][number]['models'] = [];
    const nm = i32(bo + 4);
    const mi = bo + i32(bo + 12);
    for (let m = 0; m < nm; m++) {
      const mo = mi + m * 148;
      const meshes: { material: number; vertexOffset: number }[] = [];
      const nmesh = i32(mo + 72);
      const meshIndex = mo + i32(mo + 76);
      for (let k = 0; k < nmesh; k++) {
        const me = meshIndex + k * 116;
        meshes.push({ material: i32(me), vertexOffset: i32(me + 12) });
      }
      models.push({ name: cstr(buf, mo), vertexStart: i32(mo + 84) / 48, meshes });
    }
    bodyParts.push({ name: cstr(buf, bo + i32(bo)), models });
  }
  return { version, name, bones, textures, textureDirs, skin, bodyParts };
}

interface VvdVertex {
  weights: number[];
  bones: number[];
  pos: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
}

export function parseVvd(buf: ArrayBuffer): VvdVertex[] {
  const dv = new DataView(buf);
  if (cstr(buf, 0).slice(0, 4) !== 'IDSV') throw new Error('The model’s .vvd file is not valid.');
  const lod0 = dv.getInt32(16, true);
  const numFixups = dv.getInt32(48, true);
  const fixupStart = dv.getInt32(52, true);
  const dataStart = dv.getInt32(56, true);
  const read = (i: number): VvdVertex => {
    const o = dataStart + i * 48;
    const n = dv.getUint8(o + 15);
    const weights: number[] = [];
    const bones: number[] = [];
    for (let k = 0; k < Math.min(3, n); k++) {
      weights.push(dv.getFloat32(o + k * 4, true));
      bones.push(dv.getUint8(o + 12 + k));
    }
    const f = (k: number) => dv.getFloat32(o + 16 + k * 4, true);
    return { weights, bones, pos: [f(0), f(1), f(2)], normal: [f(3), f(4), f(5)], uv: [f(6), f(7)] };
  };
  const out: VvdVertex[] = [];
  if (!numFixups) for (let i = 0; i < lod0; i++) out.push(read(i));
  else
    for (let f = 0; f < numFixups; f++) {
      const o = fixupStart + f * 12;
      // Every fixup applies to LOD 0 (fixups list the vertices each LOD and the finer ones use).
      const src = dv.getInt32(o + 4, true);
      const n = dv.getInt32(o + 8, true);
      for (let i = 0; i < n; i++) out.push(read(src + i));
    }
  return out;
}

/** Triangles per body part / model / mesh as original mesh vertex ids, from the .vtx (LOD 0). */
export function parseVtx(buf: ArrayBuffer, mdlVersion: number): number[][][][] {
  const dv = new DataView(buf);
  const i32 = (o: number) => dv.getInt32(o, true);
  if (i32(0) !== 7) throw new Error('The model’s .vtx file is not a version this app reads.');
  // Newer compilers add topology fields to each strip group (33 bytes instead of 25).
  const tryRead = (groupSize: number) => {
    const parts: number[][][][] = [];
    const nbp = i32(28);
    const bpo = i32(32);
    for (let p = 0; p < nbp; p++) {
      const bo = bpo + p * 8;
      const models: number[][][] = [];
      const nm = i32(bo);
      const mo0 = bo + i32(bo + 4);
      for (let m = 0; m < nm; m++) {
        const mo = mo0 + m * 8;
        const lodo = mo + i32(mo + 4); // LOD 0
        const meshes: number[][] = [];
        if (i32(mo) > 0) {
          const nmesh = i32(lodo);
          const meo0 = lodo + i32(lodo + 4);
          for (let k = 0; k < nmesh; k++) {
            const meo = meo0 + k * 9;
            const tris: number[] = [];
            const ng = i32(meo);
            const go0 = meo + i32(meo + 4);
            for (let g = 0; g < ng; g++) {
              const go = go0 + g * groupSize;
              const nv = i32(go);
              const vo = go + i32(go + 4);
              const ni = i32(go + 8);
              const io = go + i32(go + 12);
              if (nv < 0 || ni < 0 || ni % 3 || vo + nv * 9 > buf.byteLength || io + ni * 2 > buf.byteLength) throw new RangeError('bad strip group');
              for (let t = 0; t < ni; t++) {
                const v = dv.getUint16(io + t * 2, true);
                if (v >= nv) throw new RangeError('bad index');
                tris.push(dv.getUint16(vo + v * 9 + 4, true));
              }
            }
            meshes.push(tris);
          }
        }
        models.push(meshes);
      }
      parts.push(models);
    }
    return parts;
  };
  const sizes = mdlVersion >= 49 ? [25, 33] : [25, 33];
  for (const size of sizes) {
    try {
      return tryRead(size);
    } catch {
      // Try the other layout.
    }
  }
  throw new Error('The model’s .vtx file couldn’t be read.');
}

/** Builds the model; `material` returns a texture (or null) for a material path like "models/x/skin". */
export function buildSource(files: SourceFiles, material: (paths: string[]) => { map: Texture | null; translucent: boolean }): { root: Group; warnings: string[] } {
  const warnings: string[] = [];
  const mdl = parseMdl(files.mdl);
  if (!files.vvd || !files.vtx) throw new Error('This Source model’s mesh is in the .vvd and .vtx files beside the .mdl. Drop all three (or the folder) together.');
  const verts = parseVvd(files.vvd);
  const tris = parseVtx(files.vtx, mdl.version);

  // Bones: rest transforms in Source axes → three axes and metres.
  const bones = mdl.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    return bone;
  });
  const world = mdl.bones.map((b) => {
    const m = SWAP.clone().multiply(b.world).multiply(SWAP_INV);
    return m.setPosition(new Vector3().setFromMatrixPosition(m).multiplyScalar(INCH));
  });
  const roots: Bone[] = [];
  mdl.bones.forEach((b, i) => {
    const p = b.parent >= 0 && b.parent < bones.length ? b.parent : -1;
    const local = p >= 0 ? world[p]!.clone().invert().multiply(world[i]!) : world[i]!.clone();
    local.decompose(bones[i]!.position, bones[i]!.quaternion, bones[i]!.scale);
    if (p >= 0) bones[p]!.add(bones[i]!);
    else roots.push(bones[i]!);
  });

  const materialCache = new Map<number, MeshStandardMaterial>();
  const materialFor = (index: number) => {
    const tex = mdl.skin[index] ?? index;
    let m = materialCache.get(tex);
    if (!m) {
      const name = mdl.textures[tex] ?? `material ${tex}`;
      const paths = (mdl.textureDirs.length ? mdl.textureDirs : ['']).map((d) => `materials/${d}${name}`.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase());
      const found = material(paths);
      if (!found.map) warnings.push(`Missing texture for ${name.split(/[\\/]/).pop()}`);
      m = new MeshStandardMaterial({ name: name.split(/[\\/]/).pop(), map: found.map, color: found.map ? 0xffffff : 0xbcbcbc, roughness: 0.8, alphaTest: found.translucent ? 0.5 : 0, side: DoubleSide });
      materialCache.set(tex, m);
    }
    return m;
  };

  const root = new Group();
  root.name = mdl.name.split(/[\\/]/).pop()!.replace(/\.mdl$/i, '');
  // Static props carry a single "static_prop" bone: they're plain meshes.
  const skeleton = bones.length > 1 ? new Skeleton(bones) : null;
  let first: SkinnedMesh | null = null;
  const hidden: string[] = [];
  mdl.bodyParts.forEach((part, p) => {
    // Body parts with several models are choices (heads, outfits); the first is used.
    if (part.models.length > 1) hidden.push(part.name);
    const model = part.models[0];
    if (!model) return;
    model.meshes.forEach((mesh, k) => {
      const list = tris[p]?.[0]?.[k];
      if (!list?.length) return;
      const base = model.vertexStart + mesh.vertexOffset;
      const remap = new Map<number, number>();
      const pos: number[] = [];
      const nor: number[] = [];
      const uv: number[] = [];
      const si: number[] = [];
      const sw: number[] = [];
      const index: number[] = [];
      for (const id of list) {
        let v = remap.get(id);
        if (v === undefined) {
          const src = verts[base + id];
          if (!src) continue;
          v = pos.length / 3;
          remap.set(id, v);
          pos.push(src.pos[1] * INCH, src.pos[2] * INCH, src.pos[0] * INCH);
          nor.push(src.normal[1], src.normal[2], src.normal[0]);
          uv.push(src.uv[0], 1 - src.uv[1]);
          for (let w = 0; w < 4; w++) {
            si.push(src.bones[w] ?? 0);
            sw.push(src.weights[w] ?? 0);
          }
        }
        index.push(v);
      }
      // Source triangles wind clockwise; three expects counter-clockwise.
      for (let t = 0; t + 2 < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2]!, index[t + 1]!];
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
      g.setIndex(index);
      const mat = materialFor(mesh.material);
      let obj: Mesh;
      if (skeleton) {
        g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(si), 4));
        g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4));
        obj = new SkinnedMesh(g, mat);
        first ??= obj as SkinnedMesh;
      } else obj = new Mesh(g, mat);
      obj.name = `${model.name || part.name}`.split(/[\\/]/).pop()!.replace(/\.smd$/i, '');
      root.add(obj);
    });
  });
  if (hidden.length) warnings.push(`Only the first choice of ${hidden.join(', ')} was imported.`);
  if (skeleton && first) {
    for (const b of roots) (first as SkinnedMesh).add(b);
    root.updateMatrixWorld(true);
    root.traverse((o) => o instanceof SkinnedMesh && o.bind(skeleton));
  }
  return { root, warnings };
}
