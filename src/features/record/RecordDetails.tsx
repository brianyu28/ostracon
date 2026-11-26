import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { IconMapPin, IconPencil } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Link } from 'wouter';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { Markdown } from '@/components/Markdown/Markdown';
import { getRecord } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import { locationText } from '@/domain/fields/types/other';
import type { Field, Id, LocationValue, RecordEntity } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useParseContext } from '@/hooks/useParseContext';
import { mapsUrl } from '@/lib/maps';
import { useDocStore } from '@/store/docStore';
import { applyEdit } from '@/features/table/applyEdit';
import { useReaders } from '@/features/table/useReaders';
import { CellValue } from '@/features/table/cells/CellValue';
import { timestampText } from '@/features/table/cells/timestamp';
import { hasEditor } from '@/features/table/editors/hasEditor';
import { ValueEditor } from '@/features/table/editors/ValueEditor';
import { recordPath } from '@/app/routes';
import styles from './RecordDetails.module.scss';

interface RecordDetailsProps {
  record: RecordEntity;
  /** Larger title and wider layout on the record page. */
  variant: 'panel' | 'page';
}

/** Every field of a record, in schema order, each editable in place. */
export function RecordDetails({ record, variant }: RecordDetailsProps) {
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.indexVersion);
  const format = useFormatContext();
  const parse = useParseContext();
  const [editing, setEditing] = useState<Id | null>(null);
  const { formulas } = useReaders();
  if (!doc) return null;
  const collection = doc.collections[record.collectionId];
  if (!collection) return null;
  const fields = collectionFields(doc.fields, record.collectionId);
  const primary = doc.fields[collection.primaryFieldId];

  const linked = (field: Field) =>
    field.type === 'link' && index
      ? index
          .linked(field, record.id)
          .map((id) => getRecord(doc, field.config.targetCollectionId, id))
          .filter((r) => r !== undefined)
      : [];

  const editor = (field: Field) => (
    <ValueEditor
      field={field}
      value={field.type === 'link' ? linked(field).map((r) => r.id) : record.values[field.id]}
      recordId={record.id}
      variant="panel"
      format={format}
      parse={parse}
      settings={doc.settings}
      onCommit={(change) => {
        if (change) applyEdit(record.collectionId, record.id, field, change, parse);
        setEditing(null);
      }}
      onCancel={() => {
        setEditing(null);
      }}
    />
  );

  const value = (field: Field) => {
    if (editing === field.id) return editor(field);
    if (field.type === 'link') {
      const records = linked(field);
      return (
        <div className={clsx(styles.links, field.required && !records.length && styles.missing)}>
          {records.map((r) => (
            <Link key={r.id} href={recordPath(r.collectionId, r.id)} className={styles.linkChip}>
              {recordTitle(doc, r)}
            </Link>
          ))}
          <UnstyledButton
            className={styles.linkAdd}
            aria-label={`Edit ${field.name}`}
            onClick={() => {
              setEditing(field.id);
            }}
          >
            {records.length ? (
              <IconPencil size={13} />
            ) : (
              <span className={styles.placeholder}>Add…</span>
            )}
          </UnstyledButton>
        </div>
      );
    }
    // Checkboxes and ratings are set by clicking the value itself.
    const editable = hasEditor(field.type) && field.type !== 'rating';
    const empty = !(field.id in record.values) && !field.type.endsWith('Time');
    const shown =
      field.type === 'richText' && typeof record.values[field.id] === 'string' ? (
        <Markdown text={record.values[field.id] as string} />
      ) : (
        <CellValue
          record={record}
          field={field}
          format={format}
          wrap
          {...(field.type === 'formula' ? { formula: formulas(record, field) } : {})}
          {...(field.type === 'checkbox' || field.type === 'rating'
            ? {
                onSet: (v: unknown) => {
                  applyEdit(
                    record.collectionId,
                    record.id,
                    field,
                    { kind: 'value', value: v },
                    parse,
                  );
                },
              }
            : {})}
        />
      );
    if (!editable) return <div className={styles.static}>{shown}</div>;
    const location =
      field.type === 'location' && !empty ? (record.values[field.id] as LocationValue) : undefined;
    const button = (
      <UnstyledButton
        className={clsx(styles.valueButton, field.required && empty && styles.missing)}
        onClick={() => {
          setEditing(field.id);
        }}
        aria-label={`Edit ${field.name}`}
      >
        {empty ? <span className={styles.placeholder}>Empty</span> : shown}
      </UnstyledButton>
    );
    if (!location) return button;
    return (
      <div className={styles.withAction}>
        {button}
        <Tooltip label="Open in maps">
          <ActionIcon
            component="a"
            href={mapsUrl({ text: locationText(location), ...location })}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            aria-label="Open in maps"
          >
            <IconMapPin size={15} />
          </ActionIcon>
        </Tooltip>
      </div>
    );
  };

  return (
    <div className={clsx(styles.root, variant === 'page' && styles.page)}>
      {primary && (
        <div className={styles.title}>
          {editing === primary.id ? (
            editor(primary)
          ) : (
            <UnstyledButton
              className={styles.titleButton}
              onClick={() => {
                if (hasEditor(primary.type)) setEditing(primary.id);
              }}
              aria-label={`Edit ${primary.name}`}
            >
              {recordTitle(doc, record)}
            </UnstyledButton>
          )}
        </div>
      )}
      <dl className={styles.fields}>
        {fields
          .filter((f) => f.id !== collection.primaryFieldId)
          .map((field) => (
            <div key={field.id} className={styles.field}>
              <dt className={styles.label} title={field.description}>
                <FieldTypeIcon type={field.type} className={styles.icon} />
                <span>{field.name}</span>
              </dt>
              <dd className={styles.value}>{value(field)}</dd>
            </div>
          ))}
      </dl>
      <div className={styles.meta}>
        Created {timestampText(record.createdAt, true, format)} · Modified{' '}
        {timestampText(record.updatedAt, true, format)}
      </div>
    </div>
  );
}
