import { deserializeProject, serializeProject } from '../serialize';
import type { Project } from '../types';
import { getDB, kvGet, kvSet } from './db';

const LAST_PROJECT_KEY = 'lastProjectId';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    json: serializeProject(project),
  });
  await kvSet(LAST_PROJECT_KEY, project.id);
}

export async function loadProject(id: string): Promise<Project | null> {
  const row = await (await getDB()).get('projects', id);
  return row ? deserializeProject(row.json) : null;
}

export async function loadLastProject(): Promise<Project | null> {
  const id = await kvGet<string>(LAST_PROJECT_KEY);
  return id ? loadProject(id) : null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await (await getDB()).getAllFromIndex('projects', 'updatedAt');
  return rows.reverse().map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
}

export async function deleteProject(id: string): Promise<void> {
  await (await getDB()).delete('projects', id);
}
