import { BufferAttribute, Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader, type Group, type Material } from 'three';
import { MissingContentError, readContent, type ContentSource } from '../content';
import { buildDaz } from '../daz/build';
import { DsonResolver, type DsonFile } from '../daz/dson';

/**
 * Virt-a-Mate content (PLAN.md, "Phase 1: import anything"). A `.var` is a
 * zip of VaM files plus `meta.json` (creator, licence, dependencies). A look
 * (`.vap` appearance preset, or a Person atom in a scene `.json`) lists the
 * character, morph values, clothing, hair, and skin textures. VaM's people
 * are Genesis 2 Female/Male, so the body comes from the user's Daz library
 * and the look is applied on top.
 *
 * Read so far: package metadata, looks and scenes, skin textures, and custom
 * morphs (.vmi + .vmb). VaM's clothing and hair geometry (.vab) is VaM's own
 * binary format and needs sample files before it can be read.
 */

export interface VarMeta {
  creator?: string;
  packageName?: string;
  license?: string;
  dependencies: string[];
}

export function parseVarMeta(text: string): VarMeta {
  const m = JSON.parse(text) as { creatorName?: string; packageName?: string; licenseType?: string; dependencies?: Record<string, unknown> };
  return { creator: m.creatorName, packageName: m.packageName, license: m.licenseType, dependencies: Object.keys(m.dependencies ?? {}) };
}

export interface VamLook {
  /** "Female 1", "Male 2", …: VaM's built-in characters (Genesis 2 bodies). */
  character: string;
  male: boolean;
  morphs: { uid: string; name?: string; value: number }[];
  clothing: string[];
  hair: string[];
  /** Skin texture URLs by region (face, torso, limbs, genitals) and map (diffuse, normal). */
  textures: Record<string, string>;
}

type Storable = { id: string; [key: string]: unknown };

/** Reads a look from a `.vap` preset or the first Person atom of a scene `.json`. */
export function parseLook(text: string): VamLook {
  const doc = JSON.parse(text) as { storables?: Storable[]; atoms?: { type?: string; storables?: Storable[] }[] };
  const storables = doc.storables ?? doc.atoms?.find((a) => a.type === 'Person')?.storables;
  if (!storables) throw new Error('No VaM person found in this file.');
  const geometry: Record<string, unknown> = storables.find((s) => s.id === 'geometry') ?? {};
  const textures: Record<string, unknown> = storables.find((s) => s.id === 'textures') ?? {};
  const character = String(geometry.character ?? 'Female 1');
  const items = (key: string) =>
    ((geometry[key] as { id?: string; internalId?: string; enabled?: string | boolean }[] | undefined) ?? [])
      .filter((c) => c.enabled === undefined || c.enabled === true || c.enabled === 'true')
      .map((c) => c.id ?? c.internalId ?? '')
      .filter(Boolean);
  const morphs = ((geometry.morphs as { uid?: string; name?: string; value?: string | number }[] | undefined) ?? [])
    .map((m) => ({ uid: m.uid ?? m.name ?? '', name: m.name, value: Number(m.value ?? 0) }))
    .filter((m) => m.uid && Number.isFinite(m.value) && m.value !== 0);
  const tex: Record<string, string> = {};
  for (const [k, v] of Object.entries(textures)) if (typeof v === 'string' && /Url$/.test(k) && v) tex[k.replace(/Url$/, '')] = v;
  return { character, male: /^male/i.test(character), morphs, clothing: items('clothing'), hair: items('hair'), textures: tex };
}

/**
 * A path inside the dropped files for a VaM URL: "Author.Package.1:/Custom/…"
 * or "SELF:/Custom/…" (inside this package), or a plain "Custom/…" path.
 */
