import {
  CANONICAL_BONES,
  FEMALE_PROPORTIONS,
  QI,
  Retargeter,
  axisAngle,
  boneTail,
  detectRig,
  qmul,
  qnorm,
  restPose,
  type CanonicalPose,
  type Q,
  type RigMap,
  type SourceBone,
  type V3,
} from '@poser/rig';

/**
 * Pose files (PLAN.md sections 4.2 and 6): BVH and VRMA single frames, and
 * our own pose JSON. Imports retarget onto the canonical rig; exports write
 * the canonical skeleton, so a pose made here opens in Blender, VRM tools,
 * and other posers.
 */

export interface ImportedPose {
  pose: CanonicalPose;
  /** Frames in the file (BVH/VRMA animations); the pose is one of them. */
  frameCount: number;
  frame: number;
  /** Share of the required canonical bones the file covered. */
  coverage: number;
  warnings: string[];
}

const D = Math.PI / 180;

// ---------- BVH ----------

export interface BvhData {
  bones: SourceBone[];
  /** Channel names per bone, in file order. */
  channels: string[][];
  /** Raw channel values per frame. */
  frames: number[][];
  frameTime: number;
}

export function parseBvh(text: string): BvhData {
  const tokens = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const next = () => {
    const t = tokens[i++];
    if (t === undefined) throw new Error('The BVH file ended early.');
    return t;
  };
  if (next().toUpperCase() !== 'HIERARCHY') throw new Error('Not a BVH file (no HIERARCHY).');
  const bones: SourceBone[] = [];
  const channels: string[][] = [];
  // Open blocks: bone index, or -2 for an End Site.
  const stack: number[] = [];
  let pendingEnd = false;
  while (i < tokens.length) {
    const t = next();
    const u = t.toUpperCase();
    if (u === 'ROOT' || u === 'JOINT') {
      let name = next();
      // Names may contain spaces in some exporters: join until the brace.
      while (tokens[i] !== '{') name += ' ' + next();
      bones.push({ name, parent: stack.length ? stack[stack.length - 1]! : -1, position: [0, 0, 0], rotation: QI });
      channels.push([]);
    } else if (u === 'END') {
      next(); // "Site"
      pendingEnd = true;
    } else if (t === '{') {
      stack.push(pendingEnd ? -2 : bones.length - 1);
      pendingEnd = false;
    } else if (t === '}') {
      stack.pop();
    } else if (u === 'OFFSET') {
      const v: V3 = [Number(next()), Number(next()), Number(next())];
      const top = stack[stack.length - 1];
      if (top !== undefined && top >= 0) bones[top]!.position = v;
    } else if (u === 'CHANNELS') {
      const n = Number(next());
      const list: string[] = [];
      for (let k = 0; k < n; k++) list.push(next().toLowerCase());
      channels[bones.length - 1] = list;
    } else if (u === 'MOTION') {
      break;
    }
  }
  let frameCount = 0;
  let frameTime = 1 / 30;
  const frames: number[][] = [];
  const total = channels.reduce((s, c) => s + c.length, 0);
  while (i < tokens.length) {
    const t = next();
    if (/^frames:$/i.test(t)) frameCount = Number(next());
    else if (/^frame$/i.test(t)) {
      next(); // "Time:"
      frameTime = Number(next());
      break;
    }
  }
  for (let f = 0; f < frameCount && i + total <= tokens.length; f++) {
    frames.push(tokens.slice(i, i + total).map(Number));
    i += total;
  }
  if (!bones.length) throw new Error('The BVH file has no joints.');
  return { bones, channels, frames, frameTime };
}

/** Local rotations of every bone at one frame (rest rotations are identity in BVH). */
export function bvhFrameRotations(data: BvhData, frame: number): Q[] {
  const values = data.frames[frame] ?? [];
  let k = 0;
  return data.bones.map((_, b) => {
    let q: Q = QI;
    for (const ch of data.channels[b] ?? []) {
      const v = values[k++] ?? 0;
      const axis: V3 | null = ch === 'xrotation' ? [1, 0, 0] : ch === 'yrotation' ? [0, 1, 0] : ch === 'zrotation' ? [0, 0, 1] : null;
      if (axis) q = qmul(q, axisAngle(axis, v * D));
    }
    return qnorm(q);
  });
}

