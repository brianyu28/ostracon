import type { FormatContext } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import type { Field } from '@/domain/schema/types';
import type { SummaryResult } from '@/domain/views/summaries';
import { formatDate } from '@/lib/date';

function valueText(value: number, field: Field, format: FormatContext): string {
  switch (field.type) {
    case 'number':
      return fieldType(field).format(
        field.config.style === 'plain' ? Math.round(value * 100) / 100 : value,
        field,
        format,
        'display',
      );
    case 'duration':
      return fieldType(field).format(Math.round(value), field, format, 'display');
    default:
      return (Math.round(value * 100) / 100).toLocaleString(format.locale);
  }
}

/** A summary result as text in the field's format ("$1,234.50", "Mar 2 – Jun 9, 2024", "75%"). */
export function summaryText(result: SummaryResult, field: Field, format: FormatContext): string {
  switch (result.kind) {
    case 'count':
      return result.value.toLocaleString(format.locale);
    case 'percent':
      return `${String(Math.round(result.value * 100))}%`;
    case 'value':
      return valueText(result.value, field, format);
    case 'numberRange':
      return `${valueText(result.min, field, format)} – ${valueText(result.max, field, format)}`;
    case 'dates':
      return result.start === result.end
        ? formatDate(result.start, format.locale)
        : `${formatDate(result.start, format.locale)} – ${formatDate(result.end, format.locale)}`;
    case 'none':
      return '–';
  }
}
