/**
 * WGSL for the XPBD particle solver (PLAN.md sections 7–8). "Small steps"
 * XPBD: many substeps with one constraint pass each, so per-constraint
 * lambdas don't need to be stored between iterations.
 */
export const COMMON = /* wgsl */ `
struct Params {
  gravity: vec3f, h: f32,
  damping: f32, n: u32, numColliders: u32, floorY: f32,
  useFloor: u32, floorFriction: f32, relaxation: f32, candidates: u32,
};
struct Color { start: u32, count: u32, _a: u32, _b: u32 };
struct Constraint { i: u32, j: u32, rest: f32, compliance: f32, kind: u32, _a: u32, _b: u32, _c: u32 };
struct Capsule { a: vec4f, b: vec4f, pa: vec4f, pb: vec4f };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4f>;    // xyz, inverse mass
@group(0) @binding(2) var<storage, read_write> prev: array<vec4f>;   // xyz, radius
@group(0) @binding(3) var<storage, read_write> vel: array<vec4f>;    // xyz, friction
@group(0) @binding(4) var<storage, read> targetPos: array<vec4f>;       // xyz, compliance (< 0: none)
@group(0) @binding(5) var<storage, read> flags: array<u32>;          // layer bits | mask bits << 16
@group(0) @binding(6) var<storage, read> cons: array<Constraint>;
@group(0) @binding(7) var<storage, read> colliders: array<Capsule>;
@group(0) @binding(8) var<storage, read_write> delta: array<vec4f>;
@group(1) @binding(0) var<uniform> C: Color;
// Which substep this dispatch belongs to; colliders hold one set per substep.
struct Substep { index: u32, _a: u32, _b: u32, _c: u32 };
@group(2) @binding(0) var<uniform> S: Substep;

// Position-based friction: cancel tangential motion relative to the other
// surface, fully when it is small (static), else by mu * penetration.
fn friction(rel: vec3f, n: vec3f, pen: f32, mu: f32) -> vec3f {
  let t = rel - dot(rel, n) * n;
  let tl = length(t);
  if (tl < 1e-9) { return vec3f(0.0); }
  if (tl < mu * pen) { return -t; }
  return -t * min(mu * pen / tl, 1.0);
}
`;

