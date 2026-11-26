import { useMemo } from 'react';
import type { FormatContext } from '@/domain/fields/model';
import { useDocStore } from '@/store/docStore';
import { usePrefs } from '@/store/prefsStore';

/** How values are formatted: the file's locale and currency with this device's date style. */
export function useFormatContext(): FormatContext {
  const locale = useDocStore((s) => s.doc?.settings.locale ?? 'en-US');
  const defaultCurrency = useDocStore((s) => s.doc?.settings.defaultCurrency ?? 'USD');
  const dateStyle = usePrefs((s) => s.dateFormat);
  return useMemo(
    () => ({ locale, defaultCurrency, dateStyle }),
    [locale, defaultCurrency, dateStyle],
  );
}
