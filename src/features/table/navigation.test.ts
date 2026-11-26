import { describe, expect, it } from 'vitest';
import { navigate } from './navigation';

const size = { rows: 10, cols: 4 };
const go = (row: number, col: number, key: string, mod = false, shift = false) =>
  navigate({ row, col }, { key, mod, shift }, size, 3);

describe('navigate', () => {
  it('moves with arrows and stops at the edges', () => {
    expect(go(0, 0, 'ArrowDown')).toEqual({ row: 1, col: 0 });
    expect(go(0, 0, 'ArrowUp')).toEqual({ row: 0, col: 0 });
    expect(go(5, 3, 'ArrowRight')).toEqual({ row: 5, col: 3 });
    expect(go(5, 1, 'ArrowDown', true)).toEqual({ row: 9, col: 1 });
    expect(go(5, 1, 'ArrowLeft', true)).toEqual({ row: 5, col: 0 });
  });

  it('jumps with Home/End and pages', () => {
    expect(go(5, 2, 'Home')).toEqual({ row: 5, col: 0 });
    expect(go(5, 2, 'End', true)).toEqual({ row: 9, col: 3 });
    expect(go(5, 2, 'PageDown')).toEqual({ row: 8, col: 2 });
    expect(go(1, 2, 'PageUp')).toEqual({ row: 0, col: 2 });
  });

  it('wraps Tab between rows', () => {
    expect(go(2, 3, 'Tab')).toEqual({ row: 3, col: 0 });
    expect(go(3, 0, 'Tab', false, true)).toEqual({ row: 2, col: 3 });
    expect(go(0, 0, 'Tab', false, true)).toEqual({ row: 0, col: 0 });
    expect(go(1, 1, 'x')).toBeNull();
  });
});
