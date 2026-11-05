import { Retargeter, axisAngle, detectRig, qinv, qmul, qnorm, type CanonicalPose, type Q, type SourceBone, type V3 } from '@poser/rig';
import { MissingContentError, type ContentSource } from '../content';
import { DsonResolver, fragment, type DsonFile, type DsonNode } from './dson';

/**
 * Daz pose presets (.duf with `scene.animations`): rotation angles per bone,
 * in each bone's own frame (its orientation and rotation order). Converted
 * to a canonical pose with the figure's bone definitions from the Daz
 * library, so a Daz pose works on any figure.
 */

export function isDazPosePreset(file: DsonFile): boolean {
  const type = file.asset_info?.type ?? '';
  if (/pose/i.test(type)) return true;
  const hasGeometry = (file.scene?.nodes ?? []).some((n) => n.geometries?.length);
  return !!file.scene?.animations?.length && !hasGeometry && !file.geometry_library?.length;
}

/** "name://@selection/lShldrBend:?rotation/z/value" → { bone: 'lShldrBend', property: 'rotation', axis: 'z' }. */
export function poseChannel(url: string): { bone: string; property: string; axis: string } | null {
  const m = /@selection[/#]([^:?]+):?\?([a-z_]+)\/([xyz])/i.exec(url);
  return m ? { bone: decodeURIComponent(m[1]!), property: m[2]!.toLowerCase(), axis: m[3]!.toLowerCase() } : null;
}

/** Library figures to read bone frames from, by the bone names a pose uses. */
function figureCandidates(bones: string[]): string[] {
  const set = new Set(bones);
  if (set.has('l_upperarm') || set.has('l_forearm')) return ['data/DAZ 3D/Genesis 9/Base/Genesis9.dsf'];
  if (set.has('lShldrBend') || set.has('lForearmBend')) return ['data/DAZ 3D/Genesis 8/Female/Genesis8Female.dsf', 'data/DAZ 3D/Genesis 8/Male/Genesis8Male.dsf', 'data/DAZ 3D/Genesis 8/Female 8_1/Genesis8_1Female.dsf'];
  return ['data/DAZ 3D/Genesis 3/Female/Genesis3Female.dsf', 'data/DAZ 3D/Genesis 3/Male/Genesis3Male.dsf', 'data/DAZ 3D/Genesis 2/Female/Genesis2Female.dsf', 'data/DAZ 3D/Genesis 2/Male/Genesis2Male.dsf'];
}

const D = Math.PI / 180;
const AXES: Record<string, V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function triple(values: DsonNode['center_point']): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const c of values ?? []) out[c.id === 'x' ? 0 : c.id === 'y' ? 1 : 2] = c.current_value ?? c.value ?? 0;
  return out;
}

/**
 * A rotation from Euler angles (degrees) in a Daz rotation order such as
 * "YZX": the first axis is applied first (so the matrix is R3·R2·R1).
 */
export function dazEuler(angles: Record<string, number>, order: string): Q {
  let q: Q = [0, 0, 0, 1];
  for (const axis of order.toLowerCase()) q = qmul(axisAngle(AXES[axis]!, (angles[axis] ?? 0) * D), q);
  return qnorm(q);
}

type BoneNode = DsonNode & { orientation?: { id: string; value: number }[]; rotation_order?: string };

export async function dazPoseToCanonical(file: DsonFile, sources: ContentSource[]): Promise<{ pose: CanonicalPose; warnings: string[]; figure: string }> {
  const angles = new Map<string, Record<string, number>>();
  for (const a of file.scene?.animations ?? []) {
    const ch = poseChannel(a.url);
    if (!ch || ch.property !== 'rotation') continue;
    const value = Number(a.keys?.[0]?.[1] ?? 0);
    angles.set(ch.bone, { ...(angles.get(ch.bone) ?? {}), [ch.axis]: value });
  }
  if (!angles.size) throw new Error('This Daz preset has no joint rotations.');
  const resolver = new DsonResolver(sources);
  const candidates = figureCandidates([...angles.keys()]);
  let figureFile: DsonFile | null = null;
  let figurePath = '';
  for (const c of candidates) {
    figureFile = await resolver.file(c);
    if (figureFile) {
      figurePath = c;
      break;
    }
  }
  if (!figureFile) throw new MissingContentError([candidates[0]!], 'daz');

  // Bones in hierarchy order, at rest, with world-aligned frames (as everywhere else in Poser).
  const nodes = (figureFile.node_library ?? []).filter((n) => n.type === 'bone') as BoneNode[];
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const ordered: BoneNode[] = [];
  const visit = (n: BoneNode) => {
    if (ordered.includes(n)) return;
    const p = n.parent ? nodes[index.get(fragment(n.parent)) ?? -1] : undefined;
    if (p) visit(p);
    ordered.push(n);
  };
  nodes.forEach(visit);
  const pos = new Map(ordered.map((n) => [n.id, triple(n.center_point)]));
  const bones: SourceBone[] = ordered.map((n) => {
    const parentId = n.parent ? fragment(n.parent) : '';
    const parentIdx = ordered.findIndex((x) => x.id === parentId);
    const c = pos.get(n.id)!;
    const pc = parentIdx >= 0 ? pos.get(parentId)! : ([0, 0, 0] as V3);
    return { name: n.id, parent: parentIdx, position: [c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]], rotation: [0, 0, 0, 1] };
  });

  // Each bone turns about its own oriented axes: local rotation = O · R · O⁻¹ (O is the bone's orientation).
  const locals: Q[] = ordered.map((n) => {
    const a = angles.get(n.id);
    if (!a) return [0, 0, 0, 1];
    const o = triple(n.orientation as DsonNode['center_point']);
    const O = dazEuler({ x: o[0], y: o[1], z: o[2] }, 'XYZ');
    return qnorm(qmul(qmul(O, dazEuler(a, n.rotation_order ?? 'XYZ')), qinv(O)));
  });

  const rig = detectRig(bones.map((b) => b.name));
  const warnings: string[] = [];
  const unknown = [...angles.keys()].filter((b) => !index.has(b));
  if (unknown.length) warnings.push(`${unknown.length} joints in the preset aren't on ${figurePath.split('/').pop()!.replace('.dsf', '')} and were skipped.`);
  const pose = new Retargeter(bones, rig.map).extract(locals);
  return { pose, warnings, figure: figurePath.split('/').pop()!.replace('.dsf', '') };
}
