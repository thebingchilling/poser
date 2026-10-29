import { FEMALE_PROPORTIONS, QI, axisAngle, fromTo, qmul, qnorm, qrot, restPose, type CanonicalPose, type Q, type V3 } from '@poser/rig';
import { applyHandPreset, type HandPreset } from './hands';
import { JOINT_LIMITS, boneDirection, clampRotation } from './limits';
import { solveTwoBone, type Effector } from './ik';
import { copySide } from './mirror';
import { PoseSkeleton } from './skeleton';

/**
 * Pose library helpers (PLAN.md sections 6 and 17): built-in starter poses,
 * pose blending, and the random pose generator. Poses are canonical, so they
 * work on any figure.
 */

let skeletonCache: PoseSkeleton | null = null;

/** The standard female canonical skeleton (used for thumbnails and when no figure is at hand). */
export function defaultSkeleton(): PoseSkeleton {
  return (skeletonCache ??= new PoseSkeleton(restPose(FEMALE_PROPORTIONS)));
}

const D = Math.PI / 180;

/** Rotation from Euler angles in degrees, applied X then Y then Z in the bone's frame (q = qx·qy·qz). */
export function euler(x: number, y: number, z: number): Q {
  return qnorm(qmul(qmul(axisAngle([1, 0, 0], x * D), axisAngle([0, 1, 0], y * D)), axisAngle([0, 0, 1], z * D)));
}

type Spec = Record<string, [number, number, number]>;

/**
 * Builds a pose from Euler angles. Sides use the figure's own left (+X); the
 * figure faces +Z. Handy signs: left arm down = Z −, left arm forward = Y −,
 * elbow bend (left) = Y −, hip flexion = X −, knee bend = X +, toes down = X +,
 * lean forward = X +.
 */
function build(spec: Spec, opts: { mirror?: boolean; hands?: [HandPreset, HandPreset] } = {}): CanonicalPose {
  let pose: CanonicalPose = {};
  for (const [bone, [x, y, z]] of Object.entries(spec)) pose[bone] = euler(x, y, z);
  if (opts.mirror) pose = copySide(pose, 'left');
  const [l, r] = opts.hands ?? ['relaxed', 'relaxed'];
  pose = applyHandPreset(pose, 'left', l);
  pose = applyHandPreset(pose, 'right', r);
  return pose;
}

/** Moves hands or feet to targets (figure space on the standard skeleton) with two-bone IK. */
function reach(pose: CanonicalPose, targets: Partial<Record<Effector, V3>>): CanonicalPose {
  const skel = defaultSkeleton();
  for (const [eff, t] of Object.entries(targets)) pose = solveTwoBone(skel, pose, eff as Effector, t, { keepEndOrientation: false }).pose;
  return pose;
}

/**
 * Gives a hand a world orientation: fingers along `fingers`, palm facing
 * `palm` (both figure space). In the T-pose the left hand's fingers point +X
 * with the palm down.
 */
