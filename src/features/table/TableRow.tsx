import { IconArrowsDiagonal } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { memo, type CSSProperties, type ReactNode } from 'react';
import type { FormatContext } from '@/domain/fields/model';
import type { Field, Id, RecordEntity } from '@/domain/schema/types';
import type { Column } from './columns';
import type { Editing } from './tableStore';
import { TableCell, type CellHandlers } from './TableCell';
import styles from './TableView.module.scss';

export interface RowHandlers extends CellHandlers {
  onCheck: (row: number, e: React.MouseEvent) => void;
  onExpand: (id: Id) => void;
  renderEditor: (record: RecordEntity, field: Field, editing: Editing) => ReactNode;
}

interface TableRowProps {
  record: RecordEntity;
  index: number;
  columns: readonly Column[];
  width: number;
  /** Column index of the cell cursor when it's in this row, else -1. */
  cursorCol: number;
  /** Selected columns when the range covers this row. */
  range: { left: number; right: number } | null;
  /** The cell being edited when it's in this row. */
  editing: Editing | null;
  checked: boolean;
  /** The record shown in the open record panel. */
  active: boolean;
  format: FormatContext;
  linkTitles: (record: RecordEntity, field: Field) => string[];
  handlers: RowHandlers;
  style: CSSProperties;
}

/** A table row: gutter (number, checkbox, expand) and one cell per visible field. */
export const TableRow = memo(function TableRow({
  record,
  index,
  columns,
  width,
  cursorCol,
  range,
  editing,
  checked,
  active,
  format,
  linkTitles,
  handlers,
  style,
}: TableRowProps) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={checked}
      className={clsx(styles.row, checked && styles.checked, active && styles.activeRow)}
      style={{ ...style, width }}
    >
      <div className={styles.gutter}>
        <span className={styles.rowNumber}>{index + 1}</span>
        <input
          type="checkbox"
          className={styles.rowCheck}
          checked={checked}
          aria-label={`Select row ${String(index + 1)}`}
          tabIndex={-1}
          onChange={() => undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handlers.onCheck(index, e);
          }}
        />
        <button
          type="button"
          className={styles.expand}
          aria-label="Open record"
          title="Open record (Space)"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={() => {
            handlers.onExpand(record.id);
          }}
        >
          <IconArrowsDiagonal size={12} />
        </button>
      </div>
      {columns.map((column, col) => (
        <TableCell
          key={column.field.id}
          record={record}
          column={column}
          colIndex={col}
          rowIndex={index}
          isCursor={col === cursorCol}
          inRange={range !== null && col >= range.left && col <= range.right}
          editor={
            editing?.field === column.field.id
              ? handlers.renderEditor(record, column.field, editing)
              : null
          }
          format={format}
          linkTitles={linkTitles}
          handlers={handlers}
        />
      ))}
    </div>
  );
});
