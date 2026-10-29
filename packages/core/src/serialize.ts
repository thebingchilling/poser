import type { Project } from './types';

export const PROJECT_FORMAT = 'poser-project';
export const PROJECT_FORMAT_VERSION = 2;

export interface SerializedProject {
  format: typeof PROJECT_FORMAT;
  version: number;
  project: Project;
}

export class ProjectFormatError extends Error {
  override name = 'ProjectFormatError';
}

/** Migrations from version N to N+1, keyed by N. */
const migrations: Record<number, (project: unknown) => unknown> = {
  // 1 → 2: scenes gained a props list.
  1: (project) => {
    const p = project as { scenes?: { props?: unknown[] }[] };
    for (const scene of p.scenes ?? []) scene.props ??= [];
    return p;
  },
};

export function serializeProject(project: Project): string {
  const doc: SerializedProject = { format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, project };
  return JSON.stringify(doc);
}

export function deserializeProject(json: string): Project {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new ProjectFormatError('Not a valid project file (bad JSON)');
  }
  if (!isRecord(doc) || doc.format !== PROJECT_FORMAT) {
    throw new ProjectFormatError('Not a Poser project file');
  }
  const version = doc.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError('Project file has no valid version');
  }
  if (version > PROJECT_FORMAT_VERSION) {
    throw new ProjectFormatError(
      `This project was saved by a newer version of Poser (format ${version}); please update the app`,
    );
  }
  let project = doc.project;
  for (let v = version; v < PROJECT_FORMAT_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new ProjectFormatError(`No migration from project format ${v}`);
    project = migrate(project);
  }
  assertProject(project);
  return project;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertProject(value: unknown): asserts value is Project {
  if (!isRecord(value)) throw new ProjectFormatError('Project data is missing');
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new ProjectFormatError('Project is missing its id or name');
  }
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
    throw new ProjectFormatError('Project has no scenes');
  }
  for (const scene of value.scenes) {
    if (!isRecord(scene) || typeof scene.id !== 'string' || !Array.isArray(scene.figures) || !Array.isArray(scene.lights)) {
      throw new ProjectFormatError('Project has a malformed scene');
    }
  }
  if (typeof value.activeSceneId !== 'string') throw new ProjectFormatError('Project has no active scene');
}
