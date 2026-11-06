import { archiveKind, sniffArchive, unpack } from './archive';
import { classifyFile } from './formats';

/**
 * A virtual folder of the files the user dropped or picked (PLAN.md section
 * 4.1): loose files, whole folders, and zips (unpacked in memory). Loaders
 * resolve texture and material paths against it, so a model and its
 * textures import together whatever folder layout they came in.
 */
export class VirtualFiles {
  private readonly files = new Map<string, Blob>();
  private readonly urls = new Map<string, string>();

  /** All paths, normalised (forward slashes, no leading ./). */
  get paths(): string[] {
    return [...this.files.keys()];
  }

  static normalise(path: string): string {
    return path.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  }

  add(path: string, data: Blob): void {
    this.files.set(VirtualFiles.normalise(path), data);
  }

  /** Problems met while unpacking archives (shown in the import summary). */
  readonly problems: string[] = [];

  /**
   * Adds files; archives (zip, VaM .var, 7z, RAR, tar, gzip, Unity
   * packages, also inside each other) are unpacked into a folder named
   * after the archive.
   */
  async addFiles(entries: { path: string; file: Blob }[], depth = 0): Promise<void> {
    for (const { path, file } of entries) {
      // Archives by name, or by their first bytes when the name says nothing useful.
      const kind = archiveKind(path) ?? (classifyFile(path).kind === 'other' ? await sniffArchive(file).catch(() => null) : null);
      if (!kind || depth >= 3) {
        this.add(path, file);
        continue;
      }
      const base = path.replace(/\.(zip|var|tar\.gz|tgz|tar|gz|7z|rar|unitypackage)$/i, '');
      try {
        const inner: { path: string; file: Blob }[] = [];
        for await (const e of unpack(file, kind, path)) {
          if ('error' in e) this.problems.push(e.error);
          else inner.push({ path: `${base}/${e.path}`, file: e.data });
        }
        await this.addFiles(inner, depth + 1);
      } catch (err) {
        this.problems.push(`${path.split('/').pop()}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  get(path: string): Blob | undefined {
    return this.files.get(VirtualFiles.normalise(path));
  }

  /**
   * Finds a file referenced from `fromPath` (e.g. a texture in an MTL or
   * FBX): exact relative path first, then anywhere by file name, since
   * exported files often keep absolute paths from the author's machine.
   */
  resolve(reference: string, fromPath = ''): string | undefined {
    const ref = VirtualFiles.normalise(decodeURIComponent(reference));
    const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
    const candidates = [joinPath(dir, ref), ref];
    for (const c of candidates) if (this.files.has(c)) return c;
    const name = ref.split('/').pop()!.toLowerCase();
    return this.paths.find((p) => p.toLowerCase().endsWith('/' + name) || p.toLowerCase() === name);
  }

  /** A blob URL for a file (created once, revoked by dispose). */
  url(path: string): string | undefined {
    const p = VirtualFiles.normalise(path);
    const blob = this.files.get(p);
    if (!blob) return undefined;
    let url = this.urls.get(p);
    if (!url) {
      url = URL.createObjectURL(blob);
      this.urls.set(p, url);
    }
    return url;
  }

  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

/** Joins a directory and a relative path, resolving "..". */
export function joinPath(dir: string, rel: string): string {
  const parts = (dir + rel).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
