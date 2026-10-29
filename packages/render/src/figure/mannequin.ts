import { CANONICAL_BONES, FEMALE_PROPORTIONS, MALE_PROPORTIONS, boneTail, restPose, type BodyProportions } from '@poser/rig';
import { Bone, Group, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import { alignToDirection, ellipsoid, taperedCapsule } from './shapes';
import type { PosableFigure } from './types';
import type { CanonicalPose } from '@poser/core';

/**
 * Built-in placeholder figures. The plan's starter figures are CC0
 * MakeHuman/MPFB exports (PLAN.md section 2); until those are added to
 * assets/builtin/, these procedural artist-mannequin figures stand in. Each
 * body segment is a rigid child of a canonical bone, so they pose with the
 * same rig as imported figures.
 *
 * Each figure also carries a rough placeholder anatomy (PLAN.md section 23,
 * Phase 0): fat and muscle volumes and a simple skeleton nested inside the
 * skin, for the early prototypes. It is deliberately crude; the real
 * anatomy comes from the Phase 5 generator.
 */

export type AnatomyLayer = 'skin' | 'fat' | 'muscle' | 'skeleton';
export const ANATOMY_LAYERS: readonly AnatomyLayer[] = ['skin', 'fat', 'muscle', 'skeleton'];

export type BuiltinFigureId = 'builtin:female' | 'builtin:male';

export const BUILTIN_FIGURES: Record<BuiltinFigureId, { name: string; proportions: BodyProportions; sex: 'female' | 'male' }> = {
  'builtin:female': { name: 'Female figure', proportions: FEMALE_PROPORTIONS, sex: 'female' },
  'builtin:male': { name: 'Male figure', proportions: MALE_PROPORTIONS, sex: 'male' },
};

interface SegmentSpec {
  /** Radius at the bone head and tail (width, metres). */
  r0: number;
  r1: number;
  depth?: number;
  bulge?: number;
  bulgeAt?: number;
  startCap?: number;
}

function segmentSpecs(sex: 'female' | 'male', p: BodyProportions): Record<string, SegmentSpec | null> {
  const f = sex === 'female';
  const k = p.height / 1.68;
  const s = (r: number) => r * k;
  const specs: Record<string, SegmentSpec | null> = {
    hips: { r0: s(f ? 0.165 : 0.15), r1: s(f ? 0.13 : 0.14), depth: 0.72, startCap: 0.5 },
    spine: { r0: s(f ? 0.12 : 0.135), r1: s(f ? 0.135 : 0.15), depth: 0.75 },
    chest: { r0: s(f ? 0.135 : 0.155), r1: s(f ? 0.14 : 0.165), depth: 0.72 },
    upperChest: { r0: s(f ? 0.14 : 0.165), r1: s(0.07), depth: 0.65 },
    neck: { r0: s(f ? 0.046 : 0.055), r1: s(f ? 0.042 : 0.05), depth: 1 },
    head: null, // ellipsoid below
    jaw: null,
    belly: null,
  };
  for (const side of ['left', 'right']) {
    const n = (b: string) => side + b;
    specs[n('Shoulder')] = { r0: s(0.05), r1: s(f ? 0.05 : 0.06), depth: 0.9 };
    specs[n('UpperArm')] = { r0: s(f ? 0.043 : 0.052), r1: s(f ? 0.034 : 0.04), bulge: s(f ? 0.004 : 0.01), bulgeAt: 0.35 };
    specs[n('LowerArm')] = { r0: s(f ? 0.036 : 0.042), r1: s(f ? 0.024 : 0.028), bulge: s(0.006), bulgeAt: 0.25, depth: 0.85 };
    specs[n('Hand')] = { r0: s(0.024), r1: s(0.028), depth: 0.45 };
    specs[n('UpperLeg')] = { r0: s(f ? 0.088 : 0.085), r1: s(f ? 0.053 : 0.055), bulge: s(f ? 0.006 : 0.004), bulgeAt: 0.25 };
    specs[n('LowerLeg')] = { r0: s(f ? 0.05 : 0.054), r1: s(f ? 0.03 : 0.033), bulge: s(f ? 0.01 : 0.012), bulgeAt: 0.25, depth: 0.95 };
    specs[n('Foot')] = { r0: s(0.032), r1: s(0.03), depth: 0.65 };
    specs[n('Toes')] = { r0: s(0.026), r1: s(0.02), depth: 0.55 };
    specs[n('Eye')] = null;
    specs[n('Breast')] = null;
    specs[n('Glute')] = null;
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
      const base = finger === 'Thumb' ? 0.011 : finger === 'Little' ? 0.0075 : 0.0088;
      for (const [i, seg] of (finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']).entries()) {
        const r = s(base * (1 - i * 0.1) * (f ? 0.92 : 1));
        specs[n(finger + seg)] = { r0: r, r1: r * 0.92, depth: 0.85 };
      }
    }
  }
  return specs;
}

interface LayerMaterials {
  skin: MeshStandardMaterial;
  fat: MeshStandardMaterial;
  muscle: MeshStandardMaterial;
  skeleton: MeshStandardMaterial;
}

function createMaterials(sex: 'female' | 'male'): LayerMaterials {
  return {
    skin: new MeshStandardMaterial({ color: sex === 'female' ? 0xd9b49c : 0xc9a58a, roughness: 0.62, metalness: 0 }),
    fat: new MeshStandardMaterial({ color: 0xe9cd7a, roughness: 0.5 }),
    muscle: new MeshStandardMaterial({ color: 0xa8403c, roughness: 0.55 }),
    skeleton: new MeshStandardMaterial({ color: 0xe8e1cc, roughness: 0.7 }),
  };
}

/** Inner layers are the skin shape shrunk toward the bone axis. */
const LAYER_SCALE: Record<Exclude<AnatomyLayer, 'skeleton'>, number> = { skin: 1, fat: 0.94, muscle: 0.8 };

export class FigureObject implements PosableFigure {
  readonly root = new Group();
  readonly bones = new Map<string, Bone>();
  private readonly layers = new Map<AnatomyLayer, Mesh[]>();
  private readonly materials: LayerMaterials;
  readonly height: number;

  constructor(readonly builtinId: BuiltinFigureId) {
    const def = BUILTIN_FIGURES[builtinId];
    this.height = def.proportions.height;
    this.root.userData.height = this.height;
    this.materials = createMaterials(def.sex);
    for (const layer of ANATOMY_LAYERS) this.layers.set(layer, []);
    this.build(def.proportions, def.sex);
    this.setLayerVisible('fat', false);
    this.setLayerVisible('muscle', false);
    this.setLayerVisible('skeleton', false);
  }

  private add(boneName: string, layer: AnatomyLayer, geo: BufferGeometry, castShadow = true): void {
    const bone = this.bones.get(boneName)!;
    const mesh = new Mesh(geo, this.materials[layer]);
    mesh.castShadow = castShadow && layer === 'skin';
    mesh.receiveShadow = layer === 'skin';
    mesh.userData.layer = layer;
    mesh.userData.bone = boneName;
    bone.add(mesh);
    this.layers.get(layer)!.push(mesh);
  }

  private build(p: BodyProportions, sex: 'female' | 'male'): void {
    const pose = restPose(p);
    // Bones: positioned relative to their parent, identity rotation in rest.
    for (const def of CANONICAL_BONES) {
      const bone = new Bone();
      bone.name = def.name;
      const head = pose[def.name]!;
      const parentHead: [number, number, number] = def.parent ? pose[def.parent]! : [0, 0, 0];
      bone.position.set(head[0] - parentHead[0], head[1] - parentHead[1], head[2] - parentHead[2]);
      this.bones.set(def.name, bone);
      (def.parent ? this.bones.get(def.parent)! : this.root).add(bone);
    }

    const specs = segmentSpecs(sex, p);
    const k = p.height / 1.68;
    for (const [name, spec] of Object.entries(specs)) {
      if (!spec) continue;
      const head = new Vector3(...pose[name]!);
      const dir = new Vector3(...boneTail(pose, name)).sub(head);
      const len = dir.length();
      for (const layer of ['skin', 'fat', 'muscle'] as const) {
        const sc = LAYER_SCALE[layer];
        const geo = taperedCapsule(spec.r0 * sc, spec.r1 * sc, len, {
          depthRatio: spec.depth ?? 1,
          bulge: (spec.bulge ?? 0) * sc,
          bulgeAt: spec.bulgeAt ?? 0.4,
          startCap: spec.startCap ?? 1,
          flatAxis: /Hand|Thumb|Index|Middle|Ring|Little/.test(name) ? 'x' : 'z',
        });
        this.add(name, layer, alignToDirection(geo, dir));
      }
      // Skeleton: a thin rod per bone.
      if (!/Breast|Glute|belly|Eye|jaw/.test(name)) {
        const r = Math.max(0.005, Math.min(spec.r0, spec.r1) * (name.startsWith('hips') || /spine|chest/i.test(name) ? 0.18 : 0.32));
        this.add(name, 'skeleton', alignToDirection(taperedCapsule(r, r * 0.9, len, { radial: 10 }), dir), false);
      }
    }

    // Head and face volumes.
    const head = (rx: number, ry: number, rz: number, y: number, z = 0) => {
      const g = ellipsoid(rx * k, ry * k, rz * k);
      g.translate(0, y * k, z * k);
      return g;
    };
    const fh = sex === 'female';
    for (const layer of ['skin', 'fat', 'muscle'] as const) {
      const sc = LAYER_SCALE[layer];
      this.add('head', layer, head(0.076 * sc, 0.1 * sc, 0.094 * sc, 0.115, 0.01));
      this.add('jaw', layer, head((fh ? 0.047 : 0.054) * sc, 0.038 * sc, 0.05 * sc, 0.006, 0.03));
    }
    this.add('head', 'skeleton', head(0.068, 0.088, 0.086, 0.12, 0.005), false);
    for (const side of ['left', 'right'] as const) {
      const eye = ellipsoid(0.012 * k, 0.012 * k, 0.012 * k, 12);
      const eyeMesh = new Mesh(eye, new MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.2 }));
      this.bones.get(side + 'Eye')!.add(eyeMesh);
    }

    // Pelvis and ribcage bones for the skeleton layer.
    const pelvis = ellipsoid(0.11 * k * (fh ? 1.06 : 1), 0.065 * k, 0.065 * k, 16);
    pelvis.translate(0, -0.04 * k, 0);
    this.add('hips', 'skeleton', pelvis, false);
    const ribs = ellipsoid(0.095 * k, 0.13 * k, 0.07 * k, 16);
    ribs.translate(0, 0.04 * k, 0);
    this.add('chest', 'skeleton', ribs, false);

    // Soft-tissue volumes on their helper bones.
    for (const side of ['left', 'right'] as const) {
      const x = side === 'left' ? 1 : -1;
      if (p.breastSize > 0) {
        const size = p.breastSize;
        for (const layer of ['skin', 'fat'] as const) {
          const sc = layer === 'skin' ? 1 : 0.85;
          // Wider than deep, sitting low on the chest wall and turned slightly outward.
          const g = ellipsoid(0.066 * k * size * sc, 0.064 * k * size * sc, 0.05 * k * size * sc);
          g.rotateY(x * 0.25);
          g.rotateX(0.15);
          g.translate(x * 0.006 * k, -0.02 * k, -0.018 * k);
          this.add(side + 'Breast', layer, g);
        }
      }
      for (const layer of ['skin', 'fat', 'muscle'] as const) {
        const sc = LAYER_SCALE[layer];
        const g = ellipsoid((fh ? 0.078 : 0.07) * k * sc, (fh ? 0.085 : 0.075) * k * sc, (fh ? 0.065 : 0.055) * k * sc);
        g.translate(0, 0, 0.015 * k);
        this.add(side + 'Glute', layer, g);
      }
    }
    for (const layer of ['skin', 'fat'] as const) {
      const sc = LAYER_SCALE[layer];
      const g = ellipsoid(0.105 * k * sc, 0.08 * k * sc, 0.05 * k * sc);
      g.translate(0, 0, -0.03 * k);
      this.add('belly', layer, g);
    }

    this.root.updateMatrixWorld(true);
  }

  /** The mannequin's bones are the canonical bones with identity rest, so a pose applies directly. */
  applyPose(pose: CanonicalPose): void {
    for (const [name, bone] of this.bones) {
      const q = pose[name];
      if (q) bone.quaternion.set(q[0], q[1], q[2], q[3]);
      else bone.quaternion.identity();
    }
  }

  setMorphs(): void {}

  setLayerVisible(layer: AnatomyLayer, visible: boolean): void {
    for (const mesh of this.layers.get(layer) ?? []) mesh.visible = visible;
  }

  /** 1 = opaque skin; lower values reveal the layers underneath. */
  setSkinOpacity(opacity: number): void {
    const m = this.materials.skin;
    const transparent = opacity < 0.999;
    if (m.transparent !== transparent) m.needsUpdate = true;
    m.transparent = transparent;
    m.opacity = opacity;
    m.depthWrite = !transparent;
    for (const mesh of this.layers.get('skin') ?? []) mesh.castShadow = !transparent;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }
}
