import type { FormatContext } from '@/domain/fields/model';

/** Formats a record's timestamp field. */
export function timestampText(iso: string, includeTime: boolean, format: FormatContext): string {
  return new Date(iso).toLocaleString(format.locale, {
    dateStyle: format.dateStyle === 'numeric' ? 'short' : 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  });
}
