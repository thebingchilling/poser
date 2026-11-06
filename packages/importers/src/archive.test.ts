import { describe, expect, it } from 'vitest';
import { gzipSync, zipSync } from 'fflate';
import { archiveKind, readTar, readUnityPackage, sniffArchive, ZipReader } from './archive';
import { VirtualFiles } from './files';

const enc = (s: string) => new TextEncoder().encode(s);

/** A minimal ustar archive. */
function tar(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (const [name, text] of Object.entries(files)) {
    const data = enc(text);
    const h = new Uint8Array(512);
    h.set(enc(name), 0);
    h.set(enc('0000644\0'), 100);
    h.set(enc(data.length.toString(8).padStart(11, '0') + '\0'), 124);
    h[156] = 0x30;
    h.set(enc('ustar\0'), 257);
    parts.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, (o += p.length) - p.length);
  return out;
}

describe('archives', () => {
  it('reads zip entries one at a time, stored and deflated', async () => {
    const zip = zipSync({ 'a/stored.txt': [enc('plain'), { level: 0 }], 'a/packed.json': [enc('{"x":'.padEnd(5000, ' ') + '1}'), { level: 9 }] });
    const r = await ZipReader.open(new Blob([zip]));
    expect(r.names.sort()).toEqual(['a/packed.json', 'a/stored.txt']);
    expect(await (await r.read('a/stored.txt'))!.text()).toBe('plain');
    expect(JSON.parse(await (await r.read('A/PACKED.JSON'))!.text())).toEqual({ x: 1 });
  });

  it('reads tar and Unity packages', async () => {
    const t = await readTar(new Blob([tar({ 'm/model.obj': 'v 0 0 0', 'm/tex.png': 'png' })]));
    expect(t.map((e) => e.path)).toEqual(['m/model.obj', 'm/tex.png']);
    const pkg = gzipSync(tar({ 'abc/asset': 'v 1 2 3', 'abc/pathname': 'Assets/Models/Thing.obj\n00', 'abc/asset.meta': 'x' }));
    const u = await readUnityPackage(new Blob([pkg]));
    expect(u.map((e) => e.path)).toEqual(['Assets/Models/Thing.obj']);
    expect(await u[0]!.data.text()).toBe('v 1 2 3');
  });

  it('knows archives by name and by content', async () => {
    expect(archiveKind('Author.Look.3.var')).toBe('zip');
    expect(archiveKind('x.tar.gz')).toBe('tgz');
    expect(archiveKind('x.part1.rar')).toBe('rar');
    expect(await sniffArchive(new Blob([zipSync({ a: enc('1') })]))).toBe('zip');
    expect(await sniffArchive(new Blob([tar({ a: '1' })]))).toBe('tar');
  });

  it('unpacks nested archives into the virtual folder', async () => {
    const inner = zipSync({ 'Custom/Atom/Person/Appearance/Look.vap': enc('{}') });
    const outer = zipSync({ 'Author.Look.1.var': [inner, { level: 0 }] });
    const vfs = new VirtualFiles();
    await vfs.addFiles([{ path: 'download.zip', file: new Blob([outer]) }, { path: 'noext', file: new Blob([gzipSync(tar({ 'm.obj': 'v 0 0 0' }))]) }]);
    expect(vfs.paths.sort()).toEqual(['download/Author.Look.1/Custom/Atom/Person/Appearance/Look.vap', 'noext/m.obj']);
    expect(vfs.problems).toEqual([]);
  });

  it('unpacks 7z with 7-Zip', async () => {
    const { extractWith7z } = await import('./sevenZipCore');
    // 7-Zip itself makes the archive, then reads it back.
    const SevenZip = (await import('7z-wasm')).default;
    const m = await SevenZip({ print: () => undefined, printErr: () => undefined } as never);
    const fs = m.FS as unknown as { writeFile(p: string, d: Uint8Array): void; readFile(p: string): Uint8Array; mkdir(p: string): void; chdir(p: string): void };
    fs.mkdir('/w');
    fs.chdir('/w');
    fs.mkdir('/w/d');
    fs.writeFile('/w/d/model.obj', enc('v 0 0 0'));
    m.callMain(['a', '/w/t.7z', 'd']);
    const entries = await extractWith7z(new Blob([fs.readFile('/w/t.7z') as Uint8Array<ArrayBuffer>]), 't.7z');
    expect(entries.map((e) => e.path)).toEqual(['d/model.obj']);
    expect(await entries[0]!.data.text()).toBe('v 0 0 0');
  });
});
