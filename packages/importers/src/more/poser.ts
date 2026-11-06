import { gunzipSync } from 'fflate';
import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, type Texture } from 'three';
import { MissingContentError, readContent, type ContentSource } from '../content';

/**
 * Poser content: figures (.cr2), props and hair (.pp2, .hr2), and scenes
 * (.pz3), plain or compressed (.crz, .ppz, .hrz, .pzz). These are text
 * files of nested `{ }` blocks. A figure's mesh is an OBJ in the Runtime's
 * Geometries folder, grouped by body part; each part ("actor") has a joint
 * centre (origin) and a parent. Props carry their mesh inline or point at
 * an OBJ.
 *
 * Read: the mesh, the actor skeleton, dial-set morphs (baked in), and
 * materials with their colour textures. Each body part follows its own
 * bone; vertices on the seam between two parts are shared half and half.
 * Poser's own joint smoothing (zones, weight maps) isn't reproduced, so
 * bends are sharper than in Poser. One Poser unit is 8.6 feet.
 */

const PNU = 2.62128;

export interface PoserNode {
  key: string;
  value: string;
  children: PoserNode[];
}

export function decodePoser(bytes: Uint8Array): string {
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return new TextDecoder('latin1').decode(data);
}

/** Parses the brace tree: each line is "key value…", a `{` line opens the previous line's block. */
export function parsePoserTree(text: string): PoserNode[] {
  const root: PoserNode = { key: '', value: '', children: [] };
  const stack: PoserNode[] = [root];
  let last: PoserNode | null = null;
  for (const raw of text.split(/\r?\n|\r/)) {
    // Braces may share a line with other words in hand-edited files.
    const parts = raw.trim().split(/(?=[{}])|(?<=[{}])/).map((p) => p.trim()).filter(Boolean);
    for (const line of parts) {
      if (line === '{') {
        const parent = last ?? { key: '', value: '', children: [] };
        if (!last) stack[stack.length - 1]!.children.push(parent);
        stack.push(parent);
        last = null;
      } else if (line === '}') {
        if (stack.length > 1) stack.pop();
        last = null;
      } else {
        const sp = line.search(/\s/);
        const node: PoserNode = { key: sp < 0 ? line : line.slice(0, sp), value: sp < 0 ? '' : line.slice(sp + 1).trim(), children: [] };
        stack[stack.length - 1]!.children.push(node);
        last = node;
      }
    }
  }
  // Files are wrapped in one outer block.
  return root.children.length === 1 && !root.children[0]!.key ? root.children[0]!.children : root.children;
}

const find = (n: PoserNode[], key: string) => n.find((c) => c.key === key);
const all = (n: PoserNode[], key: string) => n.filter((c) => c.key === key);
const nums = (s: string) => s.split(/\s+/).map(Number);

/** ":Runtime:Geometries:V4:v4.obj" or "Runtime\\Geometries\\…" → "Runtime/Geometries/…". */
export function poserPath(p: string): string {
  let s = p.trim().replace(/^"|"$/g, '');
  if (s.includes(':') && !/^[A-Za-z]:[\\/]/.test(s)) s = s.split(':').filter(Boolean).join('/');
  s = s.replace(/\\/g, '/');
  const i = s.toLowerCase().indexOf('runtime/');
  return i >= 0 ? s.slice(i) : s.replace(/^\/+/, '');
}

interface ObjData {
  v: number[];
  vt: number[];
  faces: { v: number[]; t: number[]; group: string; material: string }[];
}

