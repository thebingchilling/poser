/**
 * Texture-space surface flow (PLAN.md section 12.1): a thin liquid film on a
 * body part, stored as film thickness on a grid wrapped around a capsule
 * (u = around, v = along the axis). Gravity's component along the surface
 * drives the film (thin-film flow: speed grows with thickness²); it is
 * mass-conserving, and film that gathers on the underside drips off.
 */
export type V3 = [number, number, number];

const WGSL = /* wgsl */ `
struct Params {
  dims: vec2u, dt: f32, cellU: f32,        // cells around, cells along; cell size around (m)
  cellV: f32, mobility: f32, dripThickness: f32, maxSpeed: f32,
  gravity: vec3f, rivulet: f32,            // rivulet thickness (m): small amounts run as a trickle, not a smear
  axis: vec3f, _q: f32,
  e1: vec3f, _r: f32,                       // perpendicular to the axis; e2 = axis × e1
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> h: array<f32>;
@group(0) @binding(2) var<storage, read_write> flux: array<vec2f>;  // outflow to +u and +v faces (signed)
@group(0) @binding(3) var<storage, read_write> scale: array<f32>;
@group(0) @binding(4) var<storage, read_write> dripped: array<atomic<u32>>; // nano-units (fine enough that rounding many tiny drips loses nothing measurable)
@group(0) @binding(5) var<storage, read> source: array<f32>;  // inflow, m of thickness per second (a wound)

fn idx(u: i32, v: i32) -> i32 {
  let nu = i32(P.dims.x);
  return v * nu + ((u % nu) + nu) % nu;
}

fn tangents(u: u32) -> array<vec3f, 3> {
  let th = f32(u) / f32(P.dims.x) * 6.2831853;
  let e2 = cross(P.axis, P.e1);
  let n = cos(th) * P.e1 + sin(th) * e2;
  let tu = -sin(th) * P.e1 + cos(th) * e2;
  return array<vec3f, 3>(n, tu, P.axis);
}

// Face velocity (m/s) between this cell and its +u / +v neighbour.
fn faceVel(u: u32, v: u32) -> vec2f {
  let t = tangents(u);
  let g = P.gravity;
  return vec2f(dot(g, t[1]), dot(g, t[2])) * P.mobility;
}

@compute @workgroup_size(64)
fn computeFlux(@builtin(global_invocation_id) id: vec3u) {
  let n = P.dims.x * P.dims.y;
  if (id.x >= n) { return; }
  let u = id.x % P.dims.x;
  let v = id.x / P.dims.x;
  let vel = faceVel(u, v);
  // Upwind thickness at each face; speed ∝ h² (thin-film), capped.
  var f = vec2f(0.0);
  let here = h[id.x];
  let nextU = h[idx(i32(u) + 1, i32(v))];
  let hu = select(nextU, here, vel.x > 0.0);
  // Surface tension gathers a thin film into rivulets, so speed uses at least the rivulet thickness.
  let su = max(hu, P.rivulet * step(1e-7, hu));
  f.x = clamp(vel.x * su * su, -P.maxSpeed, P.maxSpeed) * hu * P.dt / P.cellU;
  if (v + 1u < P.dims.y) {
    let nextV = h[idx(i32(u), i32(v) + 1)];
    let hv = select(nextV, here, vel.y > 0.0);
    let sv = max(hv, P.rivulet * step(1e-7, hv));
    f.y = clamp(vel.y * sv * sv, -P.maxSpeed, P.maxSpeed) * hv * P.dt / P.cellV;
  }
  flux[id.x] = f;
}

// Limit outflow so no cell gives away more film than it has.
@compute @workgroup_size(64)
fn limitFlux(@builtin(global_invocation_id) id: vec3u) {
  let n = P.dims.x * P.dims.y;
  if (id.x >= n) { return; }
  let u = i32(id.x % P.dims.x);
  let v = i32(id.x / P.dims.x);
  var out = max(flux[id.x].x, 0.0) + max(flux[id.x].y, 0.0);
  out += max(-flux[idx(u - 1, v)].x, 0.0);
  if (v > 0) { out += max(-flux[idx(u, v - 1)].y, 0.0); }
  scale[id.x] = select(1.0, h[id.x] / out, out > h[id.x]);
}

@compute @workgroup_size(64)
fn applyFlux(@builtin(global_invocation_id) id: vec3u) {
  let n = P.dims.x * P.dims.y;
  if (id.x >= n) { return; }
  let u = i32(id.x % P.dims.x);
  let v = i32(id.x / P.dims.x);
  // Each face's flux is scaled by the limiter of the cell it leaves.
  let fu = flux[id.x].x;
  let fuOut = fu * select(scale[idx(u + 1, v)], scale[id.x], fu > 0.0);
  let fl = flux[idx(u - 1, v)].x;
  let flIn = fl * select(scale[id.x], scale[idx(u - 1, v)], fl > 0.0);
  var dh = -fuOut + flIn;
  if (v + 1 < i32(P.dims.y)) {
    let fv = flux[id.x].y;
    dh -= fv * select(scale[idx(u, v + 1)], scale[id.x], fv > 0.0);
  }
  if (v > 0) {
    let fb = flux[idx(u, v - 1)].y;
    dh += fb * select(scale[id.x], scale[idx(u, v - 1)], fb > 0.0);
  }
  var nh = max(h[id.x] + dh + source[id.x] * P.dt, 0.0);
  // Film thicker than the drip threshold falls off where the surface faces down.
  let t = tangents(u32(u));
  let facing = dot(t[0], normalize(P.gravity));
  if (facing > 0.7 && nh > P.dripThickness) {
    let excess = nh - P.dripThickness;
    nh = P.dripThickness;
    atomicAdd(&dripped[0], u32(round(excess * 1e9)));
  }
  h[id.x] = nh;
}
`;

