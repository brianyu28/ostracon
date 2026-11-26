/** Evaluates a checked formula for one record. */
import type { Field, Id } from '../schema/types';
import { EvalError, type Node, type RuntimeValue } from './ast';
import { FUNCTIONS, text, truthy } from './functions';

export interface EvalContext {
  today: string;
  /** A field's value inside a formula (computed for formula fields). */
  value: (field: Field) => RuntimeValue;
  /** Ids linked through a link field. */
  linkCount: (field: Field) => number;
  fields: Readonly<Record<Id, Field>>;
}

const asNumber = (v: RuntimeValue): number => (typeof v === 'number' ? v : 0);

function compare(a: RuntimeValue, b: RuntimeValue): number {
  if (a === null || b === null || a === '' || b === '') {
    const x = a === null || a === '' ? 0 : 1;
    const y = b === null || b === '' ? 0 : 1;
    return x - y;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = text(a);
  const y = text(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function evaluate(node: Node, ctx: EvalContext): RuntimeValue {
  switch (node.k) {
    case 'num':
    case 'str':
    case 'bool':
      return node.v;
    case 'field': {
      const field = ctx.fields[node.ref];
      return field ? ctx.value(field) : null;
    }
    case 'unary': {
      const v = evaluate(node.arg, ctx);
      if (node.op === 'not') return !truthy(v);
      return v === null ? null : -asNumber(v);
    }
    case 'bin': {
      if (node.op === 'and')
        return truthy(evaluate(node.left, ctx)) && truthy(evaluate(node.right, ctx));
      if (node.op === 'or')
        return truthy(evaluate(node.left, ctx)) || truthy(evaluate(node.right, ctx));
      const a = evaluate(node.left, ctx);
      const b = evaluate(node.right, ctx);
      switch (node.op) {
        case '&':
          return text(a) + text(b);
        case '=':
          return compare(a, b) === 0;
        case '!=':
          return compare(a, b) !== 0;
        case '<':
          return compare(a, b) < 0;
        case '<=':
          return compare(a, b) <= 0;
        case '>':
          return compare(a, b) > 0;
        case '>=':
          return compare(a, b) >= 0;
        default: {
          if (a === null && b === null) return null;
          const x = asNumber(a);
          const y = asNumber(b);
          switch (node.op) {
            case '+':
              return x + y;
            case '-':
              return x - y;
            case '*':
              return x * y;
            case '/':
              if (y === 0) throw new EvalError('Division by zero');
              return x / y;
            default:
              if (y === 0) throw new EvalError('Division by zero');
              return x % y;
          }
        }
      }
    }
    case 'call': {
      const args = node.args;
      switch (node.name) {
        case 'IF': {
          const [cond, then, otherwise] = args;
          if (!cond || !then) return null;
          return truthy(evaluate(cond, ctx))
            ? evaluate(then, ctx)
            : otherwise
              ? evaluate(otherwise, ctx)
              : null;
        }
        case 'IFS':
          for (let i = 0; i + 1 < args.length; i += 2)
            if (truthy(evaluate(args[i] as Node, ctx))) return evaluate(args[i + 1] as Node, ctx);
          return null;
        case 'SWITCH': {
          const [subject, ...cases] = args;
          if (!subject) return null;
          const value = evaluate(subject, ctx);
          for (let i = 0; i + 1 < cases.length; i += 2)
            if (compare(value, evaluate(cases[i] as Node, ctx)) === 0)
              return evaluate(cases[i + 1] as Node, ctx);
          return cases.length % 2 === 1 ? evaluate(cases[cases.length - 1] as Node, ctx) : null;
        }
        case 'AND':
          return args.every((a) => truthy(evaluate(a, ctx)));
        case 'OR':
          return args.some((a) => truthy(evaluate(a, ctx)));
        case 'COUNT_LINKS': {
          const arg = args[0];
          const field = arg?.k === 'field' ? ctx.fields[arg.ref] : undefined;
          return field ? ctx.linkCount(field) : 0;
        }
      }
      const def = FUNCTIONS.get(node.name);
      if (!def) throw new EvalError(`Unknown function ${node.name}`);
      const result = def.run(
        args.map((a) => evaluate(a, ctx)),
        ctx,
      );
      if (typeof result === 'number' && !Number.isFinite(result))
        throw new EvalError('Not a number');
      return result;
    }
  }
}
