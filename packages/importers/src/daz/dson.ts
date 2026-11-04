import { gunzipSync } from 'fflate';
import { libraryPath, readContent, type ContentSource } from '../content';

/**
 * Daz DSON files (.duf scenes, .dsf assets): JSON, usually gzipped
 * (PLAN.md section 4.2). Assets refer to each other by URL,
 * "/data/DAZ%203D/Genesis%208/Female/Genesis8Female.dsf#Genesis8Female",
 * or "#id" within the same file.
 */

/** A DSON channel value: `current_value` in scenes, `value` in assets. */
export interface DsonChannel {
  id: string;
  type?: string;
  value?: unknown;
  current_value?: unknown;
  image_file?: string;
  image?: string;
  min?: number;
  max?: number;
}

export interface DsonNode {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  url?: string;
  parent?: string;
  conform_target?: string;
  center_point?: { id: string; value: number; current_value?: number }[];
  end_point?: { id: string; value: number; current_value?: number }[];
  geometries?: { id?: string; url: string }[];
  preview?: unknown;
}

export interface DsonGeometry {
  id: string;
  name?: string;
  type?: string;
  vertices: { count: number; values: [number, number, number][] };
  polygon_groups?: { values: string[] };
  polygon_material_groups: { values: string[] };
  polylist: { count: number; values: number[][] };
  default_uv_set?: string;
  graft?: { vertex_count?: number; poly_count?: number; vertex_pairs?: { values: [number, number][] }; hidden_polys?: { values: number[] } };
}

export interface DsonUvSet {
  id: string;
  vertex_count: number;
  uvs: { count: number; values: [number, number][] };
  polygon_vertex_indices?: [number, number, number][];
}

export interface DsonFormula {
  output: string;
  stage?: 'sum' | 'mult';
  operations: { op: string; url?: string; val?: number | number[] }[];
}

export interface DsonModifier {
  id: string;
  name?: string;
  parent?: string;
  channel?: DsonChannel;
  url?: string;
  morph?: { vertex_count: number; deltas: { count: number; values: [number, number, number, number][] } };
  skin?: {
    node: string;
    geometry: string;
    vertex_count: number;
    joints: { id: string; node: string; node_weights?: { count: number; values: [number, number][] } }[];
  };
  formulas?: DsonFormula[];
}

export interface DsonMaterial {
  id: string;
  url?: string;
  geometry?: string;
  groups?: string[];
  diffuse?: { channel: DsonChannel };
  extra?: { type?: string; channels?: { channel: DsonChannel }[] }[];
  [key: string]: unknown;
}

export interface DsonFile {
  file_version?: string;
  asset_info?: { id?: string; type?: string; contributor?: { author?: string } };
  geometry_library?: DsonGeometry[];
  node_library?: DsonNode[];
  uv_set_library?: DsonUvSet[];
  modifier_library?: DsonModifier[];
  material_library?: DsonMaterial[];
  image_library?: { id: string; map?: { url: string }[] }[];
  scene?: {
    nodes?: DsonNode[];
    modifiers?: DsonModifier[];
    materials?: DsonMaterial[];
    animations?: { url: string; keys: [number, unknown][] }[];
  };
}

export function parseDson(bytes: Uint8Array): DsonFile {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return JSON.parse(new TextDecoder().decode(raw)) as DsonFile;
}

/** The `#id` part of a URL (decoded), or '' if none. */
export function fragment(url: string): string {
  const i = url.indexOf('#');
  if (i < 0) return '';
  const f = url.slice(i + 1).split('?')[0]!;
  try {
    return decodeURIComponent(f);
  } catch {
    return f;
  }
}

/** Loads and caches DSON files from content sources; resolves cross-file references. */
export class DsonResolver {
  private readonly files = new Map<string, Promise<DsonFile | null>>();
  readonly missing = new Set<string>();

  constructor(
    private readonly sources: ContentSource[],
    /** Files already parsed (the scene being imported), by library path. */
    preloaded: Record<string, DsonFile> = {},
  ) {
    for (const [p, f] of Object.entries(preloaded)) this.files.set(p.toLowerCase(), Promise.resolve(f));
  }

  file(path: string): Promise<DsonFile | null> {
    const key = path.toLowerCase();
    let p = this.files.get(key);
    if (!p) {
      p = readContent(path, this.sources).then(async (blob) => {
        if (!blob) {
          this.missing.add(path);
          return null;
        }
        return parseDson(new Uint8Array(await blob.arrayBuffer()));
      });
      this.files.set(key, p);
    }
    return p;
  }

  /** Resolves a URL from `fromPath` to the file holding it and its path. */
  async locate(url: string, fromPath: string): Promise<{ file: DsonFile; path: string } | null> {
    const path = url.startsWith('#') ? fromPath : libraryPath(url);
    const file = await this.file(path);
    return file ? { file, path } : null;
  }

