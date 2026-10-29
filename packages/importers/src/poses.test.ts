import { describe, expect, it } from 'vitest';
import { qangle, type CanonicalPose } from '@poser/rig';
import { BUILTIN_POSES, euler } from '@poser/posing';
import { bvhToPose, parseBvh, parsePoseJson, poseToBvh, poseToJson, poseToVrma, vrmaToPose } from './poses';

const sample = BUILTIN_POSES.find((p) => p.id === 'builtin:running')!.pose;

function maxError(a: CanonicalPose, b: CanonicalPose, bones = Object.keys(a)): number {
  return Math.max(...bones.map((k) => qangle(a[k] ?? [0, 0, 0, 1], b[k] ?? [0, 0, 0, 1])));
}

/** A small Mixamo-named T-pose skeleton in centimetres. */
function mixamoBvh(facing: 1 | -1, frame: string): string {
  const x = (v: number) => v * facing;
  const z = (v: number) => v * facing;
  return `HIERARCHY
ROOT mixamorig:Hips
{
  OFFSET 0 100 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT mixamorig:Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT mixamorig:Spine1
    {
      OFFSET 0 15 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT mixamorig:Spine2
      {
        OFFSET 0 15 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT mixamorig:Neck
        {
          OFFSET 0 12 0
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT mixamorig:Head
          {
            OFFSET 0 8 0
            CHANNELS 3 Zrotation Xrotation Yrotation
            End Site
            {
              OFFSET 0 20 0
            }
          }
        }
        ${['Left', 'Right']
          .map((side) => {
            const s = side === 'Left' ? 1 : -1;
            return `JOINT mixamorig:${side}Shoulder
        {
          OFFSET ${x(s * 5)} 10 0
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT mixamorig:${side}Arm
          {
            OFFSET ${x(s * 12)} 0 0
            CHANNELS 3 Zrotation Xrotation Yrotation
            JOINT mixamorig:${side}ForeArm
            {
              OFFSET ${x(s * 28)} 0 0
              CHANNELS 3 Zrotation Xrotation Yrotation
              JOINT mixamorig:${side}Hand
              {
                OFFSET ${x(s * 25)} 0 0
                CHANNELS 3 Zrotation Xrotation Yrotation
                End Site
                {
                  OFFSET ${x(s * 18)} 0 0
                }
              }
            }
          }
        }`;
          })
          .join('\n')}
      }
    }
  }
  ${['Left', 'Right']
    .map((side) => {
      const s = side === 'Left' ? 1 : -1;
      return `JOINT mixamorig:${side}UpLeg
  {
    OFFSET ${x(s * 9)} -5 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT mixamorig:${side}Leg
    {
      OFFSET 0 -45 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT mixamorig:${side}Foot
      {
        OFFSET 0 -42 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT mixamorig:${side}ToeBase
        {
          OFFSET 0 -6 ${z(14)}
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 0 ${z(6)}
          }
        }
      }
    }
  }`;
    })
    .join('\n  ')}
}
MOTION
Frames: 2
Frame Time: 0.0333333
${'0 100 0 0 0 0 ' + '0 0 0 '.repeat(21)}
${frame}
`;
}

describe('pose files', () => {
  it('round-trips a pose through BVH', () => {
    const bvh = poseToBvh(sample);
    const data = parseBvh(bvh);
    expect(data.frames).toHaveLength(1);
    const back = bvhToPose(bvh);
    expect(back.coverage).toBe(1);
    expect(maxError(sample, back.pose)).toBeLessThan(1e-3);
  });

  it('round-trips a pose through VRMA', () => {
    const back = vrmaToPose(poseToVrma(sample));
    expect(back.coverage).toBe(1);
    expect(maxError(sample, back.pose)).toBeLessThan(1e-3);
  });

  it('round-trips pose JSON and drops unknown bones', () => {
    const text = poseToJson('Run', { ...sample, tail: [0, 0, 0, 1] });
    const back = parsePoseJson(text);
    expect(back.name).toBe('Run');
    expect(back.pose.tail).toBeUndefined();
    expect(maxError(sample, back.pose)).toBeLessThan(1e-5);
    expect(() => parsePoseJson('{"format":"other"}')).toThrow();
  });

  it('retargets a Mixamo BVH frame, whichever way the file faces', () => {
    // Rest directions differ by a few degrees from the canonical rig, so allow ~6°.
    const tol = 0.1;
    // Frame 2: left elbow bent 90° (about Y), right knee bent 60° (about X).
    // Channels in file order: hips(6), spine, spine1, spine2, neck, head, Lsh, Larm, Lfore, Lhand, Rsh, Rarm, Rfore, Rhand, LupLeg, Lleg, Lfoot, Ltoe, RupLeg, Rleg, Rfoot, Rtoe.
    const ch = Array<string>(6 + 21 * 3).fill('0');
    ch[1] = '100';
    const slot = (bone: number, axis: 'z' | 'x' | 'y') => 6 + (bone - 1) * 3 + { z: 0, x: 1, y: 2 }[axis];
    ch[slot(8, 'y')] = '-90';
    ch[slot(19, 'x')] = '60';
    const front = bvhToPose(mixamoBvh(1, ch.join(' ')), 1);
    expect(front.frameCount).toBe(2);
    expect(qangle(front.pose.leftLowerArm!, euler(0, -90, 0))).toBeLessThan(tol);
    expect(qangle(front.pose.rightLowerLeg!, euler(60, 0, 0))).toBeLessThan(tol);
    // The same motion authored facing −Z: rotations about X and Z flip sign.
    ch[slot(19, 'x')] = '-60';
    const back = bvhToPose(mixamoBvh(-1, ch.join(' ')), 1);
    expect(qangle(back.pose.leftLowerArm!, euler(0, -90, 0))).toBeLessThan(tol);
    expect(qangle(back.pose.rightLowerLeg!, euler(60, 0, 0))).toBeLessThan(tol);
    // Frame 0 is the rest pose (up to the same rest difference).
    expect(qangle(bvhToPose(mixamoBvh(1, ch.join(' ')), 0).pose.leftLowerArm!, [0, 0, 0, 1])).toBeLessThan(tol);
  });
});
