import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { ReactElement } from 'react';
import { Icon, type IconName } from './Icon';

export type MenuEntry =
  | { kind?: 'item'; label: string; icon: IconName; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { kind: 'divider' };

/** MD3 menu; every item has an icon and a label. */
export function Menu({ trigger, items, label }: { trigger: ReactElement; items: readonly MenuEntry[]; label: string }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="md-menu" aria-label={label} sideOffset={4} align="start" collisionPadding={8}>
          {items.map((item, i) =>
            item.kind === 'divider' ? (
              <Dropdown.Separator key={i} className="md-menu__divider" />
            ) : (
              <Dropdown.Item
                key={i}
                className="md-menu__item md-state"
                disabled={item.disabled}
                data-danger={item.danger || undefined}
                onSelect={item.onSelect}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Dropdown.Item>
            ),
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
