import { CANONICAL_BONE_NAMES } from './bones';

/**
 * Rig maps (PLAN.md sections 4.3 and 5): how each known source rig's bones
 * map onto the canonical skeleton. A canonical bone maps to one source bone,
 * optionally with twist bones that share its roll (Daz and CC4 split upper
 * arms, forearms, and thighs into bend + twist bones).
 */

export interface BoneMapping {
  bone: string;
  /** Twist helper bones along this bone, receiving its roll. */
  twist?: string[];
}

export type RigMap = Partial<Record<string, BoneMapping>>;

export type RigKind = 'daz-g8' | 'daz-g9' | 'vam' | 'mixamo' | 'cc4' | 'vrm' | 'generic';

export const RIG_LABELS: Record<RigKind, string> = {
  'daz-g8': 'Daz Genesis 8 / 8.1',
  'daz-g9': 'Daz Genesis 9',
  vam: 'Virt-a-Mate (Genesis 2)',
  mixamo: 'Mixamo',
  cc4: 'Character Creator 4',
  vrm: 'VRM',
  generic: 'Other rig (matched by name)',
};

type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const;
const THUMB_SEGS = ['Metacarpal', 'Proximal', 'Distal'] as const;
const FINGER_SEGS = ['Proximal', 'Intermediate', 'Distal'] as const;

/** Builds a map from per-side patterns: `fn(side, prefix)` returns source names. */
function build(centre: RigMap, sided: (s: Side) => RigMap): RigMap {
  const map: RigMap = { ...centre };
  for (const side of SIDES) Object.assign(map, sided(side));
  return map;
}

function fingerMap(side: Side, name: (finger: (typeof FINGERS)[number], index: 1 | 2 | 3) => string): RigMap {
  const out: RigMap = {};
  for (const f of FINGERS) {
    const segs = f === 'Thumb' ? THUMB_SEGS : FINGER_SEGS;
    segs.forEach((seg, i) => (out[side + f + seg] = { bone: name(f, (i + 1) as 1 | 2 | 3) }));
  }
  return out;
}

const DAZ_FINGER: Record<(typeof FINGERS)[number], string> = { Thumb: 'Thumb', Index: 'Index', Middle: 'Mid', Ring: 'Ring', Little: 'Pinky' };

