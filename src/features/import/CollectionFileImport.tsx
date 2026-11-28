import { Alert, Button, Checkbox, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { countRecords, type DocModel } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryDispatch } from '@/store/actions';
import styles from './ImportDialog.module.scss';

/** A loaded Ostraca file (a collection export or a whole document) to copy collections from. */
export interface CollectionSource {
  model: DocModel;
  name: string;
  /** Schema version the file was saved with, when it had to be upgraded. */
  upgradedFrom?: number | undefined;
  issues: number;
}

/** Choosing which collections of an Ostraca file to add to this document. */
export function CollectionFileImport({
  source,
  onBack,
  onClose,
}: {
  source: CollectionSource;
  onBack: () => void;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const collections = useMemo(
    () => Object.values(source.model.collections).sort((a, b) => a.order - b.order),
    [source],
  );
  const [picked, setPicked] = useState<ReadonlySet<Id>>(
    () => new Set(collections.map((c) => c.id)),
  );

  /** Collections a picked one links to that aren't picked: those links are left out. */
  const leftOut = useMemo(() => {
    const names = new Set<string>();
    for (const f of Object.values(source.model.fields)) {
      if (f.type !== 'link' || !picked.has(f.collectionId)) continue;
      const target = source.model.collections[f.config.targetCollectionId];
      if (target && !picked.has(target.id)) names.add(target.name);
    }
    return [...names];
  }, [source, picked]);

  const run = () => {
    const result = tryDispatch('importCollections', {
      source: source.model,
      collectionIds: collections.filter((c) => picked.has(c.id)).map((c) => c.id),
    });
    if (!result) return;
    toastWithUndo(
      `Imported ${pluralize(result.collectionIds.length, 'collection')} · ${pluralize(result.records, 'record')}`,
    );
    onClose();
    const first = result.collectionIds[0];
    if (first) navigate(collectionPath(first));
  };

  return (
    <div className={styles.step}>
      <div className={styles.source}>
        {source.name}
        {source.upgradedFrom !== undefined &&
          ` · upgraded from format v${String(source.upgradedFrom)}`}
      </div>
      <div className={styles.collections}>
        {collections.map((c) => (
          <Checkbox
            key={c.id}
            checked={picked.has(c.id)}
            onChange={(e) => {
              const next = new Set(picked);
              if (e.currentTarget.checked) next.add(c.id);
              else next.delete(c.id);
              setPicked(next);
            }}
            label={
              <span className={styles.collectionLabel}>
                <CollectionIcon icon={c.icon} color={c.color} size={14} />
                {c.name}
                <span className={styles.count}>
                  {pluralize(countRecords(source.model, c.id), 'record')}
                </span>
              </span>
            }
          />
        ))}
      </div>
      {leftOut.length > 0 && (
        <div className={styles.note}>Links to {leftOut.join(', ')} are left out.</div>
      )}
      {source.issues > 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} p="xs">
          {pluralize(source.issues, 'problem')} found in the file; affected data may be incomplete.
        </Alert>
      )}
      <Group justify="space-between">
        <Button variant="subtle" color="gray" onClick={onBack}>
          Back
        </Button>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0} onClick={run}>
            Import {pluralize(picked.size, 'collection')}
          </Button>
        </Group>
      </Group>
    </div>
  );
}
