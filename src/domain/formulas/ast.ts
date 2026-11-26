/** Formula syntax tree and result types. */

/** What a formula (or part of one) evaluates to. `blank` is BLANK(): it fits any type. */
export type FormulaType = 'number' | 'text' | 'date' | 'boolean' | 'blank';

export type Node =
  | { k: 'num'; v: number; at: number }
  | { k: 'str'; v: string; at: number }
  | { k: 'bool'; v: boolean; at: number }
  /** A field reference: `{fld_…}` stored, `{Name}` while editing. */
  | { k: 'field'; ref: string; at: number; end: number }
  | { k: 'call'; name: string; args: Node[]; at: number }
  | { k: 'unary'; op: '-' | 'not'; arg: Node; at: number }
  | { k: 'bin'; op: BinaryOp; left: Node; right: Node; at: number };

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '&' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';

/** A problem in a formula, with where it is (a character offset in the expression). */
export class FormulaError extends Error {
  readonly at: number;
  readonly end: number;
  constructor(message: string, at: number, end: number = at + 1) {
    super(message);
    this.name = 'FormulaError';
    this.at = at;
    this.end = end;
  }
}

/** A value while evaluating: dates are ISO date strings (the static type says which). */
export type RuntimeValue = number | string | boolean | null;

/** Thrown while evaluating (division by zero, bad dates); the cell shows #ERR. */
export class EvalError extends Error {}
