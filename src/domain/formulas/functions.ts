/**
 * The function library: each function's parameters, result type and implementation. Adding a
 * function is one entry here (the editor's autocomplete lists them too).
 */
import {
  addDays,
  addMonths,
  dateParts,
  dayOfWeek,
  diffDays,
  isISODate,
  makeDate,
  formatDate,
} from '@/lib/date';
import { EvalError, type FormulaType, type RuntimeValue } from './ast';

/** A parameter: a type, `any` (converted as needed) or `cond` (any value, read as true/false). */
export type ParamKind = FormulaType | 'any' | 'cond';

export interface FunctionDef {
  name: string;
  /** Shown in autocomplete, e.g. `ROUND(number, places)`. */
  signature: string;
  description: string;
  params: readonly ParamKind[];
  /** The last parameter repeats. */
  variadic?: boolean;
  /** Fewest arguments (default: all params). */
  min?: number;
  /** The result type from the argument types (or an error message). */
  returns: (args: readonly FormulaType[]) => FormulaType | { error: string };
  run: (args: readonly RuntimeValue[], ctx: { today: string }) => RuntimeValue;
}

const num = (v: RuntimeValue): number => (typeof v === 'number' ? v : v === null ? 0 : Number(v));
export const text = (v: RuntimeValue): string =>
  v === null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
export const truthy = (v: RuntimeValue): boolean =>
  v !== null && v !== false && v !== 0 && v !== '';
const date = (v: RuntimeValue): string | null => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !isISODate(v)) throw new EvalError('Not a date');
  return v;
};
const fixed = (type: FormulaType) => () => type;

/** Types that must agree (IF branches, SWITCH results): blanks fit anything. */
export function unify(types: readonly FormulaType[]): FormulaType | { error: string } {
  const real = [...new Set(types.filter((t) => t !== 'blank'))];
  if (real.length === 0) return 'blank';
  if (real.length === 1) return real[0] as FormulaType;
  return { error: `The results have different types (${real.join(' and ')})` };
}

type Unit = 'days' | 'weeks' | 'months' | 'years';
function unitOf(v: RuntimeValue): Unit {
  const u = text(v).toLowerCase().replace(/s?$/, 's');
  if (u === 'days' || u === 'weeks' || u === 'months' || u === 'years') return u;
  throw new EvalError('Unit must be days, weeks, months or years');
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2026, i, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
);
const DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 1 + i)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }),
);

/** Formats a date with YYYY, YY, MMMM, MMM, MM, M, DD, D, dddd, ddd tokens. */
function formatPattern(iso: string, pattern: string): string {
  const { year, month, day } = dateParts(iso);
  const weekday = DAY_NAMES[dayOfWeek(iso)] ?? '';
  const monthName = MONTH_NAMES[month - 1] ?? '';
  return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, (t) => {
    switch (t) {
      case 'YYYY':
        return String(year);
      case 'YY':
        return String(year).slice(-2);
      case 'MMMM':
        return monthName;
      case 'MMM':
        return monthName.slice(0, 3);
      case 'MM':
        return String(month).padStart(2, '0');
      case 'M':
        return String(month);
      case 'DD':
        return String(day).padStart(2, '0');
      case 'D':
        return String(day);
      case 'dddd':
        return weekday;
      default:
        return weekday.slice(0, 3);
    }
  });
}

