import { createLock, type LockRecord } from '@poser/platform';
import { Button, Dialog, TextField } from '@poser/ui';
import { useState } from 'react';

/** Set or change the app lock. Used on first run and from Settings. */
export function SetLockDialog({
  open,
  firstRun,
  onDone,
}: {
  open: boolean;
  firstRun?: boolean;
  onDone: (record: LockRecord | null) => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (a.length < 4) return setError('Use at least 4 characters');
    if (a !== b) return setError("The two entries don't match");
    onDone(await createLock(a));
    setA('');
    setB('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onDone(null)}
      icon="lock"
      title={firstRun ? 'Set an app lock?' : 'App lock'}
      actions={
        <>
          <Button variant="text" onClick={() => onDone(null)}>
            {firstRun ? 'Skip for now' : 'Cancel'}
          </Button>
          <Button icon="lock" onClick={save}>
            Set lock
          </Button>
        </>
      }
    >
      <p>
        {firstRun ? 'Recommended. ' : ''}A PIN or passphrase is asked for when Poser opens and after it has been in the
        background for a while. It keeps casual eyes out on a shared device.
      </p>
      <TextField label="PIN or passphrase" type="password" autoComplete="new-password" value={a} onChange={(e) => (setA(e.target.value), setError(null))} />
      <TextField label="Repeat it" type="password" autoComplete="new-password" value={b} error={error} onChange={(e) => (setB(e.target.value), setError(null))} />
    </Dialog>
  );
}
