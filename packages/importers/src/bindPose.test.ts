import { describe, expect, it } from 'vitest';
import { Bone, Box3, BufferAttribute, BufferGeometry, Group, Matrix4, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { restoreBindPose } from './bindPose';

/** Like a Mixamo export: an Armature at 0.01 with bones and vertices in centimetres. */
function rig() {
  const armature = new Group();
  armature.scale.setScalar(0.01);
  const hips = new Bone();
  hips.position.set(0, 100, 0);
  const spine = new Bone();
  spine.position.set(0, 50, 0);
  hips.add(spine);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 10, 100, 0, -10, 150, 0, 0, 160, 5]), 3));
  geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geo.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
  armature.add(mesh, hips);
  armature.updateMatrixWorld(true);
  mesh.bind(new Skeleton([hips, spine]));
  return { armature, mesh, hips, spine };
}

/**
 * The way a glTF export like Mixamo's Xbot loads: vertices in metres, bind
 * matrix identity, and inverse bind matrices relative to the 0.01 Armature
 * (so bone × inverse is a ×100 scale).
 */
function gltfStyleRig() {
  const r = rig();
  const pos = r.mesh.geometry.attributes.position!;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) / 100, pos.getY(i) / 100, pos.getZ(i) / 100);
  r.armature.updateMatrixWorld(true);
  const inverses = r.mesh.skeleton.bones.map((bone) => new Matrix4().copy(bone.matrixWorld).invert().multiply(new Matrix4().makeScale(100, 100, 100)));
  r.mesh.bind(new Skeleton(r.mesh.skeleton.bones, inverses), new Matrix4());
  return r;
}

describe('bind pose', () => {
  it('keeps a glTF-style rig its size, where three.js pose() shrinks it', () => {
    for (const make of [rig, gltfStyleRig]) {
      const { armature } = make();
      const before = new Box3().setFromObject(armature, true).getSize(new Vector3()).y;
      expect(before).toBeCloseTo(1.6);
      restoreBindPose(armature);
      expect(new Box3().setFromObject(armature, true).getSize(new Vector3()).y).toBeCloseTo(before);
    }
  });

  it('restores bones under a scaled armature without changing the model size', () => {
    const { armature, mesh, hips, spine } = rig();
    const height = () => new Box3().setFromObject(armature, true).getSize(new Vector3()).y;
    expect(height()).toBeCloseTo(1.6);
    // Saved mid-animation.
    spine.rotation.z = 1;
    hips.position.y = 80;
    armature.updateMatrixWorld(true);
    expect(height()).not.toBeCloseTo(1.6);
    restoreBindPose(armature);
    expect(height()).toBeCloseTo(1.6);
    expect(hips.scale.x).toBeCloseTo(1);
    expect(new Vector3().setFromMatrixPosition(spine.matrixWorld).y).toBeCloseTo(1.5);
    expect(mesh.skeleton.bones).toHaveLength(2);
  });
});
