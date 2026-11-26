import { ActionIcon, Button, Divider, Group, TextInput } from '@mantine/core';
import { Modal } from '@/components/Modal/Modal';
import { IconArrowLeft, IconFileImport } from '@tabler/icons-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconPicker } from '@/components/IconPicker/IconPicker';
import type { Color, Collection } from '@/domain/schema/types';
import type { Template } from '@/domain/templates/model';
import { planFromCollection, planTemplate, type TemplatePlan } from '@/domain/templates/plan';
import { TemplateGallery } from '@/features/templates/TemplateGallery';
import { TemplatePreview } from '@/features/templates/TemplatePreview';
import { tryDispatch } from '@/store/actions';
import { docStore, useDocStore } from '@/store/docStore';
import { ui, uiStore, useUi } from '@/store/uiStore';
import styles from './CollectionSettingsDialog.module.scss';

type Step =
  | { kind: 'pick' }
  | { kind: 'preview'; plan: TemplatePlan; template: Template | undefined; withLog: boolean };

/**
 * New collection (opened through `ui.openNewCollection`): a blank collection, a template from
 * the gallery, or a copy of another collection's fields. Templates and copies open a preview of
 * the schema to adjust before anything is created.
 */
export function NewCollectionDialog() {
  const opened = useUi((s) => s.newCollectionOpen);
  const collectionMap = useDocStore((s) => s.doc?.collections);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<Color | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [, navigate] = useLocation();
  const existing: Collection[] = Object.values(collectionMap ?? {}).sort(
    (a, b) => a.order - b.order,
  );

  const close = () => {
    uiStore.setState({ newCollectionOpen: false });
    setName('');
    setIcon(undefined);
    setColor(undefined);
    setStep({ kind: 'pick' });
  };

  const createBlank = () => {
    const id = tryDispatch('createCollection', {
      name,
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
    });
    if (id === undefined) return;
    close();
    navigate(collectionPath(id));
  };

  const preview = (template: Template, withLog: boolean) => {
    setStep({
      kind: 'preview',
      template,
      withLog,
      plan: planTemplate(template, { withLog, existing }),
    });
  };

  const createPlan = (plan: TemplatePlan) => {
    const refs = tryDispatch('createFromTemplate', { plan });
    const first = plan.collections[0];
    const id = refs && first ? refs[first.ref] : undefined;
    if (!id) return;
    close();
    navigate(collectionPath(id));
  };

  const previewing = step.kind === 'preview';
  return (
    <Modal
      opened={opened}
      onClose={close}
      size={previewing ? 'lg' : 'xl'}
      title={
        previewing ? (
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Back to templates"
              onClick={() => {
                setStep({ kind: 'pick' });
              }}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
            {step.template ? `${step.template.name} template` : 'Copy fields'}
          </Group>
        ) : (
          'New collection'
        )
      }
    >
      {step.kind === 'pick' ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createBlank();
            }}
          >
            <div className={styles.identity}>
              <IconPicker value={icon} color={color} onChange={setIcon} />
              <ColorPicker value={color} label="Collection color" onChange={setColor} />
              <TextInput
                className={styles.name}
                data-autofocus
                aria-label="Name"
                placeholder="Blank collection, e.g. Restaurants"
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value);
                }}
              />
              <Button type="submit" disabled={!name.trim()}>
                Create
              </Button>
            </div>
          </form>
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            mt="xs"
            leftSection={<IconFileImport size={14} />}
            onClick={() => {
              close();
              ui.openImport();
            }}
          >
            Import CSV or JSON instead
          </Button>
          <Divider my="md" label="Or start from a template" labelPosition="left" />
          <TemplateGallery
            collections={existing}
            onPick={(template) => {
              preview(template, false);
            }}
            onCopy={(collectionId) => {
              const doc = docStore.getState().doc;
              if (!doc) return;
              setStep({
                kind: 'preview',
                template: undefined,
                withLog: false,
                plan: planFromCollection(doc, collectionId),
              });
            }}
          />
        </>
      ) : (
        <>
          <TemplatePreview
            plan={step.plan}
            template={step.template}
            withLog={step.withLog}
            existing={existing}
            onChange={(plan) => {
              setStep({ ...step, plan });
            }}
            onVariant={(withLog) => {
              if (step.template) preview(step.template, withLog);
            }}
          />
          <Group justify="flex-end" mt="md" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setStep({ kind: 'pick' });
              }}
            >
              Back
            </Button>
            <Button
              onClick={() => {
                createPlan(step.plan);
              }}
            >
              {step.plan.collections.length > 1
                ? `Create ${String(step.plan.collections.length)} collections`
                : 'Create collection'}
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}
