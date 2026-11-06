import { Matrix4, SkinnedMesh, type Bone, type Object3D } from 'three';

/** A bone's bind-pose world matrix: the inverse of its inverse bind matrix. */
export function bindWorldMatrix(mesh: SkinnedMesh, index: number): Matrix4 {
  return new Matrix4().copy(mesh.skeleton.boneInverses[index]!).invert();
}

/**
 * Puts every skinned mesh's bones back in their bind pose (models are
 * sometimes saved mid-animation). Unlike three.js's `skeleton.pose()`, each
 * bone's local transform is taken against its real parent: `pose()` treats a
 * root bone whose parent isn't a bone as if that parent were the world, so a
 * scaled Armature (0.01, common in Mixamo and FBX exports) is applied twice
 * and the model comes out a hundred times too small.
 */
export function restoreBindPose(root: Object3D): void {
  root.updateMatrixWorld(true);
  const world = new Map<Bone, Matrix4>();
  root.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    o.skeleton.bones.forEach((b, i) => {
      if (!world.has(b)) world.set(b, bindWorldMatrix(o, i));
    });
  });
  // Parents first, so each bone's local transform is taken against its parent's restored pose.
  const depth = (b: Object3D) => {
    let d = 0;
    for (let p = b.parent; p; p = p.parent) d++;
    return d;
  };
  for (const b of [...world.keys()].sort((a, c) => depth(a) - depth(c))) {
    b.parent?.updateMatrixWorld(true);
    const parentInv = b.parent ? new Matrix4().copy(b.parent.matrixWorld).invert() : new Matrix4();
    new Matrix4().multiplyMatrices(parentInv, world.get(b)!).decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}
