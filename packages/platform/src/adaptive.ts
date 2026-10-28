/**
 * Adaptive quality (PLAN.md section 3.5, step 4): step down when frames stay
 * slow, step back up when there is sustained headroom. Hysteresis and a
 * cooldown stop it flapping between levels.
 */

export interface AdaptiveOptions {
  targetFrameMs: number;
  /** Average above target * this for `windowMs` → step down. */
  slowFactor: number;
  /** Average below target * this for `upWindowMs` → step up. */
  fastFactor: number;
  windowMs: number;
  upWindowMs: number;
  cooldownMs: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveOptions = {
  targetFrameMs: 1000 / 50,
  slowFactor: 1.3,
  fastFactor: 0.6,
  windowMs: 2000,
  upWindowMs: 8000,
  cooldownMs: 4000,
};

export class AdaptiveQualityController {
  private samples: { t: number; ms: number }[] = [];
  private lastChange = -Infinity;
  private readonly opts: AdaptiveOptions;

  constructor(options: Partial<AdaptiveOptions> = {}) {
    this.opts = { ...DEFAULT_ADAPTIVE, ...options };
  }

  /**
   * Feed one frame time. Returns -1 to step down, +1 to step up, 0 to stay.
   * `now` is a monotonic clock in ms.
   */
  sample(frameMs: number, now: number): -1 | 0 | 1 {
    // Ignore hitches from tab switches and the like.
    if (frameMs > 500) return 0;
    this.samples.push({ t: now, ms: frameMs });
    const horizon = now - Math.max(this.opts.windowMs, this.opts.upWindowMs);
    while (this.samples.length && this.samples[0]!.t < horizon) this.samples.shift();
    if (now - this.lastChange < this.opts.cooldownMs) return 0;

    const recent = this.average(now - this.opts.windowMs);
    if (recent !== null && this.covers(now, this.opts.windowMs) && recent > this.opts.targetFrameMs * this.opts.slowFactor) {
      return this.change(now, -1);
    }
    const longer = this.average(now - this.opts.upWindowMs);
    if (longer !== null && this.covers(now, this.opts.upWindowMs) && longer < this.opts.targetFrameMs * this.opts.fastFactor) {
      return this.change(now, 1);
    }
    return 0;
  }

  reset(): void {
    this.samples = [];
  }

  private change(now: number, dir: -1 | 1): -1 | 1 {
    this.lastChange = now;
    this.samples = [];
    return dir;
  }

  /** True if samples span (almost) the whole window. */
  private covers(now: number, windowMs: number): boolean {
    const first = this.samples[0];
    return !!first && now - first.t >= windowMs * 0.9;
  }

  private average(since: number): number | null {
    let sum = 0;
    let n = 0;
    for (const s of this.samples) {
      if (s.t >= since) {
        sum += s.ms;
        n++;
      }
    }
    return n ? sum / n : null;
  }
}
