import { useMemo } from 'react';
import { getRecord } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Field, RecordEntity, View } from '@/domain/schema/types';
import { evaluateView, type ViewResult } from '@/domain/views/evaluate';
import type { ViewContext } from '@/domain/views/filter';
import { useFormatContext } from '@/hooks/useFormatContext';
import { today as todayDate } from '@/lib/date';
import { docStore, useDocStore } from '@/store/docStore';
import { useTable } from '@/features/table/tableStore';

/**
 * The current view's records, filtered, searched, sorted and grouped. Recomputed when the
 * collection's records or links change (its index version), the view or fields change, the
 * search changes, or the day turns over.
 */
export function useViewResult(view: View | undefined): ViewResult & { context: ViewContext } {
  const collectionId = view?.collectionId ?? '';
  const version = useDocStore((s) => s.index?.collectionVersion(collectionId) ?? 0);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const fields = useDocStore((s) => s.doc?.fields);
  const weekStartsOn = useDocStore((s) => s.doc?.settings.weekStartsOn ?? 0);
  const search = useTable((s) => s.search);
  const format = useFormatContext();
  const today = todayDate();

  const context = useMemo<ViewContext>(
    () => ({
      today,
      weekStartsOn,
      linked: (field, id) => docStore.getState().index?.linked(field, id) ?? [],
    }),
    [today, weekStartsOn],
  );

  const result = useMemo(
    () => evaluate(view, context, search, format, version, indexVersion, fields),
    [view, context, search, format, version, indexVersion, fields],
  );
  return { ...result, context };
}

/** `_version`, `_indexVersion` and `_fields` are cache keys for the memo above. */
function evaluate(
  view: View | undefined,
  context: ViewContext,
  search: string,
  format: ReturnType<typeof useFormatContext>,
  _version: number,
  _indexVersion: number,
  _fields: unknown,
): ViewResult {
  const { doc, index } = docStore.getState();
  if (!doc || !view) return { records: [] };
  const linkTitles = (record: RecordEntity, field: Field) =>
    field.type === 'link' && index
      ? index
          .linked(field, record.id)
          .map((id) => getRecord(doc, field.config.targetCollectionId, id))
          .filter((r) => r !== undefined)
          .map((r) => recordTitle(doc, r))
      : [];
  return evaluateView(doc, view, { ...context, search, format, linkTitles });
}
