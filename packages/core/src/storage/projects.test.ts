import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '../factory';
import { resetDBConnection } from './db';
import { deleteProject, listProjects, loadLastProject, loadProject, saveProject } from './projects';

afterEach(async () => {
  await resetDBConnection();
  indexedDB.deleteDatabase('poser');
});

describe('project storage', () => {
  it('saves, lists, loads, and deletes', async () => {
    const a = { ...createProject('A'), updatedAt: 1 };
    const b = { ...createProject('B'), updatedAt: 2 };
    await saveProject(a);
    await saveProject(b);
    expect((await listProjects()).map((p) => p.name)).toEqual(['B', 'A']);
    expect(await loadProject(a.id)).toEqual(a);
    expect((await loadLastProject())?.id).toBe(b.id);
    await deleteProject(a.id);
    expect(await loadProject(a.id)).toBeNull();
  });
});
