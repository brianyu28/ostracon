/** Splits formula text into tokens. */
import { FormulaError } from './ast';

export type Token =
  | { t: 'num'; v: number; at: number; end: number }
  | { t: 'str'; v: string; at: number; end: number }
  | { t: 'field'; v: string; at: number; end: number }
  | { t: 'ident'; v: string; at: number; end: number }
  | { t: 'op'; v: string; at: number; end: number }
  | { t: '('; at: number; end: number }
  | { t: ')'; at: number; end: number }
  | { t: ','; at: number; end: number }
  | { t: 'end'; at: number; end: number };

const OPS = ['!=', '<=', '>=', '<>', '+', '-', '*', '/', '%', '&', '=', '<', '>'];

/** Tokens of a formula. `{…}` is a field reference; `\}` inside one is a literal brace. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    if (ch === '{') {
      let ref = '';
      i++;
      while (i < text.length && text[i] !== '}') {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        ref += text[i] ?? '';
        i++;
      }
      if (i >= text.length)
        throw new FormulaError('A field name is missing its closing }', start, i);
      i++;
      tokens.push({ t: 'field', v: ref.trim(), at: start, end: i });
      continue;
    }
    if (ch === '"' || ch === "'") {
      let value = '';
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        value += text[i] ?? '';
        i++;
      }
      if (i >= text.length) throw new FormulaError('Text is missing its closing quote', start, i);
      i++;
      tokens.push({ t: 'str', v: value, at: start, end: i });
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
    if (num) {
      i += num[0].length;
      tokens.push({ t: 'num', v: Number(num[0]), at: start, end: i });
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (ident) {
      i += ident[0].length;
      tokens.push({ t: 'ident', v: ident[0], at: start, end: i });
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      i++;
      tokens.push({ t: ch, at: start, end: i });
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op) {
      i += op.length;
      tokens.push({ t: 'op', v: op === '<>' ? '!=' : op, at: start, end: i });
      continue;
    }
    throw new FormulaError(`Unexpected “${ch}”`, start);
  }
  tokens.push({ t: 'end', at: text.length, end: text.length });
  return tokens;
}