/** A small OBJ reader that keeps each face's group (the body part) and material. */
export function parseObjText(text: string): ObjData {
  const v: number[] = [];
  const vt: number[] = [];
  const faces: ObjData['faces'] = [];
  let group = '';
  let material = '';
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.indexOf(' ');
    const key = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    if (key === 'v') v.push(...nums(rest).slice(0, 3));
    else if (key === 'vt') vt.push(...nums(rest).slice(0, 2));
    else if (key === 'g') group = rest.split(/\s+/)[0] ?? '';
    else if (key === 'usemtl') material = rest;
    else if (key === 'f') {
      const fv: number[] = [];
      const ft: number[] = [];
      for (const tok of rest.split(/\s+/)) {
        const [a, b] = tok.split('/');
        const vi = Number(a);
        fv.push(vi < 0 ? v.length / 3 + vi : vi - 1);
        const ti = b ? Number(b) : NaN;
        ft.push(Number.isFinite(ti) ? (ti < 0 ? vt.length / 2 + ti : ti - 1) : -1);
      }
      faces.push({ v: fv, t: ft, group, material });
    }
  }
  return { v, vt, faces };
}

interface Actor {
  id: string;
  name: string;
  parent: string;
  origin: [number, number, number];
  geometry?: string;
  inline?: string;
  morphs: { deltas: Map<number, [number, number, number]>; value: number }[];
  hidden: boolean;
}

/** Collects actor (and prop) blocks; the same id appears twice in a .cr2 (geometry first, settings later). */
function collectActors(nodes: PoserNode[], keys: string[]): Map<string, Actor> {
  const out = new Map<string, Actor>();
  for (const n of nodes) {
    if (!keys.includes(n.key)) continue;
    const id = n.value;
    const a = out.get(id) ?? { id, name: id.replace(/:\d+$/, ''), parent: '', origin: [0, 0, 0], morphs: [], hidden: false };
    const c = n.children;
    const parent = find(c, 'parent');
    if (parent) a.parent = parent.value;
    const origin = find(c, 'origin');
    if (origin) a.origin = nums(origin.value).slice(0, 3) as [number, number, number];
    const obj = find(c, 'objFileGeom');
    if (obj) a.geometry = obj.value.split(/\s+/).slice(2).join(' ');
    const custom = find(c, 'geomCustom');
    if (custom) a.inline = custom.children.map((x) => `${x.key} ${x.value}`).join('\n');
    if (find(c, 'off') || find(c, 'hidden')?.value === '1') a.hidden = true;
    const channels = find(c, 'channels');
    for (const t of channels ? all(channels.children, 'targetGeom') : []) {
      const keysNode = find(t.children, 'keys');
      const k = keysNode ? find(keysNode.children, 'k') : undefined;
      const value = k ? (nums(k.value)[1] ?? 0) : 0;
      const deltasNode = find(t.children, 'deltas');
      if (!value || !deltasNode) continue;
      const deltas = new Map<number, [number, number, number]>();
      for (const d of all(deltasNode.children, 'd')) {
        const [i, x, y, z] = nums(d.value);
        deltas.set(i!, [x!, y!, z!]);
      }
      a.morphs.push({ deltas, value });
    }
    out.set(id, a);
  }
  return out;
}

interface PoserMaterial {
  name: string;
  color: [number, number, number];
  texture?: string;
  transparency?: string;
}

