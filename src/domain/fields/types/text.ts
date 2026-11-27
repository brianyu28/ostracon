/** Text-like field types: text, rich text (Markdown subset), URL, email and phone. */
import type { FieldType, Value } from '../../schema/types';
import { BASIC_SUMMARIES, collator, INVALID, isRecordLike, type FieldTypeDef } from '../model';
import { TEXT_OPERATORS } from '../operators';
import { markdownText } from '@/lib/markdown';

const MAX_TEXT = 100_000;

const compareText = (a: Value, b: Value) => collator.compare(a as string, b as string);

/** Shared pieces of every string-valued type. */
function stringType<T extends FieldType>(
  type: T,
  label: string,
  clean: (text: string) => string | null,
): Pick<
  FieldTypeDef<T>,
  | 'type'
  | 'label'
  | 'stored'
  | 'isValid'
  | 'normalize'
  | 'compare'
  | 'parse'
  | 'operators'
  | 'summaries'
> {
  const normalize = (value: unknown) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return INVALID;
    if (!value.trim()) return undefined;
    const cleaned = clean(value);
    return cleaned === null || cleaned.length > MAX_TEXT ? INVALID : cleaned;
  };
  return {
    type,
    label,
    stored: true,
    isValid: (value) => typeof value === 'string' && normalize(value) === value,
    normalize,
    compare: compareText,
    parse: (text) => normalize(text),
    operators: TEXT_OPERATORS,
    summaries: BASIC_SUMMARIES,
  };
}

const noConfig = {
  defaultConfig: () => undefined,
  normalizeConfig: () => undefined,
};

export const textType: FieldTypeDef<'text'> = {
  ...stringType('text', 'Text', (text) => text.trim()),
  canBePrimary: true,
  defaultConfig: () => ({}),
  normalizeConfig: (config) => {
    if (config !== undefined && !isRecordLike(config)) return 'Invalid text options.';
    return config?.multiline === true ? { multiline: true } : {};
  },
  normalize(value, field) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return INVALID;
    // Single-line text keeps pasted line breaks as spaces.
    const text = (field.config.multiline ? value : value.replace(/\s*\r?\n\s*/g, ' ')).trim();
    return text ? text.slice(0, MAX_TEXT) : undefined;
  },
  isValid: (value, field) =>
    typeof value === 'string' &&
    value === value.trim() &&
    value !== '' &&
    (field.config.multiline === true || !value.includes('\n')),
  format: (value) => value as string,
};

export const richTextType: FieldTypeDef<'richText'> = {
  ...stringType('richText', 'Rich text', (text) => text.trimEnd()),
  ...noConfig,
  canBePrimary: false,
  // Display text is the plain text of the Markdown; raw keeps the markup (copy, CSV, editing).
  format: (value, _field, _ctx, style) =>
    style === 'raw' ? (value as string) : markdownText(value as string),
};

/** Adds https:// to bare domains; accepts only http(s) URLs. */
export function cleanUrl(text: string): string | null {
  let url = text.trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
    if (!/^[^\s/]+\.[^\s/]+/.test(url)) return null;
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export const urlType: FieldTypeDef<'url'> = {
  ...stringType('url', 'URL', cleanUrl),
  canBePrimary: false,
  defaultConfig: () => ({}),
  normalizeConfig: (config) => {
    if (config !== undefined && !isRecordLike(config)) return 'Invalid URL options.';
    return config?.display === 'image' ? { display: 'image' } : {};
  },
  format: (value, _field, _ctx, style) =>
    style === 'raw' ? (value as string) : (value as string).replace(/^https?:\/\/(www\.)?/, ''),
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailType: FieldTypeDef<'email'> = {
  ...stringType('email', 'Email', (text) => {
    const email = text.trim().replace(/^mailto:/i, '');
    return EMAIL_RE.test(email) ? email : null;
  }),
  ...noConfig,
  canBePrimary: false,
  format: (value) => value as string,
};

export const phoneType: FieldTypeDef<'phone'> = {
  ...stringType('phone', 'Phone', (text) => {
    const phone = text.trim().replace(/^tel:/i, '');
    return /\d/.test(phone) && /^[\d\s()+\-.x#*/]{1,40}$/i.test(phone) ? phone : null;
  }),
  ...noConfig,
  canBePrimary: false,
  format: (value) => value as string,
};
