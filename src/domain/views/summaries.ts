/** Footer and group-header summaries over a set of records. */
import type { Field, RecordEntity, Summary } from '../schema/types';
import { valueSpan } from './dates';
import { isEmpty, type ViewContext } from './filter';

export type SummaryResult =
  | { kind: 'count'; value: number }
  | { kind: 'percent'; value: number }
  /** A value of the field's own type (sums, averages, min, max, numeric ranges). */
  | { kind: 'value'; value: number }
  | { kind: 'numberRange'; min: number; max: number }
  | { kind: 'dates'; start: string; end: string }
  | { kind: 'none' };

export const SUMMARY_LABELS: Readonly<Record<Summary, string>> = {
  count: 'Count',
  filled: 'Filled',
  empty: 'Empty',
  unique: 'Unique',
  percentFilled: 'Percent filled',
  sum: 'Sum',
  average: 'Average',
  median: 'Median',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  earliest: 'Earliest',
  latest: 'Latest',
  checked: 'Checked',
  percentChecked: 'Percent checked',
};

function numbers(records: readonly RecordEntity[], field: Field): number[] {
  const out: number[] = [];
  for (const r of records) {
    const v = r.values[field.id];
    if (typeof v === 'number') out.push(v);
  }
  return out;
}

/** Computes one summary. */
export function summarize(
  summary: Summary,
  records: readonly RecordEntity[],
  field: Field,
  ctx: ViewContext,
): SummaryResult {
  const total = records.length;
  const filledCount = () => records.filter((r) => !isEmpty(r, field, ctx, undefined)).length;
  switch (summary) {
    case 'count':
      return { kind: 'count', value: total };
    case 'filled':
      return { kind: 'count', value: filledCount() };
    case 'empty':
      return { kind: 'count', value: total - filledCount() };
    case 'percentFilled':
      return { kind: 'percent', value: total ? filledCount() / total : 0 };
    case 'unique': {
      const seen = new Set<string>();
      for (const r of records) {
        const v =
          field.type === 'link'
            ? ctx.linked(field, r.id).join(',')
            : JSON.stringify(r.values[field.id] ?? null);
        if (v !== '' && v !== 'null') seen.add(v);
      }
      return { kind: 'count', value: seen.size };
    }
    case 'checked':
      return { kind: 'count', value: records.filter((r) => r.values[field.id] === true).length };
    case 'percentChecked':
      return {
        kind: 'percent',
        value: total ? records.filter((r) => r.values[field.id] === true).length / total : 0,
      };
    case 'sum':
    case 'average':
    case 'median':
    case 'min':
    case 'max':
    case 'range': {
      if (valueSpanField(field)) return dateSummary(summary, records, field);
      const ns = numbers(records, field);
      if (ns.length === 0) return { kind: 'none' };
      if (summary === 'sum') return { kind: 'value', value: ns.reduce((a, b) => a + b, 0) };
      if (summary === 'average')
        return { kind: 'value', value: ns.reduce((a, b) => a + b, 0) / ns.length };
      if (summary === 'median') {
        const sorted = ns.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const value =
          sorted.length % 2
            ? (sorted[mid] ?? 0)
            : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
        return { kind: 'value', value };
      }
      const min = ns.reduce((a, b) => Math.min(a, b));
      const max = ns.reduce((a, b) => Math.max(a, b));
      if (summary === 'min') return { kind: 'value', value: min };
      if (summary === 'max') return { kind: 'value', value: max };
      return { kind: 'numberRange', min, max };
    }
    case 'earliest':
    case 'latest':
      return dateSummary(summary, records, field);
  }
}

function valueSpanField(field: Field): boolean {
  return ['date', 'dateTime', 'dateRange', 'createdTime', 'modifiedTime'].includes(field.type);
}

function dateSummary(
  summary: Summary,
  records: readonly RecordEntity[],
  field: Field,
): SummaryResult {
  let start: string | undefined;
  let end: string | undefined;
  for (const r of records) {
    const span = valueSpan(r, field);
    if (!span) continue;
    if (start === undefined || span.start < start) start = span.start;
    if (end === undefined || span.end > end) end = span.end;
  }
  if (start === undefined || end === undefined) return { kind: 'none' };
  if (summary === 'earliest') return { kind: 'dates', start, end: start };
  if (summary === 'latest') return { kind: 'dates', start: end, end };
  return { kind: 'dates', start, end };
}
