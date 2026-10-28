import { CANONICAL_BONES, type Side } from './bones';

export type Vec3 = [number, number, number];

/**
 * Body proportions for the built-in placeholder figures, in metres. The
 * figure stands at the origin in a T-pose, Y up, facing +Z, so its left side
 * is +X (the VRM convention).
 */
export interface BodyProportions {
  height: number;
  hipHeight: number;
  /** Half the distance between hip joints. */
  hipHalfWidth: number;
  /** Half the distance between shoulder joints. */
  shoulderHalfWidth: number;
  waistHeight: number;
  chestHeight: number;
  shoulderHeight: number;
  neckHeight: number;
  headHeight: number;
  upperArm: number;
  lowerArm: number;
  hand: number;
  upperLeg: number;
  lowerLeg: number;
  ankleHeight: number;
  footLength: number;
  breastSize: number;
}

/** Adult female, 1.68 m, about 7.5 heads tall. */
export const FEMALE_PROPORTIONS: BodyProportions = {
  height: 1.68,
  hipHeight: 0.93,
  hipHalfWidth: 0.09,
  shoulderHalfWidth: 0.17,
  waistHeight: 1.05,
  chestHeight: 1.2,
  shoulderHeight: 1.38,
  neckHeight: 1.43,
  headHeight: 0.225,
  upperArm: 0.28,
  lowerArm: 0.24,
  hand: 0.175,
  upperLeg: 0.42,
  lowerLeg: 0.4,
  ankleHeight: 0.075,
  footLength: 0.235,
  breastSize: 1,
};

/** Adult male, 1.78 m. */
export const MALE_PROPORTIONS: BodyProportions = {
  height: 1.78,
  hipHeight: 0.97,
  hipHalfWidth: 0.09,
  shoulderHalfWidth: 0.2,
  waistHeight: 1.1,
  chestHeight: 1.29,
  shoulderHeight: 1.47,
  neckHeight: 1.53,
  headHeight: 0.235,
  upperArm: 0.3,
  lowerArm: 0.26,
  hand: 0.19,
  upperLeg: 0.45,
  lowerLeg: 0.43,
  ankleHeight: 0.08,
  footLength: 0.265,
  breastSize: 0,
};

/** World-space joint positions of the rest (T) pose. */
export type RestPose = Record<string, Vec3>;

export function restPose(p: BodyProportions): RestPose {
  const pose: RestPose = {};
  const headBase = p.height - p.headHeight;
  pose.hips = [0, p.hipHeight + 0.05, 0];
  pose.spine = [0, p.waistHeight, 0];
  pose.chest = [0, p.chestHeight, 0];
  pose.upperChest = [0, (p.chestHeight + p.shoulderHeight) / 2, 0];
  pose.neck = [0, p.neckHeight, -0.01];
  pose.head = [0, headBase, 0];
  pose.jaw = [0, headBase + p.headHeight * 0.25, 0.02];
  pose.belly = [0, p.waistHeight - 0.04, 0.08];

  for (const side of ['left', 'right'] as Side[]) {
    const x = side === 'left' ? 1 : -1;
    const s = (n: string) => side + n;
    pose[s('Eye')] = [x * 0.032, headBase + p.headHeight * 0.45, 0.075];
    pose[s('Breast')] = [x * 0.09, p.chestHeight + 0.03, 0.08];
    pose[s('Glute')] = [x * 0.08, p.hipHeight - 0.02, -0.08];

    const shoulderY = p.shoulderHeight;
    pose[s('Shoulder')] = [x * 0.025, shoulderY, -0.01];
    const upperArmX = p.shoulderHalfWidth;
    const lowerArmX = upperArmX + p.upperArm;
    const handX = lowerArmX + p.lowerArm;
    pose[s('UpperArm')] = [x * upperArmX, shoulderY, -0.01];
    pose[s('LowerArm')] = [x * lowerArmX, shoulderY, -0.02];
    pose[s('Hand')] = [x * handX, shoulderY, -0.01];

    // Fingers: the palm is about 45% of the hand length.
    const palm = p.hand * 0.45;
    const fingerLen = p.hand * 0.55;
    const fingers: [string, number, number][] = [
      ['Index', 0.026, 0.95],
      ['Middle', 0.008, 1],
      ['Ring', -0.01, 0.93],
      ['Little', -0.027, 0.75],
    ];
    for (const [finger, z, scale] of fingers) {
      const len = fingerLen * scale;
      const segs = [0.45, 0.3, 0.25];
      let fx = handX + palm * (finger === 'Little' ? 0.9 : 1);
      for (const [i, seg] of ['Proximal', 'Intermediate', 'Distal'].entries()) {
        pose[s(finger + seg)] = [x * fx, shoulderY, z];
        fx += len * segs[i]!;
      }
    }
    const thumb: [string, Vec3][] = [
      ['Metacarpal', [handX + 0.015, shoulderY - 0.012, 0.022]],
      ['Proximal', [handX + 0.045, shoulderY - 0.02, 0.045]],
      ['Distal', [handX + 0.075, shoulderY - 0.024, 0.06]],
    ];
    for (const [seg, [tx, ty, tz]] of thumb) pose[s('Thumb' + seg)] = [x * tx, ty, tz];

    const legX = p.hipHalfWidth;
    pose[s('UpperLeg')] = [x * legX, p.hipHeight, 0];
    pose[s('LowerLeg')] = [x * legX, p.hipHeight - p.upperLeg, 0.005];
    pose[s('Foot')] = [x * legX, p.ankleHeight, -0.01];
    pose[s('Toes')] = [x * legX, 0.015, p.footLength * 0.6];
  }
  return pose;
}

/** Bone tail = mean of children's heads, or an extension along the parent direction. */
export function boneTail(pose: RestPose, name: string): Vec3 {
  const head = pose[name];
  if (!head) throw new Error(`Unknown bone ${name}`);
  if (name === 'head') return [head[0], head[1] + 0.2, head[2]];
  const kids = CANONICAL_BONES.filter(
    (b) => b.parent === name && !b.softTissue && !b.name.endsWith('Eye') && b.name !== 'jaw' && pose[b.name],
  );
  // Prefer the main chain child (e.g. hand -> middle finger, not thumb).
  const main = kids.find((k) => /Middle|LowerArm|Hand$|LowerLeg|Foot$|Toes|spine|chest|upperChest|neck|head/.test(k.name)) ?? kids[0];
  if (main) return pose[main.name]!;
  const parentName = CANONICAL_BONES.find((b) => b.name === name)?.parent;
  const parent = parentName ? pose[parentName] : undefined;
  if (!parent) return [head[0], head[1] + 0.05, head[2]];
  const d: Vec3 = [head[0] - parent[0], head[1] - parent[1], head[2] - parent[2]];
  const len = Math.hypot(...d) || 1;
  const ext = name.endsWith('Toes') ? 0.06 : name.includes('Distal') ? 0.022 : 0.05;
  return [head[0] + (d[0] / len) * ext, head[1] + (d[1] / len) * ext, head[2] + (d[2] / len) * ext];
}
