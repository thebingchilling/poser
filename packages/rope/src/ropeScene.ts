import { XpbdSolver, type DistanceConstraint, type Particle, type V3 } from '@poser/xpbd';

/**
 * Prototype 5 (PLAN.md section 23): a rope wrapped around a limb, held by
 * friction and pressing into a soft flesh layer.
 *
 * The limb: a rigid deep-tissue core (capsule) under a flesh shell of
 * particles, each softly tethered to its rest position (compliance sets how
 * soft the flesh is). The rope: a particle chain (stretch and bend
 * constraints, stiff stretch limit) coiled around the limb with weighted
 * tails hanging down.
 */
export interface RopeSceneOptions {
  /** Limb tilt from horizontal (radians); the limb runs along X before tilting. */
  tilt?: number;
  ropeFriction?: number;
  /** Flesh softness: tether compliance (m/N). Higher = softer. */
  fleshSoftness?: number;
  turns?: number;
  /** Load on each hanging end (kg). */
  load?: number;
  substeps?: number;
  /** Flesh bead radius relative to spacing (higher = smoother surface). */
  fleshOverlap?: number;
  /** How easily flesh slides sideways over the deep tissue (compliance, m/N). */
  fleshShear?: number;
  /** Leave out the flesh layer (rope directly on the firm core). */
  noFlesh?: boolean;
}

// The core (bone and firm muscle) sits about 10 mm below the flesh particles, the soft layer's travel.
export const LIMB = { length: 0.4, skinRadius: 0.045, coreRadius: 0.025, centre: [0, 0.6, 0] as V3 };
const ROPE_RADIUS = 0.004;
// Beads sit slightly farther apart than their diameter, so neighbours along the chain
// never count as self-collisions (which would fight the length constraint).
const SPACING = 0.0085;
const ROPE_LAYER = 2;
const FLESH_LAYER = 1;

export class RopeScene {
  readonly solver: XpbdSolver;
  readonly ropeCount: number;
  readonly fleshCount: number;
  readonly fleshRest: V3[] = [];
  readonly axis: V3;
  readonly coils: number[] = [];
  readonly fleshRings: number;
  readonly fleshAround: number;

