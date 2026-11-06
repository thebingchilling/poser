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
