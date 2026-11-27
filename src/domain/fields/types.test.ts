import { describe, expect, it } from 'vitest';
import type { Field, FieldOf, FieldType } from '../schema/types';
import { DEFAULT_SETTINGS } from '../schema/defaults';
import { INVALID, RAW_FORMAT, type FormatContext, type ParseContext } from './model';
import { FIELD_TYPE_ORDER, FIELD_TYPES, fieldType } from './registry';

const stamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
function make<T extends FieldType>(type: T, config?: unknown): FieldOf<T> {
  const base = {
    id: 'fld_test00000001',
    collectionId: 'col_test00000001',
    name: 'F',
    order: 0,
    ...stamps,
  };
  return (config === undefined ? { ...base, type } : { ...base, type, config }) as FieldOf<T>;
}
const display: FormatContext = { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'medium' };
const parseCtx: ParseContext = { locale: 'en-US', today: '2026-11-26' };

/** Parses text and formats the result back (raw), for round-trip checks. */
function roundTrip(field: Field, text: string) {
  const def = fieldType(field);
  const value = def.parse(text, field, parseCtx);
  if (value === undefined || value === INVALID) return value;
  return def.format(value, field, RAW_FORMAT, 'raw');
}

describe('field type registry', () => {
  it('has one definition per type, listed in the menu order', () => {
    expect([...FIELD_TYPE_ORDER].sort()).toEqual(Object.keys(FIELD_TYPES).sort());
    for (const [type, def] of Object.entries(FIELD_TYPES)) expect(def.type).toBe(type);
  });

  it('gives every stored type a default config its own normalizeConfig accepts', () => {
    const ctx = { settings: DEFAULT_SETTINGS, newId: () => 'opt_test00000001' };
    for (const type of FIELD_TYPE_ORDER) {
      if (type === 'link') continue;
      const def = fieldType(type);
      const config = def.defaultConfig(ctx);
      expect(def.normalizeConfig(config, ctx), type).toEqual(config);
    }
  });

  it('round-trips raw text for every stored type', () => {
    const samples: [Field, string][] = [
      [make('text', {}), 'Cafe Luna'],
      [make('richText'), '**bold**\n- item'],
      [make('number', { style: 'decimal', decimals: 2 }), '1234.5'],
      [make('number', { style: 'percent' }), '25%'],
      [make('rating', { max: 5 }), '4'],
      [make('duration', { display: 'h:mm' }), '1:30:15'],
      [make('date', { partial: true }), '2019-07'],
      [make('dateTime'), '2026-11-26 19:30'],
      [make('dateRange', {}), '2026-01-02 – 2026-01-09'],
      [make('checkbox'), 'true'],
      [make('url', {}), 'https://example.com/a?b=c'],
      [make('email'), 'ada@example.com'],
      [make('phone'), '+1 (555) 010-0199'],
      [make('location', { parts: ['city', 'region', 'country'] }), 'Portland, OR, USA'],
    ];
    for (const [field, text] of samples) {
      const once = roundTrip(field, text);
      expect(once, field.type).not.toBe(INVALID);
      expect(roundTrip(field, once as string), field.type).toBe(once);
    }
  });
});

describe('text types', () => {
  it('trims text, joins lines in single-line text and treats blank as empty', () => {
    const single = make('text', {});
    const multi = make('text', { multiline: true });
    expect(fieldType(single).normalize('  a\n b  ', single)).toBe('a b');
    expect(fieldType(multi).normalize('a\nb ', multi)).toBe('a\nb');
    expect(fieldType(single).normalize('   ', single)).toBeUndefined();
    expect(fieldType(single).normalize(3, single)).toBe(INVALID);
    expect(fieldType(single).isValid(' padded', single)).toBe(false);
  });

  it('displays rich text as plain text and keeps the markup raw', () => {
    const rich = make('richText');
    const value = '**Great** dumplings, try the _chili_';
    expect(fieldType(rich).format(value, rich, display, 'display')).toBe(
      'Great dumplings, try the chili',
    );
    expect(fieldType(rich).format(value, rich, RAW_FORMAT, 'raw')).toBe(value);
  });

  it('cleans URLs, emails and phone numbers', () => {
    const url = make('url', {});
    expect(fieldType(url).parse('example.com/x', url, parseCtx)).toBe('https://example.com/x');
    expect(fieldType(url).parse('javascript:alert(1)', url, parseCtx)).toBe(INVALID);
    expect(fieldType(url).format('https://www.example.com/x', url, display, 'display')).toBe(
      'example.com/x',
    );
    const email = make('email');
    expect(fieldType(email).parse('mailto:ada@example.com', email, parseCtx)).toBe(
      'ada@example.com',
    );
    expect(fieldType(email).parse('not an email', email, parseCtx)).toBe(INVALID);
    const phone = make('phone');
    expect(fieldType(phone).parse('call me', phone, parseCtx)).toBe(INVALID);
  });

  it('sorts text naturally and case-insensitively', () => {
    const f = make('text', {});
    const list = ['item 10', 'Item 2', 'apple'];
    expect(list.sort((a, b) => fieldType(f).compare(a, b, f))).toEqual([
      'apple',
      'Item 2',
      'item 10',
    ]);
  });
});

