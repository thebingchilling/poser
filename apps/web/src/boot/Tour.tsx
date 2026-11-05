import { Button, Dialog, type IconName } from '@poser/ui';
import { useState } from 'react';
import { useSettings } from '../state/settings';

/** A short first-run tour (PLAN.md section 3.3): four steps, skippable, shown once per device. */
const STEPS: { icon: IconName; title: string; body: string[] }[] = [
  {
    icon: 'accessibility_new',
    title: 'Pose the figure',
    body: [
      'Click a joint on the figure and drag the rings to turn it. Fine-tune it in the Inspector.',
      'Switch to Move (IK) (or press Q) to drag hands, feet, hips, chest, head, or where the eyes look. Pin a foot to keep it planted.',
      'Pose › Library has ready-made poses; Blend & random mixes them.',
    ],
  },
  {
    icon: 'upload',
    title: 'Bring in your own',
    body: [
      'Drag files, folders, or zips onto the app: glTF, FBX, OBJ, VRM, Daz scenes, VaM packages, and more.',
      'For Daz and VaM, add your content folder in Library › Content folders so scenes import with everything they use.',
    ],
  },
  {
    icon: 'lightbulb',
    title: 'Light, frame, capture',
    body: [
      'Render has lighting presets, time-of-day sun, HDRI environments, lenses, study modes (clay, silhouette, notan), and guides.',
      'Capture saves a picture at any size, with a transparent background if you like.',
    ],
  },
  {
    icon: 'shield_lock',
    title: 'Private by design',
    body: [
      'Everything stays in this browser on this device. Nothing is uploaded.',
      'Back up or move projects with Project › Export, and set an app lock or a neutral tab in Settings.',
    ],
  },
];

export function Tour({ open }: { open: boolean }) {
  const set = useSettings((s) => s.set);
  const [step, setStep] = useState(0);
  const done = () => set({ tourDone: true });
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && done()}
      title={s.title}
      icon={s.icon}
      actions={
        <>
          <Button variant="text" onClick={done}>Skip tour</Button>
          {step > 0 && (
            <Button variant="text" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button onClick={() => (last ? done() : setStep(step + 1))}>{last ? 'Start posing' : 'Next'}</Button>
        </>
      }
    >
      {s.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p className="hint">
        Step {step + 1} of {STEPS.length}
      </p>
    </Dialog>
  );
}
