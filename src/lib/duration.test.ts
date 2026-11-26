import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from './duration';

describe('parseDuration', () => {
  it('parses clock forms, units and bare minutes', () => {
    expect(parseDuration('1:30')).toBe(5400);
    expect(parseDuration('1:30:15')).toBe(5415);
    expect(parseDuration('2h 15m')).toBe(8100);
    expect(parseDuration('1.5 hours')).toBe(5400);
    expect(parseDuration('90 min')).toBe(5400);
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('1d, 2h')).toBe(93_600);
    expect(parseDuration('90')).toBe(5400);
  });

  it('rejects other text', () => {
    for (const text of ['', 'soon', '1:75', '2 parsecs', '3h ago']) {
      expect(parseDuration(text), text).toBeNull();
    }
  });
});

describe('formatDuration', () => {
  it('formats in each display style', () => {
    expect(formatDuration(8100)).toBe('2:15');
    expect(formatDuration(5415, 'h:mm:ss')).toBe('1:30:15');
    expect(formatDuration(5415, 'compact')).toBe('1h 30m 15s');
    expect(formatDuration(0, 'compact')).toBe('0s');
    expect(formatDuration(89, 'h:mm')).toBe('0:01');
  });
});
