import { Popover, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { COLORS } from '@/domain/fields/colors';
import type { Color } from '@/domain/schema/types';
import styles from './ColorPicker.module.scss';

interface ColorPickerProps {
  value: Color | undefined;
  onChange: (color: Color) => void;
  /** Accessible label for the trigger, e.g. "Color of option Read". */
  label: string;
}

/** A color dot that opens the palette. */
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <UnstyledButton
          className={styles.trigger}
          aria-label={label}
          title={label}
          onClick={() => {
            setOpened((o) => !o);
          }}
        >
          <span className={styles.dot} style={{ background: `var(--os-${value ?? 'gray'})` }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <div className={styles.grid} role="listbox" aria-label={label}>
          {COLORS.map((color) => (
            <UnstyledButton
              key={color}
              role="option"
              aria-selected={color === value}
              aria-label={color}
              title={color}
              className={clsx(styles.swatch)}
              style={{ background: `var(--os-${color})` }}
              onClick={() => {
                onChange(color);
                setOpened(false);
              }}
            >
              {color === value && <IconCheck size={12} stroke={3} />}
            </UnstyledButton>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
