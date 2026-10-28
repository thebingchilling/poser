import type { HTMLAttributes } from 'react';

export function Card({ variant = 'filled', className, ...rest }: HTMLAttributes<HTMLDivElement> & { variant?: 'filled' | 'outlined' | 'elevated' }) {
  return <div className={`md-card md-card--${variant}${className ? ' ' + className : ''}`} {...rest} />;
}
