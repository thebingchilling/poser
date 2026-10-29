import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetRecord } from '../assets';

/**
 * IndexedDB holds project JSON and small metadata (PLAN.md section 19).
 * Asset binaries go to OPFS (see opfs.ts).
 */
export interface PoserDB extends DBSchema {
  projects: {
    key: string;
    value: { id: string; name: string; updatedAt: number; json: string };
    indexes: { updatedAt: number };
  };
  kv: {
    key: string;
    value: unknown;
  };
  assets: {
    key: string;
    value: AssetRecord;
    indexes: { importedAt: number; kind: string };
  };
}

export const DB_NAME = 'poser';
export const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PoserDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<PoserDB>> {
  dbPromise ??= openDB<PoserDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('kv');
      }
      if (oldVersion < 2) {
        // Library (PLAN.md section 19): imported asset records; binaries live in OPFS.
        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('importedAt', 'importedAt');
        assets.createIndex('kind', 'kind');
      }
    },
  });
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function resetDBConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('kv', value, key);
}

export async function kvDelete(key: string): Promise<void> {
  await (await getDB()).delete('kv', key);
}
