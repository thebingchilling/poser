import { EFFECTORS } from '@poser/render';
import type { PoseSkeleton } from '@poser/posing';
import { viewportRef } from './ViewportView';

/** The posing skeleton of a figure in the viewport (null until its model has loaded). */
export function viewportFigureSkeleton(figureId: string): PoseSkeleton | null {
  return viewportRef.current?.figureSkeleton(figureId) ?? null;
}

export { EFFECTORS };
