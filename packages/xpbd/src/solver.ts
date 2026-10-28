import { COMMON, KERNELS } from './shaders';

/**
 * GPU XPBD particle solver shared by cloth, ropes, and soft bodies
 * (PLAN.md section 20: "Custom XPBD on WebGPU compute"). Particles carry a
 * radius, friction, and collision layer/mask; constraints are distance
 * constraints (or one-sided stretch limits), graph-coloured on the CPU so
 * each colour runs in parallel. Moving body parts are capsule colliders.
 */

export type V3 = [number, number, number];

export interface Particle {
  position: V3;
  /** 0 = kinematic (follows its target exactly). */
  invMass: number;
  radius: number;
  friction?: number;
  /** Collision layer bits (what it is) and mask bits (what it collides with). */
  layer?: number;
  mask?: number;
}

export interface DistanceConstraint {
  i: number;
  j: number;
  rest: number;
  /** Inverse stiffness in m/N; 0 = rigid. */
  compliance?: number;
  /** 'max' only resists stretching beyond rest (ropes, stretch limits). */
  kind?: 'equal' | 'max';
}

export interface Capsule {
  a: V3;
  b: V3;
  radius: number;
  friction?: number;
}

export interface SolverOptions {
  gravity?: V3;
  substeps?: number;
  damping?: number;
  floor?: { y: number; friction: number } | null;
  /** Jacobi relaxation for particle contacts. */
  relaxation?: number;
  maxColliders?: number;
}

/** Greedy graph colouring: no two constraints in a colour share a particle. */
export function colourConstraints(constraints: DistanceConstraint[], numParticles: number): DistanceConstraint[][] {
  const colours: DistanceConstraint[][] = [];
  const used: Set<number>[] = [];
  const particleColours: number[][] = Array.from({ length: numParticles }, () => []);
  for (const c of constraints) {
    const taken = new Set([...particleColours[c.i]!, ...particleColours[c.j]!]);
    let k = 0;
    while (taken.has(k)) k++;
    if (!colours[k]) {
      colours[k] = [];
      used[k] = new Set();
    }
    colours[k]!.push(c);
    particleColours[c.i]!.push(k);
    particleColours[c.j]!.push(k);
  }
  return colours;
}

const PARAMS_SIZE = 48;
const WG = 64;

export class XpbdSolver {
  readonly n: number;
  readonly substeps: number;
  private readonly buffers: Record<'params' | 'pos' | 'prev' | 'vel' | 'target' | 'flags' | 'cons' | 'colliders' | 'delta', GPUBuffer>;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private readonly group0: GPUBindGroup;
  private readonly colourGroups: { group: GPUBindGroup; count: number }[];
  private readonly emptyColour: GPUBindGroup;
  private readonly substepGroups: GPUBindGroup[];
  private readonly readBuffer: GPUBuffer;
  private colliders: Capsule[] = [];
  private prevColliders: Capsule[] = [];
  private readonly maxColliders: number;
  private readonly opts: Required<Omit<SolverOptions, 'floor'>> & { floor: SolverOptions['floor'] };
  private readonly hasContacts: boolean;

