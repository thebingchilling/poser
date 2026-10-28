import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** MD3 list item: leading icon, headline, optional supporting text, trailing slot. */
export function ListItem({
  icon,
  headline,
  supporting,
  trailing,
  onClick,
  selected,
}: {
  icon?: IconName;
  headline: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const body = (
    <>
      {icon && <Icon name={icon} className="md-list-item__icon" />}
      <span className="md-list-item__text">
        <span className="md-list-item__headline">{headline}</span>
        {supporting && <span className="md-list-item__supporting">{supporting}</span>}
      </span>
    </>
  );
  return (
    <div className="md-list-item" data-selected={selected || undefined}>
      {onClick ? (
        <button type="button" className="md-list-item__main md-state" onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className="md-list-item__main">{body}</div>
      )}
      {trailing && <div className="md-list-item__trailing">{trailing}</div>}
    </div>
  );
}

export function ListSubheader({ children }: { children: ReactNode }) {
  return <h3 className="md-list-subheader">{children}</h3>;
}

export function Divider() {
  return <hr className="md-divider" />;
}