/** Map for files that already use canonical bone names (our own exports, VRM tools). */
function canonicalNameMap(names: string[]): RigMap | null {
  const set = new Set(names);
  const required = CANONICAL_BONES.filter((b) => b.required).map((b) => b.name);
  if (required.filter((b) => set.has(b)).length < required.length * 0.9) return null;
  const map: RigMap = {};
  for (const b of CANONICAL_BONES) if (set.has(b.name)) map[b.name] = { bone: b.name };
  return map;
}

/**
 * Builds a retargeter for a rest skeleton whose rest rotations are identity.
 * If the skeleton faces −Z (its left arm on −X), it is turned to face +Z first.
 */
function retargeterFor(bones: SourceBone[], map: RigMap): { rt: Retargeter; turn: Q } {
  const rt0 = new Retargeter(bones, map);
  const idx = (c: string) => bones.findIndex((b) => b.name === map[c]?.bone);
  const l = idx('leftUpperArm');
  const r = idx('rightUpperArm');
  let turn: Q = QI;
  if (l >= 0 && r >= 0 && rt0.worldRest[l]!.position[0] < rt0.worldRest[r]!.position[0]) turn = axisAngle([0, 1, 0], Math.PI);
  if (turn === QI) return { rt: rt0, turn };
  const turned = bones.map((b) => (b.parent < 0 ? { ...b, rotation: qmul(turn, b.rotation) } : b));
  return { rt: new Retargeter(turned, map), turn };
}

function poseFromLocals(bones: SourceBone[], map: RigMap, locals: Q[]): CanonicalPose {
  const { rt, turn } = retargeterFor(bones, map);
  const turned = locals.map((q, i) => (bones[i]!.parent < 0 ? qmul(turn, q) : q));
  return rt.extract(turned);
}

function rigFor(names: string[]): { map: RigMap; coverage: number } {
  const canonical = canonicalNameMap(names);
  if (canonical) return { map: canonical, coverage: 1 };
  const det = detectRig(names);
  return { map: det.map, coverage: det.coverage };
}

export function bvhToPose(text: string, frame = 0): ImportedPose {
  const data = parseBvh(text);
  const warnings: string[] = [];
  const frameCount = data.frames.length;
  if (!frameCount) warnings.push('The file has no motion data, so the pose is the rest pose.');
  const f = Math.max(0, Math.min(frameCount - 1, frame));
  const { map, coverage } = rigFor(data.bones.map((b) => b.name));
  // One missing spine joint (older rigs have a single chest bone) is fine.
  if (coverage < 0.9) warnings.push(`Only ${Math.round(coverage * 100)}% of the main joints were recognised.`);
  const pose = poseFromLocals(data.bones, map, frameCount ? bvhFrameRotations(data, f) : data.bones.map(() => QI));
  return { pose, frameCount: Math.max(1, frameCount), frame: Math.max(0, f), coverage, warnings };
}

