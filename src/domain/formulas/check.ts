/**
 * Static checking: a formula's result type, the fields it reads and whether it depends on
 * today's date or on links. Errors carry their position for the editor.
 */
import type { Field, Id } from '../schema/types';
import { FormulaError, type FormulaType, type Node } from './ast';
import { FUNCTIONS, type ParamKind } from './functions';

export interface CheckInfo {
  type: FormulaType;
  /** Fields read directly. */
  deps: Set<Id>;
  usesToday: boolean;
  /** Reads links (COUNT_LINKS or a link field's titles), so it changes when links do. */
  usesLinks: boolean;
}

/** What a field's value is inside a formula. */
export function fieldValueType(
  field: Field,
  formulaType: (field: Field) => FormulaType,
): FormulaType {
  switch (field.type) {
    case 'number':
    case 'rating':
    case 'duration':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'date':
    case 'dateTime':
    case 'dateRange':
    case 'createdTime':
    case 'modifiedTime':
      return 'date';
    case 'formula':
      return formulaType(field);
    default:
      return 'text';
  }
}

const describe = (t: FormulaType) => (t === 'blank' ? 'empty' : t);

/**
 * Checks a parsed formula. `fields` are the collection's fields by id; `formulaType` gives
 * another formula's result type (and throws on a cycle).
 */
export function checkFormula(
  node: Node,
  fields: Readonly<Record<Id, Field>>,
  collectionId: Id,
  formulaType: (field: Field) => FormulaType,
): CheckInfo {
  const info: CheckInfo = { type: 'blank', deps: new Set(), usesToday: false, usesLinks: false };
  const visit = (n: Node): FormulaType => {
    switch (n.k) {
      case 'num':
        return 'number';
      case 'str':
        return 'text';
      case 'bool':
        return 'boolean';
      case 'field': {
        const field = fields[n.ref];
        if (field?.collectionId !== collectionId)
          throw new FormulaError(`Unknown field “${n.ref}”`, n.at, n.end);
        info.deps.add(field.id);
        if (field.type === 'link') info.usesLinks = true;
        return fieldValueType(field, formulaType);
      }
      case 'unary': {
        const t = visit(n.arg);
        if (n.op === 'not') return 'boolean';
        if (t !== 'number' && t !== 'blank')
          throw new FormulaError(`Can’t negate ${describe(t)}`, n.at);
        return 'number';
      }
      case 'bin': {
        const a = visit(n.left);
        const b = visit(n.right);
        switch (n.op) {
          case '&':
            return 'text';
          case 'and':
          case 'or':
            return 'boolean';
          case '=':
          case '!=':
            if (a !== b && a !== 'blank' && b !== 'blank')
              throw new FormulaError(`Can’t compare ${describe(a)} with ${describe(b)}`, n.at);
            return 'boolean';
          case '<':
          case '<=':
          case '>':
          case '>=':
            if ((a !== b && a !== 'blank' && b !== 'blank') || a === 'boolean')
              throw new FormulaError(`Can’t compare ${describe(a)} with ${describe(b)}`, n.at);
            return 'boolean';
          default:
            for (const t of [a, b])
              if (t !== 'number' && t !== 'blank')
                throw new FormulaError(
                  `${n.op} needs numbers${t === 'text' ? '; use & to join text' : ''}`,
                  n.at,
                );
            return 'number';
        }
      }
      case 'call': {
        const def = FUNCTIONS.get(n.name);
        if (!def) throw new FormulaError(`Unknown function ${n.name}`, n.at, n.at + n.name.length);
        const min = def.min ?? def.params.length;
        if (n.args.length < min || (!def.variadic && n.args.length > def.params.length))
          throw new FormulaError(
            `${n.name} takes ${def.signature.slice(n.name.length)}`,
            n.at,
            n.at + n.name.length,
          );
        if (n.name === 'TODAY') info.usesToday = true;
        if (n.name === 'COUNT_LINKS') {
          const arg = n.args[0];
          const field = arg?.k === 'field' ? fields[arg.ref] : undefined;
          if (arg?.k !== 'field' || field?.type !== 'link' || field.collectionId !== collectionId)
            throw new FormulaError('COUNT_LINKS takes a link field, like {Visits}', n.at);
          info.deps.add(field.id);
          info.usesLinks = true;
          return 'number';
        }
        const types = n.args.map((arg, i) => {
          const t = visit(arg);
          const kind: ParamKind = def.params[Math.min(i, def.params.length - 1)] ?? 'any';
          if (kind !== 'any' && kind !== 'cond' && t !== kind && t !== 'blank')
            throw new FormulaError(`${n.name} expects ${kind} here, not ${describe(t)}`, arg.at);
          return t;
        });
        const result = def.returns(types);
        if (typeof result === 'object') throw new FormulaError(result.error, n.at);
        return result;
      }
    }
  };
  info.type = visit(node);
  return info;
}
