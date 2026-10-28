import { XpbdSolver, type DistanceConstraint, type Particle, type V3 } from '@poser/xpbd';

/**
 * Prototype 6 (PLAN.md section 23): a soft toy following a soft-body channel
 * with stretch limits.
 *
 * The channel follows a guide curve (PLAN.md section 25: guide-curve
 * channels): rings of wall particles, collapsed when empty, each tethered to
 * its rest position (the surrounding tissue), with soft ring and axial
 * springs plus stiff stretch limits. The toy is a flexible chain of spheres
 * pushed in by a handle at its base; the walls guide its tip along the curve.
 */
export interface ChannelOptions {
  length?: number;
  /** Bend radius of the guide curve (m); the channel turns upward along it. */
  bendRadius?: number;
  restRadius?: number;
  /** Ring circumference can stretch to at most this multiple of rest. */
  maxStretch?: number;
  toyRadius?: number;
  toySegments?: number;
  /** Friction between toy and wall; lubrication lowers it (PLAN.md section 14.2). */
  friction?: number;
  /** Tissue softness: wall tether compliance (m/N). */
  softness?: number;
  substeps?: number;
  /** Toy bending compliance (m/N): higher = floppier. */
  toyBend?: number;
  /** How firmly the channel guides the toy along its curve (compliance, m/N). */
  guide?: number;
}

const TOY_LAYER = 1;
const WALL_LAYER = 2;

export class ChannelScene {
  readonly solver: XpbdSolver;
  readonly toyCount: number;
  readonly rings: number;
  readonly around: number;
  readonly wallRest: V3[] = [];
  readonly ringConstraints: { i: number; j: number; rest: number }[] = [];
  readonly toyRadius: number;
  readonly toySpacing: number;
  readonly length: number;
  readonly maxStretch: number;
  readonly restRadius: number;
  private readonly bend: number;
  private readonly guide: number;
  private readonly origin: V3 = [0, 0.5, 0];
  /** Current insertion depth of the toy base past the entrance (m). */
  depth = -0.02;