  constructor(
    readonly device: GPUDevice,
    particles: Particle[],
    constraints: DistanceConstraint[],
    options: SolverOptions = {},
  ) {
    this.n = particles.length;
    this.opts = {
      gravity: options.gravity ?? [0, -9.81, 0],
      substeps: options.substeps ?? 10,
      damping: options.damping ?? 0.5,
      floor: options.floor === undefined ? { y: 0, friction: 0.6 } : options.floor,
      relaxation: options.relaxation ?? 1,
      maxColliders: options.maxColliders ?? 32,
    };
    this.substeps = this.opts.substeps;
    this.maxColliders = this.opts.maxColliders;
    this.hasContacts = particles.some((p) => (p.mask ?? 0) !== 0);

    const n = this.n;
    const pos = new Float32Array(n * 4);
    const prev = new Float32Array(n * 4);
    const vel = new Float32Array(n * 4);
    const target = new Float32Array(n * 4);
    const flags = new Uint32Array(n);
    particles.forEach((p, i) => {
      pos.set([...p.position, p.invMass], i * 4);
      prev.set([...p.position, p.radius], i * 4);
      vel.set([0, 0, 0, p.friction ?? 0.3], i * 4);
      target.set([...p.position, p.invMass === 0 ? 0 : -1], i * 4);
      flags[i] = ((p.layer ?? 1) & 0xffff) | (((p.mask ?? 0) & 0xffff) << 16);
    });

    const colours = colourConstraints(constraints, n);
    const ordered = colours.flat();
    const cons = new ArrayBuffer(Math.max(1, ordered.length) * 32);
    const cu = new Uint32Array(cons);
    const cf = new Float32Array(cons);
    ordered.forEach((c, k) => {
      cu[k * 8] = c.i;
      cu[k * 8 + 1] = c.j;
      cf[k * 8 + 2] = c.rest;
      cf[k * 8 + 3] = c.compliance ?? 0;
      cu[k * 8 + 4] = c.kind === 'max' ? 1 : 0;
    });

    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const make = (data: ArrayBuffer | ArrayBufferView, usage = storage) => {
      const size = Math.max(16, Math.ceil(data.byteLength / 16) * 16);
      const b = device.createBuffer({ size, usage, mappedAtCreation: true });
      new Uint8Array(b.getMappedRange()).set(new Uint8Array(ArrayBuffer.isView(data) ? data.buffer : data, ArrayBuffer.isView(data) ? data.byteOffset : 0, data.byteLength));
      b.unmap();
      return b;
    };
    this.buffers = {
      params: device.createBuffer({ size: PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      pos: make(pos),
      prev: make(prev),
      vel: make(vel),
      target: make(target),
      flags: make(flags),
      cons: make(cons),
      colliders: device.createBuffer({ size: Math.max(1, this.maxColliders) * this.substeps * 64, usage: storage }),
      delta: make(new Float32Array(n * 4)),
    };
    this.readBuffer = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const layout0 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ...[1, 2, 3].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } })),
        ...[4, 5, 6, 7].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } })),
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const layout1 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }] });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [layout0, layout1, layout1] });
    const module = device.createShaderModule({ code: COMMON + KERNELS });
    this.pipelines = Object.fromEntries(
      ['predict', 'targets', 'distance', 'particleContacts', 'applyDelta', 'colliderContacts', 'updateVelocity'].map((entryPoint) => [
        entryPoint,
        device.createComputePipeline({ layout, compute: { module, entryPoint } }),
      ]),
    );
    const b = this.buffers;
    this.group0 = device.createBindGroup({
      layout: layout0,
      entries: (['params', 'pos', 'prev', 'vel', 'target', 'flags', 'cons', 'colliders', 'delta'] as const).map((k, binding) => ({ binding, resource: { buffer: b[k] } })),
    });
    let start = 0;
    this.colourGroups = colours.map((c) => {
      const u = make(new Uint32Array([start, c.length, 0, 0]), GPUBufferUsage.UNIFORM);
      start += c.length;
      return { group: device.createBindGroup({ layout: layout1, entries: [{ binding: 0, resource: { buffer: u } }] }), count: c.length };
    });
    this.emptyColour = device.createBindGroup({ layout: layout1, entries: [{ binding: 0, resource: { buffer: make(new Uint32Array(4), GPUBufferUsage.UNIFORM) } }] });
    this.substepGroups = Array.from({ length: this.substeps }, (_, s) =>
      device.createBindGroup({ layout: layout1, entries: [{ binding: 0, resource: { buffer: make(new Uint32Array([s, 0, 0, 0]), GPUBufferUsage.UNIFORM) } }] }),
    );
  }

  /** Capsule colliders for this frame (their motion since the last call drives friction). */
  setColliders(capsules: Capsule[]): void {
    if (capsules.length > this.maxColliders) throw new Error(`At most ${this.maxColliders} colliders`);
    this.prevColliders = this.colliders.length === capsules.length ? this.colliders : capsules;
    this.colliders = capsules.map((c) => ({ ...c, a: [...c.a] as V3, b: [...c.b] as V3 }));
  }

  /** Move kinematic particles, or set tether targets (compliance > 0 pulls softly). */
  setTargets(indices: number[], positions: V3[], compliance = 0): void {
    const data = new Float32Array(4);
    indices.forEach((i, k) => {
      data.set([...positions[k]!, compliance], 0);
      this.device.queue.writeBuffer(this.buffers.target, i * 16, data);
    });
  }

  /** Teleport particles (e.g. to restart a scene). */
  setPositions(indices: number[], positions: V3[], invMass?: number[]): void {
    indices.forEach((i, k) => {
      const w = invMass?.[k];
      if (w === undefined) {
        this.device.queue.writeBuffer(this.buffers.pos, i * 16, new Float32Array(positions[k]!));
      } else {
        this.device.queue.writeBuffer(this.buffers.pos, i * 16, new Float32Array([...positions[k]!, w]));
      }
      this.device.queue.writeBuffer(this.buffers.prev, i * 16, new Float32Array(positions[k]!));
      this.device.queue.writeBuffer(this.buffers.vel, i * 16, new Float32Array([0, 0, 0]));
    });
  }

  /** Advance by dt seconds, split into substeps. Collider motion is interpolated across substeps. */
  step(dt: number): void {
    const h = dt / this.substeps;
    const { gravity, damping, floor, relaxation } = this.opts;
    const params = new ArrayBuffer(PARAMS_SIZE);
    const f = new Float32Array(params);
    const u = new Uint32Array(params);
    f.set(gravity, 0);
    f[3] = h;
    f[4] = damping;
    u[5] = this.n;
    u[6] = this.colliders.length;
    f[7] = floor?.y ?? 0;
    u[8] = floor ? 1 : 0;
    f[9] = floor?.friction ?? 0;
    f[10] = relaxation;
    this.device.queue.writeBuffer(this.buffers.params, 0, params);

    if (this.colliders.length) this.writeColliders();
    // All substeps in one pass and one submit; dispatches run in order.
    const groups = Math.ceil(this.n / WG);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, this.group0);
    const run = (name: string) => {
      pass.setPipeline(this.pipelines[name]!);
      pass.dispatchWorkgroups(groups);
    };
    for (let s = 0; s < this.substeps; s++) {
      pass.setBindGroup(1, this.emptyColour);
      pass.setBindGroup(2, this.substepGroups[s]!);
      run('predict');
      run('targets');
      pass.setPipeline(this.pipelines.distance!);
      for (const c of this.colourGroups) {
        pass.setBindGroup(1, c.group);
        pass.dispatchWorkgroups(Math.ceil(c.count / WG));
      }
      pass.setBindGroup(1, this.emptyColour);
      if (this.hasContacts) {
        run('particleContacts');
        run('applyDelta');
      }
      run('colliderContacts');
      run('updateVelocity');
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Collider positions for every substep, interpolated from last frame's to this frame's. */
  private writeColliders(): void {
    const n = this.colliders.length;
    const data = new Float32Array(this.substeps * n * 16);
    const lerp = (a: V3, b: V3, x: number) => [a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x, a[2] + (b[2] - a[2]) * x];
    for (let s = 0; s < this.substeps; s++) {
      const t = (s + 1) / this.substeps;
      const tPrev = s / this.substeps;
      this.colliders.forEach((c, k) => {
        const p = this.prevColliders[k] ?? c;
        const o = (s * n + k) * 16;
        data.set([...lerp(p.a, c.a, t), c.radius], o);
        data.set([...lerp(p.b, c.b, t), c.friction ?? 0.5], o + 4);
        data.set([...lerp(p.a, c.a, tPrev), 0], o + 8);
        data.set([...lerp(p.b, c.b, tPrev), 0], o + 12);
      });
    }
    this.device.queue.writeBuffer(this.buffers.colliders, 0, data);
  }

  /** Particle positions as xyz + inverse mass. Waits for the GPU. */
  async readPositions(): Promise<Float32Array> {
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.buffers.pos, 0, this.readBuffer, 0, this.n * 16);
    this.device.queue.submit([enc.finish()]);
    await this.readBuffer.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(this.readBuffer.getMappedRange().slice(0));
    this.readBuffer.unmap();
    return out;
  }

  /** The GPU buffer of positions (vec4 per particle), for rendering without readback. */
  get positionBuffer(): GPUBuffer {
    return this.buffers.pos;
  }

  destroy(): void {
    for (const b of Object.values(this.buffers)) b.destroy();
    this.readBuffer.destroy();
  }
}
