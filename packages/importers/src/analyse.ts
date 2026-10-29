import { detectRig, type RigDetection, type SourceBone } from '@poser/rig';
import { Box3, Bone, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3, type Object3D } from 'three';

/**
 * Inspects a loaded model (PLAN.md section 4.3): what it is, its skeleton in
 * the bind pose, rig detection, morphs, size, and likely units and up axis.
 */
export type AssetKind = 'figure' | 'prop' | 'garment';

export interface ModelAnalysis {
  kind: AssetKind;
  /** Bind-pose skeleton in model space (after `normalisation` is applied). */
  bones: SourceBone[];
  rig: RigDetection | null;
  morphs: string[];
  triangles: number;
  meshes: number;
  skinned: boolean;
  /** Size after normalisation (m). */
  size: [number, number, number];
  normalisation: Normalisation;
}

export interface Normalisation {
  /** Multiply by this to get metres. */
  scale: number;
  /** The file's up axis. */
  upAxis: 'y' | 'z';
  /** Why: shown in the wizard ("looks like centimetres"). */
  reason: string;
}

/**
 * Guesses units and up axis from the size and shape. Humanoid figures are
 * 1.4–2.1 m; props anything from 2 cm to a few metres. glTF and VRM are
 * metres and Y-up by specification.
 */
export function guessNormalisation(size: [number, number, number], opts: { format: string; tallAxisHint?: 'y' | 'z'; isFigure: boolean }): Normalisation {
  const specMetres = opts.format === 'gltf' || opts.format === 'glb' || opts.format === 'vrm';
  // Up axis: a standing figure is tallest along its up axis.
  let upAxis: 'y' | 'z' = 'y';
  if (!specMetres && opts.isFigure && size[2] > size[1] * 1.5) upAxis = 'z';
  if (opts.tallAxisHint) upAxis = opts.tallAxisHint;
  const height = upAxis === 'y' ? size[1] : size[2];
  if (specMetres) return { scale: 1, upAxis: 'y', reason: 'glTF files are in metres' };
  if (opts.isFigure) {
    if (height > 1400) return { scale: 0.001, upAxis, reason: 'Looks like millimetres' };
    if (height > 14) return { scale: 0.01, upAxis, reason: 'Looks like centimetres' };
    if (height < 0.3) return { scale: 1.7 / height, upAxis, reason: 'Very small: scaled to 1.7 m tall, check the size' };
    return { scale: 1, upAxis, reason: 'Looks like metres' };
  }
  const largest = Math.max(...size);
  if (largest > 300) return { scale: 0.001, upAxis, reason: 'Looks like millimetres' };
  if (largest > 30) return { scale: 0.01, upAxis, reason: 'Looks like centimetres' };
  return { scale: 1, upAxis, reason: 'Looks like metres' };
}

/** The matrix that applies a normalisation (scale to metres, Z-up to Y-up). */
export function normalisationMatrix(n: Normalisation): Matrix4 {
  const m = new Matrix4().makeScale(n.scale, n.scale, n.scale);
  if (n.upAxis === 'z') m.premultiply(new Matrix4().makeRotationX(-Math.PI / 2));
  return m;
}

/** All bones used by skinned meshes, plus bone-only hierarchies (rigs without skin). */
function collectSkeleton(root: Object3D): { bones: Bone[]; bindWorld: Map<Bone, Matrix4> } {
  const bindWorld = new Map<Bone, Matrix4>();
  const bones: Bone[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    const sk = o.skeleton;
    sk.bones.forEach((b, i) => {
      if (bindWorld.has(b)) return;
      // In three.js skinning a bone's bind-pose world matrix is the inverse of its bone inverse.
      bindWorld.set(b, new Matrix4().copy(sk.boneInverses[i]!).invert());
      bones.push(b);
    });
  });
  if (!bones.length) {
    root.traverse((o) => {
      if (o instanceof Bone) {
        bones.push(o);
        bindWorld.set(o, o.matrixWorld.clone());
      }
    });
  }
  return { bones, bindWorld };
}

/**
 * Bind-pose skeleton as SourceBones: parents first, local transforms
 * relative to the parent bone (or the model root), positions in metres after
 * `extra` (the normalisation) is applied.
 */
export function extractBones(root: Object3D, extra = new Matrix4()): SourceBone[] {
  const { bones, bindWorld } = collectSkeleton(root);
  const set = new Set(bones);
  // Order parents before children.
  const ordered: Bone[] = [];
  const visit = (b: Bone) => {
    if (ordered.includes(b)) return;
    let p = b.parent;
    while (p && !(p instanceof Bone && set.has(p))) p = p.parent;
    if (p) visit(p as Bone);
    ordered.push(b);
  };
  bones.forEach(visit);
  const index = new Map(ordered.map((b, i) => [b, i]));
  // World position (metres) and rotation of each bone; scale is dropped, so local
  // offsets come out in metres rather than in the file's units.
  const world = new Map(
    ordered.map((b) => {
      const pos = new Vector3();
      const rot = new Quaternion();
      new Matrix4().copy(bindWorld.get(b)!).premultiply(extra).decompose(pos, rot, new Vector3());
      return [b, { pos, rot }];
    }),
  );
  return ordered.map((b) => {
    let p = b.parent;
    while (p && !(p instanceof Bone && set.has(p))) p = p.parent;
    const parentIndex = p ? index.get(p as Bone)! : -1;
    const w = world.get(b)!;
    if (parentIndex < 0) return { name: b.name, parent: -1, position: [w.pos.x, w.pos.y, w.pos.z], rotation: [w.rot.x, w.rot.y, w.rot.z, w.rot.w] };
    const pw = world.get(p as Bone)!;
    const inv = pw.rot.clone().invert();
    const pos = w.pos.clone().sub(pw.pos).applyQuaternion(inv);
    const rot = inv.multiply(w.rot);
    return { name: b.name, parent: parentIndex, position: [pos.x, pos.y, pos.z], rotation: [rot.x, rot.y, rot.z, rot.w] };
  });
}

export function analyseModel(root: Object3D, format: string, vrmHumanoid?: Record<string, string>): ModelAnalysis {
  root.updateMatrixWorld(true);
  let triangles = 0;
  let meshes = 0;
  let skinned = false;
  const morphs = new Set<string>();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    meshes++;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    if (o instanceof SkinnedMesh) skinned = true;
    for (const name of Object.keys(o.morphTargetDictionary ?? {})) morphs.add(name);
  });
  const box = new Box3().setFromObject(root, true);
  const raw = box.getSize(new Vector3());
  const rawBones = extractBones(root);
  const rigRaw = vrmHumanoid
    ? { kind: 'vrm' as const, map: Object.fromEntries(Object.entries(vrmHumanoid).map(([k, v]) => [k, { bone: v }])), coverage: 1, missing: [] }
    : rawBones.length
      ? detectRig(rawBones.map((b) => b.name))
      : null;
  const isFigure = !!rigRaw && rigRaw.coverage >= 0.75;
  const normalisation = guessNormalisation([raw.x, raw.y, raw.z], { format, isFigure });
  const m = normalisationMatrix(normalisation);
  const size = raw.clone().applyMatrix4(new Matrix4().extractRotation(m)).multiplyScalar(normalisation.scale);
  return {
    kind: isFigure ? 'figure' : skinned ? 'garment' : 'prop',
    bones: extractBones(root, m),
    rig: rigRaw,
    morphs: [...morphs].sort(),
    triangles: Math.round(triangles),
    meshes,
    skinned,
    size: [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)],
    normalisation,
  };
}
