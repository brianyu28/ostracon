import { useMemo } from 'react';
import { useFormatContext } from '@/hooks/useFormatContext';
import { today as todayDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';
import { formulaReader, linkReader, type FormulaReader, type LinkReader } from './linked';

/** Readers for linked records and formula results, renewed when the document or links change. */
export function useReaders(): { links: LinkReader; formulas: FormulaReader } {
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const format = useFormatContext();
  const today = todayDate();
  const links = useMemo(() => linkReader(doc, index, indexVersion), [doc, index, indexVersion]);
  const formulas = useMemo(
    () => formulaReader(doc, index, indexVersion, today, format),
    [doc, index, indexVersion, today, format],
  );
  return { links, formulas };
}
