import { describe, expect, it } from 'vitest';
import { CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { braSize, enclosedVolume, hullPerimeter, measureBody, sliceAt } from './measure';

function tris(...geos: { geo: BufferGeometry; x?: number; y?: number }[]): Float32Array {
  const out: number[] = [];
  for (const { geo, x = 0, y = 0 } of geos) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position!.array;
    for (let i = 0; i < p.length; i += 3) out.push(p[i]! + x, p[i + 1]! + y, p[i + 2]!);
  }
  return new Float32Array(out);
}

describe('body measurements', () => {
  it('measures a cylinder like a tape and a jug', () => {
    const t = tris({ geo: new CylinderGeometry(0.15, 0.15, 1, 96), y: 0.5 });
    const around = hullPerimeter(sliceAt(t, 0.5));
    expect(around).toBeCloseTo(2 * Math.PI * 0.15, 2);
    expect(enclosedVolume(t, 0.005)).toBeCloseTo(Math.PI * 0.15 * 0.15, 2);
  });

  it('counts overlapping parts once and survives an open mesh', () => {
    const one = enclosedVolume(tris({ geo: new SphereGeometry(0.2, 48, 32) }), 0.005);
    const twice = enclosedVolume(tris({ geo: new SphereGeometry(0.2, 48, 32) }, { geo: new SphereGeometry(0.2, 48, 32) }), 0.005);
    expect(twice).toBeCloseTo(one, 4);
    expect(one).toBeCloseTo((4 / 3) * Math.PI * 0.2 ** 3, 2);
    // An open-ended tube: rays through the hole are skipped, not counted as solid to infinity.
    const open = enclosedVolume(tris({ geo: new CylinderGeometry(0.15, 0.15, 1, 64, 1, true), y: 0.5 }), 0.01);
    expect(open).toBeLessThan(0.2);
  });

  it('gives EU bra sizes', () => {
    expect(braSize(0.75, 0.9)).toBe('75B');
    expect(braSize(0.7, 0.88)).toBe('70D');
    expect(braSize(0.8, 0.85)).toBeNull();
  });

  it('finds bust, waist, and hips on a simple torso', () => {
    // Stacked cylinders: hips r 0.16 at 0.85–1.0, waist r 0.11 at 1.0–1.15, bust r 0.15 at 1.15–1.35.
    const t = tris(
      { geo: new CylinderGeometry(0.16, 0.16, 0.15, 64), y: 0.925 },
      { geo: new CylinderGeometry(0.11, 0.11, 0.15, 64), y: 1.075 },
      { geo: new CylinderGeometry(0.15, 0.15, 0.2, 64), y: 1.25 },
      { geo: new CylinderGeometry(0.06, 0.06, 0.85, 32), x: 0.08, y: 0.425 },
      { geo: new CylinderGeometry(0.06, 0.06, 0.85, 32), x: -0.08, y: 0.425 },
    );
    const m = measureBody(t, { hips: [0, 0.95, 0], leftUpperLeg: [0.08, 0.9, 0], chest: [0, 1.22, 0], upperChest: [0, 1.32, 0], leftUpperArm: [0.2, 1.4, 0] });
    expect(m.hips).toBeCloseTo(2 * Math.PI * 0.16, 2);
    expect(m.waist).toBeCloseTo(2 * Math.PI * 0.11, 2);
    expect(m.bust).toBeCloseTo(2 * Math.PI * 0.15, 2);
    expect(m.height).toBeCloseTo(1.35, 2);
  });
});
