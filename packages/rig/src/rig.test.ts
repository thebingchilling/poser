import { describe, expect, it } from 'vitest';
import { CANONICAL_BONES, CANONICAL_BONE_NAMES, getBone, mirrorBoneName } from './bones';
import { FEMALE_PROPORTIONS, MALE_PROPORTIONS, boneTail, restPose } from './proportions';

describe('canonical rig', () => {
  it('has unique names and valid parents', () => {
    expect(new Set(CANONICAL_BONE_NAMES).size).toBe(CANONICAL_BONE_NAMES.length);
    for (const bone of CANONICAL_BONES) {
      if (bone.parent) expect(getBone(bone.parent), bone.name).toBeDefined();
    }
    expect(CANONICAL_BONES.filter((b) => b.parent === null).map((b) => b.name)).toEqual(['hips']);
  });

  it('includes 15 finger bones per hand', () => {
    for (const side of ['left', 'right']) {
      const fingers = CANONICAL_BONE_NAMES.filter((n) => n.startsWith(side) && /Thumb|Index|Middle|Ring|Little/.test(n));
      expect(fingers).toHaveLength(15);
    }
  });

  it('mirrors names', () => {
    expect(mirrorBoneName('leftUpperArm')).toBe('rightUpperArm');
    expect(mirrorBoneName('rightIndexDistal')).toBe('leftIndexDistal');
    expect(mirrorBoneName('spine')).toBe('spine');
  });

  it.each([
    ['female', FEMALE_PROPORTIONS],
    ['male', MALE_PROPORTIONS],
  ])('builds a symmetric %s rest pose for every bone', (_, proportions) => {
    const pose = restPose(proportions);
    for (const name of CANONICAL_BONE_NAMES) {
      const p = pose[name];
      expect(p, name).toBeDefined();
      const m = pose[mirrorBoneName(name)]!;
      expect(m[0]).toBeCloseTo(-p![0]);
      expect(m[1]).toBeCloseTo(p![1]);
      expect(boneTail(pose, name).every(Number.isFinite)).toBe(true);
    }
    // Arms are horizontal in the T-pose and the figure fits its height.
    expect(pose.leftHand![1]).toBeCloseTo(pose.leftUpperArm![1]);
    expect(boneTail(pose, 'head')[1]).toBeLessThanOrEqual(proportions.height + 0.03);
  });
});
