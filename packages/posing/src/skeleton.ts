import { CANONICAL_BONES, QI, qinv, qmul, qrot, vadd, vsub, type CanonicalPose, type Q, type V3 } from '@poser/rig';

/**
 * A figure's canonical skeleton (PLAN.md section 6): the canonical bones at
 * this figure's own joint positions in its corrected T-pose. Canonical bones
 * have identity rest orientations, so forward kinematics is simple and every
 * posing tool (IK, pins, limits, mirror) works in this one space for any
 * figure, built-in or imported.
 */
export class PoseSkeleton {
  /** Canonical bones present on this figure, parents first. */
  readonly bones: string[];
  private readonly parent = new Map<string, string | null>();

  constructor(readonly rest: Record<string, V3>) {
    this.bones = CANONICAL_BONES.map((b) => b.name).filter((n) => rest[n]);
    for (const b of CANONICAL_BONES) {
      if (!rest[b.name]) continue;
      // Nearest present ancestor (a rig may lack e.g. upperChest).
      let p = b.parent;
      while (p && !rest[p]) p = CANONICAL_BONES.find((x) => x.name === p)!.parent;
      this.parent.set(b.name, p);
    }
  }

  parentOf(bone: string): string | null {
    return this.parent.get(bone) ?? null;
  }

  /**
   * World rotation of every canonical bone (including missing ones, which
   * pass their parent's rotation through) under a pose.
   */
  worldRotations(pose: CanonicalPose): Map<string, Q> {
    const out = new Map<string, Q>();
    for (const b of CANONICAL_BONES) {
      const parent = b.parent ? out.get(b.parent)! : QI;
      out.set(b.name, qmul(parent, pose[b.name] ?? QI));
    }
    return out;
  }

  /** World joint positions under a pose (figure space, before the figure's own transform). */
  positions(pose: CanonicalPose): Map<string, V3> {
    const W = this.worldRotations(pose);
    const out = new Map<string, V3>();
    for (const b of this.bones) {
      const p = this.parent.get(b);
      if (!p) {
        out.set(b, this.rest[b]!);
        continue;
      }
      // The parent's world rotation as seen from the canonical hierarchy: the
      // rotation of the canonical bone directly above this one.
      const canonParent = CANONICAL_BONES.find((x) => x.name === b)!.parent!;
      out.set(b, vadd(out.get(p)!, qrot(W.get(canonParent)!, vsub(this.rest[b]!, this.rest[p]!))));
    }
    return out;
  }

  /** Local rotation that gives `bone` the world rotation `world`, given the rest of the pose. */
  localFor(pose: CanonicalPose, bone: string, world: Q): Q {
    const canonParent = CANONICAL_BONES.find((x) => x.name === bone)!.parent;
    const parentWorld = canonParent ? this.worldRotations(pose).get(canonParent)! : QI;
    return qmul(qinv(parentWorld), world);
  }
}
