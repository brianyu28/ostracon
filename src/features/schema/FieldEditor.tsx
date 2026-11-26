import { Alert, Button, Checkbox, Group, Select, Textarea, TextInput } from '@mantine/core';
import { Modal } from '@/components/Modal/Modal';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { planTypeChange, type TypeChangePlan } from '@/domain/fields/convert';
import { FIELD_TYPE_ORDER, fieldType } from '@/domain/fields/registry';
import { iterateRecords } from '@/domain/model';
import { DEFAULT_SETTINGS } from '@/domain/schema/defaults';
import type { Field, FieldType, NumberFormat } from '@/domain/schema/types';
import { useFormatContext } from '@/hooks/useFormatContext';
import { newId } from '@/lib/id';
import { toDisplay, toStored } from '@/domain/formulas/expression';
import { pluralize } from '@/lib/format';
import { toast } from '@/store/toastStore';
import { useDocStore } from '@/store/docStore';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { uiStore, useUi, type FieldEditorTarget } from '@/store/uiStore';
import { BacklinkOptions } from './BacklinkOptions';
import { FormulaEditor } from './FormulaEditor';
import { DeleteFieldDialog } from './DeleteFieldDialog';
import { FieldConfigEditor, type ConfigDraft } from './FieldConfigEditor';
import { NewLinkOptions, type LinkDraft } from './NewLinkOptions';
import styles from './FieldEditor.module.scss';

/** Types a field can be changed to (link fields are only created new). */
const PICKABLE: readonly FieldType[] = FIELD_TYPE_ORDER.filter((t) => t !== 'link');
/** Types offered for a new field. */
const PICKABLE_NEW: readonly FieldType[] = FIELD_TYPE_ORDER;

/** The app-wide field editor dialog, opened through `ui.openFieldEditor`. */
export function FieldEditorDialog() {
  const target = useUi((s) => s.fieldEditor);
  const close = () => {
    uiStore.setState({ fieldEditor: null });
  };
  return (
    <Modal
      opened={target !== null}
      onClose={close}
      title={target?.fieldId ? 'Edit field' : 'Add field'}
      size="md"
    >
      {target && (
        <FieldForm key={target.fieldId ?? target.collectionId} target={target} onClose={close} />
      )}
    </Modal>
  );
}

/** A field's config as edited: formulas show field names instead of ids. */
function configOf(field: Field, fields: Readonly<Record<string, Field>> = {}): ConfigDraft {
  if (field.type === 'formula')
    return {
      ...structuredClone(field.config),
      expression: toDisplay(field.config.expression, fields),
    };
  return 'config' in field ? structuredClone(field.config) : {};
}

