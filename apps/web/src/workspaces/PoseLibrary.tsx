import type { AssetRecord, CanonicalPose } from '@poser/core';
import { poseToBvh, poseToJson, poseToVrma } from '@poser/importers';
import { BUILTIN_POSES, POSE_CATEGORY_LABELS, RANDOM_LOCK_LABELS, blendPoses, poseThumbnailUrl, type PoseCategory, type RandomLock } from '@poser/posing';
import { Button, Dialog, FilterChip, IconButton, ListSubheader, Menu, Slider, TextField, useSnackbar, type MenuEntry } from '@poser/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { download } from '../actions';
import { startImport } from '../import/startImport';
import { useLibrary } from '../state/library';
import { useActiveScene } from '../state/project';
import { useUi } from '../state/ui';
import { viewportRef } from '../viewport/ViewportView';
import { applyPoseSelected, randomPoseSelected, savePoseToLibrary, selectedFigure } from './posing';

/** A pose the library can show: built-in or saved by the user. */
interface PoseEntry {
  id: string;
  name: string;
  category: PoseCategory | 'mine';
  pose: CanonicalPose;
  thumbnail: string;
  asset?: AssetRecord;
}

const builtinThumbs = new Map<string, string>();

function useAllPoses(): PoseEntry[] {
  const { assets, loaded, refresh } = useLibrary();
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  return useMemo(() => {
    const mine: PoseEntry[] = assets
      .filter((a) => a.kind === 'pose' && a.pose)
      .map((a) => ({ id: a.id, name: a.name, category: 'mine', pose: a.pose!, thumbnail: a.thumbnail ?? poseThumbnailUrl(a.pose!), asset: a }));
    const builtin: PoseEntry[] = BUILTIN_POSES.map((p) => {
      if (!builtinThumbs.has(p.id)) builtinThumbs.set(p.id, poseThumbnailUrl(p.pose));
      return { ...p, thumbnail: builtinThumbs.get(p.id)! };
    });
    return [...mine, ...builtin];
  }, [assets]);
}

export type PoseExportFormat = 'bvh' | 'vrma' | 'json';

export function exportPose(name: string, pose: CanonicalPose, format: PoseExportFormat): void {
  const base = name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'pose';
  if (format === 'bvh') download(new Blob([poseToBvh(pose)], { type: 'text/plain' }), `${base}.bvh`);
  else if (format === 'vrma') download(new Blob([poseToVrma(pose)], { type: 'model/gltf-binary' }), `${base}.vrma`);
  else download(new Blob([poseToJson(name, pose)], { type: 'application/json' }), `${base}.pose.json`);
}

function exportItems(name: string, pose: () => CanonicalPose | undefined): MenuEntry[] {
  const go = (f: PoseExportFormat) => () => {
    const p = pose();
    if (p) exportPose(name, p, f);
  };
  return [
    { label: 'Export as BVH', icon: 'download', onSelect: go('bvh') },
    { label: 'Export as VRMA', icon: 'download', onSelect: go('vrma') },
    { label: 'Export as pose JSON', icon: 'download', onSelect: go('json') },
  ];
}

function SavePoseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const snackbar = useSnackbar();
  useEffect(() => {
    if (open) setName(`${selectedFigure()?.name ?? 'Figure'} pose`);
  }, [open]);
  const save = async () => {
    const fig = selectedFigure();
    if (!fig) return;
    await savePoseToLibrary(name, fig.pose);
    onOpenChange(false);
    snackbar(`Saved “${name.trim() || 'Pose'}” to the Library`);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save pose"
      icon="bookmark_add"
      actions={
        <>
          <Button variant="text" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="filled" onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <p>Saved poses work on every figure, built-in or imported.</p>
      <TextField label="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
    </Dialog>
  );
}

function PoseTile({ entry, onApply, selected }: { entry: PoseEntry; onApply: () => void; selected?: boolean }) {
  const remove = useLibrary((s) => s.remove);
  const snackbar = useSnackbar();
  return (
    <div className="pose-tile" data-selected={selected || undefined}>
      <button type="button" className="pose-tile__button md-state" onClick={onApply} aria-pressed={selected}>
        <img src={entry.thumbnail} alt="" draggable={false} />
        <span>{entry.name}</span>
      </button>
      <Menu
        label={`${entry.name} actions`}
        items={[
          ...exportItems(entry.name, () => entry.pose),
          ...(entry.asset
            ? ([
                { kind: 'divider' },
                { label: 'Delete from Library', icon: 'delete', danger: true, onSelect: () => remove(entry.id).then(() => snackbar(`Deleted ${entry.name}`)) },
              ] as MenuEntry[])
            : []),
        ]}
        trigger={<IconButton icon="more_vert" label={`More actions for ${entry.name}`} className="pose-tile__more" />}
      />
    </div>
  );
}

const CATEGORIES: (PoseCategory | 'all' | 'mine')[] = ['all', 'mine', ...(Object.keys(POSE_CATEGORY_LABELS) as PoseCategory[])];

