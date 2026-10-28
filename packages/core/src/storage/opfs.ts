/**
 * Asset binaries live in the Origin Private File System, under /assets/<id>/.
 * Phase 1 importers write here; Phase 0 only provides the helpers.
 */

async function assetDir(assetId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const assets = await root.getDirectoryHandle('assets', { create });
  return assets.getDirectoryHandle(assetId, { create });
}

export async function writeAssetFile(assetId: string, name: string, data: Blob | ArrayBuffer): Promise<void> {
  const dir = await assetDir(assetId, true);
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readAssetFile(assetId: string, name: string): Promise<File | null> {
  try {
    const dir = await assetDir(assetId, false);
    return await (await dir.getFileHandle(name)).getFile();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null;
    throw err;
  }
}

export async function deleteAsset(assetId: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    const assets = await root.getDirectoryHandle('assets');
    await assets.removeEntry(assetId, { recursive: true });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return;
    throw err;
  }
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

export async function storageInfo(): Promise<StorageInfo> {
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage, quota, persisted };
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
