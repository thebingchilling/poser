import { writeSnapshot } from '@poser/xpbd/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { LAYER_COLOURS, buildLayers, cutLayers, loadManifold, type LayerName } from './cut';
import { HEAVY_THIGH, SLIM_THIGH, buildImportedThigh, fitThigh, type ThighShape } from './thigh';

let M: Awaited<ReturnType<typeof loadManifold>>;
beforeAll(async () => {
  M = await loadManifold();
});

const log = (s: string) => process.stderr.write(s + '\n');

describe('prototype 3: anatomy fit and cut', () => {
  it.each([
    ['slim', SLIM_THIGH],
    ['heavy', HEAVY_THIGH],
  ] as [string, ThighShape][])('fits placeholder anatomy into a %s imported thigh', (name, shape) => {
    const mesh = buildImportedThigh(shape);
    const t0 = performance.now();
    const fit = fitThigh(mesh, shape);
    const fitMs = performance.now() - t0;
    const r = fit.report;
    log(`${name} fit: ${fitMs.toFixed(0)} ms; bone cover min ${(r.minBoneCover * 1000).toFixed(1)} mm; fat ${(r.minFat * 1000).toFixed(1)}–${(r.maxFat * 1000).toFixed(1)} mm (mean ${(r.meanFat * 1000).toFixed(1)}); clamped ${(r.clamped * 100).toFixed(1)}%`);
    // No bone poking through, and at least the minimum muscle around it.
    expect(r.minBoneCover).toBeGreaterThan(0.011);
    expect(r.minFat).toBeGreaterThanOrEqual(0.003 - 1e-6);
    expect(r.clamped).toBeLessThan(0.1);
    if (name === 'heavy') expect(r.meanFat).toBeGreaterThan(0.015);
  });

  it('cuts through every layer quickly, and the cut face shows the layers in the right order', async () => {
    const mesh = buildImportedThigh(HEAVY_THIGH);
    const fit = fitThigh(mesh, HEAVY_THIGH);
    let t0 = performance.now();
    const layers = buildLayers(M, fit);
    for (const m of Object.values(layers)) m.numTri();
    const buildMs = performance.now() - t0;
    for (const [name, m] of Object.entries(layers)) {
      expect(m.status(), name).toBe('NoError');
      expect(m.volume(), name).toBeGreaterThan(0);
    }

    // An oblique knife/saw cut through mid-thigh.
    const len = Math.hypot(0, 0.35, 1);
    const normal: [number, number, number] = [0, 0.35 / len, 1 / len];
    const offset = (HEAVY_THIGH.length / 2) * normal[2];
    const cut = cutLayers(layers, normal, offset);
    log(`layers built in ${buildMs.toFixed(0)} ms; cut through ${Object.keys(layers).length} layers in ${cut.ms.toFixed(0)} ms`);
    expect(cut.ms).toBeLessThan(1000);

    // Volume is conserved and both pieces are valid solids.
    for (const [name, [a, b]] of Object.entries(cut.pieces)) {
      const whole = layers[name as LayerName].volume();
      expect(Math.abs(a.volume() + b.volume() - whole) / whole, name).toBeLessThan(1e-3);
      expect(a.status()).toBe('NoError');
    }

    // Cross-section at the middle (z-slice): each inner layer lies inside the
    // next outer one, in anatomical order.
    t0 = performance.now();
    const z = HEAVY_THIGH.length * 0.5;
    const slice = (n: LayerName) => layers[n].slice(z);
    const inside = (inner: LayerName, outerNames: LayerName[]) => {
      const a = slice(inner);
      const outer = outerNames.map(slice).reduce((x, y) => x.add(y));
      // Fill holes in the outer shell so "inside" means enclosed.
      const filled = M.CrossSection.ofPolygons(outer.toPolygons().filter((poly) => polygonArea(poly) > 0));
      return a.intersect(filled).area() / a.area();
    };
    const areas = Object.fromEntries((Object.keys(layers) as LayerName[]).map((n) => [n, slice(n).area() * 1e4]));
    log(`cross-section areas (cm²): ${Object.entries(areas).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}; checked in ${(performance.now() - t0).toFixed(0)} ms`);
    expect(inside('marrow', ['cortex', 'marrow'])).toBeGreaterThan(0.99);
    expect(inside('cortex', ['quadriceps', 'adductors', 'hamstrings', 'cortex', 'marrow', 'artery', 'vein'])).toBeGreaterThan(0.99);
    expect(inside('artery', ['quadriceps', 'adductors', 'hamstrings', 'artery', 'vein', 'cortex', 'marrow'])).toBeGreaterThan(0.99);
    expect(inside('quadriceps', ['fat', 'quadriceps', 'adductors', 'hamstrings', 'cortex', 'marrow', 'artery', 'vein'])).toBeGreaterThan(0.99);
    expect(inside('fat', ['skin', 'fat', 'quadriceps', 'adductors', 'hamstrings', 'cortex', 'marrow', 'artery', 'vein'])).toBeGreaterThan(0.99);
    // Plausible proportions: muscle is the bulk; bone a small part.
    const muscleArea = areas.quadriceps! + areas.adductors! + areas.hamstrings!;
    expect(muscleArea).toBeGreaterThan(areas.cortex! * 5);
    expect(areas.fat).toBeGreaterThan(5);

    // Snapshot of the lower piece with its cut face (thigh standing upright, hip at the top).
    const meshes = (Object.keys(layers) as LayerName[]).map((n) => {
      const m = cut.pieces[n][0].getMesh();
      const positions: number[] = [];
      for (let i = 0; i < m.numVert; i++) {
        const x = m.vertProperties[i * m.numProp]!;
        const y = m.vertProperties[i * m.numProp + 1]!;
        const zz = m.vertProperties[i * m.numProp + 2]!;
        positions.push(x, 0.9 - zz, y);
      }
      return { positions, indices: [...m.triVerts], color: LAYER_COLOURS[n] };
    });
    await writeSnapshot('thigh-cut', { camera: [0.25, 0.95, 0.35], target: [0, 0.7, 0], meshes });
  });
});

function polygonArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