/** Pose library tab (PLAN.md section 6): built-in and saved poses, save, import, export. */
export function PoseLibraryPanel() {
  const poses = useAllPoses();
  const selectedId = useUi((s) => s.selectedFigureId);
  useActiveScene();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [saveOpen, setSaveOpen] = useState(false);
  const snackbar = useSnackbar();
  const shown = poses.filter((p) => category === 'all' || p.category === category);
  const apply = (p: PoseEntry) => {
    if (!applyPoseSelected(p.pose, `Pose: ${p.name}`)) snackbar('Select a figure first');
  };
  const current = selectedFigure();
  return (
    <>
      {!selectedId && <p className="empty">Select a figure, then pick a pose.</p>}
      <div className="button-wrap">
        <Button variant="tonal" icon="bookmark_add" disabled={!selectedId} onClick={() => setSaveOpen(true)}>Save pose</Button>
        <Button variant="text" icon="upload" onClick={() => void startImport(false, undefined, '.bvh,.vrma,.json')}>Import</Button>
        <Menu
          label="Export the current pose"
          items={exportItems(current ? `${current.name} pose` : 'pose', () => selectedFigure()?.pose)}
          trigger={
            <Button variant="text" icon="download" disabled={!selectedId}>
              Export
            </Button>
          }
        />
      </div>
      <p className="hint">BVH and VRMA files (single frames from animations), and Poser pose files.</p>
      <div className="chip-row">
        {CATEGORIES.map((c) => (
          <FilterChip key={c} label={c === 'all' ? 'All' : c === 'mine' ? 'My poses' : POSE_CATEGORY_LABELS[c]} selected={category === c} onToggle={() => setCategory(c)} />
        ))}
      </div>
      {category === 'mine' && !shown.length && <p className="empty">No saved poses yet. Pose a figure, then Save pose.</p>}
      <div className="pose-grid">
        {shown.map((p) => (
          <PoseTile key={p.id} entry={p} onApply={() => apply(p)} />
        ))}
      </div>
      <SavePoseDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </>
  );
}

const LOCKS = Object.keys(RANDOM_LOCK_LABELS) as RandomLock[];

/** Blend and random tab (PLAN.md section 17: pose blending, randomizers). */
export function PoseMixPanel() {
  const poses = useAllPoses();
  const selectedId = useUi((s) => s.selectedFigureId);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState(0.5);
  const [locks, setLocks] = useState<RandomLock[]>([]);
  const snackbar = useSnackbar();
  // One undo step per blending session (until the selection changes).
  const session = useRef(0);
  const picked = poses.filter((p) => weights[p.id] !== undefined);
  const preview = (next: Record<string, number>) => {
    setWeights(next);
    const entries = poses.filter((p) => next[p.id] !== undefined).map((p) => ({ pose: p.pose, weight: next[p.id]! }));
    if (entries.length && entries.some((e) => e.weight > 0)) applyPoseSelected(blendPoses(entries), 'Blend poses', `pose-blend-${session.current}`);
  };
  const toggle = (p: PoseEntry) => {
    session.current++;
    const next = { ...weights };
    if (next[p.id] !== undefined) delete next[p.id];
    else if (Object.keys(next).length >= 4) {
      snackbar('Blend up to four poses');
      return;
    } else next[p.id] = Object.keys(next).length ? 0.5 : 1;
    preview(next);
  };
  return (
    <>
      {!selectedId && <p className="empty">Select a figure to blend or randomise its pose.</p>}
      <ListSubheader>Blend poses</ListSubheader>
      <p className="hint">Pick two or more poses, then mix them with the sliders.</p>
      {picked.map((p) => (
        <Slider
          key={p.id}
          label={p.name}
          value={weights[p.id]!}
          min={0}
          max={1}
          step={0.01}
          displayScale={100}
          unit="%"
          disabled={!selectedId}
          onChange={(v) => preview({ ...weights, [p.id]: v })}
        />
      ))}
      <div className="pose-grid pose-grid--small">
        {poses.map((p) => (
          <PoseTile key={p.id} entry={p} selected={weights[p.id] !== undefined} onApply={() => (selectedId ? toggle(p) : snackbar('Select a figure first'))} />
        ))}
      </div>
      <ListSubheader>Random</ListSubheader>
      <Slider label="How far joints move" value={amount} min={0.1} max={1} step={0.05} displayScale={100} unit="%" onChange={setAmount} />
      <p className="hint">Keep fixed:</p>
      <div className="chip-row">
        {LOCKS.map((l) => (
          <FilterChip key={l} label={RANDOM_LOCK_LABELS[l]} icon="lock" selected={locks.includes(l)} onToggle={() => setLocks(locks.includes(l) ? locks.filter((x) => x !== l) : [...locks, l])} />
        ))}
      </div>
      <div className="button-wrap">
        <Button variant="tonal" icon="casino" disabled={!selectedId} onClick={() => randomPoseSelected(amount, locks)}>Random pose</Button>
        <Button variant="text" icon="videocam" onClick={() => viewportRef.current?.randomView()}>Random camera</Button>
      </div>
    </>
  );
}
