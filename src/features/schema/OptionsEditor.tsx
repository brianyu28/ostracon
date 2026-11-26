import { ActionIcon, TextInput } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { COLORS } from '@/domain/fields/colors';
import type { Color, SelectOption } from '@/domain/schema/types';
import { newId } from '@/lib/id';
import styles from './OptionsEditor.module.scss';

/** An option being edited: `order` is assigned from the list position on save. */
export type OptionDraft = Pick<SelectOption, 'id' | 'name' | 'color'>;

interface OptionsEditorProps {
  options: readonly OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  /** How many records use each option (shown so deleting one isn't a surprise). */
  usage?: ReadonlyMap<string, number> | undefined;
}

/** The options of a select field: rename, recolor, reorder by dragging, add and remove. */
export function OptionsEditor({ options, onChange, usage }: OptionsEditorProps) {
  const [newName, setNewName] = useState('');
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (options.some((o) => o.name.toLowerCase() === name.toLowerCase())) return;
    const color = COLORS[(options.length + 1) % COLORS.length] ?? 'gray';
    onChange([...options, { id: newId('option'), name, color }]);
    setNewName('');
  };
  const update = (id: string, patch: Partial<OptionDraft>) => {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  return (
    <div className={styles.root}>
      <SortableProvider
        onReorder={(_group, ids) => {
          onChange(
            ids.map((id) => options.find((o) => o.id === id)).filter((o) => o !== undefined),
          );
        }}
      >
        <SortableGroup ids={options.map((o) => o.id)}>
          {options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              used={usage?.get(option.id) ?? 0}
              onRename={(name) => {
                update(option.id, { name });
              }}
              onColor={(color) => {
                update(option.id, { color });
              }}
              onRemove={() => {
                onChange(options.filter((o) => o.id !== option.id));
              }}
            />
          ))}
        </SortableGroup>
      </SortableProvider>
      <div className={styles.addRow}>
        <TextInput
          size="xs"
          className={styles.addInput}
          placeholder="Add an option"
          aria-label="New option name"
          value={newName}
          onChange={(e) => {
            setNewName(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <ActionIcon aria-label="Add option" onClick={add} disabled={!newName.trim()}>
          <IconPlus size={14} />
        </ActionIcon>
      </div>
    </div>
  );
}

interface OptionRowProps {
  option: OptionDraft;
  used: number;
  onRename: (name: string) => void;
  onColor: (color: Color) => void;
  onRemove: () => void;
}

function OptionRow({ option, used, onRename, onColor, onRemove }: OptionRowProps) {
  const { setNodeRef, style, handle } = useSortableItem(option.id, 'options');
  return (
    <div ref={setNodeRef} style={style} className={styles.row}>
      <DragHandle handle={handle} label={`Move ${option.name}`} />
      <ColorPicker value={option.color} onChange={onColor} label={`Color of ${option.name}`} />
      <TextInput
        size="xs"
        variant="unstyled"
        className={styles.name}
        aria-label="Option name"
        value={option.name}
        error={!option.name.trim()}
        onChange={(e) => {
          onRename(e.currentTarget.value);
        }}
        style={{ '--chip-bg': `var(--os-${option.color}-bg)` }}
      />
      {used > 0 && (
        <span className={styles.used} title={`Used by ${String(used)} records`}>
          {used}
        </span>
      )}
      <ActionIcon
        color="gray"
        aria-label={`Remove ${option.name}`}
        title={used > 0 ? `Remove (clears it from ${String(used)} records)` : 'Remove'}
        onClick={onRemove}
      >
        <IconX size={14} />
      </ActionIcon>
    </div>
  );
}
