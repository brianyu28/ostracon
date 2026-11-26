import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import type { FormatContext } from '@/domain/fields/model';
import type { Field, RecordEntity } from '@/domain/schema/types';
import { CellValue } from './cells/CellValue';
import type { Column } from './columns';
import styles from './TableView.module.scss';

interface TableCellProps {
  record: RecordEntity;
  column: Column;
  colIndex: number;
  rowIndex: number;
  isCursor: boolean;
  inRange: boolean;
  /** The editor, when this cell is being edited. */
  editor: ReactNode;
  format: FormatContext;
  linkTitles: (record: RecordEntity, field: Field) => string[];
  handlers: CellHandlers;
}

export interface CellHandlers {
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onMouseEnter: (row: number, col: number) => void;
  onDoubleClick: (row: number, col: number) => void;
  onSet: (record: RecordEntity, field: Field, value: unknown) => void;
}

function isEmpty(record: RecordEntity, field: Field, links: string[] | undefined): boolean {
  if (field.type === 'link') return !links?.length;
  return !(field.id in record.values);
}

/** One table cell: the formatted value, the cursor and range highlight, or the editor. */
export function TableCell({
  record,
  column,
  colIndex,
  rowIndex,
  isCursor,
  inRange,
  editor,
  format,
  linkTitles,
  handlers,
}: TableCellProps) {
  const { field, width, primary, left } = column;
  const links = field.type === 'link' ? linkTitles(record, field) : undefined;
  const missing = field.required === true && isEmpty(record, field, links);
  return (
    <div
      role="gridcell"
      aria-selected={isCursor || inRange}
      className={clsx(
        styles.cell,
        primary && styles.primary,
        isCursor && styles.cursor,
        inRange && styles.inRange,
        editor !== null && styles.editing,
        missing && styles.missing,
      )}
      style={{ width, ...(primary ? { left } : {}) }}
      onMouseDown={(e) => {
        handlers.onMouseDown(rowIndex, colIndex, e);
      }}
      onMouseEnter={() => {
        handlers.onMouseEnter(rowIndex, colIndex);
      }}
      onDoubleClick={() => {
        handlers.onDoubleClick(rowIndex, colIndex);
      }}
    >
      {editor ?? (
        <CellValue
          record={record}
          field={field}
          format={format}
          {...(links ? { linkTitles: links } : {})}
          {...(field.type === 'checkbox' || field.type === 'rating'
            ? {
                onSet: (value: unknown) => {
                  handlers.onSet(record, field, value);
                },
              }
            : {})}
        />
      )}
    </div>
  );
}
