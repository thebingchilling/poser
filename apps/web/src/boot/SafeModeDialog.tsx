import { Button, Dialog } from '@poser/ui';

export type SafeModeChoice = 'last-low' | 'last-normal' | 'empty';

/** Safe Mode after a crash (PLAN.md section 3.5). */
export function SafeModeDialog({ task, crashCount, onChoose }: { task: string | null; crashCount: number; onChoose: (c: SafeModeChoice) => void }) {
  return (
    <Dialog
      open
      modal
      icon="warning"
      title="Safe Mode"
      actions={
        <>
          <Button variant="text" onClick={() => onChoose('empty')}>
            Start empty
          </Button>
          <Button variant="tonal" onClick={() => onChoose('last-normal')}>
            Open normally
          </Button>
          <Button onClick={() => onChoose('last-low')}>Open at low quality</Button>
        </>
      }
    >
      <p>
        Poser closed unexpectedly{task ? ` while ${task.charAt(0).toLowerCase() + task.slice(1)}` : ''}
        {crashCount > 1 ? ` (${crashCount} times in a row)` : ''}. This can happen when a scene needs more memory than
        the device allows.
      </p>
      <p>Safe Mode uses the lowest quality. Your work is autosaved, so you can open the last autosave at low quality or start with an empty scene.</p>
    </Dialog>
  );
}
