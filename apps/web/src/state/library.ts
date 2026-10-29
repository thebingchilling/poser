import { listAssets, removeAsset, type AssetRecord } from '@poser/core';
import { create } from 'zustand';

interface LibraryState {
  assets: AssetRecord[];
  loaded: boolean;
  refresh(): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The Library (PLAN.md section 3.2): imported assets on this device. */
export const useLibrary = create<LibraryState>()((set, get) => ({
  assets: [],
  loaded: false,
  async refresh() {
    set({ assets: await listAssets(), loaded: true });
  },
  async remove(id) {
    await removeAsset(id);
    await get().refresh();
  },
}));
