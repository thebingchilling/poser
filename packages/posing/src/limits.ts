import { axisAngle, qangle, qinv, qmul, qnorm, swingTwist, vnorm, vsub, type CanonicalPose, type Q, type V3 } from '@poser/rig';
import type { PoseSkeleton } from './skeleton';

/**
 * Joint limits (PLAN.md section 6), shared with the physics ragdoll: each
 * joint bends about a hinge axis A within [centre − range, centre + range],
 * bends sideways up to `side`, and rolls up to `twist` (radians).
 */
export interface JointLimit {
  axis: V3;
  centre: number;
  range: number;
  side: number;
  twist: number;
}

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

function limitsTable(): Record<string, JointLimit> {
  const t: Record<string, JointLimit> = {
    spine: { axis: X, centre: 0.1, range: 0.6, side: 0.4, twist: 0.5 },
    chest: { axis: X, centre: 0, range: 0.4, side: 0.3, twist: 0.4 },
    upperChest: { axis: X, centre: 0, range: 0.3, side: 0.2, twist: 0.3 },
    neck: { axis: X, centre: 0, range: 0.7, side: 0.5, twist: 0.8 },
    head: { axis: X, centre: 0, range: 0.6, side: 0.4, twist: 0.6 },
  };
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left' ? 1 : -1;
    const n = (b: string) => side + b;
    Object.assign(t, {
      [n('Shoulder')]: { axis: Z, centre: 0, range: 0.35, side: 0.3, twist: 0.2 },
      [n('UpperArm')]: { axis: Z, centre: -0.6 * s, range: 1.7, side: 1.5, twist: 1.4 },
      [n('LowerArm')]: { axis: Y, centre: -1.25 * s, range: 1.3, side: 0.08, twist: 1.4 },
      [n('Hand')]: { axis: Z, centre: 0, range: 1.1, side: 0.45, twist: 0.25 },
      [n('UpperLeg')]: { axis: X, centre: -0.55, range: 1.5, side: 0.75, twist: 0.7 },
      [n('LowerLeg')]: { axis: X, centre: 1.25, range: 1.27, side: 0.05, twist: 0.2 },
      [n('Foot')]: { axis: X, centre: 0.1, range: 0.75, side: 0.35, twist: 0.3 },
      [n('Toes')]: { axis: X, centre: -0.2, range: 0.6, side: 0.1, twist: 0.1 },
    });
  }
  return t;
}

export const JOINT_LIMITS: Record<string, JointLimit> = limitsTable();

/**
 * Clamps a bone's local rotation into its limits. The rotation is split into
 * roll about the bone and a swing; the swing's bend about the hinge axis and
 * sideways are clamped separately. `boneDir` is the bone's rest direction.
 */
export function clampRotation(q: Q, limit: JointLimit, boneDir: V3): Q {
  const d = vnorm(boneDir);
  const { swing, twist } = swingTwist(q, d);
  // Roll angle (signed, about d).
  let tw = 2 * Math.atan2(twist[0] * d[0] + twist[1] * d[1] + twist[2] * d[2], twist[3]);
  tw = Math.max(-limit.twist, Math.min(limit.twist, wrap(tw)));
  // Swing as a rotation vector; components about the hinge axis and the side axis.
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, swing[3])));
  const s = Math.sqrt(Math.max(0, 1 - swing[3] * swing[3]));
  const v: V3 = s < 1e-9 ? [0, 0, 0] : [(swing[0] / s) * angle, (swing[1] / s) * angle, (swing[2] / s) * angle];
  const a = vnorm(limit.axis);
  const sideAxis = vnorm([d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]]);
  let main = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
  let side = v[0] * sideAxis[0] + v[1] * sideAxis[1] + v[2] * sideAxis[2];
  main = Math.max(limit.centre - limit.range, Math.min(limit.centre + limit.range, main));
  side = Math.max(-limit.side, Math.min(limit.side, side));
  const sv: V3 = [a[0] * main + sideAxis[0] * side, a[1] * main + sideAxis[1] * side, a[2] * main + sideAxis[2] * side];
  const sl = Math.hypot(...sv);
  const clampedSwing: Q = sl < 1e-9 ? [0, 0, 0, 1] : axisAngle(sv, sl);
  return qnorm(qmul(clampedSwing, axisAngle(d, tw)));
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Applies all joint limits to a pose; returns the pose and the largest correction (radians). */
export function applyLimits(skel: PoseSkeleton, pose: CanonicalPose): { pose: CanonicalPose; correction: number } {
  const out: CanonicalPose = { ...pose };
  let correction = 0;
  for (const [bone, q] of Object.entries(pose)) {
    const limit = JOINT_LIMITS[bone];
    const dir = boneDirection(skel, bone);
    if (!limit || !dir) continue;
    const c = clampRotation(q, limit, dir);
    correction = Math.max(correction, qangle(c, q));
    out[bone] = c;
  }
  return { pose: out, correction };
}

/** Rest direction of a bone (toward its first child) in the figure's T-pose. */
export function boneDirection(skel: PoseSkeleton, bone: string): V3 | null {
  const child = skel.bones.find((b) => skel.parentOf(b) === bone && !/Eye|Breast|Glute|jaw|belly|Thumb|Index|Ring|Little/.test(b));
  if (!child) return null;
  return vsub(skel.rest[child]!, skel.rest[bone]!);
}

export { qinv };
