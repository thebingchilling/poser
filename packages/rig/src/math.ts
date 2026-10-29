/** Minimal vector/quaternion helpers on plain arrays (x, y, z, w). */
export type V3 = [number, number, number];
export type Q = [number, number, number, number];

export const QI: Q = [0, 0, 0, 1];

export function qmul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export const qinv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];

export function qnorm(q: Q): Q {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qrot(q: Q, v: V3): V3 {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q));
  return [p[0], p[1], p[2]];
}

export function axisAngle(axis: V3, angle: number): Q {
  const l = Math.hypot(...axis) || 1;
  const s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Shortest rotation taking direction a to direction b. */
export function fromTo(a: V3, b: V3): Q {
  const na = Math.hypot(...a) || 1;
  const nb = Math.hypot(...b) || 1;
  const u: V3 = [a[0] / na, a[1] / na, a[2] / na];
  const v: V3 = [b[0] / nb, b[1] / nb, b[2] / nb];
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.999999) {
    const ortho: V3 = Math.abs(u[0]) < 0.9 ? [0, u[2], -u[1]] : [-u[2], 0, u[0]];
    return axisAngle(ortho, Math.PI);
  }
  const c: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

/** Splits q into swing · twist, where twist rotates about `axis` (unit). */
export function swingTwist(q: Q, axis: V3): { swing: Q; twist: Q } {
  const d = q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2];
  let twist: Q = [axis[0] * d, axis[1] * d, axis[2] * d, q[3]];
  const l = Math.hypot(...twist);
  twist = l < 1e-9 ? [0, 0, 0, 1] : [twist[0] / l, twist[1] / l, twist[2] / l, twist[3] / l];
  return { swing: qmul(q, qinv(twist)), twist };
}

/** q raised to a power (scales the rotation angle). */
export function qpow(q: Q, t: number): Q {
  const w = Math.max(-1, Math.min(1, q[3]));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-9) return [0, 0, 0, 1];
  return axisAngle([q[0] / s, q[1] / s, q[2] / s], angle * t);
}

/** Angle between two rotations (radians). */
export function qangle(a: Q, b: Q): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a: V3): V3 => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