export function vamPath(url: string): string {
  return url.replace(/^[^:/]*:\//, '').replace(/^\/+/, '');
}

/**
 * VaM morph deltas (.vmb): a count, then per delta a vertex index and an
 * offset in Unity space (metres, x mirrored). Checked against the count in
 * the matching .vmi so a layout surprise is reported, not applied.
 */
export function parseVmb(buffer: ArrayBuffer, expected?: number): { vertex: number; delta: [number, number, number] }[] | null {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 4) return null;
  const n = dv.getInt32(0, true);
  if (n < 0 || 4 + n * 16 !== buffer.byteLength || (expected !== undefined && expected !== n)) return null;
  const out: { vertex: number; delta: [number, number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 16;
    // Unity → Daz: mirror x, metres → centimetres.
    out.push({ vertex: dv.getInt32(o, true), delta: [-dv.getFloat32(o + 4, true) * 100, dv.getFloat32(o + 8, true) * 100, dv.getFloat32(o + 12, true) * 100] });
  }
  return out;
}

/** Which Genesis 2 surfaces each VaM skin texture region covers. */
const REGION_SURFACES: Record<string, RegExp> = {
  face: /face|lip|ear|head|eyesocket|nostril/i,
  torso: /torso|neck|nipple|hip|shoulder/i,
  limbs: /arm|leg|hand|feet|foot|finger|toe|nail|forearm/i,
  genitals: /genital|anus|gens/i,
};

/** Builds a VaM look on the Genesis 2 body from the Daz library. */
export async function buildVamLook(look: VamLook, sources: ContentSource[]): Promise<{ root: Group; warnings: string[] }> {
  const warnings: string[] = [];
  const figure = look.male ? 'Genesis2Male' : 'Genesis2Female';
  const dsf = `/data/DAZ%203D/Genesis%202/${look.male ? 'Male' : 'Female'}/${figure}.dsf`;
  const scene: DsonFile = { scene: { nodes: [{ id: figure, url: `${dsf}#${figure}` }] } };
  const resolver = new DsonResolver(sources, { 'vam-look.duf': scene });
  const built = await buildDaz('vam-look.duf', scene, resolver);
  let body: Mesh | undefined;
  built.root.traverse((o) => (body ??= o instanceof Mesh ? o : undefined));
  if (!body) throw new MissingContentError(built.missing.length ? built.missing : [dsf.replace(/%20/g, ' ').slice(1)], 'daz');
  warnings.push(...built.warnings);

  // Custom morphs from packages (.vmi + .vmb); VaM's built-in morphs live inside VaM itself.
  let applied = 0;
  const builtIn: string[] = [];
  const pos = body.geometry.attributes.position as BufferAttribute;
  const source = body.geometry.userData.sourceVertex as Int32Array;
  const bySource = new Map<number, number[]>();
  source.forEach((v, i) => bySource.set(v, [...(bySource.get(v) ?? []), i]));
  for (const m of look.morphs) {
    if (!/\.vmi$/i.test(m.uid)) {
      builtIn.push(m.name ?? m.uid);
      continue;
    }
    const base = vamPath(m.uid).replace(/\.vmi$/i, '');
    const vmi = await readContent(`${base}.vmi`, sources);
    const vmb = await readContent(`${base}.vmb`, sources);
    if (!vmb) {
      warnings.push(`Missing morph ${base.split('/').pop()}`);
      continue;
    }
    const expected = vmi ? (JSON.parse(await vmi.text()) as { numDeltas?: number }).numDeltas : undefined;
    const deltas = parseVmb(await vmb.arrayBuffer(), expected);
    if (!deltas) {
      warnings.push(`Couldn't read morph ${base.split('/').pop()} (unexpected format; please send it as a sample)`);
      continue;
    }
    for (const { vertex, delta } of deltas)
      for (const i of bySource.get(vertex) ?? []) pos.setXYZ(i, pos.getX(i) + delta[0] * m.value, pos.getY(i) + delta[1] * m.value, pos.getZ(i) + delta[2] * m.value);
    applied++;
  }
  if (applied) body.geometry.computeBoundingBox();
  if (builtIn.length) warnings.push(`${builtIn.length} of VaM's built-in morphs aren't available outside VaM and were skipped (for example ${builtIn[0]}).`);

  // Skin textures by region.
  const materials = (Array.isArray(body.material) ? body.material : [body.material]) as Material[];
  for (const [key, url] of Object.entries(look.textures)) {
    const m = /^(face|torso|limbs|genitals)(Diffuse|Normal|Specular|Gloss)$/i.exec(key);
    if (!m || typeof document === 'undefined') continue;
    const blob = await readContent(vamPath(url), sources);
    if (!blob) {
      warnings.push(`Missing texture ${url.split('/').pop()}`);
      continue;
    }
    const objectUrl = URL.createObjectURL(blob);
    const tex = await new TextureLoader().loadAsync(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
    const region = REGION_SURFACES[m[1]!.toLowerCase()]!;
    const kind = m[2]!.toLowerCase();
    if (kind === 'diffuse') tex.colorSpace = SRGBColorSpace;
    for (const mat of materials) {
      if (!(mat instanceof MeshStandardMaterial) || !region.test(mat.name)) continue;
      if (kind === 'diffuse') {
        mat.map = tex;
        mat.color.set(0xffffff);
      } else if (kind === 'normal') mat.normalMap = tex;
      mat.needsUpdate = true;
    }
  }

  const skipped = [...look.clothing, ...look.hair];
  if (skipped.length) warnings.push(`VaM clothing and hair can't be read yet (${skipped.length} items, e.g. ${skipped[0]}); send a sample package so the format can be added.`);
  built.root.name = `VaM ${look.character}`;
  return { root: built.root, warnings };
}
