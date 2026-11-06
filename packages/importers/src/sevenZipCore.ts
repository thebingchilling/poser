import SevenZip, { type SevenZipModule } from '7z-wasm';
import type { ArchiveEntry } from './archive';

/**
 * 7-Zip (WebAssembly) for archives the built-in readers don't cover: 7z and
 * RAR (also bzip2, xz, and the rest 7-Zip knows). Runs in a Web Worker in
 * the app (sevenZip.worker.ts); in the browser the archive is mounted
 * without copying (WORKERFS) and only the unpacked files take memory.
 */
export async function extractWith7z(file: Blob, name: string, wasmUrl?: string): Promise<ArchiveEntry[]> {
  const log: string[] = [];
  const mod: SevenZipModule = await SevenZip({
    ...(wasmUrl ? { locateFile: () => wasmUrl } : {}),
    print: (s: string) => log.push(s),
    printErr: (s: string) => log.push(s),
    quit: () => undefined,
  } as never);
  const fs = mod.FS as unknown as {
    mkdir(p: string): void;
    mount(type: unknown, opts: unknown, at: string): void;
    readdir(p: string): string[];
    stat(p: string): { mode: number };
    isDir(mode: number): boolean;
    readFile(p: string): Uint8Array;
    writeFile(p: string, data: Uint8Array): void;
    chdir(p: string): void;
  };
  const safeName = name.split('/').pop()!.replace(/[^\w.\-]+/g, '_') || 'archive';
  let archive: string;
  const canMount = typeof (globalThis as { FileReaderSync?: unknown }).FileReaderSync !== 'undefined';
  if (canMount) {
    fs.mkdir('/in');
    fs.mount(mod.WORKERFS, { blobs: [{ name: safeName, data: file }] }, '/in');
    archive = `/in/${safeName}`;
  } else {
    archive = `/${safeName}`;
    fs.writeFile(archive, new Uint8Array(await file.arrayBuffer()));
  }
  fs.mkdir('/out');
  fs.chdir('/out');
  // -y: answer yes; -p-: no password prompt (encrypted archives fail instead of hanging).
  try {
    mod.callMain(['x', archive, '-y', '-p-', '-o/out']);
  } catch {
    // callMain throws ExitStatus on a non-zero exit; the log says why.
  }
  const out: ArchiveEntry[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const n of fs.readdir(dir)) {
      if (n === '.' || n === '..') continue;
      const p = `${dir}/${n}`;
      if (fs.isDir(fs.stat(p).mode)) walk(p, `${prefix}${n}/`);
      else out.push({ path: prefix + n, data: new Blob([fs.readFile(p) as Uint8Array<ArrayBuffer>]) });
    }
  };
  walk('/out', '');
  if (!out.length) {
    const why = log.find((l) => /wrong password|encrypted/i.test(l)) ? 'it is password-protected' : log.find((l) => /error|can.?not/i.test(l))?.trim() || 'it holds no files 7-Zip could unpack';
    throw new Error(`Couldn't unpack ${name}: ${why}.`);
  }
  return out;
}
