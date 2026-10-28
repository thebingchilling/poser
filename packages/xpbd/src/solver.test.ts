import { describe, expect, it } from 'vitest';
import { XpbdSolver, colourConstraints, type DistanceConstraint, type Particle } from './solver';
import { testDevice } from './testing/dawn';

const device = await testDevice();
const gpu = device ? describe : describe.skip;

const at = (p: Float32Array, i: number) => [p[i * 4]!, p[i * 4 + 1]!, p[i * 4 + 2]!] as const;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('constraint colouring', () => {
  it('never puts two constraints on one particle in the same colour', () => {
    const cons: DistanceConstraint[] = [];
    for (let i = 0; i < 50; i++) cons.push({ i, j: i + 1, rest: 1 }, { i, j: (i + 7) % 51, rest: 1 });
    for (const colour of colourConstraints(cons, 51)) {
      const seen = new Set<number>();
      for (const c of colour) {
        expect(seen.has(c.i) || seen.has(c.j)).toBe(false);
        seen.add(c.i).add(c.j);
      }
    }
  });
});

gpu('XPBD solver on the GPU', () => {
  it('a pinned chain hangs at its rest length', async () => {
    const n = 20;
    const particles: Particle[] = Array.from({ length: n }, (_, i) => ({ position: [i * 0.05, 2, 0], invMass: i === 0 ? 0 : 1, radius: 0.01 }));
    const cons = Array.from({ length: n - 1 }, (_, i) => ({ i, j: i + 1, rest: 0.05 }));
    // Released sideways it swings like a pendulum; damping lets it come to rest.
    const s = new XpbdSolver(device!, particles, cons, { substeps: 20, floor: null, damping: 3 });
    for (let f = 0; f < 300; f++) s.step(1 / 60);
    const p = await s.readPositions();
    expect(at(p, 0)).toEqual([0, 2, 0]);
    const length = Array.from({ length: n - 1 }, (_, i) => dist(at(p, i), at(p, i + 1))).reduce((a, b) => a + b);
    expect(length / (0.05 * (n - 1))).toBeLessThan(1.02);
    // Hanging straight down below the pin.
    expect(Math.abs(at(p, n - 1)[0])).toBeLessThan(0.1);
    expect(at(p, n - 1)[1]).toBeLessThan(2 - 0.85);
    s.destroy();
  }, 300_000);

  it('particles land on the floor and on a capsule without passing through', async () => {
    const particles: Particle[] = [
      { position: [3, 1, 0], invMass: 1, radius: 0.02 },
      { position: [0, 1, 0], invMass: 1, radius: 0.02, friction: 1 },
    ];
    const s = new XpbdSolver(device!, particles, []);
    s.setColliders([{ a: [-0.5, 0.5, 0], b: [0.5, 0.5, 0], radius: 0.1, friction: 1 }]);
    for (let f = 0; f < 90; f++) s.step(1 / 60);
    const p = await s.readPositions();
    expect(at(p, 0)[1]).toBeCloseTo(0.02, 3);
    // Resting on top of the capsule: centre + radius + particle radius.
    expect(at(p, 1)[1]).toBeCloseTo(0.62, 2);
    s.destroy();
  }, 300_000);

  it("'max' constraints allow slack but not stretch", async () => {
    const particles: Particle[] = [
      { position: [0, 1, 0], invMass: 0, radius: 0.01 },
      { position: [0.1, 1, 0], invMass: 1, radius: 0.01 },
    ];
    const s = new XpbdSolver(device!, particles, [{ i: 0, j: 1, rest: 0.5, kind: 'max' }], { floor: null });
    for (let f = 0; f < 5; f++) s.step(1 / 60);
    let p = await s.readPositions();
    expect(dist(at(p, 0), at(p, 1))).toBeLessThan(0.5);
    for (let f = 0; f < 120; f++) s.step(1 / 60);
    p = await s.readPositions();
    expect(dist(at(p, 0), at(p, 1))).toBeLessThan(0.505);
    expect(dist(at(p, 0), at(p, 1))).toBeGreaterThan(0.49);
    s.destroy();
  }, 300_000);

  it('particles in colliding layers stack instead of overlapping', async () => {
    const particles: Particle[] = Array.from({ length: 5 }, (_, i) => ({ position: [0, 0.05 + i * 0.03, 0], invMass: 1, radius: 0.025, layer: 1, mask: 1, friction: 0.8 }));
    const s = new XpbdSolver(device!, particles, [], { substeps: 15 });
    for (let f = 0; f < 120; f++) s.step(1 / 60);
    const p = await s.readPositions();
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(dist(at(p, i), at(p, j))).toBeGreaterThan(0.045);
    s.destroy();
  }, 300_000);
});
