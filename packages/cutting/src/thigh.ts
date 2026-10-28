/**
 * Prototype 3 (PLAN.md section 23): fit a rough placeholder anatomy into an
 * "imported" thigh, then cut through it with Manifold.
 *
 * Local frame for the limb: Z runs along the femur from the hip (z = 0) to
 * the knee (z = length); +X is lateral (outer thigh), +Y anterior (front).
 */

export type V3 = [number, number, number];

export interface SkinMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface ThighShape {
  length: number;
  /** Radius at the hip end and knee end (m). */
  hipRadius: number;
  kneeRadius: number;
  /** Extra soft-tissue bulges, as angle (radians, 0 = lateral, π/2 = front), height (0–1), size (m), spread. */
  bulges: { angle: number; height: number; size: number; spread: number }[];
  /** Small surface irregularity (m), like a sculpted or scanned mesh. */
  noise: number;
}

export const SLIM_THIGH: ThighShape = {
  length: 0.42,
  hipRadius: 0.078,
  kneeRadius: 0.05,
  bulges: [
    { angle: Math.PI / 2, height: 0.45, size: 0.008, spread: 0.6 }, // quadriceps
    { angle: Math.PI, height: 0.25, size: 0.006, spread: 0.7 }, // inner thigh
  ],
  noise: 0.0015,
};

export const HEAVY_THIGH: ThighShape = {
  length: 0.42,
  hipRadius: 0.1,
  kneeRadius: 0.06,
  bulges: [
    { angle: Math.PI / 2, height: 0.45, size: 0.01, spread: 0.6 },
    { angle: Math.PI, height: 0.25, size: 0.022, spread: 0.8 }, // inner-thigh fat pad
    { angle: -Math.PI / 2, height: 0.15, size: 0.02, spread: 0.9 }, // under the buttock
    { angle: 0, height: 0.2, size: 0.012, spread: 0.6 }, // outer hip
  ],
  noise: 0.002,
};

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Radius of the thigh skin at angle θ and height t (0 hip, 1 knee). */
export function shapeRadius(shape: ThighShape, theta: number, t: number): number {
  // Taper with a slight muscle-belly swell, slightly wider front-to-back.
  let r = shape.hipRadius + (shape.kneeRadius - shape.hipRadius) * t ** 1.3;
  r *= 1 + 0.06 * Math.sin(Math.PI * t) + 0.04 * Math.sin(theta) ** 2;
  for (const b of shape.bulges) {
    const da = Math.atan2(Math.sin(theta - b.angle), Math.cos(theta - b.angle));
    r += b.size * Math.exp(-(da * da) / (2 * b.spread * b.spread)) * Math.exp(-((t - b.height) ** 2) / 0.04);
  }
  const n = hash(Math.round(theta * 20), Math.round(t * 30)) - 0.5;
  return r + n * shape.noise;
}

/**
 * The stand-in for an imported figure's thigh: a closed triangle mesh, as
 * generated at import for cutting (PLAN.md section 11). The fitting below
 * only reads the triangles, as it would for a real import.
 */
export function buildImportedThigh(shape: ThighShape, rings = 48, segments = 72): SkinMesh {
  const positions: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const rad = shapeRadius(shape, th, t);
      positions.push(Math.cos(th) * rad, Math.sin(th) * rad, t * shape.length);
    }
  }
  const top = positions.length / 3;
  positions.push(0, 0, 0);
  const bottom = top + 1;
  positions.push(0, 0, shape.length);
  const idx: number[] = [];
  const v = (r: number, s: number) => r * segments + (s % segments);
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      idx.push(v(r, s), v(r, s + 1), v(r + 1, s), v(r, s + 1), v(r + 1, s + 1), v(r + 1, s));
    }
  }
  for (let s = 0; s < segments; s++) {
    idx.push(top, v(0, s + 1), v(0, s));
    idx.push(bottom, v(rings, s), v(rings, s + 1));
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(idx) };
}

/** Distance from the bone axis to the skin along a ray at (θ, z): the skin registration step. */
export function measureSkinRadius(mesh: SkinMesh, theta: number, z: number): number {
  const o: V3 = [0, 0, z];
  const d: V3 = [Math.cos(theta), Math.sin(theta), 0];
  const p = mesh.positions;
  let best = Infinity;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const a = mesh.indices[k]! * 3;
    const b = mesh.indices[k + 1]! * 3;
    const c = mesh.indices[k + 2]! * 3;
    // Quick reject by height.
    const zmin = Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!);
    const zmax = Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!);
    if (z < zmin - 1e-9 || z > zmax + 1e-9) continue;
    const e1: V3 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
    const e2: V3 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    const h: V3 = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const s: V3 = [o[0] - p[a]!, o[1] - p[a + 1]!, o[2] - p[a + 2]!];
    const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const q: V3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > 1e-6 && t < best) best = t;
  }
  return best;
}

