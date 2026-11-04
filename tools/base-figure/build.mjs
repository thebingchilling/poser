// Builds the default base figures (PLAN.md, Phase 1 "Default base figure")
// from the CC0 MakeHuman base mesh, shape targets, and default skin weights
// in source/ (see fetch-source.mjs). Writes skinned GLBs on the canonical
// skeleton plus a small metadata file the app imports.
// Usage: node tools/base-figure/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => join(here, 'source', p);
const repo = join(here, '..', '..');
const OUT_GLB = join(repo, 'apps/web/public/builtin');
const OUT_META = join(repo, 'packages/render/src/figure/baseFigures.json');

const text = (p) => gunzipSync(readFileSync(src(p))).toString('utf8');
/** MakeHuman units are decimetres. */
const DM = 0.1;

// ---------- Source data ----------

/** Base mesh: positions, UVs, and faces (with their group). */
function parseObj() {
  const v = [];
  const vt = [];
  const faces = [];
  let group = '';
  for (const line of text('3dobjs/base.obj.gz').split('\n')) {
    if (line.startsWith('v ')) v.push(line.split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith('vt ')) vt.push(line.split(/\s+/).slice(1, 3).map(Number));
    else if (line.startsWith('g ')) group = line.slice(2).trim();
    else if (line.startsWith('f ')) {
      const corners = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((c) => {
          const [a, b] = c.split('/');
          return { v: Number(a) - 1, t: b ? Number(b) - 1 : -1 };
        });
      faces.push({ group, corners });
    }
  }
  return { v, vt, faces };
}

/** A shape target: vertex index → offset (decimetres). */
function target(name) {
  const out = new Map();
  for (const line of text(`targets/${name}.target.gz`).split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length === 4) out.set(Number(p[0]), [Number(p[1]), Number(p[2]), Number(p[3])]);
  }
  return out;
}

const groups = JSON.parse(text('mesh_metadata/basemesh_vertex_groups.json.gz'));
const groupVertices = (name) => {
  const ranges = groups[name];
  if (!ranges) throw new Error(`No vertex group ${name}`);
  const out = [];
  for (const [a, b] of ranges) for (let i = a; i <= b; i++) out.push(i);
  return out;
};
const mhWeights = JSON.parse(text('rigs/standard/weights.default.json.gz')).weights;

// ---------- Canonical skeleton ----------

const SIDES = { left: 'l', right: 'r' };
const FINGERS = [
  ['Thumb', 1, ['Metacarpal', 'Proximal', 'Distal']],
  ['Index', 2, ['Proximal', 'Intermediate', 'Distal']],
  ['Middle', 3, ['Proximal', 'Intermediate', 'Distal']],
  ['Ring', 4, ['Proximal', 'Intermediate', 'Distal']],
  ['Little', 5, ['Proximal', 'Intermediate', 'Distal']],
];

/** Canonical bones (parents first) with where each joint comes from on the MakeHuman mesh. */
function skeletonDef() {
  const bones = [
    ['hips', null, ['joint-pelvis']],
    ['spine', 'hips', ['joint-spine-3']],
    ['chest', 'spine', ['joint-spine-2']],
    ['upperChest', 'chest', ['joint-spine-1']],
    ['neck', 'upperChest', ['joint-neck']],
    ['head', 'neck', ['joint-head']],
    ['jaw', 'head', ['joint-mouth']],
  ];
  for (const [side, s] of Object.entries(SIDES)) {
    const n = (b) => side + b;
    bones.push(
      [n('Eye'), 'head', [`joint-${s}-eye`]],
      // The breast bone sits halfway between the ribcage and the nipple.
      [n('Breast'), 'upperChest', { vertex: side === 'left' ? 8451 : 1779, towards: 'joint-spine-1', t: 0.45 }],
      [n('Shoulder'), 'upperChest', [`joint-${s}-clavicle`]],
      [n('UpperArm'), n('Shoulder'), [`joint-${s}-shoulder`]],
      [n('LowerArm'), n('UpperArm'), [`joint-${s}-elbow`]],
      [n('Hand'), n('LowerArm'), [`joint-${s}-hand`]],
      [n('UpperLeg'), 'hips', [`joint-${s}-upper-leg`]],
      [n('LowerLeg'), n('UpperLeg'), [`joint-${s}-knee`]],
      [n('Foot'), n('LowerLeg'), [`joint-${s}-ankle`]],
      [n('Toes'), n('Foot'), [2, 3, 4].map((t) => `joint-${s}-toe-${t}-1`)],
    );
    for (const [finger, k, segs] of FINGERS) {
      let parent = n('Hand');
      segs.forEach((seg, i) => {
        bones.push([n(finger + seg), parent, [`joint-${s}-finger-${k}-${i + 1}`]]);
        parent = n(finger + seg);
      });
    }
  }
  return bones;
}

