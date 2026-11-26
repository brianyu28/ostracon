/**
 * Short random IDs with a type prefix, e.g. "rec_3fK9a2LmQx7B". The prefix makes data
 * files readable and helps catch mixed-up references. 12 base62 chars ≈ 71 bits.
 */
export const ID_PREFIXES = {
  file: 'fil',
  device: 'dev',
  collection: 'col',
  field: 'fld',
  view: 'viw',
  record: 'rec',
  option: 'opt',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type Id = string;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LENGTH = 12;

export function newId(kind: IdKind): Id {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  let out = '';
  // 62 doesn't divide 256 evenly; the tiny modulo bias is irrelevant for identifiers.
  for (const b of bytes) out += ALPHABET.charAt(b % 62);
  return `${ID_PREFIXES[kind]}_${out}`;
}

export function idKind(id: Id): IdKind | undefined {
  const prefix = id.slice(0, id.indexOf('_'));
  return (Object.keys(ID_PREFIXES) as IdKind[]).find((k) => ID_PREFIXES[k] === prefix);
}