describe('number types', () => {
  it('formats per the number format', () => {
    const fmt = (config: unknown, value: number) => {
      const f = make('number', config);
      return fieldType(f).format(value, f, display, 'display');
    };
    expect(fmt({ style: 'plain' }, 1234.5678)).toBe('1234.5678');
    expect(fmt({ style: 'plain', thousands: true }, 1234.5)).toBe('1,234.5');
    expect(fmt({ style: 'decimal', decimals: 1 }, 2)).toBe('2.0');
    expect(fmt({ style: 'currency', currency: 'EUR', thousands: true }, 1234.5)).toBe('€1,234.50');
    expect(fmt({ style: 'currency' }, 3)).toBe('$3.00');
    expect(fmt({ style: 'percent', decimals: 1 }, 0.256)).toBe('25.6%');
  });

  it('parses input by the field format and rounds to its decimals', () => {
    const currency = make('number', { style: 'currency', currency: 'USD' });
    expect(fieldType(currency).parse('$1,234.567', currency, parseCtx)).toBe(1234.57);
    const percent = make('number', { style: 'percent' });
    expect(fieldType(percent).parse('25', percent, parseCtx)).toBe(0.25);
    const plain = make('number', { style: 'plain' });
    expect(fieldType(plain).parse('25%', plain, parseCtx)).toBe(0.25);
    expect(fieldType(plain).parse('n/a', plain, parseCtx)).toBe(INVALID);
    expect(fieldType(plain).normalize(Number.NaN, plain)).toBe(INVALID);
  });

  it('keeps ratings within their scale', () => {
    const f = make('rating', { max: 5 });
    expect(fieldType(f).parse('★★★', f, parseCtx)).toBe(3);
    expect(fieldType(f).parse('4/5', f, parseCtx)).toBe(4);
    expect(fieldType(f).parse('6', f, parseCtx)).toBe(INVALID);
    expect(fieldType(f).normalize(0, f)).toBeUndefined();
    expect(fieldType(f).format(2, f, display, 'display')).toBe('★★☆☆☆');
  });

  it('stores durations as seconds', () => {
    const f = make('duration', { display: 'compact' });
    expect(fieldType(f).parse('2h 5m', f, parseCtx)).toBe(7500);
    expect(fieldType(f).format(7500, f, display, 'display')).toBe('2h 5m');
    expect(fieldType(f).normalize(-1, f)).toBe(INVALID);
  });
});

describe('date types', () => {
  it('accepts partial dates only when the field allows them', () => {
    const full = make('date', {});
    const partial = make('date', { partial: true });
    expect(fieldType(full).normalize('2019-07', full)).toBe(INVALID);
    expect(fieldType(partial).normalize('2019-07', partial)).toBe('2019-07');
    expect(fieldType(partial).parse('July 2019', partial, parseCtx)).toBe('2019-07');
    expect(fieldType(partial).format('2019-07', partial, display, 'display')).toBe('Jul 2019');
    expect(fieldType(full).format('2026-11-26', full, display, 'display')).toBe('Nov 26, 2026');
    expect(
      fieldType(full).format('2026-11-26', full, { ...display, dateStyle: 'iso' }, 'display'),
    ).toBe('2026-11-26');
  });

  it('formats date-times as wall-clock time', () => {
    const f = make('dateTime');
    expect(fieldType(f).format('2026-11-26T19:30', f, display, 'display')).toBe(
      'Nov 26, 2026, 7:30 PM',
    );
    expect(fieldType(f).normalize('2026-11-26 19:30', f)).toBe(INVALID);
  });

  it('normalizes ranges and rejects backwards ones', () => {
    const f = make('dateRange', {});
    const def = fieldType(f);
    expect(def.normalize({ start: '2026-01-02', end: '2026-01-02' }, f)).toEqual({
      start: '2026-01-02',
    });
    expect(def.normalize({ start: '2026-01-05', end: '2026-01-02' }, f)).toBe(INVALID);
    expect(def.normalize({ start: '' }, f)).toBeUndefined();
    expect(def.parse('Jan 2 to Jan 9, 2026', f, parseCtx)).toEqual({
      start: '2026-01-02',
      end: '2026-01-09',
    });
    expect(def.parse('2026-01-09 – 2026-01-02', f, parseCtx)).toBe(INVALID);
    expect(def.parse('2026-01-02 - 2026-01-09', f, parseCtx)).toEqual({
      start: '2026-01-02',
      end: '2026-01-09',
    });
    expect(def.isValid({ start: '2026-01-02', end: '2026-01-02' }, f)).toBe(false);
  });
});

