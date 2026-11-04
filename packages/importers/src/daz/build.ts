import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Skeleton,
  SkinnedMesh,
  Texture,
  TextureLoader,
  Vector3,
  type Material,
} from 'three';
import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js';
import { channelValue, evaluateFormulas, fragment, type DsonChannel, type DsonFile, type DsonFormula, type DsonGeometry, type DsonMaterial, type DsonNode, type DsonResolver } from './dson';

/**
 * Builds a three.js model from a Daz scene (.duf) or figure asset (.dsf)
 * (PLAN.md, "Phase 1: import anything"): figure geometry with UVs, the
 * skeleton from bone centre points, skin weights, the scene's morph values
 * (character dials and everything they drive through formulas, including
 * joint shifts), Iray materials, conforming clothing and hair, geografts,
 * and props parented to bones. Units stay Daz centimetres; the import
 * pipeline converts them like any other file.
 */

export interface DazBuildResult {
  root: Group;
  warnings: string[];
  /** Library paths that weren't found (the wizard asks for the content folder). */
  missing: string[];
  /** The main figure's name, e.g. "Genesis 8 Female". */
  figureName?: string;
}

interface FigureInstance {
  inst: DsonNode;
  asset: DsonNode;
  assetPath: string;
}

interface BuiltFigure {
  instId: string;
  root: Bone | null;
  bones: Map<string, Bone>;
  mesh: Mesh | null;
  hiddenPolys?: number[];
  /** Geometry and the source polygon index of each triangle (for graft hiding). */
  triPoly?: Int32Array;
}

const axisIndex = (id: string) => (id === 'x' ? 0 : id === 'y' ? 1 : 2);

function point(values: DsonNode['center_point']): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const c of values ?? []) out[axisIndex(c.id)] = c.current_value ?? c.value ?? 0;
  return out;
}

