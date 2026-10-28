import type { DistanceConstraint, Particle, V3 } from '@poser/xpbd';

/**
 * A flared skirt as a particle grid (PLAN.md section 8): rings from the
 * waistband down to the hem. Structural, shear, and bending (skip-one)
 * distance constraints; the waistband ring is kinematic and follows the body.
 */
export interface SkirtOptions {
  waistRadius?: number;
  /** Radius at the hip line, `hipDrop` below the waist; the skirt fits there and flares below. */
  hipRadius?: number;
  hipDrop?: number;
  /** Structural threads can't stretch past this ratio (stiff one-sided limit). */
  maxStretch?: number;
  hemRadius?: number;
  length?: number;
  /** Target spacing between particles (m). */
  spacing?: number;
  /** Fabric stretch and bend compliance (m/N). */
  stretchCompliance?: number;
  bendCompliance?: number;
  /** Total fabric mass (kg). */
  mass?: number;
}

export interface SkirtMesh {
  particles: Particle[];
  constraints: DistanceConstraint[];
  /** Triangle indices for rendering. */
  indices: Uint32Array;
  rows: number;
  columns: number;
  waistband: number[];
  /** Waistband positions relative to the waist centre. */
  waistOffsets: V3[];
}

export function buildSkirt(waist: V3, o: SkirtOptions = {}): SkirtMesh {
  const waistRadius = o.waistRadius ?? 0.125;
  const hipRadius = o.hipRadius ?? 0.2;
  const hipDrop = o.hipDrop ?? 0.14;
  const hemRadius = o.hemRadius ?? 0.36;
  const length = o.length ?? 0.55;
  const spacing = o.spacing ?? 0.025;
  const columns = Math.max(12, Math.round((2 * Math.PI * (hipRadius + hemRadius)) / 2 / spacing));
  const rows = Math.max(4, Math.round(length / spacing) + 1);
  const n = rows * columns;
  const invMass = n / (o.mass ?? 0.25);
  const particles: Particle[] = [];
  const waistband: number[] = [];
  const waistOffsets: V3[] = [];
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const depth = length * t;
    const radius =
      depth < hipDrop
        ? waistRadius + (hipRadius - waistRadius) * Math.sin(((depth / hipDrop) * Math.PI) / 2)
        : hipRadius + (hemRadius - hipRadius) * ((depth - hipDrop) / (length - hipDrop));
    const y = waist[1] - length * t;
    for (let c = 0; c < columns; c++) {
      const a = (c / columns) * Math.PI * 2;
      const position: V3 = [waist[0] + Math.sin(a) * radius, y, waist[2] + Math.cos(a) * radius];
      particles.push({ position, invMass: r === 0 ? 0 : invMass, radius: 0.006, friction: 0.35 });
      if (r === 0) {
        waistband.push(c);
        waistOffsets.push([position[0] - waist[0], 0, position[2] - waist[2]]);
      }
    }
  }
  const id = (r: number, c: number) => r * columns + ((c + columns) % columns);
  const p = (i: number) => particles[i]!.position;
  const len = (i: number, j: number) => Math.hypot(p(i)[0] - p(j)[0], p(i)[1] - p(j)[1], p(i)[2] - p(j)[2]);
  const constraints: DistanceConstraint[] = [];
  const maxStretch = o.maxStretch ?? 1.06;
  const add = (i: number, j: number, compliance: number, limit = false) => {
    constraints.push({ i, j, rest: len(i, j), compliance });
    if (limit) constraints.push({ i, j, rest: len(i, j) * maxStretch, compliance: 0, kind: 'max' });
  };
  const stretch = o.stretchCompliance ?? 1e-7;
  const bend = o.bendCompliance ?? 2e-4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      add(id(r, c), id(r, c + 1), stretch, true);
      if (r + 1 < rows) {
        add(id(r, c), id(r + 1, c), stretch, true);
        add(id(r, c), id(r + 1, c + 1), stretch * 10);
        add(id(r, c + 1), id(r + 1, c), stretch * 10);
      }
      // Bending resistance: skip-one springs along both directions.
      add(id(r, c), id(r, c + 2), bend);
      if (r + 2 < rows) add(id(r, c), id(r + 2, c), bend);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const a = id(r, c);
      const b = id(r, c + 1);
      const d = id(r + 1, c);
      const e = id(r + 1, c + 1);
      indices.push(a, d, b, b, d, e);
    }
  }
  return { particles, constraints, indices: new Uint32Array(indices), rows, columns, waistband, waistOffsets };
}
