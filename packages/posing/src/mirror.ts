import { mirrorBoneName, type CanonicalPose, type Q } from '@poser/rig';

/** Reflects a rotation across the figure's mid-plane (x = 0). */
export function mirrorQuat(q: Q): Q {
  return [q[0], -q[1], -q[2], q[3]];
}

/** The whole pose mirrored left to right (PLAN.md section 6: mirror). */
export function mirrorPose(pose: CanonicalPose): CanonicalPose {
  const out: CanonicalPose = {};
  for (const [bone, q] of Object.entries(pose)) out[mirrorBoneName(bone)] = mirrorQuat(q);
  return out;
}

/** Copies one side onto the other (e.g. left arm pose onto the right arm). */
export function copySide(pose: CanonicalPose, from: 'left' | 'right'): CanonicalPose {
  const out: CanonicalPose = { ...pose };
  const to = from === 'left' ? 'right' : 'left';
  for (const key of Object.keys(out)) if (key.startsWith(to)) delete out[key];
  for (const [bone, q] of Object.entries(pose)) if (bone.startsWith(from)) out[mirrorBoneName(bone)] = mirrorQuat(q);
  return out;
}