  /** Finds the object a URL points at in one of a file's libraries. */
  async get<K extends 'geometry_library' | 'node_library' | 'uv_set_library' | 'modifier_library' | 'material_library'>(
    library: K,
    url: string,
    fromPath: string,
  ): Promise<{ item: NonNullable<DsonFile[K]>[number]; path: string } | null> {
    const loc = await this.locate(url, fromPath);
    if (!loc) return null;
    const id = fragment(url);
    const list = (loc.file[library] ?? []) as { id: string }[];
    const item = list.find((x) => x.id === id) ?? (id ? undefined : list[0]);
    return item ? { item: item as NonNullable<DsonFile[K]>[number], path: loc.path } : null;
  }

  /** Reads a binary asset (a texture) by library path. */
  async blob(url: string): Promise<Blob | null> {
    const path = libraryPath(url);
    const b = await readContent(path, this.sources);
    if (!b) this.missing.add(path);
    return b;
  }
}

/** A channel's value: scene `current_value` first, then the asset's `value`. */
export function channelValue(ch: DsonChannel | undefined): number {
  const v = ch?.current_value ?? ch?.value;
  return typeof v === 'number' ? v : 0;
}

/**
 * Formula targets, e.g. "Genesis8Female:/data/…#FHMVictoria8?value" or
 * "lShin:/data/…#lShin?center_point/x": the object id (the fragment) and
 * the property after "?".
 */
export function formulaTarget(url: string): { id: string; property: string } {
  const q = url.lastIndexOf('?');
  const base = q < 0 ? url : url.slice(0, q);
  // Without a fragment, the scope before ":" names the node ("lShin:?center_point/x").
  return { id: fragment(base) || base.split(':')[0]!, property: q < 0 ? 'value' : url.slice(q + 1) };
}

/**
 * Evaluates DSON formulas (ERC links): each formula pushes values and
 * inputs, combines them with its operations, and adds its result to (or,
 * for "mult" stages, multiplies) its output. Inputs start from the morph
 * dials (by id); the result maps "id?property" to its total, the dials
 * included for "value". Bone rotations are inputs too, and are zero in the
 * rest pose this is evaluated in.
 */
export function evaluateFormulas(formulas: DsonFormula[], dials: Map<string, number>): Map<string, number> {
  const key = (url: string) => {
    const t = formulaTarget(url);
    return `${t.id}?${t.property}`;
  };
  let values = new Map<string, number>([...dials].map(([id, v]) => [`${id}?value`, v]));
  // Chains (a character morph driving a body morph driving a correction) settle in a few passes.
  for (let pass = 0; pass < 4; pass++) {
    const sums = new Map<string, number>();
    const mults = new Map<string, number>();
    for (const f of formulas) {
      const stack: (number | number[])[] = [];
      const num = () => {
        const v = stack.pop();
        return typeof v === 'number' ? v : 0;
      };
      let ok = true;
      for (const op of f.operations) {
        if (op.op === 'push') {
          if (op.url !== undefined) stack.push(values.get(key(op.url)) ?? 0);
          else if (op.val !== undefined) stack.push(op.val as number | number[]);
          else ok = false;
        } else if (op.op === 'mult' || op.op === 'add' || op.op === 'sub' || op.op === 'div') {
          const b = num();
          const a = num();
          stack.push(op.op === 'mult' ? a * b : op.op === 'add' ? a + b : op.op === 'sub' ? a - b : b === 0 ? 0 : a / b);
        } else if (op.op === 'spline_linear' || op.op === 'spline_tcb') {
          // Stack: input, knots [x, y, …] pushed one by one, then the knot count (TCB treated as linear).
          const count = num();
          const knots: [number, number][] = [];
          for (let k = 0; k < count; k++) {
            const kn = stack.pop();
            if (Array.isArray(kn)) knots.unshift([kn[0] ?? 0, kn[1] ?? 0]);
          }
          stack.push(splineLinear(knots, num()));
        } else ok = false;
      }
      if (!ok || stack.length !== 1) continue;
      const out = key(f.output);
      const v = typeof stack[0] === 'number' ? stack[0] : 0;
      if (f.stage === 'mult') mults.set(out, (mults.get(out) ?? 1) * v);
      else sums.set(out, (sums.get(out) ?? 0) + v);
    }
    const next = new Map<string, number>([...dials].map(([id, v]) => [`${id}?value`, v]));
    for (const [k, v] of sums) next.set(k, (next.get(k) ?? 0) + v);
    for (const [k, v] of mults) next.set(k, (next.get(k) ?? 0) * v);
    const settled = next.size === values.size && [...next].every(([k, v]) => Math.abs((values.get(k) ?? 0) - v) < 1e-9);
    values = next;
    if (settled) break;
  }
  return values;
}

function splineLinear(knots: [number, number][], x: number): number {
  if (!knots.length) return 0;
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  if (x <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i]![0]) {
      const [x0, y0] = k[i - 1]!;
      const [x1, y1] = k[i]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return k[k.length - 1]![1];
}
