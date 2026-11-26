/** Locale-aware number parsing for values typed or pasted by people. */

const separatorCache = new Map<string, { group: string; decimal: string }>();

/** The grouping and decimal separators a locale uses ("," and "." for en-US). */
export function numberSeparators(locale = 'en-US'): { group: string; decimal: string } {
  let seps = separatorCache.get(locale);
  if (!seps) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    seps = {
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    };
    separatorCache.set(locale, seps);
  }
  return seps;
}

/**
 * Parses "1,234.5", "$1,234.50", "(12)", "-3", "1.234,5" (de-DE), "25%" (as 25, with
 * `percent: true` in the result). Returns null when the text isn't a number.
 */
export function parseLocaleNumber(
  input: string,
  locale = 'en-US',
): { value: number; percent: boolean } | null {
  let text = input.trim();
  if (!text) return null;
  const percent = text.endsWith('%');
  if (percent) text = text.slice(0, -1).trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const { group, decimal } = numberSeparators(locale);
  // Currency symbols and codes, spaces (incl. narrow no-break spaces used as groupings).
  text = text.replace(/[\s\u00a0\u202f]/g, '').replace(/^[A-Z]{3}|[A-Z]{3}$/g, '');
  text = text.replace(/[^\d.,'+\-eE]/g, '');
  if (group === '.' || group === "'") text = text.split(group).join('');
  else if (group === ',') text = text.replace(/,/g, '');
  if (decimal === ',') text = text.replace(',', '.');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) text = text.slice(1);
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, percent };
}

/** Rounds to a number of decimal places without binary noise (1.005 → 1.01). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}
