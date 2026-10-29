import { importPoseFile, type ImportedPose, type VirtualFiles } from '@poser/importers';
import { logError } from '@poser/platform';
import { poseThumbnailUrl } from '@poser/posing';
import { Button, LinearProgress, Slider, TextField, useSnackbar } from '@poser/ui';
import { useEffect, useState } from 'react';
import { useUi } from '../state/ui';
import { applyPoseSelected, savePoseToLibrary } from '../workspaces/posing';

/**
 * Import wizard step for pose files (PLAN.md sections 4.2 and 6): BVH and
 * VRMA single frames (pick the frame from an animation) and pose JSON.
 */
export function PoseStep({ vfs, path, onDone }: { vfs: VirtualFiles; path: string; onDone: () => void }) {
  const snackbar = useSnackbar();
  const hasFigure = useUi((s) => !!s.selectedFigureId);
  const [frame, setFrame] = useState(0);
  const [result, setResult] = useState<(ImportedPose & { name: string }) | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const format = path.toLowerCase().endsWith('.bvh') ? 'bvh' : path.toLowerCase().endsWith('.vrma') ? 'vrma' : 'pose-json';

  useEffect(() => {
    const blob = vfs.get(path);
    if (!blob) return setError('The file is missing.');
    let cancelled = false;
    importPoseFile(path, blob, frame).then(
      (r) => {
        if (cancelled) return;
        setResult(r);
        setName((n) => n || r.name);
      },
      (err: unknown) => {
        logError(err, 'import');
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [vfs, path, frame]);

  if (error)
    return (
      <>
        <p>{error}</p>
        <div className="button-wrap">
          <Button onClick={onDone}>Skip</Button>
        </div>
      </>
    );
  if (!result) return <LinearProgress label="Reading pose" />;
  const save = async () => {
    await savePoseToLibrary(name, result.pose, path.split('/').pop() ?? path, format);
    snackbar(`Saved “${name.trim() || 'Pose'}” to the Library`);
    onDone();
  };
  return (
    <div className="pose-import">
      <img className="pose-import__thumb" src={poseThumbnailUrl(result.pose, { size: 240 })} alt="Pose preview" />
      <div className="pose-import__fields">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        {result.frameCount > 1 && (
          <Slider label={`Frame (of ${result.frameCount})`} value={frame} min={0} max={result.frameCount - 1} step={1} onChange={(v) => setFrame(Math.round(v))} format={(v) => String(Math.round(v) + 1)} />
        )}
        {result.frameCount > 1 && <p className="hint">This file is an animation; pick the frame to keep as a pose.</p>}
        {result.warnings.map((w) => (
          <p key={w} className="hint">{w}</p>
        ))}
        <div className="button-wrap">
          <Button variant="text" onClick={onDone}>Skip</Button>
          <Button variant="tonal" icon="accessibility_new" disabled={!hasFigure} onClick={() => applyPoseSelected(result.pose, `Pose: ${name.trim() || result.name}`)} title={hasFigure ? undefined : 'Select a figure first'}>
            Try on figure
          </Button>
          <Button icon="bookmark_add" onClick={() => void save()}>Save to Library</Button>
        </div>
      </div>
    </div>
  );
}
