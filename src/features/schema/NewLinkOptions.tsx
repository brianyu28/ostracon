import { Checkbox, Select, TextInput } from '@mantine/core';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import type { Collection, Id } from '@/domain/schema/types';
import styles from './FieldEditor.module.scss';

export interface LinkDraft {
  targetCollectionId: Id | null;
  inverseName: string;
  multiple: boolean;
  inverseMultiple: boolean;
  /** One field linking records of this collection both ways (e.g. Friends). */
  symmetric: boolean;
  /** Add a field to the other collection that links back. */
  backlink: boolean;
}

interface NewLinkOptionsProps {
  collection: Collection;
  collections: readonly Collection[];
  draft: LinkDraft;
  onChange: (draft: LinkDraft) => void;
}

/** Options for a new link field: what it links to and the paired field on the other side. */
export function NewLinkOptions({ collection, collections, draft, onChange }: NewLinkOptionsProps) {
  const target = collections.find((c) => c.id === draft.targetCollectionId);
  const self = target?.id === collection.id;
  const set = (patch: Partial<LinkDraft>) => {
    onChange({ ...draft, ...patch });
  };
  return (
    <div className={styles.linkOptions}>
      <Select
        label="Links to"
        placeholder="Pick a collection"
        searchable
        allowDeselect={false}
        data={collections.map((c) => ({ value: c.id, label: c.name }))}
        value={draft.targetCollectionId}
        leftSection={
          target ? <CollectionIcon icon={target.icon} color={target.color} size={15} /> : null
        }
        onChange={(id) => {
          set({ targetCollectionId: id, symmetric: false });
        }}
      />
      {target && (
        <>
          <Checkbox
            label="Can link to more than one record"
            checked={draft.multiple}
            onChange={(e) => {
              set({ multiple: e.currentTarget.checked });
            }}
          />
          {self && (
            <Checkbox
              label="Same field on both sides (like Friends)"
              checked={draft.symmetric}
              onChange={(e) => {
                set({ symmetric: e.currentTarget.checked });
              }}
            />
          )}
          {!draft.symmetric && (
            <Checkbox
              label={`Add a field to ${target.name} that links back`}
              checked={draft.backlink}
              onChange={(e) => {
                set({ backlink: e.currentTarget.checked });
              }}
            />
          )}
          {!draft.symmetric && draft.backlink && (
            <>
              <TextInput
                label={`Field in ${target.name}`}
                placeholder={collection.name}
                value={draft.inverseName}
                onChange={(e) => {
                  set({ inverseName: e.currentTarget.value });
                }}
              />
              <Checkbox
                label={`Each ${target.name} record can be linked from more than one`}
                checked={draft.inverseMultiple}
                onChange={(e) => {
                  set({ inverseMultiple: e.currentTarget.checked });
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
