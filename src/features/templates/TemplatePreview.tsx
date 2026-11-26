import { Button, SegmentedControl, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useRef } from 'react';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconPicker } from '@/components/IconPicker/IconPicker';
import type { Collection } from '@/domain/schema/types';
import type { Template } from '@/domain/templates/model';
import type { PlanCollection, PlanField, TemplatePlan } from '@/domain/templates/plan';
import { PlanFieldRow } from './PlanFieldRow';
import styles from './Templates.module.scss';

interface TemplatePreviewProps {
  plan: TemplatePlan;
  /** The template the plan came from (absent when copying a collection). */
  template: Template | undefined;
  withLog: boolean;
  existing: readonly Collection[];
  onChange: (plan: TemplatePlan) => void;
  onVariant: (withLog: boolean) => void;
}

/** The schema about to be created: rename, retype, remove or add fields and pick link targets. */
export function TemplatePreview({
  plan,
  template,
  withLog,
  existing,
  onChange,
  onVariant,
}: TemplatePreviewProps) {
  const added = useRef(0);
  const setCollection = (ref: string, next: PlanCollection) => {
    onChange({ collections: plan.collections.map((c) => (c.ref === ref ? next : c)) });
  };
  return (
    <div className={styles.preview}>
      {template?.log && (
        <SegmentedControl
          fullWidth
          value={withLog ? 'log' : 'simple'}
          data={[
            { value: 'simple', label: 'Simple' },
            { value: 'log', label: `With ${template.log.label}` },
          ]}
          onChange={(v) => {
            onVariant(v === 'log');
          }}
        />
      )}
      {plan.collections.map((c) => (
        <section key={c.ref} className={styles.card}>
          <div className={styles.identity}>
            <IconPicker
              value={c.icon}
              color={c.color}
              onChange={(icon) => {
                setCollection(c.ref, { ...c, icon });
              }}
            />
            <ColorPicker
              value={c.color}
              label="Collection color"
              onChange={(color) => {
                setCollection(c.ref, { ...c, color });
              }}
            />
            <TextInput
              className={styles.collectionName}
              aria-label="Collection name"
              value={c.name}
              onChange={(e) => {
                setCollection(c.ref, { ...c, name: e.currentTarget.value });
              }}
            />
          </div>
          <div className={styles.fields}>
            {c.fields.map((field) => (
              <PlanFieldRow
                key={field.key}
                field={field}
                primary={field.key === c.primary}
                collection={c}
                plan={plan}
                existing={existing}
                onPlanChange={onChange}
                onChange={(next: PlanField | null) => {
                  setCollection(c.ref, {
                    ...c,
                    fields: next
                      ? c.fields.map((f) => (f.key === field.key ? next : f))
                      : c.fields.filter((f) => f.key !== field.key),
                  });
                }}
              />
            ))}
          </div>
          <div className={styles.cardFooter}>
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                added.current += 1;
                setCollection(c.ref, {
                  ...c,
                  fields: [
                    ...c.fields,
                    { key: `new${String(added.current)}`, name: '', type: 'text' },
                  ],
                });
              }}
            >
              Add field
            </Button>
            {c.views.length > 0 && (
              <Text size="xs" c="dimmed" className={styles.views}>
                Views: {c.views.map((v) => v.name).join(' · ')}
              </Text>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
