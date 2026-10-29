import { qrot, type CanonicalPose, type V3 } from '@poser/rig';
import { defaultSkeleton } from './library';
import type { PoseSkeleton } from './skeleton';

/**
 * A pose thumbnail drawn as a simple figure in SVG (PLAN.md section 6: pose
 * library). Pure maths, so it works anywhere (workers, tests) and every pose
 * gets the same look whatever figure it was made on.
 */

const CHAINS: string[][] = [
  ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'],
  ...(['left', 'right'] as const).flatMap((s) => [
    ['upperChest', `${s}Shoulder`, `${s}UpperArm`, `${s}LowerArm`, `${s}Hand`, `${s}MiddleProximal`],
    ['hips', `${s}UpperLeg`, `${s}LowerLeg`, `${s}Foot`, `${s}Toes`],
  ]),
];

/** Limb thickness (metres) by the bone a segment starts from. */
function thickness(bone: string): number {
  if (/^(hips|spine|chest)$/.test(bone)) return 0.2;
  if (/upperChest/.test(bone)) return 0.16;
  if (/neck/.test(bone)) return 0.08;
  if (/UpperLeg/.test(bone)) return 0.13;
  if (/LowerLeg/.test(bone)) return 0.095;
  if (/Foot/.test(bone)) return 0.07;
  if (/Shoulder/.test(bone)) return 0.09;
  if (/UpperArm/.test(bone)) return 0.08;
  if (/LowerArm/.test(bone)) return 0.065;
  return 0.05;
}

export function poseThumbnailSvg(pose: CanonicalPose, opts: { skeleton?: PoseSkeleton; size?: number; yaw?: number } = {}): string {
  const skel = opts.skeleton ?? defaultSkeleton();
  const size = opts.size ?? 160;
  const yaw = ((opts.yaw ?? 28) * Math.PI) / 180;
  const P = skel.positions(pose);
  const W = skel.worldRotations(pose);
  // Head top: 0.2 m along the head bone.
  const head = P.get('head');
  if (head) {
    const q = W.get('head')!;
    const up = qrot(q, [0, 0.22, 0]);
    P.set('headTop', [head[0] + up[0], head[1] + up[1], head[2] + up[2]]);
  }
  // Three-quarter view from the front left, looking slightly down.
  const view = (p: V3): [number, number, number] => {
    const x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw);
    const z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
    return [x, -p[1] + z * 0.12, z];
  };
  const segs: { a: [number, number, number]; b: [number, number, number]; w: number; bone: string }[] = [];
  for (const chain of CHAINS) {
    const present = chain.filter((b) => P.has(b));
    for (let i = 0; i + 1 < present.length; i++) segs.push({ a: view(P.get(present[i]!)!), b: view(P.get(present[i + 1]!)!), w: thickness(present[i]!), bone: present[i]! });
  }
  const headC = head ? view(lerp(P.get('head')!, P.get('headTop')!, 0.5)) : null;
  const pts = segs.flatMap((s) => [s.a, s.b]);
  if (headC) pts.push(headC);
  if (!pts.length) return svg(size, '');
  const pad = 0.16;
  const minX = Math.min(...pts.map((p) => p[0])) - pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + pad;
  const minY = Math.min(...pts.map((p) => p[1])) - pad;
  const maxY = Math.max(...pts.map((p) => p[1])) + pad;
  const span = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const k = size / span;
  const tx = (p: [number, number, number]) => `${((p[0] - cx) * k + size / 2).toFixed(1)} ${((p[1] - cy) * k + size / 2).toFixed(1)}`;
  // Far parts first; the figure's left side is lighter.
  const items: { z: number; el: string }[] = segs.map((s) => {
    const shade = s.bone.startsWith('left') ? '#d9c2b0' : s.bone.startsWith('right') ? '#a8907f' : '#c4ac9a';
    return { z: (s.a[2] + s.b[2]) / 2, el: `<path d="M${tx(s.a)}L${tx(s.b)}" stroke="${shade}" stroke-width="${(s.w * k).toFixed(1)}"/>` };
  });
  if (headC) items.push({ z: headC[2], el: `<circle cx="${tx(headC).split(' ')[0]}" cy="${tx(headC).split(' ')[1]}" r="${(0.11 * k).toFixed(1)}" fill="#cdb5a3"/>` });
  items.sort((a, b) => a.z - b.z);
  return svg(size, `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${items.map((i) => i.el).join('')}</g>`);
}

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#2e2a2d"/>${body}</svg>`;
}

/** The thumbnail as a data URL for an <img>. */
export function poseThumbnailUrl(pose: CanonicalPose, opts?: Parameters<typeof poseThumbnailSvg>[1]): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(poseThumbnailSvg(pose, opts));
}

const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
