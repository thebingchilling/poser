import type { QualityLevel } from '@poser/core';
import { stepQuality, type GpuInfo } from '@poser/platform';
import type { AnatomyLayer, RendererBackend, StudyMode } from '@poser/render';
import { LIMIT_SCALE, type LimitPreset } from '@poser/posing';
import { create } from 'zustand';
import { useSettings } from './settings';

export type WorkspaceId = 'library' | 'scene' | 'pose' | 'body' | 'physics' | 'objects' | 'render' | 'animate';
export type SimMode = 'pose' | 'settle' | 'live';

interface UiState {
  workspace: WorkspaceId;
  workspaceOpen: boolean;
  inspectorOpen: boolean;
  selectedFigureId: string | null;
  /** Selected canonical joint on the selected figure. */
  selectedJoint: string | null;
  selectedPropId: string | null;
  /** Light selected in the Render workspace (shows its move gizmo). */
  selectedLightId: string | null;
  propGizmo: 'translate' | 'rotate';
  /** FK rotates joints; IK drags hands and feet (PLAN.md section 6). */
  poseMode: 'fk' | 'ik';
  /** Joint-limit preset (PLAN.md section 6). */
  limitPreset: LimitPreset;
  /** Rotation gizmo space. */
  gizmoSpace: 'local' | 'parent' | 'world';
  /** Pose workspace tab. */
  poseTab: 'adjust' | 'library' | 'mix';
  mode: SimMode;
  /** Render workspace view settings (PLAN.md section 18). */
  studyMode: StudyMode;
  notanThreshold: number;
  overlay: 'none' | 'thirds' | 'golden';
  /** Eight-heads proportion grid behind the selected figure. */
  proportionGrid: boolean;
  /** Capture size ('view' = the view at screen resolution) and background. */
  captureSize: 'view' | '1920x1080' | '2560x1440' | '3840x2160' | '2048x2048' | '1080x1350' | '2160x3840';
  captureTransparent: boolean;
  /** Lens focal length (35mm equivalent), or null for orthographic. */
  lens: number | null;
  /** Reference photo for this session (PLAN.md section 17.7). */
  reference: { url: string; name: string } | null;
  referenceMode: 'over' | 'behind';
  referenceOpacity: number;
  /** Camera match: horizon position (0 top – 1 bottom) and camera height (m). */
  cameraMatch: boolean;
  horizon: number;
  cameraHeight: number;
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
  dazGuideOpen: boolean;
  settingsTab: string;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
  openWorkspace(id: WorkspaceId): void;
}

export const useUi = create<UiState>()((set, get) => ({
  workspace: 'scene',
  workspaceOpen: true,
  inspectorOpen: true,
  selectedFigureId: null,
  selectedJoint: null,
  selectedPropId: null,
  selectedLightId: null,
  propGizmo: 'translate',
  poseMode: 'fk',
  limitPreset: 'realistic',
  gizmoSpace: 'local',
  poseTab: 'adjust',
  mode: 'pose',
  studyMode: 'normal',
  notanThreshold: 0.35,
  overlay: 'none',
  proportionGrid: false,
  captureSize: 'view',
  captureTransparent: false,
  lens: 50,
  reference: null,
  referenceMode: 'over',
  referenceOpacity: 0.5,
  cameraMatch: false,
  horizon: 0.45,
  cameraHeight: 1.6,
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
  dazGuideOpen: false,
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

/** How far joint limits are widened for the current preset (Infinity = unlimited). */
export function limitScale(): number {
  return LIMIT_SCALE[useUi.getState().limitPreset];
}
