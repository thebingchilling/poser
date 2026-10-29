import { axisAngle, qmul, type CanonicalPose, type Q } from '@poser/rig';

/**
 * Hand presets (PLAN.md sections 6 and 13.2). Fingers point along ±X in the
 * T-pose with the palm down; curling is rotation about Z (toward the palm),
 * spread is rotation about Y.
 */
export type HandPreset = 'relaxed' | 'open' | 'fist' | 'point' | 'grip' | 'pinch' | 'flat';

export const HAND_PRESET_LABELS: Record<HandPreset, string> = {
  relaxed: 'Relaxed',
  open: 'Open',
  flat: 'Flat',
  fist: 'Fist',
  point: 'Point',
  grip: 'Grip',
  pinch: 'Pinch',
};

/** Curl per finger joint (radians, base to tip) and spread, per preset. */
const PRESETS: Record<HandPreset, { fingers: Record<'Index' | 'Middle' | 'Ring' | 'Little', [number, number, number]>; spread: number; thumb: [number, number, number] }> = {
  relaxed: { fingers: { Index: [0.25, 0.35, 0.25], Middle: [0.3, 0.4, 0.3], Ring: [0.35, 0.45, 0.3], Little: [0.4, 0.5, 0.35] }, spread: 0.05, thumb: [0.2, 0.15, 0.2] },
  open: { fingers: { Index: [0, 0.05, 0.05], Middle: [0, 0.05, 0.05], Ring: [0, 0.05, 0.05], Little: [0, 0.05, 0.05] }, spread: 0.25, thumb: [0, 0, 0] },
  flat: { fingers: { Index: [0, 0, 0], Middle: [0, 0, 0], Ring: [0, 0, 0], Little: [0, 0, 0] }, spread: 0, thumb: [0, 0, 0] },
  fist: { fingers: { Index: [1.4, 1.6, 1.1], Middle: [1.45, 1.6, 1.1], Ring: [1.5, 1.6, 1.1], Little: [1.5, 1.6, 1.1] }, spread: 0, thumb: [0.6, 0.6, 0.7] },
  point: { fingers: { Index: [0, 0.05, 0.05], Middle: [1.45, 1.6, 1.1], Ring: [1.5, 1.6, 1.1], Little: [1.5, 1.6, 1.1] }, spread: 0, thumb: [0.6, 0.5, 0.5] },
  grip: { fingers: { Index: [0.8, 0.9, 0.6], Middle: [0.85, 0.95, 0.65], Ring: [0.9, 0.95, 0.65], Little: [0.95, 1.0, 0.65] }, spread: 0, thumb: [0.5, 0.4, 0.4] },
  pinch: { fingers: { Index: [0.7, 0.8, 0.5], Middle: [0.5, 0.6, 0.4], Ring: [0.6, 0.7, 0.5], Little: [0.7, 0.8, 0.5] }, spread: 0.05, thumb: [0.7, 0.4, 0.5] },
};

/** Finger rotations for one hand; merged into the pose. `amount` blends from flat (0) to the preset (1). */
export function handPose(side: 'left' | 'right', preset: HandPreset, amount = 1): CanonicalPose {
  const s = side === 'left' ? 1 : -1;
  const p = PRESETS[preset];
  const out: CanonicalPose = {};
  const spreadOf: Record<string, number> = { Index: 1, Middle: 0, Ring: -1, Little: -2 };
  for (const [finger, curls] of Object.entries(p.fingers)) {
    (['Proximal', 'Intermediate', 'Distal'] as const).forEach((seg, i) => {
      // Curl toward the palm (palm faces -Y): about +Z for the right hand, -Z for the left.
      let q: Q = axisAngle([0, 0, 1], -s * curls[i]! * amount);
      if (i === 0) q = qmul(axisAngle([0, 1, 0], s * spreadOf[finger]! * p.spread * 0.5 * amount), q);
      out[`${side}${finger}${seg}`] = q;
    });
  }
  // The thumb curls across the palm: about the axis running along the palm toward the fingers.
  (['Metacarpal', 'Proximal', 'Distal'] as const).forEach((seg, i) => {
    out[`${side}Thumb${seg}`] = axisAngle([1, 0, 0], -s * p.thumb[i]! * amount);
  });
  return out;
}

export function applyHandPreset(pose: CanonicalPose, side: 'left' | 'right', preset: HandPreset, amount = 1): CanonicalPose {
  return { ...pose, ...handPose(side, preset, amount) };
}
