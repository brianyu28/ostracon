import { Button, Checkbox, Group, Modal, Radio, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { countRecords } from '@/domain/model';
import type { Collection, Id } from '@/domain/schema/types';
import { linkedCollections } from '@/domain/transfer';
import { pluralize } from '@/lib/format';
import { useDocStore } from '@/store/docStore';
import { uiStore, useUi } from '@/store/uiStore';
import { exportCollectionFile } from './exporters';
import styles from './ExportCollectionDialog.module.scss';

/**
 * Exports a collection that links to others: on its own (its links to them are dropped) or
 * with the linked collections, so an import elsewhere keeps the links.
 */
export function ExportCollectionDialog() {
  const target = useUi((s) => s.exporting);
  const collection = useDocStore((s) =>
    target ? s.doc?.collections[target.collectionId] : undefined,
  );
  const close = () => {
    uiStore.setState({ exporting: null });
  };
  return (
    <Modal opened={collection !== undefined} onClose={close} title="Export collection">
      {collection && <ExportBody key={collection.id} collection={collection} onClose={close} />}
    </Modal>
  );
}

function ExportBody({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const linked = useMemo(() => {
    if (!doc) return [];
    return [...linkedCollections(doc, collection.id)]
      .map(([id, distance]) => ({ collection: doc.collections[id], distance }))
      .filter((c): c is { collection: Collection; distance: number } => c.collection !== undefined)
      .sort((a, b) => a.distance - b.distance || a.collection.order - b.collection.order);
  }, [doc, collection.id]);
  const [withLinked, setWithLinked] = useState(true);
  // Directly linked collections are included by default; ones further away are offered.
  const [picked, setPicked] = useState<ReadonlySet<Id>>(
    () => new Set(linked.filter((l) => l.distance === 1).map((l) => l.collection.id)),
  );

  /** Collections that included ones link to but that are left out (their links are dropped). */
  const dropped = useMemo(() => {
    if (!doc) return [];
    const included = new Set([collection.id, ...(withLinked ? picked : [])]);
    const names = new Set<string>();
    for (const f of Object.values(doc.fields)) {
      if (f.type !== 'link' || !included.has(f.collectionId)) continue;
      const target = doc.collections[f.config.targetCollectionId];
      if (target && !included.has(target.id)) names.add(target.name);
    }
    return [...names];
  }, [doc, collection.id, withLinked, picked]);

  if (!doc) return null;
  const run = () => {
    exportCollectionFile(collection, withLinked ? [...picked] : []);
    onClose();
  };
  const count = (id: Id) => pluralize(countRecords(doc, id), 'record');

  return (
    <Stack gap="sm">
      <Radio.Group
        value={withLinked ? 'linked' : 'only'}
        onChange={(v) => {
          setWithLinked(v === 'linked');
        }}
      >
        <Stack gap="xs">
          <Radio value="linked" label="With linked collections" />
          {withLinked && (
            <div className={styles.collections}>
              {linked.map(({ collection: c }) => (
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
                    <span className={styles.label}>
                      <CollectionIcon icon={c.icon} color={c.color} size={14} />
                      {c.name}
                      <span className={styles.count}>{count(c.id)}</span>
                    </span>
                  }
                />
              ))}
            </div>
          )}
          <Radio value="only" label={`Only ${collection.name}`} />
        </Stack>
      </Radio.Group>
      {dropped.length > 0 && (
        <div className={styles.note}>Links to {dropped.join(', ')} are left out.</div>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={run}>Export</Button>
      </Group>
    </Stack>
  );
}
