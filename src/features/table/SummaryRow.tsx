import { Menu, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { FormatContext } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import type { RecordEntity, Summary, View } from '@/domain/schema/types';
import type { ViewContext } from '@/domain/views/filter';
import { summarize, SUMMARY_LABELS } from '@/domain/views/summaries';
import { summaryText } from '@/features/views/summaryText';
import { pluralize } from '@/lib/format';
import { tryRun } from '@/store/actions';
import { GUTTER_WIDTH, type Column } from './columns';
import styles from './TableView.module.scss';

interface SummaryRowProps {
  view: View;
  columns: readonly Column[];
  width: number;
  records: readonly RecordEntity[];
  context: ViewContext;
  format: FormatContext;
}

/** The sticky footer: a summary per column, chosen from the column's menu. */
export function SummaryRow({ view, columns, width, records, context, format }: SummaryRowProps) {
  const summaries = view.summaries ?? {};
  const set = (fieldId: string, summary: Summary | null) => {
    const next = { ...summaries };
    if (summary) next[fieldId] = summary;
    else Reflect.deleteProperty(next, fieldId);
    tryRun('updateView', {
      id: view.id,
      changes: { summaries: Object.keys(next).length ? next : undefined },
    });
  };
  return (
    <div className={styles.summaryRow} style={{ width }} role="row">
      <div className={styles.summaryGutter} style={{ width: GUTTER_WIDTH }} />
      {columns.map((column) => {
        const { field } = column;
        const current = summaries[field.id];
        const options = fieldType(field).summaries;
        return (
          <Menu key={field.id} position="top-start" withinPortal>
            <Menu.Target>
              <UnstyledButton
                className={
                  column.primary ? `${styles.summaryCell} ${styles.primary}` : styles.summaryCell
                }
                style={{ width: column.width, ...(column.primary ? { left: column.left } : {}) }}
                tabIndex={-1}
              >
                {current ? (
                  <>
                    <span className={styles.summaryLabel}>{SUMMARY_LABELS[current]}</span>
                    <span className={styles.summaryValue}>
                      {summaryText(summarize(current, records, field, context), field, format)}
                    </span>
                  </>
                ) : column.primary ? (
                  <span className={styles.summaryLabel}>{pluralize(records.length, 'record')}</span>
                ) : (
                  <span className={styles.summaryHint}>Summarize</span>
                )}
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={
                  current ? <span className={styles.menuCheck} /> : <IconCheck size={14} />
                }
                onClick={() => {
                  set(field.id, null);
                }}
              >
                None
              </Menu.Item>
              {options.map((s) => (
                <Menu.Item
                  key={s}
                  leftSection={
                    s === current ? <IconCheck size={14} /> : <span className={styles.menuCheck} />
                  }
                  onClick={() => {
                    set(field.id, s);
                  }}
                >
                  {SUMMARY_LABELS[s]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        );
      })}
    </div>
  );
}
