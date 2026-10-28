/**
 * MLS-MPM fluid on WebGPU compute (PLAN.md section 12.1). Simulation runs in
 * grid units (1 cell = 1 unit); the host converts to metres. Grid momentum
 * and mass are accumulated with fixed-point i32 atomics, since WGSL has no
 * float atomics.
 */
export const MPM_WGSL = /* wgsl */ `
struct Params {
  gridSize: vec3u, numParticles: u32,
  gravity: vec3f, dt: f32,
  restDensity: f32, stiffness: f32, viscosity: f32, numColliders: u32,
  floorFriction: f32, _a: f32, _b: f32, _c: f32,
};
struct Capsule { a: vec4f, b: vec4f, va: vec4f, vb: vec4f }; // endpoints (xyz, radius) and endpoint velocities, grid units

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4f>;   // xyz, mass (0 = inactive)
@group(0) @binding(2) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> affine: array<vec4f>; // C matrix, three rows per particle
@group(0) @binding(4) var<storage, read_write> grid: array<atomic<i32>>; // momentum xyz, mass per node
@group(0) @binding(5) var<storage, read_write> gridVel: array<vec4f>;
@group(0) @binding(6) var<storage, read> colliders: array<Capsule>;

// Fixed-point scale: fine enough for small weights, coarse enough that a
// crowded node with fast fluid (hundreds of cells/s) stays inside i32.
const FIXED: f32 = 2e4;

fn nodeIndex(c: vec3i) -> i32 {
  let g = vec3i(P.gridSize);
  if (any(c < vec3i(0)) || any(c >= g)) { return -1; }
  return (c.z * g.y + c.y) * g.x + c.x;
}

fn weights(fx: vec3f) -> array<vec3f, 3> {
  return array<vec3f, 3>(0.5 * (1.5 - fx) * (1.5 - fx), 0.75 - (fx - 1.0) * (fx - 1.0), 0.5 * (fx - 0.5) * (fx - 0.5));
}

fn loadC(i: u32) -> mat3x3f {
  // Stored as rows; WGSL matrices are column-major, so transpose.
  return transpose(mat3x3f(affine[i * 3u].xyz, affine[i * 3u + 1u].xyz, affine[i * 3u + 2u].xyz));
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) id: vec3u) {
  let n = P.gridSize.x * P.gridSize.y * P.gridSize.z;
  if (id.x >= n) { return; }
  for (var k = 0u; k < 4u; k++) { atomicStore(&grid[id.x * 4u + k], 0); }
}

// Particle to grid, pass 1: mass and APIC momentum.
@compute @workgroup_size(64)
fn p2gMass(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.numParticles) { return; }
  let pm = pos[i];
  if (pm.w == 0.0) { return; }
  let x = pm.xyz;
  let base = vec3i(floor(x - 0.5));
  let fx = x - vec3f(base);
  let w = weights(fx);
  let C = loadC(i);
  let v = vel[i].xyz;
  for (var a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) { for (var c = 0; c < 3; c++) {
    let off = vec3i(a, b, c);
    let wt = w[a].x * w[b].y * w[c].z;
    let dpos = vec3f(off) - fx;
    let node = nodeIndex(base + off);
    if (node < 0) { continue; }
    let m = wt * pm.w;
    let mom = m * (v + C * dpos);
    atomicAdd(&grid[u32(node) * 4u + 0u], i32(mom.x * FIXED));
    atomicAdd(&grid[u32(node) * 4u + 1u], i32(mom.y * FIXED));
    atomicAdd(&grid[u32(node) * 4u + 2u], i32(mom.z * FIXED));
    atomicAdd(&grid[u32(node) * 4u + 3u], i32(m * FIXED));
  }}}
}

// Particle to grid, pass 2: pressure (weakly compressible) and viscous stress.
@compute @workgroup_size(64)
fn p2gStress(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.numParticles) { return; }
  let pm = pos[i];
  if (pm.w == 0.0) { return; }
  let x = pm.xyz;
  let base = vec3i(floor(x - 0.5));
  let fx = x - vec3f(base);
  let w = weights(fx);
  var density = 0.0;
  for (var a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) { for (var c = 0; c < 3; c++) {
    let node = nodeIndex(base + vec3i(a, b, c));
    if (node < 0) { continue; }
    density += w[a].x * w[b].y * w[c].z * f32(atomicLoad(&grid[u32(node) * 4u + 3u])) / FIXED;
  }}}
  let volume = pm.w / max(density, 1e-6);
  let pressure = max(-0.1, P.stiffness * (pow(density / P.restDensity, 5.0) - 1.0));
  let C = loadC(i);
  let strain = C + transpose(C);
  let stress = mat3x3f(-pressure, 0.0, 0.0, 0.0, -pressure, 0.0, 0.0, 0.0, -pressure) + P.viscosity * strain;
  let term = -volume * 4.0 * P.dt * stress;
  for (var a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) { for (var c = 0; c < 3; c++) {
    let off = vec3i(a, b, c);
    let node = nodeIndex(base + off);
    if (node < 0) { continue; }
    let wt = w[a].x * w[b].y * w[c].z;
    let mom = wt * (term * (vec3f(off) - fx));
    atomicAdd(&grid[u32(node) * 4u + 0u], i32(mom.x * FIXED));
    atomicAdd(&grid[u32(node) * 4u + 1u], i32(mom.y * FIXED));
    atomicAdd(&grid[u32(node) * 4u + 2u], i32(mom.z * FIXED));
  }}}
}

fn closestOnSegment(p: vec3f, a: vec3f, b: vec3f) -> f32 {
  let ab = b - a;
  return clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
}

// Grid update: momentum to velocity, gravity, walls, floor, and body colliders
// (the fluid can't move into a body part, but slides along it).
@compute @workgroup_size(64)
fn updateGrid(@builtin(global_invocation_id) id: vec3u) {
  let g = P.gridSize;
  let n = g.x * g.y * g.z;
  if (id.x >= n) { return; }
  let m = f32(atomicLoad(&grid[id.x * 4u + 3u])) / FIXED;
  if (m <= 0.0) { gridVel[id.x] = vec4f(0.0); return; }
  var v = vec3f(f32(atomicLoad(&grid[id.x * 4u])), f32(atomicLoad(&grid[id.x * 4u + 1u])), f32(atomicLoad(&grid[id.x * 4u + 2u]))) / FIXED / m;
  v += P.gravity * P.dt;
  let cx = id.x % g.x;
  let cy = (id.x / g.x) % g.y;
  let cz = id.x / (g.x * g.y);
  let p = vec3f(f32(cx), f32(cy), f32(cz));
  for (var k = 0u; k < P.numColliders; k++) {
    let c = colliders[k];
    let t = closestOnSegment(p, c.a.xyz, c.b.xyz);
    let q = mix(c.a.xyz, c.b.xyz, t);
    let d = p - q;
    let dist = length(d);
    if (dist < c.a.w + 1.0) {
      let nrm = select(vec3f(0.0, 1.0, 0.0), d / dist, dist > 1e-6);
      let vc = mix(c.va.xyz, c.vb.xyz, t);
      var rel = v - vc;
      let vn = dot(rel, nrm);
      if (vn < 0.0) { rel -= vn * nrm; }
      v = rel + vc;
    }
  }
  // Floor (y = 2 cells) with friction, and the domain walls.
  if (cy < 3u && v.y < 0.0) {
    v.y = 0.0;
    v = vec3f(v.x * (1.0 - P.floorFriction), v.y, v.z * (1.0 - P.floorFriction));
  }
  if (cy > g.y - 3u && v.y > 0.0) { v.y = 0.0; }
  if ((cx < 2u && v.x < 0.0) || (cx > g.x - 3u && v.x > 0.0)) { v.x = 0.0; }
  if ((cz < 2u && v.z < 0.0) || (cz > g.z - 3u && v.z > 0.0)) { v.z = 0.0; }
  gridVel[id.x] = vec4f(v, 0.0);
}

// Grid to particle: gather velocity and affine matrix, move, and push out of colliders.
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.numParticles) { return; }
  let pm = pos[i];
  if (pm.w == 0.0) { return; }
  let x = pm.xyz;
  let base = vec3i(floor(x - 0.5));
  let fx = x - vec3f(base);
  let w = weights(fx);
  var v = vec3f(0.0);
  var B = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
  for (var a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) { for (var c = 0; c < 3; c++) {
    let off = vec3i(a, b, c);
    let node = nodeIndex(base + off);
    if (node < 0) { continue; }
    let wt = w[a].x * w[b].y * w[c].z;
    let gv = gridVel[u32(node)].xyz;
    let dpos = vec3f(off) - fx;
    v += wt * gv;
    // B += w * v ⊗ dpos (outer product; column j = v * dpos[j]).
    B += wt * mat3x3f(gv * dpos.x, gv * dpos.y, gv * dpos.z);
  }}}
  let C = B * 4.0;
  var nx = x + v * P.dt;
  for (var k = 0u; k < P.numColliders; k++) {
    let c = colliders[k];
    let t = closestOnSegment(nx, c.a.xyz, c.b.xyz);
    let q = mix(c.a.xyz, c.b.xyz, t);
    let d = nx - q;
    let dist = length(d);
    if (dist < c.a.w && dist > 1e-6) { nx = q + d / dist * c.a.w; }
  }
  let lo = vec3f(1.0, 2.0, 1.0);
  let hi = vec3f(P.gridSize) - 2.0;
  nx = clamp(nx, lo, hi);
  pos[i] = vec4f(nx, pm.w);
  vel[i] = vec4f(v, 0.0);
  let Ct = transpose(C);
  affine[i * 3u] = vec4f(Ct[0], 0.0);
  affine[i * 3u + 1u] = vec4f(Ct[1], 0.0);
  affine[i * 3u + 2u] = vec4f(Ct[2], 0.0);
}
`;
