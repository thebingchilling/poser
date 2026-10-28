import { axisAngle, qmul, type Q } from './math';
import type { RagdollPose } from './ragdoll';

const X: [number, number, number] = [1, 0, 0];
const Y: [number, number, number] = [0, 1, 0];
const Z: [number, number, number] = [0, 0, 1];

/** Local rotations relative to the T-pose rest. */
export const SITTING_POSE: RagdollPose = {
  leftUpperLeg: axisAngle(X, -Math.PI / 2),
  rightUpperLeg: axisAngle(X, -Math.PI / 2),
  leftLowerLeg: axisAngle(X, Math.PI / 2),
  rightLowerLeg: axisAngle(X, Math.PI / 2),
  // Arms down by the sides, forearms resting forward on the thighs.
  leftUpperArm: axisAngle(Z, -1.3),
  rightUpperArm: axisAngle(Z, 1.3),
  leftLowerArm: axisAngle(Y, -0.9),
  rightLowerArm: axisAngle(Y, 0.9),
};

export const STANDING_POSE: RagdollPose = {
  leftUpperArm: axisAngle(Z, -1.25),
  rightUpperArm: axisAngle(Z, 1.25),
  leftLowerArm: axisAngle(Y, -0.15),
  rightLowerArm: axisAngle(Y, 0.15),
};

export function composePose(a: RagdollPose, b: RagdollPose): RagdollPose {
  const out: RagdollPose = { ...a };
  for (const [k, q] of Object.entries(b)) out[k] = a[k] ? qmul(a[k] as Q, q) : q;
  return out;
}
