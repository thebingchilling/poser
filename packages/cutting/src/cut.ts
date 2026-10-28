import type { Manifold as ManifoldT, ManifoldToplevel } from 'manifold-3d';
import Module from 'manifold-3d';
import { TEMPLATE, type FittedThigh } from './thigh';

let manifoldPromise: Promise<ManifoldToplevel> | null = null;

/** Loads Manifold's WASM once. In the browser pass the bundled wasm URL. */
export function loadManifold(wasmUrl?: string): Promise<ManifoldToplevel> {
  manifoldPromise ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((m) => {
    m.setup();
    return m;
  });
  return manifoldPromise;
}

export type LayerName = 'skin' | 'fat' | 'quadriceps' | 'adductors' | 'hamstrings' | 'artery' | 'vein' | 'cortex' | 'marrow';

/** Layer colours for cut faces (PLAN.md section 11: tissue cap materials). */
export const LAYER_COLOURS: Record<LayerName, number> = {
  skin: 0xd9b49c,
  fat: 0xf0d27a,
  quadriceps: 0xa8403c,
  adductors: 0x9a3530,
  hamstrings: 0xb44a44,
  artery: 0xc8102e,
  vein: 0x3b4a9a,
  cortex: 0xece6d2,
  marrow: 0xb06a3a,
};

/**
 * Builds watertight solids for each layer of the fitted thigh. Skin is the
 * outer shell (skin surface minus 1.5 mm), fat sits between skin and
 * muscle, muscle groups are angular sectors of the muscle volume minus the
 * bone and vessels.
 */
export function buildLayers(M: ManifoldToplevel, fit: FittedThigh): Record<LayerName, ManifoldT> {
  const { Manifold, CrossSection } = M;
  const { rings, segments, shape } = fit;
  const L = shape.length;

  /** Closed star-shaped solid from a radius grid, capped flat at both ends. */
  const radial = (radius: (i: number) => number, inset = 0) => {
    const vert: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * L;
      for (let s = 0; s < segments; s++) {
        const th = (s / segments) * Math.PI * 2;
        const R = Math.max(0.001, radius(r * segments + s) - inset);
        vert.push(Math.cos(th) * R, Math.sin(th) * R, z);
      }
    }
    vert.push(0, 0, 0, 0, 0, L);
    const top = (rings + 1) * segments;
    const tri: number[] = [];
    const v = (r: number, s: number) => r * segments + (s % segments);
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) tri.push(v(r, s), v(r, s + 1), v(r + 1, s), v(r, s + 1), v(r + 1, s + 1), v(r + 1, s));
    }
    for (let s = 0; s < segments; s++) tri.push(top, v(0, s + 1), v(0, s), top + 1, v(rings, s), v(rings, s + 1));
    return new Manifold(new M.Mesh({ numProp: 3, vertProperties: new Float32Array(vert), triVerts: new Uint32Array(tri) }));
  };

  // Bone: a tube along Z, widening toward the joints, offset from the centre line.
  const tube = (radiusAt: (t: number) => number, offset: readonly [number, number]) => {
    const n = 32;
    const vert: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s < n; s++) {
        const th = (s / n) * Math.PI * 2;
        const R = radiusAt(t);
        vert.push(offset[0] + Math.cos(th) * R, offset[1] + Math.sin(th) * R, t * L);
      }
    }
    vert.push(offset[0], offset[1], 0, offset[0], offset[1], L);
    const top = (rings + 1) * n;
    const tri: number[] = [];
    const v = (r: number, s: number) => r * n + (s % n);
    for (let r = 0; r < rings; r++) for (let s = 0; s < n; s++) tri.push(v(r, s), v(r, s + 1), v(r + 1, s), v(r, s + 1), v(r + 1, s + 1), v(r + 1, s));
    for (let s = 0; s < n; s++) tri.push(top, v(0, s + 1), v(0, s), top + 1, v(rings, s), v(rings, s + 1));
    return new Manifold(new M.Mesh({ numProp: 3, vertProperties: new Float32Array(vert), triVerts: new Uint32Array(tri) }));
  };

  const outer = radial((i) => fit.skin[i]!);
  const underSkin = radial((i) => fit.skin[i]!, 0.0015);
  const muscleOuter = radial((i) => fit.muscle[i]!);
  const bone = tube(TEMPLATE.femurRadius, TEMPLATE.femurOffset);
  const marrow = tube((t) => TEMPLATE.femurRadius(t) * TEMPLATE.marrowRatio, TEMPLATE.femurOffset);
  const meanMuscle = (t: number) => {
    const r = Math.round(t * rings);
    let sum = 0;
    for (let s = 0; s < segments; s++) sum += fit.muscle[r * segments + s]!;
    return sum / segments;
  };
  const vessels = TEMPLATE.vessels.map((ves) => {
    const pos = (t: number): [number, number] => [Math.cos(ves.angle) * meanMuscle(t) * ves.depth, Math.sin(ves.angle) * meanMuscle(t) * ves.depth];
    // Vessels run straight between their positions at the two ends (good enough for a placeholder).
    const a = pos(0.15);
    const b = pos(0.85);
    return Manifold.cylinder(L * 0.98, ves.radius, ves.radius, 16)
      .warp((v) => {
        const t = v[2] / L;
        v[0] += a[0] + (b[0] - a[0]) * t;
        v[1] += a[1] + (b[1] - a[1]) * t;
      })
      .translate([0, 0, L * 0.01]);
  });

  const muscle = muscleOuter.subtract(bone).subtract(Manifold.union(vessels));
  // Muscle groups as angular wedges: quadriceps front, adductors inner, hamstrings back.
  const wedge = (from: number, to: number) => {
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k <= 24; k++) {
      const a = from + ((to - from) * k) / 24;
      pts.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
    }
    return Manifold.extrude(new CrossSection([pts]), L + 0.02).translate([0, 0, -0.01]);
  };
  const deg = Math.PI / 180;
  return {
    skin: outer.subtract(underSkin),
    fat: underSkin.subtract(muscleOuter),
    quadriceps: muscle.intersect(wedge(-20 * deg, 145 * deg)),
    adductors: muscle.intersect(wedge(145 * deg, 235 * deg)),
    hamstrings: muscle.intersect(wedge(235 * deg, 340 * deg)),
    artery: vessels[0]!,
    vein: vessels[1]!,
    cortex: bone.subtract(marrow),
    marrow,
  };
}

export interface CutResult {
  ms: number;
  pieces: Record<LayerName, [ManifoldT, ManifoldT]>;
}

/** Cuts every layer with a plane (a saw or knife cut through the limb). */
export function cutLayers(layers: Record<LayerName, ManifoldT>, normal: [number, number, number], offset: number): CutResult {
  const t0 = performance.now();
  const pieces = {} as CutResult['pieces'];
  for (const [name, m] of Object.entries(layers) as [LayerName, ManifoldT][]) {
    const [a, b] = m.splitByPlane(normal, offset);
    // Force evaluation (Manifold builds CSG lazily).
    a.numTri();
    b.numTri();
    pieces[name] = [a, b];
  }
  return { ms: performance.now() - t0, pieces };
}
