import type { BodyProportions } from '@poser/rig';
import type JoltType from 'jolt-physics';
import { angleBetween, type V3 } from './math';
import { createRagdoll, type RagdollHandle, type RagdollOptions, type RagdollPose } from './ragdoll';
import { createWorld, type PhysicsWorld } from './world';

type Jolt = typeof JoltType;

/** Prototype 1 (PLAN.md section 23): a ragdoll settling onto a seat with motors holding a pose. */
export interface SeatScene {
  world: PhysicsWorld;
  ragdoll: RagdollHandle;
  seatTop: number;
}

export const SEAT = { center: [0, 0.21, 0.02] as V3, half: [0.26, 0.21, 0.28] as V3 };

export function createSeatScene(J: Jolt, proportions: BodyProportions, pose: RagdollPose, dropHeight = 0.03, options: RagdollOptions = {}): SeatScene {
  const world = createWorld(J);
  world.addStaticBox(SEAT.center, SEAT.half);
  const seatTop = SEAT.center[1] + SEAT.half[1];
  const ragdoll = createRagdoll(J, world, proportions, options);
  // Place the hips so the thighs start just above the seat. The hips joint
  // sits 5 cm above the hip joints in the canonical rig.
  const thighRadius = ragdoll.parts.find((p) => p.bone === 'leftUpperLeg')!.radius;
  const hipJointY = seatTop + thighRadius + dropHeight;
  ragdoll.setPose(pose, [0, hipJointY + 0.05, -0.12]);
  ragdoll.driveTo(pose);
  return { world, ragdoll, seatTop };
}

export interface SettleResult {
  /** Seconds until every body moved slower than the threshold, or null if it never settled. */
  settledAfter: number | null;
  /** Largest joint error from the target pose at the end, in degrees. */
  maxPoseErrorDeg: number;
  meanPoseErrorDeg: number;
  worstJoint: string;
  hipsY: number;
  msPerStep: number;
}

export function runSettle(scene: SeatScene, target: RagdollPose, seconds = 3, dt = 1 / 60): SettleResult {
  const { world, ragdoll } = scene;
  const J = world.J;
  const bi = world.system.GetBodyInterface();
  let settledAfter: number | null = null;
  let calm = 0;
  const t0 = performance.now();
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    world.step(dt, 2);
    let maxSpeed = 0;
    for (let b = 0; b < ragdoll.ragdoll.GetBodyCount(); b++) {
      const v = bi.GetLinearVelocity(ragdoll.ragdoll.GetBodyID(b));
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.GetX(), v.GetY(), v.GetZ()));
    }
    // Settled = slow for a quarter of a second.
    calm = maxSpeed < 0.05 ? calm + dt : 0;
    if (settledAfter === null && calm >= 0.25) settledAfter = (i + 1) * dt;
  }
  const msPerStep = (performance.now() - t0) / steps;
  const actual = ragdoll.localRotations();
  let max = 0;
  let sum = 0;
  let n = 0;
  let worstJoint = '';
  for (const part of ragdoll.parts) {
    if (part.parent === null) continue;
    const want = target[part.bone] ?? [0, 0, 0, 1];
    const err = (angleBetween(actual[part.bone]!, want) * 180) / Math.PI;
    sum += err;
    n++;
    if (err > max) {
      max = err;
      worstJoint = part.bone;
    }
  }
  void J;
  return { settledAfter, maxPoseErrorDeg: max, meanPoseErrorDeg: sum / n, worstJoint, hipsY: ragdoll.bodyTransforms()[0]!.position[1], msPerStep };
}
