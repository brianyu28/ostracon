import type { ReactNode } from 'react';
import styles from './CellValue.module.scss';

interface LinkChipProps {
  children: ReactNode;
  /** Opens the linked record. */
  onOpen?: (() => void) | undefined;
}

/** A linked record's title as a chip (a button when it can be opened). */
export function LinkChip({ children, onOpen }: LinkChipProps) {
  if (!onOpen) return <span className={styles.linkChip}>{children}</span>;
  return (
    <button
      type="button"
      className={`${styles.linkChip} ${styles.linkChipButton}`}
      tabIndex={-1}
      title="Open"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={onOpen}
    >
      {children}
    </button>
  );
}
