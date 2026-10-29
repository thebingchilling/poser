import { CANONICAL_BONES, getBone } from './bones';
import { QI, fromTo, qinv, qmul, qnorm, qpow, qrot, swingTwist, vadd, vlen, vnorm, vsub, type Q, type V3 } from './math';
import { FEMALE_PROPORTIONS, boneTail, restPose } from './proportions';
import type { RigMap } from './rigMaps';

/**
 * Retargeting between the canonical skeleton and any mapped source rig
 * (PLAN.md section 5). A canonical pose is a local rotation per canonical
 * bone, relative to the canonical T-pose (identity = T-pose). On a source rig
 * each mapped bone is first corrected so its rest direction matches the
 * canonical rest direction (an A-pose rig straightens to a T-pose), then the
 * canonical rotation is applied in world space. Unmapped bones in between
 * keep their rest local transform, and twist bones take the roll.
 */

export interface SourceBone {
  name: string;
  /** Index of the parent bone, or -1. */
  parent: number;
  /** Rest (bind) local transform. */
  position: V3;
  rotation: Q;
}

/** A pose: canonical bone → local rotation relative to the canonical T-pose. */
export type CanonicalPose = Record<string, Q>;

/** Canonical bone whose head marks the end of each canonical bone (for directions). */
const TAIL_CHILD: Record<string, string> = { hips: 'spine', spine: 'chest', chest: 'upperChest', upperChest: 'neck', neck: 'head' };
for (const s of ['left', 'right']) {
  Object.assign(TAIL_CHILD, {
    [s + 'Shoulder']: s + 'UpperArm',
    [s + 'UpperArm']: s + 'LowerArm',
    [s + 'LowerArm']: s + 'Hand',
    [s + 'Hand']: s + 'MiddleProximal',
    [s + 'UpperLeg']: s + 'LowerLeg',
    [s + 'LowerLeg']: s + 'Foot',
    [s + 'Foot']: s + 'Toes',
  });
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
    const segs = f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    TAIL_CHILD[s + f + segs[0]] = s + f + segs[1];
    TAIL_CHILD[s + f + segs[1]] = s + f + segs[2];
  }
}

const CANON_REST = restPose(FEMALE_PROPORTIONS);

/** Canonical rest direction of a bone, or null for bones without one (eyes, jaw, soft tissue, ends). */
function canonicalDirection(bone: string): V3 | null {
  if (!TAIL_CHILD[bone] && !/Distal$|Toes$|^head$/.test(bone)) return null;
  const head = CANON_REST[bone];
  if (!head) return null;
  return vnorm(vsub(boneTail(CANON_REST, bone), head));
}

export class Retargeter {
  readonly worldRest: { position: V3; rotation: Q }[];
  /** Per mapped canonical bone: source index, rest correction, twist handling. */
  private readonly mapped = new Map<string, { index: number; correction: Q; twist: { index: number; inChain: boolean; share: number }[] }>();
  private readonly byName: Map<string, number>;
  /** Mapped canonical bones in hierarchy order (parents first). */
  private readonly order: string[];

  constructor(readonly bones: SourceBone[], readonly map: RigMap) {
    this.byName = new Map(bones.map((b, i) => [b.name, i]));
    this.worldRest = [];
    bones.forEach((b, i) => {
      if (b.parent < 0) this.worldRest[i] = { position: b.position, rotation: b.rotation };
      else {
        const p = this.worldRest[b.parent]!;
        if (!p) throw new Error(`Bone ${b.name} comes before its parent`);
        this.worldRest[i] = { position: vadd(p.position, qrot(p.rotation, b.position)), rotation: qmul(p.rotation, b.rotation) };
      }
    });
    for (const def of CANONICAL_BONES) {
      const m = map[def.name];
      const index = m ? this.byName.get(m.bone) : undefined;
      if (m === undefined || index === undefined) continue;
      // Rest correction: rotate the source bone so it points the canonical way.
      let correction: Q = QI;
      const want = canonicalDirection(def.name);
      const tailIndex = this.tailIndex(def.name);
      if (want && tailIndex !== undefined) {
        const have = vsub(this.worldRest[tailIndex]!.position, this.worldRest[index]!.position);
        if (vlen(have) > 1e-6) correction = fromTo(have, want);
      }
      const nextIndex = tailIndex;
      const twist = (m.twist ?? [])
        .map((t) => this.byName.get(t))
        .filter((t): t is number => t !== undefined)
        .map((t, k, all) => ({
          index: t,
          // In-chain twist bones (Daz) sit between this bone and the next one.
          inChain: nextIndex !== undefined && this.isAncestor(t, nextIndex),
          share: (k + 1) / all.length,
        }));
      this.mapped.set(def.name, { index, correction, twist });
    }
    this.order = CANONICAL_BONES.map((b) => b.name).filter((n) => this.mapped.has(n));
  }

