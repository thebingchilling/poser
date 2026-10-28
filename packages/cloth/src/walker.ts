import type { Capsule, V3 } from '@poser/xpbd';

/**
 * An animated capsule body for the cloth prototype: hips, torso, and legs
 * in a walking cycle (PLAN.md section 23, prototype 2). Female proportions,
 * metres, facing +Z.
 */
export interface WalkerOptions {
  /** Steps per second. */
  cadence?: number;
  /** Hip swing amplitude in radians. */
  stride?: number;
}

const HIP_Y = 0.93;
const THIGH = 0.42;
const SHIN = 0.42;

export function walkerCapsules(time: number, { cadence = 0.9, stride = 0.45 }: WalkerOptions = {}): Capsule[] {
  const phase = time * cadence * Math.PI * 2;
  const bob = Math.abs(Math.sin(phase)) * 0.02;
  const hipY = HIP_Y - 0.01 + bob;
  const out: Capsule[] = [
    // Pelvis (wide, short) and torso.
    { a: [-0.065, hipY + 0.05, -0.01], b: [0.065, hipY + 0.05, -0.01], radius: 0.105, friction: 0.4 },
    { a: [0, hipY + 0.12, 0], b: [0, hipY + 0.45, 0], radius: 0.105, friction: 0.4 },
  ];
  for (const side of [1, -1]) {
    const swing = Math.sin(phase + (side > 0 ? 0 : Math.PI)) * stride;
    // Knee bends more as the leg swings forward.
    const knee = Math.max(0, Math.sin(phase + (side > 0 ? 0 : Math.PI) + 0.8)) * 0.6;
    const hip: V3 = [side * 0.09, hipY, 0];
    const kneePos: V3 = [hip[0], hip[1] - Math.cos(swing) * THIGH, hip[2] + Math.sin(swing) * THIGH];
    const shinAngle = swing - knee;
    const ankle: V3 = [hip[0], kneePos[1] - Math.cos(shinAngle) * SHIN, kneePos[2] + Math.sin(shinAngle) * SHIN];
    out.push({ a: hip, b: kneePos, radius: 0.075, friction: 0.5 }, { a: kneePos, b: ankle, radius: 0.05, friction: 0.5 });
  }
  return out;
}

export const WALKER_WAIST_Y = HIP_Y + 0.16;
