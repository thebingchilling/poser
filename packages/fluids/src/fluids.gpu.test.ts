import { testDevice, writeSnapshot } from '@poser/xpbd/testing';
import { describe, expect, it } from 'vitest';
import { BleedScene, FOREARM, UPPER_ARM } from './bleedScene';
import { SurfaceFlow } from './surfaceFlow';

const device = await testDevice();
const gpu = device ? describe : describe.skip;
const log = (s: string) => process.stderr.write(s + '\n');

function insideCapsule(p: [number, number, number], c: { a: number[]; b: number[]; radius: number }): number {
  const ab = [c.b[0]! - c.a[0]!, c.b[1]! - c.a[1]!, c.b[2]! - c.a[2]!];
  const ap = [p[0] - c.a[0]!, p[1] - c.a[1]!, p[2] - c.a[2]!];
  const t = Math.min(1, Math.max(0, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2)));
  const d = Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t);
  return c.radius - d;
}

gpu('prototype 4: fluids', () => {
  it('MLS-MPM blood flows over the arm without passing through it and pools on the floor', async () => {
    // A coarser grid than the app's (1.6 cm cells) keeps this quick on a software GPU.
    const scene = new BleedScene(device!, { maxParticles: 2048, cellSize: 0.016, substeps: 8 });
    scene.bleedRate = 3000;
    for (let f = 0; f < 30; f++) scene.step(1 / 60); // bleed 0.5 s
    scene.setBleeding(false);
    for (let f = 0; f < 90; f++) scene.step(1 / 60); // then 1.5 s more
    const p = await scene.fluid.readPositions();
    const n = p.length / 3;
    let inside = 0;
    let onFloor = 0;
    let onArm = 0;
    let maxSpread = 0;
    let finite = true;
    for (let i = 0; i < n; i++) {
      const q: [number, number, number] = [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
      if (!q.every(Number.isFinite)) finite = false;
      if (Math.max(insideCapsule(q, FOREARM), insideCapsule(q, UPPER_ARM)) > 0.006) inside++;
      if (q[1] < 0.05) {
        onFloor++;
        maxSpread = Math.max(maxSpread, Math.hypot(q[0] - -0.03, q[2]));
      }
      if (insideCapsule(q, FOREARM) > -0.03) onArm++;
    }
    log(`mpm: ${n} particles; inside arm ${inside}; on floor ${onFloor}; still on arm ${onArm}; pool radius ${(maxSpread * 100).toFixed(1)} cm`);
    expect(finite).toBe(true);
    expect(n).toBe(1500);
    expect(inside / n).toBeLessThan(0.01);
    // Most ran off the arm and fell; some stays as a coating.
    expect(onFloor / n).toBeGreaterThan(0.5);
    expect(maxSpread).toBeGreaterThan(0.03);
    await writeSnapshot('bleed', {
      camera: [0.55, 0.55, 0.7],
      target: [0, 0.25, 0],
      capsules: [FOREARM, UPPER_ARM],
      points: { positions: [...p], color: 0x8a0303, size: 0.008 },
    });
    scene.destroy();
  }, 300_000);

  it('surface film trickles down and around the arm, conserving mass, and drips from the underside', async () => {
    const film = new SurfaceFlow(device!, { a: FOREARM.a, b: FOREARM.b, radius: FOREARM.radius });
    film.setSource(0, 0.33, 0.004);
    const dt = 1 / 60;
    for (let f = 0; f < 60; f++) film.step(dt);
    film.setSource(0, 0.33, 0);
    const added = 0.004 * 13 * 1; // 13 source cells (radius 2), 1 s
    for (let f = 0; f < 120; f++) film.step(dt);
    const h = await film.readThickness();
    const dripped = await film.readDripped();
    let total = 0;
    let topHalf = 0;
    let comV = 0;
    for (let v = 0; v < film.nv; v++) {
      for (let u = 0; u < film.nu; u++) {
        const x = h[v * film.nu + u]!;
        total += x;
        comV += x * v;
        const th = (u / film.nu) * Math.PI * 2;
        if (Math.cos(th) > 0) topHalf += x;
      }
    }
    comV /= total || 1;
    log(`film: remaining ${(total * 1e3).toFixed(3)} mm·cells, dripped ${(dripped * 1e3).toFixed(3)}, added ${(added * 1e3).toFixed(3)}; top-half share ${((topHalf / total) * 100).toFixed(0)}%; centre along axis ${(comV / film.nv).toFixed(2)} (source 0.33)`);
    // Mass conservation (within the drip counter's micro-unit rounding).
    expect(Math.abs(total + dripped - added) / added).toBeLessThan(0.02);
    // It ran around to the underside and dripped.
    expect(topHalf / total).toBeLessThan(0.4);
    expect(dripped).toBeGreaterThan(0);
    // The forearm slopes down toward the wrist (b), so the film moved that way.
    expect(comV / film.nv).toBeGreaterThan(0.36);
    film.destroy();
  }, 300_000);
});
