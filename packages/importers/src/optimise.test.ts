import { Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { optimiseGlb } from './optimise';

/** A wavy n×n grid with two morphs (one that moves nothing), duplicated as two meshes sharing nothing. */
async function testGlb(n: number): Promise<ArrayBuffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  for (let m = 0; m < 2; m++) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) pos.push(x / n, Math.sin(x / 4) * Math.cos(y / 5) * 0.02, y / n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = y * (n + 1) + x;
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    const count = pos.length / 3;
    const real = new Float32Array(count * 3).map((_, i) => (i % 3 === 1 ? 0.01 : 0));
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
      .addTarget(doc.createPrimitiveTarget('Nothing').setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(count * 3)).setBuffer(buffer)))
      .addTarget(doc.createPrimitiveTarget('Lift').setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(real).setBuffer(buffer)));
    const mesh = doc.createMesh(`grid${m}`).addPrimitive(prim).setWeights([0, 0]);
    scene.addChild(doc.createNode(`grid${m}`).setMesh(mesh));
  }
  const out = await new WebIO().writeBinary(doc);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

describe('import optimisation', () => {
  it('drops empty morphs and keeps a small model as it is', async () => {
    const { glb, report } = await optimiseGlb(await testGlb(40), 'balanced');
    expect(report.removedMorphs).toEqual(['Nothing', 'Nothing']);
    expect(report.trianglesAfter).toBe(report.trianglesBefore);
    const doc = await new WebIO().readBinary(new Uint8Array(glb));
    const mesh = doc.getRoot().listMeshes()[0]!;
    expect(mesh.listPrimitives()[0]!.listTargets()).toHaveLength(1);
    expect((mesh.getExtras() as { targetNames: string[] }).targetNames).toEqual(['Lift']);
    expect(mesh.getWeights()).toEqual([0]);
  });

  it('simplifies down to the triangle budget, keeping morphs', async () => {
    const { glb, report } = await optimiseGlb(await testGlb(120), 'light', 20_000);
    expect(report.trianglesBefore).toBe(2 * 120 * 120 * 2);
    expect(report.trianglesAfter).toBeLessThanOrEqual(24_000);
    expect(report.trianglesAfter).toBeGreaterThan(5_000);
    expect(report.bytesAfter).toBeLessThan(report.bytesBefore);
    const doc = await new WebIO().readBinary(new Uint8Array(glb));
    expect(doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.listTargets()).toHaveLength(1);
  });
});
