import { Matrix4, Vector3, type Mesh, type Object3D } from 'three/webgpu';

/**
 * Body measurements (PLAN.md section 17.3): height, bust, underbust, waist,
 * hips, bra size, estimated weight, and limb lengths, from the figure's own
 * mesh in its rest pose. Circumferences are what a tape measure gives: the
 * convex hull around a horizontal slice. Weight comes from the enclosed
 * volume, counted with ray winding numbers so overlapping parts are not
 * counted twice.
 */

/** Triangles as flat xyz triples (figure space, metres, Y up). */
export type Triangles = Float32Array;

export interface BodyMeasurements {
  height: number;
  bust: number;
  underbust: number;
  waist: number;
  hips: number;
  /** EU bra size (e.g. "75C"), or null when the bust is flat. */
  braSize: string | null;
  volume: number;
  weight: number;
  shoulderWidth: number;
  armLength: number;
  legLength: number;
}

/** Human body density (kg/m³), between lean and average. */
const DENSITY = 1010;

/** Segments where triangles cross the plane y = h, as points in xz. */
export function sliceAt(tris: Triangles, h: number, filter?: (x: number, z: number) => boolean): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < tris.length; i += 9) {
    const ys = [tris[i + 1]!, tris[i + 4]!, tris[i + 7]!];
    if ((ys[0]! < h && ys[1]! < h && ys[2]! < h) || (ys[0]! > h && ys[1]! > h && ys[2]! > h)) continue;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3;
      const b = i + ((e + 1) % 3) * 3;
      const ya = tris[a + 1]!;
      const yb = tris[b + 1]!;
      if ((ya < h) === (yb < h) || ya === yb) continue;
      const t = (h - ya) / (yb - ya);
      const x = tris[a]! + (tris[b]! - tris[a]!) * t;
      const z = tris[a + 2]! + (tris[b + 2]! - tris[a + 2]!) * t;
      if (!filter || filter(x, z)) pts.push([x, z]);
    }
  }
  return pts;
}

/** Perimeter of the convex hull of 2D points (monotone chain). */
export function hullPerimeter(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let len = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/**
 * Enclosed volume (m³): vertical rays on a grid; along each ray the signed
 * crossings give the winding number, and the ray is inside wherever it is
 * non-zero (the union of overlapping closed parts). Rays that end with a
 * non-zero winding pass through holes in an open mesh and are left out, and
 * the total is scaled up for them.
 */
export function enclosedVolume(tris: Triangles, cell = 0.01): number {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    minX = Math.min(minX, tris[i]!);
    maxX = Math.max(maxX, tris[i]!);
    minZ = Math.min(minZ, tris[i + 2]!);
    maxZ = Math.max(maxZ, tris[i + 2]!);
  }
  if (!Number.isFinite(minX)) return 0;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  // Bucket triangles by the grid cells their footprint covers.
  const buckets: number[][] = Array.from({ length: nx * nz }, () => []);
  for (let i = 0; i < tris.length; i += 9) {
    const xs = [tris[i]!, tris[i + 3]!, tris[i + 6]!];
    const zs = [tris[i + 2]!, tris[i + 5]!, tris[i + 8]!];
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / cell));
    const x1 = Math.min(nx - 1, Math.floor((Math.max(...xs) - minX) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / cell));
    const z1 = Math.min(nz - 1, Math.floor((Math.max(...zs) - minZ) / cell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) buckets[z * nx + x]!.push(i);
  }
  let inside = 0;
  let rays = 0;
  let badRays = 0;
  const hits: { y: number; s: number }[] = [];
  for (let gz = 0; gz < nz; gz++)
    for (let gx = 0; gx < nx; gx++) {
      const bucket = buckets[gz * nx + gx]!;
      if (!bucket.length) continue;
      // Slightly off-centre so rays rarely hit edges or vertices exactly.
      const px = minX + (gx + 0.5) * cell + cell * 0.0137;
      const pz = minZ + (gz + 0.5) * cell + cell * 0.0071;
      hits.length = 0;
      for (const i of bucket) {
        const ax = tris[i]!, az = tris[i + 2]!, bx = tris[i + 3]!, bz = tris[i + 5]!, cx = tris[i + 6]!, cz = tris[i + 8]!;
        // Barycentric test in xz.
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-14) continue;
        const u = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
        const v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
        const w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const y = u * tris[i + 1]! + v * tris[i + 4]! + w * tris[i + 7]!;
        // Facing sign from the xz winding (normal's y component).
        hits.push({ y, s: d > 0 ? 1 : -1 });
      }
      if (!hits.length) continue;
      rays++;
      hits.sort((a, b) => a.y - b.y);
      let winding = 0;
      let len = 0;
      for (let k = 0; k < hits.length; k++) {
        const before = winding;
        winding += hits[k]!.s;
        if (before !== 0 && k > 0) len += hits[k]!.y - hits[k - 1]!.y;
      }
      if (winding !== 0) {
        badRays++;
        continue;
      }
      inside += len;
    }
  const good = rays - badRays;
  if (good <= 0) return 0;
  return inside * cell * cell * (rays / good);
}

