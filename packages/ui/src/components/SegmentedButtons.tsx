import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Icon, type IconName } from './Icon';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  /** Shown as a tooltip-like title, e.g. why it is disabled. */
  title?: string;
}

/** MD3 single-select segmented buttons; the selected segment shows a check. */
export function SegmentedButtons<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className="md-segmented"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {segments.map((s) => (
        <ToggleGroup.Item key={s.value} value={s.value} disabled={s.disabled} title={s.title} className="md-segmented__item md-state">
          {s.value === value ? <Icon name="check" size={18} /> : s.icon && <Icon name={s.icon} size={18} />}
          <span>{s.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
