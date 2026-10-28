import { activeScene, type Light, type Project } from '@poser/core';
import { BUILTIN_FIGURES, type AnatomyLayer, type BuiltinFigureId } from '@poser/render';
import { Button, Card, Divider, IconButton, ListItem, ListSubheader, Menu, SegmentedButtons, Slider, Switch, useSnackbar } from '@poser/ui';
import { addBuiltinFigure, captureScreenshot, removeFigure } from '../actions';
import { editProject, useActiveScene } from '../state/project';
import { useUi, type WorkspaceId } from '../state/ui';
import { setView, viewportRef } from '../viewport/ViewportView';
import { WORKSPACES } from '../shell/workspaces';

function ComingInPhase({ phase, what }: { phase: number; what: string }) {
  return (
    <Card variant="outlined" className="coming">
      <strong>Coming in Phase {phase}</strong>
      <p>{what}</p>
    </Card>
  );
}

function LibraryWorkspace() {
  return (
    <>
      <ListSubheader>Built-in figures</ListSubheader>
      <div className="card-grid">
        {(Object.keys(BUILTIN_FIGURES) as BuiltinFigureId[]).map((id) => (
          <Card key={id} variant="filled" className="asset-card">
            <span className="asset-card__title">{BUILTIN_FIGURES[id].name}</span>
            <span className="asset-card__meta">Placeholder mannequin · {BUILTIN_FIGURES[id].proportions.height.toFixed(2)} m</span>
            <Button variant="tonal" icon="person_add" onClick={() => addBuiltinFigure(id)}>
              Add to scene
            </Button>
          </Card>
        ))}
      </div>
      <ComingInPhase phase={1} what="Importing your own figures, clothing, props, and poses (drag and drop, files, folders, and zips), with filters and search." />
    </>
  );
}

function SceneWorkspace() {
  const scene = useActiveScene();
  const selected = useUi((s) => s.selectedFigureId);
  const set = useUi((s) => s.set);
  const toggleFigure = (id: string, visible: boolean) =>
    editProject(visible ? 'Show figure' : 'Hide figure', (p) => {
      const f = activeScene(p as Project).figures.find((x) => x.id === id);
      if (f) f.visible = visible;
    });
  const toggleLight = (id: string, visible: boolean) =>
    editProject(visible ? 'Show light' : 'Hide light', (p) => {
      const l = activeScene(p as Project).lights.find((x) => x.id === id);
      if (l) l.visible = visible;
    });
  const setEnv = (key: 'floor' | 'grid', value: boolean) =>
    editProject(`${value ? 'Show' : 'Hide'} ${key}`, (p) => {
      activeScene(p as Project).environment[key] = value;
    });
  return (
    <>
      <ListSubheader>Figures</ListSubheader>
      {scene.figures.length === 0 && <p className="empty">No figures. Add one from the Library.</p>}
      {scene.figures.map((f) => (
        <ListItem
          key={f.id}
          icon={f.assetId === 'builtin:male' ? 'male' : 'female'}
          headline={f.name}
          selected={f.id === selected}
          onClick={() => set({ selectedFigureId: f.id, inspectorOpen: true })}
          trailing={
            <>
              <Button variant="text" icon={f.visible ? 'visibility' : 'visibility_off'} onClick={() => toggleFigure(f.id, !f.visible)}>
                {f.visible ? 'Hide' : 'Show'}
              </Button>
              <Menu
                label={`${f.name} actions`}
                items={[{ label: 'Remove from scene', icon: 'delete', danger: true, onSelect: () => removeFigure(f.id) }]}
                trigger={<IconButton icon="more_vert" label={`More actions for ${f.name}`} />}
              />
            </>
          }
        />
      ))}
      <ListSubheader>Lights</ListSubheader>
      {scene.lights.map((l) => (
        <ListItem
          key={l.id}
          icon={l.type === 'ambient' ? 'wb_sunny' : 'lightbulb'}
          headline={l.name}
          trailing={
            <Button variant="text" icon={l.visible ? 'visibility' : 'visibility_off'} onClick={() => toggleLight(l.id, !l.visible)}>
              {l.visible ? 'Hide' : 'Show'}
            </Button>
          }
        />
      ))}
      <ListSubheader>Environment</ListSubheader>
      <Switch label="Floor" checked={scene.environment.floor} onChange={(v) => setEnv('floor', v)} />
      <Switch label="Grid" supporting="1 m squares with 10 cm lines" checked={scene.environment.grid} onChange={(v) => setEnv('grid', v)} />
    </>
  );
}

