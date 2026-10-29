import { FEMALE_PROPORTIONS, axisAngle, qangle, restPose, vlen, vsub, type CanonicalPose, type V3 } from '@poser/rig';
import { describe, expect, it } from 'vitest';
import { handPose } from './hands';
import { effectorPosition, solveTwoBone } from './ik';
import { JOINT_LIMITS, applyLimits, boneDirection, clampRotation } from './limits';
import { copySide, mirrorPose } from './mirror';
import { PoseSkeleton } from './skeleton';
import { BUILTIN_POSES, blendPoses, defaultSkeleton, euler, randomPose, seededRandom } from './library';
import { poseThumbnailSvg } from './thumbnail';

const skel = new PoseSkeleton(restPose(FEMALE_PROPORTIONS));

describe('pose skeleton', () => {
  it('gives the rest joints for an empty pose and rotates children with parents', () => {
    const rest = skel.positions({});
    expect(rest.get('leftHand')).toEqual(skel.rest.leftHand);
    // Lowering the left upper arm 90° puts the hand below the shoulder.
    const p = skel.positions({ leftUpperArm: axisAngle([0, 0, 1], -Math.PI / 2) });
    const sh = p.get('leftUpperArm')!;
    const hand = p.get('leftHand')!;
    expect(hand[0]).toBeCloseTo(sh[0], 2);
    expect(hand[1]).toBeLessThan(sh[1] - 0.4);
  });
});

describe('two-bone IK', () => {
  it('puts the hand on a reachable target', () => {
    const target: V3 = [0.35, 1.15, 0.25];
    const { pose, error } = solveTwoBone(skel, {}, 'leftHand', target);
    expect(error).toBeLessThan(1e-4);
    expect(vlen(vsub(effectorPosition(skel, pose, 'leftHand'), target))).toBeLessThan(1e-4);
  });

  it('keeps knees bending forward', () => {
    // Start with a slightly bent knee, then pull the foot up toward the hip.
    const start: CanonicalPose = { leftUpperLeg: axisAngle([1, 0, 0], -0.3), leftLowerLeg: axisAngle([1, 0, 0], 0.5) };
    const hip = skel.positions(start).get('leftUpperLeg')!;
    const { pose, error } = solveTwoBone(skel, start, 'leftFoot', [hip[0], hip[1] - 0.5, hip[2] + 0.05]);
    expect(error).toBeLessThan(1e-4);
    const knee = skel.positions(pose).get('leftLowerLeg')!;
    expect(knee[2]).toBeGreaterThan(hip[2] + 0.1); // in front
  });

  it('straightens toward targets out of reach', () => {
    const sh = skel.rest.leftUpperArm!;
    const { pose, error } = solveTwoBone(skel, {}, 'leftHand', [sh[0] + 3, sh[1] + 1, sh[2]]);
    expect(error).toBeGreaterThan(1);
    const p = skel.positions(pose);
    const dirArm = vsub(p.get('leftHand')!, p.get('leftUpperArm')!);
    // Pointing at the target.
    expect(dirArm[1] / dirArm[0]).toBeCloseTo(1 / 3, 1);
  });

  it('keeps the hand orientation in the world when moving it', () => {
    const W0 = skel.worldRotations({}).get('leftHand')!;
    const { pose } = solveTwoBone(skel, {}, 'leftHand', [0.3, 1.1, 0.3]);
    expect(qangle(skel.worldRotations(pose).get('leftHand')!, W0)).toBeLessThan(1e-4);
  });
});

describe('joint limits', () => {
  it('refuses a knee bent backwards, but allows a normal bend', () => {
    const dir = boneDirection(skel, 'leftLowerLeg')!;
    const back = clampRotation(axisAngle([1, 0, 0], -0.8), JOINT_LIMITS.leftLowerLeg!, dir);
    // Clamped to (nearly) straight.
    expect(qangle(back, [0, 0, 0, 1])).toBeLessThan(0.05);
    const bend = axisAngle([1, 0, 0], 1.6);
    expect(qangle(clampRotation(bend, JOINT_LIMITS.leftLowerLeg!, dir), bend)).toBeLessThan(1e-6);
  });

  it('limits a whole pose and reports the correction', () => {
    const { correction } = applyLimits(skel, { leftLowerArm: axisAngle([0, 1, 0], 1.2) }); // elbow bent the wrong way
    expect(correction).toBeGreaterThan(1);
    const { correction: none } = applyLimits(skel, { leftLowerArm: axisAngle([0, 1, 0], -1.2) });
    expect(none).toBeLessThan(1e-6);
  });
});

