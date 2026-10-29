import { activeScene, type AssetRecord, type Light, type Project } from '@poser/core';
import { BUILTIN_FIGURES, type AnatomyLayer, type BuiltinFigureId } from '@poser/render';
import { AssistChip, Button, Card, Divider, FilterChip, IconButton, ListItem, ListSubheader, Menu, SegmentedButtons, Slider, Switch, Tabs, TextField, useSnackbar, type IconName } from '@poser/ui';
import { useEffect, useState } from 'react';
import { HAND_PRESET_LABELS, type HandPreset } from '@poser/posing';
import { EFFECTORS, jointLabel } from '@poser/render';
import { applyPoseSelected, copySideSelected, handPresetSelected, mirrorSelected, resetJointSelected, resetPoseSelected, togglePinSelected } from './posing';
import { startImport } from '../import/startImport';
import { PoseLibraryPanel, PoseMixPanel } from './PoseLibrary';
import { useLibrary } from '../state/library';
import { addAssetToScene, addBuiltinFigure, captureScreenshot, removeFigure, removeProp } from '../actions';
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

const LIBRARY_FILTERS: { kind: AssetRecord['kind'] | 'all'; label: string; icon: IconName }[] = [
  { kind: 'all', label: 'All', icon: 'library_books' },
  { kind: 'figure', label: 'Figures', icon: 'person' },
  { kind: 'garment', label: 'Clothing', icon: 'layers' },
  { kind: 'prop', label: 'Props', icon: 'category' },
  { kind: 'pose', label: 'Poses', icon: 'accessibility_new' },
];

function AssetCard({ asset }: { asset: AssetRecord }) {
  const remove = useLibrary((s) => s.remove);
  const snackbar = useSnackbar();
  return (
    <Card variant="filled" className="asset-card">
      {asset.thumbnail && <img className="asset-card__thumb" src={asset.thumbnail} alt="" draggable={false} />}
      <span className="asset-card__title">{asset.name}</span>
      <span className="asset-card__meta">
        {asset.kind === 'figure' ? `Figure · ${asset.size[1].toFixed(2)} m` : asset.kind === 'garment' ? 'Clothing' : asset.kind === 'pose' ? 'Pose' : 'Prop'}
        {asset.license ? ` · ${asset.license}` : ''}
      </span>
      <div className="asset-card__actions">
        {asset.kind === 'pose' ? (
          <Button variant="tonal" icon="accessibility_new" onClick={() => applyPoseSelected(asset.pose ?? {}, `Pose: ${asset.name}`) || snackbar('Select a figure first')}>
            Apply
          </Button>
        ) : (
          <Button variant="tonal" icon="add" onClick={() => addAssetToScene(asset)} disabled={asset.kind === 'garment'} title={asset.kind === 'garment' ? 'Dressing figures arrives in Phase 2' : undefined}>
            Add
          </Button>
        )}
        <Menu
          label={`${asset.name} actions`}
          items={[{ label: 'Delete from Library', icon: 'delete', danger: true, onSelect: () => remove(asset.id).then(() => snackbar(`Deleted ${asset.name}`)) }]}
          trigger={<IconButton icon="more_vert" label={`More actions for ${asset.name}`} />}
        />
      </div>
    </Card>
  );
}

