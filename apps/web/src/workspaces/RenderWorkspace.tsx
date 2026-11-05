import { activeScene, DEFAULT_SUN, LIGHTING_PRESETS, type HdriSettings, type LightingPresetId, type Light, type Project, type SunSettings } from '@poser/core';
import { STUDY_MODE_LABELS, type StudyMode } from '@poser/render';
import { Button, FilterChip, IconButton, ListItem, ListSubheader, Menu, Slider, Switch, useSnackbar } from '@poser/ui';
import { captureScreenshot } from '../actions';
import { startImport } from '../import/startImport';
import { useLibrary } from '../state/library';
import { editProject, useActiveScene } from '../state/project';
import { useUi } from '../state/ui';
import { setView } from '../viewport/ViewportView';
import { addCameraBookmark, applyLightingPreset, goToCameraBookmark, removeCameraBookmark, setSun } from './staging';

const LENSES = [24, 35, 50, 85, 135];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function SunControls({ sun }: { sun: SunSettings }) {
  const set = (patch: Partial<SunSettings>) => setSun({ ...sun, ...patch });
  return (
    <>
      <Slider label="Time of day" value={sun.hour} min={0} max={24} step={0.25} onChange={(v) => set({ hour: v })} format={formatHour} />
      <Slider label="Time of year" value={sun.day} min={1} max={365} step={1} onChange={(v) => set({ day: Math.round(v) })} format={(d) => MONTHS[Math.min(11, Math.floor(((d - 1) / 365) * 12))]!} />
      <Slider label="Latitude" value={sun.latitude} min={-60} max={70} step={1} unit="°" onChange={(v) => set({ latitude: v })} />
      <Slider label="North direction" value={sun.north} min={0} max={359} step={1} unit="°" onChange={(v) => set({ north: v })} />
    </>
  );
}

export function RenderWorkspace() {
  const scene = useActiveScene();
  const snackbar = useSnackbar();
  const studyMode = useUi((s) => s.studyMode);
  const threshold = useUi((s) => s.notanThreshold);
  const lens = useUi((s) => s.lens);
  const overlay = useUi((s) => s.overlay);
  const set = useUi((s) => s.set);
  const lighting = scene.environment.lighting ?? 'studio';
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
      <ListSubheader>Lighting</ListSubheader>
      <div className="chip-row">
        {(Object.keys(LIGHTING_PRESETS) as LightingPresetId[]).map((id) => (
          <FilterChip key={id} label={LIGHTING_PRESETS[id].name} selected={lighting === id} onToggle={() => applyLightingPreset(id, LIGHTING_PRESETS[id].name)} />
        ))}
        <FilterChip label="Time of day" icon="wb_sunny" selected={lighting === 'sun'} onToggle={() => setSun(scene.environment.sun ?? DEFAULT_SUN)} />
      </div>
      <p className="hint">{lighting === 'sun' ? 'Sun and sky from the time, season, and place.' : (LIGHTING_PRESETS[lighting as LightingPresetId]?.description ?? 'Custom lighting.')} Lights are placed around the selected figure.</p>
      {lighting === 'sun' && <SunControls sun={scene.environment.sun ?? DEFAULT_SUN} />}
      <LightList lights={scene.lights} setIntensity={setIntensity} />
      <EnvironmentLight />

      <ListSubheader>Camera</ListSubheader>
      <div className="chip-row">
        {LENSES.map((mm) => (
          <FilterChip key={mm} label={`${mm} mm`} selected={lens === mm} onToggle={() => set({ lens: mm })} />
        ))}
        <FilterChip label="Orthographic" selected={lens === null} onToggle={() => set({ lens: null })} />
      </div>
      <p className="hint">{lens === null ? 'No perspective: true proportions for front, side, and top views.' : lens >= 85 ? 'Long lens: flatter, flattering perspective.' : lens <= 24 ? 'Wide lens: strong, dramatic perspective.' : 'Natural perspective.'}</p>
      <div className="button-wrap">
        <Button variant="text" icon="3d_rotation" onClick={() => setView('front')}>Front</Button>
        <Button variant="text" icon="3d_rotation" onClick={() => setView('left')}>Side</Button>
        <Button variant="text" icon="3d_rotation" onClick={() => setView('top')}>Top</Button>
      </div>
      <p className="hint">Guides</p>
      <div className="chip-row">
        <FilterChip label="None" selected={overlay === 'none'} onToggle={() => set({ overlay: 'none' })} />
        <FilterChip label="Rule of thirds" icon="grid_on" selected={overlay === 'thirds'} onToggle={() => set({ overlay: 'thirds' })} />
        <FilterChip label="Golden ratio" icon="grid_on" selected={overlay === 'golden'} onToggle={() => set({ overlay: 'golden' })} />
      </div>
      <p className="hint">Saved views</p>
      {scene.cameras.map((c) => (
        <ListItem
          key={c.id}
          headline={c.name}
          supporting={c.focalLength === null ? 'Orthographic' : `${c.focalLength} mm`}
          icon="videocam"
          onClick={() => goToCameraBookmark(c)}
          trailing={
            <Menu
              label={`${c.name} actions`}
              items={[{ label: 'Delete view', icon: 'delete', danger: true, onSelect: () => removeCameraBookmark(c.id) }]}
              trigger={<IconButton icon="more_vert" label={`More actions for ${c.name}`} onClick={(e) => e.stopPropagation()} />}
            />
          }
        />
      ))}
      <Button variant="tonal" icon="bookmark_add" onClick={() => addCameraBookmark(`View ${scene.cameras.length + 1}`)}>Save this view</Button>

      <ListSubheader>Study mode</ListSubheader>
      <div className="chip-row">
        {(Object.keys(STUDY_MODE_LABELS) as StudyMode[]).map((m) => (
          <FilterChip key={m} label={STUDY_MODE_LABELS[m]} selected={studyMode === m} onToggle={() => set({ studyMode: m })} />
        ))}
      </div>
      {(studyMode === 'notan2' || studyMode === 'notan3') && (
        <Slider label="Light / shadow split" value={threshold} min={0.05} max={0.95} step={0.01} displayScale={100} unit="%" onChange={(v) => set({ notanThreshold: v })} />
      )}

      <ReferenceSection />

      <ListSubheader>Capture</ListSubheader>
      <Button variant="tonal" icon="photo_camera" onClick={() => captureScreenshot().then(() => snackbar('Screenshot saved'), (e: Error) => snackbar(e.message))}>
        Save screenshot
      </Button>
    </>
  );
}

