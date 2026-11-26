/**
 * Formulas are stored with field ids (`{fld_…}`) so renaming a field doesn't break them, and
 * edited with names (`{Name}`).
 */
import type { Field, Id } from '../schema/types';
import { tokenize } from './tokenize';

/** `}` and `\` inside a reference are escaped. */
export function fieldRef(name: string): string {
  return `{${name.replace(/[\\}]/g, (c) => `\\${c}`)}}`;
}

function replaceRefs(text: string, map: (ref: string) => string | undefined): string {
  let tokens;
  try {
    tokens = tokenize(text);
  } catch {
    return text; // left as typed; checking reports the problem
  }
  let out = '';
  let last = 0;
  for (const tok of tokens) {
    if (tok.t !== 'field') continue;
    const replacement = map(tok.v);
    if (replacement === undefined) continue;
    out += text.slice(last, tok.at) + replacement;
    last = tok.end;
  }
  return out + text.slice(last);
}

/** Editing text → stored text: field names become ids (unknown names stay, for an error). */
export function toStored(display: string, fields: readonly Field[]): string {
  const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
  const ids = new Set(fields.map((f) => f.id));
  return replaceRefs(display, (ref) => {
    if (ids.has(ref)) return undefined;
    const id = byName.get(ref.toLowerCase());
    return id ? `{${id}}` : undefined;
  });
}

/** Stored text with field ids replaced (e.g. after copying fields under new ids). */
export function remapRefs(stored: string, id: (old: Id) => Id): string {
  return replaceRefs(stored, (ref) => {
    const next = id(ref);
    return next === ref ? undefined : `{${next}}`;
  });
}

/** Stored text → editing text: ids become names. */
export function toDisplay(stored: string, fields: Readonly<Record<Id, Field>>): string {
  return replaceRefs(stored, (ref) => {
    const field = fields[ref];
    return field ? fieldRef(field.name) : undefined;
  });
}
