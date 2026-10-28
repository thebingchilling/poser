import { boneTail, restPose, type BodyProportions } from '@poser/rig';
import type JoltType from 'jolt-physics';
import { axisAngle, length, normalize, rotate, scale, sub, type Q, type V3 } from './math';
import { LAYER_MOVING, type PhysicsWorld } from './world';

type Jolt = typeof JoltType;

/**
 * Automatic ragdoll from the canonical rig (PLAN.md section 7.2). One capsule
 * body per major bone; small bones (fingers, toes, shoulders, neck) ride on
 * their parent body. Joints are swing-twist constraints with anatomical
 * limits and motors that drive toward a target pose ("muscle motors").
 *
 * Joint limits are given around a hinge axis A (world space, rest pose):
 * the joint's main bending range is [centre - range, centre + range] about A,
 * `side` is the allowed bend about the other swing axis, and `twist` the roll
 * about the bone.
 */
export interface JointLimits {
  axis: V3;
  centre: number;
  range: number;
  side: number;
  twist: number;
}

export interface PartDef {
  bone: string;
  parent: string | null;
  /** Bone the capsule runs to (defaults to the bone's tail). */
  to?: string;
  radius: number;
  limits?: JointLimits;
  /** Motor torque limit (N·m). */
  strength: number;
}

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

/** Ragdoll layout. Positive rotations about X bend knees; negative bend hips forward. */
export function ragdollParts(p: BodyProportions): PartDef[] {
  const k = p.height / 1.68;
  const parts: PartDef[] = [
    { bone: 'hips', parent: null, to: 'spine', radius: 0.13 * k, strength: 0 },
    { bone: 'spine', parent: 'hips', to: 'chest', radius: 0.12 * k, limits: { axis: X, centre: 0, range: 0.4, side: 0.3, twist: 0.3 }, strength: 400 },
    { bone: 'chest', parent: 'spine', to: 'upperChest', radius: 0.125 * k, limits: { axis: X, centre: 0, range: 0.3, side: 0.25, twist: 0.3 }, strength: 400 },
    { bone: 'upperChest', parent: 'chest', to: 'neck', radius: 0.13 * k, limits: { axis: X, centre: 0, range: 0.25, side: 0.2, twist: 0.25 }, strength: 400 },
    { bone: 'head', parent: 'upperChest', radius: 0.085 * k, limits: { axis: X, centre: 0, range: 0.7, side: 0.5, twist: 0.9 }, strength: 60 },
  ];
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left' ? 1 : -1;
    const n = (b: string) => side + b;
    parts.push(
      // Arms point along ±X in the T-pose. Lowering an arm is rotation about Z.
      { bone: n('UpperArm'), parent: 'upperChest', radius: 0.04 * k, limits: { axis: Z, centre: -0.7 * s, range: 1.5, side: 1.4, twist: 1.2 }, strength: 120 },
      { bone: n('LowerArm'), parent: n('UpperArm'), radius: 0.033 * k, limits: { axis: Y, centre: -1.25 * s, range: 1.25, side: 0.05, twist: 1.3 }, strength: 80 },
      { bone: n('Hand'), parent: n('LowerArm'), to: n('MiddleProximal'), radius: 0.03 * k, limits: { axis: Z, centre: 0, range: 0.9, side: 0.35, twist: 0.2 }, strength: 20 },
      { bone: n('UpperLeg'), parent: 'hips', radius: 0.075 * k, limits: { axis: X, centre: -0.6, range: 1.45, side: 0.6, twist: 0.6 }, strength: 500 },
      { bone: n('LowerLeg'), parent: n('UpperLeg'), radius: 0.05 * k, limits: { axis: X, centre: 1.2, range: 1.2, side: 0.05, twist: 0.15 }, strength: 400 },
      { bone: n('Foot'), parent: n('LowerLeg'), to: n('Toes'), radius: 0.035 * k, limits: { axis: X, centre: 0, range: 0.6, side: 0.3, twist: 0.2 }, strength: 150 },
    );
  }
  return parts;
}

/** A pose for the ragdoll: canonical bone → local rotation (relative to the rest pose). */
export type RagdollPose = Record<string, Q>;

export interface RagdollHandle {
  ragdoll: InstanceType<Jolt['Ragdoll']>;
  parts: PartDef[];
  /** Rest-pose world position of each part's joint. */
  restHeads: V3[];
  /** Each body's capsule in the body's own frame: from the joint along `direction`. */
  capsules: { direction: V3; length: number; radius: number }[];
  skeleton: InstanceType<Jolt['Skeleton']>;
  setMotorsEnabled(enabled: boolean): void;
  /** Teleport to a pose with the hips at `rootPosition`. */
  setPose(pose: RagdollPose, rootPosition: V3): void;
  /** Make the motors pull toward a pose. */
  driveTo(pose: RagdollPose): void;
  /** Current local rotation of each part relative to its parent, keyed by bone. */
  localRotations(): RagdollPose;
  /** World transforms of each part's body (for rendering). */
  bodyTransforms(): { position: V3; rotation: Q }[];
  totalMass: number;
  destroy(): void;
}