function collectMaterials(nodes: PoserNode[]): Map<string, PoserMaterial> {
  const out = new Map<string, PoserMaterial>();
  const visit = (list: PoserNode[]) => {
    for (const n of list) {
      if (n.key === 'material' && n.children.length) {
        const kd = find(n.children, 'KdColor');
        const tex = find(n.children, 'textureMap');
        const tr = find(n.children, 'transparencyMap');
        const clean = (v?: string) => (v && !/^NO_MAP$/i.test(v.replace(/"/g, '')) ? poserPath(v) : undefined);
        out.set(n.value, { name: n.value, color: kd ? (nums(kd.value).slice(0, 3) as [number, number, number]) : [0.8, 0.8, 0.8], texture: clean(tex?.value), transparency: clean(tr?.value) });
      } else visit(n.children);
    }
  };
  visit(nodes);
  return out;
}

async function loadTexture(path: string, sources: ContentSource[], load: (blob: Blob, name: string) => Promise<Texture | null>): Promise<Texture | null> {
  const blob = await readContent(path, sources);
  return blob ? load(blob, path) : null;
}

export interface PoserBuild {
  root: Group;
  warnings: string[];
}

/** Builds whatever the file holds: the first figure (with a skeleton) and its props. */
export async function buildPoser(text: string, name: string, sources: ContentSource[], loadTex: (blob: Blob, name: string) => Promise<Texture | null>): Promise<PoserBuild> {
  const tree = parsePoserTree(text);
  const warnings: string[] = [];
  const root = new Group();
  root.name = name;
  const materials = collectMaterials(tree);
  const textures = new Map<string, Promise<Texture | null>>();
  const material = (mName: string) => {
    const m = materials.get(mName);
    const mat = new MeshStandardMaterial({ name: mName || 'Material', color: m ? (Math.round(m.color[0] * 255) << 16) | (Math.round(m.color[1] * 255) << 8) | Math.round(m.color[2] * 255) : 0xcccccc, roughness: 0.8, side: DoubleSide });
    if (m?.texture) {
      if (!textures.has(m.texture)) textures.set(m.texture, loadTexture(m.texture, sources, loadTex));
    }
    return mat;
  };

  const figureFile = find(tree, 'figureResFile')?.value;
  const actors = collectActors(tree, ['actor']);
  const missing: string[] = [];
  if (figureFile && actors.size) {
    const objPath = poserPath(figureFile);
    const blob = await readContent(objPath, sources);
    if (!blob) missing.push(objPath);
    else root.add(buildFigure(parseObjText(await blob.text()), actors, material, warnings));
  }
  // Props (and hair) with inline or referenced geometry.
  const props = collectActors(tree, ['prop', 'hairProp']);
  for (const p of props.values()) {
    let obj: ObjData | null = null;
    if (p.inline) obj = parseObjText(p.inline);
    else if (p.geometry) {
      const path = poserPath(p.geometry);
      const blob = await readContent(path, sources);
      if (!blob) {
        missing.push(path);
        continue;
      }
      obj = parseObjText(await blob.text());
    }
    if (!obj || !obj.faces.length) continue;
    root.add(buildProp(obj, p, material));
  }
  if (!root.children.length) {
    if (missing.length) throw new MissingContentError(missing, 'poser');
    throw new Error('This Poser file has no figure or prop geometry (it may be a pose, material, or morph preset).');
  }
  if (missing.length) warnings.push(`${missing.length} geometry files weren't found (for example ${missing[0]}).`);
  // Attach textures once loaded (materials are matched by name).
  const loaded = new Map<string, Texture | null>();
  for (const [path, p] of textures) loaded.set(path, await p);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material]) as MeshStandardMaterial[]) {
      const m = materials.get(mat.name);
      const tex = m?.texture ? loaded.get(m.texture) : null;
      if (m?.texture && !tex) warnings.push(`Missing texture ${m.texture.split('/').pop()}`);
      if (tex) {
        tex.colorSpace = SRGBColorSpace;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      }
    }
  });
  return { root, warnings: [...new Set(warnings)] };
}

/** Triangulated geometry from OBJ faces, split per material; `vertexOf` records each output vertex's OBJ vertex. */
function geometryOf(obj: ObjData, faces: ObjData['faces'], material: (n: string) => MeshStandardMaterial, offset: (v: number) => [number, number, number]) {
  const key = new Map<string, number>();
  const pos: number[] = [];
  const uv: number[] = [];
  const vertexOf: number[] = [];
  const byMat = new Map<string, number[]>();
  for (const f of faces) {
    const list = byMat.get(f.material) ?? [];
    const ids = f.v.map((v, i) => {
      const t = f.t[i] ?? -1;
      const k = `${v}/${t}`;
      let id = key.get(k);
      if (id === undefined) {
        id = vertexOf.length;
        key.set(k, id);
        vertexOf.push(v);
        const [dx, dy, dz] = offset(v);
        pos.push((obj.v[v * 3]! + dx) * PNU, (obj.v[v * 3 + 1]! + dy) * PNU, (obj.v[v * 3 + 2]! + dz) * PNU);
        uv.push(t >= 0 ? obj.vt[t * 2]! : 0, t >= 0 ? obj.vt[t * 2 + 1]! : 0);
      }
      return id;
    });
    for (let i = 1; i + 1 < ids.length; i++) list.push(ids[0]!, ids[i]!, ids[i + 1]!);
    byMat.set(f.material, list);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  const index: number[] = [];
  const mats: MeshStandardMaterial[] = [];
  for (const [m, list] of byMat) {
    g.addGroup(index.length, list.length, mats.length);
    mats.push(material(m));
    index.push(...list);
  }
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, materials: mats, vertexOf };
}

