import { BufferAttribute, BufferGeometry } from 'three';

/** Object File Format (.off, also COFF/NOFF): vertices then polygons, one per line. */
export function parseOff(text: string): BufferGeometry {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
  let l = 0;
  let header = lines[0] ?? '';
  let counts = header;
  if (/^[A-Z]*OFF/i.test(header)) {
    // The counts may share the header line ("OFF 8 6 12").
    counts = header.replace(/^[A-Z]*OFF/i, '').trim() || lines[++l]!;
    header = header.split(/\s+/)[0]!;
  } else header = 'OFF';
  l++;
  const [nv, nf] = counts.split(/\s+/).map(Number) as [number, number];
  if (!Number.isInteger(nv) || !Number.isInteger(nf) || nv < 0 || nf < 0) throw new Error('This .off file is not in a format that can be read.');
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const v = (lines[l++] ?? '').split(/\s+/).map(Number);
    pos.set([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0], i * 3);
  }
  const index: number[] = [];
  for (let f = 0; f < nf; f++) {
    const v = (lines[l++] ?? '').split(/\s+/).map(Number);
    const n = v[0] ?? 0;
    // Anything after the vertex indices is a face colour.
    const ids = v.slice(1, 1 + n);
    for (let i = 1; i + 1 < ids.length; i++) index.push(ids[0]!, ids[i]!, ids[i + 1]!);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