/** Placeholder thigh anatomy template: absolute bone size, fat as a pattern scaled by body fat. */
export const TEMPLATE = {
  /** Femoral shaft outer radius and marrow radius (m), and how they widen toward the joints. */
  femurRadius: (t: number) => 0.0135 + 0.012 * Math.exp(-((1 - t) ** 2) / 0.01) + 0.01 * Math.exp(-(t ** 2) / 0.008),
  marrowRatio: 0.6,
  /** Femur sits slightly lateral and anterior of the thigh's centre line (m). */
  femurOffset: [0.006, 0.004] as const,
  /** Fat thickness pattern around the thigh (relative), thickest inner and back. */
  fatPattern: (theta: number) => 0.8 + 0.25 * Math.cos(theta - Math.PI) + 0.15 * Math.cos(theta + Math.PI / 2),
  /** Muscle must keep at least this much around the bone (m). */
  minMuscle: 0.012,
  minFat: 0.003,
  /** Femoral artery and vein: angle (anteromedial), depth as a share of the muscle radius, radii (m). */
  vessels: [
    { name: 'artery', angle: 2.2, depth: 0.55, radius: 0.0038 },
    { name: 'vein', angle: 2.45, depth: 0.5, radius: 0.0048 },
  ],
};

export interface FittedThigh {
  shape: ThighShape;
  /** Sampled skin radius, fat thickness, and muscle radius on a (rings+1) × segments grid. */
  rings: number;
  segments: number;
  skin: Float32Array;
  fat: Float32Array;
  muscle: Float32Array;
  report: FitReport;
}

export interface FitReport {
  /** Smallest muscle thickness around the bone (m); negative = bone pokes out. */
  minBoneCover: number;
  minFat: number;
  maxFat: number;
  meanFat: number;
  /** Share of samples where the template had to be clamped to fit. */
  clamped: number;
}

/**
 * Fits the template into a skin mesh: measure the skin around the bone,
 * place fat under the skin by the template pattern (scaled by body fat),
 * muscle fills the rest, bone keeps its real size. Clamps keep minimum fat
 * and muscle cover; how often that happens is part of the fit quality.
 */
export function fitThigh(mesh: SkinMesh, shape: ThighShape, bodyFat = 1, rings = 24, segments = 48): FittedThigh {
  const n = (rings + 1) * segments;
  const skin = new Float32Array(n);
  const fat = new Float32Array(n);
  const muscle = new Float32Array(n);
  let minBoneCover = Infinity;
  let minFat = Infinity;
  let maxFat = 0;
  let sumFat = 0;
  let clamped = 0;
  // Fat scales with how much bigger this thigh is than a lean one.
  const lean = (t: number) => 0.07 + (0.047 - 0.07) * t;
  for (let r = 0; r <= rings; r++) {
    const t = Math.min(0.999, Math.max(0.001, r / rings));
    const z = t * shape.length;
    const boneR = TEMPLATE.femurRadius(t);
    for (let s = 0; s < segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const R = measureSkinRadius(mesh, th, z);
      const extra = Math.max(0, R - lean(t));
      let f = (0.006 + extra * 0.7) * TEMPLATE.fatPattern(th) * bodyFat;
      // Distance from the axis to the far side of the bone along this direction (bone is offset).
      const boneFar = boneR + TEMPLATE.femurOffset[0] * Math.cos(th) + TEMPLATE.femurOffset[1] * Math.sin(th);
      const room = R - boneFar - TEMPLATE.minMuscle;
      let wasClamped = false;
      if (f > room) {
        f = room;
        wasClamped = true;
      }
      if (f < TEMPLATE.minFat) {
        f = TEMPLATE.minFat;
        wasClamped = true;
      }
      const i = r * segments + s;
      skin[i] = R;
      fat[i] = f;
      muscle[i] = R - f;
      minBoneCover = Math.min(minBoneCover, R - f - boneFar);
      minFat = Math.min(minFat, f);
      maxFat = Math.max(maxFat, f);
      sumFat += f;
      if (wasClamped) clamped++;
    }
  }
  return { shape, rings, segments, skin, fat, muscle, report: { minBoneCover, minFat, maxFat, meanFat: sumFat / n, clamped: clamped / n } };
}