/** Euler angles (degrees) for BVH "Zrotation Xrotation Yrotation": q = Rz·Rx·Ry. */
function toZXY(q: Q): [number, number, number] {
  const [x, y, z, w] = q;
  const m01 = 2 * (x * y - z * w);
  const m11 = 1 - 2 * (x * x + z * z);
  const m20 = 2 * (x * z - y * w);
  const m21 = 2 * (y * z + x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const rx = Math.asin(Math.max(-1, Math.min(1, m21)));
  let rz: number;
  let ry: number;
  if (Math.abs(m21) < 0.9999999) {
    rz = Math.atan2(-m01, m11);
    ry = Math.atan2(-m20, m22);
  } else {
    // Gimbal lock: fold the yaw into Z.
    const m00 = 1 - 2 * (y * y + z * z);
    const m10 = 2 * (x * y + z * w);
    rz = Math.atan2(m10, m00);
    ry = 0;
  }
  return [rz / D, rx / D, ry / D];
}

/** Bones written to exported files: the canonical skeleton without soft-tissue helpers. */
function exportBones(): string[] {
  return CANONICAL_BONES.filter((b) => !b.softTissue).map((b) => b.name);
}

/** A single-frame BVH of the canonical skeleton (centimetres, Y up, facing +Z). */
export function poseToBvh(pose: CanonicalPose, rest: Record<string, V3> = restPose(FEMALE_PROPORTIONS)): string {
  const names = exportBones().filter((n) => rest[n]);
  const kids = new Map<string, string[]>();
  for (const n of names) {
    const p = CANONICAL_BONES.find((b) => b.name === n)!.parent;
    if (p) kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const cm = (v: number) => (v * 100).toFixed(4);
  const lines: string[] = ['HIERARCHY'];
  const order: string[] = [];
  const write = (name: string, depth: number) => {
    const pad = '  '.repeat(depth);
    const parent = CANONICAL_BONES.find((b) => b.name === name)!.parent;
    const off: V3 = parent ? [rest[name]![0] - rest[parent]![0], rest[name]![1] - rest[parent]![1], rest[name]![2] - rest[parent]![2]] : rest[name]!;
    lines.push(`${pad}${parent ? 'JOINT' : 'ROOT'} ${name}`, `${pad}{`, `${pad}  OFFSET ${cm(off[0])} ${cm(off[1])} ${cm(off[2])}`);
    lines.push(`${pad}  CHANNELS ${parent ? 3 : 6}${parent ? '' : ' Xposition Yposition Zposition'} Zrotation Xrotation Yrotation`);
    order.push(name);
    const children = kids.get(name) ?? [];
    if (!children.length) {
      const tail = boneTail(rest, name);
      lines.push(`${pad}  End Site`, `${pad}  {`, `${pad}    OFFSET ${cm(tail[0] - rest[name]![0])} ${cm(tail[1] - rest[name]![1])} ${cm(tail[2] - rest[name]![2])}`, `${pad}  }`);
    }
    for (const c of children) write(c, depth + 1);
    lines.push(`${pad}}`);
  };
  write('hips', 0);
  const values: string[] = [];
  for (const name of order) {
    if (name === 'hips') values.push(cm(rest.hips![0]), cm(rest.hips![1]), cm(rest.hips![2]));
    values.push(...toZXY(pose[name] ?? QI).map((a) => a.toFixed(4)));
  }
  lines.push('MOTION', 'Frames: 1', 'Frame Time: 0.0333333', values.join(' '), '');
  return lines.join('\n');
}

// ---------- VRMA (glTF binary with VRMC_vrm_animation) ----------

interface GltfJson {
  nodes?: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; matrix?: number[] }[];
  animations?: { channels: { sampler: number; target: { node?: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  extensions?: { VRMC_vrm_animation?: { humanoid?: { humanBones?: Record<string, { node: number }> } } };
}

function parseGlb(buffer: ArrayBuffer): { json: GltfJson; bin: DataView | null } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a binary glTF / VRMA file.');
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: DataView | null = null;
  while (offset + 8 <= buffer.byteLength) {
    const len = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len))) as GltfJson;
    else if (type === 0x004e4942) bin = new DataView(buffer, start, len);
    offset = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('The file has no glTF JSON.');
  return { json, bin };
}

const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(json: GltfJson, bin: DataView | null, index: number): number[][] {
  const acc = json.accessors?.[index];
  if (!acc || acc.bufferView === undefined || !bin) return [];
  if (acc.componentType !== 5126) throw new Error('Only float animation data is supported.');
  const bv = json.bufferViews![acc.bufferView]!;
  const n = TYPE_SIZE[acc.type] ?? 1;
  const stride = bv.byteStride ?? n * 4;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const row: number[] = [];
    for (let k = 0; k < n; k++) row.push(bin.getFloat32(base + i * stride + k * 4, true));
    out.push(row);
  }
  return out;
}

function matrixToTR(m: number[]): { t: V3; r: Q } {
  // Column-major; assumes no scale.
  const [m00, m10, m20, , m01, m11, m21, , m02, m12, m22, , tx, ty, tz] = m as number[] & { length: 16 };
  const tr = m00! + m11! + m22!;
  let q: Q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21! - m12!) / s, (m02! - m20!) / s, (m10! - m01!) / s, 0.25 * s];
  } else if (m00! > m11! && m00! > m22!) {
    const s = Math.sqrt(1 + m00! - m11! - m22!) * 2;
    q = [0.25 * s, (m01! + m10!) / s, (m02! + m20!) / s, (m21! - m12!) / s];
  } else if (m11! > m22!) {
    const s = Math.sqrt(1 + m11! - m00! - m22!) * 2;
    q = [(m01! + m10!) / s, 0.25 * s, (m12! + m21!) / s, (m02! - m20!) / s];
  } else {
    const s = Math.sqrt(1 + m22! - m00! - m11!) * 2;
    q = [(m02! + m20!) / s, (m12! + m21!) / s, 0.25 * s, (m10! - m01!) / s];
  }
  return { t: [tx!, ty!, tz!], r: qnorm(q) };
}

