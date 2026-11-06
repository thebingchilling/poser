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
