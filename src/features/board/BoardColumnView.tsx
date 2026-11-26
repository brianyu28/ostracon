import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { OptionChip } from '@/components/OptionChip/OptionChip';
import type { FormatContext } from '@/domain/fields/model';
import type { Field, Id, RecordEntity } from '@/domain/schema/types';
import type { BoardColumn } from '@/domain/views/board';
import type { FormulaReader, LinkReader } from '@/features/table/linked';
import { RecordCard } from './RecordCard';
import styles from './BoardView.module.scss';

const PAGE = 100;

interface BoardColumnViewProps {
  column: BoardColumn;
  field: Field;
  cardFields: readonly Field[];
  format: FormatContext;
  links: LinkReader;
  formulas: FormulaReader;
  selected: Id | undefined;
  dragging: Id | null;
  onSelect: (id: Id) => void;
  onOpen: (id: Id) => void;
  onAdd: () => void;
}

/** A column's heading: the option chip, Checked/Unchecked, stars or "No value". */
function ColumnLabel({ field, columnKey }: { field: Field; columnKey: string }) {
  if (field.type === 'checkbox')
    return <span>{columnKey === 'true' ? 'Checked' : 'Unchecked'}</span>;
  if (!columnKey) return <span className={styles.noValue}>No {field.name.toLowerCase()}</span>;
  if (field.type === 'rating') return <span>{'★'.repeat(Number(columnKey))}</span>;
  if (field.type === 'singleSelect') {
    const option = field.config.options.find((o) => o.id === columnKey);
    return option ? <OptionChip color={option.color}>{option.name}</OptionChip> : <span>?</span>;
  }
  return <span>{columnKey}</span>;
}

/** One board column: its cards (a page at a time) and an add button. */
export function BoardColumnView({
  column,
  field,
  cardFields,
  format,
  links,
  formulas,
  selected,
  dragging,
  onSelect,
  onOpen,
  onAdd,
}: BoardColumnViewProps) {
  const [limit, setLimit] = useState(PAGE);
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });
  const shown = column.records.slice(0, limit);
  return (
    <section
      className={clsx(styles.column, isOver && styles.over)}
      aria-label={column.key || 'No value'}
    >
      <header className={styles.columnHeader}>
        <ColumnLabel field={field} columnKey={column.key} />
        <span className={styles.count}>{column.records.length}</span>
        <ActionIcon
          variant="subtle"
          color="gray"
          className={styles.add}
          aria-label="Add a record to this column"
          onClick={onAdd}
        >
          <IconPlus size={14} />
        </ActionIcon>
      </header>
      <div ref={setNodeRef} className={styles.cards}>
        <SortableContext items={shown.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {shown.map((record) => (
            <SortableCard
              key={record.id}
              record={record}
              columnKey={column.key}
              cardFields={cardFields}
              format={format}
              links={links}
              formulas={formulas}
              selected={record.id === selected}
              dragging={record.id === dragging}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
        {column.records.length > limit && (
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => {
              setLimit(limit + PAGE);
            }}
          >
            Show {Math.min(PAGE, column.records.length - limit)} more
          </Button>
        )}
      </div>
    </section>
  );
}

interface SortableCardProps {
  record: RecordEntity;
  columnKey: string;
  cardFields: readonly Field[];
  format: FormatContext;
  links: LinkReader;
  formulas: FormulaReader;
  selected: boolean;
  dragging: boolean;
  onSelect: (id: Id) => void;
  onOpen: (id: Id) => void;
}

function SortableCard({
  record,
  columnKey,
  cardFields,
  format,
  links,
  formulas,
  selected,
  dragging,
  onSelect,
  onOpen,
}: SortableCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: record.id,
    data: { column: columnKey },
  });
  return (
    <RecordCard
      ref={setNodeRef}
      record={record}
      fields={cardFields}
      format={format}
      links={links}
      formulas={formulas}
      selected={selected}
      dragging={dragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      onClick={() => {
        onSelect(record.id);
      }}
      onDoubleClick={() => {
        onOpen(record.id);
      }}
    />
  );
}
