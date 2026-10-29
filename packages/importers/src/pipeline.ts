import { MODEL_FILE, createId, saveAsset, type AssetKind, type AssetRecord } from '@poser/core';
import type { RigMap } from '@poser/rig';
import { analyseModel, type ModelAnalysis, type Normalisation } from './analyse';
import { exportNormalisedGlb, type ImportQuality } from './exportGlb';
import type { VirtualFiles } from './files';
import type { ModelFormat } from './formats';
import { loadModel, type LoadedModel } from './load';
import { renderThumbnail } from './thumbnail';

/**
 * The import wizard's model (PLAN.md section 4.3): prepare (load and
 * analyse) gives the wizard its defaults; finish applies the user's choices,
 * converts to the internal GLB, renders a thumbnail, and saves the asset.
 */
export interface PreparedImport {
  path: string;
  format: ModelFormat;
  loaded: LoadedModel;
  analysis: ModelAnalysis;
}

export interface ImportChoices {
  name: string;
  kind: AssetKind;
  normalisation: Normalisation;
  /** Final rig map after the manual mapping step. */
  rigMap?: RigMap;
  quality: ImportQuality;
  creator?: string;
  license?: string;
}

export async function prepareImport(vfs: VirtualFiles, path: string, format: ModelFormat): Promise<PreparedImport> {
  const loaded = await loadModel(vfs, path, format);
  const analysis = analyseModel(loaded.root, format, loaded.vrmHumanoid);
  return { path, format, loaded, analysis };
}

export function defaultChoices(p: PreparedImport): ImportChoices {
  const file = p.path.split('/').pop()!;
  return {
    name: file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported model',
    kind: p.analysis.kind,
    normalisation: p.analysis.normalisation,
    rigMap: p.analysis.rig?.map,
    quality: 'balanced',
  };
}

export async function finishImport(p: PreparedImport, choices: ImportChoices, onProgress?: (step: string) => void): Promise<AssetRecord> {
  onProgress?.('Converting');
  const { glb, normalised } = await exportNormalisedGlb(p.loaded.root, choices.normalisation, choices.quality);
  onProgress?.('Making a thumbnail');
  const thumbnail = renderThumbnail(normalised);
  const map = choices.kind === 'figure' ? choices.rigMap : undefined;
  const required = ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
  const record: AssetRecord = {
    id: createId('asset'),
    kind: choices.kind,
    name: choices.name,
    sourceName: p.path.split('/').pop()!,
    format: p.format,
    importedAt: Date.now(),
    tags: [],
    morphs: p.analysis.morphs,
    size: p.analysis.size,
    triangles: p.analysis.triangles,
    thumbnail,
    files: [MODEL_FILE],
  };
  if (choices.creator) record.creator = choices.creator;
  if (choices.license) record.license = choices.license;
  if (map && p.analysis.rig) {
    record.rig = {
      kind: p.analysis.rig.kind,
      map: Object.fromEntries(Object.entries(map).filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])),
      coverage: required.filter((b) => map[b]).length / required.length,
    };
  }
  onProgress?.('Saving');
  await saveAsset(record, { [MODEL_FILE]: glb });
  return record;
}
