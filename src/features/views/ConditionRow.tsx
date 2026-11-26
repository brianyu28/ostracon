import { ActionIcon, Group, Select, Tooltip } from '@mantine/core';
import { IconBracketsContain, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { OPERATOR_LABELS } from '@/domain/fields/operators';
import { LOCATION_PART_LABELS, LOCATION_PARTS } from '@/domain/fields/types/other';
import type { Field, FilterCondition } from '@/domain/schema/types';
import { newCondition, operandKind, operatorsOf, without, withOperator } from './filterDraft';
import { OperandInput } from './OperandInput';
import styles from './ViewToolbar.module.scss';

interface ConditionRowProps {
  connector: ReactNode;
  condition: FilterCondition;
  fields: readonly Field[];
  onChange: (condition: FilterCondition | null) => void;
  /** Turns this condition into a nested group (absent at the deepest level). */
  onAddGroup: (() => void) | undefined;
}

/** One condition: field, (location part), operator and operand. */
export function ConditionRow({
  connector,
  condition,
  fields,
  onChange,
  onAddGroup,
}: ConditionRowProps) {
  const field = fields.find((f) => f.id === condition.fieldId);
  const operators = field ? operatorsOf(field) : [];
  return (
    <div className={styles.row}>
      {connector}
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        className={styles.fieldSelect}
        aria-label="Field"
        searchable
        allowDeselect={false}
        data={fields.map((f) => ({ value: f.id, label: f.name }))}
        value={condition.fieldId}
        leftSection={field ? <FieldTypeIcon type={field.type} /> : null}
        renderOption={({ option }) => {
          const f = fields.find((x) => x.id === option.value);
          return (
            <Group gap={6} wrap="nowrap">
              {f && <FieldTypeIcon type={f.type} />}
              {option.label}
            </Group>
          );
        }}
        onChange={(id) => {
          const next = fields.find((f) => f.id === id);
          if (next) onChange(newCondition(next));
        }}
      />
      {field?.type === 'location' && (
        <Select
          size="xs"
          comboboxProps={{ withinPortal: false }}
          className={styles.partSelect}
          aria-label="Location part"
          allowDeselect={false}
          data={[
            { value: '', label: 'Any part' },
            ...LOCATION_PARTS.map((p) => ({ value: p, label: LOCATION_PART_LABELS[p] })),
          ]}
          value={condition.part ?? ''}
          onChange={(part) => {
            const rest = without(condition, 'part');
            onChange(part ? { ...rest, part: part } : rest);
          }}
        />
      )}
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        className={styles.operatorSelect}
        aria-label="Condition"
        allowDeselect={false}
        data={operators.map(([op]) => ({ value: op, label: OPERATOR_LABELS[op] }))}
        value={condition.operator}
        onChange={(operator) => {
          if (!operator || !field) return;
          const keep = operandKind(field, operator) === operandKind(field, condition.operator);
          const kind = operandKind(field, operator);
          const part = condition.part ? { part: condition.part } : {};
          onChange(
            keep
              ? { ...condition, operator }
              : { ...withOperator(field.id, operator, kind), ...part },
          );
        }}
      />
      <div className={styles.operand}>
        {field && (
          <OperandInput
            field={field}
            kind={operandKind(field, condition.operator)}
            value={condition.value}
            onChange={(value) => {
              const rest = without(condition, 'value');
              onChange(value === undefined ? rest : { ...rest, value: value as never });
            }}
          />
        )}
      </div>
      {onAddGroup && (
        <Tooltip label="Make a group">
          <ActionIcon variant="subtle" color="gray" aria-label="Make a group" onClick={onAddGroup}>
            <IconBracketsContain size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Remove condition"
        onClick={() => {
          onChange(null);
        }}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </div>
  );
}