  constructor(device: GPUDevice, o: ChannelOptions = {}) {
    this.length = o.length ?? 0.14;
    this.bend = o.bendRadius ?? 0.25;
    this.restRadius = o.restRadius ?? 0.004;
    this.maxStretch = o.maxStretch ?? 4;
    this.toyRadius = o.toyRadius ?? 0.012;
    const segments = o.toySegments ?? 10;
    const friction = o.friction ?? 0.15;
    this.guide = o.guide ?? 5e-3;
    const particles: Particle[] = [];
    const constraints: DistanceConstraint[] = [];

    // Toy: a chain of spheres along -Z, base at index 0 (kinematic handle).
    this.toySpacing = this.toyRadius * 1.2;
    this.toyCount = segments;
    for (let k = 0; k < segments; k++) {
      particles.push({
        position: this.toyPoint(k),
        // The handle holds the two base spheres, which fixes the toy's direction.
        invMass: k < 2 ? 0 : 1 / 0.01,
        radius: this.toyRadius,
        friction,
        layer: TOY_LAYER,
        mask: WALL_LAYER, // no self-collision along the chain
      });
    }
    for (let k = 0; k + 1 < segments; k++) constraints.push({ i: k, j: k + 1, rest: this.toySpacing, compliance: 1e-7 });
    // Fairly stiff but able to bend along a curve: skip-one and skip-two links.
    for (let k = 0; k + 2 < segments; k++) constraints.push({ i: k, j: k + 2, rest: this.toySpacing * 2, compliance: o.toyBend ?? 2e-6 });
    for (let k = 0; k + 3 < segments; k++) constraints.push({ i: k, j: k + 3, rest: this.toySpacing * 3, compliance: (o.toyBend ?? 2e-6) * 5 });

    // Channel wall.
    this.around = 16;
    const ringSpacing = 0.006;
    this.rings = Math.round(this.length / ringSpacing) + 1;
    const wallRadius = Math.max(0.0018, (Math.PI * this.restRadius) / this.around * 1.1);
    const softness = o.softness ?? 4e-3;
    const wid = (r: number, a: number) => this.toyCount + r * this.around + ((a + this.around) % this.around);
    for (let r = 0; r < this.rings; r++) {
      const s = (r / (this.rings - 1)) * this.length;
      // The entrance flares a little, as anatomy does.
      const radius = this.restRadius * (1 + 1.5 * Math.exp(-s / 0.008));
      for (let a = 0; a < this.around; a++) {
        const p = this.channelPoint(s, (a / this.around) * Math.PI * 2, radius);
        this.wallRest.push(p);
        particles.push({ position: p, invMass: 1 / 0.002, radius: wallRadius, friction, layer: WALL_LAYER, mask: TOY_LAYER, tether: softness });
      }
    }
    const d = (i: number, j: number) => Math.hypot(...([0, 1, 2].map((k) => particles[i]!.position[k]! - particles[j]!.position[k]!) as V3));
    for (let r = 0; r < this.rings; r++) {
      for (let a = 0; a < this.around; a++) {
        const i = wid(r, a);
        const j = wid(r, a + 1);
        // Ring: stretches easily (it has to open a lot) up to a hard limit.
        constraints.push({ i, j, rest: d(i, j), compliance: 2e-2 });
        constraints.push({ i, j, rest: d(i, j) * this.maxStretch, kind: 'max' });
        this.ringConstraints.push({ i, j, rest: d(i, j) });
        if (r + 1 < this.rings) {
          const k = wid(r + 1, a);
          constraints.push({ i, j: k, rest: d(i, k), compliance: 1e-4 });
          constraints.push({ i, j: k, rest: d(i, k) * 1.5, kind: 'max' });
        }
      }
    }

    this.solver = new XpbdSolver(device, particles, constraints, {
      substeps: o.substeps ?? 20,
      damping: 4,
      gravity: [0, -9.81, 0],
      floor: null,
      relaxation: 1,
      contactCandidates: this.toyCount,
    });
  }

  /** Point on the guide curve at arc length s (beyond the ends it continues straight). */
  curve(s: number): { p: V3; t: V3 } {
    const o = this.origin;
    if (s <= 0) return { p: [o[0], o[1], o[2] - s], t: [0, 0, -1] };
    const sc = Math.min(s, this.length);
    const phi = sc / this.bend;
    const p: V3 = [o[0], o[1] + this.bend * (1 - Math.cos(phi)), o[2] - this.bend * Math.sin(phi)];
    const t: V3 = [0, Math.sin(phi), -Math.cos(phi)];
    const extra = s - sc;
    return { p: [p[0] + t[0] * extra, p[1] + t[1] * extra, p[2] + t[2] * extra], t };
  }

  channelPoint(s: number, angle: number, radius: number): V3 {
    const { p, t } = this.curve(s);
    const n1: V3 = [1, 0, 0];
    const n2: V3 = [t[1] * n1[2] - t[2] * n1[1], t[2] * n1[0] - t[0] * n1[2], t[0] * n1[1] - t[1] * n1[0]];
    return [0, 1, 2].map((k) => p[k]! + (Math.cos(angle) * n1[k]! + Math.sin(angle) * n2[k]!) * radius) as V3;
  }

  /** Starting position of toy sphere k: straight on the entrance line, tip just outside. */
  private toyPoint(k: number): V3 {
    // Sphere 0 is the base (handle), the last is the tip.
    const s = this.depth - (this.toyCount - 1 - k) * this.toySpacing;
    return this.curve(Math.min(s, 0)).p;
  }

