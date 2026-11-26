import { Select, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import type { Collection, Id } from '@/domain/schema/types';
import { TEMPLATES } from '@/domain/templates/catalog';
import type { Template } from '@/domain/templates/model';
import styles from './Templates.module.scss';

interface TemplateGalleryProps {
  collections: readonly Collection[];
  onPick: (template: Template) => void;
  onCopy: (collectionId: Id) => void;
}

/** Templates to start from (searchable), and copying another collection's fields. */
export function TemplateGallery({ collections, onPick, onCopy }: TemplateGalleryProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? TEMPLATES.filter((t) =>
        `${t.name} ${t.description} ${t.keywords ?? ''} ${t.log?.label ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    : TEMPLATES;
  return (
    <div className={styles.gallery}>
      <TextInput
        placeholder="Search templates"
        aria-label="Search templates"
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
        }}
      />
      <div className={styles.grid} role="list">
        {shown.map((t) => (
          <UnstyledButton
            key={t.key}
            role="listitem"
            className={styles.tile}
            onClick={() => {
              onPick(t);
            }}
          >
            <CollectionIcon
              icon={t.collection.icon}
              color={t.collection.color}
              size={18}
              stroke={1.75}
            />
            <span className={styles.tileText}>
              <span className={styles.tileName}>{t.name}</span>
              <span className={styles.tileDescription}>{t.description}</span>
            </span>
          </UnstyledButton>
        ))}
        {shown.length === 0 && <span className={styles.none}>No templates match</span>}
      </div>
      {collections.length > 0 && (
        <Select
          label="Or copy the fields of"
          placeholder="Pick a collection"
          data={collections.map((c) => ({ value: c.id, label: c.name }))}
          value={null}
          onChange={(id) => {
            if (id) onCopy(id);
          }}
        />
      )}
    </div>
  );
}
