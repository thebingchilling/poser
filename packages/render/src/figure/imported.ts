import type { AssetRigInfo, CanonicalPose } from '@poser/core';
import { extractBones } from '@poser/importers';
import { PoseSkeleton } from '@poser/posing';
import { Retargeter, qmul, qrot, vadd, type RigMap, type SourceBone, type V3 } from '@poser/rig';
import { Box3, Group, Mesh, Vector3, type Bone, type Material, type Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnatomyLayer } from './mannequin';
import type { PosableFigure } from './types';

/**
 * An imported figure or prop (PLAN.md section 4): the normalised GLB from
 * the Library, posed through the canonical rig with the Retargeter.
 */
export class ImportedFigure implements PosableFigure {
  readonly root = new Group();
  readonly height: number;
  private readonly retargeter: Retargeter | null = null;
  readonly poseSkeleton: PoseSkeleton | null = null;
  private readonly bones: (Bone | undefined)[] = [];
  private readonly morphMeshes: Mesh[] = [];
  private readonly materials: Material[] = [];

  private constructor(model: Object3D, rig?: AssetRigInfo) {
    this.root.add(model);
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.morphTargetDictionary) this.morphMeshes.push(o);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.push(m);
      }
    });
    const size = new Box3().setFromObject(model, true).getSize(new Vector3());
    this.height = size.y;
    this.root.userData.height = this.height;
    if (rig) {
      // The GLB is stored in its bind pose, so the current bone transforms are the rest pose.
      const sourceBones = extractBones(model);
      this.retargeter = new Retargeter(sourceBones, rig.map as RigMap);
      const byName = new Map<string, Bone>();
      model.traverse((o) => {
        if ((o as Bone).isBone) byName.set(o.name, o as Bone);
      });
      this.bones = sourceBones.map((b) => byName.get(b.name));
      this.poseSkeleton = new PoseSkeleton(canonicalRest(this.retargeter, sourceBones));
    }
  }

  static async load(model: Blob, rig?: AssetRigInfo): Promise<ImportedFigure> {
    const url = URL.createObjectURL(model);
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      return new ImportedFigure(gltf.scene, rig);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  applyPose(pose: CanonicalPose): void {
    if (!this.retargeter) return;
    const local = this.retargeter.apply(pose);
    local.forEach((q, i) => this.bones[i]?.quaternion.set(q[0], q[1], q[2], q[3]));
  }

  setMorphs(values: Record<string, number>): void {
    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary!;
      const infl = mesh.morphTargetInfluences!;
      for (const [name, i] of Object.entries(dict)) infl[i] = values[name] ?? 0;
    }
  }

  setLayerVisible(layer: AnatomyLayer, visible: boolean): void {
    // Imported figures have only their skin until the anatomy layers arrive (Phase 5).
    if (layer === 'skin') this.root.visible = visible;
  }

  setSkinOpacity(opacity: number): void {
    const transparent = opacity < 0.999;
    for (const m of this.materials) {
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = opacity;
      m.depthWrite = !transparent;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/**
 * Joint positions of the figure's corrected T-pose (identity canonical pose),
 * keyed by canonical bone: the rest skeleton posing tools work in.
 */
function canonicalRest(rt: Retargeter, bones: SourceBone[]): Record<string, V3> {
  const local = rt.apply({});
  const wr: [number, number, number, number][] = [];
  const wp: V3[] = [];
  bones.forEach((b, i) => {
    if (b.parent < 0) {
      wr[i] = local[i]!;
      wp[i] = b.position;
    } else {
      wr[i] = qmul(wr[b.parent]!, local[i]!);
      wp[i] = vadd(wp[b.parent]!, qrot(wr[b.parent]!, b.position));
    }
  });
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const out: Record<string, V3> = {};
  for (const [canon, m] of Object.entries(rt.map)) {
    const i = m ? index.get(m.bone) : undefined;
    if (i !== undefined) out[canon] = wp[i]!;
  }
  return out;
}
