import { axisAngle, fromTo, qmul, qnorm, qrot, swingTwist, vadd, vlen, vnorm, vsub, type CanonicalPose, type Q, type V3 } from '@poser/rig';
import { JOINT_LIMITS } from './limits';
import type { PoseSkeleton } from './skeleton';

/** IK chains for the effectors (PLAN.md section 6): hands and feet. */
export const LIMBS = {
  leftHand: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
  rightHand: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
  leftFoot: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
  rightFoot: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
} as const;

export type Effector = keyof typeof LIMBS;

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/**
 * Two-bone IK: the middle joint (elbow, knee) bends about its hinge axis from
 * the joint-limit table, so the result stays a natural bend; then the upper
 * bone aims the limb at `target` (figure space) and swivels so the elbow or
 * knee keeps pointing the way it did. Out-of-reach targets straighten the
 * limb toward them. Returns the new pose and how far the end joint ended up
 * from the target.
 */
export function solveTwoBone(
  skel: PoseSkeleton,
  pose: CanonicalPose,
  effector: Effector,
  target: V3,
  opts: { keepEndOrientation?: boolean } = {},
): { pose: CanonicalPose; error: number } {
  const [upper, middle, end] = LIMBS[effector];
  const P = skel.positions(pose);
  const W = skel.worldRotations(pose);
  const a = P.get(upper)!;
  const b = P.get(middle)!;
  const c = P.get(end)!;
  // Rest offsets in the upper bone's frame (canonical rest frames are identity).
  const v1 = vsub(skel.rest[middle]!, skel.rest[upper]!);
  const v2 = vsub(skel.rest[end]!, skel.rest[middle]!);
  const d2 = vnorm(v2);

  // 1. Elbow/knee: keep the current roll about the forearm/shin, replace the bend.
  const limit = JOINT_LIMITS[middle]!;
  let h = vsub(limit.axis, scale(d2, dot(limit.axis, d2)));
  h = vnorm(h);
  const roll = swingTwist(pose[middle] ?? [0, 0, 0, 1], d2).twist;
  const reachAt = (theta: number) => vlen(vadd(v1, qrot(qmul(axisAngle(h, theta), roll), v2)));
  // Straightest angle: where the forearm lines up with the upper arm in the bend plane.
  const r2 = qrot(roll, v2);
  const p1 = vsub(v1, scale(h, dot(v1, h)));
  const p2 = vsub(r2, scale(h, dot(r2, h)));
  const straight = Math.atan2(dot(cross(p2, p1), h), dot(p2, p1));
  const bendEnd = limit.centre >= 0 ? Math.PI * 0.95 : -Math.PI * 0.95;
  const want = vlen(vsub(target, a));
  let theta: number;
  if (want >= reachAt(straight)) theta = straight;
  else if (want <= reachAt(bendEnd)) theta = bendEnd;
  else {
    let lo = straight;
    let hi = bendEnd;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (reachAt(mid) > want) lo = mid;
      else hi = mid;
    }
    theta = (lo + hi) / 2;
  }
  const midLocal = qnorm(qmul(axisAngle(h, theta), roll));

  // 2. Aim: rotate the upper bone so the end joint lies on the line to the target.
  let U = W.get(upper)!;
  const endOffset = (u: Q) => qrot(u, vadd(v1, qrot(midLocal, v2)));
  const dirT = vnorm(vsub(target, a));
  U = qnorm(qmul(fromTo(endOffset(U), dirT), U));

  // 3. Swivel about the aim line so the elbow/knee points where it did.
  const ac = vsub(c, a);
  let pole = vsub(vsub(b, a), scale(vnorm(ac), dot(vsub(b, a), vnorm(ac))));
  if (vlen(pole) < 1e-4) pole = effector.endsWith('Foot') ? [0, 0, 1] : [0, -0.3, -1];
  const poleN = vsub(pole, scale(dirT, dot(pole, dirT)));
  const elbow = qrot(U, v1);
  const elbowN = vsub(elbow, scale(dirT, dot(elbow, dirT)));
  if (vlen(poleN) > 1e-6 && vlen(elbowN) > 1e-6) {
    const ang = Math.atan2(dot(cross(elbowN, poleN), dirT), dot(elbowN, poleN));
    U = qnorm(qmul(axisAngle(dirT, ang), U));
  }

  const next: CanonicalPose = { ...pose, [upper]: skel.localFor(pose, upper, U), [middle]: midLocal };
  // By default the hand or foot keeps its world orientation, as when you move a hand by grabbing it.
  if (opts.keepEndOrientation !== false) next[end] = skel.localFor(next, end, W.get(end)!);
  const reached = skel.positions(next).get(end)!;
  return { pose: next, error: vlen(vsub(reached, target)) };
}