export const RIG_MAPS: Record<Exclude<RigKind, 'generic' | 'vrm'>, RigMap> = {
  'daz-g8': build(
    {
      hips: { bone: 'hip' },
      spine: { bone: 'abdomenLower' },
      chest: { bone: 'chestLower' },
      upperChest: { bone: 'chestUpper' },
      neck: { bone: 'neckLower' },
      head: { bone: 'head' },
      jaw: { bone: 'lowerJaw' },
    },
    (side) => {
      const s = side[0]!;
      return {
        [side + 'Eye']: { bone: `${s}Eye` },
        [side + 'Breast']: { bone: `${s}Pectoral` },
        [side + 'Shoulder']: { bone: `${s}Collar` },
        [side + 'UpperArm']: { bone: `${s}ShldrBend`, twist: [`${s}ShldrTwist`] },
        [side + 'LowerArm']: { bone: `${s}ForearmBend`, twist: [`${s}ForearmTwist`] },
        [side + 'Hand']: { bone: `${s}Hand` },
        [side + 'UpperLeg']: { bone: `${s}ThighBend`, twist: [`${s}ThighTwist`] },
        [side + 'LowerLeg']: { bone: `${s}Shin` },
        [side + 'Foot']: { bone: `${s}Foot` },
        [side + 'Toes']: { bone: `${s}Toe` },
        ...fingerMap(side, (f, i) => `${s}${DAZ_FINGER[f]}${i}`),
      };
    },
  ),
  'daz-g9': build(
    {
      hips: { bone: 'hip' },
      spine: { bone: 'spine1' },
      chest: { bone: 'spine3' },
      upperChest: { bone: 'spine4' },
      neck: { bone: 'neck1' },
      head: { bone: 'head' },
      jaw: { bone: 'lowerjaw' },
    },
    (side) => {
      const s = side[0]!;
      return {
        [side + 'Eye']: { bone: `${s}_eye` },
        [side + 'Breast']: { bone: `${s}_pectoral` },
        [side + 'Shoulder']: { bone: `${s}_shoulder` },
        [side + 'UpperArm']: { bone: `${s}_upperarm`, twist: [`${s}_upperarmtwist1`, `${s}_upperarmtwist2`] },
        [side + 'LowerArm']: { bone: `${s}_forearm`, twist: [`${s}_forearmtwist1`, `${s}_forearmtwist2`] },
        [side + 'Hand']: { bone: `${s}_hand` },
        [side + 'UpperLeg']: { bone: `${s}_thigh`, twist: [`${s}_thightwist1`, `${s}_thightwist2`] },
        [side + 'LowerLeg']: { bone: `${s}_shin` },
        [side + 'Foot']: { bone: `${s}_foot` },
        [side + 'Toes']: { bone: `${s}_toes` },
        ...fingerMap(side, (f, i) => `${s}_${DAZ_FINGER[f].toLowerCase()}${i}`),
      };
    },
  ),
  vam: build(
    {
      hips: { bone: 'hip' },
      spine: { bone: 'abdomen' },
      chest: { bone: 'abdomen2' },
      upperChest: { bone: 'chest' },
      neck: { bone: 'neck' },
      head: { bone: 'head' },
      jaw: { bone: 'lowerJaw' },
    },
    (side) => {
      const s = side[0]!;
      return {
        [side + 'Eye']: { bone: `${s}Eye` },
        [side + 'Breast']: { bone: `${s}Pectoral` },
        [side + 'Shoulder']: { bone: `${s}Collar` },
        [side + 'UpperArm']: { bone: `${s}Shldr` },
        [side + 'LowerArm']: { bone: `${s}ForeArm` },
        [side + 'Hand']: { bone: `${s}Hand` },
        [side + 'UpperLeg']: { bone: `${s}Thigh` },
        [side + 'LowerLeg']: { bone: `${s}Shin` },
        [side + 'Foot']: { bone: `${s}Foot` },
        [side + 'Toes']: { bone: `${s}Toe` },
        ...fingerMap(side, (f, i) => `${s}${DAZ_FINGER[f]}${i}`),
      };
    },
  ),
  mixamo: build(
    {
      hips: { bone: 'Hips' },
      spine: { bone: 'Spine' },
      chest: { bone: 'Spine1' },
      upperChest: { bone: 'Spine2' },
      neck: { bone: 'Neck' },
      head: { bone: 'Head' },
    },
    (side) => {
      const S = side === 'left' ? 'Left' : 'Right';
      const MIX: Record<(typeof FINGERS)[number], string> = { Thumb: 'Thumb', Index: 'Index', Middle: 'Middle', Ring: 'Ring', Little: 'Pinky' };
      return {
        [side + 'Eye']: { bone: `${S}Eye` },
        [side + 'Shoulder']: { bone: `${S}Shoulder` },
        [side + 'UpperArm']: { bone: `${S}Arm` },
        [side + 'LowerArm']: { bone: `${S}ForeArm` },
        [side + 'Hand']: { bone: `${S}Hand` },
        [side + 'UpperLeg']: { bone: `${S}UpLeg` },
        [side + 'LowerLeg']: { bone: `${S}Leg` },
        [side + 'Foot']: { bone: `${S}Foot` },
        [side + 'Toes']: { bone: `${S}ToeBase` },
        ...fingerMap(side, (f, i) => `${S}Hand${MIX[f]}${i}`),
      };
    },
  ),
  cc4: build(
    {
      hips: { bone: 'CC_Base_Hip' },
      spine: { bone: 'CC_Base_Waist' },
      chest: { bone: 'CC_Base_Spine01' },
      upperChest: { bone: 'CC_Base_Spine02' },
      neck: { bone: 'CC_Base_NeckTwist01' },
      head: { bone: 'CC_Base_Head' },
      jaw: { bone: 'CC_Base_JawRoot' },
    },
    (side) => {
      const s = `CC_Base_${side === 'left' ? 'L' : 'R'}_`;
      return {
        [side + 'Eye']: { bone: `${s}Eye` },
        [side + 'Breast']: { bone: `${s}Breast` },
        [side + 'Shoulder']: { bone: `${s}Clavicle` },
        [side + 'UpperArm']: { bone: `${s}Upperarm`, twist: [`${s}UpperarmTwist01`, `${s}UpperarmTwist02`] },
        [side + 'LowerArm']: { bone: `${s}Forearm`, twist: [`${s}ForearmTwist01`, `${s}ForearmTwist02`] },
        [side + 'Hand']: { bone: `${s}Hand` },
        [side + 'UpperLeg']: { bone: `${s}Thigh`, twist: [`${s}ThighTwist01`, `${s}ThighTwist02`] },
        [side + 'LowerLeg']: { bone: `${s}Calf` },
        [side + 'Foot']: { bone: `${s}Foot` },
        [side + 'Toes']: { bone: `${s}ToeBase` },
        ...fingerMap(side, (f, i) => `${s}${DAZ_FINGER[f]}${i}`),
      };
    },
  ),
};

/**
 * Normalises a source bone name for matching: drops namespace prefixes
 * ("mixamorig:", "Armature|", "DEF-"), case, and separators.
 */
export function normaliseBoneName(name: string): string {
  return name
    .replace(/^.*[:|]/, '')
    .replace(/^(mixamorig\d*|def-|org-|bip0?1\s*|armature_?)/i, '')
    .toLowerCase()
    .replace(/[\s_.\-]/g, '');
}

