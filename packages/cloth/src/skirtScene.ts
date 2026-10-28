import { XpbdSolver, type Capsule, type V3 } from '@poser/xpbd';
import { buildSkirt, type SkirtMesh, type SkirtOptions } from './skirt';
import { WALKER_WAIST_Y, walkerCapsules, type WalkerOptions } from './walker';

/** Prototype 2 (PLAN.md section 23): an XPBD skirt on a walking capsule body. */
export class SkirtScene {
  readonly solver: XpbdSolver;
  readonly skirt: SkirtMesh;
  time = 0;
  capsules: Capsule[];

  constructor(device: GPUDevice, readonly options: { skirt?: SkirtOptions; walker?: WalkerOptions; substeps?: number } = {}) {
    this.skirt = buildSkirt([0, WALKER_WAIST_Y, 0], options.skirt);
    this.solver = new XpbdSolver(device, this.skirt.particles, this.skirt.constraints, {
      substeps: options.substeps ?? 20,
      damping: 0.8,
      floor: { y: 0, friction: 0.6 },
    });
    this.capsules = walkerCapsules(0, options.walker);
    // Cloth collides with a slightly fattened body so it never touches the surface.
    this.solver.setColliders(this.inflated());
  }

  private inflated(): Capsule[] {
    return this.capsules.map((c) => ({ ...c, radius: c.radius + 0.004 }));
  }

  step(dt: number): void {
    this.time += dt;
    this.capsules = walkerCapsules(this.time, this.options.walker);
    this.solver.setColliders(this.inflated());
    // Waistband follows the pelvis (which bobs while walking).
    // Pelvis capsule sits 5 cm above the (bobbing) hip joints; the waist 16 cm above them.
    const pelvisY = this.capsules[0]!.a[1] - 0.05 + (WALKER_WAIST_Y - 0.93) + 0.01;
    const targets: V3[] = this.skirt.waistOffsets.map((o) => [o[0], pelvisY, o[2]]);
    this.solver.setTargets(this.skirt.waistband, targets);
    this.solver.step(dt);
  }

  /**
   * How far cloth particles sit inside the (un-inflated) body, in metres:
   * the worst case and the share of particles inside at all.
   */
  static penetration(positions: Float32Array, capsules: Capsule[], particleRadius = 0.006): { max: number; fraction: number } {
    let max = 0;
    let inside = 0;
    const n = positions.length / 4;
    for (let i = 0; i < n; i++) {
      const p: V3 = [positions[i * 4]!, positions[i * 4 + 1]!, positions[i * 4 + 2]!];
      let worst = 0;
      for (const c of capsules) {
        const ab: V3 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
        const ap: V3 = [p[0] - c.a[0], p[1] - c.a[1], p[2] - c.a[2]];
        const t = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
        const d = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
        worst = Math.max(worst, c.radius + particleRadius - d);
      }
      if (worst > 0.002) inside++;
      max = Math.max(max, worst);
    }
    return { max, fraction: inside / n };
  }

  /** Largest stretch of a structural constraint (1 = rest length). */
  static maxStretch(positions: Float32Array, skirt: SkirtMesh): number {
    let max = 0;
    for (const c of skirt.constraints) {
      if ((c.compliance ?? 0) > 1e-6 || c.kind === 'max') continue;
      const d = Math.hypot(
        positions[c.i * 4]! - positions[c.j * 4]!,
        positions[c.i * 4 + 1]! - positions[c.j * 4 + 1]!,
        positions[c.i * 4 + 2]! - positions[c.j * 4 + 2]!,
      );
      max = Math.max(max, d / c.rest);
    }
    return max;
  }

  destroy(): void {
    this.solver.destroy();
  }
}