function orientHand(pose: CanonicalPose, side: 'left' | 'right', fingers: V3, palm: V3): CanonicalPose {
  const skel = defaultSkeleton();
  const s = side === 'left' ? 1 : -1;
  const aim = fromTo([s, 0, 0], fingers);
  // Roll about the fingers so the palm faces the right way.
  const f = norm(fingers);
  const have = qrot(aim, [0, -1, 0]);
  const proj = (v: V3): V3 => {
    const d = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    return [v[0] - f[0] * d, v[1] - f[1] * d, v[2] - f[2] * d];
  };
  const a = norm(proj(have));
  const b = norm(proj(palm));
  const c = cross(a, b);
  const roll = Math.atan2(c[0] * f[0] + c[1] * f[1] + c[2] * f[2], a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  const world = qmul(axisAngle(f, roll), aim);
  const bone = `${side}Hand`;
  return { ...pose, [bone]: skel.localFor(pose, bone, world) };
}

/** Height of the waist (spine joint) on the standard skeleton. */
const WAIST_Y = () => defaultSkeleton().rest.spine![1];

export type PoseCategory = 'standing' | 'sitting' | 'kneeling' | 'lying' | 'action';

export const POSE_CATEGORY_LABELS: Record<PoseCategory, string> = {
  standing: 'Standing',
  sitting: 'Sitting',
  kneeling: 'Kneeling and crouching',
  lying: 'Lying',
  action: 'Action',
};

export interface BuiltinPose {
  id: string;
  name: string;
  category: PoseCategory;
  pose: CanonicalPose;
}

const armsDown: Spec = { leftUpperArm: [0, 0, -72], leftLowerArm: [0, -12, 0] };

export const BUILTIN_POSES: readonly BuiltinPose[] = [
  { id: 'builtin:t-pose', name: 'T-pose', category: 'standing', pose: build({}, { hands: ['flat', 'flat'] }) },
  { id: 'builtin:a-pose', name: 'A-pose', category: 'standing', pose: build({ leftUpperArm: [0, 0, -45] }, { mirror: true }) },
  { id: 'builtin:relaxed', name: 'Relaxed standing', category: 'standing', pose: build(armsDown, { mirror: true }) },
  {
    id: 'builtin:contrapposto',
    name: 'Contrapposto',
    category: 'standing',
    pose: build({
      hips: [0, 6, 5],
      spine: [0, -3, -4],
      chest: [0, -3, -4],
      neck: [0, 0, 3],
      head: [3, -8, 2],
      leftUpperLeg: [-6, 0, 2],
      leftLowerLeg: [12, 0, 0],
      leftFoot: [-4, 0, 0],
      rightUpperLeg: [0, 0, -5],
      leftUpperArm: [0, 6, -74],
      leftLowerArm: [0, -15, 0],
      rightUpperArm: [0, 0, 70],
      rightLowerArm: [0, 25, 0],
    }),
  },
  {
    id: 'builtin:hands-on-hips',
    name: 'Hands on hips',
    category: 'standing',
    // Seeded with the elbows bent so IK keeps them pointing out and back.
    pose: copySide(
      orientHand(reach(build({ leftUpperArm: [0, 30, -50], leftLowerArm: [0, -40, 0], leftUpperLeg: [0, 0, 4] }, { hands: ['relaxed', 'relaxed'] }), { leftHand: [0.155, WAIST_Y() - 0.02, 0.0] }), 'left', [-0.25, -0.6, 0.75], [-1, 0, 0]),
      'left',
    ),
  },
  {
    id: 'builtin:arms-up',
    name: 'Arms up',
    category: 'standing',
    pose: build({ leftShoulder: [0, 0, 18], leftUpperArm: [0, -10, 62], leftLowerArm: [0, -15, 0], head: [-10, 0, 0], chest: [-5, 0, 0] }, { mirror: true, hands: ['open', 'open'] }),
  },
  {
    id: 'builtin:arms-crossed',
    name: 'Arms crossed',
    category: 'standing',
    pose: reach(build({ leftUpperArm: [0, -20, -60], leftLowerArm: [0, -60, 0], rightUpperArm: [0, 20, 60], rightLowerArm: [0, 60, 0], head: [4, 0, 0] }, { hands: ['grip', 'grip'] }), {
      leftHand: [-0.13, 1.2, 0.13],
      rightHand: [0.13, 1.17, 0.16],
    }),
  },
  {
    id: 'builtin:walking',
    name: 'Walking',
    category: 'action',
    pose: build({
      hips: [0, 6, 0],
      spine: [3, -4, 0],
      chest: [0, -4, 0],
      leftUpperLeg: [-26, 0, 0],
      leftLowerLeg: [8, 0, 0],
      leftFoot: [-10, 0, 0],
      rightUpperLeg: [16, 0, 0],
      rightLowerLeg: [28, 0, 0],
      rightFoot: [10, 0, 0],
      leftUpperArm: [0, 22, -76],
      leftLowerArm: [0, -12, 0],
      rightUpperArm: [0, 20, 76],
      rightLowerArm: [0, 30, 0],
    }),
  },
  {
    id: 'builtin:running',
    name: 'Running',
    category: 'action',
    pose: build({
      hips: [12, 8, 0],
      spine: [6, -6, 0],
      chest: [0, -6, 0],
      head: [-14, 4, 0],
      leftUpperLeg: [-62, 0, 0],
      leftLowerLeg: [80, 0, 0],
      leftFoot: [10, 0, 0],
      rightUpperLeg: [18, 0, 0],
      rightLowerLeg: [70, 0, 0],
      rightFoot: [30, 0, 0],
      leftUpperArm: [0, 45, -72],
      leftLowerArm: [0, -80, 0],
      rightUpperArm: [0, 50, 70],
      rightLowerArm: [0, 95, 0],
    }, { hands: ['grip', 'grip'] }),
  },
  {
    id: 'builtin:reaching',
    name: 'Reaching forward',
    category: 'action',
    pose: build({
      hips: [20, 0, 0],
      spine: [18, 0, 0],
      chest: [10, 0, 0],
      head: [-20, 0, 0],
      leftUpperLeg: [-18, 0, 0],
      rightUpperLeg: [-18, 0, 0],
      leftUpperArm: [0, -80, -15],
      leftLowerArm: [0, -5, 0],
      rightUpperArm: [0, 30, 72],
      rightLowerArm: [0, 15, 0],
    }, { hands: ['open', 'relaxed'] }),
  },
  {
    id: 'builtin:sitting-chair',
    name: 'Sitting on a chair',
    category: 'sitting',
    pose: build({
      spine: [-4, 0, 0],
      chest: [4, 0, 0],
      head: [4, 0, 0],
      leftUpperLeg: [-88, 0, 4],
      leftLowerLeg: [86, 0, 0],
      leftFoot: [-2, 0, 0],
      leftUpperArm: [0, -22, -70],
      leftLowerArm: [0, -60, 0],
    }, { mirror: true }),
  },
  {
    id: 'builtin:sitting-floor',
    name: 'Sitting on the floor',
    category: 'sitting',
    pose: build({
      spine: [-12, 0, 0],
      chest: [6, 0, 0],
      head: [10, 0, 0],
      leftUpperLeg: [-85, 0, 6],
      leftLowerLeg: [8, 0, 0],
      leftFoot: [12, 0, 0],
      rightUpperLeg: [-95, 0, -10],
      rightLowerLeg: [110, 0, 0],
      leftUpperArm: [0, 40, -62],
      leftLowerArm: [0, -5, 0],
      rightUpperArm: [0, -45, 52],
      rightLowerArm: [0, 40, 0],
    }),
  },
  {
    id: 'builtin:kneeling',
    name: 'Kneeling',
    category: 'kneeling',
    pose: build({ leftUpperLeg: [-4, 0, 3], leftLowerLeg: [92, 0, 0], leftFoot: [40, 0, 0], leftUpperArm: [0, 4, -74], leftLowerArm: [0, -14, 0] }, { mirror: true }),
  },
  {
    id: 'builtin:one-knee',
    name: 'On one knee',
    category: 'kneeling',
    pose: build({
      leftUpperLeg: [-88, 0, 4],
      leftLowerLeg: [88, 0, 0],
      rightUpperLeg: [4, 0, -3],
      rightLowerLeg: [92, 0, 0],
      rightFoot: [40, 0, 0],
      leftUpperArm: [0, -30, -60],
      leftLowerArm: [0, -55, 0],
      rightUpperArm: [0, 0, 72],
      rightLowerArm: [0, 15, 0],
    }),
  },
  {
    id: 'builtin:crouch',
    name: 'Crouching',
    category: 'kneeling',
    pose: build({ hips: [18, 0, 0], spine: [20, 0, 0], chest: [10, 0, 0], head: [-22, 0, 0], leftUpperLeg: [-118, 0, 10], leftLowerLeg: [138, 0, 0], leftFoot: [-38, 0, 0], leftUpperArm: [0, -55, -45], leftLowerArm: [0, -40, 0] }, { mirror: true }),
  },
  {
    id: 'builtin:lying-back',
    name: 'Lying on the back',
    category: 'lying',
    pose: build({ hips: [-90, 0, 0], head: [6, 0, 0], leftUpperArm: [0, 0, -60], leftLowerArm: [0, -10, 0], leftUpperLeg: [0, 0, 4], leftFoot: [20, 0, 0] }, { mirror: true }),
  },
  {
    id: 'builtin:lying-front',
    name: 'Lying on the front',
    category: 'lying',
    pose: build({ hips: [90, 0, 0], neck: [-25, 0, 0], head: [-25, 0, 0], leftUpperArm: [0, 0, -72], leftLowerArm: [0, -5, 0], leftUpperLeg: [0, 0, 4], leftFoot: [40, 0, 0] }, { mirror: true, hands: ['relaxed', 'relaxed'] }),
  },
  {
    id: 'builtin:lying-side',
    name: 'Lying on the side',
    category: 'lying',
    pose: build({
      hips: [0, 0, -90],
      neck: [0, 0, 10],
      head: [0, 0, 12],
      leftUpperArm: [0, -80, 0],
      leftLowerArm: [0, -100, 0],
      rightUpperArm: [0, 20, 72],
      rightLowerArm: [0, 20, 0],
      leftUpperLeg: [-30, 0, 0],
      leftLowerLeg: [50, 0, 0],
      rightUpperLeg: [-60, 0, 0],
      rightLowerLeg: [80, 0, 0],
    }),
  },
];

export function builtinPose(id: string): BuiltinPose | undefined {
  return BUILTIN_POSES.find((p) => p.id === id);
}

/**
 * Weighted mix of poses (PLAN.md section 17: pose blending), e.g. 70% sitting
 * and 30% leaning. Rotations are averaged per bone (sign-aligned normalised
 * sum, accurate for the moderate differences between poses); bones a pose
 * doesn't list count as its rest rotation.
 */
export function blendPoses(entries: { pose: CanonicalPose; weight: number }[]): CanonicalPose {
  const live = entries.filter((e) => e.weight > 0);
  const total = live.reduce((s, e) => s + e.weight, 0);
  if (!live.length || total <= 0) return {};
  const bones = new Set(live.flatMap((e) => Object.keys(e.pose)));
  const out: CanonicalPose = {};
  for (const bone of bones) {
    const ref = live.reduce((best, e) => (e.weight > best.weight ? e : best)).pose[bone] ?? QI;
    const acc: Q = [0, 0, 0, 0];
    for (const e of live) {
      const q = e.pose[bone] ?? QI;
      const sign = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
      for (let i = 0; i < 4; i++) acc[i]! += q[i]! * sign * (e.weight / total);
    }
    out[bone] = qnorm(acc);
  }
  return out;
}

export type RandomLock = 'head' | 'torso' | 'arms' | 'legs' | 'hands';

export const RANDOM_LOCK_LABELS: Record<RandomLock, string> = {
  head: 'Head',
  torso: 'Torso',
  arms: 'Arms',
  legs: 'Legs',
  hands: 'Hands',
};

const REGION: Record<RandomLock, RegExp> = {
  head: /^(neck|head)$/,
  torso: /^(spine|chest|upperChest)$/,
  arms: /(Shoulder|UpperArm|LowerArm|Hand)$/,
  legs: /(UpperLeg|LowerLeg|Foot|Toes)$/,
  hands: /(Thumb|Index|Middle|Ring|Little)/,
};

/** Small deterministic generator, so a seed reproduces a pose. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const HAND_CHOICES: HandPreset[] = ['relaxed', 'open', 'fist', 'point', 'grip', 'pinch', 'flat'];

/**
 * A random pose within the joint limits (PLAN.md section 17: randomizers).
 * `amount` scales how far joints move from the rest pose (0–1); locked
 * regions keep their rotations from `base`. Legs move less than arms so the
 * figure mostly stays on its feet.
 */
export function randomPose(
  base: CanonicalPose,
  opts: { amount?: number; locks?: RandomLock[]; random?: () => number; skeleton?: PoseSkeleton } = {},
): CanonicalPose {
  const amount = Math.max(0, Math.min(1, opts.amount ?? 0.6));
  const locks = new Set(opts.locks ?? []);
  const rnd = opts.random ?? Math.random;
  const skel = opts.skeleton ?? defaultSkeleton();
  const out: CanonicalPose = {};
  const locked = (bone: string) => [...locks].some((r) => REGION[r].test(bone));
  for (const [bone, q] of Object.entries(base)) if (locked(bone)) out[bone] = q;
  const u = () => rnd() * 2 - 1;
  for (const [bone, limit] of Object.entries(JOINT_LIMITS)) {
    if (locked(bone) || !skel.bones.includes(bone)) continue;
    const dir = boneDirection(skel, bone);
    if (!dir) continue;
    const scale = /Leg|Foot|Toes/.test(bone) ? 0.45 : 1;
    const lo = Math.max(limit.centre - limit.range, -Math.PI);
    const hi = Math.min(limit.centre + limit.range, Math.PI);
    // Bend: somewhere between rest (0, clamped into range) and a random point in range.
    const rest = Math.max(lo, Math.min(hi, 0));
    const main = rest + (lo + rnd() * (hi - lo) - rest) * amount * scale;
    const side = u() * limit.side * amount * scale;
    const twist = u() * limit.twist * amount * scale * 0.5;
    const a = norm(limit.axis);
    const d = norm(dir);
    const s = norm(cross(d, a));
    const sv: V3 = [a[0] * main + s[0] * side, a[1] * main + s[1] * side, a[2] * main + s[2] * side];
    const len = Math.hypot(...sv);
    const swing = len < 1e-9 ? QI : axisAngle(sv, len);
    // The hinge axis isn't always square to the bone, so clamp the result exactly.
    out[bone] = clampRotation(qnorm(qmul(swing, axisAngle(d, twist))), limit, dir);
  }
  if (!locks.has('hands')) {
    let p = out;
    for (const side of ['left', 'right'] as const) p = applyHandPreset(p, side, HAND_CHOICES[Math.floor(rnd() * HAND_CHOICES.length)]!, 0.5 + rnd() * 0.5);
    return p;
  }
  return out;
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: V3): V3 {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
