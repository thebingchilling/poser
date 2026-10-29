import { VirtualFiles, importableItems, type FileRole } from '@poser/importers';
import { create } from 'zustand';
import type { PickedFile } from './collectFiles';

interface ImportState {
  vfs: VirtualFiles | null;
  items: { path: string; role: FileRole }[];
  index: number;
  /** Files that weren't models or poses (shown so nothing is silently ignored). */
  skipped: number;
  start(files: PickedFile[]): Promise<number>;
  next(): void;
  close(): void;
}

export const useImport = create<ImportState>()((set, get) => ({
  vfs: null,
  items: [],
  index: 0,
  skipped: 0,
  async start(files) {
    get().vfs?.dispose();
    const vfs = new VirtualFiles();
    await vfs.addFiles(files.map((f) => ({ path: f.path, file: f.file })));
    const items = importableItems(vfs.paths);
    set({ vfs, items, index: 0, skipped: 0 });
    return items.length;
  },
  next() {
    const { index, items } = get();
    if (index + 1 < items.length) set({ index: index + 1 });
    else get().close();
  },
  close() {
    get().vfs?.dispose();
    set({ vfs: null, items: [], index: 0 });
  },
}));