export interface SurfaceFlowOptions {
  /** Capsule axis endpoints and radius (m). */
  a: V3;
  b: V3;
  radius: number;
  cellsAround?: number;
  cellsAlong?: number;
  /** Film mobility (1/(m·s)): higher = runnier liquid. */
  mobility?: number;
  dripThickness?: number;
  /** Rivulet thickness (m) used for speed when the film is thinner. */
  rivulet?: number;
}

export class SurfaceFlow {
  readonly nu: number;
  readonly nv: number;
  private readonly buffers: Record<'params' | 'h' | 'flux' | 'scale' | 'dripped' | 'source', GPUBuffer>;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private readonly bind: GPUBindGroup;
  private readonly readH: GPUBuffer;
  private readonly readDrip: GPUBuffer;
  readonly axis: V3;
  readonly e1: V3;
  readonly length: number;

  constructor(readonly device: GPUDevice, readonly o: SurfaceFlowOptions) {
    this.nu = o.cellsAround ?? 64;
    this.nv = o.cellsAlong ?? 96;
    const d: V3 = [o.b[0] - o.a[0], o.b[1] - o.a[1], o.b[2] - o.a[2]];
    this.length = Math.hypot(...d);
    this.axis = [d[0] / this.length, d[1] / this.length, d[2] / this.length];
    // e1: perpendicular to the axis, pointing up where possible (u = 0 on top).
    const up: V3 = Math.abs(this.axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dt = up[0] * this.axis[0] + up[1] * this.axis[1] + up[2] * this.axis[2];
    const e: V3 = [up[0] - dt * this.axis[0], up[1] - dt * this.axis[1], up[2] - dt * this.axis[2]];
    const el = Math.hypot(...e);
    this.e1 = [e[0] / el, e[1] / el, e[2] / el];
    const n = this.nu * this.nv;
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.buffers = {
      params: device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      h: device.createBuffer({ size: n * 4, usage: storage }),
      flux: device.createBuffer({ size: n * 8, usage: storage }),
      scale: device.createBuffer({ size: n * 4, usage: storage }),
      dripped: device.createBuffer({ size: 16, usage: storage }),
      source: device.createBuffer({ size: n * 4, usage: storage }),
    };
    this.readH = device.createBuffer({ size: n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.readDrip = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: WGSL });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ...[1, 2, 3, 4].map((binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } })),
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelines = Object.fromEntries(['computeFlux', 'limitFlux', 'applyFlux'].map((e) => [e, device.createComputePipeline({ layout: pl, compute: { module, entryPoint: e } })]));
    const b = this.buffers;
    this.bind = device.createBindGroup({ layout, entries: (['params', 'h', 'flux', 'scale', 'dripped', 'source'] as const).map((k, binding) => ({ binding, resource: { buffer: b[k] } })) });
  }

  /**
   * Sets a source of liquid (a wound or other emitter) at an angle around the
   * surface (0 = top) and fraction along the axis: `rate` is metres of film
   * thickness per second over the source cells. Rate 0 stops it.
   */
  setSource(angle: number, along: number, rate: number, radiusCells = 2): void {
    const src = new Float32Array(this.nu * this.nv);
    const cu = Math.round(((((angle / (Math.PI * 2)) % 1) + 1) % 1) * this.nu);
    const cv = Math.round(along * (this.nv - 1));
    let cells = 0;
    for (let dv = -radiusCells; dv <= radiusCells; dv++) {
      for (let du = -radiusCells; du <= radiusCells; du++) {
        if (du * du + dv * dv > radiusCells * radiusCells) continue;
        const v = cv + dv;
        if (v < 0 || v >= this.nv) continue;
        src[v * this.nu + ((((cu + du) % this.nu) + this.nu) % this.nu)] = rate;
        cells++;
      }
    }
    this.sourceCells = rate > 0 ? cells : 0;
    this.sourceRate = rate;
    this.device.queue.writeBuffer(this.buffers.source, 0, src);
  }
  /** Number of source cells and their rate, for mass bookkeeping. */
  sourceCells = 0;
  sourceRate = 0;

  step(dt: number, gravity: V3 = [0, -9.81, 0], substeps = 8): void {
    const h = dt / substeps;
    const params = new ArrayBuffer(96);
    const u = new Uint32Array(params);
    const f = new Float32Array(params);
    u[0] = this.nu;
    u[1] = this.nv;
    f[2] = h;
    f[3] = (2 * Math.PI * this.o.radius) / this.nu;
    f[4] = this.length / this.nv;
    f[5] = this.o.mobility ?? 5e4;
    f[6] = this.o.dripThickness ?? 0.0006;
    f[7] = 0.5;
    f.set(gravity, 8);
    f[11] = this.o.rivulet ?? 0.0005;
    f.set(this.axis, 12);
    f.set(this.e1, 16);
    this.device.queue.writeBuffer(this.buffers.params, 0, params);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, this.bind);
    const groups = Math.ceil((this.nu * this.nv) / 64);
    for (let s = 0; s < substeps; s++) {
      for (const name of ['computeFlux', 'limitFlux', 'applyFlux']) {
        pass.setPipeline(this.pipelines[name]!);
        pass.dispatchWorkgroups(groups);
      }
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Film thickness per cell (m), row-major by position along the axis. */
  async readThickness(): Promise<Float32Array> {
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.buffers.h, 0, this.readH, 0, this.nu * this.nv * 4);
    this.device.queue.submit([enc.finish()]);
    await this.readH.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(this.readH.getMappedRange().slice(0));
    this.readH.unmap();
    return out;
  }

  /** Total film thickness that has dripped off (m, summed over cells). */
  async readDripped(): Promise<number> {
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.buffers.dripped, 0, this.readDrip, 0, 16);
    this.device.queue.submit([enc.finish()]);
    await this.readDrip.mapAsync(GPUMapMode.READ);
    const v = new Uint32Array(this.readDrip.getMappedRange().slice(0))[0]!;
    this.readDrip.unmap();
    return v / 1e9;
  }

  /** World position of a cell centre, slightly above the surface (for rendering). */
  cellPosition(u: number, v: number, lift = 0): V3 {
    const th = ((u + 0.5) / this.nu) * Math.PI * 2;
    const ax = this.axis;
    const e1 = this.e1;
    const e2: V3 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]];
    const r = this.o.radius + lift;
    const along = ((v + 0.5) / this.nv) * this.length;
    return [0, 1, 2].map((k) => this.o.a[k]! + ax[k]! * along + (Math.cos(th) * e1[k]! + Math.sin(th) * e2[k]!) * r) as V3;
  }

  destroy(): void {
    for (const b of Object.values(this.buffers)) b.destroy();
    this.readH.destroy();
    this.readDrip.destroy();
  }
}
