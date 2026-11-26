/**
 * Compiled formulas, cached per version of the document's field map (the map is replaced on any
 * field change, so edits invalidate the cache). Checking a formula follows references into other
 * formulas, which is where cycles are caught.
 */
import type { Field, FieldOf, Id } from '../schema/types';
import { FormulaError, type FormulaType, type Node } from './ast';
import { checkFormula, type CheckInfo } from './check';
import { parseFormula } from './parse';

export type FormulaField = FieldOf<'formula'>;

export type Compiled =
  { ok: true; node: Node; info: CheckInfo } | { ok: false; error: FormulaError };

const cache = new WeakMap<object, Map<Id, Compiled>>();

function compileWith(
  fields: Readonly<Record<Id, Field>>,
  field: FormulaField,
  expression: string,
  visiting: Set<Id>,
): Compiled {
  try {
    const node = parseFormula(expression);
    const formulaType = (other: Field): FormulaType => {
      if (other.type !== 'formula') return 'text';
      if (visiting.has(other.id) || other.id === field.id)
        throw new FormulaError(`“${other.name}” refers back to this formula`, 0, expression.length);
      const result = compileWith(
        fields,
        other,
        other.config.expression,
        new Set([...visiting, field.id]),
      );
      if (!result.ok) throw new FormulaError(`“${other.name}” has an error`, 0, expression.length);
      return result.info.type;
    };
    return { ok: true, node, info: checkFormula(node, fields, field.collectionId, formulaType) };
  } catch (err) {
    if (err instanceof FormulaError) return { ok: false, error: err };
    throw err;
  }
}

/** A formula field's compiled form (cached). */
export function compileField(fields: Readonly<Record<Id, Field>>, field: FormulaField): Compiled {
  let byId = cache.get(fields);
  if (!byId) cache.set(fields, (byId = new Map<Id, Compiled>()));
  let compiled = byId.get(field.id);
  if (!compiled) {
    compiled = compileWith(fields, field, field.config.expression, new Set());
    byId.set(field.id, compiled);
  }
  return compiled;
}

/** Checks an expression for a field before saving it (not cached). */
export function checkExpression(
  fields: Readonly<Record<Id, Field>>,
  field: FormulaField,
  expression: string,
): Compiled {
  return compileWith(
    { ...fields, [field.id]: { ...field, config: { ...field.config, expression } } },
    field,
    expression,
    new Set(),
  );
}

/** A formula field's result type, or undefined when it has an error. */
export function formulaResultType(
  fields: Readonly<Record<Id, Field>>,
  field: FormulaField,
): FormulaType | undefined {
  const compiled = compileField(fields, field);
  return compiled.ok ? compiled.info.type : undefined;
}
