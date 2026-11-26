import { Alert, Button, Checkbox, Group, Modal, Select, Textarea, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconFileUpload } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { toast } from '@/store/toastStore';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import type { ImportColumn } from '@/domain/commands';
import { INVALID } from '@/domain/fields/model';
import { FIELD_TYPE_ORDER, fieldType } from '@/domain/fields/registry';
import { inferType } from '@/domain/import';
import { iterateRecords } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Field, FieldType, Id } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { useParseContext } from '@/hooks/useParseContext';
import { parseCsv } from '@/lib/csv';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryDispatch } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { uiStore, useUi } from '@/store/uiStore';
import styles from './ImportDialog.module.scss';

/** Pasting or parsing more than this in the main thread would freeze the tab. */
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const NEW_TYPES = FIELD_TYPE_ORDER.filter(
  (t) => !['link', 'formula', 'createdTime', 'modifiedTime'].includes(t),
).map((t) => ({ value: t, label: fieldType(t).label }));

interface Mapping {
  /** 'skip', 'primary', 'new' or an existing field id. */
  target: string;
  name: string;
  type: FieldType;
  config?: Record<string, unknown> | undefined;
}

/** CSV import: pick a file or paste, map columns to fields, check the summary, import. */
export function ImportDialog() {
  const target = useUi((s) => s.importing);
  const close = () => {
    uiStore.setState({ importing: null });
  };
  return (
    <Modal opened={target !== null} onClose={close} title="Import CSV" size="xl">
      {target && <ImportBody collectionId={target.collectionId} onClose={close} />}
    </Modal>
  );
}