/** Canonical bone that a MakeHuman bone's weights go to. */
function canonicalFor(mh) {
  const m = /^(.*)\.([LR])$/.exec(mh);
  const base = m ? m[1] : mh;
  const side = m ? (m[2] === 'L' ? 'left' : 'right') : '';
  if (/^(root|spine05)$/.test(base) || base === 'pelvis') return 'hips';
  if (/^spine0[34]$/.test(base)) return 'spine';
  if (base === 'spine02') return 'chest';
  if (base === 'spine01') return 'upperChest';
  if (/^neck0\d$/.test(base)) return 'neck';
  if (base === 'jaw' || /^tongue/.test(base)) return 'jaw';
  if (base === 'eye') return side + 'Eye';
  if (base === 'breast') return side + 'Breast';
  if (base === 'clavicle' || base === 'shoulder01') return side + 'Shoulder';
  if (/^upperarm0\d$/.test(base)) return side + 'UpperArm';
  if (/^lowerarm0\d$/.test(base)) return side + 'LowerArm';
  if (base === 'wrist' || /^metacarpal\d$/.test(base)) return side + 'Hand';
  const f = /^finger(\d)-(\d)$/.exec(base);
  if (f) {
    const [finger, , segs] = FINGERS[Number(f[1]) - 1];
    return side + finger + segs[Number(f[2]) - 1];
  }
  if (/^upperleg0\d$/.test(base)) return side + 'UpperLeg';
  if (/^lowerleg0\d$/.test(base)) return side + 'LowerLeg';
  if (base === 'foot') return side + 'Foot';
  if (/^toe\d-\d$/.test(base)) return side + 'Toes';
  // Face muscles and helpers follow the head.
  return 'head';
}

// ---------- Figures ----------

const RACES = ['african', 'asian', 'caucasian'];

/** Body-shape morphs kept as glTF morph targets (none move joints much, so the skeleton stays valid). */
function morphDefs(gender) {
  const u = (m) => `macrodetails/universal-${gender}-young-${m}`;
  return [
    ['Heavier', u('averagemuscle-maxweight')],
    ['Thinner', u('averagemuscle-minweight')],
    ['More muscular', u('maxmuscle-averageweight')],
    ['Less muscular', u('minmuscle-averageweight')],
    ...(gender === 'female'
      ? [
          ['Bigger bust', 'breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness'],
          ['Smaller bust', 'breast/female-young-averagemuscle-averageweight-mincup-averagefirmness'],
        ]
      : []),
    ['Wider waist', 'torso/measure-waist-circ-incr'],
    ['Narrower waist', 'torso/measure-waist-circ-decr'],
    ['Wider hips', 'torso/measure-hips-circ-incr'],
    ['Narrower hips', 'torso/measure-hips-circ-decr'],
    ['Broader shoulders', 'torso/torso-vshape-incr'],
    ['Narrower shoulders', 'torso/torso-vshape-decr'],
  ];
}

/** Mesh parts kept from the base mesh (the rest are fitting helpers). */
const PARTS = [
  { name: 'body', groups: ['body'], material: 0 },
  { name: 'eyes', groups: ['helper-l-eye', 'helper-r-eye'], material: 1 },
  { name: 'mouth', groups: ['helper-upper-teeth', 'helper-lower-teeth', 'helper-tongue'], material: 2 },
];

