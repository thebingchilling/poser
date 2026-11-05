import { describe, expect, it } from 'vitest';
import { Bone, BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three/webgpu';
import { Correctives } from './correctives';

function rig(orientation: [number, number, number]) {
  const root = new Group();
  const bone = new Bone();
  bone.name = 'lShin';
  root.add(bone);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  geo.morphAttributes.position = [Object.assign(new BufferAttribute(new Float32Array(9), 3), { name: 'jcm:knee' })];
  const mesh = new Mesh(geo, new MeshBasicMaterial());
  mesh.updateMorphTargets();
  // As loaded from glTF: a multi-material mesh is a group carrying the data.
  const holder = new Group();
  holder.add(mesh);
  holder.userData.dazCorrectives = {
    bones: { lShin: { orientation, order: 'XYZ' } },
    drivers: [{ morph: 'knee', stage: 'sum', ops: [{ op: 'push', bone: 'lShin', axis: 'x' }, { op: 'push', val: [0, 0] }, { op: 'push', val: [120, 1] }, { op: 'push', val: 2 }, { op: 'spline_linear' }] }],
  };
  root.add(holder);
  return { root, bone, mesh };
}

describe('Daz corrective morphs at pose time', () => {
  it('follows the driving bone through the spline', () => {
    const { root, bone, mesh } = rig([0, 0, 0]);
    const c = new Correctives(root);
    expect(c.active).toBe(true);
    bone.rotation.set(Math.PI / 3, 0, 0);
    c.update();
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5);
    bone.rotation.set(Math.PI, 0, 0);
    c.update();
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(1);
    bone.rotation.set(-0.5, 0, 0);
    c.update();
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0);
  });

  it('measures rotation in the bone’s Daz frame', () => {
    // Orientation z 90°: the bone's x axis is the world y axis.
    const { root, bone, mesh } = rig([0, 0, 90]);
    const c = new Correctives(root);
    bone.rotation.set(0, Math.PI / 3, 0);
    c.update();
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5);
  });
});
