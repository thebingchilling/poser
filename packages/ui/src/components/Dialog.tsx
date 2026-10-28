import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  icon?: IconName;
  children: ReactNode;
  actions?: ReactNode;
  /** Full-screen on compact windows (settings and other long dialogs). */
  large?: boolean;
  /** Prevent closing by Escape or clicking outside (e.g. a required notice). */
  modal?: boolean;
}

export function Dialog({ open, onOpenChange, title, icon, children, actions, large, modal }: DialogProps) {
  const block = modal ? (e: Event) => e.preventDefault() : undefined;
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="md-dialog__scrim" />
        <RadixDialog.Content
          className={`md-dialog${large ? ' md-dialog--large' : ''}`}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          aria-describedby={undefined}
        >
          {icon && <Icon name={icon} className="md-dialog__icon" />}
          <RadixDialog.Title className="md-dialog__title" data-centered={icon ? true : undefined}>
            {title}
          </RadixDialog.Title>
          <div className="md-dialog__content md-scroll">{children}</div>
          {actions && <div className="md-dialog__actions">{actions}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
