import * as RadixSwitch from '@radix-ui/react-switch';
import { useId } from 'react';

/** MD3 switch with its label (and optional supporting text) as a list row. */
export function Switch({
  label,
  supporting,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  supporting?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="md-switch-row" data-disabled={disabled || undefined}>
      <label htmlFor={id} className="md-switch-row__text">
        <span className="md-switch-row__label">{label}</span>
        {supporting && <span className="md-switch-row__supporting">{supporting}</span>}
      </label>
      <RadixSwitch.Root id={id} className="md-switch" checked={checked} onCheckedChange={onChange} disabled={disabled}>
        <RadixSwitch.Thumb className="md-switch__thumb" />
      </RadixSwitch.Root>
    </div>
  );
}
