import { kvDelete, kvGet, kvSet, type Project } from '@poser/core';
import { exportPoserFile, poserFileName } from './poserFile';

/**
 * Automatic backups (PLAN.md section 16.7) to a folder the user picks, e.g. a
 * synced cloud folder. Uses the File System Access API, available in
 * desktop Chrome. The folder handle is kept in IndexedDB; Chrome asks again
 * for permission after a restart, which needs a click.
 */

const HANDLE_KEY = 'backupFolder';
/** Keep this many backups per project; older ones are deleted. */
export const BACKUPS_PER_PROJECT = 10;

type PermissionedHandle = FileSystemDirectoryHandle & {
  queryPermission(desc: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(desc: { mode: 'readwrite' }): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
};

export function backupFolderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function chooseBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const handle = await picker({ id: 'poser-backups', mode: 'readwrite' });
  await kvSet(HANDLE_KEY, handle);
  return handle;
}

export async function getBackupFolder(): Promise<FileSystemDirectoryHandle | null> {
  return (await kvGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
}

export async function forgetBackupFolder(): Promise<void> {
  await kvDelete(HANDLE_KEY);
}

/** 'granted', or 'prompt' if a user gesture is needed to re-grant access. */
export async function backupPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
  const h = handle as PermissionedHandle;
  const state = await h.queryPermission({ mode: 'readwrite' });
  if (state === 'granted' || !request) return state;
  return h.requestPermission({ mode: 'readwrite' });
}

export async function writeBackup(handle: FileSystemDirectoryHandle, project: Project): Promise<string> {
  const name = poserFileName(project);
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(exportPoserFile(project) as Uint8Array<ArrayBuffer>);
  await writable.close();
  await pruneBackups(handle, project);
  return name;
}

async function pruneBackups(handle: FileSystemDirectoryHandle, project: Project): Promise<void> {
  const prefix = poserFileName(project).split('_')[0] + '_';
  const names: string[] = [];
  for await (const entry of (handle as PermissionedHandle).values()) {
    if (entry.kind === 'file' && entry.name.startsWith(prefix) && entry.name.endsWith('.poser')) names.push(entry.name);
  }
  names.sort(); // Timestamps sort lexically.
  for (const name of names.slice(0, Math.max(0, names.length - BACKUPS_PER_PROJECT))) {
    await handle.removeEntry(name);
  }
}
