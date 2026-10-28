import { listProjects, type ProjectSummary } from '@poser/core';
import { Button, Dialog, ListItem, TextField, useSnackbar } from '@poser/ui';
import { useEffect, useState } from 'react';
import { openProjectById, renameProject } from '../actions';
import { useProject } from '../state/project';

export function OpenProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const currentId = useProject((s) => s.project.id);
  const snackbar = useSnackbar();
  useEffect(() => {
    if (open) listProjects().then(setProjects, () => setProjects([]));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Open project" actions={<Button variant="text" onClick={onClose}>Cancel</Button>}>
      {projects === null && <p>Loading…</p>}
      {projects?.length === 0 && <p>No saved projects yet.</p>}
      {projects?.map((p) => (
        <ListItem
          key={p.id}
          icon="folder_open"
          headline={p.name}
          supporting={`${p.id === currentId ? 'Open now · ' : ''}Edited ${new Date(p.updatedAt).toLocaleString()}`}
          selected={p.id === currentId}
          onClick={() => {
            onClose();
            if (p.id !== currentId) openProjectById(p.id).catch((e: Error) => snackbar(e.message));
          }}
        />
      ))}
    </Dialog>
  );
}

export function RenameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useProject((s) => s.project.name);
  const [value, setValue] = useState(name);
  useEffect(() => {
    if (open) setValue(name);
  }, [open, name]);
  const save = () => {
    renameProject(value);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Rename project"
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Rename</Button>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), save())}>
        <TextField label="Project name" value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
      </form>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button onClick={() => (onConfirm(), onClose())}>{confirmLabel}</Button>
        </>
      }
    >
      <p>{body}</p>
    </Dialog>
  );
}
