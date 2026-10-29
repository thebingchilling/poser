import { testDevice, writeSnapshot, xyz } from '@poser/xpbd/testing';
import { describe, expect, it } from 'vitest';
import { ChannelScene } from './channel';

const device = await testDevice();
// Slow on a software GPU (minutes); fast on real hardware.
const gpu = device ? describe : describe.skip;
const log = (s: string) => process.stderr.write(s + '\n');

gpu('prototype 6: soft toy in a soft-body channel', () => {
  it('follows the curved channel, opens it within the stretch limit, stays stable, and the channel closes after', async () => {
    const scene = new ChannelScene(device!);
    let worstStretch = 0;
    let worstPen = 0;
    let finite = true;
    const dt = 1 / 60;
    // Insert to 11 cm over 2 s, hold 0.5 s, withdraw over 1.5 s, then let it rest.
    const plan: [number, number][] = [];
    for (let f = 0; f < 120; f++) plan.push([f, -0.02 + (0.13 * (f + 1)) / 120]);
    for (let f = 0; f < 30; f++) plan.push([0, 0.11]);
    let deepest = { offset: 0, along: 0 };
    for (const [, depth] of plan) {
      scene.setDepth(depth);
      scene.step(dt);
    }
    let p = await scene.solver.readPositions();
    deepest = scene.tipOffset(p);
    const openAtDepth = scene.meanOpening(p);
    worstStretch = Math.max(worstStretch, scene.maxCircumferenceStretch(p));
    const worstLink = scene.maxRingStretch(p);
    worstPen = Math.max(worstPen, scene.wallPenetration(p));
    finite &&= p.every(Number.isFinite);
    await writeSnapshot('channel', {
      camera: [0.22, 0.6, -0.02],
      target: [0, 0.52, -0.07],
      spheres: [
        ...Array.from({ length: scene.toyCount }, (_, i) => ({ p: xyz(p).slice(i * 3, i * 3 + 3), r: scene.toyRadius, color: 0x7a3fa0 })),
        ...Array.from({ length: scene.rings * scene.around }, (_, k) => ({ p: xyz(p).slice((scene.toyCount + k) * 3, (scene.toyCount + k) * 3 + 3), r: 0.0025, color: 0xc98a8a })),
      ],
    });
    for (let f = 0; f < 90; f++) {
      scene.setDepth(0.11 - (0.15 * (f + 1)) / 90);
      scene.step(dt);
    }
    for (let f = 0; f < 60; f++) scene.step(dt);
    p = await scene.solver.readPositions();
    finite &&= p.every(Number.isFinite);
    const openAfter = scene.meanOpening(p);
    log(`channel: tip ${(deepest.along * 100).toFixed(1)} cm along the curve, ${(deepest.offset * 1000).toFixed(1)} mm off the centre line; opening at depth ${openAtDepth.toFixed(2)}x, after ${openAfter.toFixed(2)}x; max ring stretch ${worstStretch.toFixed(2)} (limit ${scene.maxStretch}; worst single link ${worstLink.toFixed(2)}); wall overlap into toy ${(worstPen * 1000).toFixed(1)} mm`);
    expect(finite).toBe(true);
    // The tip went deep and followed the bend (it would leave the curve if it went straight).
    expect(deepest.along).toBeGreaterThan(0.08);
    expect(deepest.offset).toBeLessThan(0.008);
    expect(openAtDepth).toBeGreaterThan(1.5);
    expect(worstStretch).toBeLessThan(scene.maxStretch * 1.05);
    expect(worstPen).toBeLessThan(0.004);
    // Tissue closes back toward rest once the toy is out.
    expect(openAfter).toBeLessThan(1.5);
    scene.destroy();
  }, 600_000);
});
