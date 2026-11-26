import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { memo, type CSSProperties } from 'react';
import type { FormatContext } from '@/domain/fields/model';
import type { View } from '@/domain/schema/types';
import type { ViewContext } from '@/domain/views/filter';
import type { RecordGroup } from '@/domain/views/groups';
import { summarize } from '@/domain/views/summaries';
import { summaryText } from '@/features/views/summaryText';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { GUTTER_WIDTH, type Column } from './columns';
import { GroupLabel } from './GroupLabel';
import styles from './TableView.module.scss';

interface GroupRowProps {
  group: RecordGroup;
  collapsed: boolean;
  view: View;
  columns: readonly Column[];
  width: number;
  context: ViewContext;
  format: FormatContext;
  style: CSSProperties;
}

/** A group's header: click to collapse; shows the count and the view's summaries. */
export const GroupRow = memo(function GroupRow({
  group,
  collapsed,
  view,
  columns,
  width,
  context,
  format,
  style,
}: GroupRowProps) {
  const field = useDocStore((s) => (view.group ? s.doc?.fields[view.group.fieldId] : undefined));
  if (!view.group || !field) return null;
  const setting = view.group;
  const toggle = () => {
    const current = new Set(setting.collapsed ?? []);
    if (current.has(group.key)) current.delete(group.key);
    else current.add(group.key);
    const rest = { ...setting };
    delete rest.collapsed;
    tryRun('updateView', {
      id: view.id,
      changes: { group: current.size ? { ...rest, collapsed: [...current] } : rest },
    });
  };
  const [first, ...rest] = columns;
  const summaries = view.summaries ?? {};
  return (
    <div className={styles.groupRow} style={{ ...style, width }} role="row">
      <button
        type="button"
        className={styles.groupTitle}
        style={{ width: GUTTER_WIDTH + (first?.width ?? 0) }}
        onClick={toggle}
        aria-expanded={!collapsed}
        tabIndex={-1}
      >
        {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
        <span className={styles.groupLabel}>
          <GroupLabel field={field} group={group} setting={setting} format={format} />
        </span>
        <span className={styles.groupCount}>{group.records.length}</span>
      </button>
      {rest.map((column) => {
        const summary = summaries[column.field.id];
        return (
          <div key={column.field.id} className={styles.groupCell} style={{ width: column.width }}>
            {summary &&
              summaryText(
                summarize(summary, group.records, column.field, context),
                column.field,
                format,
              )}
          </div>
        );
      })}
    </div>
  );
});
