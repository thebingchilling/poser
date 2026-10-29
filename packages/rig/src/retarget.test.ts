import { describe, expect, it } from 'vitest';
import { CANONICAL_BONES } from './bones';
import { QI, axisAngle, qinv, qmul, qnorm, qrot, vadd, vlen, vsub, type Q, type V3 } from './math';
import { FEMALE_PROPORTIONS, restPose } from './proportions';
import { Retargeter, type CanonicalPose, type SourceBone } from './retarget';
import { RIG_MAPS, detectRig, genericMap, type RigMap } from './rigMaps';

const REST = restPose(FEMALE_PROPORTIONS);

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * Builds a source rig from the canonical rest pose: named by `name(canonical)`,
 * optionally with scrambled bone axes, an A-pose, an extra in-between bone
 * and twist bones.
 */
function makeRig(opts: { name?: (c: string) => string; scramble?: number; aPose?: boolean; extras?: boolean; twist?: boolean }) {
  const r = rand(opts.scramble ?? 1);
  const randomRot = (): Q => (opts.scramble ? qnorm([r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5]) : QI);
  const name = opts.name ?? ((c: string) => c);
  const heads = { ...REST } as Record<string, V3>;
  if (opts.aPose) {
    // Arms 45° down: rotate arm chains about the shoulder joint.
    for (const s of ['left', 'right']) {
      const pivot = REST[s + 'UpperArm']!;
      const q = axisAngle([0, 0, 1], s === 'left' ? -Math.PI / 4 : Math.PI / 4);
      for (const b of CANONICAL_BONES) {
        if (b.name.startsWith(s) && /Arm|Hand|Thumb|Index|Middle|Ring|Little/.test(b.name) && b.name !== s + 'UpperArm') {
          heads[b.name] = vadd(pivot, qrot(q, vsub(REST[b.name]!, pivot)));
        }
      }
    }
  }
  const bones: SourceBone[] = [];
  const worldRot: Q[] = [];
  const worldPos: V3[] = [];
  const index = new Map<string, number>();
  const add = (bn: string, parent: string | null, head: V3) => {
    const p = parent === null ? -1 : index.get(parent)!;
    const wr = randomRot();
    const pr = p < 0 ? QI : worldRot[p]!;
    const pp = p < 0 ? ([0, 0, 0] as V3) : worldPos[p]!;
    bones.push({ name: bn, parent: p, position: qrot(qinv(pr), vsub(head, pp)), rotation: qmul(qinv(pr), wr) });
    index.set(bn, bones.length - 1);
    worldRot.push(wr);
    worldPos.push(head);
  };
  const map: RigMap = {};
  for (const b of CANONICAL_BONES) {
    let parent = b.parent === null ? null : name(b.parent);
    if (opts.extras && (b.name === 'leftUpperLeg' || b.name === 'rightUpperLeg')) {
      // A Daz-style 'pelvis' bone between the hips and the thighs.
      if (!index.has('pelvis')) add('pelvis', name('hips'), vadd(heads.hips!, [0, -0.03, 0]));
      parent = 'pelvis';
    }
    if (opts.twist && /LowerArm$/.test(b.name)) parent = name(b.parent!) + 'Twist';
    add(name(b.name), parent, heads[b.name]!);
    map[b.name] = { bone: name(b.name) };
    if (opts.twist && /UpperArm$/.test(b.name)) {
      // Twist bone halfway along the upper arm, carrying the lower arm.
      const lower = heads[b.name.replace('Upper', 'Lower')]!;
      add(name(b.name) + 'Twist', name(b.name), vadd(heads[b.name]!, vsub(lower, heads[b.name]!).map((v) => v / 2) as V3));
      map[b.name] = { bone: name(b.name), twist: [name(b.name) + 'Twist'] };
    }
  }
  return { bones, map };
}

/** World head positions of the source bones for given local rotations. */
function fk(bones: SourceBone[], local: Q[]): V3[] {
  const wr: Q[] = [];
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
  return wp;
}

/** Canonical joint positions under a pose (identity rest orientations). */
function canonicalFk(pose: CanonicalPose): Record<string, V3> {
  const W: Record<string, Q> = {};
  const P: Record<string, V3> = {};
  for (const b of CANONICAL_BONES) {
    if (!b.parent) {
      W[b.name] = pose[b.name] ?? QI;
      P[b.name] = REST[b.name]!;
    } else {
      W[b.name] = qmul(W[b.parent]!, pose[b.name] ?? QI);
      P[b.name] = vadd(P[b.parent]!, qrot(W[b.parent]!, vsub(REST[b.name]!, REST[b.parent]!)));
    }
  }
  return P;
}

const SAMPLE_POSE: CanonicalPose = {
  spine: axisAngle([1, 0, 0], 0.2),
  chest: axisAngle([0, 1, 0], 0.3),
  leftUpperArm: axisAngle([0, 0, 1], -1.1),
  leftLowerArm: axisAngle([0, 1, 0], -0.9),
  rightUpperArm: qmul(axisAngle([1, 0, 0], 0.4), axisAngle([0, 0, 1], 0.8)),
  rightLowerArm: axisAngle([-1, 0, 0], 0.7), // includes roll about the arm (x) axis
  leftUpperLeg: axisAngle([1, 0, 0], -1.2),
  leftLowerLeg: axisAngle([1, 0, 0], 1.4),
  head: axisAngle([0, 1, 0], 0.5),
};

