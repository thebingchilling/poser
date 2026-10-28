import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface TabDef<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  content: ReactNode;
}

/** MD3 primary tabs; each tab shows its icon above the label. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly TabDef<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <RadixTabs.Root className="md-tabs" value={value} onValueChange={(v) => onChange(v as T)}>
      <RadixTabs.List className="md-tabs__list md-scroll" aria-label={label}>
        {tabs.map((t) => (
          <RadixTabs.Trigger key={t.value} value={t.value} className="md-tabs__tab md-state">
            {t.icon && <Icon name={t.icon} size={20} />}
            <span>{t.label}</span>
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="md-tabs__panel">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
