import { Euler, Quaternion, type Bone, type Mesh, type Object3D } from 'three/webgpu';

/**
 * Daz corrective morphs (JCMs) at pose time (PLAN.md, "Phase 1: import
 * anything"). The importer keeps them as `jcm:<id>` morph targets and stores
 * their formulas on the mesh: each reads bone rotations (in degrees, in the
 * bone's Daz frame and rotation order) and gives the morph's strength.
 */

interface Op {
  op: string;
  val?: number | number[];
  bone?: string;
  axis?: 'x' | 'y' | 'z';
}

interface Stored {
  bones: Record<string, { orientation: [number, number, number]; order: string }>;
  drivers: { morph: string; stage: 'sum' | 'mult'; ops: Op[] }[];
}

const D = Math.PI / 180;
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** Daz orientation (XYZ degrees, first axis applied first) as a quaternion. */
function orientation(o: [number, number, number]): Quaternion {
  // Daz "XYZ" (X first) is three.js order "ZYX".
  return new Quaternion().setFromEuler(new Euler(o[0] * D, o[1] * D, o[2] * D, 'ZYX'));
}

function evaluate(ops: Op[], angle: (bone: string, axis: 'x' | 'y' | 'z') => number): number | null {
  const stack: (number | number[])[] = [];
  const num = () => {
    const v = stack.pop();
    return typeof v === 'number' ? v : 0;
  };
  for (const o of ops) {
    if (o.op === 'push') {
      if (o.bone && o.axis) stack.push(angle(o.bone, o.axis));
      else if (o.val !== undefined) stack.push(o.val);
      else return null;
    } else if (o.op === 'mult' || o.op === 'add' || o.op === 'sub' || o.op === 'div') {
      const b = num();
      const a = num();
      stack.push(o.op === 'mult' ? a * b : o.op === 'add' ? a + b : o.op === 'sub' ? a - b : b === 0 ? 0 : a / b);
    } else if (o.op === 'spline_linear' || o.op === 'spline_tcb') {
      const count = num();
      const knots: [number, number][] = [];
      for (let k = 0; k < count; k++) {
        const kn = stack.pop();
        if (Array.isArray(kn)) knots.unshift([kn[0] ?? 0, kn[1] ?? 0]);
      }
      const x = num();
      let y = knots.length ? knots[0]![1] : 0;
      if (knots.length && x >= knots[knots.length - 1]![0]) y = knots[knots.length - 1]![1];
      else
        for (let i = 1; i < knots.length; i++)
          if (x <= knots[i]![0]) {
            const [x0, y0] = knots[i - 1]!;
            const [x1, y1] = knots[i]!;
            y = x <= x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
            break;
          }
      stack.push(y);
    } else return null;
  }
  return stack.length === 1 && typeof stack[0] === 'number' ? stack[0] : null;
}

/** Drives the corrective morphs of every mesh in a figure that has them. */
export class Correctives {
  private readonly entries: { mesh: Mesh; data: Stored }[] = [];
  private readonly bones = new Map<string, { bone: Bone; rest: Quaternion; frame: Quaternion; order: string }>();

  constructor(root: Object3D) {
    const byName = new Map<string, Bone>();
    root.traverse((o) => {
      if ((o as Bone).isBone) byName.set(o.name, o as Bone);
      const data = o.userData?.dazCorrectives as Stored | undefined;
      if (!data) return;
      // A multi-material mesh loads as a group of meshes carrying the data on the group.
      o.traverse((m) => {
        if ((m as Mesh).morphTargetDictionary) this.entries.push({ mesh: m as Mesh, data });
      });
    });
    for (const { data } of this.entries)
      for (const [name, f] of Object.entries(data.bones)) {
        const bone = byName.get(name);
        if (!bone || this.bones.has(name)) continue;
        // The model is stored in its bind pose, so the current rotation is the rest rotation.
        const order = [...f.order.toUpperCase()].reverse().join('');
        this.bones.set(name, { bone, rest: bone.quaternion.clone(), frame: orientation(f.orientation), order });
      }
  }

  get active(): boolean {
    return this.entries.length > 0;
  }

  /** Call after the bones have been posed. */
  update(): void {
    if (!this.entries.length) return;
    const cache = new Map<string, [number, number, number]>();
    const q = new Quaternion();
    const e = new Euler();
    const angle = (name: string, axis: 'x' | 'y' | 'z') => {
      let a = cache.get(name);
      if (!a) {
        const b = this.bones.get(name);
        if (!b) return 0;
        // Rotation from rest, seen in the bone's Daz frame: O⁻¹ · (rest⁻¹ · now) · O.
        q.copy(b.rest).invert().multiply(b.bone.quaternion);
        q.premultiply(b.frame.clone().invert()).multiply(b.frame);
        e.setFromQuaternion(q, b.order as Euler['order']);
        a = [e.x / D, e.y / D, e.z / D];
        cache.set(name, a);
      }
      return a[AXIS_INDEX[axis]];
    };
    for (const { mesh, data } of this.entries) {
      const sums = new Map<string, number>();
      const mults = new Map<string, number>();
      for (const d of data.drivers) {
        const v = evaluate(d.ops, angle);
        if (v === null) continue;
        if (d.stage === 'mult') mults.set(d.morph, (mults.get(d.morph) ?? 1) * v);
        else sums.set(d.morph, (sums.get(d.morph) ?? 0) + v);
      }
      const dict = mesh.morphTargetDictionary!;
      const infl = mesh.morphTargetInfluences!;
      for (const [name, i] of Object.entries(dict)) {
        if (!name.startsWith('jcm:')) continue;
        const id = name.slice(4);
        const v = (sums.get(id) ?? 0) * (mults.get(id) ?? 1);
        infl[i] = Math.max(0, Math.min(1, v));
      }
    }
  }
}
