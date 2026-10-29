import { createId } from './ids';
import type { Light, Vec3 } from './types';

/**
 * Lighting presets and the time-of-day sun (PLAN.md sections 17.6 and 18).
 * Presets are placed relative to a subject: its centre and the direction it
 * faces (yaw, radians, 0 = facing +Z).
 */

export type LightingPresetId = 'studio' | 'rembrandt' | 'loop' | 'split' | 'butterfly' | 'rim' | 'overcast' | 'harsh-sun';

export const LIGHTING_PRESETS: Record<LightingPresetId, { name: string; description: string }> = {
  studio: { name: 'Studio three-point', description: 'Key, fill, and rim: even and flattering' },
  rembrandt: { name: 'Rembrandt', description: 'High side key; a triangle of light on the shadow cheek' },
  loop: { name: 'Loop', description: 'Key slightly to the side and above; small nose shadow' },
  split: { name: 'Split', description: 'Key from the side; half the face in shadow' },
  butterfly: { name: 'Butterfly', description: 'Key high in front; shadow under the nose and chin' },
  rim: { name: 'Rim', description: 'Lights from behind outline the body' },
  overcast: { name: 'Overcast', description: 'Soft sky light, faint shadows' },
  'harsh-sun': { name: 'Harsh sun', description: 'One strong high sun, hard shadows' },
};

export interface Subject {
  centre: Vec3;
  yaw: number;
}

/** A point around the subject: `angle` degrees from its front (positive to its left), `height` above its centre. */
function around(s: Subject, angleDeg: number, distance: number, height: number): Vec3 {
  const a = s.yaw + (angleDeg * Math.PI) / 180;
  return [s.centre[0] + Math.sin(a) * distance, s.centre[1] + height, s.centre[2] + Math.cos(a) * distance];
}

function directional(name: string, position: Vec3, target: Vec3, intensity: number, color = '#ffffff', castShadow = false): Light {
  return {
    id: createId('light'),
    name,
    type: 'directional',
    transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    target,
    color,
    intensity,
    castShadow,
    visible: true,
  };
}

