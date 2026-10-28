import { LatheGeometry, Matrix4, Quaternion, SphereGeometry, Vector2, Vector3, type BufferGeometry } from 'three/webgpu';

/**
 * A capsule whose radius tapers from r0 at the start to r1 at the end, built
 * along +Y from 0 to `length`, with an elliptical cross-section
 * (`depthRatio` = depth / width, applied on `flatAxis`). Optional `bulge` swells the middle
 * (e.g. a calf or thigh muscle belly). `startCap` squashes the start
 * hemisphere (e.g. so the pelvis doesn't hang below the hip joints).
 */
export function taperedCapsule(
  r0: number,
  r1: number,
  length: number,
  { depthRatio = 1, bulge = 0, bulgeAt = 0.4, radial = 20, flatAxis = 'z' as 'x' | 'z', startCap = 1 } = {},
): BufferGeometry {
  const pts: Vector2[] = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new Vector2(Math.cos(a) * r0, Math.sin(a) * r0 * startCap));
  }
  const body = 10;
  for (let i = 1; i < body; i++) {
    const t = i / body;
    const swell = bulge * Math.exp(-((t - bulgeAt) ** 2) / 0.06);
    pts.push(new Vector2(r0 + (r1 - r0) * t + swell, t * length));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new Vector2(Math.max(Math.cos(a) * r1, 1e-4), length + Math.sin(a) * r1));
  }
  const geo = new LatheGeometry(pts, radial);
  // 'x' ends up vertical for bones that point sideways (hands in the T-pose).
  if (flatAxis === 'x') geo.scale(depthRatio, 1, 1);
  else geo.scale(1, 1, depthRatio);
  geo.computeVertexNormals();
  return geo;
}

export function ellipsoid(rx: number, ry: number, rz: number, segments = 24): BufferGeometry {
  const geo = new SphereGeometry(1, segments, Math.round(segments * 0.75));
  geo.scale(rx, ry, rz);
  return geo;
}

const UP = new Vector3(0, 1, 0);

/** Rotate a +Y-built geometry so it runs along `dir` (in place). */
export function alignToDirection(geo: BufferGeometry, dir: Vector3): BufferGeometry {
  const n = dir.clone().normalize();
  if (n.lengthSq() === 0) return geo;
  const q = new Quaternion().setFromUnitVectors(UP, n);
  geo.applyMatrix4(new Matrix4().makeRotationFromQuaternion(q));
  return geo;
}
