import { activeScene, createId, saveAsset, type Project } from '@poser/core';
import { readHdri, type VirtualFiles } from '@poser/importers';
import { logError } from '@poser/platform';
import { Button, LinearProgress, TextField, useSnackbar } from '@poser/ui';
import { useEffect, useState } from 'react';
import { useLibrary } from '../state/library';
import { editProject } from '../state/project';

/** Import wizard step for HDRI files: saved to the Library as an environment, optionally used straight away. */
export function EnvironmentStep({ vfs, path, onDone }: { vfs: VirtualFiles; path: string; onDone: () => void }) {
  const snackbar = useSnackbar();
  const fileName = path.split('/').pop()!;
  const [name, setName] = useState(fileName.replace(/\.(hdr|exr)$/i, '').replace(/[_-]+/g, ' '));
  const [info, setInfo] = useState<{ thumbnail: string; size: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void vfs
      .get(path)!
      .arrayBuffer()
      .then((buf) => {
        const hdri = readHdri(buf, fileName);
        const canvas = document.createElement('canvas');
        canvas.width = hdri.preview.width;
        canvas.height = hdri.preview.height;
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(hdri.preview.data), hdri.preview.width, hdri.preview.height), 0, 0);
        if (!cancelled) setInfo({ thumbnail: canvas.toDataURL('image/webp', 0.85), size: `${hdri.width} × ${hdri.height}` });
      })
      .catch((err: unknown) => {
        logError(err, 'import');
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, path, fileName]);

  const save = async (use: boolean) => {
    const id = createId('asset');
    const stored = /\.exr$/i.test(fileName) ? 'environment.exr' : 'environment.hdr';
    await saveAsset(
      {
        id,
        kind: 'environment',
        name: name.trim() || 'Environment',
        sourceName: fileName,
        format: stored.split('.').pop()!,
        importedAt: Date.now(),
        tags: [],
        morphs: [],
        size: [0, 0, 0],
        triangles: 0,
        thumbnail: info?.thumbnail,
        files: [stored],
      },
      { [stored]: vfs.get(path)! },
    );
    await useLibrary.getState().refresh();
    if (use)
      editProject('Environment light', (p) => {
        const env = activeScene(p as Project).environment;
        env.hdri = { source: id, intensity: env.hdri?.intensity ?? 0.6, background: env.hdri?.background ?? true, rotation: 0 };
      });
    snackbar(`Saved ${name.trim() || 'Environment'} to the Library`);
    onDone();
  };

  if (error)
    return (
      <>
        <p>{error}</p>
        <div className="button-wrap">
          <Button onClick={onDone}>Skip</Button>
        </div>
      </>
    );
  if (!info) return <LinearProgress label="Reading the HDR image" />;
  return (
    <div className="pose-import">
      <img className="hdri-preview" src={info.thumbnail} alt="Environment preview" />
      <div className="pose-import__fields">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="hint">Environment light, {info.size}. It lights the scene and can be shown behind it.</p>
        <div className="button-wrap">
          <Button variant="text" onClick={onDone}>Skip</Button>
          <Button variant="tonal" icon="bookmark_add" onClick={() => void save(false)}>Save to Library</Button>
          <Button icon="lightbulb" onClick={() => void save(true)}>Use as lighting</Button>
        </div>
      </div>
    </div>
  );
}