describe('select types', () => {
  const options = [
    { id: 'opt_aaaaaaaaaaa1', name: 'Read', color: 'green' as const, order: 1 },
    { id: 'opt_aaaaaaaaaaa0', name: 'To read', color: 'blue' as const, order: 0 },
  ];

  it('stores option ids and reads option names', () => {
    const f = make('singleSelect', { options });
    expect(fieldType(f).parse('to READ', f, parseCtx)).toBe('opt_aaaaaaaaaaa0');
    expect(fieldType(f).parse('Unknown', f, parseCtx)).toBe(INVALID);
    expect(fieldType(f).format('opt_aaaaaaaaaaa1', f, display, 'display')).toBe('Read');
    expect(fieldType(f).normalize('opt_missing00000', f)).toBe(INVALID);
  });

  it('dedupes multi-select values and keeps the options order', () => {
    const f = make('multiSelect', { options });
    const def = fieldType(f);
    expect(def.normalize(['opt_aaaaaaaaaaa1', 'opt_aaaaaaaaaaa0', 'opt_aaaaaaaaaaa1'], f)).toEqual([
      'opt_aaaaaaaaaaa1',
      'opt_aaaaaaaaaaa0',
    ]);
    expect(def.normalize([], f)).toBeUndefined();
    expect(def.parse('Read; To read', f, parseCtx)).toEqual([
      'opt_aaaaaaaaaaa1',
      'opt_aaaaaaaaaaa0',
    ]);
    expect(def.isValid(['opt_aaaaaaaaaaa0', 'opt_aaaaaaaaaaa1'], f)).toBe(false);
  });

  it('sorts by option order, not name', () => {
    const f = make('singleSelect', { options });
    expect(fieldType(f).compare('opt_aaaaaaaaaaa0', 'opt_aaaaaaaaaaa1', f)).toBeLessThan(0);
  });

  it('completes options from user input', () => {
    let n = 0;
    const ctx = {
      settings: DEFAULT_SETTINGS,
      newId: () => `opt_new${String(n++).padStart(9, '0')}`,
    };
    const config = fieldType('singleSelect').normalizeConfig(
      { options: [{ name: ' A ' }, { name: 'B', color: 'red' }] },
      ctx,
    );
    expect(config).toEqual({
      options: [
        { id: 'opt_new000000000', name: 'A', color: 'blue', order: 0 },
        { id: 'opt_new000000001', name: 'B', color: 'red', order: 1 },
      ],
    });
    expect(
      fieldType('singleSelect').normalizeConfig({ options: [{ name: 'a' }, { name: 'A' }] }, ctx),
    ).toMatch(/two options/);
  });
});

describe('other types', () => {
  it('stores checked as true and unchecked as empty', () => {
    const f = make('checkbox');
    expect(fieldType(f).normalize(false, f)).toBeUndefined();
    expect(fieldType(f).parse('yes', f, parseCtx)).toBe(true);
    expect(fieldType(f).parse('no', f, parseCtx)).toBeUndefined();
    expect(fieldType(f).parse('maybe', f, parseCtx)).toBe(INVALID);
  });

  it('fills location parts from comma-separated text', () => {
    const f = make('location', { parts: ['city', 'country'] });
    expect(fieldType(f).parse('Lyon, Rhône, France', f, parseCtx)).toEqual({
      city: 'Lyon',
      country: 'Rhône, France',
    });
    expect(fieldType(f).normalize({ city: '  ', lat: 1 }, f)).toBe(INVALID);
    expect(fieldType(f).normalize({ city: ' Lyon ', lat: 45.76, lng: 4.84 }, f)).toEqual({
      city: 'Lyon',
      lat: 45.76,
      lng: 4.84,
    });
  });

  it('never stores values for links or computed fields', () => {
    for (const type of ['link', 'formula', 'createdTime', 'modifiedTime'] as const) {
      expect(fieldType(type).stored).toBe(false);
      expect(fieldType(type).normalize('x', make(type, {}))).toBe(INVALID);
    }
  });
});
