import { testDevice, writeSnapshot, xyz } from '@poser/xpbd/testing';
import { describe, expect, it } from 'vitest';
import { SkirtScene } from './skirtScene';

const device = await testDevice();
const gpu = device ? describe : describe.skip;

gpu('prototype 2: GPU cloth skirt on a walking body', () => {
  it('drapes and follows the legs without passing through or tearing', async () => {
    const scene = new SkirtScene(device!);
    process.stderr.write(`skirt: ${scene.skirt.particles.length} particles, ${scene.skirt.constraints.length} constraints\n`);
    let worst = { max: 0, fraction: 0 };
    let worstStretch = 0;
    // Three seconds of walking at 60 fps, checked every 6 frames.
    for (let f = 0; f < 180; f++) {
      scene.step(1 / 60);
      if (f % 6 === 5) {
        const p = await scene.solver.readPositions();
        expect(p.every(Number.isFinite), 'NaN in cloth').toBe(true);
        const pen = SkirtScene.penetration(p, scene.capsules);
        if (pen.max > worst.max) worst = pen;
        worstStretch = Math.max(worstStretch, SkirtScene.maxStretch(p, scene.skirt));
      }
    }
    const p = await scene.solver.readPositions();
    await writeSnapshot('skirt', {
      camera: [1.4, 1.1, 1.9],
      target: [0, 0.7, 0],
      meshes: [{ positions: xyz(p), indices: [...scene.skirt.indices], color: 0x8e3b5a }],
      capsules: scene.capsules,
    });
    let lowest = Infinity;
    for (let i = 0; i < p.length / 4; i++) lowest = Math.min(lowest, p[i * 4 + 1]!);
    process.stderr.write(`skirt: worst penetration ${(worst.max * 1000).toFixed(1)} mm (${(worst.fraction * 100).toFixed(1)}% of particles), max stretch ${worstStretch.toFixed(3)}, hem low point ${lowest.toFixed(2)} m\n`);
    {
      // Where is the worst stretch?
      let w = 0, at = '';
      for (const c of scene.skirt.constraints) {
        if ((c.compliance ?? 0) > 1e-6 || c.kind === 'max') continue;
        const d = Math.hypot(p[c.i * 4]! - p[c.j * 4]!, p[c.i * 4 + 1]! - p[c.j * 4 + 1]!, p[c.i * 4 + 2]! - p[c.j * 4 + 2]!) / c.rest;
        if (d > w) { w = d; at = `row ${Math.floor(c.i / scene.skirt.columns)}-${Math.floor(c.j / scene.skirt.columns)} col ${c.i % scene.skirt.columns}-${c.j % scene.skirt.columns}`; }
      }
      process.stderr.write(`final worst stretch ${w.toFixed(3)} at ${at} of ${scene.skirt.rows} rows\n`);
    }
    expect(worst.max).toBeLessThan(0.01);
    expect(worst.fraction).toBeLessThan(0.01);
    expect(worstStretch).toBeLessThan(1.1);
    // It hangs (gravity) but doesn't fall off.
    expect(lowest).toBeGreaterThan(0.3);
    expect(lowest).toBeLessThan(0.6);
    scene.destroy();
  });
});