function buildFigure(obj: ObjData, actors: Map<string, Actor>, material: (n: string) => MeshStandardMaterial, warnings: string[]): SkinnedMesh {
  // Bones for every actor with a parent chain (BODY is the root).
  const list = [...actors.values()];
  const index = new Map(list.map((a, i) => [a.id, i]));
  const bones = list.map((a) => {
    const b = new Bone();
    b.name = a.name;
    return b;
  });
  const roots: Bone[] = [];
  list.forEach((a, i) => {
    const p = index.get(a.parent);
    const po = p !== undefined ? list[p]!.origin : [0, 0, 0];
    bones[i]!.position.set((a.origin[0] - po[0]!) * PNU, (a.origin[1] - po[1]!) * PNU, (a.origin[2] - po[2]!) * PNU);
    if (p !== undefined && p !== i) bones[p]!.add(bones[i]!);
    else roots.push(bones[i]!);
  });

  // Dial-set morphs, by actor, baked into the OBJ vertices of that actor's group.
  const groupVerts = new Map<string, Set<number>>();
  for (const f of obj.faces) {
    const s = groupVerts.get(f.group) ?? new Set<number>();
    f.v.forEach((v) => s.add(v));
    groupVerts.set(f.group, s);
  }
  const offsets = new Map<number, [number, number, number]>();
  for (const a of list) {
    if (!a.morphs.length) continue;
    // Morph deltas index the actor's own vertices in the order they appear in its group.
    const verts = [...(groupVerts.get(a.name) ?? [])].sort((x, y) => x - y);
    for (const m of a.morphs)
      for (const [i, d] of m.deltas) {
        const v = verts[i];
        if (v === undefined) continue;
        const o = offsets.get(v) ?? [0, 0, 0];
        offsets.set(v, [o[0] + d[0] * m.value, o[1] + d[1] * m.value, o[2] + d[2] * m.value]);
      }
  }

  const { geometry, materials, vertexOf } = geometryOf(obj, obj.faces, material, (v) => offsets.get(v) ?? [0, 0, 0]);
  // Each vertex follows the body parts whose groups use it (seams are shared).
  const partsOf = new Map<number, number[]>();
  for (const [group, verts] of groupVerts) {
    const bone = index.get([...actors.keys()].find((id) => actors.get(id)!.name === group) ?? '');
    if (bone === undefined) continue;
    for (const v of verts) (partsOf.get(v) ?? partsOf.set(v, []).get(v)!).push(bone);
  }
  let unrigged = 0;
  const si = new Uint16Array(vertexOf.length * 4);
  const sw = new Float32Array(vertexOf.length * 4);
  vertexOf.forEach((v, i) => {
    const parts = (partsOf.get(v) ?? []).slice(0, 4);
    if (!parts.length) unrigged++;
    parts.forEach((b, k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = 1 / parts.length;
    });
    if (!parts.length) sw[i * 4] = 1;
  });
  if (unrigged) warnings.push(`${unrigged} vertices belong to no body part and stay with the root.`);
  geometry.setAttribute('skinIndex', new BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  const mesh = new SkinnedMesh(geometry, materials);
  mesh.name = 'Figure';
  for (const b of roots) mesh.add(b);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return mesh;
}

function buildProp(obj: ObjData, prop: Actor, material: (n: string) => MeshStandardMaterial): Mesh {
  const { geometry, materials } = geometryOf(obj, obj.faces, material, () => [0, 0, 0]);
  const mesh = new Mesh(geometry, materials);
  mesh.name = prop.name;
  return mesh;
}
