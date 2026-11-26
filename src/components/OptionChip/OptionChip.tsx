import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import type { Color } from '@/domain/schema/types';
import styles from './OptionChip.module.scss';

interface OptionChipProps {
  color: Color;
  children: ReactNode;
  className?: string;
}

/** A select option as a small colored pill. */
export function OptionChip({ color, children, className }: OptionChipProps) {
  return (
    <span
      className={clsx(styles.chip, className)}
      style={{ background: `var(--os-${color}-bg)`, color: `var(--os-${color}-fg)` }}
    >
      {children}
    </span>
  );
}
