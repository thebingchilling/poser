import { kvGet, kvSet } from '@poser/core';
import { DirectorySource, setContentSources } from '@poser/importers';
import { create } from 'zustand';

/**
 * Library folders (PLAN.md section 4.1): the Daz content library, a VaM
 * install, or a models folder, granted once with the File System Access API.
 * The handles are kept in IndexedDB; the browser asks again for read access
 * in a later session, which needs a click (so it happens on import or browse).
 */
export type FolderKind = 'daz' | 'vam' | 'poser' | 'other';

export interface ContentFolder {
  handle: FileSystemDirectoryHandle;
  kind: FolderKind;
  granted: boolean;
}

const KEY = 'contentFolders';

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

interface ContentFoldersState {
  folders: ContentFolder[];
  loaded: boolean;
  load(): Promise<void>;
  /** Asks the user for a folder; returns it, or null if they cancelled. */
  add(kind: FolderKind): Promise<ContentFolder | null>;
  remove(folder: ContentFolder): Promise<void>;
  /** Asks again for access to folders from earlier sessions (needs a click). */
  grantAll(): Promise<boolean>;
}

function publish(folders: ContentFolder[]): void {
  setContentSources(folders.filter((f) => f.granted).map((f) => new DirectorySource(f.handle)));
}

async function save(folders: ContentFolder[]): Promise<void> {
  await kvSet(
    KEY,
    folders.map((f) => ({ handle: f.handle, kind: f.kind })),
  );
}

export const folderPickerSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export const useContentFolders = create<ContentFoldersState>()((set, get) => ({
  folders: [],
  loaded: false,
  async load() {
    const stored = (await kvGet<{ handle: FileSystemDirectoryHandle; kind: FolderKind }[]>(KEY)) ?? [];
    const folders = await Promise.all(
      stored.map(async ({ handle, kind }) => ({ handle, kind, granted: (await (handle as PermissionHandle).queryPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted' })),
    );
    set({ folders, loaded: true });
    publish(folders);
  },
  async add(kind) {
    if (!window.showDirectoryPicker) return null;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ id: `poser-${kind}`, mode: 'read' });
    } catch {
      return null;
    }
    const existing = [];
    for (const f of get().folders) if (!(await f.handle.isSameEntry(handle))) existing.push(f);
    const folder = { handle, kind, granted: true };
    const folders = [...existing, folder];
    set({ folders });
    publish(folders);
    await save(folders);
    return folder;
  },
  async remove(folder) {
    const folders = get().folders.filter((f) => f !== folder);
    set({ folders });
    publish(folders);
    await save(folders);
  },
  async grantAll() {
    const folders = await Promise.all(
      get().folders.map(async (f) => (f.granted ? f : { ...f, granted: (await (f.handle as PermissionHandle).requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted' })),
    );
    set({ folders });
    publish(folders);
    return folders.every((f) => f.granted);
  },
}));
