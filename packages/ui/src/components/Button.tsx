import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  /** The visible label. Required: buttons always show text. */
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', icon, children, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`md-button md-button--${variant} md-state${icon ? ' md-button--with-icon' : ''}${className ? ' ' + className : ''}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      <span className="md-button__label">{children}</span>
    </button>
  );
});

/**
 * Icons whose meaning is universally obvious may appear without a visible
 * label (PLAN.md section 3.1). Everything else uses Button or another
 * labelled component; the type system enforces it.
 */
export type ObviousIcon = 'close' | 'arrow_back' | 'search' | 'play_arrow' | 'pause' | 'more_vert';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ObviousIcon;
  /** Accessible name and tooltip. */
  label: string;
  variant?: 'standard' | 'filled' | 'tonal';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'standard', className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip text={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={`md-icon-button md-icon-button--${variant} md-state${className ? ' ' + className : ''}`}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
});

/** Extended FAB: always icon plus label. */
export const Fab = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; children: ReactNode }>(
  function Fab({ icon, children, className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={`md-fab md-state${className ? ' ' + className : ''}`} {...rest}>
        <Icon name={icon} />
        <span className="md-fab__label">{children}</span>
      </button>
    );
  },
);

/**
 * A compact action showing the icon with its label underneath, used where
 * horizontal space is tight (app bar on phones). Still always labelled.
 */
export const StackedAction = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; children: ReactNode }>(
  function StackedAction({ icon, children, className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={`md-stacked-action md-state${className ? ' ' + className : ''}`} {...rest}>
        <Icon name={icon} size={22} />
        <span className="md-stacked-action__label">{children}</span>
      </button>
    );
  },
);
