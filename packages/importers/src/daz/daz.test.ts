import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { Mesh, SkinnedMesh, Vector3, type Bone } from 'three';
import type { ContentSource } from '../content';
import { buildDaz } from './build';
import { DsonResolver, evaluateFormulas, parseDson, type DsonFile } from './dson';
import { library } from './testLibrary';

/** Library files as a content source, stored gzipped like real DSON (and with different case). */
function source(files: Record<string, DsonFile>): ContentSource {
  const blobs = new Map(Object.entries(files).map(([p, f]) => [p.toLowerCase(), new Blob([gzipSync(new TextEncoder().encode(JSON.stringify(f)))])]));
  return { name: 'test', read: async (p) => blobs.get(p.toLowerCase()) ?? null };
}

async function build() {
  const files = library();
  const resolver = new DsonResolver([source(files)]);
  return buildDaz('People/Test.duf', files['People/Test.duf']!, resolver);
}

describe('Daz import', () => {
  it('reads gzipped and plain DSON', () => {
    const f = { file_version: '0.6.0.0' };
    expect(parseDson(gzipSync(new TextEncoder().encode(JSON.stringify(f))))).toEqual(f);
    expect(parseDson(new TextEncoder().encode(JSON.stringify(f)))).toEqual(f);
  });

  it('evaluates chained formulas', () => {
    const v = evaluateFormulas(
      [
        { output: 'a:#B?value', operations: [{ op: 'push', url: 'a:#A?value' }, { op: 'push', val: 2 }, { op: 'mult' }] },
        { output: 'a:#C?value', operations: [{ op: 'push', url: 'a:#B?value' }, { op: 'push', val: 3 }, { op: 'mult' }] },
        { output: 'a:#D?value', operations: [{ op: 'push', url: 'a:#A?value' }, { op: 'push', val: [0, 0] }, { op: 'push', val: [1, 10] }, { op: 'push', val: 2 }, { op: 'spline_linear' }] },
      ],
      new Map([['A', 0.5]]),
    );
    expect(v.get('B?value')).toBeCloseTo(1);
    expect(v.get('C?value')).toBeCloseTo(3);
    expect(v.get('D?value')).toBeCloseTo(5);
  });

  it('builds the figure with morphs, rigging that follows them, UVs, weights, and materials', async () => {
    const r = await build();
    expect(r.missing).toEqual([]);
    expect(r.figureName).toBe('Test Figure');
    const meshes: Mesh[] = [];
    r.root.traverse((o) => o instanceof Mesh && meshes.push(o));
    const body = meshes.find((m) => m.name === 'Test Figure')! as SkinnedMesh;
    expect(body).toBeInstanceOf(SkinnedMesh);
    const pos = body.geometry.attributes.position!;
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    // Character 1 drives Tall 0.5, which lifts the top ring 10 × 0.5 cm.
    expect(top).toBeCloseTo(155);
    const bones = new Map<string, Bone>();
    r.root.traverse((o) => (o as Bone).isBone && bones.set(o.name, o as Bone));
    r.root.updateMatrixWorld(true);
    const world = (n: string) => new Vector3().setFromMatrixPosition(bones.get(n)!.matrixWorld);
    // ...and moves the abdomen joint 10 × 0.5 cm.
    expect(world('abdomen').y).toBeCloseTo(125);
    // The UV override on polygon 0 splits a vertex.
    expect(pos.count).toBe(17);
    // Scene material overrides the asset's colour.
    const skin = (body.material as Mesh['material'][])[0] as unknown as { color: { r: number; g: number; b: number } };
    expect(skin.color.r).toBeCloseTo(1);
    expect(skin.color.g).toBeCloseTo(0);
    // Posing the abdomen moves only the top ring.
    bones.get('abdomen')!.rotation.z = Math.PI / 2;
    r.root.updateMatrixWorld(true);
    const p = new Vector3();
    const tops: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      body.getVertexPosition(i, p);
      if (pos.getY(i) > 150) tops.push(p.x);
      else expect(p.y).toBeCloseTo(pos.getY(i));
    }
    expect(Math.max(...tops.map(Math.abs))).toBeGreaterThan(20);
  });

  it('binds conforming clothing to the body skeleton and hides grafted polygons', async () => {
    const r = await build();
    const meshes: Mesh[] = [];
    r.root.traverse((o) => o instanceof Mesh && meshes.push(o));
    const body = meshes.find((m) => m.name === 'Test Figure') as SkinnedMesh;
    const shirt = meshes.find((m) => m.name === 'Shirt') as SkinnedMesh;
    expect(shirt.skeleton.bones.some((b) => b === body.skeleton.bones.find((x) => x.name === 'abdomen'))).toBe(true);
    const tail = shirt.skeleton.bones.find((b) => b.name === 'shirtTail')!;
    expect(tail.parent?.name).toBe('hip');
    // The body had 12 quads (24 triangles); polygon 0 is hidden by the graft.
    expect(body.geometry.index!.count / 3).toBe(22);
    const names = new Set<string>();
    r.root.traverse((o) => (o as Bone).isBone && names.add(o.name));
    expect([...names].sort()).toEqual(['Fig', 'abdomen', 'hip', 'shirtTail']);
  });

  it('keeps corrective morphs as pose-driven targets, not baked into the shape', async () => {
    const r = await build();
    let body: SkinnedMesh | undefined;
    r.root.traverse((o) => (body ??= o instanceof SkinnedMesh && o.name === 'Test Figure' ? o : undefined));
    expect(Object.keys(body!.morphTargetDictionary!)).toEqual(['jcm:pJCMAbdomenBend']);
    const stored = body!.userData.dazCorrectives as { drivers: { morph: string; ops: { bone?: string }[] }[]; bones: Record<string, unknown> };
    expect(stored.drivers[0]!.morph).toBe('pJCMAbdomenBend');
    expect(Object.keys(stored.bones)).toEqual(['abdomen']);
    // At rest the corrective is off, so the top ring hasn't moved sideways.
    const pos = body!.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 150) expect(Math.abs(pos.getX(i))).toBeCloseTo(10);
  });

  it('reports missing library files', async () => {
    const files = library();
    delete files['data/Test Lib/Figure/UV.dsf'];
    const r = await buildDaz('People/Test.duf', files['People/Test.duf']!, new DsonResolver([source(files)]));
    expect(r.missing).toEqual(['data/Test Lib/Figure/UV.dsf']);
  });
});
