import type { MaterialType, Prop, PropMaterial } from '@poser/core';
import { BUILDER_SHAPES, MATERIAL_LABELS, SHAPE_LABELS } from '@poser/render';
import { AssistChip, Button, FilterChip, IconButton, ListItem, ListSubheader, Menu, SegmentedButtons, Slider, Switch, TextField } from '@poser/ui';
import { removeProp } from '../actions';
import { useActiveScene } from '../state/project';
import { useUi } from '../state/ui';
import {
  BUILT_SHAPE,
  addShapeProp,
  duplicateProp,
  propTurn,
  renameProp,
  setPropMaterial,
  setPropPosition,
  setPropShape,
  setPropTurn,
  toggleLockProp,
} from './props';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

/** Recolour and material editor (PLAN.md section 17.6). */
function MaterialEditor({ prop }: { prop: Prop }) {
  const built = prop.assetId === BUILT_SHAPE;
  const m = prop.material;
  const set = (patch: Partial<PropMaterial>, key?: string) => setPropMaterial(prop.id, patch, key);
  return (
    <>
      <ListSubheader>Material</ListSubheader>
      {!built && (
        <Switch
          label="Recolour"
          supporting="Change colour and surface; the original look comes back when off"
          checked={!!m}
          onChange={(v) => setPropMaterial(prop.id, v ? { type: 'plastic', color: '#c0c0c0' } : null)}
        />
      )}
      {m && (
        <>
          <div className="chip-row">
            {(Object.keys(MATERIAL_LABELS) as MaterialType[]).map((t) => (
              <FilterChip key={t} label={MATERIAL_LABELS[t]} selected={m.type === t} onToggle={() => set({ type: t, shine: undefined })} />
            ))}
          </div>
          <div className="button-wrap">
            <ColorField label="Colour" value={m.color} onChange={(c) => set({ color: c }, `prop-color-${prop.id}`)} />
            {built && m.accent !== undefined && <ColorField label="Frame and legs" value={m.accent} onChange={(c) => set({ accent: c }, `prop-accent-${prop.id}`)} />}
          </div>
          <Slider label="Shine" value={m.shine ?? 0.5} min={0} max={1} step={0.01} displayScale={100} unit="%" onChange={(v) => set({ shine: v }, `prop-shine-${prop.id}`)} />
          <p className="hint">Pattern</p>
          <div className="chip-row">
            {(['solid', 'stripes', 'checks'] as const).map((p) => (
              <FilterChip key={p} label={p === 'solid' ? 'Plain' : p === 'stripes' ? 'Stripes' : 'Checks'} selected={(m.pattern ?? 'solid') === p} onToggle={() => set({ pattern: p, patternColor: m.patternColor ?? '#ffffff' })} />
            ))}
          </div>
          {m.pattern && m.pattern !== 'solid' && <ColorField label="Second colour" value={m.patternColor ?? '#ffffff'} onChange={(c) => set({ patternColor: c }, `prop-pattern-${prop.id}`)} />}
        </>
      )}
    </>
  );
}