function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  if (d > 0.9995) return qnorm([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]);
  const th = Math.acos(d);
  const wa = Math.sin((1 - t) * th) / Math.sin(th);
  const wb = (Math.sin(t * th) / Math.sin(th)) * s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}

/** Frames sampled from a VRMA animation (at 30 fps). */
const VRMA_FPS = 30;

export function vrmaToPose(buffer: ArrayBuffer, frame = 0): ImportedPose {
  const { json, bin } = parseGlb(buffer);
  const human = json.extensions?.VRMC_vrm_animation?.humanoid?.humanBones;
  if (!human) throw new Error('This glTF file has no VRM animation humanoid (VRMC_vrm_animation).');
  const nodes = json.nodes ?? [];
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => n.children?.forEach((c) => (parent[c] = i)));
  // Parents first.
  const order: number[] = [];
  const visit = (i: number) => {
    order.push(i);
    nodes[i]!.children?.forEach(visit);
  };
  nodes.forEach((_, i) => parent[i] === -1 && visit(i));
  const indexOf = new Map(order.map((n, k) => [n, k]));
  const rest = (i: number) => {
    const n = nodes[i]!;
    if (n.matrix) return matrixToTR(n.matrix);
    return { t: (n.translation ?? [0, 0, 0]) as V3, r: (n.rotation ?? [0, 0, 0, 1]) as Q };
  };
  const bones: SourceBone[] = order.map((i) => ({ name: `node${i}`, parent: parent[i]! < 0 ? -1 : indexOf.get(parent[i]!)!, position: rest(i).t, rotation: rest(i).r }));
  const map: RigMap = {};
  for (const [name, b] of Object.entries(human)) if (CANONICAL_BONES.some((c) => c.name === name)) map[name] = { bone: `node${b.node}` };

  // Sample rotations at the frame's time.
  const anim = json.animations?.[0];
  let duration = 0;
  const tracks = new Map<number, { times: number[]; values: Q[]; step: boolean }>();
  for (const ch of anim?.channels ?? []) {
    if (ch.target.path !== 'rotation' || ch.target.node === undefined) continue;
    const s = anim!.samplers[ch.sampler]!;
    const times = readAccessor(json, bin, s.input).map((r) => r[0]!);
    const values = readAccessor(json, bin, s.output) as Q[];
    if (s.interpolation === 'CUBICSPLINE') for (let k = 0; k < times.length; k++) values[k] = values[k * 3 + 1]!;
    tracks.set(ch.target.node, { times, values, step: s.interpolation === 'STEP' });
    duration = Math.max(duration, times[times.length - 1] ?? 0);
  }
  const frameCount = Math.max(1, Math.round(duration * VRMA_FPS) + 1);
  const f = Math.max(0, Math.min(frameCount - 1, frame));
  const time = f / VRMA_FPS;
  const locals: Q[] = order.map((i) => {
    const tr = tracks.get(i);
    if (!tr || !tr.times.length) return rest(i).r;
    let k = 0;
    while (k + 1 < tr.times.length && tr.times[k + 1]! <= time) k++;
    if (k + 1 >= tr.times.length || tr.step || time <= tr.times[0]!) return qnorm(tr.values[k]!);
    const t = (time - tr.times[k]!) / (tr.times[k + 1]! - tr.times[k]!);
    return qnorm(slerp(tr.values[k]!, tr.values[k + 1]!, t));
  });
  const required = CANONICAL_BONES.filter((b) => b.required).map((b) => b.name);
  const coverage = required.filter((b) => map[b]).length / required.length;
  const warnings = coverage < 0.9 ? [`Only ${Math.round(coverage * 100)}% of the main joints were found.`] : [];
  if (!anim) warnings.push('The file has no animation, so the pose is its rest pose.');
  return { pose: poseFromLocals(bones, map, locals), frameCount, frame: f, coverage, warnings };
}

