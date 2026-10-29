import { activeScene, createProp, type Project, type Prop, type PropMaterial, type PropShape, type ShapeKind } from '@poser/core';
import { SHAPE_DEFAULTS, SHAPE_LABELS } from '@poser/render';
import { currentProject, editProject } from '../state/project';
import { useUi } from '../state/ui';

/** Prop builder actions (PLAN.md section 17.6). All undoable. */

export const BUILT_SHAPE = 'builtin:shape';

export function selectedProp(): Prop | undefined {
  const id = useUi.getState().selectedPropId;
  return activeScene(currentProject()).props.find((p) => p.id === id);
}

export function addShapeProp(kind: ShapeKind): void {
  const d = SHAPE_DEFAULTS[kind];
  const prop = createProp(BUILT_SHAPE, SHAPE_LABELS[kind]);
  prop.shape = { kind, size: [...d.size], ...(d.steps ? { steps: d.steps } : {}) };
  prop.material = { ...d.material };
  // Beside the figures and the other props, so it doesn't land inside anything.
  const scene = activeScene(currentProject());
  const halfWidth = (p: Prop) => (p.shape ? Math.max(p.shape.size[0], p.shape.size[2]) / 2 : 0.3);
  const right = scene.props.reduce((x, p) => Math.max(x, p.transform.position[0] + halfWidth(p)), 0.6);
  prop.transform.position = [right + 0.15 + halfWidth(prop), 0, 0];
  editProject(`Add ${SHAPE_LABELS[kind].toLowerCase()}`, (p) => {
    activeScene(p as Project).props.push(prop);
  });
  useUi.getState().set({ selectedPropId: prop.id, selectedFigureId: null, selectedJoint: null });
}

function editProp(id: string, label: string, recipe: (prop: Prop) => void, coalesceKey?: string): void {
  editProject(
    label,
    (p) => {
      const prop = activeScene(p as Project).props.find((x) => x.id === id);
      if (prop) recipe(prop);
    },
    coalesceKey ? { coalesceKey } : undefined,
  );
}

export const setPropShape = (id: string, patch: Partial<PropShape>, key: string) =>
  editProp(id, 'Resize prop', (p) => p.shape && Object.assign(p.shape, patch), key);

export const setPropMaterial = (id: string, patch: Partial<PropMaterial> | null, key?: string) =>
  editProp(
    id,
    patch ? 'Change material' : 'Restore original material',
    (p) => {
      if (!patch) delete p.material;
      else p.material = { ...(p.material ?? { type: 'matte', color: '#ffffff' }), ...patch };
    },
    key,
  );

export const setPropPosition = (id: string, axis: 0 | 1 | 2, value: number) =>
  editProp(id, 'Move prop', (p) => (p.transform.position[axis] = value), `prop-pos-${id}-${axis}`);

export const setPropTurn = (id: string, degrees: number) =>
  editProp(
    id,
    'Turn prop',
    (p) => {
      const a = (degrees * Math.PI) / 360;
      p.transform.rotation = [0, Math.sin(a), 0, Math.cos(a)];
    },
    `prop-turn-${id}`,
  );

export const renameProp = (id: string, name: string) => editProp(id, 'Rename prop', (p) => (p.name = name), `prop-name-${id}`);

export const toggleLockProp = (id: string) => editProp(id, 'Lock prop', (p) => (p.locked = !p.locked));

export function duplicateProp(id: string): void {
  const src = activeScene(currentProject()).props.find((p) => p.id === id);
  if (!src) return;
  const copy = createProp(src.assetId, `${src.name} copy`);
  copy.transform = structuredClone(src.transform);
  copy.transform.position[0] += 0.3;
  if (src.shape) copy.shape = structuredClone(src.shape);
  if (src.material) copy.material = structuredClone(src.material);
  editProject('Duplicate prop', (p) => {
    activeScene(p as Project).props.push(copy);
  });
  useUi.getState().set({ selectedPropId: copy.id });
}

/** Turn (degrees, about the vertical) from a prop's rotation. */
export function propTurn(prop: Prop): number {
  const [x, y, z, w] = prop.transform.rotation;
  return Math.round((Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)) * 180) / Math.PI);
}
