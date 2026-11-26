import { Popover, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { ICON_INFO } from '@/components/CollectionIcon/icons';
import type { Color } from '@/domain/schema/types';
import styles from './IconPicker.module.scss';

interface IconPickerProps {
  value: string | undefined;
  color?: Color | undefined;
  onChange: (icon: string) => void;
}

/** The first emoji in some text (one grapheme, so flags and skin tones stay whole). */
function firstEmoji(text: string): string | undefined {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(text))
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) return segment;
  return undefined;
}

/** The collection's icon as a button that opens a searchable icon grid (or takes an emoji). */
export function IconPicker({ value, color, onChange }: IconPickerProps) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const tint = color ? `var(--os-${color})` : undefined;
  const q = query.trim().toLowerCase();
  const emoji = firstEmoji(query);
  const icons = q
    ? ICON_INFO.filter((i) => `${i.key} ${i.keywords} ${i.group}`.toLowerCase().includes(q))
    : ICON_INFO;
  const pick = (icon: string) => {
    onChange(icon);
    setOpened(false);
    setQuery('');
  };
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      withinPortal
      trapFocus
    >
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
        <TextInput
          size="xs"
          data-autofocus
          placeholder="Search, or type an emoji"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const first = emoji ?? icons[0]?.key;
            if (first) pick(first);
          }}
        />
        <div className={styles.grid} role="listbox" aria-label="Icons">
          {emoji && (
            <UnstyledButton
              role="option"
              aria-selected={emoji === value}
              aria-label={`Use ${emoji}`}
              title="Use this emoji"
              className={clsx(styles.option, emoji === value && styles.selected)}
              onClick={() => {
                pick(emoji);
              }}
            >
              <CollectionIcon icon={emoji} size={16} />
            </UnstyledButton>
          )}
          {icons.map(({ key }) => (
            <UnstyledButton
              key={key}
              role="option"
              aria-selected={key === value}
              aria-label={key}
              title={key}
              className={clsx(styles.option, key === value && styles.selected)}
              onClick={() => {
                pick(key);
              }}
            >
              <CollectionIcon icon={key} size={16} stroke={1.75} />
            </UnstyledButton>
          ))}
          {!emoji && icons.length === 0 && <span className={styles.none}>No icons match</span>}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
