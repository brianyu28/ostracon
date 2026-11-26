/** Durations as whole seconds: parsing ("1:30", "2h 15m", "90m") and display. */

export type DurationDisplay = 'h:mm' | 'h:mm:ss' | 'compact';

const UNIT_SECONDS: Record<string, number> = {
  d: 86_400,
  day: 86_400,
  days: 86_400,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
};

/**
 * Parses "1:30" (h:mm), "1:30:15" (h:mm:ss), "2h 15m", "1.5h", "90 min", "45s". A bare number
 * means minutes. Returns whole seconds, or null when the text isn't a duration.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const clock = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 60);
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let total = 0;
  let consumed = '';
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const unit = UNIT_SECONDS[m[2] ?? ''];
    if (unit === undefined) return null;
    total += Number(m[1]) * unit;
    consumed += m[0];
  }
  // Everything except spaces and commas must have been part of a number + unit pair.
  if (!consumed || consumed.replace(/\s/g, '') !== text.replace(/[\s,]/g, '')) return null;
  return Math.round(total);
}

export function formatDuration(seconds: number, display: DurationDisplay = 'h:mm'): string {
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (display) {
    case 'h:mm':
      // Seconds round to the nearest minute.
      return `${sign}${String(Math.floor(Math.round(abs / 60) / 60))}:${pad(Math.round(abs / 60) % 60)}`;
    case 'h:mm:ss':
      return `${sign}${String(h)}:${pad(m)}:${pad(s)}`;
    case 'compact': {
      const parts: string[] = [];
      if (h) parts.push(`${String(h)}h`);
      if (m) parts.push(`${String(m)}m`);
      if (s || parts.length === 0) parts.push(`${String(s)}s`);
      return sign + parts.join(' ');
    }
  }
}