function LibraryWorkspace() {
  const { assets, loaded, refresh } = useLibrary();
  const [filter, setFilter] = useState<(typeof LIBRARY_FILTERS)[number]['kind']>('all');
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  const shown = assets.filter((a) => (filter === 'all' || a.kind === filter) && a.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <div className="button-wrap">
        <Button variant="tonal" icon="upload" onClick={() => void startImport(false)}>Import files</Button>
        <Button variant="text" icon="folder_open" onClick={() => void startImport(true)}>Import a folder</Button>
      </div>
      <p className="hint">Or drag files, folders, or zips anywhere onto the app. glTF, FBX, OBJ, VRM, Collada, STL, and PLY.</p>
      <TextField label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chip-row">
        {LIBRARY_FILTERS.map((f) => (
          <FilterChip key={f.kind} label={f.label} icon={f.icon} selected={filter === f.kind} onToggle={() => setFilter(f.kind)} />
        ))}
      </div>
      {loaded && shown.length === 0 && <p className="empty">{assets.length ? 'Nothing matches.' : 'Nothing imported yet.'}</p>}
      <div className="card-grid">
        {shown.map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}
      </div>
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
      {scene.props.length > 0 && <ListSubheader>Props</ListSubheader>}
      {scene.props.map((p) => (
        <ListItem
          key={p.id}
          icon="category"
          headline={p.name}
          trailing={
            <Menu
              label={`${p.name} actions`}
              items={[{ label: 'Remove from scene', icon: 'delete', danger: true, onSelect: () => removeProp(p.id) }]}
              trigger={<IconButton icon="more_vert" label={`More actions for ${p.name}`} />}
            />
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

function PoseAdjustPanel() {
  const selectedId = useUi((s) => s.selectedFigureId);
  const joint = useUi((s) => s.selectedJoint);
  const mode = useUi((s) => s.poseMode);
  const limits = useUi((s) => s.jointLimits);
  const set = useUi((s) => s.set);
  const scene = useActiveScene();
  const snackbar = useSnackbar();
  const figure = scene.figures.find((f) => f.id === selectedId);
  const isEffector = !!joint && (EFFECTORS as string[]).includes(joint);
  const pinned = !!(joint && figure?.pins?.[joint]);
  return (
    <>
      {!figure ? (
        <p className="empty">Click a figure, or one of its joints, to pose it.</p>
      ) : (
        <p className="hint">
          <strong>{figure.name}</strong>
          {joint ? ` · ${jointLabel(joint)}` : ' · click a joint handle'}
        </p>
      )}
      <ListSubheader>Mode</ListSubheader>
      <SegmentedButtons
        label="Posing mode"
        value={mode}
        onChange={(m) => set({ poseMode: m })}
        segments={[
          { value: 'fk', label: 'Rotate joints', icon: '3d_rotation' },
          { value: 'ik', label: 'Move hands & feet', icon: 'open_with' },
        ]}
      />
      <p className="hint">{mode === 'ik' ? 'Select a hand or foot (yellow handles) and drag the arrows; the limb follows.' : 'Select a joint and drag the rings to rotate it.'} Shortcut: Q.</p>
      <Switch label="Joint limits" supporting="Keep joints within natural ranges" checked={limits} onChange={(v) => set({ jointLimits: v })} />
      <div className="button-wrap">
        <Button variant="tonal" icon="lock" disabled={!isEffector} onClick={() => togglePinSelected() || snackbar('Select a hand or foot to pin it')}>
          {pinned ? 'Unpin' : 'Pin'}
        </Button>
        <Button variant="tonal" icon="restart_alt" disabled={!joint} onClick={resetJointSelected}>Reset joint</Button>
      </div>
      <ListSubheader>Whole pose</ListSubheader>
      <div className="button-wrap">
        <Button variant="tonal" icon="sync_alt" disabled={!figure} onClick={mirrorSelected}>Mirror</Button>
        <Button variant="text" icon="arrow_forward" disabled={!figure} onClick={() => copySideSelected('left')}>Left to right</Button>
        <Button variant="text" icon="arrow_back" disabled={!figure} onClick={() => copySideSelected('right')}>Right to left</Button>
        <Button variant="text" icon="restart_alt" disabled={!figure} onClick={resetPoseSelected}>Reset pose</Button>
      </div>
      <ListSubheader>Hands</ListSubheader>
      {(['left', 'right'] as const).map((side) => (
        <div key={side}>
          <p className="hint">{side === 'left' ? 'Left hand' : 'Right hand'}</p>
          <div className="chip-row">
            {(Object.keys(HAND_PRESET_LABELS) as HandPreset[]).map((p) => (
              <AssistChip key={p} icon="pan_tool_alt" label={HAND_PRESET_LABELS[p]} disabled={!figure} onClick={() => handPresetSelected(side, p)} />
            ))}
          </div>
        </div>
      ))}
      <ListSubheader>Views</ListSubheader>
      <div className="button-wrap">
        <Button variant="text" icon="3d_rotation" onClick={() => setView('front')}>Front</Button>
        <Button variant="text" icon="3d_rotation" onClick={() => setView('left')}>Side</Button>
        <Button variant="text" icon="3d_rotation" onClick={() => setView('top')}>Top</Button>
        <Button variant="text" icon="center_focus_strong" onClick={() => viewportRef.current?.frameAll()}>Frame all</Button>
      </div>
    </>
  );
}

function PoseWorkspace() {
  const tab = useUi((s) => s.poseTab);
  const set = useUi((s) => s.set);
  return (
    <Tabs
      label="Pose tools"
      value={tab}
      onChange={(t) => set({ poseTab: t })}
      tabs={[
        { value: 'adjust', label: 'Adjust', icon: 'tune', content: <PoseAdjustPanel /> },
        { value: 'library', label: 'Library', icon: 'library_books', content: <PoseLibraryPanel /> },
        { value: 'mix', label: 'Blend & random', icon: 'casino', content: <PoseMixPanel /> },
      ]}
    />
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