function ImportBody({
  collectionId,
  onClose,
}: {
  collectionId: Id | undefined;
  onClose: () => void;
}) {
  const doc = useDocStore((s) => s.doc);
  const parse = useParseContext();
  const [, navigate] = useLocation();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState(true);
  const [mappings, setMappings] = useState<Mapping[] | null>(null);
  const [newName, setNewName] = useState('');
  const [createLinks, setCreateLinks] = useState(true);

  const table = useMemo(() => parseCsv(text), [text]);
  const header = headers ? (table[0] ?? []) : [];
  const rows = useMemo(() => (headers ? table.slice(1) : table), [table, headers]);
  const width = Math.max(0, ...table.map((r) => r.length));
  const fields = useMemo(
    () => (doc && collectionId ? collectionFields(doc.fields, collectionId) : []),
    [doc, collectionId],
  );
  const primaryId = collectionId ? doc?.collections[collectionId]?.primaryFieldId : undefined;

  /** Starting mappings: matching field names, else new fields of the inferred type. */
  const initialMappings = (): Mapping[] =>
    Array.from({ length: width }, (_, col) => {
      const name = (header[col] ?? '').trim() || `Column ${String(col + 1)}`;
      const values = rows.map((r) => r[col] ?? '');
      const match = fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (match)
        return { target: match.id === primaryId ? 'primary' : match.id, name, type: match.type };
      if (col === 0 && !collectionId) return { target: 'primary', name, type: 'text' };
      const inferred = inferType(values, parse);
      return { target: 'new', name, type: inferred.type, config: inferred.config };
    });

  const loadFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast('That file is too large to import (the limit is 50 MB).', { kind: 'error' });
      return;
    }
    setFileName(file.name);
    setText(await file.text());
    if (!newName) setNewName(file.name.replace(/\.(csv|tsv|txt)$/i, ''));
    setMappings(null);
  };

  // Dry run: values each column can't read, and link titles that match nothing.
  const problems = useMemo(() => {
    if (!mappings || !doc) return [];
    return mappings.map((m, col) => {
      if (m.target === 'skip') return '';
      const field: Field | undefined =
        m.target === 'new'
          ? ({
              id: 'fld_preview',
              collectionId: '',
              name: m.name,
              order: 0,
              type: m.type,
              config: fieldType(m.type).normalizeConfig(
                m.config ??
                  fieldType(m.type).defaultConfig({ settings: doc.settings, newId: () => 'opt_x' }),
                { settings: doc.settings, newId: () => 'opt_x' },
              ),
              createdAt: '',
              updatedAt: '',
            } as Field)
          : m.target === 'primary'
            ? primaryId
              ? doc.fields[primaryId]
              : undefined
            : doc.fields[m.target];
      if (!field || field.type === 'singleSelect' || field.type === 'multiSelect') return '';
      const values = rows.map((r) => r[col] ?? '').filter((v) => v.trim());
      if (field.type === 'link') {
        const titles = new Set(
          [...iterateRecords(doc, field.config.targetCollectionId)].map((r) =>
            recordTitle(doc, r).toLowerCase(),
          ),
        );
        const missing = new Set(
          values
            .flatMap((v) => (titles.has(v.trim().toLowerCase()) ? [] : v.split(/[,;]/)))
            .map((v) => v.trim())
            .filter((v) => v && !titles.has(v.toLowerCase())),
        );
        return missing.size
          ? `${pluralize(missing.size, 'linked record')} not found${createLinks ? ' (will be created)' : ''}`
          : '';
      }
      const bad = values.filter((v) => fieldType(field).parse(v, field, parse) === INVALID).length;
      return bad
        ? `${pluralize(bad, 'value')} can’t be read as ${fieldType(field).label.toLowerCase()}`
        : '';
    });
  }, [mappings, doc, rows, parse, primaryId, createLinks]);

  if (!doc) return null;

  if (!mappings) {
    return (
      <div className={styles.step}>
        <Group gap="xs">
          <Button component="label" variant="default" leftSection={<IconFileUpload size={14} />}>
            {fileName ?? 'Choose a CSV file'}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </Button>
          <span className={styles.or}>or paste below</span>
        </Group>
        <Textarea
          autosize
          minRows={6}
          maxRows={14}
          classNames={{ input: styles.paste }}
          placeholder={'Name,Date,Status\nCafe Luna,2024-03-14,Visited'}
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setFileName(null);
          }}
        />
        <Checkbox
          label="The first row holds column names"
          checked={headers}
          onChange={(e) => {
            setHeaders(e.currentTarget.checked);
          }}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={rows.length === 0}
            onClick={() => {
              setMappings(initialMappings());
            }}
          >
            Next: {pluralize(rows.length, 'row')}
          </Button>
        </Group>
      </div>
    );
  }

  const set = (col: number, patch: Partial<Mapping>) => {
    setMappings(mappings.map((m, i) => (i === col ? { ...m, ...patch } : m)));
  };
  const targetOptions = [
    {
      value: 'primary',
      label: collectionId ? `${doc.fields[primaryId ?? '']?.name ?? 'Name'} (title)` : 'Title',
    },
    { value: 'new', label: 'New field' },
    ...fields
      .filter((f) => f.id !== primaryId && (fieldType(f).stored || f.type === 'link'))
      .map((f) => ({ value: f.id, label: f.name })),
    { value: 'skip', label: 'Skip' },
  ];
  const hasLinks = mappings.some((m) => doc.fields[m.target]?.type === 'link');
  const primaryUses = mappings.filter((m) => m.target === 'primary').length;

  const run = () => {
    const columns: ImportColumn[] = mappings.map((m) => ({
      target:
        m.target === 'skip'
          ? { kind: 'skip' }
          : m.target === 'primary'
            ? { kind: 'primary', ...(collectionId ? {} : { name: m.name }) }
            : m.target === 'new'
              ? { kind: 'new', name: m.name, type: m.type, config: m.config }
              : { kind: 'field', fieldId: m.target },
    }));
    const result = tryDispatch('importRecords', {
      ...(collectionId ? { collectionId } : { newCollection: { name: newName } }),
      columns,
      rows,
      createMissingLinks: createLinks,
      parse,
    });
    if (!result) return;
    const notes = [
      `Imported ${pluralize(result.created.length, 'record')}`,
      result.invalid ? `${pluralize(result.invalid, 'value')} skipped` : '',
      result.linkedCreated ? `${pluralize(result.linkedCreated, 'linked record')} created` : '',
    ].filter(Boolean);
    toastWithUndo(notes.join(' · '));
    onClose();
    navigate(collectionPath(result.collectionId));
  };

  return (
    <div className={styles.step}>
      {!collectionId && (
        <TextInput
          label="New collection"
          value={newName}
          onChange={(e) => {
            setNewName(e.currentTarget.value);
          }}
        />
      )}
      <div className={styles.columns}>
        {mappings.map((m, col) => (
          <div key={col} className={styles.column}>
            <div className={styles.columnHead}>
              <span className={styles.columnName}>
                {header[col] || `Column ${String(col + 1)}`}
              </span>
              <span className={styles.samples}>
                {rows
                  .slice(0, 3)
                  .map((r) => r[col] ?? '')
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <div className={styles.columnControls}>
              <Select
                size="xs"
                aria-label="Import into"
                allowDeselect={false}
                data={targetOptions}
                value={m.target}
                onChange={(v) => {
                  if (v) set(col, { target: v });
                }}
              />
              {m.target === 'new' && (
                <>
                  <TextInput
                    size="xs"
                    aria-label="New field name"
                    value={m.name}
                    onChange={(e) => {
                      set(col, { name: e.currentTarget.value });
                    }}
                  />
                  <Select
                    size="xs"
                    aria-label="Type"
                    allowDeselect={false}
                    data={NEW_TYPES}
                    value={m.type}
                    leftSection={<FieldTypeIcon type={m.type} />}
                    onChange={(v) => {
                      if (v) set(col, { type: v, config: undefined });
                    }}
                  />
                </>
              )}
            </div>
            {problems[col] && <div className={styles.problem}>{problems[col]}</div>}
          </div>
        ))}
      </div>
      {hasLinks && (
        <Checkbox
          label="Create records for linked titles that match nothing"
          checked={createLinks}
          onChange={(e) => {
            setCreateLinks(e.currentTarget.checked);
          }}
        />
      )}
      {primaryUses > 1 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          Only one column can be the title.
        </Alert>
      )}
      <Group justify="space-between">
        <Button
          variant="default"
          onClick={() => {
            setMappings(null);
          }}
        >
          Back
        </Button>
        <Button disabled={primaryUses > 1 || (!collectionId && !newName.trim())} onClick={run}>
          Import {pluralize(rows.length, 'record')}
        </Button>
      </Group>
    </div>
  );
}