export interface RigDetection {
  kind: RigKind;
  map: RigMap;
  /** Share of required canonical bones found. */
  coverage: number;
  /** Canonical bones that stayed unmapped (for the manual mapping wizard). */
  missing: string[];
}

const REQUIRED = ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

/** Resolves a map's bone names against the actual (possibly prefixed) names in a file. */
function resolve(map: RigMap, names: string[]): RigMap {
  const byNorm = new Map(names.map((n) => [normaliseBoneName(n), n]));
  const out: RigMap = {};
  for (const [canon, m] of Object.entries(map)) {
    if (!m) continue;
    const bone = byNorm.get(normaliseBoneName(m.bone));
    if (!bone) continue;
    const twist = m.twist?.map((t) => byNorm.get(normaliseBoneName(t))).filter((t): t is string => !!t);
    out[canon] = twist?.length ? { bone, twist } : { bone };
  }
  return out;
}

function coverageOf(map: RigMap): number {
  return REQUIRED.filter((b) => map[b]).length / REQUIRED.length;
}

/**
 * Picks the known rig that matches the most required bones; falls back to
 * keyword matching for unknown rigs. VRM files carry their own humanoid map
 * and skip this.
 */
export function detectRig(boneNames: string[]): RigDetection {
  let best: RigDetection | null = null;
  for (const [kind, template] of Object.entries(RIG_MAPS) as [Exclude<RigKind, 'generic' | 'vrm'>, RigMap][]) {
    const map = resolve(template, boneNames);
    const coverage = coverageOf(map);
    // Prefer the rig that also matches more bones overall (G8 vs VaM share names).
    const score = coverage + Object.keys(map).length / 1000;
    if (!best || score > best.coverage + Object.keys(best.map).length / 1000) best = { kind, map, coverage, missing: [] };
  }
  if (!best || best.coverage < 0.9) {
    const map = genericMap(boneNames);
    const coverage = coverageOf(map);
    if (!best || coverage > best.coverage) best = { kind: 'generic', map, coverage, missing: [] };
  }
  best.missing = CANONICAL_BONE_NAMES.filter((b) => !best!.map[b]);
  return best;
}

/** Keyword matching for unknown rigs; side from l/r/left/right tokens. */
export function genericMap(boneNames: string[]): RigMap {
  const map: RigMap = {};
  const side = (full: string): Side | null => {
    const n = full.replace(/^.*[:|]/, '');
    // Suffix ("upperarm_l", "UpperArm.L"), then words, then Daz-style prefix ("lHand", case-sensitive).
    const suffix = /[._\s-]([lLrR])$/.exec(n)?.[1];
    if (suffix) return suffix.toLowerCase() === 'l' ? 'left' : 'right';
    if (/left/i.test(n)) return 'left';
    if (/right/i.test(n)) return 'right';
    if (/^l[A-Z]/.test(n) || /(^|[._\s-])l([._\s-])/i.test(n)) return 'left';
    if (/^r[A-Z]/.test(n) || /(^|[._\s-])r([._\s-])/i.test(n)) return 'right';
    return null;
  };
  const rules: [RegExp, string, boolean][] = [
    [/(hips?|pelvis|root)$/, 'hips', false],
    [/(spine|abdomen|waist)(0?1)?$/, 'spine', false],
    [/(chest|spine0?2|spine2)$/, 'chest', false],
    [/(upperchest|spine0?3)$/, 'upperChest', false],
    [/neck(0?1)?$/, 'neck', false],
    [/head$/, 'head', false],
    [/(clavicle|collar|shoulder)$/, 'Shoulder', true],
    // Specific names before the general "…arm" rule.
    [/(forearm|lowerarm|elbow)$/, 'LowerArm', true],
    [/(upperarm|uparm|arm)$/, 'UpperArm', true],
    [/(hand|wrist)$/, 'Hand', true],
    [/(thigh|upleg|upperleg)$/, 'UpperLeg', true],
    [/(calf|shin|lowerleg|knee|leg)$/, 'LowerLeg', true],
    [/(foot|ankle)$/, 'Foot', true],
    [/(toes?|toebase|ball)$/, 'Toes', true],
  ];
  for (const name of boneNames) {
    // Strip side markers: "Left…"/"…Right", Daz-style "lHand" (l + capital), and "_l"/".L" suffixes.
    const bare = name.replace(/^.*[:|]/, '').replace(/^[lr](?=[A-Z])/, '').replace(/[._\s-][lLrR]$/, '');
    const n = normaliseBoneName(bare).replace(/^(left|right)|(left|right)$/g, '');
    for (const [re, target, sided] of rules) {
      if (!re.test(n)) continue;
      const s = sided ? side(name) : null;
      if (sided && !s) continue;
      const canon = sided ? s + target : target;
      if (!map[canon]) map[canon] = { bone: name };
      break;
    }
  }
  return map;
}