function expectMatches(rig: { bones: SourceBone[]; map: RigMap }, pose: CanonicalPose, nameOf: (c: string) => string = (c) => c, tol = 1e-4) {
  const rt = new Retargeter(rig.bones, rig.map);
  const pos = fk(rig.bones, rt.apply(pose));
  const want = canonicalFk(pose);
  const idx = new Map(rig.bones.map((b, i) => [b.name, i]));
  let worst = 0;
  for (const b of ['leftHand', 'rightHand', 'leftFoot', 'head', 'rightLowerArm', 'leftMiddleDistal']) {
    worst = Math.max(worst, vlen(vsub(pos[idx.get(nameOf(b))!]!, want[b]!)));
  }
  expect(worst).toBeLessThan(tol);
}

describe('retargeting', () => {
  it('poses a T-pose rig exactly like the canonical skeleton', () => {
    expectMatches(makeRig({}), SAMPLE_POSE);
  });

  it('straightens an A-pose rig to the canonical T-pose, then poses it the same way', () => {
    const rig = makeRig({ aPose: true });
    expectMatches(rig, {});
    expectMatches(rig, SAMPLE_POSE);
  });

  it('works whatever the bone axes are (scrambled local orientations)', () => {
    for (const seed of [3, 17, 99]) expectMatches(makeRig({ scramble: seed, aPose: true }), SAMPLE_POSE);
  });

  it('keeps in-between bones following their parent', () => {
    expectMatches(makeRig({ extras: true, scramble: 5 }), SAMPLE_POSE);
  });

  it('puts the roll on in-chain twist bones and still lands the hand in the right place and orientation', () => {
    const rig = makeRig({ twist: true, scramble: 7 });
    expectMatches(rig, SAMPLE_POSE);
    const rt = new Retargeter(rig.bones, rig.map);
    // Pure roll about the upper arm's own axis: the bend bone should keep its rest rotation
    // (all roll goes to the twist bone).
    const armAxis = vsub(REST.leftLowerArm!, REST.leftUpperArm!);
    const roll = { leftUpperArm: axisAngle(armAxis, 1.0) };
    const local = rt.apply(roll);
    const i = rig.bones.findIndex((b) => b.name === 'leftUpperArm');
    const t = rig.bones.findIndex((b) => b.name === 'leftUpperArmTwist');
    const restI = rig.bones[i]!.rotation;
    const d = Math.abs(local[i]![0] * restI[0] + local[i]![1] * restI[1] + local[i]![2] * restI[2] + local[i]![3] * restI[3]);
    expect(d).toBeGreaterThan(0.9999);
    const restT = rig.bones[t]!.rotation;
    const dt = Math.abs(local[t]![0] * restT[0] + local[t]![1] * restT[1] + local[t]![2] * restT[2] + local[t]![3] * restT[3]);
    expect(dt).toBeLessThan(0.95);
  });

  it('reads a pose back off a rig (round trip)', () => {
    const rig = makeRig({ scramble: 11, aPose: true, twist: true, extras: true });
    const rt = new Retargeter(rig.bones, rig.map);
    const back = rt.extract(rt.apply(SAMPLE_POSE));
    // Same joint positions when re-applied.
    const a = canonicalFk(SAMPLE_POSE);
    const b = canonicalFk(back);
    for (const k of ['leftHand', 'rightHand', 'leftFoot', 'head']) expect(vlen(vsub(a[k]!, b[k]!))).toBeLessThan(1e-4);
  });
});

describe('rig detection', () => {
  const namesOf = (map: RigMap, prefix = '') => Object.values(map).flatMap((m) => [prefix + m!.bone, ...(m!.twist ?? []).map((t) => prefix + t)]);

  it('recognises each known rig from its bone names', () => {
    for (const kind of ['daz-g8', 'daz-g9', 'mixamo', 'cc4', 'vam'] as const) {
      const extra = kind === 'daz-g8' ? ['pelvis', 'abdomenUpper', 'neckUpper', 'lCarpal1'] : [];
      const d = detectRig([...namesOf(RIG_MAPS[kind]), ...extra]);
      expect(d.kind, kind).toBe(kind);
      expect(d.coverage).toBe(1);
    }
  });

  it('handles namespace prefixes (mixamorig:)', () => {
    const d = detectRig(namesOf(RIG_MAPS.mixamo, 'mixamorig:'));
    expect(d.kind).toBe('mixamo');
    expect(d.map.leftHand?.bone).toBe('mixamorig:LeftHand');
  });

  it('matches an unknown rig by keywords (Blender-style names)', () => {
    const names = ['root', 'pelvis', 'spine_01', 'spine_02', 'neck_01', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'];
    const m = genericMap(names);
    expect(m.leftUpperArm?.bone).toBe('upperarm_l');
    expect(m.rightLowerArm?.bone).toBe('lowerarm_r');
    expect(m.leftUpperLeg?.bone).toBe('thigh_l');
    expect(m.rightLowerLeg?.bone).toBe('calf_r');
    expect(m.leftFoot?.bone).toBe('foot_l');
    expect(m.head?.bone).toBe('head');
  });
});
