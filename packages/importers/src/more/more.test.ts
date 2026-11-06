import { describe, expect, it } from 'vitest';
import { detectRig } from '@poser/rig';
import { parseOff } from './off';

describe('more formats', () => {
  it('reads OFF meshes, with counts on the header line and face colours', () => {
    const g = parseOff('OFF 4 2 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n3 0 1 2 255 0 0\n3 0 2 3\n');
    expect(g.attributes.position!.count).toBe(4);
    expect(g.index!.count).toBe(6);
    const quad = parseOff('# comment\nOFF\n4 1 4\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n');
    expect(quad.index!.count).toBe(6);
  });

  it('knows MMD, XNALara, and Source rigs by their bone names', () => {
    const mmd = ['センター', '下半身', '上半身', '上半身２', '首', '頭', ...['左', '右'].flatMap((s) => ['肩', '腕', 'ひじ', '手首', '足', 'ひざ', '足首'].map((b) => s + b))];
    expect(detectRig(mmd)).toMatchObject({ kind: 'mmd', coverage: 1 });
    const xps = ['root hips', 'spine lower', 'spine middle', 'head neck upper', ...['left', 'right'].flatMap((s) => ['shoulder 2', 'elbow', 'wrist'].map((b) => `arm ${s} ${b}`).concat(['thigh', 'knee', 'ankle'].map((b) => `leg ${s} ${b}`)))];
    expect(detectRig(xps)).toMatchObject({ kind: 'xps', coverage: 1 });
    const valve = ['Pelvis', 'Spine', 'Spine1', 'Head1', ...['L', 'R'].flatMap((s) => ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Calf', 'Foot'].map((b) => `${s}_${b}`))].map((b) => `ValveBiped.Bip01_${b}`);
    expect(detectRig(valve)).toMatchObject({ kind: 'valve', coverage: 1 });
  });
});

/** Writes a little XNALara binary model: two bones, one triangle. */
function xpsFile(opts: { header?: [number, number]; tangents: boolean; variable: boolean }): ArrayBuffer {
  const out: number[] = [];
  const dv = new DataView(new ArrayBuffer(4));
  const u32 = (v: number) => (dv.setUint32(0, v, true), out.push(...new Uint8Array(dv.buffer)));
  const u16 = (v: number) => (dv.setUint16(0, v, true), out.push(...new Uint8Array(dv.buffer).slice(0, 2)));
  const f32 = (v: number) => (dv.setFloat32(0, v, true), out.push(...new Uint8Array(dv.buffer)));
  const str = (s: string) => out.push(s.length, ...new TextEncoder().encode(s));
  if (opts.header) {
    u32(323232);
    u16(opts.header[0]);
    u16(opts.header[1]);
    str('XNAaraL');
    u32(2);
    str('pc');
    str('me');
    str('file');
    u32(0);
    u32(0);
  }
  u32(2);
  str('root hips');
  u16(0xffff);
  [0, 1, 0].forEach(f32);
  str('spine lower');
  u16(0);
  [0, 1.2, 0].forEach(f32);
  u32(1);
  str('1_Body_0.4');
  u32(1);
  u32(1);
  str('body_d.png');
  u32(0);
  u32(3);
  for (const [x, y] of [[0, 1], [1, 1], [0, 2]] as const) {
    [x, y, 0, 0, 0, 1].forEach(f32);
    u32(0xffffffff);
    [0.5, 0.25].forEach(f32);
    if (opts.tangents) [1, 0, 0, 1].forEach(f32);
    if (opts.variable) u16(2);
    const n = opts.variable ? 2 : 4;
    for (let k = 0; k < n; k++) u16(k === 1 && y === 2 ? 1 : 0);
    for (let k = 0; k < n; k++) f32(k === 0 ? (y === 2 ? 0.25 : 1) : k === 1 && y === 2 ? 0.75 : 0);
  }
  u32(1);
  [0, 1, 2].forEach(u32);
  return new Uint8Array(out).buffer;
}

describe('XNALara', () => {
  it('reads binary models of either layout, with and without a header', async () => {
    const { parseXpsBinary, buildXps } = await import('./xps');
    for (const opts of [{ header: [3, 15] as [number, number], tangents: false, variable: true }, { tangents: true, variable: false }, { header: [2, 12] as [number, number], tangents: true, variable: false }]) {
      const m = parseXpsBinary(xpsFile(opts));
      expect(m.bones.map((b) => b.name)).toEqual(['root hips', 'spine lower']);
      expect(m.meshes[0]!.textures).toEqual(['body_d.png']);
      expect(m.meshes[0]!.uvs[1]).toBeCloseTo(0.75);
      expect(m.meshes[0]!.skin[2]!.weights.slice(0, 2)).toEqual([0.25, 0.75]);
      const root = buildXps(m, () => null);
      expect(root.children[0]!.name).toBe('Body');
    }
  });

  it('reads the text form', async () => {
    const { parseXpsAscii } = await import('./xps');
    const m = parseXpsAscii(['1 # bones', 'root hips', '-1', '0 1 0', '1 # meshes', '1_Body', '1', '1', 'body.png', '0', '3', ...[0, 1, 2].flatMap((i) => [`${i} 1 0`, '0 0 1', '255 255 255 255', '0.5 0.5', '0 0 0 0', '1 0 0 0']), '1', '0 1 2'].join('\n'));
    expect(m.meshes[0]!.positions[6]).toBe(2);
    expect(m.meshes[0]!.skin[0]!.weights[0]).toBe(1);
  });
});

describe('Source SMD', () => {
  it('reads the skeleton and skinned triangles, Z-up inches to Y-up metres', async () => {
    const { parseSmd } = await import('./smd');
    const { SkinnedMesh, Vector3 } = await import('three');
    const smd = `version 1
nodes
0 "ValveBiped.Bip01_Pelvis" -1
1 "ValveBiped.Bip01_Spine" 0
end
skeleton
time 0
0 0 0 40 0 0 0
1 0 0 4 0 0 1.5708
end
triangles
body.tga
0 0 0 40 0 0 1 0 0 1 0 1.0
0 1 0 40 0 0 1 1 0
1 0 0 50 0 0 1 0 1 2 0 0.25 1 0.75
end
`;
    const root = parseSmd(smd, () => null);
    let mesh: InstanceType<typeof SkinnedMesh> | undefined;
    root.traverse((o) => (mesh ??= o instanceof SkinnedMesh ? o : undefined));
    const p = mesh!.geometry.attributes.position!;
    expect(p.getY(2)).toBeCloseTo(50 * 0.0254);
    expect(p.getZ(1)).toBeCloseTo(0.0254);
    const spine = mesh!.skeleton.bones[1]!;
    root.updateMatrixWorld(true);
    expect(new Vector3().setFromMatrixPosition(spine.matrixWorld).y).toBeCloseTo(44 * 0.0254);
    expect(mesh!.geometry.attributes.skinWeight!.getY(2)).toBeCloseTo(0.25);
  });
});

describe('Valve materials', () => {
  it('reads a .vmt and decodes DXT1 and BGR888 .vtf images', async () => {
    const { parseVmt, parseVtf } = await import('./vtf');
    expect(parseVmt('"VertexLitGeneric"\n{\n\t"$basetexture" "models/brutal/candles"\n\t"$alphatest" "1"\n}')).toEqual({ base: 'models/brutal/candles', bump: undefined, translucent: true });
    const vtf = (fmt: number, data: number[], w = 4, h = 4) => {
      const b = new Uint8Array(80 + data.length);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, 0x00465456, true);
      dv.setUint16(16, w, true);
      dv.setUint16(18, h, true);
      dv.setUint16(24, 1, true);
      dv.setInt32(52, fmt, true);
      b.set(data, 80);
      return b.buffer;
    };
    // One DXT1 block: colour 0 = pure red, colour 1 = pure blue, all pixels index 0.
    const red = parseVtf(vtf(13, [0x00, 0xf8, 0x1f, 0x00, 0, 0, 0, 0]));
    expect([...red.rgba.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    const bgr = parseVtf(vtf(3, [10, 20, 30], 1, 1));
    expect([...bgr.rgba]).toEqual([30, 20, 10, 255]);
  });
});

describe('Poser', () => {
  const obj = ['v 0 0 0', 'v 0.1 0 0', 'v 0 0.3 0', 'v 0.1 0.3 0', 'v 0 0.6 0', 'v 0.1 0.6 0', 'usemtl Skin', 'g hip', 'f 1 2 4 3', 'g chest', 'f 3 4 6 5'].join('\n');
  const cr2 = `{
version { number 6 }
figureResFile :Runtime:Geometries:Test:test.obj
actor BODY:1 { storageOffset 0 0 0 }
actor hip:1 { storageOffset 0 0 0 }
actor chest:1 { storageOffset 0 0 0 }
actor BODY:1
{
name BODY
}
actor hip:1
{
name hip
parent BODY:1
origin 0 0.25 0
channels
{
targetGeom Taller
{
keys
{
k 0 1
}
deltas
{
numbDeltas 1
d 2 0 0.1 0
}
}
}
}
actor chest:1
{
parent hip:1
origin 0 0.35 0
}
figure
{
material Skin
{
KdColor 1 0 0 1
textureMap NO_MAP
}
}
}`;
  const files = (map: Record<string, string>) => ({ name: 't', read: async (p: string) => (map[p.toLowerCase()] !== undefined ? new Blob([map[p.toLowerCase()]!]) : null) });

  it('builds a figure from its Runtime geometry: actor bones, dial morphs, materials', async () => {
    const { buildPoser, poserPath } = await import('./poser');
    const { SkinnedMesh, Vector3 } = await import('three');
    expect(poserPath(':Runtime:Geometries:Test:test.obj')).toBe('Runtime/Geometries/Test/test.obj');
    expect(poserPath('C:\\Poser\\Runtime\\Textures\\skin.jpg')).toBe('Runtime/Textures/skin.jpg');
    const r = await buildPoser(cr2, 'Test', [files({ 'runtime/geometries/test/test.obj': obj })], async () => null);
    let mesh: InstanceType<typeof SkinnedMesh> | undefined;
    r.root.traverse((o) => (mesh ??= o instanceof SkinnedMesh ? o : undefined));
    expect(mesh!.skeleton.bones.map((b) => b.name)).toEqual(['BODY', 'hip', 'chest']);
    r.root.updateMatrixWorld(true);
    expect(new Vector3().setFromMatrixPosition(mesh!.skeleton.bones[2]!.matrixWorld).y).toBeCloseTo(0.35 * 2.62128);
    const pos = mesh!.geometry.attributes.position!;
    let top = 0;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeCloseTo(0.6 * 2.62128);
    // The hip's "Taller" dial (value 1) moves its third vertex (OBJ vertex 4) up 0.1.
    let raised = 0;
    for (let i = 0; i < pos.count; i++) raised = Math.max(raised, Math.abs(pos.getY(i) - 0.4 * 2.62128) < 1e-4 ? 1 : 0);
    expect(raised).toBe(1);
    expect(((mesh!.material as unknown as { color: { r: number } }[])[0]!).color.r).toBeCloseTo(1);
    // Seam vertices (OBJ 3 and 4) follow hip and chest equally.
    expect(mesh!.geometry.attributes.skinWeight!.getX(2)).toBeCloseTo(0.5);
  });

  it('asks for the Runtime when the geometry is missing, and reads inline prop geometry', async () => {
    const { buildPoser } = await import('./poser');
    const { MissingContentError } = await import('../content');
    await expect(buildPoser(cr2, 'Test', [files({})], async () => null)).rejects.toBeInstanceOf(MissingContentError);
    const pp2 = '{\nprop box:1\n{\ngeomCustom\n{\nnumbVerts 3\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n}\n}\n}';
    const r = await buildPoser(pp2, 'Box', [], async () => null);
    expect(r.root.children[0]!.name).toBe('box');
  });
});

describe('DirectX', () => {
  it('reads frames, a skinned mesh, materials, and UVs from a text .x file', async () => {
    const { parseDirectX } = await import('./directx');
    const { SkinnedMesh } = await import('three');
    const x = `xof 0303txt 0032
template Header { <3D82AB43-62DA-11cf-AB39-0020AF71E433> WORD major; }
Material Red { 1.0;0.0;0.0;1.0;; 10.0; 0;0;0;; 0;0;0;; TextureFilename { "skin.png"; } }
Frame Root {
  FrameTransformMatrix { 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1;; }
  Frame Spine {
    FrameTransformMatrix { 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,1,0,1;; }
  }
  Mesh Body {
    4;
    0;0;0;, 1;0;0;, 1;2;0;, 0;2;0;;
    1;
    4;0,1,2,3;;
    MeshTextureCoords { 4; 0;1;, 1;1;, 1;0;, 0;0;; }
    MeshMaterialList { 1; 1; 0;; { Red } }
    SkinWeights { "Root"; 2; 0,1; 1.0,1.0; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
    SkinWeights { "Spine"; 2; 2,3; 1.0,1.0; 1,0,0,0,0,1,0,0,0,0,1,0,0,-1,0,1;; }
  }
}`;
    const root = parseDirectX(x, () => null);
    let mesh: InstanceType<typeof SkinnedMesh> | undefined;
    root.traverse((o) => (mesh ??= o instanceof SkinnedMesh ? o : undefined));
    expect(mesh!.skeleton.bones.map((b) => b.name)).toEqual(['Root', 'Spine']);
    expect(mesh!.skeleton.bones[1]!.position.y).toBe(1);
    expect(mesh!.geometry.index!.count).toBe(6);
    expect(mesh!.geometry.attributes.skinIndex!.getX(3)).toBe(1);
    expect((mesh!.material as unknown as { name: string }[])[0]!.name).toBe('Red');
    expect(mesh!.geometry.attributes.uv!.getY(0)).toBeCloseTo(0);
  });
});

describe('VRML and X3D', () => {
  it('reads VRML 97 transforms, face sets, DEF/USE, and materials', async () => {
    const { buildVrml, parseVrml } = await import('./vrml');
    const { Mesh } = await import('three');
    const wrl = `#VRML V2.0 utf8
PROTO Thing [ field SFFloat x 1 ] { Group {} }
DEF T Transform {
  translation 0 1 0
  rotation 0 1 0 1.5708
  children [
    DEF S Shape {
      appearance Appearance { material Material { diffuseColor 1 0 0 transparency 0.5 } }
      geometry IndexedFaceSet {
        coord Coordinate { point [ 0 0 0, 1 0 0, 1 1 0, 0 1 0 ] }
        coordIndex [ 0 1 2 3 -1 ]
        solid FALSE
      }
    }
    Transform { translation 2 0 0 children [ USE S ] }
  ]
}
ROUTE A.b TO C.d`;
    const root = buildVrml(parseVrml(wrl), () => null);
    const meshes: InstanceType<typeof Mesh>[] = [];
    root.traverse((o) => o instanceof Mesh && meshes.push(o));
    expect(meshes.length).toBe(2);
    expect(meshes[0]!.geometry).toBe(meshes[1]!.geometry);
    expect(meshes[0]!.geometry.attributes.position!.count).toBe(6);
    const mat = meshes[0]!.material as unknown as { color: { r: number }; opacity: number; side: number };
    expect(mat.color.r).toBeCloseTo(1);
    expect(mat.opacity).toBeCloseTo(0.5);
    expect(mat.side).toBe(2);
    expect(root.children[0]!.position.y).toBe(1);
  });

  it('reads X3D XML', async () => {
    const { buildVrml, parseX3dXml } = await import('./vrml');
    const { Mesh } = await import('three');
    const x3d = `<?xml version="1.0"?><!DOCTYPE X3D><X3D><Scene><Transform translation="0 0 1"><Shape>
      <Appearance><Material diffuseColor="0 1 0"/></Appearance>
      <IndexedTriangleSet index="0 1 2"><Coordinate point="0 0 0 1 0 0 0 1 0"/></IndexedTriangleSet>
    </Shape><Shape><Box size="1 2 3"/></Shape></Transform></Scene></X3D>`;
    const root = buildVrml(parseX3dXml(x3d), () => null);
    const meshes: InstanceType<typeof Mesh>[] = [];
    root.traverse((o) => o instanceof Mesh && meshes.push(o));
    expect(meshes.length).toBe(2);
    expect((meshes[0]!.material as unknown as { color: { g: number } }).color.g).toBeCloseTo(1);
  });
});
