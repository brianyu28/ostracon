/**
 * CSV (RFC 4180): fields separated by a delimiter, quoted with "…" when they contain the
 * delimiter, quotes or line breaks ("" is a literal quote). Reading detects comma, semicolon or
 * tab from the first line.
 */

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0 || undefined);
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

/** Parses CSV text into rows of cells (blank lines are skipped). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // byte-order mark
  while (i < text.length) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
    i++;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Writes rows as CSV with CRLF line endings (what spreadsheets expect). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(quote).join(',')).join('\r\n');
}
