import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import type { ContentSource } from '../content';
import { MissingContentError } from '../content';
import { library } from '../daz/testLibrary';
import { zipSync } from 'fflate';
import { VamFiles, buildVamLook, parseLook, parseVarMeta, parseVmb, vamPath } from './vam';

const look = {
  storables: [
    {
      id: 'geometry',
      character: 'Female 3',
      clothing: [{ id: 'Author:Dress', enabled: 'true' }, { id: 'Author:Hat', enabled: 'false' }],
      hair: [{ id: 'Author:Bob', enabled: 'true' }],
      morphs: [
        { uid: 'Author.Pack.2:/Custom/Atom/Person/Morphs/female/Author/Lift.vmi', name: 'Lift', value: '0.5' },
        { uid: 'Breast Size', name: 'Breast Size', value: '0.3' },
        { uid: 'Unused', value: '0' },
      ],
    },
    { id: 'textures', faceDiffuseUrl: 'SELF:/Custom/Atom/Person/Textures/face.jpg', torsoDiffuseUrl: '' },
  ],
};

/** A .vmb: count, then (vertex, x, y, z) records. */
function vmb(deltas: [number, number, number, number][]): ArrayBuffer {
  const b = new ArrayBuffer(4 + deltas.length * 16);
  const dv = new DataView(b);
  dv.setInt32(0, deltas.length, true);
  deltas.forEach(([v, x, y, z], i) => {
    dv.setInt32(4 + i * 16, v, true);
    dv.setFloat32(8 + i * 16, x, true);
    dv.setFloat32(12 + i * 16, y, true);
    dv.setFloat32(16 + i * 16, z, true);
  });
  return b;
}

describe('VaM import', () => {
  it('reads package metadata', () => {
    const m = parseVarMeta(JSON.stringify({ creatorName: 'Author', packageName: 'Pack', licenseType: 'CC BY', dependencies: { 'Other.Thing.latest': {} } }));
    expect(m).toEqual({ creator: 'Author', packageName: 'Pack', license: 'CC BY', dependencies: ['Other.Thing.latest'] });
  });

  it('reads looks from presets and scenes', () => {
    const a = parseLook(JSON.stringify(look));
    expect(a.character).toBe('Female 3');
    expect(a.male).toBe(false);
    expect(a.clothing).toEqual(['Author:Dress']);
    expect(a.hair).toEqual(['Author:Bob']);
    expect(a.morphs.map((m) => m.value)).toEqual([0.5, 0.3]);
    expect(a.textures).toEqual({ faceDiffuse: 'SELF:/Custom/Atom/Person/Textures/face.jpg' });
    const scene = parseLook(JSON.stringify({ atoms: [{ type: 'Empty' }, { type: 'Person', storables: [{ id: 'geometry', character: 'Male 1' }] }] }));
    expect(scene.male).toBe(true);
    expect(vamPath('Author.Pack.2:/Custom/x.vmi')).toBe('Custom/x.vmi');
  });

  it('reads morph deltas and rejects a layout that does not match', () => {
    const d = parseVmb(vmb([[3, 0.01, 0.02, 0]]), 1)!;
    expect(d[0]!.vertex).toBe(3);
    expect(d[0]!.delta[0]).toBeCloseTo(-1);
    expect(d[0]!.delta[1]).toBeCloseTo(2);
    expect(parseVmb(vmb([[3, 0, 0, 0]]), 2)).toBeNull();
    expect(parseVmb(new ArrayBuffer(7))).toBeNull();
  });

  it('builds a look on the Genesis 2 body from the Daz library', async () => {
    // The synthetic Daz figure stands in for Genesis 2 Female.
    const files = library();
    const fig = JSON.parse(JSON.stringify(files['data/Test Lib/Figure/Fig.dsf']).replace(/"#?Fig"/g, (m) => m.replace('Fig', 'Genesis2Female')).replace(/#Fig"/g, '#Genesis2Female"'));
    const blobs = new Map<string, Blob>([
      ['data/daz 3d/genesis 2/female/genesis2female.dsf', new Blob([JSON.stringify(fig)])],
      ['data/test lib/figure/uv.dsf', new Blob([JSON.stringify(files['data/Test Lib/Figure/UV.dsf'])])],
      ['custom/atom/person/morphs/female/author/lift.vmi', new Blob([JSON.stringify({ numDeltas: 4 })])],
      ['custom/atom/person/morphs/female/author/lift.vmb', new Blob([vmb([12, 13, 14, 15].map((v) => [v, 0, 0.1, 0]))])],
    ]);
    const src: ContentSource = { name: 'test', read: async (p) => blobs.get(p.toLowerCase()) ?? null };
    const r = await buildVamLook(parseLook(JSON.stringify(look)), [src]);
    let body: Mesh | undefined;
    r.root.traverse((o) => (body ??= o instanceof Mesh ? o : undefined));
    const pos = body!.geometry.attributes.position!;
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    // 0.1 m × 0.5 = 5 cm on the top ring.
    expect(top).toBeCloseTo(155);
    expect(r.warnings.join(' ')).toMatch(/built-in morphs/);
    expect(r.warnings.join(' ')).toMatch(/clothing and hair can't be read yet \(2 items/);
  });

  it('reads files from other packages in AddonPackages, picking the latest version', async () => {
    const pkg = (text: string) => new Blob([zipSync({ 'Custom/Atom/Person/Textures/face.jpg': new TextEncoder().encode(text) })]);
    const vars = new Map([
      ['AddonPackages/Author.Skins.2.var', pkg('v2')],
      ['AddonPackages/sub/Author.Skins.10.var', pkg('v10')],
    ]);
    const src: ContentSource = {
      name: 'vam',
      read: async (p) => vars.get(p) ?? null,
      list: async (dir, match) => [...vars.keys()].filter((k) => k.startsWith(dir) && match(k.split('/').pop()!)),
    };
    const files = new VamFiles([src]);
    expect(await (await files.read('Author.Skins.2:/Custom/Atom/Person/Textures/face.jpg'))!.text()).toBe('v2');
    expect(await (await files.read('Author.Skins.latest:/Custom/Atom/Person/Textures/face.jpg'))!.text()).toBe('v10');
    expect(await files.read('Author.Missing.1:/Custom/x.jpg')).toBeNull();
  });

  it('asks for the Daz library when Genesis 2 is missing', async () => {
    await expect(buildVamLook(parseLook(JSON.stringify(look)), [{ name: 'empty', read: async () => null }])).rejects.toBeInstanceOf(MissingContentError);
  });
});
