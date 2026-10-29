import { activeScene, createId, saveAsset, type CanonicalPose, type Figure, type Project, type Vec3 } from '@poser/core';
import { EFFECTORS, viewportFigureSkeleton } from '../viewport/figureAccess';
import { applyHandPreset, applyLimits, copySide, mirrorPose, poseThumbnailUrl, randomPose, solveTwoBone, type Effector, type HandPreset, type RandomLock } from '@poser/posing';
import { useLibrary } from '../state/library';
import { viewportRef } from '../viewport/ViewportView';
import { currentProject, editProject } from '../state/project';
import { useUi } from '../state/ui';

/** Pose actions on the selected figure (PLAN.md section 6). All undoable. */
export function selectedFigure(): Figure | undefined {
  const id = useUi.getState().selectedFigureId;
  return activeScene(currentProject()).figures.find((f) => f.id === id);
}

function editPose(label: string, recipe: (pose: CanonicalPose, fig: Figure) => CanonicalPose, coalesceKey?: string): void {
  const fig = selectedFigure();
  if (!fig) return;
  const skel = viewportFigureSkeleton(fig.id);
  let pose = recipe(fig.pose, fig);
  if (skel && useUi.getState().jointLimits) pose = applyLimits(skel, pose).pose;
  // Keep pinned hands and feet where they are.
  if (skel) for (const [eff, target] of Object.entries(fig.pins ?? {})) pose = solveTwoBone(skel, pose, eff as Effector, target as [number, number, number]).pose;
  editProject(
    label,
    (p) => {
      const f = activeScene(p as Project).figures.find((x) => x.id === fig.id);
      if (f) f.pose = pose;
    },
    coalesceKey ? { coalesceKey } : undefined,
  );
}

export const mirrorSelected = () => editPose('Mirror pose', (pose) => mirrorPose(pose));
export const copySideSelected = (from: 'left' | 'right') => editPose(`Copy ${from} side`, (pose) => copySide(pose, from));
export const handPresetSelected = (side: 'left' | 'right', preset: HandPreset) => editPose(`${side === 'left' ? 'Left' : 'Right'} hand: ${preset}`, (pose) => applyHandPreset(pose, side, preset));
export const resetPoseSelected = () => editPose('Reset pose', () => ({}));
export const resetJointSelected = () => {
  const joint = useUi.getState().selectedJoint;
  if (!joint) return;
  editPose('Reset joint', (pose) => {
    const next = { ...pose };
    delete next[joint];
    return next;
  });
};
export const setJointRotation = (joint: string, q: [number, number, number, number], key: string) =>
  editPose('Adjust joint', (pose) => ({ ...pose, [joint]: q }), key);

/** Pins or unpins the selected hand or foot where it is now. */
export function togglePinSelected(): boolean {
  const fig = selectedFigure();
  const joint = useUi.getState().selectedJoint;
  if (!fig || !joint || !(EFFECTORS as string[]).includes(joint)) return false;
  const skel = viewportFigureSkeleton(fig.id);
  if (!skel) return false;
  const pins = { ...(fig.pins ?? {}) };
  const pinned = !!pins[joint];
  if (pinned) delete pins[joint];
  else pins[joint] = skel.positions(fig.pose).get(joint)! as Vec3;
  editProject(pinned ? 'Unpin' : 'Pin', (p) => {
    const f = activeScene(p as Project).figures.find((x) => x.id === fig.id);
    if (f) f.pins = pins;
  });
  return true;
}

/**
 * Puts a whole pose on the selected figure (library, imported file, blend,
 * random). Joint limits apply, pins are released (they belong to the old
 * pose), and the figure moves up or down so its lowest point stays at the
 * same height: a kneeling pose stays on the floor, one on a bed stays on it.
 */
export function applyPoseSelected(pose: CanonicalPose, label: string, coalesceKey?: string): boolean {
  const fig = selectedFigure();
  if (!fig) return false;
  const skel = viewportFigureSkeleton(fig.id);
  const next = skel && useUi.getState().jointLimits ? applyLimits(skel, pose).pose : pose;
  const vp = viewportRef.current;
  const before = vp?.lowestPoint(fig.id) ?? null;
  const after = vp?.lowestPoint(fig.id, next) ?? null;
  const dy = before !== null && after !== null ? before - after : 0;
  editProject(
    label,
    (p) => {
      const f = activeScene(p as Project).figures.find((x) => x.id === fig.id);
      if (!f) return;
      f.pose = next;
      f.pins = {};
      f.transform.position[1] += dy;
    },
    coalesceKey ? { coalesceKey } : undefined,
  );
  return true;
}

/** A random pose on the selected figure (PLAN.md section 17). */
export function randomPoseSelected(amount: number, locks: RandomLock[]): boolean {
  const fig = selectedFigure();
  if (!fig) return false;
  const skeleton = viewportFigureSkeleton(fig.id) ?? undefined;
  return applyPoseSelected(randomPose(fig.pose, { amount, locks, skeleton }), 'Random pose');
}

/** Saves a pose to the Library (kept on this device, works on any figure). */
export async function savePoseToLibrary(name: string, pose: CanonicalPose, sourceName = 'Poser', format = 'pose'): Promise<void> {
  await saveAsset({
    id: createId('pose'),
    kind: 'pose',
    name: name.trim() || 'Pose',
    sourceName,
    format,
    importedAt: Date.now(),
    tags: [],
    morphs: [],
    size: [0, 0, 0],
    triangles: 0,
    thumbnail: poseThumbnailUrl(pose),
    pose,
    files: [],
  });
  await useLibrary.getState().refresh();
}