  constructor(device: GPUDevice, o: RopeSceneOptions = {}) {
    const tilt = o.tilt ?? 0;
    const turns = o.turns ?? 3;
    this.axis = [Math.cos(tilt), Math.sin(tilt), 0];
    const c = LIMB.centre;
    // Limb frame: axis (along), up (perpendicular, mostly +Y), and z.
    const up: V3 = [-Math.sin(tilt), Math.cos(tilt), 0];
    const z: V3 = [0, 0, 1];
    const at = (along: number, angle: number, radius: number): V3 =>
      [0, 1, 2].map((k) => c[k]! + this.axis[k]! * along + (Math.cos(angle) * up[k]! + Math.sin(angle) * z[k]!) * radius) as V3;

    const particles: Particle[] = [];
    const constraints: DistanceConstraint[] = [];
    const mu = o.ropeFriction ?? 0.8;
    const ropeInvMass = 1 / 0.004; // 4 g per segment
    // Rope: left tail (hanging), helix, right tail. Built as one chain.
    const ringR = (o.noFlesh ? LIMB.coreRadius : LIMB.skinRadius) + ROPE_RADIUS + 0.0015;
    const pitch = ROPE_RADIUS * 2.6;
    const helixLen = Math.hypot(2 * Math.PI * ringR, pitch) * turns;
    const helixN = Math.round(helixLen / SPACING);
    const tailN = 30;
    const start = -(pitch * turns) / 2;
    const helixPoint = (k: number) => {
      const s = k / helixN;
      return at(start + pitch * turns * s, Math.PI / 2 + 2 * Math.PI * turns * s, ringR);
    };
    const first = helixPoint(0);
    const last = helixPoint(helixN);
    const chain: V3[] = [];
    for (let k = tailN; k > 0; k--) chain.push([first[0], first[1] - k * SPACING, first[2]]);
    for (let k = 0; k <= helixN; k++) {
      chain.push(helixPoint(k));
      this.coils.push(chain.length - 1);
    }
    for (let k = 1; k <= tailN; k++) chain.push([last[0], last[1] - k * SPACING, last[2]]);
    const load = o.load ?? 1;
    chain.forEach((p, i) => {
      const end = i === 0 || i === chain.length - 1;
      particles.push({ position: p, invMass: end ? 1 / load : ropeInvMass, radius: ROPE_RADIUS, friction: mu, layer: ROPE_LAYER, mask: ROPE_LAYER | FLESH_LAYER });
    });
    this.ropeCount = particles.length;
    for (let i = 0; i + 1 < chain.length; i++) {
      constraints.push({ i, j: i + 1, rest: SPACING, compliance: 1e-8 });
      if (i + 2 < chain.length) constraints.push({ i, j: i + 2, rest: SPACING * 2 * 0.98, compliance: 2e-3 });
    }
    // Long-range stretch limits at several scales: a heavy load on a chain of
    // light segments otherwise stretches it (tension travels one link per
    // pass). A chord is never longer than the rope between its ends, so these
    // never fight bending, only stretching.
    for (const k of [1, 2, 4, 8, 16, 32]) {
      for (let i = 0; i + k < chain.length; i++) constraints.push({ i, j: i + k, rest: SPACING * k * 1.01, kind: 'max' });
    }

    // Flesh shell over the wrapped band, tethered to rest (the body holds it).
    this.fleshAround = 32;
    const spacingAround = (2 * Math.PI * LIMB.skinRadius) / this.fleshAround;
    this.fleshRings = o.noFlesh ? 0 : Math.round((pitch * turns + 0.08) / spacingAround) + 1;
    const fleshRadius = spacingAround * (o.fleshOverlap ?? 0.55);
    const softness = o.fleshSoftness ?? 1.5e-3;
    const fleshStart = -((this.fleshRings - 1) * spacingAround) / 2;
    for (let r = 0; r < this.fleshRings; r++) {
      for (let a = 0; a < this.fleshAround; a++) {
        const p = at(fleshStart + r * spacingAround, (a / this.fleshAround) * Math.PI * 2, LIMB.skinRadius - fleshRadius);
        this.fleshRest.push(p);
        particles.push({ position: p, invMass: 1 / 0.003, radius: fleshRadius, friction: mu, layer: FLESH_LAYER, mask: ROPE_LAYER, tether: softness });
      }
    }
    this.fleshCount = particles.length - this.ropeCount;
    // Soft tissue compresses easily but hardly slides over what's beneath it.
    // Each flesh bead gets four fixed anchors 5 cm away along and around the
    // limb, joined by stiff links: sliding sideways stretches them, pressing
    // straight in barely changes their length.
    const anchorDist = 0.05;
    for (let k = 0; k < this.fleshCount; k++) {
      const i = this.ropeCount + k;
      const p = this.fleshRest[k]!;
      const d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      const along = d[0] * this.axis[0] + d[1] * this.axis[1] + d[2] * this.axis[2];
      const radial: V3 = [d[0] - this.axis[0] * along, d[1] - this.axis[1] * along, d[2] - this.axis[2] * along];
      const rl = Math.hypot(...radial);
      const n: V3 = [radial[0] / rl, radial[1] / rl, radial[2] / rl];
      const around: V3 = [this.axis[1] * n[2] - this.axis[2] * n[1], this.axis[2] * n[0] - this.axis[0] * n[2], this.axis[0] * n[1] - this.axis[1] * n[0]];
      for (const dir of [this.axis, around]) {
        for (const sign of [1, -1]) {
          const anchor: V3 = [p[0] + dir[0] * anchorDist * sign, p[1] + dir[1] * anchorDist * sign, p[2] + dir[2] * anchorDist * sign];
          particles.push({ position: anchor, invMass: 0, radius: 0.001, layer: 0, mask: 0 });
          constraints.push({ i, j: particles.length - 1, rest: anchorDist, compliance: o.fleshShear ?? 2e-6 });
        }
      }
    }
    const fid = (r: number, a: number) => this.ropeCount + r * this.fleshAround + ((a + this.fleshAround) % this.fleshAround);
    const dist = (i: number, j: number) => Math.hypot(...([0, 1, 2].map((k) => particles[i]!.position[k]! - particles[j]!.position[k]!) as V3));
    for (let r = 0; r < this.fleshRings; r++) {
      for (let a = 0; a < this.fleshAround; a++) {
        // Skin stretch between neighbours keeps the dent smooth.
        constraints.push({ i: fid(r, a), j: fid(r, a + 1), rest: dist(fid(r, a), fid(r, a + 1)), compliance: 1e-4 });
        if (r + 1 < this.fleshRings) constraints.push({ i: fid(r, a), j: fid(r + 1, a), rest: dist(fid(r, a), fid(r + 1, a)), compliance: 1e-4 });
      }
    }

    this.solver = new XpbdSolver(device, particles, constraints, {
      substeps: o.substeps ?? 20,
      damping: 2,
      floor: { y: 0, friction: 0.6 },
      relaxation: 1,
      contactCandidates: this.ropeCount,
    });
    // The rigid core under the flesh, slightly longer than the band.
    const half = LIMB.length / 2;
    this.solver.setColliders([{ a: at(-half, 0, 0), b: at(half, 0, 0), radius: LIMB.coreRadius, friction: mu }]);
  }

  step(dt: number): void {
    this.solver.step(dt);
  }

  /** Mean position of the coils along the limb axis (m). */
  coilCentre(positions: Float32Array): number {
    let s = 0;
    for (const i of this.coils) {
      const p = [positions[i * 4]! - LIMB.centre[0], positions[i * 4 + 1]! - LIMB.centre[1], positions[i * 4 + 2]! - LIMB.centre[2]];
      s += p[0]! * this.axis[0] + p[1]! * this.axis[1] + p[2]! * this.axis[2];
    }
    return s / this.coils.length;
  }

  /** Deepest flesh indentation (m): how far a flesh particle has been pushed toward the bone. */
  indentation(positions: Float32Array): { max: number; mean: number } {
    let max = 0;
    let sum = 0;
    const c = LIMB.centre;
    for (let k = 0; k < this.fleshCount; k++) {
      const i = this.ropeCount + k;
      const radial = (p: V3) => {
        const d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const along = d[0] * this.axis[0] + d[1] * this.axis[1] + d[2] * this.axis[2];
        return Math.hypot(d[0] - this.axis[0] * along, d[1] - this.axis[1] * along, d[2] - this.axis[2] * along);
      };
      const now = radial([positions[i * 4]!, positions[i * 4 + 1]!, positions[i * 4 + 2]!]);
      const dent = Math.max(0, radial(this.fleshRest[k]!) - now);
      max = Math.max(max, dent);
      sum += dent;
    }
    return { max, mean: sum / this.fleshCount };
  }

  destroy(): void {
    this.solver.destroy();
  }
}
