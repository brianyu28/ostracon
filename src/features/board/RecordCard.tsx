import { clsx } from 'clsx';
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import type { FormatContext } from '@/domain/fields/model';
import { recordTitle } from '@/domain/records';
import type { Color, Field, RecordEntity } from '@/domain/schema/types';
import { CellValue } from '@/features/table/cells/CellValue';
import type { FormulaReader, LinkReader } from '@/features/table/linked';
import { useDocStore } from '@/store/docStore';
import styles from './RecordCard.module.scss';

interface RecordCardProps extends HTMLAttributes<HTMLDivElement> {
  record: RecordEntity;
  /** Fields shown under the title (empty values are left out). */
  fields: readonly Field[];
  format: FormatContext;
  links: LinkReader;
  formulas: FormulaReader;
  selected?: boolean;
  /** A color stripe (calendar "color by"). */
  color?: Color | undefined;
  /** One line: title only (calendar cells). */
  compact?: boolean;
  /** Shown before the title (a time). */
  prefix?: string | undefined;
  dragging?: boolean;
  style?: CSSProperties;
}

function hasValue(record: RecordEntity, field: Field, links: LinkReader): boolean {
  if (field.type === 'link') return links(record, field).length > 0;
  if (field.type === 'formula' || field.type.endsWith('Time')) return true;
  if (field.type === 'checkbox') return record.values[field.id] === true;
  return field.id in record.values;
}

/** A record as a card: its title and a few fields. Used by boards and calendars. */
export const RecordCard = forwardRef<HTMLDivElement, RecordCardProps>(function RecordCard(
  {
    record,
    fields,
    format,
    links,
    formulas,
    selected,
    color,
    compact,
    prefix,
    dragging,
    className,
    style,
    ...rest
  },
  ref,
) {
  const doc = useDocStore((s) => s.doc);
  if (!doc) return null;
  return (
    <div
      ref={ref}
      className={clsx(
        styles.card,
        compact && styles.compact,
        selected && styles.selected,
        dragging && styles.dragging,
        className,
      )}
      style={{ ...style, ...(color ? { borderLeftColor: `var(--os-${color})` } : {}) }}
      data-colored={color ? true : undefined}
      {...rest}
    >
      <div className={styles.title}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        {recordTitle(doc, record)}
      </div>
      {!compact &&
        fields
          .filter((f) => hasValue(record, f, links))
          .map((f) => (
            <div key={f.id} className={styles.field}>
              <CellValue
                record={record}
                field={f}
                format={format}
                {...(f.type === 'link' ? { links: links(record, f) } : {})}
                {...(f.type === 'formula' ? { formula: formulas(record, f) } : {})}
              />
            </div>
          ))}
    </div>
  );
});