export async function buildDaz(mainPath: string, main: DsonFile, resolver: DsonResolver): Promise<DazBuildResult> {
  const warnings: string[] = [];
  const root = new Group();
  root.name = 'Daz scene';

  // Figures in the scene (a .dsf figure asset carries its own default scene).
  let sceneNodes = main.scene?.nodes ?? [];
  if (!sceneNodes.length) sceneNodes = (main.node_library ?? []).filter((n) => n.type === 'figure').map((n) => ({ ...n, url: `#${n.id}` }));
  const figures: FigureInstance[] = [];
  const props: FigureInstance[] = [];
  for (const inst of sceneNodes) {
    if (!inst.url) continue;
    const found = await resolver.get('node_library', inst.url, mainPath);
    if (!found) continue;
    const asset = found.item as DsonNode;
    if (asset.type === 'figure') figures.push({ inst, asset, assetPath: found.path });
    else if (asset.type === 'node' || asset.type === 'prop' || !asset.type) props.push({ inst, asset, assetPath: found.path });
  }
  const isFollower = (f: FigureInstance) => !!f.inst.conform_target || !!f.inst.parent;
  const primary = figures.find((f) => !isFollower(f)) ?? figures[0];
  if (!primary) {
    return { root, warnings: ['No figure found in this Daz file.'], missing: [...resolver.missing] };
  }

  const sceneModifiers = main.scene?.modifiers ?? [];
  const sceneMaterials = main.scene?.materials ?? [];

  const body = await buildFigure(primary, null);
  if (body.mesh) root.add(body.mesh);
  const rootBone = body.root ?? [...body.bones.values()][0];
  if (rootBone) root.add(rootBone);

  for (const f of figures) {
    if (f === primary) continue;
    const built = await buildFigure(f, body);
    if (built.hiddenPolys?.length && body.mesh && body.triPoly) hidePolys(body.mesh, body.triPoly, new Set(built.hiddenPolys));
    if (built.mesh) root.add(built.mesh);
  }
  for (const p of props) {
    const mesh = await buildProp(p, body);
    if (mesh) root.add(mesh);
  }

  return { root, warnings, missing: [...resolver.missing], figureName: primary.asset.label ?? primary.asset.name ?? primary.asset.id };

  // ---------- Figures ----------

  async function buildFigure(fig: FigureInstance, follow: BuiltFigure | null): Promise<BuiltFigure> {
    const { inst, asset, assetPath } = fig;
    const assetFile = (await resolver.file(assetPath))!;
    const instId = inst.id;

    // Morph dials on this figure, the morph assets, and every formula they carry.
    const morphs: { id: string; deltas: [number, number, number, number][] }[] = [];
    const dials = new Map<string, number>();
    const formulas: DsonFormula[] = [];
    for (const m of assetFile.modifier_library ?? []) if (m.formulas) formulas.push(...m.formulas);
    for (const sm of sceneModifiers) {
      if (!sm.url || fragment(sm.parent ?? '') !== instId) continue;
      const found = await resolver.get('modifier_library', sm.url, mainPath);
      if (!found) continue;
      const mod = found.item;
      dials.set(mod.id, channelValue(sm.channel) || (sm.channel ? 0 : channelValue(mod.channel)));
      if (mod.formulas) formulas.push(...mod.formulas);
      if (mod.morph) morphs.push({ id: mod.id, deltas: mod.morph.deltas.values });
    }
    const values = evaluateFormulas(formulas, dials);

    // Skeleton: every bone in the figure asset, at its centre point plus formula shifts.
    const nodes = (assetFile.node_library ?? []).filter((n) => n.type === 'bone' || n.id === asset.id);
    const bones = new Map<string, Bone>();
    const centres = new Map<string, Vector3>();
    for (const n of nodes) {
      const c = point(n.center_point);
      for (const axis of ['x', 'y', 'z'] as const) c[axisIndex(axis)] += values.get(`${n.id}?center_point/${axis}`) ?? 0;
      centres.set(n.id, new Vector3(...c));
    }
    for (const n of nodes) {
      // A follower (clothing) reuses the body's bone of the same name; its own root is the body's root.
      const shared = follow ? (n.id === asset.id ? follow.root : follow.bones.get(n.id)) : undefined;
      if (shared) {
        bones.set(n.id, shared);
        continue;
      }
      const b = new Bone();
      b.name = n.id;
      bones.set(n.id, b);
    }
    const sharedBone = (b: Bone) => !!follow && [...follow.bones.values()].includes(b);
    for (const n of nodes) {
      const b = bones.get(n.id)!;
      if (sharedBone(b)) continue;
      const parentId = n.parent ? fragment(n.parent) : '';
      const parent = bones.get(parentId);
      const c = centres.get(n.id)!;
      if (parent) {
        parent.add(b);
        const pc = sharedBone(parent) ? worldOf(parent) : centres.get(parentId)!;
        b.position.copy(c).sub(pc);
      } else b.position.copy(c);
    }

    // Geometry.
    const geomUrl = inst.geometries?.[0]?.url ?? assetFile.scene?.nodes?.find((n) => fragment(n.url ?? '') === asset.id)?.geometries?.[0]?.url ?? (assetFile.geometry_library?.[0] ? `#${assetFile.geometry_library[0].id}` : null);
    const rootBone = bones.get(asset.id) ?? null;
    if (!geomUrl) return { instId, root: rootBone, bones, mesh: null };
    const g = await resolver.get('geometry_library', geomUrl, assetPath);
    if (!g) {
      warnings.push(`Missing geometry for ${asset.label ?? asset.id}`);
      return { instId, root: rootBone, bones, mesh: null };
    }
    const geom = g.item as DsonGeometry;
    const geomInstId = inst.geometries?.[0]?.id ?? geom.id;
    const positions = geom.vertices.values.map((v) => [...v] as [number, number, number]);
    for (const m of morphs) {
      const v = values.get(`${m.id}?value`) ?? 0;
      if (!v) continue;
      for (const [vi, dx, dy, dz] of m.deltas) {
        const p = positions[vi];
        if (!p) continue;
        p[0] += dx * v;
        p[1] += dy * v;
        p[2] += dz * v;
      }
    }

    // Skin binding.
    const skinMod =
      (assetFile.modifier_library ?? []).find((m) => m.skin && (!m.skin.geometry || fragment(m.skin.geometry) === geom.id)) ??
      (assetFile.modifier_library ?? []).find((m) => m.skin);
    const weights: Map<number, number>[] = positions.map(() => new Map());
    const boneList = [...new Set(bones.values())];
    const boneIdx = new Map(boneList.map((b, i) => [b, i]));
    if (skinMod?.skin) {
      for (const j of skinMod.skin.joints) {
        const b = bones.get(fragment(j.node));
        if (!b) continue;
        const bi = boneIdx.get(b)!;
        for (const [vi, w] of j.node_weights?.values ?? []) weights[vi]?.set(bi, (weights[vi]!.get(bi) ?? 0) + w);
      }
    } else warnings.push(`${asset.label ?? asset.id} has no skin binding; it won't follow poses.`);

    const uv = geom.default_uv_set ? await resolver.get('uv_set_library', geom.default_uv_set, g.path) : null;
    const { geometry, triPoly } = buildGeometry(geom, positions, uv?.item ?? null, weights);
    const materials = await Promise.all(geom.polygon_material_groups.values.map((name) => buildMaterial(name, geomInstId, assetFile, assetPath)));

    let mesh: Mesh;
    if (skinMod?.skin) {
      const skinned = new SkinnedMesh(geometry, materials);
      // Bones have no rest rotation, so each bind inverse is just its rest position.
      skinned.bind(new Skeleton(boneList, boneList.map((b) => worldInverse(b))));
      mesh = skinned;
    } else mesh = new Mesh(geometry, materials);
    mesh.name = inst.label ?? asset.label ?? asset.name ?? asset.id;
    const hidden = geom.graft?.hidden_polys?.values;
    return { instId, root: rootBone, bones, mesh, triPoly, hiddenPolys: follow && hidden ? hidden : undefined };
  }

  /** A prop: rigid geometry, parented to a bone if it hangs off the figure (hair, jewellery). */
  async function buildProp(p: FigureInstance, fig: BuiltFigure): Promise<Mesh | null> {
    const assetFile = await resolver.file(p.assetPath);
    const geomUrl = p.inst.geometries?.[0]?.url ?? (assetFile?.geometry_library?.[0] ? `#${assetFile.geometry_library[0].id}` : null);
    if (!assetFile || !geomUrl) return null;
    const g = await resolver.get('geometry_library', geomUrl, p.assetPath);
    if (!g) return null;
    const geom = g.item as DsonGeometry;
    const positions = geom.vertices.values.map((v) => [...v] as [number, number, number]);
    const bone = p.inst.parent ? fig.bones.get(fragment(p.inst.parent).split(':').pop()!) : undefined;
    const boneList = [...new Set(fig.bones.values())];
    const bi = bone ? boneList.indexOf(bone) : -1;
    const weights = positions.map(() => new Map(bi >= 0 ? [[bi, 1]] : []));
    const uv = geom.default_uv_set ? await resolver.get('uv_set_library', geom.default_uv_set, g.path) : null;
    const { geometry } = buildGeometry(geom, positions, uv?.item ?? null, weights);
    const materials = await Promise.all(geom.polygon_material_groups.values.map((name) => buildMaterial(name, p.inst.geometries?.[0]?.id ?? geom.id, assetFile, p.assetPath)));
    let mesh: Mesh;
    if (bone) {
      // Rigid attachment as a skinned mesh fully weighted to its bone.
      const skinned = new SkinnedMesh(geometry, materials);
      skinned.bind(new Skeleton(boneList, boneList.map((b) => worldInverse(b))));
      mesh = skinned;
    } else mesh = new Mesh(geometry, materials);
    mesh.name = p.inst.label ?? p.asset.label ?? p.asset.id;
    return mesh;
  }

  // ---------- Materials ----------

  async function buildMaterial(group: string, geomInstId: string, assetFile: DsonFile, assetPath: string): Promise<Material> {
    const fromScene = sceneMaterials.find((m) => (!m.geometry || fragment(m.geometry) === geomInstId) && (m.groups ?? []).includes(group));
    const fromAsset = (assetFile.material_library ?? []).find((m) => (m.groups ?? []).includes(group) || m.id === group);
    let base: DsonMaterial | undefined;
    if (fromScene?.url) base = (await resolver.get('material_library', fromScene.url, mainPath))?.item as DsonMaterial | undefined;
    const layers = [fromAsset, base, fromScene].filter((m): m is DsonMaterial => !!m);
    const find = (...names: string[]): DsonChannel | undefined => {
      const wanted = names.map((n) => n.toLowerCase());
      let hit: DsonChannel | undefined;
      for (const m of layers) {
        for (const [k, v] of Object.entries(m)) {
          const ch = (v as { channel?: DsonChannel })?.channel;
          if (ch && wanted.includes(k.toLowerCase())) hit = ch;
        }
        for (const e of m.extra ?? []) for (const c of e.channels ?? []) if (wanted.includes(c.channel.id.toLowerCase()) || wanted.includes(String((c.channel as { label?: string }).label ?? '').toLowerCase())) hit = c.channel;
      }
      return hit;
    };
    const mat = new MeshStandardMaterial({ name: group, roughness: 0.6, metalness: 0 });
    const diffuse = find('diffuse', 'Diffuse Color', 'Base Color');
    const color = diffuse?.current_value ?? diffuse?.value;
    if (Array.isArray(color) && color.length >= 3) mat.color.setRGB(color[0] as number, color[1] as number, color[2] as number, SRGBColorSpace);
    const map = await texture(diffuse, true);
    if (map) mat.map = map;
    const normal = await texture(find('Normal Map', 'normal'), false);
    if (normal) mat.normalMap = normal;
    const rough = find('Glossy Roughness', 'roughness');
    const gloss = find('Glossiness', 'glossiness');
    if (rough && typeof (rough.current_value ?? rough.value) === 'number') mat.roughness = channelValue(rough);
    else if (gloss && typeof (gloss.current_value ?? gloss.value) === 'number') mat.roughness = 1 - channelValue(gloss);
    const cutout = find('Cutout Opacity', 'opacity');
    const alpha = await texture(cutout, false);
    if (alpha) {
      // Eyelashes, hair cards, lace: cut out by the map.
      mat.alphaMap = alpha;
      mat.alphaTest = 0.5;
      mat.side = DoubleSide;
    } else if (cutout && channelValue(cutout) < 0.99 && (cutout.current_value !== undefined || cutout.value !== undefined)) {
      // Corneas, eye moisture, tear layers: mostly see-through.
      mat.transparent = true;
      mat.opacity = Math.max(0.02, channelValue(cutout));
      mat.depthWrite = false;
    }
    return mat;
  }

  async function texture(ch: DsonChannel | undefined, colour: boolean): Promise<Texture | null> {
    const file = ch?.image_file;
    if (!file || typeof document === 'undefined') return null;
    const blob = await resolver.blob(file);
    if (!blob) {
      warnings.push(`Missing texture: ${file.split('/').pop()}`);
      return null;
    }
    let tex: Texture;
    if (/\.tiff?$/i.test(file)) {
      tex = new TIFFLoader().parse(await blob.arrayBuffer()) as unknown as Texture;
      const t = tex as Texture & { needsUpdate: boolean };
      t.needsUpdate = true;
    } else {
      const url = URL.createObjectURL(blob);
      try {
        tex = await new TextureLoader().loadAsync(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    tex.name = file.split('/').pop()!;
    if (colour) tex.colorSpace = SRGBColorSpace;
    return tex;
  }
}

// ---------- Geometry helpers ----------

/** Splits vertices by (vertex, UV) pairs, triangulates, groups by material, and adds smooth normals and skin weights. */
function buildGeometry(
  geom: DsonGeometry,
  positions: [number, number, number][],
  uvSet: { uvs: { values: [number, number][] }; polygon_vertex_indices?: [number, number, number][] } | null,
  weights: Map<number, number>[],
): { geometry: BufferGeometry; triPoly: Int32Array } {
  const uvOverride = new Map<string, number>();
  for (const [poly, v, u] of uvSet?.polygon_vertex_indices ?? []) uvOverride.set(`${poly}:${v}`, u);
  const uvs = uvSet?.uvs.values ?? [];

  // Smooth normals per source vertex, so UV seams don't show.
  const normals = positions.map((): [number, number, number] => [0, 0, 0]);
  const polys = geom.polylist.values;
  for (const p of polys) {
    const vs = p.slice(2);
    for (let k = 1; k + 1 < vs.length; k++) {
      const [a, b, c] = [positions[vs[0]!]!, positions[vs[k]!]!, positions[vs[k + 1]!]!];
      const u: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: [number, number, number] = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const i of [vs[0]!, vs[k]!, vs[k + 1]!]) for (let q = 0; q < 3; q++) normals[i]![q]! += n[q]!;
    }
  }

  const key = new Map<string, number>();
  const src: { v: number; uv: number }[] = [];
  const byMaterial: number[][] = geom.polygon_material_groups.values.map(() => []);
  const triPolyByMaterial: number[][] = geom.polygon_material_groups.values.map(() => []);
  polys.forEach((p, pi) => {
    const mat = p[1] ?? 0;
    const ids = p.slice(2).map((v) => {
      const uvi = uvOverride.get(`${pi}:${v}`) ?? v;
      const k = `${v}/${uvi}`;
      let id = key.get(k);
      if (id === undefined) {
        id = src.length;
        key.set(k, id);
        src.push({ v, uv: uvi });
      }
      return id;
    });
    for (let k = 1; k + 1 < ids.length; k++) {
      (byMaterial[mat] ?? byMaterial[0]!).push(ids[0]!, ids[k]!, ids[k + 1]!);
      (triPolyByMaterial[mat] ?? triPolyByMaterial[0]!).push(pi);
    }
  });

  const n = src.length;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const T = new Float32Array(n * 2);
  const J = new Uint16Array(n * 4);
  const W = new Float32Array(n * 4);
  src.forEach(({ v, uv }, i) => {
    P.set(positions[v]!, i * 3);
    const nn = normals[v]!;
    const l = Math.hypot(nn[0]!, nn[1]!, nn[2]!) || 1;
    N.set([nn[0]! / l, nn[1]! / l, nn[2]! / l], i * 3);
    const t = uvs[uv];
    if (t) T.set([t[0], t[1]], i * 2);
    const top = [...(weights[v] ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((s, [, w]) => s + w, 0);
    top.forEach(([b, w], k) => {
      J[i * 4 + k] = b;
      W[i * 4 + k] = total > 0 ? w / total : 0;
    });
    if (!top.length || total <= 0) W[i * 4] = 1;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(P, 3));
  geometry.setAttribute('normal', new BufferAttribute(N, 3));
  geometry.setAttribute('uv', new BufferAttribute(T, 2));
  geometry.setAttribute('skinIndex', new BufferAttribute(J, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(W, 4));
  const index: number[] = [];
  const triPoly: number[] = [];
  byMaterial.forEach((tris, m) => {
    if (!tris.length) return;
    geometry.addGroup(index.length, tris.length, m);
    index.push(...tris);
    triPoly.push(...triPolyByMaterial[m]!);
  });
  geometry.setIndex(index);
  // Source vertex of each vertex (vertices are split at UV seams), for morphs applied later (VaM looks).
  geometry.userData.sourceVertex = Int32Array.from(src.map((x) => x.v));
  return { geometry, triPoly: Int32Array.from(triPoly) };
}

/** Removes the body triangles a geograft replaces. */
function hidePolys(mesh: Mesh, triPoly: Int32Array, hidden: Set<number>): void {
  const geo = mesh.geometry;
  const idx = geo.index!;
  const keep: number[] = [];
  const groups = geo.groups.map((g) => ({ ...g, count: 0, start: 0 }));
  geo.groups.forEach((g, gi) => {
    groups[gi]!.start = keep.length;
    for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) {
      if (hidden.has(triPoly[t]!)) continue;
      keep.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2));
    }
    groups[gi]!.count = keep.length - groups[gi]!.start;
  });
  geo.setIndex(keep);
  geo.clearGroups();
  for (const g of groups) if (g.count) geo.addGroup(g.start, g.count, g.materialIndex);
}

function worldOf(b: Bone): Vector3 {
  b.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(b.matrixWorld);
}

function worldInverse(b: Bone) {
  b.updateWorldMatrix(true, false);
  return b.matrixWorld.clone().invert();
}
