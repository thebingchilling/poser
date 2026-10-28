/**
 * The canonical skeleton (PLAN.md section 5): the VRM humanoid bone set plus
 * optional soft-tissue bones. Every imported rig maps onto these names.
 */

export const SIDES = ['left', 'right'] as const;
export type Side = (typeof SIDES)[number];

const FINGERS = {
  Thumb: ['Metacarpal', 'Proximal', 'Distal'],
  Index: ['Proximal', 'Intermediate', 'Distal'],
  Middle: ['Proximal', 'Intermediate', 'Distal'],
  Ring: ['Proximal', 'Intermediate', 'Distal'],
  Little: ['Proximal', 'Intermediate', 'Distal'],
} as const;

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Required in VRM's humanoid spec. Optional bones may be absent on imported rigs. */
  required: boolean;
  /** Soft-tissue helper bone (breasts, glutes, belly), not part of VRM. */
  softTissue?: boolean;
}

function sided(side: Side, name: string): string {
  return side + name;
}

function buildBones(): BoneDef[] {
  const bones: BoneDef[] = [
    { name: 'hips', parent: null, required: true },
    { name: 'spine', parent: 'hips', required: true },
    { name: 'chest', parent: 'spine', required: true },
    { name: 'upperChest', parent: 'chest', required: false },
    { name: 'neck', parent: 'upperChest', required: false },
    { name: 'head', parent: 'neck', required: true },
    { name: 'jaw', parent: 'head', required: false },
    { name: 'belly', parent: 'spine', required: false, softTissue: true },
  ];
  for (const side of SIDES) {
    const s = (n: string) => sided(side, n);
    bones.push(
      { name: s('Eye'), parent: 'head', required: false },
      { name: s('Breast'), parent: 'upperChest', required: false, softTissue: true },
      { name: s('Glute'), parent: 'hips', required: false, softTissue: true },
      { name: s('Shoulder'), parent: 'upperChest', required: false },
      { name: s('UpperArm'), parent: s('Shoulder'), required: true },
      { name: s('LowerArm'), parent: s('UpperArm'), required: true },
      { name: s('Hand'), parent: s('LowerArm'), required: true },
      { name: s('UpperLeg'), parent: 'hips', required: true },
      { name: s('LowerLeg'), parent: s('UpperLeg'), required: true },
      { name: s('Foot'), parent: s('LowerLeg'), required: true },
      { name: s('Toes'), parent: s('Foot'), required: false },
    );
    for (const [finger, segments] of Object.entries(FINGERS)) {
      let parent = s('Hand');
      for (const segment of segments) {
        const name = s(finger + segment);
        bones.push({ name, parent, required: false });
        parent = name;
      }
    }
  }
  return bones;
}

export const CANONICAL_BONES: readonly BoneDef[] = buildBones();
export const CANONICAL_BONE_NAMES: readonly string[] = CANONICAL_BONES.map((b) => b.name);
const byName = new Map(CANONICAL_BONES.map((b) => [b.name, b]));

export function getBone(name: string): BoneDef | undefined {
  return byName.get(name);
}

/** Name of the same bone on the other side, or the name itself for centre bones. */
export function mirrorBoneName(name: string): string {
  if (name.startsWith('left')) return 'right' + name.slice(4);
  if (name.startsWith('right')) return 'left' + name.slice(5);
  return name;
}

export function childrenOf(name: string): BoneDef[] {
  return CANONICAL_BONES.filter((b) => b.parent === name);
}