function buildFigure(obj, gender) {
  // Shape: a third of each race at age 25 (MakeHuman's defaults), in metres, standing on the floor.
  const pos = obj.v.map((p) => [...p]);
  for (const r of RACES)
    for (const [i, d] of target(`macrodetails/${r}-${gender}-young`)) for (let k = 0; k < 3; k++) pos[i][k] += d[k] / 3;
  let floor = Infinity;
  for (const i of groupVertices('body')) floor = Math.min(floor, pos[i][1]);
  const m = pos.map((p) => [p[0] * DM, (p[1] - floor) * DM, p[2] * DM]);

  const centre = (names) => {
    const s = [0, 0, 0];
    let n = 0;
    for (const g of names)
      for (const i of groupVertices(g)) {
        for (let k = 0; k < 3; k++) s[k] += m[i][k];
        n++;
      }
    return s.map((x) => x / n);
  };
  const def = skeletonDef();
  const joints = new Map();
  for (const [name, , from] of def) {
    if (Array.isArray(from)) joints.set(name, centre(from));
    else {
      const a = m[from.vertex];
      const b = centre([from.towards]);
      joints.set(name, a.map((x, k) => x + (b[k] - x) * from.t));
    }
  }

  // Skin weights: MakeHuman bones merged onto canonical bones, top four per vertex.
  const boneIndex = new Map(def.map(([n], i) => [n, i]));
  const perVertex = new Map();
  for (const [mhBone, list] of Object.entries(mhWeights)) {
    const b = boneIndex.get(canonicalFor(mhBone));
    for (const [vi, w] of list) {
      let acc = perVertex.get(vi);
      if (!acc) perVertex.set(vi, (acc = new Map()));
      acc.set(b, (acc.get(b) ?? 0) + w);
    }
  }
  const skin = (vi) => {
    const acc = [...(perVertex.get(vi) ?? new Map([[boneIndex.get('head'), 1]])).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = acc.reduce((s, [, w]) => s + w, 0) || 1;
    while (acc.length < 4) acc.push([0, 0]);
    return { j: acc.map(([b]) => b), w: acc.map(([, w]) => w / total) };
  };

  // Smooth normals per base-mesh vertex (so UV seams don't show).
  const normals = m.map(() => [0, 0, 0]);
  for (const f of obj.faces) {
    const c = f.corners.map((x) => x.v);
    for (let k = 1; k + 1 < c.length; k++) {
      const [a, b, d] = [m[c[0]], m[c[k]], m[c[k + 1]]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const i of [c[0], c[k], c[k + 1]]) for (let q = 0; q < 3; q++) normals[i][q] += n[q];
    }
  }
  for (const n of normals) {
    const l = Math.hypot(...n) || 1;
    n[0] /= l;
    n[1] /= l;
    n[2] /= l;
  }

  const morphs = morphDefs(gender).map(([name, t]) => ({ name, offsets: target(t) }));

  // Primitives: vertices split by (position, UV) pairs, quads triangulated.
  const prims = PARTS.map((part) => {
    const key = new Map();
    const verts = [];
    const indices = [];
    for (const f of obj.faces) {
      if (!part.groups.includes(f.group)) continue;
      const ids = f.corners.map((c) => {
        const k = `${c.v}/${c.t}`;
        let id = key.get(k);
        if (id === undefined) {
          id = verts.length;
          key.set(k, id);
          verts.push(c);
        }
        return id;
      });
      for (let k = 1; k + 1 < ids.length; k++) indices.push(ids[0], ids[k], ids[k + 1]);
    }
    return { part, verts, indices };
  });

  return { def, joints, prims, m, normals, uv: obj.vt, skin, morphs, height: Math.max(...groupVertices('body').map((i) => m[i][1])) };
}

// ---------- glTF writer ----------

function writeGlb(fig, gender) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];
  const view = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (a) => {
    accessors.push(a);
    return accessors.length - 1;
  };
  const minmax = (arr, size) => {
    const min = Array(size).fill(Infinity);
    const max = Array(size).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) {
      const k = i % size;
      min[k] = Math.min(min[k], arr[i]);
      max[k] = Math.max(max[k], arr[i]);
    }
    return { min, max };
  };

  // Nodes: 0 = scene root, 1 = mesh, then the skeleton.
  const { def, joints } = fig;
  const jointNode = (i) => 2 + i;
  const nodes = [
    { name: `Poser base ${gender}`, children: [1, jointNode(0)] },
    { name: 'Body', mesh: 0, skin: 0 },
  ];
  def.forEach(([name, parent]) => {
    const head = joints.get(name);
    const p = parent ? joints.get(parent) : [0, 0, 0];
    nodes.push({ name, translation: [head[0] - p[0], head[1] - p[1], head[2] - p[2]], children: [] });
  });
  def.forEach(([, parent], i) => {
    if (parent) nodes[jointNode(def.findIndex(([n]) => n === parent))].children.push(jointNode(i));
  });
  for (const n of nodes) if (n.children && !n.children.length) delete n.children;
  const ibm = new Float32Array(def.length * 16);
  def.forEach(([name], i) => {
    const h = joints.get(name);
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1], i * 16);
  });
  const ibmAcc = accessor({ bufferView: view(ibm), componentType: 5126, count: def.length, type: 'MAT4' });

  const primitives = fig.prims.map(({ part, verts, indices }) => {
    const n = verts.length;
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const T = new Float32Array(n * 2);
    const J = new Uint8Array(n * 4);
    const W = new Float32Array(n * 4);
    verts.forEach((c, i) => {
      P.set(fig.m[c.v], i * 3);
      N.set(fig.normals[c.v], i * 3);
      const uv = c.t >= 0 ? fig.uv[c.t] : [0, 0];
      T.set([uv[0], 1 - uv[1]], i * 2);
      const s = fig.skin(c.v);
      J.set(s.j, i * 4);
      W.set(s.w, i * 4);
    });
    const attributes = {
      POSITION: accessor({ bufferView: view(P, 34962), componentType: 5126, count: n, type: 'VEC3', ...minmax(P, 3) }),
      NORMAL: accessor({ bufferView: view(N, 34962), componentType: 5126, count: n, type: 'VEC3' }),
      TEXCOORD_0: accessor({ bufferView: view(T, 34962), componentType: 5126, count: n, type: 'VEC2' }),
      JOINTS_0: accessor({ bufferView: view(J, 34962), componentType: 5121, count: n, type: 'VEC4' }),
      WEIGHTS_0: accessor({ bufferView: view(W, 34962), componentType: 5126, count: n, type: 'VEC4' }),
    };
    const I = n > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    // Sparse morph targets: only the vertices a target moves are stored.
    const targets = fig.morphs.map(({ offsets }) => {
      const idx = [];
      const val = [];
      verts.forEach((c, i) => {
        const d = offsets.get(c.v);
        if (d && (d[0] || d[1] || d[2])) {
          idx.push(i);
          val.push(d[0] * DM, d[1] * DM, d[2] * DM);
        }
      });
      // A sparse accessor needs at least one entry.
      if (!idx.length) {
        idx.push(0);
        val.push(0, 0, 0);
      }
      const values = new Float32Array(val);
      const mm = minmax(values, 3);
      return {
        POSITION: accessor({
          componentType: 5126,
          count: n,
          type: 'VEC3',
          min: mm.min.map((x) => Math.min(x, 0)),
          max: mm.max.map((x) => Math.max(x, 0)),
          sparse: {
            count: idx.length,
            indices: { bufferView: view(n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)), componentType: n > 65535 ? 5125 : 5123 },
            values: { bufferView: view(values) },
          },
        }),
      };
    });
    return {
      attributes,
      indices: accessor({ bufferView: view(I, 34963), componentType: I instanceof Uint32Array ? 5125 : 5123, count: I.length, type: 'SCALAR' }),
      material: part.material,
      targets,
    };
  });

  const skinTone = gender === 'female' ? [0.73, 0.52, 0.42, 1] : [0.68, 0.48, 0.38, 1];
  const json = {
    asset: { version: '2.0', generator: 'Poser base figure build (MakeHuman CC0 assets)', copyright: 'CC0: MakeHuman base mesh, targets, and weights' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ name: 'Body', primitives, weights: fig.morphs.map(() => 0), extras: { targetNames: fig.morphs.map((x) => x.name) } }],
    skins: [{ joints: def.map((_, i) => jointNode(i)), inverseBindMatrices: ibmAcc, skeleton: jointNode(0) }],
    materials: [
      { name: 'Skin', pbrMetallicRoughness: { baseColorFactor: skinTone, metallicFactor: 0, roughnessFactor: 0.55 } },
      { name: 'Eyes', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.12, 0.09, 1], metallicFactor: 0, roughnessFactor: 0.15 } },
      { name: 'Mouth', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.78, 0.72, 1], metallicFactor: 0, roughnessFactor: 0.35 } },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  const bin = new Uint8Array(Math.ceil(byteLength / 4) * 4);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.byteLength;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
  const total = 12 + 8 + jsonLen + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  dv.setUint32(20 + jsonLen, bin.length, true);
  dv.setUint32(24 + jsonLen, 0x004e4942, true);
  out.set(bin, 28 + jsonLen);
  return out;
}

// ---------- Main ----------

const obj = parseObj();
mkdirSync(OUT_GLB, { recursive: true });
const meta = {};
for (const gender of ['female', 'male']) {
  const fig = buildFigure(obj, gender);
  const glb = writeGlb(fig, gender);
  const file = `base-${gender}.glb`;
  writeFileSync(join(OUT_GLB, file), glb);
  meta[`builtin:base-${gender}`] = {
    file,
    height: Math.round(fig.height * 1000) / 1000,
    morphs: fig.morphs.map((x) => x.name),
    bones: fig.def.map(([n]) => n),
  };
  console.log(`${file}: ${(glb.byteLength / 1e6).toFixed(2)} MB, ${fig.height.toFixed(3)} m, ${fig.prims.reduce((s, p) => s + p.indices.length / 3, 0)} triangles`);
}
writeFileSync(OUT_META, JSON.stringify(meta, null, 2) + '\n');
writeFileSync(
  join(OUT_GLB, 'LICENSE.txt'),
  'base-female.glb and base-male.glb are built by tools/base-figure/build.mjs from MakeHuman core assets\n(base mesh, shape targets, default skin weights), which are CC0:\nhttps://static.makehumancommunity.org/about/license.html\nThe built figures are likewise CC0.\n',
);
