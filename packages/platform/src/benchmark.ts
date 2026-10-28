/**
 * A few-second GPU benchmark (PLAN.md section 3.5, step 2). It runs a
 * workload shaped like the app's simulations: a particle grid with
 * neighbour springs (cloth / soft body) integrated in a compute shader,
 * many substeps per frame. Returns milliseconds per iteration (one
 * "frame" of 16 substeps over 64k particles).
 */

const PARTICLES_SIDE = 256;
const SUBSTEPS = 16;
const ITERATIONS = 12;
const WARMUP = 3;

const SHADER = /* wgsl */ `
struct P { pos: vec4f, prev: vec4f };
@group(0) @binding(0) var<storage, read> src: array<P>;
@group(0) @binding(1) var<storage, read_write> dst: array<P>;
const N: u32 = ${PARTICLES_SIDE}u;
const REST: f32 = 0.01;

fn spring(p: vec3f, q: vec3f) -> vec3f {
  let d = q - p;
  let len = max(length(d), 1e-6);
  return d * (0.5 * (len - REST) / len);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= N || id.y >= N) { return; }
  let i = id.y * N + id.x;
  var p = src[i].pos.xyz;
  let v = p - src[i].prev.xyz;
  var corr = vec3f(0.0);
  if (id.x > 0u) { corr += spring(p, src[i - 1u].pos.xyz); }
  if (id.x < N - 1u) { corr += spring(p, src[i + 1u].pos.xyz); }
  if (id.y > 0u) { corr += spring(p, src[i - N].pos.xyz); }
  if (id.y < N - 1u) { corr += spring(p, src[i + N].pos.xyz); }
  var next = p + v * 0.99 + vec3f(0.0, -9.8e-5, 0.0) + corr * 0.25;
  if (id.y == 0u) { next = p; }
  next.y = max(next.y, -1.0);
  dst[i] = P(vec4f(next, 1.0), vec4f(p, 1.0));
}`;

export async function runGpuBenchmark(signal?: AbortSignal): Promise<number> {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('WebGPU is not available');
  const device = await adapter.requestDevice();
  try {
    const count = PARTICLES_SIDE * PARTICLES_SIDE;
    const init = new Float32Array(count * 8);
    for (let y = 0; y < PARTICLES_SIDE; y++) {
      for (let x = 0; x < PARTICLES_SIDE; x++) {
        const o = (y * PARTICLES_SIDE + x) * 8;
        init.set([x * 0.01, 0, y * 0.01, 1, x * 0.01, 0, y * 0.01, 1], o);
      }
    }
    const buffers = [0, 1].map(() => {
      const b = device.createBuffer({ size: init.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(b, 0, init);
      return b;
    }) as [GPUBuffer, GPUBuffer];
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: SHADER }), entryPoint: 'main' },
    });
    const groups = [0, 1].map((i) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: buffers[i]! } },
          { binding: 1, resource: { buffer: buffers[1 - i]! } },
        ],
      }),
    );
    const wg = Math.ceil(PARTICLES_SIDE / 8);
    const frame = async () => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      for (let s = 0; s < SUBSTEPS; s++) {
        pass.setBindGroup(0, groups[s % 2]!);
        pass.dispatchWorkgroups(wg, wg);
      }
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    };
    for (let i = 0; i < WARMUP; i++) await frame();
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      if (signal?.aborted) throw new DOMException('Benchmark cancelled', 'AbortError');
      const t0 = performance.now();
      await frame();
      times.push(performance.now() - t0);
    }
    // Median resists one-off stalls.
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)]!;
  } finally {
    device.destroy();
  }
}
