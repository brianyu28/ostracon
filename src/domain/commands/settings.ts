import type { FileSettings } from '../schema/types';
import { CommandError, defineCommand } from './define';

function validLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export const updateSettings = defineCommand<Partial<FileSettings>>({
  label: 'Change settings',
  run(draft, changes) {
    // The same rules as the file schema: a bad locale or currency would make formatting throw.
    if (changes.locale !== undefined && !validLocale(changes.locale))
      throw new CommandError('Invalid locale.');
    if (changes.defaultCurrency !== undefined && !/^[A-Z]{3}$/.test(changes.defaultCurrency))
      throw new CommandError('Invalid currency code.');
    Object.assign(draft.settings, changes);
  },
});