/** A single-frame VRMA (VRM animation) of the canonical skeleton. */
export function poseToVrma(pose: CanonicalPose, rest: Record<string, V3> = restPose(FEMALE_PROPORTIONS)): ArrayBuffer {
  const names = exportBones().filter((n) => rest[n]);
  const index = new Map(names.map((n, i) => [n, i]));
  const nodes = names.map((n) => {
    const p = CANONICAL_BONES.find((b) => b.name === n)!.parent;
    const t = p ? [rest[n]![0] - rest[p]![0], rest[n]![1] - rest[p]![1], rest[n]![2] - rest[p]![2]] : rest[n]!;
    const children = names.filter((c) => CANONICAL_BONES.find((b) => b.name === c)!.parent === n).map((c) => index.get(c)!);
    return { name: n, translation: t, ...(children.length ? { children } : {}) };
  });
  // Binary: one time value, then one quaternion per bone.
  const floats = new Float32Array(1 + names.length * 4);
  floats[0] = 0;
  names.forEach((n, i) => floats.set(pose[n] ?? QI, 1 + i * 4));
  const accessors: object[] = [{ bufferView: 0, componentType: 5126, count: 1, type: 'SCALAR', min: [0], max: [0] }];
  const samplers: object[] = [];
  const channels: object[] = [];
  names.forEach((_, i) => {
    accessors.push({ bufferView: 1, byteOffset: i * 16, componentType: 5126, count: 1, type: 'VEC4' });
    samplers.push({ input: 0, output: i + 1, interpolation: 'LINEAR' });
    channels.push({ sampler: i, target: { node: i, path: 'rotation' } });
  });
  const humanBones: Record<string, { node: number }> = {};
  for (const n of names) humanBones[n] = { node: index.get(n)! };
  const json = {
    asset: { version: '2.0', generator: 'Poser' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones } } },
    scene: 0,
    scenes: [{ nodes: [index.get('hips')!] }],
    nodes,
    buffers: [{ byteLength: floats.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: names.length * 16 },
    ],
    accessors,
    animations: [{ name: 'pose', samplers, channels }],
  };
  return writeGlb(json, new Uint8Array(floats.buffer));
}

function writeGlb(json: object, bin: Uint8Array): ArrayBuffer {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new ArrayBuffer(total);
  const v = new DataView(out);
  const u8 = new Uint8Array(out);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jsonLen, true);
  v.setUint32(16, 0x4e4f534a, true);
  u8.set(enc, 20);
  for (let k = enc.length; k < jsonLen; k++) u8[20 + k] = 0x20;
  const b = 20 + jsonLen;
  v.setUint32(b, binLen, true);
  v.setUint32(b + 4, 0x004e4942, true);
  u8.set(bin, b + 8);
  return out;
}

// ---------- Pose JSON ----------

export const POSE_JSON_FORMAT = 'poser-pose';

export interface PoseJson {
  format: typeof POSE_JSON_FORMAT;
  version: 1;
  name: string;
  /** Canonical bone → local rotation [x, y, z, w] relative to the canonical T-pose. */
  pose: CanonicalPose;
}

export function poseToJson(name: string, pose: CanonicalPose): string {
  const round = (q: Q): Q => q.map((v) => Math.round(v * 1e6) / 1e6) as Q;
  const out: PoseJson = { format: POSE_JSON_FORMAT, version: 1, name, pose: Object.fromEntries(Object.entries(pose).map(([b, q]) => [b, round(q)])) };
  return JSON.stringify(out, null, 1);
}

export function parsePoseJson(text: string): { name: string; pose: CanonicalPose } {
  const data = JSON.parse(text) as Partial<PoseJson>;
  if (data.format !== POSE_JSON_FORMAT || typeof data.pose !== 'object' || !data.pose) throw new Error('Not a Poser pose file.');
  const known = new Set(CANONICAL_BONES.map((b) => b.name));
  const pose: CanonicalPose = {};
  for (const [bone, q] of Object.entries(data.pose)) {
    if (!known.has(bone) || !Array.isArray(q) || q.length !== 4 || !q.every((v) => Number.isFinite(v))) continue;
    pose[bone] = qnorm(q as Q);
  }
  return { name: typeof data.name === 'string' ? data.name : 'Pose', pose };
}

/** Reads any supported pose file (by its name's extension). */
export async function importPoseFile(fileName: string, data: Blob, frame = 0): Promise<ImportedPose & { name: string }> {
  const lower = fileName.toLowerCase();
  const base = (fileName.split('/').pop() ?? fileName).replace(/(\.pose)?\.[^.]+$/i, '');
  if (lower.endsWith('.bvh')) return { name: base, ...bvhToPose(await data.text(), frame) };
  if (lower.endsWith('.vrma') || lower.endsWith('.glb')) return { name: base, ...vrmaToPose(await data.arrayBuffer(), frame) };
  const { name, pose } = parsePoseJson(await data.text());
  return { name: name || base, pose, frameCount: 1, frame: 0, coverage: 1, warnings: [] };
}
