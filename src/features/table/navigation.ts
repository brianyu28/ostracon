/** Where the cell cursor goes for a navigation key (pure; indexes into the visible grid). */

export interface GridPos {
  row: number;
  col: number;
}

export interface NavKey {
  key: string;
  mod: boolean;
  shift?: boolean;
}

/**
 * The next position for a key, or null when the key isn't a navigation key. Arrows move one
 * cell (with ⌘/Ctrl to the edge), Home/End go to the row's ends (with ⌘/Ctrl to the grid's
 * corners), Page Up/Down move a page, and Tab/Shift+Tab move across, wrapping between rows.
 */
export function navigate(
  pos: GridPos,
  { key, mod, shift = false }: NavKey,
  size: { rows: number; cols: number },
  pageRows: number,
): GridPos | null {
  const lastRow = Math.max(0, size.rows - 1);
  const lastCol = Math.max(0, size.cols - 1);
  const clamp = (row: number, col: number): GridPos => ({
    row: Math.min(lastRow, Math.max(0, row)),
    col: Math.min(lastCol, Math.max(0, col)),
  });
  switch (key) {
    case 'ArrowUp':
      return clamp(mod ? 0 : pos.row - 1, pos.col);
    case 'ArrowDown':
      return clamp(mod ? lastRow : pos.row + 1, pos.col);
    case 'ArrowLeft':
      return clamp(pos.row, mod ? 0 : pos.col - 1);
    case 'ArrowRight':
      return clamp(pos.row, mod ? lastCol : pos.col + 1);
    case 'Home':
      return mod ? clamp(0, 0) : clamp(pos.row, 0);
    case 'End':
      return mod ? clamp(lastRow, lastCol) : clamp(pos.row, lastCol);
    case 'PageUp':
      return clamp(pos.row - pageRows, pos.col);
    case 'PageDown':
      return clamp(pos.row + pageRows, pos.col);
    case 'Tab':
      if (shift) {
        if (pos.col > 0) return { row: pos.row, col: pos.col - 1 };
        return pos.row > 0 ? { row: pos.row - 1, col: lastCol } : pos;
      }
      if (pos.col < lastCol) return { row: pos.row, col: pos.col + 1 };
      return pos.row < lastRow ? { row: pos.row + 1, col: 0 } : pos;
    default:
      return null;
  }
}