/** Rotates `bone` about `axis` (world) by `angle`, keeping everything else. */
export function rotateBoneWorld(skel: PoseSkeleton, pose: CanonicalPose, bone: string, axis: V3, angle: number): CanonicalPose {
  const W = skel.worldRotations(pose);
  const world = qmul(axisAngle(axis, angle), W.get(bone)!);
  return { ...pose, [bone]: skel.localFor(pose, bone, world) };
}

/** World position of an effector (figure space). */
export function effectorPosition(skel: PoseSkeleton, pose: CanonicalPose, effector: Effector): V3 {
  return skel.positions(pose).get(LIMBS[effector][2])!;
}

export function rotateVector(q: Q, v: V3): V3 {
  return qrot(q, v);
}

/**
 * Spine and neck IK (PLAN.md section 6): FABRIK moves the chain's joints so
 * its end reaches `target` (figure space), then each bone is turned, from
 * the root out, to point at its new child position. `chain` lists the bones
 * from the root; `end` is the joint the user drags.
 */
export function solveChain(skel: PoseSkeleton, pose: CanonicalPose, chain: string[], end: string, target: V3, iterations = 12): CanonicalPose {
  const joints = [...chain, end];
  const P = skel.positions(pose);
  const pts = joints.map((j) => P.get(j)!);
  if (pts.some((p) => !p)) return pose;
  const lengths = pts.slice(1).map((p, i) => vlen(vsub(p, pts[i]!)));
  const root = pts[0]!;
  const total = lengths.reduce((a, b) => a + b, 0);
  const lerpTo = (a: V3, b: V3, len: number): V3 => {
    const d = vsub(b, a);
    const l = vlen(d) || 1;
    return [a[0] + (d[0] / l) * len, a[1] + (d[1] / l) * len, a[2] + (d[2] / l) * len];
  };
  if (vlen(vsub(target, root)) >= total) {
    // Out of reach: straighten toward the target.
    for (let i = 1; i < pts.length; i++) pts[i] = lerpTo(pts[i - 1]!, target, lengths[i - 1]!);
  } else {
    for (let it = 0; it < iterations; it++) {
      pts[pts.length - 1] = target;
      for (let i = pts.length - 2; i >= 0; i--) pts[i] = lerpTo(pts[i + 1]!, pts[i]!, lengths[i]!);
      pts[0] = root;
      for (let i = 1; i < pts.length; i++) pts[i] = lerpTo(pts[i - 1]!, pts[i]!, lengths[i - 1]!);
      if (vlen(vsub(pts[pts.length - 1]!, target)) < 1e-4) break;
    }
  }
  let next: CanonicalPose = { ...pose };
  chain.forEach((bone, i) => {
    const now = skel.positions(next);
    const from = vsub(now.get(joints[i + 1]!)!, now.get(bone)!);
    const to = vsub(pts[i + 1]!, now.get(bone)!);
    const W = skel.worldRotations(next).get(bone)!;
    next = { ...next, [bone]: skel.localFor(next, bone, qnorm(qmul(fromTo(from, to), W))) };
  });
  return next;
}

/**
 * Gaze (PLAN.md section 6): the eyes turn to look at `target` (up to about
 * 35°), and the head turns part of the way (`headShare`) so wide looks
 * aren't all eyes. Eyes look along +Z in the rest pose.
 */
export function lookAt(skel: PoseSkeleton, pose: CanonicalPose, target: V3, headShare = 0.4): CanonicalPose {
  let next: CanonicalPose = { ...pose };
  const turn = (bone: string, share: number, maxAngle: number) => {
    const P = skel.positions(next).get(bone);
    if (!P) return;
    const W = skel.worldRotations(next).get(bone)!;
    const forward = qrot(W, [0, 0, 1]);
    const want = vsub(target, P);
    let q = fromTo(forward, want);
    // Scale the turn by share, and cap it.
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q[3])));
    const k = Math.min(share, angle > 1e-6 ? maxAngle / angle : share);
    q = qnorm([q[0] * k, q[1] * k, q[2] * k, 1 - (1 - q[3]) * k]);
    next = { ...next, [bone]: skel.localFor(next, bone, qnorm(qmul(q, W))) };
  };
  turn('head', headShare, 1.0);
  for (const eye of ['leftEye', 'rightEye']) turn(eye, 1, 0.6);
  return next;
}
