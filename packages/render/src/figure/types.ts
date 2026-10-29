import type { CanonicalPose } from '@poser/core';
import type { Group } from 'three/webgpu';
import type { AnatomyLayer } from './mannequin';

/** What the viewport needs from any figure: built-in mannequin or imported model. */
export interface PosableFigure {
  readonly root: Group;
  readonly height: number;
  applyPose(pose: CanonicalPose): void;
  setMorphs(values: Record<string, number>): void;
  setLayerVisible(layer: AnatomyLayer, visible: boolean): void;
  setSkinOpacity(opacity: number): void;
  dispose(): void;
}
