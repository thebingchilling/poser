import type { AssetKind } from '@poser/core';
import { TRIANGLE_LIMITS, defaultChoices, finishImport, prepareImport, type ImportChoices, type ImportQuality, type ModelFormat, type PreparedImport } from '@poser/importers';
import { RIG_LABELS, type RigKind } from '@poser/rig';
import { Button, Dialog, LinearProgress, ListSubheader, SegmentedButtons, TextField, useSnackbar } from '@poser/ui';
import { useEffect, useMemo, useState } from 'react';
import { logError } from '@poser/platform';
import { addAssetToScene } from '../actions';
import { useLibrary } from '../state/library';
import { useImport } from './importStore';
import { useUi } from '../state/ui';
import { PoseStep } from './PoseStep';

const REQUIRED: [string, string][] = [
  ['hips', 'Hips'], ['spine', 'Spine'], ['chest', 'Chest'], ['head', 'Head'],
  ['leftUpperArm', 'Left upper arm'], ['leftLowerArm', 'Left forearm'], ['leftHand', 'Left hand'],
  ['rightUpperArm', 'Right upper arm'], ['rightLowerArm', 'Right forearm'], ['rightHand', 'Right hand'],
  ['leftUpperLeg', 'Left thigh'], ['leftLowerLeg', 'Left shin'], ['leftFoot', 'Left foot'],
  ['rightUpperLeg', 'Right thigh'], ['rightLowerLeg', 'Right shin'], ['rightFoot', 'Right foot'],
];
const OPTIONAL: [string, string][] = [
  ['upperChest', 'Upper chest'], ['neck', 'Neck'], ['leftShoulder', 'Left collarbone'], ['rightShoulder', 'Right collarbone'],
  ['leftToes', 'Left toes'], ['rightToes', 'Right toes'],
];

type Units = 'm' | 'cm' | 'mm' | 'in' | 'auto-small';
const UNIT_SCALE: Record<Exclude<Units, 'auto-small'>, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 };

function unitsOf(scale: number): Units {
  const hit = (Object.entries(UNIT_SCALE) as [Units, number][]).find(([, s]) => Math.abs(s - scale) < 1e-9);
  return hit ? hit[0] : 'auto-small';
}

