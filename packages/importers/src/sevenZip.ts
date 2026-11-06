import type { ArchiveEntry } from './archive';

/** Unpacks a 7z or RAR archive with 7-Zip in a Web Worker (directly where workers don't exist, e.g. tests). */
export async function unpackWith7z(file: Blob, name: string): Promise<ArchiveEntry[]> {
  if (typeof Worker === 'undefined') {
    const { extractWith7z } = await import('./sevenZipCore');
    return extractWith7z(file, name);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sevenZip.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ entries?: ArchiveEntry[]; error?: string }>) => {
      worker.terminate();
      if (e.data.entries) resolve(e.data.entries);
      else reject(new Error(e.data.error ?? `Couldn't unpack ${name}`));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || `Couldn't unpack ${name}`));
    };
    worker.postMessage({ file, name });
  });
}
