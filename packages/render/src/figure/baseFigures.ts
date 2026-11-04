import type { AssetRigInfo } from '@poser/core';
import meta from './baseFigures.json';

/**
 * The default base figures (PLAN.md, Phase 1): female and male bodies built
 * from the CC0 MakeHuman base mesh by tools/base-figure/build.mjs. The GLBs
 * are served from /builtin/ and use canonical bone names, so their rig map
 * is the identity.
 */
export const BASE_FIGURES: Record<string, { file: string; height: number; morphs: string[]; bones: string[] }> = meta;

export const BASE_FIGURE_NAMES: Record<string, string> = {
  'builtin:base-female': 'Female figure',
  'builtin:base-male': 'Male figure',
};

export function isBaseFigure(assetId: string): boolean {
  return assetId in BASE_FIGURES;
}

export function baseFigureRig(assetId: string): AssetRigInfo {
  const bones = BASE_FIGURES[assetId]?.bones ?? [];
  return { kind: 'canonical', map: Object.fromEntries(bones.map((b) => [b, { bone: b }])), coverage: 1 };
}

export function baseFigureUrl(assetId: string, base = import.meta.env?.BASE_URL ?? '/'): string {
  return `${base}builtin/${BASE_FIGURES[assetId]!.file}`;
}
