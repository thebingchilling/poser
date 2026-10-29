import { RIG_MAPS } from '@poser/rig';
import { Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { analyseModel, extractBones, guessNormalisation } from './analyse';
import { VirtualFiles, joinPath } from './files';
import { classifyFile } from './formats';

/** A Mixamo-named skeleton, in centimetres, with a skinned box and a morph target. */
function mixamoFigure(scale = 100) {
  const map = RIG_MAPS.mixamo;
  const heights: Record<string, [number, number, number]> = {
    Hips: [0, 1.0, 0], Spine: [0, 0.1, 0], Spine1: [0, 0.12, 0], Spine2: [0, 0.12, 0], Neck: [0, 0.12, 0], Head: [0, 0.1, 0],
    LeftShoulder: [0.05, 0.08, 0], LeftArm: [0.1, 0, 0], LeftForeArm: [0.28, 0, 0], LeftHand: [0.25, 0, 0],
    RightShoulder: [-0.05, 0.08, 0], RightArm: [-0.1, 0, 0], RightForeArm: [-0.28, 0, 0], RightHand: [-0.25, 0, 0],
    LeftUpLeg: [0.09, -0.05, 0], LeftLeg: [0, -0.43, 0], LeftFoot: [0, -0.42, 0], LeftToeBase: [0, -0.06, 0.12],
    RightUpLeg: [-0.09, -0.05, 0], RightLeg: [0, -0.43, 0], RightFoot: [0, -0.42, 0], RightToeBase: [0, -0.06, 0.12],
  };
  const parents: Record<string, string | null> = {
    Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
    LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
    RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
    LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
    RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
  };
  void map;
  const bones = new Map<string, Bone>();
  for (const [name, off] of Object.entries(heights)) {
    const b = new Bone();
    b.name = 'mixamorig:' + name;
    b.position.set(off[0] * scale, off[1] * scale, off[2] * scale);
    bones.set(name, b);
  }
  for (const [name, parent] of Object.entries(parents)) if (parent) bones.get(parent)!.add(bones.get(name)!);
  const geo = new BoxGeometry(0.4 * scale, 1.7 * scale, 0.25 * scale);
  geo.translate(0, 0.85 * scale, 0);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  geo.morphAttributes.position = [new Float32BufferAttribute(new Float32Array(n * 3), 3)];
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
  mesh.morphTargetDictionary = { Smile: 0 };
  const root = new Group();
  root.add(bones.get('Hips')!, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([...bones.values()]));
  return root;
}

describe('virtual files', () => {
  it('resolves relative and misplaced texture paths', () => {
    const vfs = new VirtualFiles();
    vfs.add('model/figure.fbx', new Blob(['x']));
    vfs.add('model/textures/skin.png', new Blob(['y']));
    expect(vfs.resolve('textures/skin.png', 'model/figure.fbx')).toBe('model/textures/skin.png');
    // An absolute path from the author's machine still finds the file by name.
    expect(vfs.resolve('C:\\Users\\artist\\Textures\\skin.png', 'model/figure.fbx')).toBe('model/textures/skin.png');
    expect(joinPath('a/b/', '../c.png')).toBe('a/c.png');
  });

  it('classifies formats', () => {
    expect(classifyFile('A.FBX')).toEqual({ kind: 'model', format: 'fbx' });
    expect(classifyFile('run.bvh')).toEqual({ kind: 'pose', format: 'bvh' });
    expect(classifyFile('t.png').kind).toBe('image');
    expect(classifyFile('notes.txt').kind).toBe('other');
  });
});

describe('model analysis', () => {
  it('recognises a centimetre Mixamo figure, scales it to metres, and finds its rig and morphs', () => {
    const a = analyseModel(mixamoFigure(100), 'fbx');
    expect(a.kind).toBe('figure');
    expect(a.rig?.kind).toBe('mixamo');
    expect(a.normalisation.scale).toBe(0.01);
    expect(a.size[1]).toBeCloseTo(1.7, 2);
    expect(a.morphs).toEqual(['Smile']);
    // Bones come out in metres in the bind pose.
    const hips = a.bones.find((b) => b.name === 'mixamorig:Hips')!;
    expect(hips.position[1]).toBeCloseTo(1.0, 3);
    const hand = a.bones.find((b) => b.name === 'mixamorig:LeftHand')!;
    expect(hand.position[0]).toBeCloseTo(0.25, 3);
  });

  it('keeps metre-scale glTF as is and treats rigless meshes as props', () => {
    expect(guessNormalisation([0.5, 1.7, 0.3], { format: 'glb', isFigure: true }).scale).toBe(1);
    const prop = new Group();
    prop.add(new Mesh(new BoxGeometry(45, 90, 45)));
    const a = analyseModel(prop, 'obj');
    expect(a.kind).toBe('prop');
    expect(a.normalisation.scale).toBe(0.01);
  });

  it('detects Z-up figures', () => {
    expect(guessNormalisation([50, 30, 170], { format: 'fbx', isFigure: true })).toMatchObject({ upAxis: 'z', scale: 0.01 });
  });

  it('reads the bind pose even if the file was saved mid-animation', () => {
    const root = mixamoFigure(1);
    const arm = root.getObjectByName('mixamorig:LeftArm')!;
    arm.rotation.z = -1; // posed after binding
    root.updateMatrixWorld(true);
    const bones = extractBones(root);
    const fore = bones.find((b) => b.name === 'mixamorig:LeftForeArm')!;
    // Still the bind offset along +X, not the rotated one.
    expect(fore.position[0]).toBeCloseTo(0.28, 4);
    expect(fore.position[1]).toBeCloseTo(0, 4);
    const armBone = bones.find((b) => b.name === 'mixamorig:LeftArm')!;
    expect(Math.abs(armBone.rotation[3])).toBeCloseTo(1, 4);
  });
});