/** EU bra size from underbust and bust (metres). */
export function braSize(underbust: number, bust: number): string | null {
  const diff = (bust - underbust) * 100;
  if (diff < 11) return null;
  const band = Math.round((underbust * 100) / 5) * 5;
  const cups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const cup = cups[Math.min(cups.length - 1, Math.max(0, Math.floor((diff - 12) / 2)))]!;
  return `${band}${cup}`;
}

/**
 * Measurements from rest-pose triangles and canonical joint positions (the
 * figure's own T-pose). Slices stay within the torso's width so arms and
 * hands never count.
 */
export function measureBody(tris: Triangles, joints: Record<string, [number, number, number]>): BodyMeasurements {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < tris.length; i += 3) {
    minY = Math.min(minY, tris[i]!);
    maxY = Math.max(maxY, tris[i]!);
  }
  const j = (n: string) => joints[n];
  const hipY = j('hips')?.[1] ?? minY + (maxY - minY) * 0.5;
  const chestY = j('chest')?.[1] ?? minY + (maxY - minY) * 0.72;
  const upperChestY = j('upperChest')?.[1] ?? chestY + 0.08;
  const legY = Math.min(j('leftUpperLeg')?.[1] ?? hipY, j('rightUpperLeg')?.[1] ?? hipY);
  const shoulderX = Math.abs(j('leftUpperArm')?.[0] ?? 0.18);
  // Torso: inside the shoulder joints (arms hang outside them in the T-pose).
  const torso = (x: number) => Math.abs(x) < shoulderX * 0.95;
  const girth = (h: number) => hullPerimeter(sliceAt(tris, h, torso));
  const scan = (from: number, to: number, pick: 'max' | 'min') => {
    let best = pick === 'max' ? -Infinity : Infinity;
    let at = from;
    const steps = Math.max(2, Math.round(Math.abs(to - from) / 0.005));
    for (let s = 0; s <= steps; s++) {
      const h = from + ((to - from) * s) / steps;
      const g = girth(h);
      if (g <= 0) continue;
      if (pick === 'max' ? g > best : g < best) {
        best = g;
        at = h;
      }
    }
    return { value: Number.isFinite(best) ? best : 0, at };
  };
  const bust = scan(chestY - 0.06, (chestY + upperChestY) / 2, 'max');
  // Underbust: just under the breasts, where the steep fall-off below the bust
  // levels out (some bodies have no crease, so the girth keeps narrowing to the
  // waist). Flat chests have no fall-off; measure 8 cm under the bust instead.
  const underbust = (() => {
    const step = 0.005;
    let prev = girth(bust.at);
    let steep = false;
    for (let h = bust.at - step; h > bust.at - 0.16; h -= step) {
      const g = girth(h);
      if (g <= 0) continue;
      const drop = prev - g;
      if (drop > 0.01) steep = true;
      else if (steep && drop < 0.004) return { value: g };
      prev = g;
    }
    return { value: girth(bust.at - 0.08) };
  })();
  const waist = scan(hipY + 0.06, chestY - 0.04, 'min');
  const hips = scan(legY - 0.14, hipY + 0.04, 'max');
  const volume = enclosedVolume(tris);
  const dist = (a: string, b: string) => {
    const pa = j(a);
    const pb = j(b);
    return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) : 0;
  };
  return {
    height: maxY - minY,
    bust: bust.value,
    underbust: underbust.value,
    waist: waist.value,
    hips: hips.value,
    braSize: braSize(underbust.value, bust.value),
    volume,
    weight: volume * DENSITY,
    shoulderWidth: dist('leftUpperArm', 'rightUpperArm'),
    armLength: dist('leftUpperArm', 'leftLowerArm') + dist('leftLowerArm', 'leftHand'),
    // Hip joint to the floor, through the knee and ankle.
    legLength: dist('leftUpperLeg', 'leftLowerLeg') + dist('leftLowerLeg', 'leftFoot') + (j('leftFoot')?.[1] ?? 0) - minY,
  };
}

/**
 * The visible, solid parts of a figure as triangles in its own space (the
 * root's frame), with skinning and morphs applied as currently posed.
 */
export function collectTriangles(root: Object3D): Triangles {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const out: number[] = [];
  const v = new Vector3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!(mesh as { isMesh?: boolean }).isMesh || !mesh.geometry?.attributes.position) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // Skip see-through helpers and anything hidden (anatomy layers are inside the skin anyway).
    if (mat && (mat as { transparent?: boolean; opacity?: number }).transparent && ((mat as { opacity?: number }).opacity ?? 1) < 0.5) return;
    const m = new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    const geo = mesh.geometry;
    const count = geo.index ? geo.index.count : geo.attributes.position!.count;
    for (let k = 0; k < count; k++) {
      const vi = geo.index ? geo.index.getX(k) : k;
      mesh.getVertexPosition(vi, v);
      v.applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}
