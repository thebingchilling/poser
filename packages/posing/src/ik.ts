import { axisAngle, fromTo, qmul, qnorm, qrot, vlen, vnorm, vsub, type CanonicalPose, type Q, type V3 } from '@poser/rig';
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
 * Two-bone IK: rotates the upper and middle bones so the end joint reaches
 * `target` (figure space), keeping the bend in the current plane (the elbow
 * or knee keeps pointing the same way). Out-of-reach targets straighten the
 * limb toward them. Returns the new pose and how far the end joint ended up
 * from the target.
 */
export function solveTwoBone(skel: PoseSkeleton, pose: CanonicalPose, effector: Effector, target: V3): { pose: CanonicalPose; error: number } {
  const [upper, middle, end] = LIMBS[effector];
  const P = skel.positions(pose);
  const a = P.get(upper)!;
  const b = P.get(middle)!;
  const c = P.get(end)!;
  const l1 = vlen(vsub(b, a));
  const l2 = vlen(vsub(c, b));
  const toTarget = vsub(target, a);
  const dist = Math.min(Math.max(vlen(toTarget), Math.abs(l1 - l2) + 1e-5), l1 + l2 - 1e-5);
  // Bend direction: where the middle joint sits relative to the root→end line now.
  const ac = vsub(c, a);
  let pole = vsub(vsub(b, a), scale(vnorm(ac), dot(vsub(b, a), vnorm(ac))));
  if (vlen(pole) < 1e-6) {
    // Straight limb: knees bend forward, elbows bend back and down.
    pole = effector.endsWith('Foot') ? [0, 0, 1] : [0, -0.3, -1];
  }
  const dirT = vnorm(toTarget);
  // Pole projected perpendicular to the new root→target line.
  let poleN = vsub(pole, scale(dirT, dot(pole, dirT)));
  poleN = vlen(poleN) < 1e-6 ? vnorm(cross(dirT, [1, 0, 0])) : vnorm(poleN);
  // Law of cosines: angle at the root between the target line and the upper bone.
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const newB: V3 = [
    a[0] + (dirT[0] * Math.cos(angA) + poleN[0] * Math.sin(angA)) * l1,
    a[1] + (dirT[1] * Math.cos(angA) + poleN[1] * Math.sin(angA)) * l1,
    a[2] + (dirT[2] * Math.cos(angA) + poleN[2] * Math.sin(angA)) * l1,
  ];
  const newC: V3 = [a[0] + dirT[0] * dist, a[1] + dirT[1] * dist, a[2] + dirT[2] * dist];

  // Rotate the upper bone so its child points at the new middle joint, then the middle bone likewise.
  const W = skel.worldRotations(pose);
  const upperW = W.get(upper)!;
  const curUpperDir = vsub(b, a);
  const upperWorld = qnorm(qmul(fromTo(curUpperDir, vsub(newB, a)), upperW));
  // Keep the roll: the rotation above swings the bone without twisting it.
  const next: CanonicalPose = { ...pose, [upper]: skel.localFor(pose, upper, upperWorld) };
  const W2 = skel.worldRotations(next);
  const P2 = skel.positions(next);
  const midW = W2.get(middle)!;
  const curMidDir = vsub(P2.get(end)!, P2.get(middle)!);
  const midWorld = qnorm(qmul(fromTo(curMidDir, vsub(newC, newB)), midW));
  next[middle] = skel.localFor(next, middle, midWorld);
  // The end bone (hand, foot) keeps its world orientation, as when you move a hand by grabbing it.
  next[end] = skel.localFor(next, end, W.get(end)!);
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
