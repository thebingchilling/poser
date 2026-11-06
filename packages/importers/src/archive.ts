import { gunzipSync, inflateSync } from 'fflate';

/**
 * Archive readers for imports: zip (and VaM .var, which is a zip), tar,
 * gzip, and Unity packages. Zips are read entry by entry from slices of the
 * file, so a large package never has to sit in memory whole; entries that
 * are stored uncompressed (most textures in a .var) are not copied at all.
 * 7z and RAR go through a WebAssembly build of 7-Zip (sevenZip.ts).
 */

export interface ArchiveEntry {
  path: string;
  data: Blob;
}

/** Thrown for an archive entry the reader can't unpack (encrypted, or an unusual compression method). */
export class ArchiveEntryError extends Error {}

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Raw-deflate decompression: the browser's native streams when available, else fflate. */
async function inflateBlob(blob: Blob): Promise<Blob> {
  if (typeof DecompressionStream !== 'undefined' && typeof blob.stream === 'function') {
    try {
      return await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))).blob();
    } catch {
      // Fall through to fflate (older engines without deflate-raw).
    }
  }
  return new Blob([inflateSync(await bytes(blob)) as Uint8Array<ArrayBuffer>]);
}

async function gunzipBlob(blob: Blob): Promise<Blob> {
  if (typeof DecompressionStream !== 'undefined' && typeof blob.stream === 'function') {
    try {
      return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    } catch {
      // Fall through to fflate.
    }
  }
  return new Blob([gunzipSync(await bytes(blob)) as Uint8Array<ArrayBuffer>]);
}

interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  offset: number;
}