const DEFS: FunctionDef[] = [
  // Logic (IF, IFS, SWITCH, AND, OR evaluate their arguments lazily: see evaluate.ts)
  {
    name: 'IF',
    signature: 'IF(condition, then, else)',
    description: 'One value or another.',
    params: ['cond', 'any', 'any'],
    min: 2,
    returns: (a) => unify(a.slice(1)),
    run: (a) => (truthy(a[0] ?? null) ? (a[1] ?? null) : (a[2] ?? null)),
  },
  {
    name: 'IFS',
    signature: 'IFS(condition, value, condition, value, …)',
    description: 'The value of the first true condition.',
    params: ['cond', 'any'],
    variadic: true,
    min: 2,
    returns: (a) => unify(a.filter((_, i) => i % 2 === 1)),
    run: () => null,
  },
  {
    name: 'SWITCH',
    signature: 'SWITCH(value, match, result, …, default)',
    description: 'The result for the first match.',
    params: ['any', 'any', 'any'],
    variadic: true,
    min: 3,
    returns: (a) =>
      unify(
        a
          .slice(1)
          .filter((_, i, all) => i % 2 === 1 || (all.length % 2 === 1 && i === all.length - 1)),
      ),
    run: () => null,
  },
  {
    name: 'AND',
    signature: 'AND(a, b, …)',
    description: 'True when all are true.',
    params: ['cond'],
    variadic: true,
    min: 1,
    returns: fixed('boolean'),
    run: (a) => a.every(truthy),
  },
  {
    name: 'OR',
    signature: 'OR(a, b, …)',
    description: 'True when any is true.',
    params: ['cond'],
    variadic: true,
    min: 1,
    returns: fixed('boolean'),
    run: (a) => a.some(truthy),
  },
  {
    name: 'NOT',
    signature: 'NOT(value)',
    description: 'The opposite.',
    params: ['cond'],
    returns: fixed('boolean'),
    run: (a) => !truthy(a[0] ?? null),
  },
  {
    name: 'BLANK',
    signature: 'BLANK()',
    description: 'An empty value.',
    params: [],
    returns: fixed('blank'),
    run: () => null,
  },
  {
    name: 'ISBLANK',
    signature: 'ISBLANK(value)',
    description: 'True when empty.',
    params: ['any'],
    returns: fixed('boolean'),
    run: (a) => a[0] === null || a[0] === '',
  },
  // Text
  {
    name: 'CONCAT',
    signature: 'CONCAT(a, b, …)',
    description: 'Joins text.',
    params: ['any'],
    variadic: true,
    min: 1,
    returns: fixed('text'),
    run: (a) => a.map(text).join(''),
  },
  {
    name: 'LEN',
    signature: 'LEN(text)',
    description: 'Number of characters.',
    params: ['any'],
    returns: fixed('number'),
    run: (a) => text(a[0] ?? null).length,
  },
  {
    name: 'LOWER',
    signature: 'LOWER(text)',
    description: 'Lower case.',
    params: ['any'],
    returns: fixed('text'),
    run: (a) => text(a[0] ?? null).toLowerCase(),
  },
  {
    name: 'UPPER',
    signature: 'UPPER(text)',
    description: 'Upper case.',
    params: ['any'],
    returns: fixed('text'),
    run: (a) => text(a[0] ?? null).toUpperCase(),
  },
  {
    name: 'TRIM',
    signature: 'TRIM(text)',
    description: 'Without surrounding spaces.',
    params: ['any'],
    returns: fixed('text'),
    run: (a) => text(a[0] ?? null).trim(),
  },
  {
    name: 'LEFT',
    signature: 'LEFT(text, count)',
    description: 'The first characters.',
    params: ['any', 'number'],
    returns: fixed('text'),
    run: (a) => text(a[0] ?? null).slice(0, Math.max(0, num(a[1] ?? 0))),
  },
  {
    name: 'RIGHT',
    signature: 'RIGHT(text, count)',
    description: 'The last characters.',
    params: ['any', 'number'],
    returns: fixed('text'),
    run: (a) => {
      const s = text(a[0] ?? null);
      const n = Math.max(0, num(a[1] ?? 0));
      return n ? s.slice(-n) : '';
    },
  },
  {
    name: 'CONTAINS',
    signature: 'CONTAINS(text, search)',
    description: 'True when the text contains the search (any case).',
    params: ['any', 'any'],
    returns: fixed('boolean'),
    run: (a) =>
      text(a[0] ?? null)
        .toLowerCase()
        .includes(text(a[1] ?? null).toLowerCase()),
  },
  // Numbers
  {
    name: 'ROUND',
    signature: 'ROUND(number, places)',
    description: 'Rounded to some decimal places.',
    params: ['number', 'number'],
    min: 1,
    returns: fixed('number'),
    run: (a) => {
      if (a[0] === null) return null;
      const p = 10 ** num(a[1] ?? 0);
      return Math.round(num(a[0] ?? 0) * p) / p;
    },
  },
  {
    name: 'FLOOR',
    signature: 'FLOOR(number)',
    description: 'Rounded down.',
    params: ['number'],
    returns: fixed('number'),
    run: (a) => (a[0] === null ? null : Math.floor(num(a[0] ?? 0))),
  },
  {
    name: 'CEIL',
    signature: 'CEIL(number)',
    description: 'Rounded up.',
    params: ['number'],
    returns: fixed('number'),
    run: (a) => (a[0] === null ? null : Math.ceil(num(a[0] ?? 0))),
  },
  {
    name: 'ABS',
    signature: 'ABS(number)',
    description: 'Without its sign.',
    params: ['number'],
    returns: fixed('number'),
    run: (a) => (a[0] === null ? null : Math.abs(num(a[0] ?? 0))),
  },
  {
    name: 'MIN',
    signature: 'MIN(a, b, …)',
    description: 'The smallest.',
    params: ['number'],
    variadic: true,
    min: 1,
    returns: fixed('number'),
    run: (a) => {
      const ns = a.filter((v) => v !== null).map(num);
      return ns.length ? Math.min(...ns) : null;
    },
  },
  {
    name: 'MAX',
    signature: 'MAX(a, b, …)',
    description: 'The largest.',
    params: ['number'],
    variadic: true,
    min: 1,
    returns: fixed('number'),
    run: (a) => {
      const ns = a.filter((v) => v !== null).map(num);
      return ns.length ? Math.max(...ns) : null;
    },
  },
  {
    name: 'SUM',
    signature: 'SUM(a, b, …)',
    description: 'The total.',
    params: ['number'],
    variadic: true,
    min: 1,
    returns: fixed('number'),
    run: (a) => a.reduce<number>((s, v) => s + num(v), 0),
  },
  {
    name: 'AVG',
    signature: 'AVG(a, b, …)',
    description: 'The average of the non-empty values.',
    params: ['number'],
    variadic: true,
    min: 1,
    returns: fixed('number'),
    run: (a) => {
      const ns = a.filter((v) => v !== null).map(num);
      return ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : null;
    },
  },
  // Dates
  {
    name: 'TODAY',
    signature: 'TODAY()',
    description: 'Today’s date.',
    params: [],
    returns: fixed('date'),
    run: (_a, ctx) => ctx.today,
  },
  {
    name: 'YEAR',
    signature: 'YEAR(date)',
    description: 'The year.',
    params: ['date'],
    returns: fixed('number'),
    run: (a) => {
      const d = date(a[0] ?? null);
      return d ? dateParts(d).year : null;
    },
  },
  {
    name: 'MONTH',
    signature: 'MONTH(date)',
    description: 'The month (1–12).',
    params: ['date'],
    returns: fixed('number'),
    run: (a) => {
      const d = date(a[0] ?? null);
      return d ? dateParts(d).month : null;
    },
  },
  {
    name: 'DAY',
    signature: 'DAY(date)',
    description: 'The day of the month.',
    params: ['date'],
    returns: fixed('number'),
    run: (a) => {
      const d = date(a[0] ?? null);
      return d ? dateParts(d).day : null;
    },
  },
  {
    name: 'WEEKDAY',
    signature: 'WEEKDAY(date)',
    description: 'The day of the week (0 = Sunday).',
    params: ['date'],
    returns: fixed('number'),
    run: (a) => {
      const d = date(a[0] ?? null);
      return d ? dayOfWeek(d) : null;
    },
  },
  {
    name: 'DATE',
    signature: 'DATE(year, month, day)',
    description: 'A date from its parts.',
    params: ['number', 'number', 'number'],
    returns: fixed('date'),
    run: (a) => {
      const d = makeDate(num(a[0] ?? 0), num(a[1] ?? 1), num(a[2] ?? 1));
      if (!isISODate(d)) throw new EvalError('Not a date');
      return d;
    },
  },
  {
    name: 'DATEADD',
    signature: 'DATEADD(date, count, "days")',
    description: 'A date moved by days, weeks, months or years.',
    params: ['date', 'number', 'text'],
    returns: fixed('date'),
    run: (a) => {
      const d = date(a[0] ?? null);
      if (!d) return null;
      const n = Math.trunc(num(a[1] ?? 0));
      const unit = unitOf(a[2] ?? null);
      if (unit === 'days') return addDays(d, n);
      if (unit === 'weeks') return addDays(d, n * 7);
      return addMonths(d, unit === 'months' ? n : n * 12);
    },
  },
  {
    name: 'DATEDIFF',
    signature: 'DATEDIFF(start, end, "days")',
    description: 'Whole days, weeks, months or years from start to end.',
    params: ['date', 'date', 'text'],
    min: 2,
    returns: fixed('number'),
    run: (a) => {
      const s = date(a[0] ?? null);
      const e = date(a[1] ?? null);
      if (!s || !e) return null;
      const unit = a[2] === undefined ? 'days' : unitOf(a[2]);
      if (unit === 'days') return diffDays(s, e);
      if (unit === 'weeks') return Math.trunc(diffDays(s, e) / 7);
      const x = dateParts(s);
      const y = dateParts(e);
      let months = (y.year - x.year) * 12 + (y.month - x.month);
      if (months > 0 && y.day < x.day) months--;
      if (months < 0 && y.day > x.day) months++;
      return unit === 'months' ? months : Math.trunc(months / 12);
    },
  },
  {
    name: 'FORMAT_DATE',
    signature: 'FORMAT_DATE(date, "MMM D, YYYY")',
    description: 'A date as text (YYYY, MM, MMM, MMMM, D, DD, ddd, dddd).',
    params: ['date', 'text'],
    min: 1,
    returns: fixed('text'),
    run: (a) => {
      const d = date(a[0] ?? null);
      if (!d) return null;
      return a[1] === undefined ? formatDate(d) : formatPattern(d, text(a[1]));
    },
  },
  // Links (the argument must be a link field: checked in check.ts)
  {
    name: 'COUNT_LINKS',
    signature: 'COUNT_LINKS({Link field})',
    description: 'How many records are linked.',
    params: ['any'],
    returns: fixed('number'),
    run: () => 0,
  },
];

export const FUNCTIONS: ReadonlyMap<string, FunctionDef> = new Map(DEFS.map((d) => [d.name, d]));