function PoseWorkspace() {
  return (
    <>
      <ListSubheader>Views</ListSubheader>
      <div className="button-wrap">
        <Button variant="tonal" icon="3d_rotation" onClick={() => setView('front')}>Front</Button>
        <Button variant="tonal" icon="3d_rotation" onClick={() => setView('left')}>Side</Button>
        <Button variant="tonal" icon="3d_rotation" onClick={() => setView('back')}>Back</Button>
        <Button variant="tonal" icon="3d_rotation" onClick={() => setView('top')}>Top</Button>
        <Button variant="tonal" icon="center_focus_strong" onClick={() => viewportRef.current?.frameAll()}>Frame all</Button>
      </div>
      <ComingInPhase phase={1} what="Joint handles, rotation gizmos, IK effectors, pins, joint limits, mirroring, hand presets, and the pose library." />
    </>
  );
}

const LAYER_LABELS: Record<AnatomyLayer, { label: string; supporting: string }> = {
  skin: { label: 'Skin', supporting: 'The outer body surface' },
  fat: { label: 'Fat', supporting: 'Rough placeholder volume' },
  muscle: { label: 'Muscle', supporting: 'Rough placeholder volume' },
  skeleton: { label: 'Skeleton', supporting: 'Rough placeholder bones' },
};

function BodyWorkspace() {
  const anatomy = useUi((s) => s.anatomy);
  const skinOpacity = useUi((s) => s.skinOpacity);
  const set = useUi((s) => s.set);
  return (
    <>
      <ListSubheader>Anatomy layers</ListSubheader>
      <p className="hint">Placeholder anatomy for early testing. The real layered anatomy arrives in Phase 5.</p>
      {(Object.keys(LAYER_LABELS) as AnatomyLayer[]).map((layer) => (
        <Switch
          key={layer}
          label={LAYER_LABELS[layer].label}
          supporting={LAYER_LABELS[layer].supporting}
          checked={anatomy[layer]}
          onChange={(v) => set({ anatomy: { ...anatomy, [layer]: v } })}
        />
      ))}
      <Slider label="Skin opacity" value={skinOpacity} min={0} max={1} step={0.01} displayScale={100} unit="%" onChange={(v) => set({ skinOpacity: v })} disabled={!anatomy.skin} />
      <Divider />
      <ComingInPhase phase={4} what="Expressions, hands and feet, muscle tension, and body states." />
    </>
  );
}

function RenderWorkspace() {
  const scene = useActiveScene();
  const snackbar = useSnackbar();
  const setIntensity = (light: Light, value: number) =>
    editProject(
      `Change ${light.name.toLowerCase()}`,
      (p) => {
        const l = activeScene(p as Project).lights.find((x) => x.id === light.id);
        if (l) l.intensity = value;
      },
      { coalesceKey: `light-intensity:${light.id}` },
    );
  return (
    <>
      <ListSubheader>Lights</ListSubheader>
      {scene.lights.map((l) => (
        <Slider key={l.id} label={l.name} value={l.intensity} min={0} max={l.type === 'ambient' ? 2 : 5} step={0.05} onChange={(v) => setIntensity(l, v)} disabled={!l.visible} />
      ))}
      <ListSubheader>Capture</ListSubheader>
      <Button
        variant="tonal"
        icon="photo_camera"
        onClick={() => captureScreenshot().then(() => snackbar('Screenshot saved'), (e: Error) => snackbar(e.message))}
      >
        Save screenshot
      </Button>
      <ComingInPhase phase={1} what="Lighting presets, lens and orthographic cameras, and study modes (clay, silhouette, notan)." />
    </>
  );
}

function PlaceholderWorkspace({ id }: { id: WorkspaceId }) {
  const ws = WORKSPACES.find((w) => w.id === id)!;
  const what: Partial<Record<WorkspaceId, string>> = {
    physics: 'Settle and Live modes, ragdolls, soft tissue, cloth, and figure-to-figure contact.',
    objects: 'Props, toys, restraints, ropes, and latex, with the attachment and holding system.',
    animate: 'A simple keyframe timeline with physics baking and video export.',
  };
  return <ComingInPhase phase={ws.phase ?? 1} what={what[id] ?? ''} />;
}

export function WorkspaceContent({ id }: { id: WorkspaceId }) {
  switch (id) {
    case 'library':
      return <LibraryWorkspace />;
    case 'scene':
      return <SceneWorkspace />;
    case 'pose':
      return <PoseWorkspace />;
    case 'body':
      return <BodyWorkspace />;
    case 'render':
      return <RenderWorkspace />;
    default:
      return <PlaceholderWorkspace id={id} />;
  }
}

export function ModeSwitch() {
  const mode = useUi((s) => s.mode);
  const set = useUi((s) => s.set);
  return (
    <SegmentedButtons
      label="Simulation mode"
      value={mode}
      onChange={(m) => set({ mode: m })}
      segments={[
        { value: 'pose', label: 'Pose', icon: 'accessibility_new' },
        { value: 'settle', label: 'Settle', icon: 'science', disabled: true, title: 'Coming in Phase 2' },
        { value: 'live', label: 'Live', icon: 'play_arrow', disabled: true, title: 'Coming in Phase 2' },
      ]}
    />
  );
}
