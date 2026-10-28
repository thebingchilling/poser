import { deserializeProject, serializeProject, type Project } from '@poser/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * `.poser` project files (PLAN.md section 19): a zip with the project JSON
 * and, from Phase 1 on, the processed assets it uses under assets/.
 */

export const POSER_EXTENSION = '.poser';
export const POSER_MIME = 'application/x-poser';

export function exportPoserFile(project: Project, assets: Record<string, Uint8Array> = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'project.json': strToU8(serializeProject(project)) };
  for (const [path, data] of Object.entries(assets)) entries[`assets/${path}`] = data;
  return zipSync(entries, { level: 6 });
}

export function importPoserFile(data: Uint8Array): { project: Project; assets: Record<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new Error('Not a .poser file (could not unzip it)');
  }
  const json = entries['project.json'];
  if (!json) throw new Error('This .poser file has no project.json');
  const project = deserializeProject(strFromU8(json));
  const assets: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith('assets/') && !path.endsWith('/')) assets[path.slice(7)] = bytes;
  }
  return { project, assets };
}

/** A filesystem-safe file name for a project. */
export function poserFileName(project: Project, date = new Date(project.updatedAt)): string {
  const safe = project.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'project';
  const stamp = date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${safe}_${stamp}${POSER_EXTENSION}`;
}