export const KERNELS = /* wgsl */ `
@compute @workgroup_size(64)
fn predict(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = pos[i];
  prev[i] = vec4f(p.xyz, prev[i].w);
  if (p.w > 0.0) {
    let v = vel[i].xyz + P.gravity * P.h;
    pos[i] = vec4f(p.xyz + v * P.h, p.w);
  }
}

// Kinematic pins (inverse mass 0) jump to their target; others with a
// target are pulled toward it with the given compliance (tethers, flesh
// attached to a moving bone).
@compute @workgroup_size(64)
fn targets(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let t = targetPos[i];
  if (t.w < 0.0) { return; }
  let p = pos[i];
  if (p.w == 0.0) { pos[i] = vec4f(t.xyz, 0.0); return; }
  let d = p.xyz - t.xyz;
  let len = length(d);
  if (len < 1e-9) { return; }
  let alpha = t.w / (P.h * P.h);
  let dl = -len / (p.w + alpha);
  pos[i] = vec4f(p.xyz + p.w * dl * (d / len), p.w);
}

// One graph colour of distance constraints; constraints in a colour share
// no particles, so they can be solved in parallel without races.
// kind 0: keep length. kind 1: only stop stretching beyond rest (rope, stretch limit).
@compute @workgroup_size(64)
fn distance(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= C.count) { return; }
  let c = cons[C.start + id.x];
  let pi = pos[c.i];
  let pj = pos[c.j];
  let w = pi.w + pj.w;
  if (w == 0.0) { return; }
  let d = pi.xyz - pj.xyz;
  let len = length(d);
  if (len < 1e-9) { return; }
  let err = len - c.rest;
  if (c.kind == 1u && err <= 0.0) { return; }
  let alpha = c.compliance / (P.h * P.h);
  let dl = -err / (w + alpha);
  let n = d / len;
  pos[c.i] = vec4f(pi.xyz + pi.w * dl * n, pi.w);
  pos[c.j] = vec4f(pj.xyz - pj.w * dl * n, pj.w);
}

// Particle-particle contact (Jacobi: corrections gathered, then applied).
// i collides with j when i's mask includes j's layer or vice versa.
@compute @workgroup_size(64)
fn particleContacts(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let pi = pos[i];
  let fi = flags[i];
  if (pi.w == 0.0 || (fi >> 16u) == 0u) { delta[i] = vec4f(0.0); return; }
  let ri = prev[i].w;
  var acc = vec3f(0.0);
  var count = 0.0;
  // Particles past the candidate set only look at the candidates.
  let end = select(P.n, P.candidates, i >= P.candidates);
  for (var j = 0u; j < end; j++) {
    if (j == i) { continue; }
    let fj = flags[j];
    if (((fi >> 16u) & (fj & 0xffffu)) == 0u) { continue; }
    let pj = pos[j];
    let d = pi.xyz - pj.xyz;
    let dist = length(d);
    let minD = ri + prev[j].w;
    if (dist >= minD || dist < 1e-9) { continue; }
    let n = d / dist;
    let pen = minD - dist;
    let share = pi.w / (pi.w + pj.w);
    let rel = (pi.xyz - prev[i].xyz) - (pj.xyz - prev[j].xyz);
    let mu = max(vel[i].w, vel[j].w);
    acc += (n * pen + friction(rel, n, pen, mu)) * share;
    count += 1.0;
  }
  delta[i] = vec4f(select(vec3f(0.0), acc * P.relaxation / count, count > 0.0), 0.0);
}

@compute @workgroup_size(64)
fn applyDelta(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let d = delta[i].xyz;
  if (dot(d, d) > 0.0) { pos[i] = vec4f(pos[i].xyz + d, pos[i].w); }
}

// Capsule colliders (moving body parts) and the floor, with friction
// relative to the collider's own motion.
@compute @workgroup_size(64)
fn colliderContacts(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  var p = pos[i];
  if (p.w == 0.0) { return; }
  let r = prev[i].w;
  let mu = vel[i].w;
  let start = prev[i].xyz;
  for (var k = 0u; k < P.numColliders; k++) {
    let c = colliders[S.index * P.numColliders + k];
    let ab = c.b.xyz - c.a.xyz;
    let t = clamp(dot(p.xyz - c.a.xyz, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
    let q = c.a.xyz + ab * t;
    let d = p.xyz - q;
    let dist = length(d);
    let minD = c.a.w + r;
    if (dist >= minD) { continue; }
    var n = vec3f(0.0, 1.0, 0.0);
    if (dist > 1e-9) { n = d / dist; }
    let pen = minD - dist;
    let qPrev = c.pa.xyz + (c.pb.xyz - c.pa.xyz) * t;
    let rel = (p.xyz - start) - (q - qPrev);
    let fr = friction(rel, n, pen, max(mu, c.b.w));
    p = vec4f(q + n * minD + fr, p.w);
  }
  if (P.useFloor == 1u && p.y < P.floorY + r) {
    let pen = P.floorY + r - p.y;
    let n = vec3f(0.0, 1.0, 0.0);
    let fr = friction(p.xyz - start, n, pen, max(mu, P.floorFriction));
    p = vec4f(p.x + fr.x, P.floorY + r, p.z + fr.z, p.w);
  }
  pos[i] = p;
}

@compute @workgroup_size(64)
fn updateVelocity(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = pos[i];
  if (p.w == 0.0) { vel[i] = vec4f(0.0, 0.0, 0.0, vel[i].w); return; }
  let v = (p.xyz - prev[i].xyz) / P.h * max(0.0, 1.0 - P.damping * P.h);
  vel[i] = vec4f(v, vel[i].w);
}
`;
