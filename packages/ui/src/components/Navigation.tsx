import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface NavItem<T extends string> {
  id: T;
  icon: IconName;
  label: string;
  badge?: boolean;
}

interface NavProps<T extends string> {
  items: readonly NavItem<T>[];
  selected: T | null;
  onSelect: (id: T) => void;
  label: string;
}

function NavButtons<T extends string>({ items, selected, onSelect, prefix }: NavProps<T> & { prefix: string }) {
  return items.map((item) => {
    const active = item.id === selected;
    return (
      <button
        key={item.id}
        type="button"
        className={`${prefix}__item`}
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => onSelect(item.id)}
      >
        <span className={`${prefix}__indicator md-state`}>
          <Icon name={item.icon} />
          {item.badge && <span className={`${prefix}__badge`} />}
        </span>
        <span className={`${prefix}__label`}>{item.label}</span>
      </button>
    );
  });
}

/** MD3 navigation rail (medium and expanded windows). Labels always shown. */
export function NavigationRail<T extends string>(props: NavProps<T> & { header?: ReactNode }) {
  return (
    <nav className="md-nav-rail md-scroll" aria-label={props.label}>
      {props.header && <div className="md-nav-rail__header">{props.header}</div>}
      <NavButtons {...props} prefix="md-nav-rail" />
    </nav>
  );
}

/** MD3 navigation bar (compact windows). Labels always shown. */
export function NavigationBar<T extends string>(props: NavProps<T>) {
  return (
    <nav className="md-nav-bar" aria-label={props.label}>
      <NavButtons {...props} prefix="md-nav-bar" />
    </nav>
  );
}