function PropEditor({ prop }: { prop: Prop }) {
  const gizmo = useUi((s) => s.propGizmo);
  const set = useUi((s) => s.set);
  const shape = prop.shape;
  const cm = (v: number) => Math.round(v * 100);
  const sizeSlider = (axis: 0 | 1 | 2, label: string, max: number) =>
    shape && (
      <Slider
        label={label}
        value={shape.size[axis]}
        min={0.01}
        max={max}
        step={0.01}
        displayScale={100}
        unit="cm"
        onChange={(v) => {
          const size = [...shape.size] as [number, number, number];
          size[axis] = v;
          setPropShape(prop.id, { size }, `prop-size-${prop.id}-${axis}`);
        }}
      />
    );
  return (
    <>
      <TextField label="Name" value={prop.name} onChange={(e) => renameProp(prop.id, e.target.value)} />
      <SegmentedButtons
        label="Gizmo"
        value={gizmo}
        onChange={(g) => set({ propGizmo: g })}
        segments={[
          { value: 'translate', label: 'Move', icon: 'open_with' },
          { value: 'rotate', label: 'Turn', icon: '3d_rotation' },
        ]}
      />
      <p className="hint">{prop.locked ? 'Locked: unlock to move it.' : 'Drag the arrows in the view, or use the sliders.'}</p>
      <Slider label="Left / right" value={prop.transform.position[0]} min={-6} max={6} step={0.01} unit="m" onChange={(v) => setPropPosition(prop.id, 0, v)} disabled={prop.locked} />
      <Slider label="Forward / back" value={prop.transform.position[2]} min={-6} max={6} step={0.01} unit="m" onChange={(v) => setPropPosition(prop.id, 2, v)} disabled={prop.locked} />
      <Slider label="Height above floor" value={prop.transform.position[1]} min={0} max={3} step={0.01} unit="m" onChange={(v) => setPropPosition(prop.id, 1, v)} disabled={prop.locked} />
      <Slider label="Turn" value={propTurn(prop)} min={-180} max={180} step={1} unit="°" onChange={(v) => setPropTurn(prop.id, v)} disabled={prop.locked} />
      {shape && (
        <>
          <ListSubheader>Size</ListSubheader>
          {sizeSlider(0, 'Width', 5)}
          {sizeSlider(1, shape.kind === 'bar' ? 'Height of the bar' : 'Height', 3)}
          {sizeSlider(2, shape.kind === 'ring' || shape.kind === 'bar' ? 'Thickness' : 'Depth', shape.kind === 'ring' || shape.kind === 'bar' ? 0.2 : 5)}
          {shape.kind === 'steps' && (
            <Slider label="Steps" value={shape.steps ?? 3} min={1} max={12} step={1} onChange={(v) => setPropShape(prop.id, { steps: Math.round(v) }, `prop-steps-${prop.id}`)} />
          )}
          <p className="hint">
            {cm(shape.size[0])} × {cm(shape.size[1])} × {cm(shape.size[2])} cm
          </p>
        </>
      )}
      <MaterialEditor prop={prop} />
      <div className="button-wrap">
        <Button variant="tonal" icon="add" onClick={() => duplicateProp(prop.id)}>Duplicate</Button>
        <Button variant="text" icon={prop.locked ? 'lock_open' : 'lock'} onClick={() => toggleLockProp(prop.id)}>{prop.locked ? 'Unlock' : 'Lock'}</Button>
        <Button variant="text" icon="delete" onClick={() => removeProp(prop.id)}>Remove</Button>
      </div>
    </>
  );
}

/** Objects workspace: prop builder, scene props, and the selected prop's settings. */
export function ObjectsWorkspace() {
  const scene = useActiveScene();
  const selectedId = useUi((s) => s.selectedPropId);
  const set = useUi((s) => s.set);
  const selected = scene.props.find((p) => p.id === selectedId);
  return (
    <>
      <ListSubheader>Build a prop</ListSubheader>
      <div className="chip-row">
        {BUILDER_SHAPES.map((k) => (
          <AssistChip key={k} icon="category" label={SHAPE_LABELS[k]} onClick={() => addShapeProp(k)} />
        ))}
      </div>
      <ListSubheader>In the scene</ListSubheader>
      {scene.props.length === 0 && <p className="empty">No props yet. Build one above, or add one from the Library.</p>}
      {scene.props.map((p) => (
        <ListItem
          key={p.id}
          icon={p.locked ? 'lock' : 'category'}
          headline={p.name}
          supporting={p.shape ? `${Math.round(p.shape.size[0] * 100)} × ${Math.round(p.shape.size[1] * 100)} × ${Math.round(p.shape.size[2] * 100)} cm` : 'Imported'}
          selected={p.id === selectedId}
          onClick={() => set({ selectedPropId: p.id === selectedId ? null : p.id, selectedFigureId: null, selectedJoint: null })}
          trailing={
            <Menu
              label={`${p.name} actions`}
              items={[
                { label: 'Duplicate', icon: 'add', onSelect: () => duplicateProp(p.id) },
                { label: 'Remove from scene', icon: 'delete', danger: true, onSelect: () => removeProp(p.id) },
              ]}
              trigger={<IconButton icon="more_vert" label={`More actions for ${p.name}`} />}
            />
          }
        />
      ))}
      {selected && (
        <>
          <ListSubheader>{selected.name}</ListSubheader>
          <PropEditor prop={selected} />
        </>
      )}
    </>
  );
}