  /** Moves the handle (toy base) to a depth along the entrance axis. */
  setDepth(depth: number): void {
    this.depth = depth;
    const baseS = depth - (this.toyCount - 1) * this.toySpacing;
    // The handle stays on the straight entrance line.
    const o = this.origin;
    this.solver.setTargets([0, 1], [[o[0], o[1], o[2] - baseS], [o[0], o[1], o[2] - baseS - this.toySpacing]]);
    // Guide curve (PLAN.md section 25): spheres inside the channel are pulled
    // softly toward the centre line at their depth, so the toy follows the
    // anatomy and opens the walls outward instead of ploughing into them.
    for (let k = 2; k < this.toyCount; k++) {
      const sk = baseS + k * this.toySpacing;
      const inside = sk > 0.004;
      this.solver.setTargets([k], [inside ? this.curve(sk).p : [0, 0, 0]], inside ? this.guide : -1);
    }
  }

  step(dt: number): void {
    this.solver.step(dt);
  }

  /** Largest ring stretch (circumference / rest). */
  maxRingStretch(p: Float32Array): number {
    let max = 0;
    for (const c of this.ringConstraints) {
      const d = Math.hypot(p[c.i * 4]! - p[c.j * 4]!, p[c.i * 4 + 1]! - p[c.j * 4 + 1]!, p[c.i * 4 + 2]! - p[c.j * 4 + 2]!);
      max = Math.max(max, d / c.rest);
    }
    return max;
  }

  /** Largest whole-ring stretch: circumference / rest circumference. */
  maxCircumferenceStretch(p: Float32Array): number {
    let max = 0;
    for (let r = 0; r < this.rings; r++) {
      let now = 0;
      let rest = 0;
      for (let a = 0; a < this.around; a++) {
        const c = this.ringConstraints[r * this.around + a]!;
        now += Math.hypot(p[c.i * 4]! - p[c.j * 4]!, p[c.i * 4 + 1]! - p[c.j * 4 + 1]!, p[c.i * 4 + 2]! - p[c.j * 4 + 2]!);
        rest += c.rest;
      }
      max = Math.max(max, now / rest);
    }
    return max;
  }

  /** Deepest overlap of a wall particle into the toy (m): pokes through if large. */
  wallPenetration(p: Float32Array): number {
    let worst = 0;
    for (let w = this.toyCount; w < p.length / 4; w++) {
      for (let k = 0; k < this.toyCount; k++) {
        const d = Math.hypot(p[w * 4]! - p[k * 4]!, p[w * 4 + 1]! - p[k * 4 + 1]!, p[w * 4 + 2]! - p[k * 4 + 2]!);
        worst = Math.max(worst, this.toyRadius - d);
      }
    }
    return worst;
  }

  /** Distance of the toy tip from the guide curve (m), and how far along it the tip is. */
  tipOffset(p: Float32Array): { offset: number; along: number } {
    const k = this.toyCount - 1;
    const tip: V3 = [p[k * 4]!, p[k * 4 + 1]!, p[k * 4 + 2]!];
    let best = Infinity;
    let along = 0;
    for (let s = -0.05; s <= this.length + 0.05; s += 0.001) {
      const c = this.curve(s).p;
      const d = Math.hypot(tip[0] - c[0], tip[1] - c[1], tip[2] - c[2]);
      if (d < best) {
        best = d;
        along = s;
      }
    }
    return { offset: best, along };
  }

  /** Mean wall radius from the guide curve, relative to rest (1 = closed). */
  meanOpening(p: Float32Array): number {
    let sum = 0;
    for (let r = 0; r < this.rings; r++) {
      const c = this.curve((r / (this.rings - 1)) * this.length).p;
      for (let a = 0; a < this.around; a++) {
        const i = this.toyCount + r * this.around + a;
        sum += Math.hypot(p[i * 4]! - c[0], p[i * 4 + 1]! - c[1], p[i * 4 + 2]! - c[2]);
      }
    }
    return sum / (this.rings * this.around) / this.restRadius;
  }

  destroy(): void {
    this.solver.destroy();
  }
}
