import { MPM_WGSL } from './mpmShaders';

export type V3 = [number, number, number];

export interface FluidPreset {
  name: string;
  /** Pressure stiffness (EOS) and viscosity in grid units. */
  stiffness: number;
  viscosity: number;
  colour: number;
}

/** PLAN.md section 12.2. Values are tuned for the 1 cm grid of the prototype. */
export const FLUID_PRESETS: Record<'blood' | 'water' | 'saliva', FluidPreset> = {
  blood: { name: 'Blood', stiffness: 3, viscosity: 0.4, colour: 0x8a0303 },
  water: { name: 'Water', stiffness: 3, viscosity: 0.05, colour: 0x6fa8dc },
  saliva: { name: 'Saliva', stiffness: 3, viscosity: 2.5, colour: 0xd8dcdf },
};

export interface MpmOptions {
  /** Domain origin and size in metres; cell size in metres. */
  origin: V3;
  cells: [number, number, number];
  cellSize: number;
  maxParticles: number;
  preset?: FluidPreset;
  substeps?: number;
}

export interface FluidCapsule {
  a: V3;
  b: V3;
  radius: number;
}

const WG = 64;

/** MLS-MPM fluid (PLAN.md section 12.1) with capsule body colliders and an emitter. */
export class MpmFluid {
  readonly opts: Required<MpmOptions>;
  private readonly buffers: Record<'params' | 'pos' | 'vel' | 'affine' | 'grid' | 'gridVel' | 'colliders', GPUBuffer>;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private readonly bind: GPUBindGroup;
  private readonly readBuf: GPUBuffer;
  private next = 0;
  private colliders: FluidCapsule[] = [];
  private prevColliders: FluidCapsule[] = [];
  /** Particles per cell at rest; sets the rest density. */
  readonly particlesPerCell = 6;
  activeCount = 0;

