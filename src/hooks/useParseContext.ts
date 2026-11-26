import { useMemo } from 'react';
import type { ParseContext } from '@/domain/fields/model';
import { today } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

/** How typed text is read: the file's locale and today's date (fresh on each call site render). */
export function useParseContext(): ParseContext {
  const locale = useDocStore((s) => s.doc?.settings.locale ?? 'en-US');
  const date = today();
  return useMemo(() => ({ locale, today: date }), [locale, date]);
}