const DENSITY = 985; // kg/m³, close to human tissue.
/** Motor spring stiffness and damping per N·m of joint strength. */
const MOTOR_STIFFNESS_PER_NM = 12;
const MOTOR_DAMPING_PER_NM = 0.6;

export interface RagdollOptions {
  /** Multiplies every joint's motor strength (1 = default muscle tone). */
  strengthScale?: number;
  groupId?: number;
}

export function createRagdoll(J: Jolt, world: PhysicsWorld, proportions: BodyProportions, options: RagdollOptions = {}): RagdollHandle {
  const { strengthScale = 1, groupId = 1 } = options;
  const pose = restPose(proportions);
  const parts = ragdollParts(proportions);
  const index = new Map(parts.map((p, i) => [p.bone, i]));

  const settings = new J.RagdollSettings();
  const skeleton = new J.Skeleton();
  for (const part of parts) {
    skeleton.AddJoint(new J.JPHString(part.bone, part.bone.length), part.parent === null ? -1 : index.get(part.parent)!);
  }
  settings.mSkeleton = skeleton;
  settings.mParts.resize(parts.length);

  const restHeads: V3[] = [];
  const capsules: RagdollHandle['capsules'] = [];
  let totalMass = 0;
  parts.forEach((part, i) => {
    const head = pose[part.bone]!;
    const tail: V3 = part.to ? pose[part.to]! : boneTail(pose, part.bone);
    restHeads.push(head);
    const dir = sub(tail, head);
    const len = length(dir);
    capsules.push({ direction: normalize(dir), length: len, radius: part.radius });
    const halfHeight = Math.max(0.005, len / 2 - part.radius * 0.5);
    // Capsule along Y, rotated onto the bone and centred on its midpoint, in the body's frame
    // (the body's origin is the joint, with identity rotation in the rest pose).
    const capsule = new J.CapsuleShapeSettings(halfHeight, part.radius);
    capsule.mDensity = DENSITY;
    const q = fromToQuat(J, [0, 1, 0], normalize(dir));
    const mid = scale(dir, 0.5);
    const shape = new J.RotatedTranslatedShapeSettings(new J.Vec3(mid[0], mid[1], mid[2]), q, capsule);

    const rp = settings.mParts.at(i);
    rp.SetShapeSettings(shape);
    rp.mPosition = new J.RVec3(head[0], head[1], head[2]);
    rp.mRotation = J.Quat.prototype.sIdentity();
    rp.mMotionType = J.EMotionType_Dynamic;
    rp.mObjectLayer = LAYER_MOVING;
    rp.mFriction = 0.8;
    rp.mRestitution = 0;
    rp.mLinearDamping = 0.05;
    rp.mAngularDamping = 0.6;
    totalMass += Math.PI * part.radius ** 2 * (2 * halfHeight + (4 / 3) * part.radius) * DENSITY;

    if (part.parent !== null && part.limits) {
      const l = part.limits;
      const boneDir = normalize(dir);
      const c = new J.SwingTwistConstraintSettings();
      c.mSpace = J.EConstraintSpace_WorldSpace;
      c.mPosition1 = c.mPosition2 = new J.RVec3(head[0], head[1], head[2]);
      // The parent's frame is pre-rotated to the centre of the range, so the
      // symmetric swing cone covers an asymmetric anatomical range.
      const t1 = rotate(axisAngle(l.axis, l.centre), boneDir);
      c.mTwistAxis1 = new J.Vec3(...t1);
      c.mTwistAxis2 = new J.Vec3(...boneDir);
      c.mPlaneAxis1 = new J.Vec3(...l.axis);
      c.mPlaneAxis2 = new J.Vec3(...l.axis);
      // Jolt limits rotation *about* the plane axis with the normal half-cone
      // angle, and rotation about the normal with the plane half-cone angle.
      c.mNormalHalfConeAngle = l.range;
      c.mPlaneHalfConeAngle = l.side;
      c.mTwistMinAngle = -l.twist;
      c.mTwistMaxAngle = l.twist;
      c.mMaxFrictionTorque = part.strength * 0.02;
      for (const m of [c.mSwingMotorSettings, c.mTwistMotorSettings]) {
        // Explicit stiffness (N·m/rad). Jolt's frequency mode scales by the
        // two bodies at the joint only, which is far too soft for a joint
        // carrying a whole chain (the hip holds up the entire torso).
        m.mSpringSettings.mMode = J.ESpringMode_StiffnessAndDamping;
        const strength = part.strength * strengthScale;
        m.mSpringSettings.mStiffness = strength * MOTOR_STIFFNESS_PER_NM;
        m.mSpringSettings.mDamping = strength * MOTOR_DAMPING_PER_NM;
        m.mMinTorqueLimit = -strength;
        m.mMaxTorqueLimit = strength;
      }
      rp.mToParent = c;
    }
  });

  settings.Stabilize();
  settings.DisableParentChildCollisions();
  // Also stop collisions between non-adjacent parts that already overlap at
  // rest (e.g. the waist and the tops of the thighs), or they shove each
  // other apart as soon as a pose brings them together.
  const filter = J.castObject(settings.mParts.at(0).mCollisionGroup.GetGroupFilter(), J.GroupFilterTable);
  const segments = parts.map((part, i) => {
    const head = restHeads[i]!;
    return { a: head, b: part.to ? pose[part.to]! : boneTail(pose, part.bone), r: part.radius };
  });
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const si = segments[i]!;
      const sj = segments[j]!;
      if (segmentDistance(si.a, si.b, sj.a, sj.b) < si.r + sj.r + 0.01) filter.DisableCollision(i, j);
    }
  }
  settings.CalculateBodyIndexToConstraintIndex();
  const ragdoll = settings.CreateRagdoll(groupId, 0, world.system);
  ragdoll.AddToPhysicsSystem(J.EActivation_Activate);

  const skPose = new J.SkeletonPose();
  skPose.SetSkeleton(skeleton);

  const applyPose = (p: RagdollPose, root?: V3) => {
    if (root) skPose.SetRootOffset(new J.RVec3(root[0], root[1], root[2]));
    parts.forEach((part, i) => {
      const joint = skPose.GetJoint(i);
      const parentHead: V3 = part.parent === null ? (root ? [0, 0, 0] : [0, 0, 0]) : restHeads[index.get(part.parent)!]!;
      const t = part.parent === null ? ([0, 0, 0] as V3) : sub(restHeads[i]!, parentHead);
      joint.mTranslation = new J.Vec3(t[0], t[1], t[2]);
      const q = p[part.bone] ?? [0, 0, 0, 1];
      joint.mRotation = new J.Quat(q[0], q[1], q[2], q[3]);
    });
    skPose.CalculateJointMatrices();
  };

  const constraints = () => {
    const out: InstanceType<Jolt['SwingTwistConstraint']>[] = [];
    for (let i = 0; i < ragdoll.GetConstraintCount(); i++) out.push(J.castObject(ragdoll.GetConstraint(i), J.SwingTwistConstraint));
    return out;
  };

  return {
    ragdoll,
    parts,
    restHeads,
    capsules,
    skeleton,
    totalMass,
    setMotorsEnabled(enabled) {
      for (const c of constraints()) {
        c.SetSwingMotorState(enabled ? J.EMotorState_Position : J.EMotorState_Off);
        c.SetTwistMotorState(enabled ? J.EMotorState_Position : J.EMotorState_Off);
      }
    },
    setPose(p, rootPosition) {
      applyPose(p, rootPosition);
      ragdoll.SetPose(skPose);
      ragdoll.SetLinearAndAngularVelocity(new J.Vec3(0, 0, 0), new J.Vec3(0, 0, 0));
    },
    driveTo(p) {
      applyPose(p);
      ragdoll.DriveToPoseUsingMotors(skPose);
    },
    localRotations() {
      const world = this.bodyTransforms();
      const out: RagdollPose = {};
      parts.forEach((part, i) => {
        const r = world[i]!.rotation;
        const parent = part.parent === null ? null : world[index.get(part.parent)!]!.rotation;
        out[part.bone] = parent ? qmulConj(parent, r) : r;
      });
      return out;
    },
    bodyTransforms() {
      const bi = world.system.GetBodyInterface();
      const out: { position: V3; rotation: Q }[] = [];
      for (let i = 0; i < ragdoll.GetBodyCount(); i++) {
        const id = ragdoll.GetBodyID(i);
        const p = bi.GetPosition(id);
        const r = bi.GetRotation(id);
        out.push({ position: [p.GetX(), p.GetY(), p.GetZ()], rotation: [r.GetX(), r.GetY(), r.GetZ(), r.GetW()] });
      }
      return out;
    },
    destroy() {
      ragdoll.RemoveFromPhysicsSystem();
      J.destroy(ragdoll);
      J.destroy(skPose);
    },
  };
}

