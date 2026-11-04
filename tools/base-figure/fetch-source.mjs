// Downloads the official MPFB 2 release (MakeHuman's Blender add-on), checks
// it against a pinned hash, and extracts only the CC0 data files the base
// figure build uses into source/ (committed, so builds don't need the network).
// MakeHuman core assets are CC0: https://static.makehumancommunity.org/about/license.html
// Only data files are taken; none of MPFB's (GPL) code.
// Usage: node tools/base-figure/fetch-source.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, unzipSync } from 'fflate';

const URL_ = 'https://download.tuxfamily.org/makehuman/releases/mpfb-2.0.0-a2.zip';
const SHA256 = '5db91045cbc86ed4129218561b092f6833cb472a0c4c755cebaec711677386b1';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'source');

const races = ['african', 'asian', 'caucasian'];
const targets = [
  ...['female', 'male'].flatMap((g) => races.map((r) => `macrodetails/${r}-${g}-young.target.gz`)),
  ...['female', 'male'].flatMap((g) =>
    ['averagemuscle-maxweight', 'averagemuscle-minweight', 'maxmuscle-averageweight', 'minmuscle-averageweight'].map((m) => `macrodetails/universal-${g}-young-${m}.target.gz`),
  ),
  'breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target.gz',
  'breast/female-young-averagemuscle-averageweight-mincup-averagefirmness.target.gz',
  'torso/measure-waist-circ-incr.target.gz',
  'torso/measure-waist-circ-decr.target.gz',
  'torso/measure-hips-circ-incr.target.gz',
  'torso/measure-hips-circ-decr.target.gz',
  'torso/torso-vshape-incr.target.gz',
  'torso/torso-vshape-decr.target.gz',
];
const files = ['3dobjs/base.obj', 'mesh_metadata/basemesh_vertex_groups.json', 'rigs/standard/weights.default.json', ...targets.map((t) => `targets/${t}`)];

const res = await fetch(URL_);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const zip = new Uint8Array(await res.arrayBuffer());
const hash = createHash('sha256').update(zip).digest('hex');
if (hash !== SHA256) throw new Error(`Unexpected archive (sha256 ${hash})`);
const entries = unzipSync(zip, { filter: (f) => files.some((n) => f.name === `mpfb/data/${n}`) });
for (const name of files) {
  const data = entries[`mpfb/data/${name}`];
  if (!data) throw new Error(`Missing ${name} in the archive`);
  // Text files are stored gzipped to keep the repository small; targets already are.
  const target = join(out, name.endsWith('.gz') ? name : `${name}.gz`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, name.endsWith('.gz') ? data : gzipSync(data, { level: 9 }));
}
console.log(`Extracted ${files.length} files to ${out}`);
