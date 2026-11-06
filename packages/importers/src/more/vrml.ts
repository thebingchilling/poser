import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, SRGBColorSpace, Vector3, type Object3D, type Texture } from 'three';

/**
 * VRML 97 (.wrl), X3D classic (.x3dv), and X3D XML (.x3d): a scene graph of
 * transforms and shapes. Read: Transform/Group-style grouping (LOD and
 * Switch show their first choice), IndexedFaceSet, IndexedTriangleSet,
 * TriangleSet, Box/Sphere/Cylinder/Cone, Material colours and
 * transparency, and ImageTexture. DEF/USE sharing is followed. Scripts,
 * prototypes, and animation routes are skipped. (Written for this app:
 * three.js's own VRML reader compiles code at runtime, which the app's
 * security policy blocks.)
 */

type Value = number[] | string[] | boolean | VNode | VNode[] | null;
export interface VNode {
  type: string;
  fields: Record<string, Value>;
  /** X3D XML child elements (VRML puts children in fields). */
  children: VNode[];
}

// ---------- VRML / X3D classic text ----------

function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([[\]{}])|([^\s,[\]{}"#]+)|#[^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) out.push(`"${m[1]}`);
    else if (m[2] ?? m[3]) out.push((m[2] ?? m[3])!);
  }
  return out;
}

export function parseVrml(text: string): VNode[] {
  const t = tokenize(text);
  let i = 0;
  const defs = new Map<string, VNode>();
  const isNum = (s: string | undefined) => s !== undefined && /^[-+]?(\d|\.\d)/.test(s);

  const skipBlock = () => {
    // Skips a balanced [...] or {...} starting at t[i].
    let depth = 0;
    do {
      if (t[i] === '{' || t[i] === '[') depth++;
      else if (t[i] === '}' || t[i] === ']') depth--;
      i++;
    } while (depth > 0 && i < t.length);
  };

  const node = (): VNode | null => {
    let tok = t[i++];
    if (tok === 'NULL') return null;
    if (tok === 'USE') return defs.get(t[i++]!) ?? null;
    let def: string | null = null;
    if (tok === 'DEF') {
      def = t[i++]!;
      tok = t[i++];
    }
    const n: VNode = { type: tok ?? '', fields: {}, children: [] };
    if (t[i] !== '{') return n;
    i++;
    if (n.type === 'Script' || n.type === 'PROTO' || n.type === 'EXTERNPROTO') {
      i--;
      skipBlock();
      return null;
    }
    while (i < t.length && t[i] !== '}') {
      const field = t[i++]!;
      if (field === 'ROUTE') {
        i += 3;
        continue;
      }
      if (/^(eventIn|eventOut|field|exposedField|inputOnly|outputOnly|initializeOnly|inputOutput)$/.test(field)) {
        // Interface declarations (in scripts and protos) carry a type and name, maybe a value.
        i += 2;
        continue;
      }
      n.fields[field] = value();
    }
    i++;
    if (def) defs.set(def, n);
    return n;
  };

  const value = (): Value => {
    const tok = t[i];
    if (tok === '[') {
      i++;
      const nums: number[] = [];
      const strs: string[] = [];
      const nodes: VNode[] = [];
      while (i < t.length && t[i] !== ']') {
        const x = t[i]!;
        if (isNum(x)) {
          nums.push(Number(x));
          i++;
        } else if (x.startsWith('"')) {
          strs.push(x.slice(1));
          i++;
        } else if (x === 'TRUE' || x === 'FALSE') i++;
        else {
          const n = node();
          if (n) nodes.push(n);
        }
      }
      i++;
      return nodes.length ? nodes : strs.length ? strs : nums;
    }
    if (isNum(tok)) {
      const nums: number[] = [];
      while (isNum(t[i])) nums.push(Number(t[i++]));
      return nums;
    }
    if (tok?.startsWith('"')) {
      i++;
      return [tok.slice(1)];
    }
    if (tok === 'TRUE' || tok === 'FALSE') {
      i++;
      return tok === 'TRUE';
    }
    if (tok === 'IS') {
      i += 2;
      return null;
    }
    return node();
  };

  const out: VNode[] = [];
  while (i < t.length) {
    const tok = t[i]!;
    if (tok === 'ROUTE') {
      i += 4;
      continue;
    }
    if (tok === 'PROTO' || tok === 'EXTERNPROTO') {
      i += 2;
      while (i < t.length && t[i] !== '[') i++;
      skipBlock();
      if (tok === 'PROTO' && t[i] === '{') skipBlock();
      else if (tok === 'EXTERNPROTO') while (t[i]?.startsWith('"')) i++;
      continue;
    }
    if (/^(PROFILE|COMPONENT|META|UNIT)$/.test(tok)) {
      i += tok === 'PROFILE' ? 2 : tok === 'META' ? 3 : 2;
      if (tok === 'UNIT') i += 1;
      continue;
    }
    const n = node();
    if (n) out.push(n);
  }
  return out;
}

// ---------- X3D XML ----------

/** A small XML reader for X3D (elements and attributes; comments, CDATA, and declarations skipped). */
export function parseX3dXml(text: string): VNode[] {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const root: VNode = { type: '#root', fields: {}, children: [] };
  const stack: VNode[] = [root];
  const defs = new Map<string, VNode>();
  const tagRe = /<\s*(\/?)\s*([A-Za-z_][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(clean))) {
    const [, closing, type, attrText, selfClose] = m;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of attrText!.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = a[3] ?? a[4] ?? '';
    let n: VNode;
    if (attrs.USE) n = defs.get(attrs.USE) ?? { type: type!, fields: {}, children: [] };
    else {
      n = { type: type!, fields: {}, children: [] };
      for (const [k, v] of Object.entries(attrs)) n.fields[k] = xmlValue(v);
      if (attrs.DEF) defs.set(attrs.DEF, n);
    }
    stack[stack.length - 1]!.children.push(n);
    if (!selfClose && !attrs.USE) stack.push(n);
  }
  const scene = findType(root, 'Scene');
  return scene ? scene.children : root.children;
}

function findType(n: VNode, type: string): VNode | undefined {
  if (n.type === type) return n;
  for (const c of n.children) {
    const f = findType(c, type);
    if (f) return f;
  }
  return undefined;
}

function xmlValue(v: string): Value {
  const s = v.trim();
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^[-+\d.eE,\s]+$/.test(s) && s.length) return s.split(/[\s,]+/).filter(Boolean).map(Number);
  // MFString: "a" "b"
  const quoted = [...s.matchAll(/"([^"]*)"|'([^']*)'/g)].map((q) => q[1] ?? q[2] ?? '');
  return quoted.length ? quoted : [s];
}

// ---------- Building ----------

const numsOf = (v: Value | undefined): number[] => (Array.isArray(v) && typeof v[0] === 'number' ? (v as number[]) : []);
const strsOf = (v: Value | undefined): string[] => (Array.isArray(v) && typeof v[0] === 'string' ? (v as string[]) : []);
const nodesOf = (n: VNode, field: string): VNode[] => {
  const v = n.fields[field];
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v as VNode[];
  if (v && typeof v === 'object' && !Array.isArray(v)) return [v as VNode];
  return [];
};
/** A node-valued field (VRML) or the matching child element (X3D XML). */
const sub = (n: VNode, field: string, types: RegExp): VNode | undefined => nodesOf(n, field)[0] ?? n.children.find((c) => types.test(c.type));

const GROUPS = /^(Transform|Group|StaticGroup|Anchor|Billboard|Collision|LOD|Switch|CADAssembly|CADPart|CADLayer|CADFace|HAnimHumanoid|HAnimJoint|HAnimSegment|HAnimSite)$/;

export function buildVrml(nodes: VNode[], texture: (url: string) => Texture | null): Group {
  const root = new Group();
  const materials = new Map<VNode, MeshStandardMaterial>();
  const geometries = new Map<VNode, BufferGeometry | null>();

  const material = (shape: VNode, hasColors: boolean): MeshStandardMaterial => {
    const app = sub(shape, 'appearance', /^Appearance$/);
    const key = app ?? shape;
    let mat = materials.get(key);
    if (mat) return mat;
    const m = app && sub(app, 'material', /Material$/);
    const tex = app && sub(app, 'texture', /Texture$/);
    const c = numsOf(m?.fields.diffuseColor);
    const transparency = numsOf(m?.fields.transparency)[0] ?? 0;
    const url = tex ? strsOf(tex.fields.url)[0] : undefined;
    const map = url ? texture(url) : null;
    if (map) map.colorSpace = SRGBColorSpace;
    mat = new MeshStandardMaterial({
      name: (m?.fields.DEF as string[] | undefined)?.[0] ?? 'Material',
      color: map || hasColors ? 0xffffff : c.length >= 3 ? (Math.round(c[0]! * 255) << 16) | (Math.round(c[1]! * 255) << 8) | Math.round(c[2]! * 255) : 0xcccccc,
      map,
      vertexColors: hasColors,
      roughness: 0.7,
      transparent: transparency > 0,
      opacity: 1 - transparency,
      side: FrontSide,
    });
    materials.set(key, mat);
    return mat;
  };

  const geometry = (g: VNode): BufferGeometry | null => {
    if (geometries.has(g)) return geometries.get(g)!;
    let out: BufferGeometry | null = null;
    const f = g.fields;
    switch (g.type) {
      case 'Box': {
        const s = numsOf(f.size);
        out = new BoxGeometry(s[0] ?? 2, s[1] ?? 2, s[2] ?? 2);
        break;
      }
      case 'Sphere':
        out = new SphereGeometry(numsOf(f.radius)[0] ?? 1, 32, 16);
        break;
      case 'Cylinder':
        out = new CylinderGeometry(numsOf(f.radius)[0] ?? 1, numsOf(f.radius)[0] ?? 1, numsOf(f.height)[0] ?? 2, 32);
        break;
      case 'Cone':
        out = new ConeGeometry(numsOf(f.bottomRadius)[0] ?? 1, numsOf(f.height)[0] ?? 2, 32);
        break;
      case 'IndexedFaceSet':
      case 'IndexedTriangleSet':
      case 'TriangleSet':
        out = faceSet(g);
        break;
    }
    geometries.set(g, out);
    return out;
  };

  const faceSet = (g: VNode): BufferGeometry | null => {
    const f = g.fields;
    const pts = numsOf(sub(g, 'coord', /^Coordinate/)?.fields.point);
    if (!pts.length) return null;
    const tc = numsOf(sub(g, 'texCoord', /^TextureCoordinate/)?.fields.point);
    const colorNode = sub(g, 'color', /^Color(RGBA)?$/);
    const colors = numsOf(colorNode?.fields.color);
    const colorStride = colorNode?.type === 'ColorRGBA' ? 4 : 3;
    const colorPerVertex = f.colorPerVertex !== false;
    let polys: number[][] = [];
    let texPolys: number[][] | null = null;
    if (g.type === 'IndexedFaceSet') {
      const split = (idx: number[]) => {
        const out: number[][] = [];
        let cur: number[] = [];
        for (const v of idx) {
          if (v < 0) {
            if (cur.length >= 3) out.push(cur);
            cur = [];
          } else cur.push(v);
        }
        if (cur.length >= 3) out.push(cur);
        return out;
      };
      polys = split(numsOf(f.coordIndex));
      const ti = numsOf(f.texCoordIndex);
      texPolys = ti.length ? split(ti) : null;
    } else {
      const idx = g.type === 'TriangleSet' ? Array.from({ length: pts.length / 3 }, (_, k) => k) : numsOf(f.index);
      for (let k = 0; k + 2 < idx.length; k += 3) polys.push([idx[k]!, idx[k + 1]!, idx[k + 2]!]);
    }
    const ccw = f.ccw !== false;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    polys.forEach((p, pi) => {
      const tp = texPolys?.[pi] ?? p;
      for (let k = 1; k + 1 < p.length; k++) {
        const tri = ccw ? [0, k, k + 1] : [0, k + 1, k];
        for (const c of tri) {
          const v = p[c]!;
          pos.push(pts[v * 3] ?? 0, pts[v * 3 + 1] ?? 0, pts[v * 3 + 2] ?? 0);
          if (tc.length) {
            const t = tp[c] ?? v;
            uv.push(tc[t * 2] ?? 0, tc[t * 2 + 1] ?? 0);
          }
          if (colors.length) {
            const ci = colorPerVertex ? v : pi;
            col.push(colors[ci * colorStride] ?? 1, colors[ci * colorStride + 1] ?? 1, colors[ci * colorStride + 2] ?? 1);
          }
        }
      }
    });
    if (!pos.length) return null;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    if (uv.length) geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    if (col.length) geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    geo.userData.solid = f.solid !== false;
    return geo;
  };

  const visit = (n: VNode, parent: Object3D) => {
    if (n.type === 'Shape') {
      const geoNode = sub(n, 'geometry', /^(IndexedFaceSet|IndexedTriangleSet|TriangleSet|Box|Sphere|Cylinder|Cone)$/);
      const geo = geoNode && geometry(geoNode);
      if (!geo) return;
      const mat = material(n, geo.hasAttribute('color'));
      if (geo.userData.solid === false) mat.side = DoubleSide;
      const mesh = new Mesh(geo, mat);
      mesh.name = 'Shape';
      parent.add(mesh);
      return;
    }
    if (!GROUPS.test(n.type) && n.type !== '#root') return;
    const g = new Group();
    g.name = (n.fields.DEF as string[] | undefined)?.[0] ?? n.type;
    const f = n.fields;
    const tr = numsOf(f.translation);
    if (tr.length >= 3) g.position.set(tr[0]!, tr[1]!, tr[2]!);
    const rot = numsOf(f.rotation);
    if (rot.length >= 4) g.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(rot[0], rot[1], rot[2]).normalize(), rot[3]!));
    const sc = numsOf(f.scale);
    if (sc.length >= 3) g.scale.set(sc[0]!, sc[1]!, sc[2]!);
    const kids = [...nodesOf(n, 'children'), ...nodesOf(n, 'level'), ...nodesOf(n, 'choice'), ...n.children];
    const pick = n.type === 'LOD' || n.type === 'Switch' ? kids.slice(0, 1) : kids;
    for (const c of pick) visit(c, g);
    parent.add(g);
  };
  for (const n of nodes) visit(n, root);
  let meshes = 0;
  root.traverse((o) => o instanceof Mesh && meshes++);
  if (!meshes) throw new Error('This file has no shapes that can be read.');
  return root;
}
