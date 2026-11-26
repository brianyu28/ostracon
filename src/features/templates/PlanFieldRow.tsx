import { ActionIcon, Group, Select, TextInput, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconX } from '@tabler/icons-react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { FIELD_TYPE_ORDER, fieldType } from '@/domain/fields/registry';
import type { Collection } from '@/domain/schema/types';
import { TEMPLATES_BY_KEY } from '@/domain/templates/catalog';
import {
  ensureTemplate,
  pruneTemplates,
  type PlanCollection,
  type PlanField,
  type TemplatePlan,
} from '@/domain/templates/plan';
import styles from './Templates.module.scss';

/** Types a planned field can take (links come from the template; formulas arrive in Phase 7). */
const TYPES = FIELD_TYPE_ORDER.filter((t) => t !== 'link' && t !== 'formula').map((t) => ({
  value: t,
  label: fieldType(t).label,
}));

interface PlanFieldRowProps {
  field: PlanField;
  primary: boolean;
  collection: PlanCollection;
  plan: TemplatePlan;
  existing: readonly Collection[];
  onChange: (field: PlanField | null) => void;
  /** Link target choices can add or remove collections from the plan. */
  onPlanChange: (plan: TemplatePlan) => void;
}

/** One planned field: its name, and its type or (for links) what it links to. */
export function PlanFieldRow({
  field,
  primary,
  collection,
  plan,
  existing,
  onChange,
  onPlanChange,
}: PlanFieldRowProps) {
  const link = field.link;
  let control;
  let backlinkToggle = null;
  if (field.type === 'link' && link) {
    const data: { value: string; label: string }[] = [];
    for (const c of plan.collections)
      data.push({
        value: `plan:${c.ref}`,
        label: c.ref === collection.ref ? `${c.name} (itself)` : c.name,
      });
    const template = link.templateKey ? TEMPLATES_BY_KEY.get(link.templateKey) : undefined;
    if (template && !plan.collections.some((c) => c.ref === template.key))
      data.push({
        value: `create:${template.key}`,
        label: `New ${template.collection.name} collection`,
      });
    for (const c of existing) data.push({ value: `existing:${c.id}`, label: c.name });
    data.push({ value: 'skip', label: 'Don’t link' });
    const value =
      link.target.kind === 'skip'
        ? 'skip'
        : link.target.kind === 'plan'
          ? `plan:${link.target.ref}`
          : `existing:${link.target.collectionId}`;
    const targetName =
      link.target.kind === 'existing'
        ? existing.find((c) => c.id === (link.target as { collectionId: string }).collectionId)
            ?.name
        : link.target.kind === 'plan'
          ? plan.collections.find((c) => c.ref === (link.target as { ref: string }).ref)?.name
          : undefined;
    const selfTarget = link.target.kind === 'plan' && link.target.ref === collection.ref;
    if (targetName && !(selfTarget && link.symmetric)) {
      const on = link.backlink !== undefined;
      backlinkToggle = (
        <Tooltip
          label={
            on
              ? `Links back from ${targetName} (“${link.backlink?.name ?? ''}”)`
              : `No backlink in ${targetName}`
          }
        >
          <ActionIcon
            variant={on ? 'light' : 'subtle'}
            color={on ? 'accent' : 'gray'}
            aria-label={`Backlink in ${targetName}`}
            aria-pressed={on}
            onClick={() => {
              onChange({
                ...field,
                link: on
                  ? { ...link, backlink: undefined }
                  : { ...link, backlink: { name: collection.name } },
              });
            }}
          >
            <IconArrowBackUp size={14} />
          </ActionIcon>
        </Tooltip>
      );
    }
    control = (
      <Select
        className={styles.typeSelect}
        aria-label={`${field.name || 'Field'} links to`}
        allowDeselect={false}
        data={data}
        value={value}
        leftSection={<FieldTypeIcon type="link" />}
        onChange={(choice) => {
          if (!choice) return;
          const [kind = '', ref = ''] = choice.split(':');
          let next: TemplatePlan = plan;
          let target: NonNullable<PlanField['link']>['target'];
          if (kind === 'create') {
            next = structuredClone(plan);
            target = { kind: 'plan', ref: ensureTemplate(next, ref) };
          } else if (kind === 'plan') target = { kind: 'plan', ref };
          else if (kind === 'existing') target = { kind: 'existing', collectionId: ref };
          else target = { kind: 'skip' };
          const updated: PlanField = { ...field, link: { ...link, target } };
          next = {
            collections: next.collections.map((c) =>
              c.ref === collection.ref
                ? { ...c, fields: c.fields.map((f) => (f.key === field.key ? updated : f)) }
                : c,
            ),
          };
          onPlanChange(pruneTemplates(next));
        }}
      />
    );
  } else if (field.type === 'formula') {
    control = (
      <TextInput
        className={styles.typeSelect}
        classNames={{ input: styles.expression }}
        aria-label={`${field.name || 'Field'} formula`}
        leftSection={<FieldTypeIcon type="formula" />}
        value={typeof field.config?.expression === 'string' ? field.config.expression : ''}
        onChange={(e) => {
          onChange({ ...field, config: { ...field.config, expression: e.currentTarget.value } });
        }}
      />
    );
  } else {
    control = (
      <Select
        className={styles.typeSelect}
        aria-label={`${field.name || 'Field'} type`}
        allowDeselect={false}
        searchable
        disabled={primary}
        data={TYPES}
        value={field.type}
        leftSection={<FieldTypeIcon type={field.type} />}
        renderOption={({ option }) => (
          <Group gap={6} wrap="nowrap">
            <FieldTypeIcon type={option.value} />
            {option.label}
          </Group>
        )}
        onChange={(type) => {
          if (!type || type === field.type) return;
          // A new type starts from its own defaults.
          onChange({ key: field.key, name: field.name, type: type });
        }}
      />
    );
  }
  return (
    <div className={styles.fieldRow}>
      <TextInput
        className={styles.fieldName}
        aria-label="Field name"
        placeholder="Field name"
        value={field.name}
        onChange={(e) => {
          onChange({ ...field, name: e.currentTarget.value });
        }}
      />
      {control}
      {backlinkToggle}
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`Remove ${field.name || 'field'}`}
        disabled={primary}
        onClick={() => {
          onChange(null);
        }}
      >
        <IconX size={14} />
      </ActionIcon>
    </div>
  );
}