function ModelStep({ prepared, onDone, onSkip }: { prepared: PreparedImport; onDone: () => void; onSkip: () => void }) {
  const snackbar = useSnackbar();
  const a = prepared.analysis;
  const [choices, setChoices] = useState<ImportChoices>(() => defaultChoices(prepared));
  const [busy, setBusy] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const set = (patch: Partial<ImportChoices>) => setChoices((c) => ({ ...c, ...patch }));

  // Size in the file's own units, so changing units recomputes the height.
  const raw = useMemo(() => {
    const n = a.normalisation;
    const [x, y, z] = a.size.map((v) => v / n.scale) as [number, number, number];
    return n.upAxis === 'z' ? { x, y: z, z: y } : { x, y, z };
  }, [a]);
  const n = choices.normalisation;
  const height = (n.upAxis === 'z' ? raw.z : raw.y) * n.scale;
  const units = unitsOf(n.scale);
  const boneNames = useMemo(() => a.bones.map((b) => b.name), [a]);
  const map = choices.rigMap ?? {};
  const mappedRequired = REQUIRED.filter(([k]) => map[k]).length;

  const doImport = async () => {
    setBusy('Starting');
    try {
      const record = await finishImport(prepared, choices, setBusy);
      await useLibrary.getState().refresh();
      snackbar({ text: `Imported ${record.name}`, actionLabel: 'Add to scene', onAction: () => addAssetToScene(record) });
      onDone();
    } catch (err) {
      logError(err, 'import');
      snackbar(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(null);
    }
  };

  return (
    <>
      <ListSubheader>What is it?</ListSubheader>
      <SegmentedButtons
        label="Asset type"
        value={choices.kind}
        onChange={(kind: AssetKind) => set({ kind })}
        segments={[
          { value: 'figure', label: 'Figure', icon: 'person', disabled: !a.rig },
          { value: 'prop', label: 'Prop', icon: 'category' },
          { value: 'garment', label: 'Clothing', icon: 'layers', disabled: !a.skinned },
        ]}
      />
      <p className="hint">
        {a.triangles.toLocaleString()} triangles in {a.meshes} mesh{a.meshes === 1 ? '' : 'es'}
        {a.morphs.length ? `, ${a.morphs.length} morphs` : ''}
        {a.bones.length ? `, ${a.bones.length} bones` : ''}.
      </p>

      {choices.kind === 'figure' && a.rig && (
        <>
          <ListSubheader>Skeleton</ListSubheader>
          <p className="hint">
            {RIG_LABELS[a.rig.kind as RigKind]}: {mappedRequired} of {REQUIRED.length} main bones matched.
            {mappedRequired < REQUIRED.length ? ' Match the rest below so posing works.' : ''}
          </p>
          <Button variant="text" icon="edit" onClick={() => setShowMapping((v) => !v)}>
            {showMapping ? 'Hide bone matching' : 'Check bone matching'}
          </Button>
          {(showMapping || mappedRequired < REQUIRED.length) && (
            <div className="bone-map">
              {[...REQUIRED, ...OPTIONAL].map(([canon, label]) => (
                <label key={canon} className="bone-map__row" data-missing={!map[canon] && REQUIRED.some(([k]) => k === canon) ? true : undefined}>
                  <span>{label}</span>
                  <select
                    value={map[canon]?.bone ?? ''}
                    onChange={(e) => {
                      const next = { ...map };
                      if (e.target.value) next[canon] = { bone: e.target.value };
                      else delete next[canon];
                      set({ rigMap: next });
                    }}
                  >
                    <option value="">(none)</option>
                    {boneNames.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <ListSubheader>Size</ListSubheader>
      <p className="hint">
        {choices.kind === 'figure' ? 'Height' : 'Largest size'}: <strong>{(choices.kind === 'figure' ? height : Math.max(raw.x, raw.y, raw.z) * n.scale).toFixed(2)} m</strong> ({n.reason.toLowerCase()}). Does that look right?
      </p>
      <SegmentedButtons
        label="Units in the file"
        value={units}
        onChange={(u: Units) => u !== 'auto-small' && set({ normalisation: { ...n, scale: UNIT_SCALE[u], reason: `Set to ${u}` } })}
        segments={[
          { value: 'm', label: 'Metres' },
          { value: 'cm', label: 'cm' },
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'Inches' },
        ]}
      />
      <div className="button-wrap">
        <SegmentedButtons
          label="Up axis"
          value={n.upAxis}
          onChange={(upAxis: 'y' | 'z') => set({ normalisation: { ...n, upAxis } })}
          segments={[
            { value: 'y', label: 'Y up' },
            { value: 'z', label: 'Z up' },
          ]}
        />
      </div>

      <ListSubheader>Quality</ListSubheader>
      <SegmentedButtons
        label="Import quality"
        value={choices.quality}
        onChange={(quality: ImportQuality) => set({ quality })}
        segments={[
          { value: 'high', label: 'High (4K textures)' },
          { value: 'balanced', label: 'Balanced (2K)' },
          { value: 'light', label: 'Light (1K)' },
        ]}
      />
      <p className="hint">
        {choices.quality === 'high'
          ? 'Keeps every triangle.'
          : `Meshes over ${(TRIANGLE_LIMITS[choices.quality] / 1000).toFixed(0)}k triangles are simplified (this model has ${(a.triangles / 1000).toFixed(0)}k).`}{' '}
        Morphs that move nothing are removed.
      </p>

      <ListSubheader>Details</ListSubheader>
      <TextField label="Name" value={choices.name} onChange={(e) => set({ name: e.target.value })} />
      <TextField label="Creator (optional)" value={choices.creator ?? ''} onChange={(e) => set({ creator: e.target.value || undefined })} />
      <TextField label="License (optional)" supporting="For example: Daz Standard License, CC-BY 4.0" value={choices.license ?? ''} onChange={(e) => set({ license: e.target.value || undefined })} />

      {prepared.loaded.warnings.length > 0 && (
        <>
          <ListSubheader>Warnings</ListSubheader>
          <ul className="warnings">
            {[...new Set(prepared.loaded.warnings)].slice(0, 8).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      )}

      <div className="wizard-actions">
        {busy && <LinearProgress label={busy} />}
        {busy && <span className="hint">{busy}…</span>}
        <div className="button-wrap">
          <Button variant="text" icon="info" onClick={() => useUi.getState().set({ dazGuideOpen: true })}>
            Daz export guide
          </Button>
          <Button variant="text" onClick={onSkip} disabled={!!busy}>
            Skip
          </Button>
          <Button icon="download" onClick={doImport} disabled={!!busy || !choices.name.trim() || (choices.kind === 'figure' && mappedRequired < 8)}>
            Import
          </Button>
        </div>
      </div>
    </>
  );
}

export function ImportWizard() {
  const { vfs, items, index, next, close } = useImport();
  const item = items[index];
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrepared(null);
    setError(null);
    if (!vfs || !item) return;
    if (item.role.kind === 'pose') return;
    if (item.role.kind !== 'model') {
      setError('This file type can’t be imported.');
      return;
    }
    let cancelled = false;
    prepareImport(vfs, item.path, item.role.format as ModelFormat).then(
      (p) => !cancelled && setPrepared(p),
      (err: unknown) => {
        logError(err, 'import');
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [vfs, item]);

  if (!vfs || !item) return null;
  const title = `Import ${item.path.split('/').pop()}${items.length > 1 ? ` (${index + 1} of ${items.length})` : ''}`;
  return (
    <Dialog open onOpenChange={(o) => !o && close()} title={title} icon="download" large>
      {item.role.kind === 'pose' && <PoseStep key={item.path} vfs={vfs} path={item.path} onDone={next} />}
      {item.role.kind !== 'pose' && !prepared && !error && (
        <>
          <LinearProgress label="Reading file" />
          <p className="hint">Reading the file and looking at its skeleton…</p>
        </>
      )}
      {error && (
        <>
          <p>{error}</p>
          <div className="button-wrap">
            <Button onClick={next}>{index + 1 < items.length ? 'Next file' : 'Close'}</Button>
          </div>
        </>
      )}
      {prepared && <ModelStep key={item.path} prepared={prepared} onDone={next} onSkip={next} />}
    </Dialog>
  );
}