/** Lights: pick one to move it with the gizmo in the view, or change its strength and colour. */
function LightList({ lights, setIntensity }: { lights: Light[]; setIntensity: (l: Light, v: number) => void }) {
  const selected = useUi((s) => s.selectedLightId);
  const set = useUi((s) => s.set);
  const edit = (light: Light, label: string, patch: Partial<Light>, key?: string) =>
    editProject(
      label,
      (p) => {
        const scene = activeScene(p as Project);
        const l = scene.lights.find((x) => x.id === light.id);
        if (!l) return;
        Object.assign(l, patch);
        scene.environment.lighting = 'custom';
      },
      key ? { coalesceKey: key } : undefined,
    );
  return (
    <>
      <p className="hint">Click a light (or its yellow handle in the view) to move it with the arrows.</p>
      {lights.map((l) => {
        const movable = l.type !== 'ambient' && l.type !== 'hemisphere';
        const isSel = selected === l.id;
        return (
          <div key={l.id}>
            <ListItem
              icon={movable ? 'lightbulb' : 'wb_sunny'}
              headline={l.name}
              supporting={movable ? (l.castShadow ? 'Casts shadows' : 'Directional') : 'Fills the whole scene'}
              selected={isSel}
              onClick={() => set({ selectedLightId: isSel ? null : l.id })}
            />
            <Slider label={`${l.name} strength`} value={l.intensity} min={0} max={movable ? 6 : 3} step={0.05} onChange={(v) => setIntensity(l, v)} disabled={!l.visible} />
            {isSel && (
              <div className="button-wrap">
                <label className="color-field">
                  <input type="color" value={l.color} onChange={(e) => edit(l, 'Light colour', { color: e.target.value }, `light-color-${l.id}`)} />
                  <span>Colour</span>
                </label>
                {movable && <Switch label="Shadows" checked={l.castShadow} onChange={(v) => edit(l, v ? 'Light shadows on' : 'Light shadows off', { castShadow: v })} />}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

const BUILTIN_HDRIS: { id: string; label: string }[] = [
  { id: 'builtin:studio', label: 'Studio' },
  { id: 'builtin:sky', label: 'Open sky' },
];

/** Image-based lighting from an HDRI (PLAN.md section 18): bundled CC0 ones or the user's own from the Library. */
function EnvironmentLight() {
  const scene = useActiveScene();
  const assets = useLibrary((s) => s.assets);
  const library = assets.filter((a) => a.kind === 'environment');
  const hdri = scene.environment.hdri ?? null;
  const update = (next: HdriSettings | null, label: string, key?: string) =>
    editProject(
      label,
      (p) => {
        activeScene(p as Project).environment.hdri = next;
      },
      key ? { coalesceKey: key } : undefined,
    );
  const choose = (source: string | null) => update(source ? { source, intensity: hdri?.intensity ?? 0.6, background: hdri?.background ?? false, rotation: hdri?.rotation ?? 0 } : null, source ? 'Environment light' : 'Environment light off');
  return (
    <>
      <p className="hint">Environment light (HDRI)</p>
      <div className="chip-row">
        <FilterChip label="None" selected={!hdri} onToggle={() => choose(null)} />
        {[...BUILTIN_HDRIS, ...library.map((a) => ({ id: a.id, label: a.name }))].map((h) => (
          <FilterChip key={h.id} label={h.label} selected={hdri?.source === h.id} onToggle={() => choose(h.id)} />
        ))}
      </div>
      {hdri && (
        <>
          <Slider label="Environment strength" value={hdri.intensity} min={0} max={3} step={0.05} onChange={(v) => update({ ...hdri, intensity: v }, 'Environment strength', 'hdri-intensity')} />
          <Slider label="Turn" value={hdri.rotation} min={0} max={359} step={1} unit="°" onChange={(v) => update({ ...hdri, rotation: v }, 'Turn environment', 'hdri-rotation')} />
          <Switch label="Show as background" checked={hdri.background} onChange={(v) => update({ ...hdri, background: v }, v ? 'Show environment' : 'Hide environment')} />
        </>
      )}
      <Button variant="text" icon="upload" onClick={() => void startImport(false, undefined, '.hdr,.exr')}>Load your own HDRI</Button>
    </>
  );
}

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Reference photo overlay and camera match (PLAN.md section 17.7). */
function ReferenceSection() {
  const reference = useUi((s) => s.reference);
  const mode = useUi((s) => s.referenceMode);
  const opacity = useUi((s) => s.referenceOpacity);
  const match = useUi((s) => s.cameraMatch);
  const height = useUi((s) => s.cameraHeight);
  const lens = useUi((s) => s.lens);
  const set = useUi((s) => s.set);
  const load = async () => {
    const file = await pickImage();
    if (!file) return;
    if (reference) URL.revokeObjectURL(reference.url);
    set({ reference: { url: URL.createObjectURL(file), name: file.name } });
  };
  const remove = () => {
    if (reference) URL.revokeObjectURL(reference.url);
    set({ reference: null, cameraMatch: false });
  };
  return (
    <>
      <ListSubheader>Reference image</ListSubheader>
      <div className="button-wrap">
        <Button variant="tonal" icon="upload" onClick={() => void load()}>{reference ? 'Change image' : 'Load image'}</Button>
        {reference && <Button variant="text" icon="delete" onClick={remove}>Remove</Button>}
      </div>
      {!reference && <p className="hint">Show a photo over the view to match a pose, or behind the scene to place figures into it. Kept for this session only.</p>}
      {reference && (
        <>
          <p className="hint">{reference.name}</p>
          <div className="chip-row">
            <FilterChip label="Over the view" selected={mode === 'over'} onToggle={() => set({ referenceMode: 'over' })} />
            <FilterChip label="Behind the scene" selected={mode === 'behind'} onToggle={() => set({ referenceMode: 'behind' })} />
          </div>
          {mode === 'over' ? (
            <Slider label="Image opacity" value={opacity} min={0.05} max={1} step={0.01} displayScale={100} unit="%" onChange={(v) => set({ referenceOpacity: v })} />
          ) : (
            <p className="hint">The floor turns invisible but still catches shadows, so figures sit in the photo. Captures include the photo.</p>
          )}
          <Switch
            label="Match camera"
            supporting="Drag the yellow line onto the photo's horizon, then set the lens and camera height"
            checked={match}
            onChange={(v) => set({ cameraMatch: v, ...(v && lens === null ? { lens: 50 } : {}) })}
          />
          {match && <Slider label="Camera height" value={height} min={0.2} max={3} step={0.01} unit="m" onChange={(v) => set({ cameraHeight: v })} />}
          {match && <p className="hint">Use the lens chips above to match the photo's field of view: the floor grid should line up with the floor in the photo.</p>}
        </>
      )}
    </>
  );
}
