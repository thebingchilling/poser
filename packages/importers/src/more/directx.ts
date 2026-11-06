import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Skeleton, SkinnedMesh, SRGBColorSpace, Vector3, type Texture } from 'three';

/**
 * DirectX models (.x, text form): a tree of templates. Read: frames (the
 * hierarchy, which become bones when a mesh is skinned to them), meshes
 * with UVs, per-face materials and textures, and skin weights. DirectX is
 * left-handed, so z is mirrored (and faces rewound).
 */

type Token = string | { str: string };
interface XNode {
  type: string;
  name: string;
  data: Token[];
  children: XNode[];
  /** Names referenced inside braces ({ MaterialName }). */
  refs: string[];
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|([^\s;,{}"]+)/g;
  let m: RegExpExecArray | null;
  // Comments: // and # to end of line.
  const clean = text.replace(/(\/\/|#)[^\n]*/g, '');
  while ((m = re.exec(clean))) out.push(m[1] !== undefined ? { str: m[1] } : (m[2] ?? m[3])!);
  return out;
}

function parseTree(tokens: Token[]): XNode[] {
  let i = 0;
  const block = (): { data: Token[]; children: XNode[]; refs: string[] } => {
    const data: Token[] = [];
    const children: XNode[] = [];
    const refs: string[] = [];
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (t === '}') {
        i++;
        break;
      }
      if (typeof t === 'string' && /^[A-Za-z_]/.test(t) && t !== 'template') {
        // "Type [name] {" opens a child; "{ Name }" is a reference.
        const next = tokens[i + 1];
        const after = tokens[i + 2];
        if (next === '{') {
          i += 2;
          children.push({ type: t, name: '', ...block() });
          continue;
        }
        if (typeof next === 'string' && after === '{' && next !== '}') {
          i += 3;
          children.push({ type: t, name: next, ...block() });
          continue;
        }
      }
      if (t === '{') {
        // Reference: { Name } or { Name GUID }.
        const ref = tokens[i + 1];
        let j = i + 1;
        while (j < tokens.length && tokens[j] !== '}') j++;
        if (typeof ref === 'string') refs.push(ref);
        i = j + 1;
        continue;
      }
      if (t === 'template') {
        // Skip template definitions.
        while (i < tokens.length && tokens[i] !== '{') i++;
        let depth = 0;
        for (; i < tokens.length; i++) {
          if (tokens[i] === '{') depth++;
          else if (tokens[i] === '}' && --depth === 0) {
            i++;
            break;
          }
        }
        continue;
      }
      data.push(t);
      i++;
    }
    return { data, children, refs };
  };
  return block().children;
}

const num = (t: Token | undefined) => (typeof t === 'string' ? Number(t) : NaN);

function matrixOf(data: Token[]): Matrix4 {
  // Row-major with row vectors (translation in the last row): this is three's column-major element order.
  return new Matrix4().fromArray(data.slice(0, 16).map(num));
}

const MIRROR = new Matrix4().makeScale(1, 1, -1);

export function parseDirectX(text: string, texture: (path: string) => Texture | null): Group {
  if (!/^xof /.test(text)) throw new Error('Not a DirectX model.');
  const header = text.slice(8, 12);
  if (header !== 'txt ') throw new Error('Only text DirectX models (.x) can be read; this one is stored in binary or compressed form.');
  const nodes = parseTree(tokenize(text.slice(16)));
  const materials = new Map<string, XNode>();
  const collect = (list: XNode[]) => {
    for (const n of list) {
      if (n.type === 'Material' && n.name) materials.set(n.name, n);
      collect(n.children);
    }
  };
  collect(nodes);

  const root = new Group();
  const bones = new Map<string, Bone>();
  const meshes: { node: XNode; parent: Object3D }[] = [];
  const build = (list: XNode[], parent: Object3D) => {
    for (const n of list) {
      if (n.type === 'Frame') {
        const bone = new Bone();
        bone.name = n.name || 'Frame';
        const tm = n.children.find((c) => c.type === 'FrameTransformMatrix');
        if (tm) MIRROR.clone().multiply(matrixOf(tm.data)).multiply(MIRROR).decompose(bone.position, bone.quaternion, bone.scale);
        parent.add(bone);
        bones.set(bone.name, bone);
        build(n.children, bone);
      } else if (n.type === 'Mesh') meshes.push({ node: n, parent });
    }
  };
  build(nodes, root);
  root.updateMatrixWorld(true);

  for (const { node, parent } of meshes) {
    const d = node.data;
    let k = 0;
    const nv = num(d[k++]);
    const verts: number[] = [];
    for (let i = 0; i < nv * 3; i++) verts.push(num(d[k++]));
    const nf = num(d[k++]);
    const faces: number[][] = [];
    for (let f = 0; f < nf; f++) {
      const n = num(d[k++]);
      faces.push(Array.from({ length: n }, () => num(d[k++])));
    }
    const uvNode = node.children.find((c) => c.type === 'MeshTextureCoords');
    const uvs = uvNode ? uvNode.data.slice(1).map(num) : null;
    const matList = node.children.find((c) => c.type === 'MeshMaterialList');
    const faceMat = matList ? matList.data.slice(2, 2 + num(matList.data[1])).map(num) : faces.map(() => 0);
    const matNodes: XNode[] = matList ? [...matList.children.filter((c) => c.type === 'Material'), ...matList.refs.map((r) => materials.get(r)).filter((m): m is XNode => !!m)] : [];

    // Mesh vertices sit in their frame's space; bake that in (and mirror z).
    const toWorld = parent.matrixWorld.clone();
    const pos = new Float32Array(nv * 3);
    const v = new Vector3();
    for (let i = 0; i < nv; i++) {
      v.set(verts[i * 3]!, verts[i * 3 + 1]!, -verts[i * 3 + 2]!).applyMatrix4(toWorld);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    if (uvs && uvs.length >= nv * 2) g.setAttribute('uv', new BufferAttribute(Float32Array.from({ length: nv * 2 }, (_, i) => (i % 2 ? 1 - uvs[i]! : uvs[i]!)), 2));
    const byMat = new Map<number, number[]>();
    faces.forEach((f, i) => {
      const list = byMat.get(faceMat[i] ?? 0) ?? [];
      // Mirroring z flips winding: fan in reverse.
      for (let t = 1; t + 1 < f.length; t++) list.push(f[0]!, f[t + 1]!, f[t]!);
      byMat.set(faceMat[i] ?? 0, list);
    });
    const index: number[] = [];
    const mats: MeshStandardMaterial[] = [];
    for (const [m, list] of [...byMat].sort((a, b) => a[0] - b[0])) {
      g.addGroup(index.length, list.length, mats.length);
      index.push(...list);
      const mn = matNodes[m];
      const c = mn ? mn.data.slice(0, 3).map(num) : [0.8, 0.8, 0.8];
      const texName = mn?.children.find((x) => /TextureFilename/i.test(x.type))?.data.find((t) => typeof t === 'object') as { str: string } | undefined;
      const map = texName ? texture(texName.str.replace(/\\\\/g, '/')) : null;
      if (map) map.colorSpace = SRGBColorSpace;
      mats.push(new MeshStandardMaterial({ name: mn?.name || `Material ${m + 1}`, color: map ? 0xffffff : (Math.round(c[0]! * 255) << 16) | (Math.round(c[1]! * 255) << 8) | Math.round(c[2]! * 255), map, roughness: 0.8, side: DoubleSide }));
    }
    g.setIndex(index);
    g.computeVertexNormals();

    const skins = node.children.filter((c) => c.type === 'SkinWeights');
    if (skins.length && bones.size) {
      const influences: [number, number][][] = Array.from({ length: nv }, () => []);
      const boneList = [...bones.values()];
      for (const s of skins) {
        const name = (s.data[0] as { str: string } | undefined)?.str ?? '';
        const bi = boneList.findIndex((b) => b.name === name);
        if (bi < 0) continue;
        const n = num(s.data[1]);
        for (let i = 0; i < n; i++) {
          const vi = num(s.data[2 + i]);
          const w = num(s.data[2 + n + i]);
          if (vi < nv && w > 0) influences[vi]!.push([bi, w]);
        }
      }
      const si = new Uint16Array(nv * 4);
      const sw = new Float32Array(nv * 4);
      influences.forEach((list, i) => {
        const top = list.sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = top.reduce((t, x) => t + x[1], 0) || 1;
        top.forEach(([b, w], j) => {
          si[i * 4 + j] = b;
          sw[i * 4 + j] = w / total;
        });
      });
      g.setAttribute('skinIndex', new BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
      const mesh = new SkinnedMesh(g, mats);
      mesh.name = node.name || 'Mesh';
      root.add(mesh);
      mesh.bind(new Skeleton(boneList));
    } else {
      const mesh = new Mesh(g, mats);
      mesh.name = node.name || 'Mesh';
      root.add(mesh);
    }
  }
  if (!meshes.length) throw new Error('This DirectX file has no meshes.');
  return root;
}