  /** Source index of the bone marking a canonical bone's end (first mapped descendant along the chain). */
  private tailIndex(bone: string): number | undefined {
    let next = TAIL_CHILD[bone];
    while (next) {
      const m = this.map[next];
      const i = m ? this.byName.get(m.bone) : undefined;
      if (i !== undefined) return i;
      next = TAIL_CHILD[next];
    }
    return undefined;
  }

  private isAncestor(a: number, b: number): boolean {
    for (let p = this.bones[b]!.parent; p >= 0; p = this.bones[p]!.parent) if (p === a) return true;
    return false;
  }

  /** World rotation of each canonical bone under a canonical pose. */
  private canonicalWorld(pose: CanonicalPose): Map<string, Q> {
    const out = new Map<string, Q>();
    for (const def of CANONICAL_BONES) {
      const parent = def.parent ? out.get(def.parent)! : QI;
      out.set(def.name, qmul(parent, pose[def.name] ?? QI));
    }
    return out;
  }

  /** Source bone local rotations (by bone index) for a canonical pose. Unlisted bones keep their rest rotation. */
  apply(pose: CanonicalPose): Q[] {
    const W = this.canonicalWorld(pose);
    const local = this.bones.map((b) => b.rotation);
    const world: Q[] = [];
    const worldOf = (i: number): Q => {
      if (world[i]) return world[i]!;
      const b = this.bones[i]!;
      world[i] = b.parent < 0 ? local[i]! : qmul(worldOf(b.parent), local[i]!);
      return world[i]!;
    };
    const invalidate = (from: number) => {
      // Children of a changed bone must recompute their world rotation.
      for (let i = 0; i < this.bones.length; i++) if (i === from || this.isAncestor(from, i)) delete world[i];
    };
    for (const name of this.order) {
      const m = this.mapped.get(name)!;
      const i = m.index;
      const parent = this.bones[i]!.parent;
      const target = qmul(qmul(W.get(name)!, m.correction), this.worldRest[i]!.rotation);
      const parentWorld = parent < 0 ? QI : worldOf(parent);
      const desired = qnorm(qmul(qinv(parentWorld), target));
      if (m.twist.length) {
        // Express the change from rest in the bone's own rest frame and split off the roll.
        const rest = this.bones[i]!.rotation;
        const r = qmul(qinv(rest), desired);
        const tail = this.tailIndex(name);
        const axisWorld = tail !== undefined ? vsub(this.worldRest[tail]!.position, this.worldRest[i]!.position) : ([0, 1, 0] as V3);
        const axis = vnorm(qrot(qinv(this.worldRest[i]!.rotation), axisWorld));
        const { swing, twist } = swingTwist(r, axis);
        const inChain = m.twist.some((t) => t.inChain);
        local[i] = qnorm(qmul(rest, inChain ? swing : r));
        for (const t of m.twist) {
          // In-chain twist bones carry the roll (shared out along the chain); side helpers
          // counter-rotate so the skin near the joint twists less.
          const part = t.inChain ? qpow(twist, 1 / m.twist.length) : qpow(qinv(twist), 1 - t.share);
          local[t.index] = qnorm(qmul(part, this.bones[t.index]!.rotation));
        }
      } else {
        local[i] = desired;
      }
      invalidate(i);
    }
    return local;
  }

  /** Reads a canonical pose back from source local rotations (for BVH, animation import). */
  extract(local: Q[]): CanonicalPose {
    const world: Q[] = [];
    this.bones.forEach((b, i) => (world[i] = b.parent < 0 ? local[i]! : qmul(world[b.parent]!, local[i]!)));
    const W = new Map<string, Q>();
    const pose: CanonicalPose = {};
    for (const def of CANONICAL_BONES) {
      const parentW = def.parent ? (W.get(def.parent) ?? QI) : QI;
      const m = this.mapped.get(def.name);
      if (!m) {
        W.set(def.name, parentW);
        continue;
      }
      // Bones carrying their roll in twist children: take the deepest in-chain twist bone's world rotation.
      let i = m.index;
      const chainTwists = m.twist.filter((t) => t.inChain);
      if (chainTwists.length) i = chainTwists[chainTwists.length - 1]!.index;
      const restW = qmul(m.correction, this.worldRest[i]!.rotation);
      const Wb = qnorm(qmul(world[i]!, qinv(restW)));
      W.set(def.name, Wb);
      pose[def.name] = qnorm(qmul(qinv(parentW), Wb));
    }
    return pose;
  }

  /** World head position of a canonical bone in the rest pose of this rig (metres, source units). */
  restHead(canonical: string): V3 | null {
    const m = this.mapped.get(canonical);
    return m ? this.worldRest[m.index]!.position : null;
  }

  get mappedBones(): string[] {
    return this.order;
  }
}

export { getBone };
