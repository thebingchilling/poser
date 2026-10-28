import { ICON_PATHS } from '../icons.generated';

export type IconName = keyof typeof ICON_PATHS;

/**
 * A Material Symbols icon. Decorative by default: the label next to it
 * carries the meaning (icons always come with labels, PLAN.md section 3.1).
 */
export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `md-icon ${className}` : 'md-icon'}
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
