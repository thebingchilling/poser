import { verifyLock, type BrowserInfo } from '@poser/platform';
import { Button, Dialog, TextField } from '@poser/ui';
import { useState, type FormEvent } from 'react';

/** Shown when the browser isn't Chrome (PLAN.md section 3.5). */
export function UnsupportedBrowser({ browser, onContinue }: { browser: BrowserInfo; onContinue: () => void }) {
  return (
    <main className="gate">
      <div className="gate__card">
        <h1 className="gate__title">Please open Poser in Chrome</h1>
        <p>
          Poser needs Google Chrome on every device. This looks like <strong>{browser.name}</strong>.
        </p>
        {browser.isIOS ? (
          <p>On iPhone and iPad, install Chrome from the App Store, then open this address in Chrome.</p>
        ) : (
          <p>Copy this page's address and open it in Chrome.</p>
        )}
        <div className="gate__actions">
          <Button variant="text" onClick={onContinue}>
            Continue anyway (not supported)
          </Button>
        </div>
      </div>
    </main>
  );
}

/** Adults-only notice on first run (PLAN.md section 22). */
export function AdultsNotice({ onConfirm }: { onConfirm: () => void }) {
  return (
    <main className="gate">
      <Dialog
        open
        modal
        icon="shield_lock"
        title="Adults only"
        actions={
          <>
            <Button variant="text" onClick={() => window.close()}>
              Leave
            </Button>
            <Button onClick={onConfirm}>I am 18 or older</Button>
          </>
        }
      >
        <p>Poser is a private app for invited adults. It contains nudity and graphic content (which can be turned off in Settings).</p>
        <p>
          Figures must always be adults. Don't make sexual images of real people without their consent. Everything you
          import and create stays on this device.
        </p>
      </Dialog>
    </main>
  );
}

/** App lock screen (PLAN.md section 16.6). */
export function LockScreen({ record, onUnlock }: { record: Parameters<typeof verifyLock>[1]; onUnlock: () => void }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await verifyLock(secret, record);
    setBusy(false);
    if (ok) onUnlock();
    else {
      setError('Wrong PIN or passphrase');
      setSecret('');
    }
  };
  return (
    <main className="gate gate--lock">
      <form className="gate__card" onSubmit={submit}>
        <h1 className="gate__title">Locked</h1>
        <TextField
          label="PIN or passphrase"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={secret}
          error={error}
          onChange={(e) => {
            setSecret(e.target.value);
            setError(null);
          }}
        />
        <div className="gate__actions">
          <Button type="submit" icon="lock_open" disabled={busy || !secret}>
            Unlock
          </Button>
        </div>
      </form>
    </main>
  );
}
