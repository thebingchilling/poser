import type JoltType from 'jolt-physics';
import type { V3 } from './math';

type Jolt = typeof JoltType;

export const LAYER_STATIC = 0;
export const LAYER_MOVING = 1;

export interface PhysicsWorld {
  J: Jolt;
  jolt: InstanceType<Jolt['JoltInterface']>;
  system: InstanceType<Jolt['PhysicsSystem']>;
  step(dt: number, substeps?: number): void;
  addStaticBox(center: V3, halfExtents: V3): void;
  destroy(): void;
}

/** A Jolt world with gravity, two object layers, and a floor at y = 0. */
export function createWorld(J: Jolt): PhysicsWorld {
  const objectFilter = new J.ObjectLayerPairFilterTable(2);
  objectFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING);
  objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);
  const bpInterface = new J.BroadPhaseLayerInterfaceTable(2, 2);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(0));
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, new J.BroadPhaseLayer(1));
  const settings = new J.JoltSettings();
  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bpInterface, 2, objectFilter, 2);
  const jolt = new J.JoltInterface(settings);
  J.destroy(settings);
  const system = jolt.GetPhysicsSystem();
  system.SetGravity(new J.Vec3(0, -9.81, 0));
  const bodies = system.GetBodyInterface();

  const addStaticBox = (center: V3, half: V3) => {
    const s = new J.BodyCreationSettings(
      new J.BoxShape(new J.Vec3(half[0], half[1], half[2]), 0.01),
      new J.RVec3(center[0], center[1], center[2]),
      J.Quat.prototype.sIdentity(),
      J.EMotionType_Static,
      LAYER_STATIC,
    );
    s.mFriction = 0.8;
    bodies.CreateAndAddBody(s, J.EActivation_DontActivate);
    J.destroy(s);
  };
  addStaticBox([0, -0.5, 0], [20, 0.5, 20]);

  return {
    J,
    jolt,
    system,
    addStaticBox,
    step(dt, substeps = 2) {
      jolt.Step(dt, substeps);
    },
    destroy() {
      J.destroy(jolt);
    },
  };
}
