import { Popover, UnstyledButton } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { COLLECTION_ICONS } from '@/components/CollectionIcon/icons';
import type { Color } from '@/domain/schema/types';
import styles from './IconPicker.module.scss';

interface IconPickerProps {
  value: string | undefined;
  color?: Color | undefined;
  onChange: (icon: string) => void;
}

/** The collection's icon as a button that opens the curated icon grid. */
export function IconPicker({ value, color, onChange }: IconPickerProps) {
  const [opened, setOpened] = useState(false);
  const tint = color ? `var(--os-${color})` : undefined;
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <UnstyledButton
          className={styles.trigger}
          aria-label="Choose icon"
          title="Choose icon"
          onClick={() => {
            setOpened((o) => !o);
          }}
        >
          <CollectionIcon icon={value} size={18} stroke={1.75} style={{ color: tint }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <div className={styles.grid} role="listbox" aria-label="Icons">
          {Object.keys(COLLECTION_ICONS).map((key) => (
            <UnstyledButton
              key={key}
              role="option"
              aria-selected={key === value}
              aria-label={key}
              title={key}
              className={clsx(styles.option, key === value && styles.selected)}
              onClick={() => {
                onChange(key);
                setOpened(false);
              }}
            >
              <CollectionIcon icon={key} size={16} stroke={1.75} />
            </UnstyledButton>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
