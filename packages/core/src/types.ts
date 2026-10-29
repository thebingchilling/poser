/**
 * Scene data model (PLAN.md section 19). Phase 0 holds only the fields the
 * foundation needs; later phases add to these types and bump
 * PROJECT_FORMAT_VERSION with a migration in serialize.ts.
 *
 * Units are metric throughout: metres, kilograms, seconds.
 */

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

/** A prop: an imported (or built) object placed in the scene (PLAN.md section 19). */
export interface Prop {
  id: string;
  name: string;
  assetId: string;
  transform: Transform;
  visible: boolean;
  locked: boolean;
}

export type LightType = 'directional' | 'point' | 'spot' | 'ambient';

export interface Light {
  id: string;
  name: string;
  type: LightType;
  transform: Transform;
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
}

export interface Environment {
  hdriAssetId: string | null;
  floor: boolean;
  grid: boolean;
  background: string;
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
