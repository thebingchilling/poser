import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, Skeleton, Bone, SkinnedMesh } from 'three';
import { parseVab, vabGeometry, vajTextures, wrapToBody } from './vab';
import { explainSkipped, classifyFile, importableItems } from '../formats';

/** A .vab with one quad (two materials' worth of names), in metres like VaM writes. */
function vab(): ArrayBuffer {
  const parts: number[] = [];
  const bytes: Uint8Array[] = [];
  const flush = () => {
    if (parts.length) bytes.push(new Uint8Array(new Int32Array(parts.splice(0)).buffer));
  };
  const str = (s: string) => {
    flush();
    const b = new TextEncoder().encode(s);
    bytes.push(Uint8Array.of(b.length), b);
  };
  const f = (...v: number[]) => {
    flush();
    bytes.push(new Uint8Array(new Float32Array(v).buffer));
  };
  for (let i = 0; i < 8; i++) str(`s${i}`);
  parts.push(4);
  f(0.1, 1.0, 0, 0.2, 1.0, 0, 0.2, 1.2, 0, 0.1, 1.2, 0);
  parts.push(2);
  str('Cloth');
  str('Trim');
  parts.push(1, 1, 4, 0, 1, 2, 3); // polygon: material 1, 4 sides
  parts.push(1, 4, 0, 1, 2, 3); // same polygon's UV indices
  parts.push(4);
  f(0, 0, 1, 0, 1, 1, 0, 1);
  flush();
  const total = bytes.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bytes) out.set(b, (o += b.length) - b.length);
  return out.buffer;
}

describe('VaM items', () => {
  it('reads a .vab mesh and scales metres to centimetres', () => {
    const m = parseVab(vab());
    expect(m.materials).toEqual(['Cloth', 'Trim']);
    expect(m.polygons[0]).toEqual({ material: 1, vertices: [0, 1, 2, 3], uvs: [0, 1, 2, 3] });
    const g = vabGeometry(m, true);
    expect(g.index!.count).toBe(6);
    expect(g.attributes.position!.getX(0)).toBeCloseTo(-10);
    expect(g.attributes.position!.getY(2)).toBeCloseTo(120);
    expect(g.groups).toEqual([{ start: 0, count: 6, materialIndex: 1 }]);
  });

  it('rejects files that are not clothing meshes', () => {
    expect(() => parseVab(new Uint8Array([3, 1, 2]).buffer)).toThrow(/couldn’t be read/);
  });

  it('wraps an item onto the nearest body vertices’ weights', () => {
    const bones = [new Bone(), new Bone()];
    bones[0]!.add(bones[1]!);
    const body = new BufferGeometry();
    body.setAttribute('position', new BufferAttribute(new Float32Array([0, 100, 0, 0, 130, 0]), 3));
    body.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]), 4));
    body.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const skinned = new SkinnedMesh(body);
    skinned.add(bones[0]!);
    skinned.bind(new Skeleton(bones));
    const item = wrapToBody(new Mesh(vabGeometry(parseVab(vab()), false)), skinned);
    const si = item.geometry.attributes.skinIndex!;
    expect([si.getX(0), si.getX(2)]).toEqual([0, 1]);
    expect(item.skeleton).toBe(skinned.skeleton);
  });

  it('finds texture paths in item settings', () => {
    const t = vajTextures({ storables: [{ id: 'Cloth', customTexture_MainTex: 'tex/cloth_D.png', customTexture_BumpMap: 'tex/cloth_N.png', other: 3 }] });
    expect(t).toEqual([
      { material: 'Cloth', map: 'diffuse', url: 'tex/cloth_D.png' },
      { material: 'Cloth', map: 'normal', url: 'tex/cloth_N.png' },
    ]);
  });

  it('classifies VaM package files and explains the rest', () => {
    expect(classifyFile('P/Custom/Clothing/Female/A/Dress/Dress.vam')).toEqual({ kind: 'model', format: 'vamitem' });
    expect(classifyFile('P/Custom/Atom/Person/Appearance/Look.vap')).toEqual({ kind: 'model', format: 'vap' });
    expect(classifyFile('P/Custom/Atom/Person/Pose/Sit.vap').kind).toBe('other');
    expect(classifyFile('P/Custom/Clothing/Female/A/Dress/Red.vap').kind).toBe('other');
    expect(classifyFile('P/Saves/Person/appearance/Old.json')).toEqual({ kind: 'model', format: 'vap' });
    const paths = ['P/meta.json', 'P/Custom/Atom/Person/Morphs/female/A/Nose.vmi', 'P/Custom/Atom/Person/Morphs/female/A/Nose.vmb', 'P/Custom/Assets/A/thing.assetbundle', 'P/Custom/Scripts/A/x.cs', 'scene.c4d'];
    expect(importableItems(paths)).toEqual([]);
    const notes = explainSkipped(paths).join('\n');
    expect(notes).toMatch(/2 × VaM morphs/);
    expect(notes).toMatch(/Unity asset bundles/);
    expect(notes).toMatch(/Plugins and scripts/);
    expect(notes).toMatch(/Cinema 4D/);
  });
});
