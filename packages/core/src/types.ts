/**
 * Scene data model (PLAN.md section 19). Phase 0 holds only the fields the
 * foundation needs; later phases add to these types and bump
 * PROJECT_FORMAT_VERSION with a migration in serialize.ts.
 *
 * Units are metric throughout: metres, kilograms, seconds.
 */

import type { SunSettings } from './lighting';

export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number];

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'full';

export interface ProjectSettings {
  units: 'metric';
  /** null = use the device's detected level. */
  quality: QualityLevel | null;
}

/** A pose in canonical-rig bone space: bone name → local rotation. */
export type CanonicalPose = Record<string, Quat>;

export interface Figure {
  id: string;
  name: string;
  /** Library asset id, or a built-in id such as `builtin:female`. */
  assetId: string;
  transform: Transform;
  pose: CanonicalPose;
  morphValues: Record<string, number>;
  /** Pinned effectors (hands, feet) and where they're held, in figure space (PLAN.md section 6). */
  pins?: Record<string, Vec3>;
  visible: boolean;
  locked: boolean;
}

/** Shapes made in the prop builder (PLAN.md section 17.6), plus furniture for built-in rooms. */
export type ShapeKind =
  | 'box' | 'cylinder' | 'sphere' | 'platform' | 'steps' | 'ramp' | 'pole' | 'ring' | 'bar'
  | 'wall' | 'bed' | 'sofa' | 'chair' | 'table' | 'stool' | 'bathtub' | 'shower' | 'backdrop' | 'pillar' | 'cabinet' | 'rug' | 'lamp';

export interface PropShape {
  kind: ShapeKind;
  /** Width, height, depth in metres. */
  size: Vec3;
  /** Number of steps (steps only). */
  steps?: number;
}

export type MaterialType = 'matte' | 'wood' | 'metal' | 'plastic' | 'fabric' | 'leather' | 'latex' | 'rubber' | 'stone' | 'glass';

/** Recolour and material settings (PLAN.md section 17.6). */
export interface PropMaterial {
  type: MaterialType;
  color: string;
  pattern?: 'solid' | 'stripes' | 'checks';
  patternColor?: string;
  /** 0 (dull) to 1 (glossy); overrides the type's default. */
  shine?: number;
  /** Colour of secondary parts (frames, legs, cushions) on furniture. */
  accent?: string;
}

/** A prop: an imported (or built) object placed in the scene (PLAN.md section 19). */
export interface Prop {
  id: string;
  name: string;
  /** Library asset id, or `builtin:shape` for built props. */
  assetId: string;
  transform: Transform;
  visible: boolean;
  locked: boolean;
  shape?: PropShape;
  material?: PropMaterial;
}

export type LightType = 'directional' | 'point' | 'spot' | 'ambient' | 'hemisphere';

export interface Light {
  id: string;
  name: string;
  type: LightType;
  transform: Transform;
  /** Where a directional or spot light points (default: about a standing figure's centre). */
  target?: Vec3;
  /** Sky colour is `color`; hemisphere lights also have a ground colour. */
  groundColor?: string;
  color: string;
  intensity: number;
  castShadow: boolean;
  visible: boolean;
}

export interface CameraBookmark {
  id: string;
  name: string;
  /** Lens focal length in mm (35mm-equivalent), or null for orthographic. */
  focalLength: number | null;
  position: Vec3;
  target: Vec3;
  /** View height at the target, for orthographic views (metres). */
  height?: number;
}

export interface Environment {
  hdriAssetId: string | null;
  floor: boolean;
  grid: boolean;
  background: string;
  /** The lighting preset in use, 'sun' for time of day, or 'custom' after manual changes. */
  lighting?: string;
  /** Time-of-day sun settings (when lighting is 'sun'). */
  sun?: SunSettings;
}

export interface Scene {
  id: string;
  name: string;
  figures: Figure[];
  props: Prop[];
  lights: Light[];
  cameras: CameraBookmark[];
  environment: Environment;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  scenes: Scene[];
  activeSceneId: string;
  poses: { id: string; name: string; pose: CanonicalPose }[];
}