  constructor(readonly device: GPUDevice, options: MpmOptions) {
    this.opts = { preset: FLUID_PRESETS.blood, substeps: 8, ...options };
    const n = this.opts.maxParticles;
    const nodes = this.opts.cells[0] * this.opts.cells[1] * this.opts.cells[2];
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.buffers = {
      params: device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      pos: device.createBuffer({ size: n * 16, usage: storage }),
      vel: device.createBuffer({ size: n * 16, usage: storage }),
      affine: device.createBuffer({ size: n * 48, usage: storage }),
      grid: device.createBuffer({ size: nodes * 16, usage: storage }),
      gridVel: device.createBuffer({ size: nodes * 16, usage: storage }),
      colliders: device.createBuffer({ size: 16 * 64, usage: storage }),
    };
    this.readBuf = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: MPM_WGSL });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ...[1, 2, 3, 4, 5].map((binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } })),
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelines = Object.fromEntries(
      ['clearGrid', 'p2gMass', 'p2gStress', 'updateGrid', 'g2p'].map((e) => [e, device.createComputePipeline({ layout: pl, compute: { module, entryPoint: e } })]),
    );
    const b = this.buffers;
    this.bind = device.createBindGroup({
      layout,
      entries: (['params', 'pos', 'vel', 'affine', 'grid', 'gridVel', 'colliders'] as const).map((k, binding) => ({ binding, resource: { buffer: b[k] } })),
    });
  }

  /** Metres → grid units. */
  toGrid(p: V3): V3 {
    const { origin, cellSize } = this.opts;
    return [(p[0] - origin[0]) / cellSize, (p[1] - origin[1]) / cellSize, (p[2] - origin[2]) / cellSize];
  }

  /**
   * Emits `count` particles in a small ball around `at` (metres) with
   * velocity `velocity` (m/s): a wound or other source (PLAN.md section 12.3).
   * Reuses the oldest slots when full.
   */
  emit(at: V3, velocity: V3, count: number, spread = 0.006): void {
    const { cellSize, maxParticles } = this.opts;
    const posData = new Float32Array(4);
    const velData = new Float32Array(4);
    const zero = new Float32Array(12);
    const vg: V3 = [velocity[0] / cellSize, velocity[1] / cellSize, velocity[2] / cellSize];
    for (let k = 0; k < count; k++) {
      const r = () => (Math.random() * 2 - 1) * spread;
      const g = this.toGrid([at[0] + r(), at[1] + r(), at[2] + r()]);
      posData.set([...g, 1]);
      velData.set([...vg, 0]);
      const i = this.next;
      this.device.queue.writeBuffer(this.buffers.pos, i * 16, posData);
      this.device.queue.writeBuffer(this.buffers.vel, i * 16, velData);
      this.device.queue.writeBuffer(this.buffers.affine, i * 48, zero);
      this.next = (this.next + 1) % maxParticles;
      this.activeCount = Math.min(maxParticles, this.activeCount + 1);
    }
  }

  setColliders(capsules: FluidCapsule[]): void {
    this.prevColliders = this.colliders.length === capsules.length ? this.colliders : capsules;
    this.colliders = capsules;
  }

  step(dt: number): void {
    const { substeps, cells, cellSize, preset, maxParticles } = this.opts;
    const h = dt / substeps;
    // Colliders in grid units, with endpoint velocities from last frame's positions.
    const col = new Float32Array(this.colliders.length * 16);
    this.colliders.forEach((c, k) => {
      const p = this.prevColliders[k] ?? c;
      const a = this.toGrid(c.a);
      const b = this.toGrid(c.b);
      const pa = this.toGrid(p.a);
      const pb = this.toGrid(p.b);
      col.set([...a, c.radius / cellSize, ...b, 0], k * 16);
      col.set([(a[0] - pa[0]) / dt, (a[1] - pa[1]) / dt, (a[2] - pa[2]) / dt, 0, (b[0] - pb[0]) / dt, (b[1] - pb[1]) / dt, (b[2] - pb[2]) / dt, 0], k * 16 + 8);
    });
    this.device.queue.writeBuffer(this.buffers.colliders, 0, col);
    const params = new ArrayBuffer(64);
    const u = new Uint32Array(params);
    const f = new Float32Array(params);
    u.set(cells, 0);
    u[3] = maxParticles;
    f.set([0, -9.81 / cellSize, 0], 4);
    f[7] = h;
    f[8] = this.particlesPerCell;
    f[9] = preset.stiffness;
    f[10] = preset.viscosity;
    u[11] = this.colliders.length;
    f[12] = 0.1;
    this.device.queue.writeBuffer(this.buffers.params, 0, params);

    const nodes = cells[0] * cells[1] * cells[2];
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, this.bind);
    const run = (name: string, count: number) => {
      pass.setPipeline(this.pipelines[name]!);
      pass.dispatchWorkgroups(Math.ceil(count / WG));
    };
    for (let s = 0; s < substeps; s++) {
      run('clearGrid', nodes);
      run('p2gMass', maxParticles);
      run('p2gStress', maxParticles);
      run('updateGrid', nodes);
      run('g2p', maxParticles);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.prevColliders = this.colliders;
  }

  /** Active particle positions in metres. */
  async readPositions(): Promise<Float32Array> {
    const n = this.opts.maxParticles;
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.buffers.pos, 0, this.readBuf, 0, n * 16);
    this.device.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(this.readBuf.getMappedRange().slice(0));
    this.readBuf.unmap();
    const { origin, cellSize } = this.opts;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (raw[i * 4 + 3] === 0) continue;
      out.push(raw[i * 4]! * cellSize + origin[0], raw[i * 4 + 1]! * cellSize + origin[1], raw[i * 4 + 2]! * cellSize + origin[2]);
    }
    return new Float32Array(out);
  }

  destroy(): void {
    for (const b of Object.values(this.buffers)) b.destroy();
    this.readBuf.destroy();
  }
}
