import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { getAsset, listAssets, updateAsset, type AssetRecord } from './assets';
import { getDB, resetDBConnection } from './storage/db';

afterEach(async () => {
  await resetDBConnection();
  indexedDB.deleteDatabase('poser');
});

const record = (id: string, importedAt: number): AssetRecord => ({
  id, kind: 'figure', name: id, sourceName: `${id}.fbx`, format: 'fbx', importedAt, tags: [], morphs: [], size: [0.5, 1.7, 0.3], triangles: 1000, files: ['model.glb'],
});

describe('asset library', () => {
  it('stores, lists newest first, and updates records', async () => {
    const db = await getDB();
    await db.put('assets', record('a', 1));
    await db.put('assets', record('b', 2));
    expect((await listAssets()).map((a) => a.id)).toEqual(['b', 'a']);
    await updateAsset('a', { name: 'Renamed', license: 'CC0' });
    expect(await getAsset('a')).toMatchObject({ name: 'Renamed', license: 'CC0' });
  });

  it('upgrades a version-1 database without losing projects', async () => {
    const v1 = await openDB('poser', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('kv');
      },
    });
    await v1.put('projects', { id: 'p1', name: 'Old', updatedAt: 1, json: '{}' });
    v1.close();
    const db = await getDB();
    expect(await db.get('projects', 'p1')).toMatchObject({ name: 'Old' });
    expect(db.objectStoreNames.contains('assets')).toBe(true);
  });
});
