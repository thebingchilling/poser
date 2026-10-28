import type { QualityLevel } from '@poser/core';
import { stepQuality, type GpuInfo } from '@poser/platform';
import type { AnatomyLayer, RendererBackend } from '@poser/render';
import { create } from 'zustand';
import { useSettings } from './settings';

export type WorkspaceId = 'library' | 'scene' | 'pose' | 'body' | 'physics' | 'objects' | 'render' | 'animate';
export type SimMode = 'pose' | 'settle' | 'live';

interface UiState {
  workspace: WorkspaceId;
  workspaceOpen: boolean;
  inspectorOpen: boolean;
  selectedFigureId: string | null;
  mode: SimMode;
  anatomy: Record<AnatomyLayer, boolean>;
  skinOpacity: number;
  /** Steps below the chosen level this session (device lost, adaptive quality). */
  qualityDrop: number;
  safeMode: boolean;
  backend: RendererBackend | null;
  gpu: GpuInfo | null;
  /** Why WebGPU was abandoned for compatibility mode this session, if it was. */
  webgpuFailure: string | null;
  /** Bumped to recreate the viewport (device-lost recovery). */
  viewportGeneration: number;
  locked: boolean;
  settingsOpen: boolean;
  settingsTab: string;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
  openWorkspace(id: WorkspaceId): void;
}

export const useUi = create<UiState>()((set, get) => ({
  workspace: 'scene',
  workspaceOpen: true,
  inspectorOpen: true,
  selectedFigureId: null,
  mode: 'pose',
  anatomy: { skin: true, fat: false, muscle: false, skeleton: false },
  skinOpacity: 1,
  qualityDrop: 0,
  safeMode: false,
  backend: null,
  gpu: null,
  webgpuFailure: null,
  viewportGeneration: 0,
  locked: false,
  settingsOpen: false,
  settingsTab: 'appearance',
  set: (patch) => set(patch),
  openWorkspace: (id) => {
    const { workspace, workspaceOpen } = get();
    // Choosing the open workspace again collapses its sheet.
    set({ workspace: id, workspaceOpen: workspace === id ? !workspaceOpen : true });
  },
}));

/** The quality level in effect now. */
export function useEffectiveQuality(): QualityLevel {
  const override = useSettings((s) => s.qualityOverride);
  const detected = useSettings((s) => s.detectedQuality);
  const drop = useUi((s) => s.qualityDrop);
  const safe = useUi((s) => s.safeMode);
  if (safe) return 'low';
  return stepQuality(override ?? detected ?? 'high', -drop);
}
