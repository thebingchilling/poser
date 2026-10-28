import { testDevice, writeSnapshot, xyz } from '@poser/xpbd/testing';
import { describe, expect, it } from 'vitest';
import { LIMB, RopeScene } from './ropeScene';

const device = await testDevice();
// Slow on a software GPU (minutes); fast on real hardware.
const gpu = device ? describe : describe.skip;
const log = (s: string) => process.stderr.write(s + '\n');

async function run(opts: ConstructorParameters<typeof RopeScene>[1], seconds: number) {
  const scene = new RopeScene(device!, opts);
  const start = scene.coilCentre(await scene.solver.readPositions());
  const half = Math.round((seconds * 60) / 2);
  for (let f = 0; f < half; f++) scene.step(1 / 60);
  const settled = scene.coilCentre(await scene.solver.readPositions());
  for (let f = 0; f < half; f++) scene.step(1 / 60);
  const p = await scene.solver.readPositions();
  const end = scene.coilCentre(p);
  // slide: total distance moved; creep: movement after the wraps tightened.
  return { scene, p, slide: end - start, creep: end - settled };
}

gpu('prototype 5: rope on a limb', () => {
  it('friction holds the wraps on a tilted limb; frictionless rope slides off', async () => {
    const tilt = (30 * Math.PI) / 180;
    const held = await run({ tilt, ropeFriction: 0.8, load: 0.5 }, 1.5);
    const slick = await run({ tilt, ropeFriction: 0, load: 0.5 }, 1.5);
    log(`rope: with friction it settles ${(held.slide * 100).toFixed(1)} cm then creeps ${(held.creep * 1000).toFixed(1)} mm; without friction it slides ${(slick.slide * 100).toFixed(1)} cm`);
    expect(held.p.every(Number.isFinite)).toBe(true);
    // Tightening shifts the wraps a little; after that friction holds them.
    expect(Math.abs(held.slide)).toBeLessThan(0.04);
    expect(Math.abs(held.creep)).toBeLessThan(0.004);
    // Downhill is -axis; without friction the coils slide well down the limb.
    expect(slick.slide).toBeLessThan(-0.03);
    held.scene.destroy();
    slick.scene.destroy();
  }, 300_000);

  it('the loaded rope presses into the flesh, more with a heavier load', async () => {
    const light = await run({ load: 0.2 }, 1.5);
    const heavy = await run({ load: 3 }, 1.5);
    const a = light.scene.indentation(light.p);
    const b = heavy.scene.indentation(heavy.p);
    log(`rope: flesh indentation light load ${(a.max * 1000).toFixed(1)} mm (mean ${(a.mean * 1000).toFixed(2)}), heavy ${(b.max * 1000).toFixed(1)} mm (mean ${(b.mean * 1000).toFixed(2)})`);
    const s = heavy.scene;
    const all = xyz(heavy.p);
    await writeSnapshot('rope', {
      camera: [0.25, 0.68, 0.32],
      target: [0, 0.57, 0],
      spheres: [
        ...Array.from({ length: s.ropeCount }, (_, i) => ({ p: all.slice(i * 3, i * 3 + 3), r: 0.004, color: 0xc9a35a })),
        ...Array.from({ length: s.fleshCount }, (_, k) => ({ p: all.slice((s.ropeCount + k) * 3, (s.ropeCount + k) * 3 + 3), r: 0.0048, color: 0xd9b49c })),
      ],
      capsules: [{ a: [-0.2, 0.6, 0], b: [0.2, 0.6, 0], radius: LIMB.coreRadius, color: 0xb0786a }],
    });
    expect(b.max).toBeGreaterThan(0.002);
    expect(b.max).toBeGreaterThan(a.max * 1.3);
    // The dent stays within the soft layer (the core stops it).
    expect(b.max).toBeLessThan(LIMB.skinRadius - LIMB.coreRadius + 0.002);
    light.scene.destroy();
    heavy.scene.destroy();
  }, 300_000);
});
