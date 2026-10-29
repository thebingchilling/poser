import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, lightingPreset, sunAngles, sunDirection, sunLights, type LightingPresetId } from './lighting';

const deg = (r: number) => (r * 180) / Math.PI;

describe('lighting', () => {
  it('places the sun where it should be', () => {
    // Midsummer noon at 52°N: elevation 90 − 52 + 23.44 ≈ 61.4°, due south.
    const noon = sunAngles({ hour: 12, day: 172, latitude: 52, north: 0 });
    expect(deg(noon.elevation)).toBeCloseTo(61.4, 0);
    expect(deg(noon.azimuth)).toBeCloseTo(180, 0);
    // Morning sun is in the east, evening sun in the west.
    expect(deg(sunAngles({ hour: 8, day: 172, latitude: 52, north: 0 }).azimuth)).toBeLessThan(180);
    expect(deg(sunAngles({ hour: 17, day: 172, latitude: 52, north: 0 }).azimuth)).toBeGreaterThan(180);
    // Midwinter midnight is below the horizon.
    expect(sunAngles({ hour: 0, day: 355, latitude: 52, north: 0 }).elevation).toBeLessThan(0);
    // With north = 0, noon sun (south) is toward +Z; turning north 90° moves it to −X.
    const d = sunDirection({ hour: 12, day: 172, latitude: 52, north: 0 });
    expect(d[2]).toBeGreaterThan(0.4);
    expect(sunDirection({ hour: 12, day: 172, latitude: 52, north: 90 })[0]).toBeLessThan(-0.4);
  });

  it('makes warm low light at dusk and moonlight at night', () => {
    const dusk = sunLights({ hour: 20.5, day: 172, latitude: 52, north: 0 });
    const noon = sunLights({ hour: 12, day: 172, latitude: 52, north: 0 });
    const night = sunLights({ hour: 1, day: 172, latitude: 52, north: 0 });
    expect(dusk.lights[0]!.intensity).toBeLessThan(noon.lights[0]!.intensity);
    expect(parseInt(dusk.lights[0]!.color.slice(5, 7), 16)).toBeLessThan(parseInt(noon.lights[0]!.color.slice(5, 7), 16));
    expect(night.lights[0]!.name).toBe('Moon');
    expect(night.background).not.toBe(noon.background);
  });

  it('builds every preset with one shadow-casting key', () => {
    for (const id of Object.keys(LIGHTING_PRESETS) as LightingPresetId[]) {
      const lights = lightingPreset(id, { centre: [1, 1, 0], yaw: Math.PI / 2 });
      expect(lights.filter((l) => l.castShadow)).toHaveLength(1);
      for (const l of lights) expect(l.transform.position.every(Number.isFinite)).toBe(true);
    }
    // Split light comes from the subject's side: facing +X, its left is −Z.
    const key = lightingPreset('split', { centre: [0, 1, 0], yaw: Math.PI / 2 })[0]!;
    expect(key.transform.position[2]).toBeLessThan(-2);
  });
});
