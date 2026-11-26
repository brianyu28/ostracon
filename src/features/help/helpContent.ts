import type { FieldType } from '@/domain/schema/types';

/** One line per field type for the Help page. */
export const FIELD_HELP: Readonly<Record<FieldType, string>> = {
  text: 'Short text. Can allow line breaks.',
  richText: 'Longer text with **bold**, *italic*, lists, links (Markdown).',
  number: 'Plain, decimal, currency or percent; thousands separators optional.',
  rating: 'Stars, hearts or circles, out of 3–10. Type a digit in a cell.',
  duration: 'Time spans like 1:30 or 1h 30m.',
  date: 'A day; can allow just a month or year (2019, July 2019).',
  dateTime: 'A day and time, no time zone.',
  dateRange: 'Start and end dates (Mar 3 – Mar 9).',
  singleSelect: 'One option from a colored list. Typing a new name adds it.',
  multiSelect: 'Any number of options.',
  checkbox: 'Yes or no.',
  url: 'A web link; can show images as thumbnails.',
  email: 'An email address.',
  phone: 'A phone number.',
  location: 'Place, address, city, region, country (you choose which parts).',
  link: 'Records in another (or the same) collection. See Links.',
  formula: 'Calculated from other fields. See Formulas.',
  createdTime: 'When the record was created. Automatic.',
  modifiedTime: 'When the record was last changed. Automatic.',
};

export const DATE_INPUT = [
  ['today, yesterday, tomorrow', 'Relative days'],
  ['-3d, +2w, -1m, +1y', 'Days, weeks, months, years from today'],
  ['2026-03-14, 3/14/2026, Mar 14', 'Exact dates (order follows your locale)'],
  ['2019, July 2019', 'Partial dates, when the field allows them'],
] as const;

export const OPERATORS = [
  ['+ − * / %', 'Arithmetic (empty counts as 0)'],
  ['&', 'Join as text: {First} & " " & {Last}'],
  ['= != < <= > >=', 'Compare numbers, text or dates'],
  ['and, or, not', 'Combine conditions'],
  ['"text", 12.5, TRUE', 'Literals'],
] as const;

/** Function groups in the order the page lists them. */
export const FUNCTION_GROUPS: readonly [string, readonly string[]][] = [
  ['Logic', ['IF', 'IFS', 'SWITCH', 'AND', 'OR', 'NOT', 'BLANK', 'ISBLANK']],
  ['Text', ['CONCAT', 'LEN', 'LOWER', 'UPPER', 'TRIM', 'LEFT', 'RIGHT', 'CONTAINS']],
  ['Numbers', ['ROUND', 'FLOOR', 'CEIL', 'ABS', 'MIN', 'MAX', 'SUM', 'AVG']],
  [
    'Dates',
    ['TODAY', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'DATE', 'DATEADD', 'DATEDIFF', 'FORMAT_DATE'],
  ],
  ['Links', ['COUNT_LINKS']],
];
