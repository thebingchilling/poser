import { createProject } from '@poser/core';
import { describe, expect, it } from 'vitest';
import { AdaptiveQualityController } from './adaptive';
import { createLock, verifyLock } from './appLock';
import { detectBrowser } from './browser';
import { CrashGuard } from './crashGuard';
import { MemoryManager } from './memory';
import { exportPoserFile, importPoserFile, poserFileName } from './poserFile';
import { chooseQuality, stepQuality } from './quality';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const grease = { brand: 'Not)A;Brand', version: '99' };

describe('detectBrowser', () => {
  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  it('accepts Chrome', () => {
    const b = detectBrowser(desktopUA, { brands: [grease, { brand: 'Chromium', version: '140' }, { brand: 'Google Chrome', version: '140' }], mobile: false });
    expect(b.isChrome).toBe(true);
  });
  it('rejects Edge', () => {
    const b = detectBrowser(desktopUA, { brands: [grease, { brand: 'Chromium', version: '140' }, { brand: 'Microsoft Edge', version: '140' }] });
    expect(b.isChrome).toBe(false);
    expect(b.name).toBe('Microsoft Edge');
  });
  it('rejects Firefox and Safari', () => {
    expect(detectBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0').isChrome).toBe(false);
    expect(detectBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15').isChrome).toBe(false);
  });
  it('accepts Chrome on iPhone and iPad', () => {
    const ios = detectBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1');
    expect(ios).toMatchObject({ isChrome: true, isIOS: true, isMobile: true });
    const ipadSafari = detectBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', undefined, 5);
    expect(ipadSafari).toMatchObject({ isChrome: false, isIOS: true });
  });
});

describe('chooseQuality', () => {
  const base = { isMobile: false, webgpu: true, deviceMemoryGB: 8, maxBufferSizeMB: 4096, benchmarkMs: null };
  it('defaults computers to Full and phones to Medium', () => {
    expect(chooseQuality(base).level).toBe('full');
    expect(chooseQuality({ ...base, isMobile: true })).toEqual({ level: 'medium', capable: 'medium' });
  });
  it('uses the benchmark', () => {
    expect(chooseQuality({ ...base, benchmarkMs: 6 }).level).toBe('high');
    expect(chooseQuality({ ...base, benchmarkMs: 40 }).level).toBe('low');
    expect(chooseQuality({ ...base, isMobile: true, benchmarkMs: 3 })).toEqual({ level: 'medium', capable: 'full' });
  });
  it('drops to Low without WebGPU and caps low-memory devices', () => {
    expect(chooseQuality({ ...base, webgpu: false }).level).toBe('low');
    expect(chooseQuality({ ...base, deviceMemoryGB: 2 }).level).toBe('medium');
  });
  it('steps within bounds', () => {
    expect(stepQuality('full', 1)).toBe('full');
    expect(stepQuality('low', -1)).toBe('low');
    expect(stepQuality('high', -1)).toBe('medium');
  });
});

describe('AdaptiveQualityController', () => {
  it('steps down after sustained slow frames, then waits out the cooldown', () => {
    const c = new AdaptiveQualityController({ targetFrameMs: 16, windowMs: 1000, cooldownMs: 2000 });
    let t = 0;
    let result = 0;
    while (t < 1200 && result === 0) result = c.sample(40, (t += 40));
    expect(result).toBe(-1);
    expect(c.sample(40, (t += 40))).toBe(0);
  });
  it('steps up after sustained fast frames', () => {
    const c = new AdaptiveQualityController({ targetFrameMs: 16, upWindowMs: 2000, cooldownMs: 0 });
    let t = 0;
    let result = 0;
    while (t < 2500 && result === 0) result = c.sample(5, (t += 16));
    expect(result).toBe(1);
  });
  it('holds steady on frames near the target', () => {
    const c = new AdaptiveQualityController({ targetFrameMs: 16 });
    for (let t = 0; t < 20_000; t += 16) expect(c.sample(16, t)).toBe(0);
  });
});

describe('MemoryManager', () => {
  it('reports status and evicts caches, then hidden, never visible', () => {
    const m = new MemoryManager(1000);
    const statuses: string[] = [];
    m.onStatusChange((s) => statuses.push(s));
    m.track('visible', 500, 'visible', 1);
    m.track('hidden-old', 200, 'hidden', 1);
    m.track('hidden-new', 200, 'hidden', 5);
    m.track('cache', 200, 'cache', 9);
    expect(m.status()).toBe('over');
    expect(statuses).toEqual(['warning', 'over']);
    expect(m.evictionCandidates()).toEqual(['cache', 'hidden-old']);
    m.release('cache');
    m.release('hidden-old');
    expect(m.status()).toBe('ok');
  });
});

describe('CrashGuard', () => {
  it('detects a launch after a crash mid-load', () => {
    const storage = memoryStorage();
    const guard = new CrashGuard(storage);
    expect(guard.check().crashed).toBe(false);
    guard.begin('Loading scene');
    // ...tab killed here; next launch:
    const next = new CrashGuard(storage).check();
    expect(next).toEqual({ crashed: true, task: 'Loading scene', crashCount: 1 });
    expect(new CrashGuard(storage).check().crashed).toBe(false);
  });
  it('counts consecutive crashes and clears on success', async () => {
    const storage = memoryStorage();
    const guard = new CrashGuard(storage);
    guard.begin('a');
    guard.check();
    guard.begin('b');
    expect(guard.check().crashCount).toBe(2);
    await guard.guard('ok', async () => 1);
    expect(guard.check().crashed).toBe(false);
  });
});

describe('app lock', () => {
  it('verifies the right secret only', async () => {
    const record = await createLock('1234', 1000);
    expect(await verifyLock('1234', record)).toBe(true);
    expect(await verifyLock('1235', record)).toBe(false);
    await expect(createLock('12')).rejects.toThrow();
  });
});

describe('.poser files', () => {
  it('round-trips a project with assets', () => {
    const project = createProject('My scene');
    const file = exportPoserFile(project, { 'a1/mesh.bin': new Uint8Array([1, 2, 3]) });
    const back = importPoserFile(file);
    expect(back.project).toEqual(project);
    expect([...back.assets['a1/mesh.bin']!]).toEqual([1, 2, 3]);
  });
  it('rejects other files', () => {
    expect(() => importPoserFile(new Uint8Array([1, 2, 3]))).toThrow(/Not a .poser file/);
  });
  it('makes safe file names', () => {
    const p = { ...createProject('Bed / scene: 2'), updatedAt: Date.UTC(2026, 9, 28, 9, 5) };
    expect(poserFileName(p)).toBe('Bed-scene-2_2026-10-28-09-05.poser');
  });
});
