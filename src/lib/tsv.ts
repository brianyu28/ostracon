/**
 * Tab-separated text as spreadsheets put it on the clipboard: cells with tabs, line breaks or
 * quotes are quoted ("…", with "" for a quote). Reading accepts both quoted and bare cells.
 */

function quote(cell: string): string {
  return /[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Serializes rows of cells. */
export function toTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(quote).join('\t')).join('\n');
}

/** Parses clipboard text into rows of cells. A trailing line break doesn't add a row. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  while (i < text.length) {
    const ch = text[i] as string;
    if (atCellStart && ch === '"') {
      // Quoted cell: runs to the closing quote; "" is a literal quote.
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < text.length) {
        const c = text[j] as string;
        if (c === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += c;
        j++;
      }
      const next = text[j];
      if (closed && (next === undefined || next === '\t' || next === '\n' || next === '\r')) {
        cell = value;
        i = j;
        atCellStart = false;
        continue;
      }
      // Not a well-formed quoted cell: read it as plain text.
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
    } else {
      cell += ch;
      atCellStart = false;
    }
    i++;
  }
  if (!atCellStart || cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
