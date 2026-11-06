import { VirtualFiles, explainSkipped, importableItems, type FileRole } from '@poser/importers';
import { logError } from '@poser/platform';
import { create } from 'zustand';
import type { PickedFile } from './collectFiles';

interface ImportState {
  vfs: VirtualFiles | null;
  items: { path: string; role: FileRole }[];
  index: number;
  /** Set while picked files and archives are being opened. */
  opening: { files: number } | null;
  /**
   * Shown when a pick or drop has nothing importable: what the files were
   * and why each kind was left out, so nothing fails silently.
   */
  notice: { title: string; lines: string[] } | null;
  start(files: PickedFile[]): Promise<number>;
  next(): void;
  close(): void;
  dismissNotice(): void;
}

export const useImport = create<ImportState>()((set, get) => ({
  vfs: null,
  items: [],
  index: 0,
  opening: null,
  notice: null,
  async start(files) {
    get().vfs?.dispose();
    set({ vfs: null, items: [], index: 0, opening: { files: files.length }, notice: null });
    const vfs = new VirtualFiles();
    try {
      await vfs.addFiles(files.map((f) => ({ path: f.path, file: f.file })));
    } catch (err) {
      logError(err, 'import');
      vfs.problems.push(err instanceof Error ? err.message : String(err));
    }
    const items = importableItems(vfs.paths);
    if (!items.length) {
      const names = files.map((f) => f.path.split('/').pop()).join(', ');
      const lines = [...vfs.problems.map((p) => `Couldn’t open: ${p}`), ...explainSkipped(vfs.paths)];
      set({ opening: null, notice: { title: `Nothing to import in ${names.length > 60 ? `${files.length} files` : names}`, lines: lines.length ? lines : ['The files were empty.'] } });
      return 0;
    }
    set({ vfs, items, index: 0, opening: null });
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
  dismissNotice() {
    set({ notice: null });
  },
}));
