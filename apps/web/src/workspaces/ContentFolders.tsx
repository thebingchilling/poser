import { DirectorySource } from '@poser/importers';
import { Button, Dialog, IconButton, LinearProgress, ListItem, ListSubheader, Menu, TextField, useSnackbar } from '@poser/ui';
import { useEffect, useState } from 'react';
import { useImport } from '../import/importStore';
import { folderPickerSupported, useContentFolders, type ContentFolder, type FolderKind } from '../state/contentFolders';

const KIND_LABEL: Record<FolderKind, string> = { daz: 'Daz content library', vam: 'VaM folder', other: 'Models folder' };

/** What to list when browsing each kind of folder. */
const BROWSE: Record<FolderKind, { dirs: string[]; match: (name: string) => boolean; hint: string }> = {
  daz: { dirs: ['People'], match: (n) => /\.duf$/i.test(n), hint: 'Figures, characters, and outfits saved as Daz scenes or presets (.duf).' },
  vam: { dirs: ['AddonPackages', 'Saves'], match: (n) => /\.(var|json)$/i.test(n), hint: 'VaM packages (.var) and saved scenes.' },
  other: { dirs: [''], match: (n) => /\.(glb|gltf|fbx|obj|vrm|dae|stl|ply|3ds|3mf|usdz|duf)$/i.test(n), hint: 'Model files.' },
};

function BrowseDialog({ folder, onClose }: { folder: ContentFolder; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const start = useImport((s) => s.start);
  const snackbar = useSnackbar();
  useEffect(() => {
    const src = new DirectorySource(folder.handle);
    const b = BROWSE[folder.kind];
    let cancelled = false;
    void Promise.all(b.dirs.map((d) => src.list(d, b.match))).then((lists) => !cancelled && setFiles(lists.flat().sort()));
    return () => {
      cancelled = true;
    };
  }, [folder]);
  const shown = (files ?? []).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 200);
  const open = async (path: string) => {
    const blob = await new DirectorySource(folder.handle).read(path);
    if (!blob) return snackbar('That file is no longer there');
    onClose();
    await start([{ path, file: new File([blob], path.split('/').pop()!) }]);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={folder.handle.name} icon="folder_open" large actions={<Button variant="text" onClick={onClose}>Close</Button>}>
      <p className="hint">{BROWSE[folder.kind].hint}</p>
      <TextField label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!files && <LinearProgress label="Reading the folder" />}
      {files && !files.length && <p className="empty">Nothing to import found here.</p>}
      {shown.map((f) => (
        <ListItem key={f} icon="person" headline={f.split('/').pop()!.replace(/\.[^.]+$/, '')} supporting={f} onClick={() => void open(f)} />
      ))}
      {files && files.length > shown.length && <p className="hint">Showing {shown.length} of {files.length}; search to narrow it down.</p>}
    </Dialog>
  );
}

/** Library folders in the Library workspace (PLAN.md section 4.1). */
export function ContentFoldersSection() {
  const { folders, add, remove, grantAll } = useContentFolders();
  const [browsing, setBrowsing] = useState<ContentFolder | null>(null);
  const supported = folderPickerSupported();
  const browse = async (f: ContentFolder) => {
    if (!f.granted && !(await grantAll())) return;
    setBrowsing(useContentFolders.getState().folders.find((x) => x.handle === f.handle) ?? f);
  };
  return (
    <>
      <ListSubheader>Content folders</ListSubheader>
      <p className="hint">Give Poser read access to your Daz content library or VaM folder, so Daz scenes and VaM looks import with everything they use.</p>
      {folders.map((f) => (
        <ListItem
          key={f.handle.name + f.kind}
          icon="folder_open"
          headline={f.handle.name}
          supporting={`${KIND_LABEL[f.kind]}${f.granted ? '' : ' · needs access again'}`}
          onClick={() => void browse(f)}
          trailing={
            <Menu
              label={`${f.handle.name} actions`}
              items={[
                { label: 'Browse', icon: 'folder_open', onSelect: () => void browse(f) },
                { label: 'Remove', icon: 'delete', danger: true, onSelect: () => void remove(f) },
              ]}
              trigger={<IconButton icon="more_vert" label={`More actions for ${f.handle.name}`} onClick={(e) => e.stopPropagation()} />}
            />
          }
        />
      ))}
      {supported ? (
        <div className="button-wrap">
          <Button variant="tonal" icon="folder_open" onClick={() => void add('daz')}>Add Daz library</Button>
          <Button variant="text" icon="folder_open" onClick={() => void add('vam')}>Add VaM folder</Button>
        </div>
      ) : (
        <p className="hint">This browser can’t open folders. Drop a Daz scene together with its library folders onto the app instead.</p>
      )}
      {browsing && <BrowseDialog folder={browsing} onClose={() => setBrowsing(null)} />}
    </>
  );
}
