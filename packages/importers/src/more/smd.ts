import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Euler, Group, Matrix4, MeshStandardMaterial, Quaternion, Skeleton, SkinnedMesh, SRGBColorSpace, Vector3, type Texture } from 'three';

/**
 * Source engine / Source Filmmaker reference meshes (.smd, text): a bone
 * list, the rest pose (position and XYZ Euler angles per bone), and
 * triangles whose vertices carry a parent bone and optional weight links.
 * Source is Z-up in inches; models come out Y-up in metres.
 */

const INCH = 0.0254;

/** Source (x forward, y left, z up) → three (z forward, x left, y up): a cyclic swap, so handedness is kept. */
const toThree = (x: number, y: number, z: number): [number, number, number] => [y, z, x];

export function parseSmd(text: string, texture: (path: string) => Texture | null): Group {
  const lines = text.split('\n').map((l) => l.replace(/\/\/.*/, '').trim());
  const nodes: { name: string; parent: number }[] = [];
  const rest = new Map<number, { p: Vector3; r: Euler }>();
  const tris: { material: string; v: { bone: number; p: number[]; n: number[]; uv: number[]; links: [number, number][] }[] }[] = [];
  let section = '';
  let firstFrameDone = false;
  let pending: (typeof tris)[number] | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (section === '') {
      if (line === 'nodes' || line === 'skeleton' || line === 'triangles') section = line;
      continue;
    }
    if (line === 'end') {
      if (section === 'skeleton') firstFrameDone = true;
      section = '';
      continue;
    }
    if (section === 'nodes') {
      const m = /^(\d+)\s+"([^"]*)"\s+(-?\d+)/.exec(line);
      if (m) nodes[Number(m[1])] = { name: m[2]!, parent: Number(m[3]) };
    } else if (section === 'skeleton') {
      if (line.startsWith('time')) {
        if (rest.size) firstFrameDone = true;
        continue;
      }
      if (firstFrameDone) continue;
      const v = line.split(/\s+/).map(Number);
      rest.set(v[0]!, { p: new Vector3(v[1], v[2], v[3]), r: new Euler(v[4], v[5], v[6], 'ZYX') });
    } else if (section === 'triangles') {
      if (!pending || pending.v.length === 3) {
        pending = { material: line, v: [] };
        tris.push(pending);
        continue;
      }
      const v = line.split(/\s+/).map(Number);
      const links: [number, number][] = [];
      const count = v[9] ?? 0;
      for (let k = 0; k < count; k++) links.push([v[10 + k * 2]!, v[11 + k * 2]!]);
      pending.v.push({ bone: v[0]!, p: v.slice(1, 4), n: v.slice(4, 7), uv: v.slice(7, 9), links });
    }
  }
  if (!nodes.length && !tris.length) throw new Error('This .smd file has no skeleton or triangles (it may be an animation only).');

  // Rest pose: Source bones store parent-relative position and XYZ angles, in Source axes.
  const bones = nodes.map((n) => {
    const b = new Bone();
    b.name = n.name;
    return b;
  });
  const world: Matrix4[] = [];
  const order = nodes.map((_, i) => i).sort((a, b) => depth(nodes, a) - depth(nodes, b));
  for (const i of order) {
    const r = rest.get(i) ?? { p: new Vector3(), r: new Euler() };
    const local = new Matrix4().compose(r.p, new Quaternion().setFromEuler(r.r), new Vector3(1, 1, 1));
    const parent = nodes[i]!.parent;
    world[i] = parent >= 0 && world[parent] ? world[parent]!.clone().multiply(local) : local;
  }
  // Convert each bone's world transform to three's axes and metres, then back to parent-relative.
  const swap = new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  const worldThree = world.map((m) => {
    const out = swap.clone().multiply(m ?? new Matrix4()).multiply(swap.clone().invert());
    const p = new Vector3().setFromMatrixPosition(out).multiplyScalar(INCH);
    return out.setPosition(p);
  });
  const roots: Bone[] = [];
  nodes.forEach((n, i) => {
    const parent = n.parent >= 0 && n.parent < nodes.length ? n.parent : -1;
    const local = parent >= 0 ? worldThree[parent]!.clone().invert().multiply(worldThree[i]!) : worldThree[i]!.clone();
    local.decompose(bones[i]!.position, bones[i]!.quaternion, bones[i]!.scale);
    if (parent >= 0) bones[parent]!.add(bones[i]!);
    else roots.push(bones[i]!);
  });

  const byMaterial = new Map<string, number[]>();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  for (const t of tris) {
    if (t.v.length < 3) continue;
    const list = byMaterial.get(t.material) ?? [];
    // Swapping axes keeps handedness, so winding stays.
    for (const v of t.v) {
      list.push(pos.length / 3);
      pos.push(...toThree(v.p[0]! * INCH, v.p[1]! * INCH, v.p[2]! * INCH));
      nor.push(...toThree(v.n[0]!, v.n[1]!, v.n[2]!));
      uv.push(v.uv[0]!, v.uv[1]!);
      const links = (v.links.length ? v.links : [[v.bone, 1] as [number, number]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = links.reduce((s, l) => s + l[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        si.push(Math.max(0, Math.min(nodes.length - 1, links[k]?.[0] ?? 0)));
        sw.push((links[k]?.[1] ?? 0) / total);
      }
    }
    byMaterial.set(t.material, list);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(si), 4));
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4));
  const index: number[] = [];
  const materials = [...byMaterial.keys()].map((name, i) => {
    const list = byMaterial.get(name)!;
    g.addGroup(index.length, list.length, i);
    index.push(...list);
    // Materials name a texture (often without its folder or extension); look it up as given.
    const map = /\.(png|jpe?g|tga|bmp|dds|tiff?)$/i.test(name) ? texture(name) : null;
    if (map) map.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ name: name.replace(/\.[^.]+$/, ''), map, color: map ? 0xffffff : 0xbcbcbc, roughness: 0.8, side: DoubleSide });
  });
  g.setIndex(index);
  const mesh = new SkinnedMesh(g, materials);
  mesh.name = 'SMD model';
  for (const b of roots) mesh.add(b);
  const root = new Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return root;
}

function depth(nodes: { parent: number }[], i: number): number {
  let d = 0;
  for (let p = nodes[i]!.parent; p >= 0 && d < nodes.length; p = nodes[p]?.parent ?? -1) d++;
  return d;
}
