import type { VirtualFiles } from './files';

/**
 * Content libraries (PLAN.md section 4.1, "Library folders"): where Daz and
 * VaM files find what they reference. A Daz scene names its assets by
 * library path ("/data/DAZ 3D/Genesis 8/Female/Genesis8Female.dsf"), so the
 * importer looks them up in the dropped files first, then in the library
 * folders the user has granted. Lookups ignore case, as Daz does on Windows.
 */
export interface ContentSource {
  readonly name: string;
  /** A file by library-relative path ("data/DAZ 3D/…"), or null. */
  read(path: string): Promise<Blob | null>;
  /** File paths under a library-relative folder (recursively), for browsing. */
  list?(dir: string, match: (name: string) => boolean): Promise<string[]>;
}

/** Normalises a library path or DSON URL to "data/DAZ 3D/…" (decoded, no leading slash, no fragment). */
export function libraryPath(url: string): string {
  let p = url.split('#')[0]!;
  // DSON URLs may carry a "scope:" prefix before the path.
  const colon = p.indexOf(':/');
  if (colon > 0 && !/^[a-z]+:\/\//i.test(p)) p = p.slice(colon + 1);
  try {
    p = decodeURIComponent(p);
  } catch {
    // Leave undecodable paths as they are.
  }
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Dropped files: matched by path suffix, so a dropped library (or part of one) works whatever its top folder is called. */
export class VirtualFilesSource implements ContentSource {
  readonly name = 'Dropped files';
  private byLower: Map<string, string> | null = null;

  constructor(private readonly vfs: VirtualFiles) {}

  private index(): Map<string, string> {
    if (!this.byLower) this.byLower = new Map(this.vfs.paths.map((p) => [p.toLowerCase(), p]));
    return this.byLower;
  }

  async read(path: string): Promise<Blob | null> {
    const want = path.toLowerCase();
    const idx = this.index();
    const exact = idx.get(want);
    if (exact) return this.vfs.get(exact) ?? null;
    for (const [lower, real] of idx) if (lower.endsWith('/' + want)) return this.vfs.get(real) ?? null;
    // Loose files lose their folders: fall back to a file name that only one dropped file has.
    const name = want.slice(want.lastIndexOf('/') + 1);
    const byName = [...idx].filter(([lower]) => lower === name || lower.endsWith('/' + name));
    return byName.length === 1 ? (this.vfs.get(byName[0]![1]) ?? null) : null;
  }
}

/** A library folder the user granted with the File System Access API, read on demand. */
export class DirectorySource implements ContentSource {
  private readonly listings = new Map<FileSystemDirectoryHandle, Promise<Map<string, FileSystemHandle>>>();

  constructor(readonly handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  private entries(dir: FileSystemDirectoryHandle): Promise<Map<string, FileSystemHandle>> {
    let p = this.listings.get(dir);
    if (!p) {
      p = (async () => {
        const out = new Map<string, FileSystemHandle>();
        for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) out.set(entry.name.toLowerCase(), entry);
        return out;
      })();
      this.listings.set(dir, p);
    }
    return p;
  }

  private async walk(path: string): Promise<FileSystemHandle | null> {
    let dir = this.handle;
    const parts = path.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const entry = (await this.entries(dir)).get(parts[i]!.toLowerCase());
      if (!entry) return null;
      if (i === parts.length - 1) return entry;
      if (entry.kind !== 'directory') return null;
      dir = entry as FileSystemDirectoryHandle;
    }
    return dir;
  }

  async read(path: string): Promise<Blob | null> {
    const h = await this.walk(path);
    return h && h.kind === 'file' ? (h as FileSystemFileHandle).getFile() : null;
  }

  async list(dir: string, match: (name: string) => boolean): Promise<string[]> {
    const start = await this.walk(dir);
    if (!start || start.kind !== 'directory') return [];
    const out: string[] = [];
    const visit = async (d: FileSystemDirectoryHandle, prefix: string) => {
      for (const [, e] of await this.entries(d)) {
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.kind === 'directory') await visit(e as FileSystemDirectoryHandle, p);
        else if (match(e.name)) out.push(p);
      }
    };
    await visit(start as FileSystemDirectoryHandle, dir.replace(/^\/+|\/+$/g, ''));
    return out;
  }
}

let registered: ContentSource[] = [];

/** The library folders the app has access to (set by the app at start-up and when the user adds one). */
export function setContentSources(sources: ContentSource[]): void {
  registered = sources;
}

export function contentSources(): ContentSource[] {
  return registered;
}

/** Reads a library path from the given sources, in order. */
export async function readContent(path: string, sources: ContentSource[]): Promise<Blob | null> {
  for (const s of sources) {
    const b = await s.read(path).catch(() => null);
    if (b) return b;
  }
  return null;
}

/** A Daz or VaM file needs library files the app can't reach yet. */
export class MissingContentError extends Error {
  override name = 'MissingContentError';
  constructor(
    readonly paths: string[],
    readonly library: 'daz' | 'vam' | 'poser',
  ) {
    super(
      library === 'daz'
        ? `This needs files from your Daz content library (${paths.length} not found, e.g. ${paths[0]}).`
        : library === 'poser'
          ? `This needs files from your Poser Runtime (${paths.length} not found, e.g. ${paths[0]}).`
          : `This needs files from your VaM install (${paths.length} not found, e.g. ${paths[0]}).`,
    );
  }
}
