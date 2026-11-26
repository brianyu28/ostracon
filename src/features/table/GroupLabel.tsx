import { OptionChip } from '@/components/OptionChip/OptionChip';
import type { FormatContext } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import { locationText } from '@/domain/fields/types/other';
import { getRecord } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Field, LocationValue, View } from '@/domain/schema/types';
import type { RecordGroup } from '@/domain/views/groups';
import { formatDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';
import { useReaders } from './useReaders';
import styles from './TableView.module.scss';

interface GroupLabelProps {
  field: Field;
  group: RecordGroup;
  setting: NonNullable<View['group']>;
  format: FormatContext;
}

/** What a group is: option chips, linked titles, a date bucket or the shared value. */
export function GroupLabel({ field, group, setting, format }: GroupLabelProps) {
  const doc = useDocStore((s) => s.doc);
  const { formulas } = useReaders();
  const { key } = group;
  if (field.type === 'checkbox') return <span>{key === 'true' ? 'Checked' : 'Unchecked'}</span>;
  if (key === '') return <span className={styles.groupEmpty}>No {field.name.toLowerCase()}</span>;
  switch (field.type) {
    case 'singleSelect':
    case 'multiSelect':
      return (
        <>
          {key.split(',').map((id) => {
            const option = field.config.options.find((o) => o.id === id);
            return option ? (
              <OptionChip key={id} color={option.color}>
                {option.name}
              </OptionChip>
            ) : null;
          })}
        </>
      );
    case 'link':
      return (
        <span>
          {key
            .split(',')
            .map((id) => {
              const r = doc ? getRecord(doc, field.config.targetCollectionId, id) : undefined;
              return r && doc ? recordTitle(doc, r) : '';
            })
            .filter(Boolean)
            .join(', ')}
        </span>
      );
    case 'number':
    case 'rating':
    case 'duration':
      return <span>{fieldType(field).format(Number(key), field, format, 'display')}</span>;
    case 'date':
    case 'dateTime':
    case 'dateRange':
    case 'createdTime':
    case 'modifiedTime':
      return <span>{dateLabel(key, setting.dateBucket, format.locale)}</span>;
    case 'formula': {
      const sample = group.records[0];
      if (key.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(key))
        return <span>{dateLabel(key, setting.dateBucket, format.locale)}</span>;
      if (/^\d{4}(-\d{2})?$/.test(key) && setting.dateBucket)
        return <span>{dateLabel(key, setting.dateBucket, format.locale)}</span>;
      return <span>{sample ? formulas(sample, field).text || key : key}</span>;
    }
    case 'location': {
      const v = group.records[0]?.values[field.id] as LocationValue | undefined;
      return <span>{v ? (setting.part ? v[setting.part] : locationText(v)) : key}</span>;
    }
    default: {
      const v = group.records[0]?.values[field.id];
      return <span>{typeof v === 'string' ? v : key}</span>;
    }
  }
}

function dateLabel(key: string, bucket: string | undefined, locale: string): string {
  if (key.length === 4) return key;
  if (key.length === 7) return formatDate(`${key}-01`, locale, { month: 'long', year: 'numeric' });
  const date = formatDate(key, locale);
  return bucket === 'week' ? `Week of ${date}` : date;
}