describe('mirror and hands', () => {
  it('mirrors a pose so the right side matches the left', () => {
    const pose: CanonicalPose = { leftUpperArm: axisAngle([0, 0, 1], -1), leftLowerArm: axisAngle([0, 1, 0], -0.8) };
    const m = mirrorPose(pose);
    const p = skel.positions(pose);
    const q = skel.positions(m);
    const l = p.get('leftHand')!;
    const r = q.get('rightHand')!;
    expect(r[0]).toBeCloseTo(-l[0], 6);
    expect(r[1]).toBeCloseTo(l[1], 6);
    expect(r[2]).toBeCloseTo(l[2], 6);
    expect(mirrorPose(m).leftUpperArm).toEqual(pose.leftUpperArm);
    expect(copySide(pose, 'left').rightUpperArm).toEqual(m.rightUpperArm);
  });

  it('curls fingers toward the palm on both hands', () => {
    for (const side of ['left', 'right'] as const) {
      const pose = handPose(side, 'fist');
      const tip = skel.positions(pose).get(`${side}IndexDistal`)!;
      const flat = skel.positions({}).get(`${side}IndexDistal`)!;
      // Palm faces down in the T-pose: a fist moves the fingertips down.
      expect(tip[1]).toBeLessThan(flat[1] - 0.02);
    }
  });
});

describe('pose library', () => {
  const skel = defaultSkeleton();

  it('ships built-in poses within the joint limits', () => {
    for (const p of BUILTIN_POSES) {
      for (const q of Object.values(p.pose)) expect(q.every(Number.isFinite)).toBe(true);
      expect(applyLimits(skel, p.pose).correction, p.name).toBeLessThan(0.05);
    }
    expect(new Set(BUILTIN_POSES.map((p) => p.id)).size).toBe(BUILTIN_POSES.length);
  });

  it('blends poses by weight', () => {
    const bent = { leftLowerLeg: euler(80, 0, 0) };
    expect(qangle(blendPoses([{ pose: bent, weight: 1 }, { pose: {}, weight: 0 }]).leftLowerLeg!, bent.leftLowerLeg)).toBeLessThan(1e-9);
    expect(qangle(blendPoses([{ pose: bent, weight: 1 }, { pose: {}, weight: 1 }]).leftLowerLeg!, euler(40, 0, 0))).toBeLessThan(1e-6);
    expect(qangle(blendPoses([{ pose: bent, weight: 3 }, { pose: {}, weight: 1 }]).leftLowerLeg!, euler(60, 0, 0))).toBeLessThan(0.02);
    expect(blendPoses([])).toEqual({});
  });

  it('makes random poses within limits, keeping locked regions', () => {
    const base = BUILTIN_POSES.find((p) => p.id === 'builtin:walking')!.pose;
    const a = randomPose(base, { amount: 1, locks: ['legs'], random: seededRandom(7), skeleton: skel });
    const b = randomPose(base, { amount: 1, locks: ['legs'], random: seededRandom(7), skeleton: skel });
    expect(a).toEqual(b);
    expect(a.leftUpperLeg).toEqual(base.leftUpperLeg);
    expect(a.rightLowerLeg).toEqual(base.rightLowerLeg);
    expect(qangle(a.leftUpperArm!, base.leftUpperArm!)).toBeGreaterThan(1e-3);
    expect(applyLimits(skel, a).correction).toBeLessThan(1e-6);
    const none = randomPose({}, { amount: 0, locks: ['hands'], random: seededRandom(3), skeleton: skel });
    for (const q of Object.values(none)) expect(qangle(q, [0, 0, 0, 1])).toBeLessThan(1e-9);
  });

  it('draws a thumbnail', () => {
    const svg = poseThumbnailSvg(BUILTIN_POSES[0]!.pose);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(10);
  });
});
