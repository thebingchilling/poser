import { describe, expect, it } from 'vitest';
import { axisAngle, qangle } from '@poser/rig';
import type { ContentSource } from '../content';
import { MissingContentError } from '../content';
import type { DsonFile } from './dson';
import { dazEuler, dazPoseToCanonical, isDazPosePreset, poseChannel } from './pose';

const D = Math.PI / 180;
const p = (x: number, y: number, z: number) => [
  { id: 'x', value: x },
  { id: 'y', value: y },
  { id: 'z', value: z },
];

/** A Genesis-8-named skeleton (left side and spine), arms out to the side. */
const g8: DsonFile = {
  node_library: [
    { id: 'Genesis8Female', type: 'figure' },
    { id: 'hip', type: 'bone', parent: '#Genesis8Female', center_point: p(0, 100, 0) },
    { id: 'pelvis', type: 'bone', parent: '#hip', center_point: p(0, 100, 0) },
    { id: 'abdomenLower', type: 'bone', parent: '#hip', center_point: p(0, 105, 0) },
    { id: 'chestLower', type: 'bone', parent: '#abdomenLower', center_point: p(0, 125, 0) },
    { id: 'neckLower', type: 'bone', parent: '#chestLower', center_point: p(0, 150, 0) },
    { id: 'head', type: 'bone', parent: '#neckLower', center_point: p(0, 160, 0) },
    { id: 'lCollar', type: 'bone', parent: '#chestLower', center_point: p(3, 145, 0) },
    { id: 'lShldrBend', type: 'bone', parent: '#lCollar', center_point: p(17, 145, 0) },
    { id: 'lForearmBend', type: 'bone', parent: '#lShldrBend', center_point: p(45, 145, 0) },
    { id: 'lHand', type: 'bone', parent: '#lForearmBend', center_point: p(70, 145, 0) },
    { id: 'lThighBend', type: 'bone', parent: '#pelvis', center_point: p(10, 95, 0) },
    // A non-zero orientation: the shin's local x axis is the world y axis.
    { id: 'lShin', type: 'bone', parent: '#lThighBend', center_point: p(10, 50, 0), orientation: p(0, 0, 90), rotation_order: 'XYZ' } as never,
    { id: 'lFoot', type: 'bone', parent: '#lShin', center_point: p(10, 8, 0) },
    { id: 'lToe', type: 'bone', parent: '#lFoot', center_point: p(10, 2, 12) },
  ],
};
const library: ContentSource = {
  name: 'daz',
  read: async (path) => (path.toLowerCase() === 'data/daz 3d/genesis 8/female/genesis8female.dsf' ? new Blob([JSON.stringify(g8)]) : null),
};

const preset = (anims: [string, string, number][]): DsonFile => ({
  asset_info: { type: 'preset_pose' },
  scene: { animations: anims.map(([bone, axis, v]) => ({ url: `name://@selection/${bone}:?rotation/${axis}/value`, keys: [[0, v]] })) },
});

describe('Daz pose presets', () => {
  it('recognises presets and their channels', () => {
    expect(isDazPosePreset(preset([['lShin', 'x', 10]]))).toBe(true);
    expect(isDazPosePreset({ scene: { nodes: [{ id: 'a', geometries: [{ url: '#g' }] }] } })).toBe(false);
    expect(poseChannel('name://@selection/lShldrBend:?rotation/z/value')).toEqual({ bone: 'lShldrBend', property: 'rotation', axis: 'z' });
    expect(poseChannel('name://@selection#hip:?translation/y/value')?.property).toBe('translation');
  });

  it('applies Daz rotation orders first axis first', () => {
    const q = dazEuler({ x: 90, y: 90 }, 'XYZ');
    // X first, then Y: the result is Ry · Rx.
    const expected = [axisAngle([0, 1, 0], 90 * D), axisAngle([1, 0, 0], 90 * D)];
    const m = (a: number[], b: number[]) => [a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!, a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!, a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!, a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!] as [number, number, number, number];
    expect(qangle(q, m(expected[0]!, expected[1]!))).toBeLessThan(1e-9);
  });

  it('converts a preset to a canonical pose with the figure from the library', async () => {
    const r = await dazPoseToCanonical(
      preset([
        ['lForearmBend', 'y', -90],
        ['lShin', 'x', 30],
        ['rUnknownBone', 'x', 5],
      ]),
      [library],
    );
    expect(r.figure).toBe('Genesis8Female');
    // Rest directions differ by a few degrees from the canonical rig, so allow ~6°.
    // Elbow: orientation 0, so the local y axis is the world y axis.
    expect(qangle(r.pose.leftLowerArm!, axisAngle([0, 1, 0], -90 * D))).toBeLessThan(0.1);
    // Knee: orientation z 90°, so local x is world y.
    expect(qangle(r.pose.leftLowerLeg!, axisAngle([0, 1, 0], 30 * D))).toBeLessThan(0.1);
    expect(r.warnings.join(' ')).toMatch(/1 joints/);
  });

  it('asks for the Daz library when the figure is missing', async () => {
    await expect(dazPoseToCanonical(preset([['lShin', 'x', 30]]), [])).rejects.toBeInstanceOf(MissingContentError);
  });
});
