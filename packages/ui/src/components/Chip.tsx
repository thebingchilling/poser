import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

/** MD3 filter chip: toggles, shows a check when selected. */
export function FilterChip({
  label,
  selected,
  onToggle,
  icon,
}: {
  label: string;
  selected: boolean;
  onToggle: (selected: boolean) => void;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      className="md-chip md-chip--filter md-state"
      aria-pressed={selected}
      data-selected={selected || undefined}
      onClick={() => onToggle(!selected)}
    >
      {selected ? <Icon name="check" size={18} /> : icon && <Icon name={icon} size={18} />}
      <span>{label}</span>
    </button>
  );
}

/** MD3 assist chip: a quick action with icon and label. */
export function AssistChip({ label, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }) {
  return (
    <button type="button" className="md-chip md-chip--assist md-state" {...rest}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
}
