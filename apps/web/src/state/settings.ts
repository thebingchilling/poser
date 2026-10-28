import type { QualityLevel } from '@poser/core';
import { DEFAULT_SEED } from '@poser/ui';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Per-device settings, kept in localStorage so they are available
 * synchronously at startup (theme and neutral tab apply before first paint).
 */
export interface DeviceSettings {
  themeMode: 'dark' | 'light';
  seedColor: string;
  /** null = automatic (detected for this device). */
  qualityOverride: QualityLevel | null;
  /** Result of auto-detection, stored per device (PLAN.md section 3.5, step 5). */
  detectedQuality: QualityLevel | null;
  /** Highest level detection thinks the device can handle. */
  capableQuality: QualityLevel | null;
  benchmarkMs: number | null;
  adaptiveQuality: boolean;
  neutralTab: boolean;
  /** Blood, wounds, removed parts, bodily fluids (PLAN.md section 22). On by default. */
  graphicContent: boolean;
  /** Lock again after this many minutes in the background or idle; 0 = only on launch. */
  autoLockMinutes: number;
  adultsConfirmed: boolean;
  firstRunDone: boolean;
  /** Back up to the chosen folder after edits (desktop Chrome). */
  autoBackup: boolean;
  /** Always use the WebGL2 compatibility renderer (for testing and problem devices). */
  forceCompatibility: boolean;
}

interface SettingsStore extends DeviceSettings {
  set(patch: Partial<DeviceSettings>): void;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  themeMode: 'dark',
  seedColor: DEFAULT_SEED,
  qualityOverride: null,
  detectedQuality: null,
  capableQuality: null,
  benchmarkMs: null,
  adaptiveQuality: true,
  neutralTab: false,
  graphicContent: true,
  autoLockMinutes: 5,
  adultsConfirmed: false,
  firstRunDone: false,
  autoBackup: true,
  forceCompatibility: false,
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
    }),
    {
      name: 'poser.settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