/** conj(a) * b: b expressed in a's frame. */
function qmulConj(a: Q, b: Q): Q {
  const [ax, ay, az, aw] = [-a[0], -a[1], -a[2], a[3]];
  return [
    aw * b[0] + ax * b[3] + ay * b[2] - az * b[1],
    aw * b[1] - ax * b[2] + ay * b[3] + az * b[0],
    aw * b[2] + ax * b[1] - ay * b[0] + az * b[3],
    aw * b[3] - ax * b[0] - ay * b[1] - az * b[2],
  ];
}

function fromToQuat(J: Jolt, a: V3, b: V3) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) return J.Quat.prototype.sRotation(new J.Vec3(1, 0, 0), Math.PI);
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const n = Math.hypot(c[0], c[1], c[2], w);
  return new J.Quat(c[0] / n, c[1] / n, c[2] / n, w / n);
}

/** Closest distance between segments p1-q1 and p2-q2. */
export function segmentDistance(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2;
  const e = d2[0] ** 2 + d2[1] ** 2 + d2[2] ** 2;
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  let s = 0;
  let t = 0;
  if (a < 1e-12 && e < 1e-12) return length(r);
  if (a < 1e-12) t = clamp(f / e);
  else {
    const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
    if (e < 1e-12) s = clamp(-c / a);
    else {
      const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  const c1: V3 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2: V3 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return length(sub(c1, c2));
}
