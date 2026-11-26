import { Checkbox, NumberInput, SegmentedControl, Select, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/domain/fields/format';
import type { FormatContext } from '@/domain/fields/model';
import { LOCATION_PART_LABELS, LOCATION_PARTS } from '@/domain/fields/types/other';
import type { FieldType, LocationPart, NumberFormat } from '@/domain/schema/types';
import { OptionsEditor, type OptionDraft } from './OptionsEditor';
import styles from './FieldEditor.module.scss';

/** A config being edited: the shape of the type's config, loosely typed while the user edits. */
export type ConfigDraft = Record<string, unknown>;

interface FieldConfigEditorProps {
  type: FieldType;
  config: ConfigDraft;
  onChange: (config: ConfigDraft) => void;
  format: FormatContext;
  /** Records per select option, for the options list. */
  optionUsage?: ReadonlyMap<string, number>;
  /** Name of the collection a link field points at. */
  linkTarget?: string;
}

const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'MXN',
  'SEK',
  'NZD',
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.configRow}>
      <span className={styles.configLabel}>{label}</span>
      <div className={styles.configControl}>{children}</div>
    </div>
  );
}

/** Options specific to a field type (number format, select options, location parts…). */
export function FieldConfigEditor(props: FieldConfigEditorProps) {
  const { type, config, onChange } = props;
  const set = (patch: ConfigDraft) => {
    const next = { ...config, ...patch };
    for (const [k, v] of Object.entries(patch))
      if (v === undefined) Reflect.deleteProperty(next, k);
    onChange(next);
  };
  const flag = (key: string, label: string) => (
    <Checkbox
      label={label}
      checked={config[key] === true}
      onChange={(e) => {
        set({ [key]: e.currentTarget.checked ? true : undefined });
      }}
    />
  );

  switch (type) {
    case 'text':
      return flag('multiline', 'Allow line breaks');
    case 'number':
      return <NumberFormatEditor {...props} />;
    case 'rating': {
      const max = typeof config.max === 'number' ? config.max : 5;
      return (
        <>
          <Row label="Scale">
            <NumberInput
              size="xs"
              min={3}
              max={10}
              value={max}
              aria-label="Highest rating"
              onChange={(v) => {
                if (typeof v === 'number') set({ max: Math.min(10, Math.max(3, Math.round(v))) });
              }}
              w={80}
            />
          </Row>
          <Row label="Icon">
            <SegmentedControl
              size="xs"
              value={typeof config.icon === 'string' ? config.icon : 'star'}
              data={[
                { value: 'star', label: '★ Star' },
                { value: 'heart', label: '♥ Heart' },
                { value: 'circle', label: '● Circle' },
              ]}
              onChange={(icon) => {
                set({ icon: icon === 'star' ? undefined : icon });
              }}
            />
          </Row>
        </>
      );
    }
    case 'duration':
      return (
        <Row label="Show as">
          <SegmentedControl
            size="xs"
            value={typeof config.display === 'string' ? config.display : 'h:mm'}
            data={(['h:mm', 'h:mm:ss', 'compact'] as const).map((d) => ({
              value: d,
              label: formatDuration(5415, d),
            }))}
            onChange={(display) => {
              set({ display });
            }}
          />
        </Row>
      );
    case 'date':
    case 'dateRange':
      return flag('partial', 'Allow partial dates');
    case 'singleSelect':
    case 'multiSelect':
      return (
        <OptionsEditor
          options={(config.options as OptionDraft[] | undefined) ?? []}
          usage={props.optionUsage}
          onChange={(options) => {
            set({ options });
          }}
        />
      );
    case 'url':
      return (
        <Checkbox
          label="Show image links as thumbnails"
          checked={config.display === 'image'}
          onChange={(e) => {
            set({ display: e.currentTarget.checked ? 'image' : undefined });
          }}
        />
      );
    case 'location':
      return <LocationPartsEditor {...props} />;
    case 'link':
      return (
        <>
          <Text size="sm" c="dimmed">
            Links to records in <strong>{props.linkTarget ?? 'another collection'}</strong>.
          </Text>
          {flag('multiple', 'Allow linking to more than one record')}
        </>
      );
    case 'createdTime':
    case 'modifiedTime':
      return flag('includeTime', 'Include the time');
    default:
      return null;
  }
}

export function NumberFormatEditor({ config, onChange, format }: FieldConfigEditorProps) {
  const style = (config.style as NumberFormat['style'] | undefined) ?? 'plain';
  const set = (patch: ConfigDraft) => {
    const next = { ...config, ...patch };
    for (const [k, v] of Object.entries(patch))
      if (v === undefined) Reflect.deleteProperty(next, k);
    onChange(next);
  };
  const defaultDecimals = style === 'percent' ? 0 : 2;
  const decimals = typeof config.decimals === 'number' ? config.decimals : defaultDecimals;
  const sample = style === 'percent' ? 0.2567 : 1234.5678;
  const preview = formatNumber(sample, { ...(config as NumberFormat), style }, format);
  return (
    <>
      <Row label="Format">
        <SegmentedControl
          size="xs"
          value={style}
          data={[
            { value: 'plain', label: 'As entered' },
            { value: 'decimal', label: 'Decimal' },
            { value: 'currency', label: 'Currency' },
            { value: 'percent', label: 'Percent' },
          ]}
          onChange={(value) => {
            set({
              style: value,
              decimals: undefined,
              currency: value === 'currency' ? format.defaultCurrency : undefined,
            });
          }}
        />
      </Row>
      {style !== 'plain' && (
        <Row label="Decimal places">
          <NumberInput
            size="xs"
            min={0}
            max={10}
            w={80}
            aria-label="Decimal places"
            value={decimals}
            onChange={(v) => {
              if (typeof v === 'number')
                set({ decimals: Math.min(10, Math.max(0, Math.round(v))) });
            }}
          />
        </Row>
      )}
      {style === 'currency' && (
        <Row label="Currency">
          <Select
            size="xs"
            w={100}
            aria-label="Currency"
            data={CURRENCIES}
            value={typeof config.currency === 'string' ? config.currency : format.defaultCurrency}
            searchable
            allowDeselect={false}
            onChange={(currency) => {
              if (currency) set({ currency });
            }}
          />
        </Row>
      )}
      <Checkbox
        label="Thousands separators"
        checked={config.thousands === true}
        onChange={(e) => {
          set({ thousands: e.currentTarget.checked ? true : undefined });
        }}
      />
      <Text size="xs" c="dimmed">
        Example: <span className={styles.preview}>{preview}</span>
      </Text>
    </>
  );
}

function LocationPartsEditor({ config, onChange }: FieldConfigEditorProps) {
  const parts = (config.parts as LocationPart[] | undefined) ?? [];
  return (
    <Row label="Parts">
      <div className={styles.parts}>
        {LOCATION_PARTS.map((part) => (
          <Checkbox
            key={part}
            label={LOCATION_PART_LABELS[part]}
            checked={parts.includes(part)}
            onChange={(e) => {
              const next = e.currentTarget.checked
                ? LOCATION_PARTS.filter((p) => p === part || parts.includes(p))
                : parts.filter((p) => p !== part);
              onChange({ ...config, parts: next });
            }}
          />
        ))}
      </div>
    </Row>
  );
}
