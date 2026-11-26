/**
 * The light Markdown subset used by rich text fields, parsed into a small tree that the UI
 * renders as React elements (never as HTML strings).
 *
 * Blocks: paragraphs, `#`–`###` headings, `-`/`*` and `1.` lists (one level), `>` quotes,
 * ``` code blocks and `---` rules. Inline: **bold**, *italic* or _italic_, ~~strike~~,
 * `code`, [text](url) and bare http(s) links. Single line breaks inside a paragraph are kept.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'break' }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'strike'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;

/** Parses Markdown text into blocks. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i] as string)) body.push(lines[i++] as string);
      i++; // closing fence (or end of text)
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1] as string).length as 1 | 2 | 3,
        children: parseInline(heading[2] as string),
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const start = ordered ? Number(ORDERED.exec(line)?.[1] ?? 1) : 1;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = pattern.exec(lines[i] as string);
        if (!m) break;
        items.push(parseInline((ordered ? m[2] : m[1]) ?? ''));
        i++;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const m = QUOTE.exec(lines[i] as string);
        if (!m) break;
        body.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'quote', children: parseInline(body.join('\n')) });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length) {
      const l = lines[i] as string;
      if (
        !l.trim() ||
        FENCE.test(l) ||
        HEADING.test(l) ||
        RULE.test(l) ||
        BULLET.test(l) ||
        ORDERED.test(l) ||
        QUOTE.test(l)
      )
        break;
      body.push(l);
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n')) });
  }
  return blocks;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Parses inline markup. Unmatched markers stay as text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    const rest = text.slice(i);
    if (ch === '\\' && i + 1 < text.length && /[\\`*_~[\]()#>-]/.test(text[i + 1] as string)) {
      buffer += text[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === '\n') {
      flush();
      out.push({ type: 'break' });
      i++;
      continue;
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const delimited = (marker: string, type: 'strong' | 'em' | 'strike'): boolean => {
      if (!rest.startsWith(marker)) return false;
      // Underscores inside words (snake_case) aren't emphasis.
      const intraword = marker[0] === '_';
      if (intraword && /\w/.test(text[i - 1] ?? '')) return false;
      const after = text[i + marker.length];
      if (after === undefined || /\s/.test(after)) return false;
      let end = text.indexOf(marker, i + marker.length);
      while (end !== -1 && /\s/.test(text[end - 1] as string)) end = text.indexOf(marker, end + 1);
      if (end === -1) return false;
      if (intraword && /\w/.test(text[end + marker.length] ?? '')) return false;
      // Single-character markers must not be part of a double one (`**` inside `*…*`).
      if (marker.length === 1 && text[end + 1] === marker) return false;
      flush();
      out.push({ type, children: parseInline(text.slice(i + marker.length, end)) });
      i = end + marker.length;
      return true;
    };
    if (
      delimited('**', 'strong') ||
      delimited('__', 'strong') ||
      delimited('~~', 'strike') ||
      delimited('*', 'em') ||
      delimited('_', 'em')
    )
      continue;
    if (ch === '[') {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m && SAFE_URL.test(m[2] as string)) {
        flush();
        out.push({ type: 'link', href: m[2] as string, children: parseInline(m[1] as string) });
        i += m[0].length;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(rest) && !/\w/.test(text[i - 1] ?? '')) {
      const m = /^https?:\/\/[^\s<>]+/i.exec(rest);
      if (m) {
        // Trailing punctuation belongs to the sentence, not the link.
        const url = m[0].replace(/[.,;:!?)\]'"]+$/, '');
        flush();
        out.push({ type: 'link', href: url, children: [{ type: 'text', text: url }] });
        i += url.length;
        continue;
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  return out;
}

function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((n) =>
      n.type === 'text' || n.type === 'code'
        ? n.text
        : n.type === 'break'
          ? ' '
          : inlineText(n.children),
    )
    .join('');
}

/** Plain text of Markdown, blocks joined by spaces (for cells, search and titles). */
export function markdownText(text: string): string {
  return parseMarkdown(text)
    .map((b) => {
      switch (b.type) {
        case 'code':
          return b.text;
        case 'rule':
          return '';
        case 'list':
          return b.items.map(inlineText).join(' · ');
        default:
          return inlineText(b.children);
      }
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
