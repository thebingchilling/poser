import { FEMALE_PROPORTIONS, MALE_PROPORTIONS } from '@poser/rig';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadJolt } from './jolt';
import { axisAngle } from './math';
import { SITTING_POSE } from './poses';
import { createSeatScene, runSettle } from './settle';

let J: Awaited<ReturnType<typeof loadJolt>>;
beforeAll(async () => {
  J = await loadJolt();
});

describe('prototype 1: ragdoll Settle onto a seat', () => {
  it.each([
    ['female', FEMALE_PROPORTIONS],
    ['male', MALE_PROPORTIONS],
  ])('%s figure sits, holds the pose with motors, and settles within 3 s', (name, proportions) => {
    const scene = createSeatScene(J, proportions, SITTING_POSE);
    const r = runSettle(scene, SITTING_POSE, 4);
    process.stderr.write(`${name} ${JSON.stringify(r)}\n`);
    expect(r.settledAfter, 'never settled').not.toBeNull();
    expect(r.settledAfter!).toBeLessThanOrEqual(3);
    expect(r.maxPoseErrorDeg).toBeLessThan(20);
    // Resting on the seat: hips above the seat top, not sunk into it or slid off.
    expect(r.hipsY).toBeGreaterThan(scene.seatTop);
    expect(r.hipsY).toBeLessThan(scene.seatTop + 0.25);
    scene.world.destroy();
  });

  it('slumps without motors, so the motors are what hold the pose', () => {
    const scene = createSeatScene(J, FEMALE_PROPORTIONS, SITTING_POSE);
    scene.ragdoll.setMotorsEnabled(false);
    const r = runSettle(scene, SITTING_POSE, 3);
    process.stderr.write(`limp ${JSON.stringify(r)}\n`);
    expect(r.maxPoseErrorDeg).toBeGreaterThan(25);
    scene.world.destroy();
  });

  it('stays stable when dropped from 40 cm', () => {
    const scene = createSeatScene(J, FEMALE_PROPORTIONS, SITTING_POSE, 0.4);
    const r = runSettle(scene, SITTING_POSE, 4);
    process.stderr.write(`drop ${JSON.stringify(r)}\n`);
    expect(r.settledAfter).not.toBeNull();
    expect(r.maxPoseErrorDeg).toBeLessThan(10);
    expect(r.hipsY).toBeGreaterThan(scene.seatTop);
    expect(r.hipsY).toBeLessThan(scene.seatTop + 0.25);
    scene.world.destroy();
  });

  it('joint limits refuse a knee bent backwards', () => {
    // Ask for 60 degrees of knee hyperextension; the limit allows none.
    const bad = { ...SITTING_POSE, leftLowerLeg: axisAngle([1, 0, 0], -Math.PI / 3) };
    const scene = createSeatScene(J, FEMALE_PROPORTIONS, SITTING_POSE);
    scene.ragdoll.driveTo(bad);
    runSettle(scene, bad, 2);
    const knee = scene.ragdoll.localRotations().leftLowerLeg!;
    // Signed bend about X: positive is normal flexion.
    const bendDeg = ((2 * Math.atan2(knee[0], knee[3])) * 180) / Math.PI;
    process.stderr.write(`knee bend ${bendDeg.toFixed(1)} deg\n`);
    expect(bendDeg).toBeGreaterThan(-3);
    scene.world.destroy();
  });
});
