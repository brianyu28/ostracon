/**
 * Formula parser (precedence climbing). From loosest to tightest: `or`, `and`, `not`,
 * comparisons, `&`, `+ -`, `* / %`, unary minus, then literals, fields, calls and parentheses.
 */
import { FormulaError, type BinaryOp, type Node } from './ast';
import { tokenize, type Token } from './tokenize';

const LEVELS: readonly (readonly string[])[] = [
  ['or'],
  ['and'],
  ['=', '!=', '<', '<=', '>', '>='],
  ['&'],
  ['+', '-'],
  ['*', '/', '%'],
];

export function parseFormula(text: string): Node {
  const tokens = tokenize(text);
  let pos = 0;
  const peek = (): Token => tokens[pos] ?? (tokens[tokens.length - 1] as Token);
  const next = (): Token => tokens[pos++] ?? (tokens[tokens.length - 1] as Token);
  const opOf = (tok: Token): string | null =>
    tok.t === 'op'
      ? tok.v
      : tok.t === 'ident' && /^(and|or)$/i.test(tok.v)
        ? tok.v.toLowerCase()
        : null;

  const level = (n: number): Node => {
    if (n === 2) {
      // `not` sits between `and` and the comparisons.
      const tok = peek();
      if (tok.t === 'ident' && tok.v.toLowerCase() === 'not') {
        next();
        return { k: 'unary', op: 'not', arg: level(2), at: tok.at };
      }
    }
    if (n >= LEVELS.length) return unary();
    const ops = LEVELS[n] as readonly string[];
    let left = level(n + 1);
    for (;;) {
      const op = opOf(peek());
      if (!op || !ops.includes(op)) return left;
      const tok = next();
      const right = level(n + 1);
      left = { k: 'bin', op: op as BinaryOp, left, right, at: tok.at };
    }
  };

  const unary = (): Node => {
    const tok = peek();
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      next();
      const arg = unary();
      return tok.v === '-' ? { k: 'unary', op: '-', arg, at: tok.at } : arg;
    }
    return primary();
  };

  const primary = (): Node => {
    const tok = next();
    switch (tok.t) {
      case 'num':
        return { k: 'num', v: tok.v, at: tok.at };
      case 'str':
        return { k: 'str', v: tok.v, at: tok.at };
      case 'field':
        if (!tok.v) throw new FormulaError('Empty field reference', tok.at, tok.end);
        return { k: 'field', ref: tok.v, at: tok.at, end: tok.end };
      case '(': {
        const inner = level(0);
        const close = next();
        if (close.t !== ')') throw new FormulaError('Missing )', close.at);
        return inner;
      }
      case 'ident': {
        const upper = tok.v.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE')
          return { k: 'bool', v: upper === 'TRUE', at: tok.at };
        if (peek().t !== '(')
          throw new FormulaError(
            `“${tok.v}” isn’t a function; field names go in {braces}`,
            tok.at,
            tok.end,
          );
        next();
        const args: Node[] = [];
        if (peek().t !== ')') {
          for (;;) {
            args.push(level(0));
            const sep = next();
            if (sep.t === ')') break;
            if (sep.t !== ',') throw new FormulaError('Expected , or )', sep.at);
          }
        } else next();
        return { k: 'call', name: upper, args, at: tok.at };
      }
      case 'end':
        throw new FormulaError('The formula ends too soon', tok.at);
      default:
        throw new FormulaError('Unexpected symbol', tok.at, tok.end);
    }
  };

  if (peek().t === 'end') throw new FormulaError('The formula is empty', 0);
  const node = level(0);
  const rest = peek();
  if (rest.t !== 'end')
    throw new FormulaError('Unexpected text after the formula', rest.at, rest.end);
  return node;
}
