import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_BONES } from '@poser/rig';
import { applyLimits, BUILTIN_POSES } from '@poser/posing';
import { SkinnedMesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BASE_FIGURES, baseFigureRig } from './baseFigures';
import { ImportedFigure } from './imported';
import { collectTriangles, measureBody } from './measure';

const glb = (file: string) => {
  const b = readFileSync(join(__dirname, '../../../../apps/web/public/builtin', file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('base figures', () => {
  for (const [id, meta] of Object.entries(BASE_FIGURES)) {
    it(`${id} loads on the canonical rig with human proportions`, async () => {
      const fig = await ImportedFigure.parse(glb(meta.file), baseFigureRig(id));
      const skel = fig.poseSkeleton!;
      // Every non-optional canonical bone is there (glutes and belly aren't on MakeHuman).
      for (const b of CANONICAL_BONES.filter((b) => !/Glute|belly/.test(b.name))) expect(skel.rest[b.name], b.name).toBeDefined();
      const y = (b: string) => skel.rest[b]![1];
      const h = fig.height;
      expect(h).toBeGreaterThan(1.5);
      expect(h).toBeLessThan(1.85);
      // Joint heights as fractions of height (anthropometric averages, generous ranges).
      expect(y('hips') / h).toBeGreaterThan(0.48);
      expect(y('hips') / h).toBeLessThan(0.6);
      expect(y('leftLowerLeg') / h).toBeGreaterThan(0.24);
      expect(y('leftLowerLeg') / h).toBeLessThan(0.32);
      expect(y('leftFoot') / h).toBeLessThan(0.07);
      expect(y('head') / h).toBeGreaterThan(0.84);
      expect(y('leftUpperArm') / h).toBeGreaterThan(0.76);
      // Left is +X, and the rest pose is the canonical T-pose after correction.
      expect(skel.rest.leftHand![0]).toBeGreaterThan(0.5);
      expect(Math.abs(skel.rest.leftHand![1] - y('leftUpperArm'))).toBeLessThan(0.05);
      // Every vertex is weighted.
      fig.root.traverse((o) => {
        if (!(o instanceof SkinnedMesh)) return;
        const w = o.geometry.attributes.skinWeight!;
        for (let i = 0; i < w.count; i++) expect(Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1)).toBeLessThan(1e-3);
      });
      // Morphs move the body.
      fig.applyPose({});
      const before = measureBody(collectTriangles(fig.root), skel.rest as Record<string, [number, number, number]>);
      fig.setMorphs({ Heavier: 1 });
      const after = measureBody(collectTriangles(fig.root), skel.rest as Record<string, [number, number, number]>);
      expect(after.waist).toBeGreaterThan(before.waist + 0.05);
      fig.setMorphs({});
      // Built-in poses apply without errors.
      for (const p of BUILTIN_POSES) fig.applyPose(applyLimits(skel, p.pose).pose);
    });
  }
});