function hemisphere(name: string, intensity: number, sky: string, ground: string): Light {
  return {
    id: createId('light'),
    name,
    type: 'hemisphere',
    transform: { position: [0, 10, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    color: sky,
    groundColor: ground,
    intensity,
    castShadow: false,
    visible: true,
  };
}

export function lightingPreset(id: LightingPresetId, subject: Subject = { centre: [0, 1.1, 0], yaw: 0 }): Light[] {
  const s = subject;
  const t = s.centre;
  switch (id) {
    case 'studio':
      return [
        directional('Key light', around(s, 45, 3.5, 2.4), t, 2.2, '#fff6ec', true),
        directional('Fill light', around(s, -60, 3.5, 0.8), t, 0.7, '#eef4ff'),
        directional('Rim light', around(s, 180, 3.5, 1.9), t, 1.2),
        hemisphere('Ambient', 0.35, '#ffffff', '#4a4a4a'),
      ];
    case 'rembrandt':
      return [
        directional('Key light', around(s, 50, 3, 2.2), t, 2.6, '#fff1e0', true),
        directional('Fill light', around(s, -45, 3.5, 0.5), t, 0.25),
        hemisphere('Ambient', 0.15, '#ffffff', '#303030'),
      ];
    case 'loop':
      return [
        directional('Key light', around(s, 30, 3, 1.6), t, 2.4, '#fff4e6', true),
        directional('Fill light', around(s, -40, 3.5, 0.6), t, 0.5),
        hemisphere('Ambient', 0.2, '#ffffff', '#383838'),
      ];
    case 'split':
      return [directional('Key light', around(s, 90, 3, 0.3), t, 2.6, '#ffffff', true), hemisphere('Ambient', 0.08, '#ffffff', '#202020')];
    case 'butterfly':
      return [
        directional('Key light', around(s, 0, 2.5, 2.6), t, 2.4, '#fff8f0', true),
        directional('Fill light', around(s, 0, 3, -0.8), t, 0.45),
        hemisphere('Ambient', 0.2, '#ffffff', '#383838'),
      ];
    case 'rim':
      return [
        directional('Left rim', around(s, 140, 3, 1.4), t, 2.4, '#e8f0ff', true),
        directional('Right rim', around(s, -140, 3, 1.4), t, 2.4, '#e8f0ff'),
        directional('Front fill', around(s, 0, 4, 0.5), t, 0.18),
        hemisphere('Ambient', 0.05, '#ffffff', '#101010'),
      ];
    case 'overcast':
      return [directional('Sky light', around(s, 20, 6, 6), t, 0.6, '#f2f5fa', true), hemisphere('Sky', 1.6, '#dfe6ee', '#5a5852')];
    case 'harsh-sun':
      return [directional('Sun', around(s, 35, 6, 9), t, 4, '#fff3dc', true), hemisphere('Sky', 0.45, '#9fc3ea', '#6b604f')];
  }
}

// ---------- Time-of-day sun ----------

export interface SunSettings {
  /** Local solar time, 0–24. */
  hour: number;
  /** Day of the year, 1–365. */
  day: number;
  /** Degrees north (negative south). */
  latitude: number;
  /** Compass: which way north points in the scene, degrees clockwise from −Z seen from above. */
  north: number;
}

export const DEFAULT_SUN: SunSettings = { hour: 15, day: 172, latitude: 52, north: 0 };

/** Sun elevation and azimuth (radians; azimuth clockwise from north). */
export function sunAngles(sun: SunSettings): { elevation: number; azimuth: number } {
  const D = Math.PI / 180;
  const decl = 23.44 * D * Math.sin((2 * Math.PI * (284 + sun.day)) / 365);
  const lat = sun.latitude * D;
  const h = (sun.hour - 12) * 15 * D;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // Azimuth from north, clockwise (east = 90°).
  const az = Math.atan2(-Math.sin(h), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(h));
  return { elevation, azimuth: (az + 2 * Math.PI) % (2 * Math.PI) };
}

/** Unit vector toward the sun in scene space (Y up). */
export function sunDirection(sun: SunSettings): Vec3 {
  const { elevation, azimuth } = sunAngles(sun);
  const a = azimuth + (sun.north * Math.PI) / 180;
  // North is −Z when north = 0; east is +X.
  return [Math.sin(a) * Math.cos(elevation), Math.sin(elevation), -Math.cos(a) * Math.cos(elevation)];
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const k = Math.max(0, Math.min(1, t));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i]! - v) * k).toString(16).padStart(2, '0')).join('');
}

/**
 * Sun and sky lights plus a matching background for a time of day: warm and
 * low with long shadows at dawn and dusk, white and high at noon, a dim blue
 * moonlight at night.
 */
export function sunLights(sun: SunSettings, centre: Vec3 = [0, 1, 0]): { lights: Light[]; background: string } {
  const dir = sunDirection(sun);
  const el = Math.asin(dir[1]);
  const day = Math.max(0, Math.sin(el));
  const low = Math.max(0, 1 - el / (Math.PI / 9)); // 1 near the horizon, 0 above 20°
  const night = el < -0.05;
  const dist = 12;
  const pos: Vec3 = night
    ? [centre[0] - 4, centre[1] + 8, centre[2] + 5]
    : [centre[0] + dir[0] * dist, centre[1] + Math.max(dir[1], 0.02) * dist, centre[2] + dir[2] * dist];
  const sunColor = night ? '#9fb4e0' : mix('#fff4e0', '#ff9a4a', low);
  const intensity = night ? 0.25 : 0.4 + 3.6 * Math.min(1, day * 1.6) * (1 - 0.5 * low);
  const twilight = Math.max(0, Math.min(1, (el + 0.1) / 0.2)); // 0 at night, 1 by 6° up
  const skyDay = mix('#f2b48a', '#9ec7ef', 1 - low);
  const sky = mix('#141a2e', skyDay, twilight);
  const lights: Light[] = [
    directional(night ? 'Moon' : 'Sun', pos, centre, intensity, sunColor, true),
    hemisphere('Sky', 0.15 + 0.85 * twilight, mix('#2a3352', skyDay, twilight), mix('#151515', '#6a6258', twilight)),
  ];
  return { lights, background: sky };
}