/** Reads a zip's central directory (ZIP64 included) from the end of the file. */
async function zipDirectory(file: Blob): Promise<ZipEntry[]> {
  const tailSize = Math.min(file.size, 65557);
  const tail = await bytes(file.slice(file.size - tailSize));
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('This zip file is damaged or incomplete (no directory found).');
  let count = tv.getUint16(eocd + 10, true);
  let dirSize = tv.getUint32(eocd + 12, true);
  let dirOffset = tv.getUint32(eocd + 16, true);
  // ZIP64: the real values sit in the ZIP64 end record, found through its locator just before.
  if ((count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) && eocd >= 20 && tv.getUint32(eocd - 20, true) === 0x07064b50) {
    const recordOffset = Number(tv.getBigUint64(eocd - 12, true));
    const rec = await bytes(file.slice(recordOffset, recordOffset + 56));
    const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    if (rv.getUint32(0, true) === 0x06064b50) {
      count = Number(rv.getBigUint64(32, true));
      dirSize = Number(rv.getBigUint64(40, true));
      dirOffset = Number(rv.getBigUint64(48, true));
    }
  }
  const dir = await bytes(file.slice(dirOffset, dirOffset + dirSize));
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const out: ZipEntry[] = [];
  const utf8 = new TextDecoder();
  const latin = new TextDecoder('latin1');
  let p = 0;
  for (let n = 0; n < count && p + 46 <= dir.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    let compressedSize = dv.getUint32(p + 20, true);
    let size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    let offset = dv.getUint32(p + 42, true);
    const rawName = dir.subarray(p + 46, p + 46 + nameLen);
    // Bit 11: UTF-8 names; otherwise names are usually the old DOS code page (Latin-1 is close enough for paths).
    const name = (flags & 0x800 ? utf8 : latin).decode(rawName);
    // ZIP64 extra field holds the sizes and offset that didn't fit.
    let e = p + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = dv.getUint16(e, true);
      const len = dv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) (size = Number(dv.getBigUint64(q, true))), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = Number(dv.getBigUint64(q, true))), (q += 8);
        if (offset === 0xffffffff) offset = Number(dv.getBigUint64(q, true));
      }
      e += 4 + len;
    }
    out.push({ name, method, flags, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** An opened zip: entry names, and each entry unpacked on request. */
export class ZipReader {
  private constructor(
    private readonly file: Blob,
    private readonly entries: ZipEntry[],
  ) {}

  static async open(file: Blob): Promise<ZipReader> {
    return new ZipReader(file, await zipDirectory(file));
  }

  /** File names (folders left out). */
  get names(): string[] {
    return this.entries.filter((e) => !e.name.endsWith('/')).map((e) => e.name);
  }

  private find(name: string): ZipEntry | undefined {
    const want = name.toLowerCase();
    return this.entries.find((e) => e.name === name) ?? this.entries.find((e) => e.name.toLowerCase() === want);
  }

  async read(name: string): Promise<Blob | null> {
    const entry = this.find(name);
    return entry ? this.readEntry(entry) : null;
  }

  private async readEntry(e: ZipEntry): Promise<Blob> {
    if (e.flags & 1) throw new ArchiveEntryError(`${e.name} is password-protected`);
    const header = await bytes(this.file.slice(e.offset, e.offset + 30));
    const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (hv.getUint32(0, true) !== 0x04034b50) throw new ArchiveEntryError(`${e.name} is damaged`);
    const start = e.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const data = this.file.slice(start, start + e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateBlob(data);
    throw new ArchiveEntryError(`${e.name} uses a compression method that can't be unpacked (${e.method})`);
  }

  /** Every file, unpacked one at a time. */
  async *all(): AsyncGenerator<ArchiveEntry | { path: string; error: string }> {
    for (const e of this.entries) {
      if (e.name.endsWith('/')) continue;
      try {
        yield { path: e.name, data: await this.readEntry(e) };
      } catch (err) {
        yield { path: e.name, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
}

/** Plain ustar/GNU tar (long names via GNU "L" records and pax "path" headers). */
export async function readTar(file: Blob): Promise<ArchiveEntry[]> {
  const out: ArchiveEntry[] = [];
  const dec = new TextDecoder();
  const str = (b: Uint8Array, from: number, len: number) => {
    const s = b.subarray(from, from + len);
    const z = s.indexOf(0);
    return dec.decode(z < 0 ? s : s.subarray(0, z));
  };
  let pos = 0;
  let longName: string | null = null;
  while (pos + 512 <= file.size) {
    const h = await bytes(file.slice(pos, pos + 512));
    if (h.every((b) => b === 0)) break;
    const size = parseInt(str(h, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156]!);
    const prefix = str(h, 257, 6).startsWith('ustar') ? str(h, 345, 155) : '';
    let name = longName ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100));
    longName = null;
    const dataStart = pos + 512;
    const data = file.slice(dataStart, dataStart + size);
    pos = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = str(await bytes(data), 0, size);
      continue;
    }
    if (type === 'x') {
      const pax = dec.decode(await bytes(data));
      const m = /\d+ path=([^\n]*)\n/.exec(pax);
      if (m) longName = m[1]!;
      continue;
    }
    if (type === '0' || type === '\0' || type === '7') {
      name = name.replace(/^\.\//, '');
      if (name && !name.endsWith('/')) out.push({ path: name, data });
    }
  }
  return out;
}

/**
 * A Unity package: a gzipped tar of folders named by asset GUID, each with
 * the asset itself and a "pathname" file giving its project path.
 */
export async function readUnityPackage(file: Blob): Promise<ArchiveEntry[]> {
  const entries = await readTar(await gunzipBlob(file));
  const byGuid = new Map<string, { asset?: Blob; pathname?: string }>();
  for (const e of entries) {
    const [guid, part] = e.path.split('/');
    if (!guid || !part) continue;
    const rec = byGuid.get(guid) ?? {};
    if (part === 'asset') rec.asset = e.data;
    else if (part === 'pathname') rec.pathname = (await e.data.text()).split('\n')[0]!.trim();
    byGuid.set(guid, rec);
  }
  const out: ArchiveEntry[] = [];
  for (const [guid, r] of byGuid) if (r.asset) out.push({ path: r.pathname || guid, data: r.asset });
  return out;
}

export type ArchiveKind = 'zip' | 'tar' | 'tgz' | 'gz' | 'unitypackage' | '7z' | 'rar';

/** The archive kind from a file name (VaM's .var is a zip). */
export function archiveKind(path: string): ArchiveKind | null {
  const p = path.toLowerCase();
  if (/\.(zip|var)$/.test(p)) return 'zip';
  if (/\.(tar\.gz|tgz)$/.test(p)) return 'tgz';
  if (p.endsWith('.tar')) return 'tar';
  if (p.endsWith('.unitypackage')) return 'unitypackage';
  if (p.endsWith('.gz')) return 'gz';
  if (p.endsWith('.7z')) return '7z';
  if (/\.(rar|r00)$/.test(p) || /\.part0*1\.rar$/.test(p)) return 'rar';
  return null;
}

/** The archive kind from a file's first bytes, for archives with an unexpected name. */
export async function sniffArchive(file: Blob): Promise<ArchiveKind | null> {
  const h = await bytes(file.slice(0, 262));
  if (h[0] === 0x50 && h[1] === 0x4b && (h[2] === 3 || h[2] === 5) ) return 'zip';
  if (h[0] === 0x1f && h[1] === 0x8b) return 'gz';
  if (h[0] === 0x37 && h[1] === 0x7a && h[2] === 0xbc && h[3] === 0xaf) return '7z';
  if (h[0] === 0x52 && h[1] === 0x61 && h[2] === 0x72 && h[3] === 0x21) return 'rar';
  if (h.length >= 262 && new TextDecoder().decode(h.subarray(257, 262)) === 'ustar') return 'tar';
  return null;
}

/** Unpacks an archive into its entries (zips stream entry by entry). */
export async function* unpack(file: Blob, kind: ArchiveKind, name: string): AsyncGenerator<ArchiveEntry | { path: string; error: string }> {
  switch (kind) {
    case 'zip':
      yield* (await ZipReader.open(file)).all();
      return;
    case 'tar':
      yield* await readTar(file);
      return;
    case 'tgz':
      yield* await readTar(await gunzipBlob(file));
      return;
    case 'unitypackage':
      yield* await readUnityPackage(file);
      return;
    case 'gz': {
      const inner = await gunzipBlob(file);
      // A .tar inside? Then unpack that too.
      if ((await sniffArchive(inner)) === 'tar') yield* await readTar(inner);
      else yield { path: name.replace(/\.gz$/i, ''), data: inner };
      return;
    }
    case '7z':
    case 'rar': {
      const { unpackWith7z } = await import('./sevenZip');
      yield* await unpackWith7z(file, name);
      return;
    }
  }
}
