import { FLUID_PRESETS, MpmFluid, type FluidCapsule, type FluidPreset, type V3 } from './mpm';
import { SurfaceFlow } from './surfaceFlow';

/**
 * Prototype 4 (PLAN.md section 23): blood from a forearm wound. Particle
 * blood (MLS-MPM) flows over the arm and pools on the floor; a thin film
 * (texture-space surface flow) trickles around and along the forearm.
 */
export const FOREARM: FluidCapsule = { a: [-0.22, 0.4, 0], b: [0.16, 0.34, 0], radius: 0.034 };
export const UPPER_ARM: FluidCapsule = { a: [-0.22, 0.4, 0], b: [-0.3, 0.62, 0.02], radius: 0.042 };
/** Wound on top of the forearm, a third of the way from the elbow. */
export const WOUND_ALONG = 0.33;

export function woundPosition(): V3 {
  const a = FOREARM.a;
  const b = FOREARM.b;
  const t = WOUND_ALONG;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + FOREARM.radius + 0.008, a[2] + (b[2] - a[2]) * t];
}

export class BleedScene {
  readonly fluid: MpmFluid;
  readonly film: SurfaceFlow;
  time = 0;
  /** Particles per second from the wound while bleeding. */
  bleedRate = 1500;
  bleeding = true;
  private carry = 0;

  constructor(device: GPUDevice, opts: { maxParticles?: number; preset?: FluidPreset; substeps?: number; cellSize?: number } = {}) {
    // The domain is 64 cm across; smaller cells mean finer detail and more work.
    const cellSize = opts.cellSize ?? 0.01;
    const cells = Math.round(0.64 / cellSize);
    this.fluid = new MpmFluid(device, {
      origin: [-0.32, 0, -0.32],
      cells: [cells, cells, cells],
      cellSize,
      maxParticles: opts.maxParticles ?? 16384,
      preset: opts.preset ?? FLUID_PRESETS.blood,
      substeps: opts.substeps ?? 10,
    });
    this.fluid.setColliders([FOREARM, UPPER_ARM]);
    this.film = new SurfaceFlow(device, { a: FOREARM.a, b: FOREARM.b, radius: FOREARM.radius });
    this.film.setSource(0, WOUND_ALONG, 0.004);
  }

  step(dt: number): void {
    this.time += dt;
    if (this.bleeding) {
      this.carry += this.bleedRate * dt;
      const n = Math.floor(this.carry);
      this.carry -= n;
      // Venous ooze: slow, mostly up out of the wound, spreading.
      if (n > 0) this.fluid.emit(woundPosition(), [0.02, 0.15, 0], n, 0.005);
    }
    this.fluid.step(dt);
    this.film.step(dt);
  }

  setBleeding(on: boolean): void {
    this.bleeding = on;
    this.film.setSource(0, WOUND_ALONG, on ? 0.004 : 0);
  }

  destroy(): void {
    this.fluid.destroy();
    this.film.destroy();
  }
}
