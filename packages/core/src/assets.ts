import type { CanonicalPose } from './types';
import { getDB } from './storage/db';
import { deleteAsset as deleteAssetFiles, readAssetFile, writeAssetFile } from './storage/opfs';

/**
 * Library assets (PLAN.md section 19). The record lives in IndexedDB; the
 * processed model (a normalised GLB) lives in OPFS under assets/<id>/.
 */
export type AssetKind = 'figure' | 'prop' | 'garment' | 'pose' | 'environment';

export interface AssetRigInfo {
  /** Rig kind label (daz-g8, mixamo, vrm, ...). */
  kind: string;
  /** Canonical bone → source bone (and twist bones). */
  map: Record<string, { bone: string; twist?: string[] }>;
  coverage: number;
}

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  name: string;
  /** The file it came from. */
  sourceName: string;
  format: string;
  importedAt: number;
  creator?: string;
  license?: string;
  tags: string[];
  rig?: AssetRigInfo;
  morphs: string[];
  /** Size in metres (x, y, z). */
  size: [number, number, number];
  triangles: number;
  thumbnail?: string;
  /** For pose assets. */
  pose?: CanonicalPose;
  /** Names of files in the asset's OPFS folder. */
  files: string[];
}

export const MODEL_FILE = 'model.glb';

export async function saveAsset(record: AssetRecord, files: Record<string, Blob | ArrayBuffer> = {}): Promise<void> {
  for (const [name, data] of Object.entries(files)) await writeAssetFile(record.id, name, data);
  await (await getDB()).put('assets', record);
}

export async function listAssets(): Promise<AssetRecord[]> {
  const rows = await (await getDB()).getAllFromIndex('assets', 'importedAt');
  return rows.reverse();
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return (await getDB()).get('assets', id);
}

export async function updateAsset(id: string, patch: Partial<Omit<AssetRecord, 'id'>>): Promise<void> {
  const db = await getDB();
  const current = await db.get('assets', id);
  if (!current) throw new Error('Asset not found');
  await db.put('assets', { ...current, ...patch });
}

export async function removeAsset(id: string): Promise<void> {
  await deleteAssetFiles(id);
  await (await getDB()).delete('assets', id);
}

export async function readAssetModel(id: string): Promise<File | null> {
  return readAssetFile(id, MODEL_FILE);
}
