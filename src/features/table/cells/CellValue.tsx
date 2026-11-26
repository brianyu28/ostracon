import { clsx } from 'clsx';
import { memo, type ReactNode } from 'react';
import { OptionChip } from '@/components/OptionChip/OptionChip';
import type { FormatContext } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import type { Field, Id, RecordEntity } from '@/domain/schema/types';
import { markdownText } from '@/lib/markdown';
import type { LinkedRecord } from '../linked';
import { LinkChip } from './LinkChip';
import { RatingIcons } from './RatingIcons';
import { timestampText } from './timestamp';
import styles from './CellValue.module.scss';

export interface CellValueProps {
  record: RecordEntity;
  field: Field;
  format: FormatContext;
  /** Linked records (link fields). */
  links?: readonly LinkedRecord[];
  /** Opens a linked record from its chip. */
  onOpenLink?: (id: Id) => void;
  /** Larger, wrapping layout (record panel) instead of a single table line. */
  wrap?: boolean;
  /** Sets a value directly (checkbox and rating clicks). Omit for read-only display. */
  onSet?: (value: unknown) => void;
}

const NUMERIC = new Set(['number', 'duration']);

/** A record's value for one field, as shown in a table cell or the record panel. */
export const CellValue = memo(function CellValue({
  record,
  field,
  format,
  links,
  onOpenLink,
  wrap,
  onSet,
}: CellValueProps) {
  const value = record.values[field.id];
  let content: ReactNode = null;
  switch (field.type) {
    case 'link':
      content = links?.map((link) => (
        <LinkChip
          key={link.id}
          onOpen={
            onOpenLink
              ? () => {
                  onOpenLink(link.id);
                }
              : undefined
          }
        >
          {link.title}
        </LinkChip>
      ));
      break;
    case 'createdTime':
    case 'modifiedTime':
      content = timestampText(
        field.type === 'createdTime' ? record.createdAt : record.updatedAt,
        field.config.includeTime === true,
        format,
      );
      break;
    case 'formula':
      content = null; // Phase 7
      break;
    case 'checkbox':
      content = (
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={value === true}
          disabled={!onSet}
          aria-label={field.name}
          tabIndex={-1}
          onChange={(e) => {
            onSet?.(e.currentTarget.checked ? true : undefined);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        />
      );
      break;
    case 'rating':
      content = (
        <RatingIcons
          value={typeof value === 'number' ? value : 0}
          max={field.config.max}
          icon={field.config.icon ?? 'star'}
          {...(onSet ? { onSet } : {})}
        />
      );
      break;
    case 'singleSelect':
    case 'multiSelect': {
      const ids: Id[] = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
      content = ids.map((id) => {
        const option = field.config.options.find((o) => o.id === id);
        return option ? (
          <OptionChip key={id} color={option.color}>
            {option.name}
          </OptionChip>
        ) : null;
      });
      break;
    }
    case 'url':
      if (typeof value === 'string') {
        content =
          field.config.display === 'image' ? (
            <img
              src={value}
              alt=""
              className={styles.thumb}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ExternalLink href={value}>
              {fieldType(field).format(value, field, format, 'display')}
            </ExternalLink>
          );
      }
      break;
    case 'email':
      if (typeof value === 'string')
        content = <ExternalLink href={`mailto:${value}`}>{value}</ExternalLink>;
      break;
    case 'phone':
      if (typeof value === 'string')
        content = <ExternalLink href={`tel:${value.replace(/[^\d+]/g, '')}`}>{value}</ExternalLink>;
      break;
    case 'richText':
      if (typeof value === 'string') content = wrap ? null : markdownText(value);
      break;
    default:
      if (value !== undefined) content = fieldType(field).format(value, field, format, 'display');
  }
  return (
    <span
      className={clsx(
        styles.value,
        wrap && styles.wrap,
        NUMERIC.has(field.type) && !wrap && styles.numeric,
      )}
    >
      {content}
    </span>
  );
});

/** A link inside a cell: opens in a new tab, without moving the cell cursor first. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      {children}
    </a>
  );
}