function FieldForm({ target, onClose }: { target: FieldEditorTarget; onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const settings = doc?.settings ?? DEFAULT_SETTINGS;
  const format = useFormatContext();
  const original = target.fieldId ? doc?.fields[target.fieldId] : undefined;
  const collection = doc?.collections[target.collectionId];
  const isPrimary = original !== undefined && collection?.primaryFieldId === original.id;

  const [name, setName] = useState(original?.name ?? '');
  const [type, setType] = useState<FieldType>(original?.type ?? 'text');
  const [config, setConfig] = useState<ConfigDraft>(() =>
    original
      ? configOf(original, doc?.fields)
      : ((fieldType('text').defaultConfig({ settings, newId }) ?? {}) as ConfigDraft),
  );
  const [description, setDescription] = useState(original?.description ?? '');
  const [required, setRequired] = useState(original?.required === true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [link, setLink] = useState<LinkDraft>({
    targetCollectionId: null,
    inverseName: '',
    multiple: true,
    inverseMultiple: true,
    symmetric: false,
    backlink: true,
  });

  const configCtx = useMemo(() => ({ settings, newId }), [settings]);
  const retyping = original !== undefined && type !== original.type;

  // What a type change would do to the existing values (the command applies the same plan).
  const plan = useMemo(() => {
    if (!doc || !original || !retyping) return null;
    const result = planTypeChange(doc, original, type, config, {
      settings: doc.settings,
      newId,
      now: new Date().toISOString(),
      ...(index ? { links: index } : {}),
    });
    return typeof result === 'string' ? { error: result } : result;
  }, [doc, index, original, retyping, type, config]);

  const optionUsage = useMemo(() => {
    const usage = new Map<string, number>();
    if (!doc || !original || (original.type !== 'singleSelect' && original.type !== 'multiSelect'))
      return usage;
    for (const r of iterateRecords(doc, original.collectionId)) {
      const v = r.values[original.id];
      for (const id of Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
        usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    return usage;
  }, [doc, original]);

  if (!doc || !collection) return null;

  const changeType = (next: FieldType) => {
    setType(next);
    setError(null);
    if (original && next === original.type) {
      setConfig(configOf(original, doc.fields));
    } else if (original) {
      // Start from what the conversion would derive (e.g. options from existing text values).
      const derived = planTypeChange(doc, original, next, undefined, {
        settings: doc.settings,
        newId,
        now: new Date().toISOString(),
        ...(index ? { links: index } : {}),
      });
      setConfig(typeof derived === 'string' ? {} : configOf(derived.field));
    } else if (next === 'formula') {
      setConfig({ expression: '' });
    } else if (next === 'link') {
      setConfig({}); // links are configured by NewLinkOptions
    } else {
      setConfig((fieldType(next).defaultConfig(configCtx) ?? {}) as ConfigDraft);
    }
  };

  const save = () => {
    if (!original && type === 'link') {
      if (!link.targetCollectionId) {
        setError('Pick the collection to link to.');
        return;
      }
      const created = tryDispatch('createLinkField', {
        collectionId: target.collectionId,
        name,
        targetCollectionId: link.targetCollectionId,
        multiple: link.multiple,
        ...(link.symmetric
          ? { symmetric: true }
          : !link.backlink
            ? { backlink: false }
            : {
                inverseMultiple: link.inverseMultiple,
                ...(link.inverseName.trim() ? { inverseName: link.inverseName } : {}),
              }),
        ...(target.viewId ? { viewId: target.viewId } : {}),
        ...(target.afterFieldId ? { afterFieldId: target.afterFieldId } : {}),
      });
      if (created) onClose();
      return;
    }
    const def = fieldType(type);
    // Formulas are typed with field names and stored with ids.
    const saved: ConfigDraft =
      type === 'formula'
        ? {
            ...config,
            expression: toStored(
              typeof config.expression === 'string' ? config.expression : '',
              Object.values(doc.fields).filter((f) => f.collectionId === target.collectionId),
            ),
          }
        : config;
    const normalized = def.normalizeConfig(saved, configCtx);
    if (type !== 'link' && typeof normalized === 'string') {
      setError(normalized);
      return;
    }
    const basics = {
      name,
      description: description.trim() || undefined,
      required,
    };
    if (!original) {
      const id = tryDispatch('createField', {
        collectionId: target.collectionId,
        type,
        config: saved,
        ...basics,
        description: description.trim(),
        ...(target.viewId ? { viewId: target.viewId } : {}),
        ...(target.afterFieldId ? { afterFieldId: target.afterFieldId } : {}),
      });
      if (id !== undefined) onClose();
      return;
    }
    if (retyping) {
      const result = tryDispatch('changeFieldType', {
        id: original.id,
        type,
        config: saved,
        changes: basics,
      });
      if (result === undefined) return;
      const label = fieldType(type).label;
      if (result.lost > 0)
        toastWithUndo(
          `Changed “${name.trim()}” to ${label}; cleared ${pluralize(result.lost, 'value')}`,
        );
      else toast(`Changed “${name.trim()}” to ${label}`);
      onClose();
      return;
    }
    const configChanged = JSON.stringify(config) !== JSON.stringify(configOf(original, doc.fields));
    const ok = tryRun('updateField', {
      id: original.id,
      changes: { ...basics, ...(configChanged ? { config: saved } : {}) },
    });
    if (ok) onClose();
  };

  const typeOptions = (
    !original ? PICKABLE_NEW : original.type === 'link' ? [...PICKABLE, 'link' as const] : PICKABLE
  )
    .filter((t) => !isPrimary || fieldType(t).canBePrimary)
    .map((t) => ({ value: t, label: fieldType(t).label }));
  const linkTarget =
    original?.type === 'link'
      ? doc.collections[original.config.targetCollectionId]?.name
      : undefined;

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <TextInput
        label="Name"
        data-autofocus
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
        }}
      />
      <Select
        label="Type"
        data={typeOptions}
        value={type}
        allowDeselect={false}
        searchable
        maxDropdownHeight={360}
        leftSection={<FieldTypeIcon type={type} />}
        renderOption={({ option }) => (
          <Group gap={8} wrap="nowrap">
            <FieldTypeIcon type={option.value} />
            {option.label}
          </Group>
        )}
        onChange={(value) => {
          if (value) changeType(value);
        }}
      />
      <div className={styles.config}>
        {type === 'formula' ? (
          <FormulaEditor
            fieldId={original?.id}
            collectionId={target.collectionId}
            expression={typeof config.expression === 'string' ? config.expression : ''}
            number={config.number as NumberFormat | undefined}
            format={format}
            onChange={(expression, number) => {
              setConfig(number ? { expression, number } : { expression });
              setError(null);
            }}
          />
        ) : !original && type === 'link' ? (
          <NewLinkOptions
            collection={collection}
            collections={Object.values(doc.collections).sort((a, b) => a.order - b.order)}
            draft={link}
            onChange={(next) => {
              // A new link field is named after what it links to unless it already has a name.
              const picked = next.targetCollectionId
                ? doc.collections[next.targetCollectionId]
                : undefined;
              if (picked && next.targetCollectionId !== link.targetCollectionId && !name.trim())
                setName(picked.name);
              setLink(next);
              setError(null);
            }}
          />
        ) : (
          <FieldConfigEditor
            type={type}
            config={config}
            onChange={(next) => {
              setConfig(next);
              setError(null);
            }}
            format={format}
            optionUsage={optionUsage}
            {...(linkTarget ? { linkTarget } : {})}
          />
        )}
        {original?.type === 'link' && type === 'link' && <BacklinkOptions field={original} />}
      </div>
      {plan && <TypeChangeNotice plan={plan} from={original} to={type} />}
      <Textarea
        label="Description"
        autosize
        minRows={1}
        maxRows={4}
        value={description}
        onChange={(e) => {
          setDescription(e.currentTarget.value);
        }}
      />
      {fieldType(type).stored && (
        <Checkbox
          label="Required"
          checked={required}
          onChange={(e) => {
            setRequired(e.currentTarget.checked);
          }}
        />
      )}
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}
      <Group justify="space-between" mt="xs">
        {original && !isPrimary ? (
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || (plan !== null && 'error' in plan)}>
            {original ? 'Save' : 'Add field'}
          </Button>
        </Group>
      </Group>
      {deleting && original && (
        <DeleteFieldDialog
          fieldId={original.id}
          onClose={() => {
            setDeleting(false);
          }}
          onDeleted={onClose}
        />
      )}
    </form>
  );
}

interface TypeChangeNoticeProps {
  plan: TypeChangePlan | { error: string };
  from: Field | undefined;
  to: FieldType;
}

/** Says what a type change will do to existing values before it's saved. */
function TypeChangeNotice({ plan, from, to }: TypeChangeNoticeProps) {
  if ('error' in plan) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
        {plan.error}
      </Alert>
    );
  }
  const label = fieldType(to).label.toLowerCase();
  const parts: string[] = [];
  if (plan.converted) parts.push(`${pluralize(plan.converted, 'value')} will convert to ${label}`);
  if (plan.lost)
    parts.push(`${pluralize(plan.lost, 'value')} can’t be converted and will be cleared`);
  if (from?.type === 'link')
    parts.push(
      from.config.inverseFieldId && from.config.inverseFieldId !== from.id
        ? 'the links and the backlink field will be removed'
        : 'the links will be removed',
    );
  if (parts.length === 0) parts.push('No records have a value yet');
  const lost = plan.lost > 0 || from?.type === 'link';
  return (
    <Alert
      color={lost ? 'orange' : 'gray'}
      variant="light"
      icon={lost ? <IconAlertTriangle size={16} /> : undefined}
      className={styles.notice}
    >
      {parts.join('; ')}.
      {plan.lostExamples.length > 0 && (
        <span className={styles.examples}>
          {' '}
          For example: {plan.lostExamples.map((e) => `“${e}”`).join(', ')}.
        </span>
      )}
    </Alert>
  );
}
