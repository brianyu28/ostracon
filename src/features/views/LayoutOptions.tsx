import { Checkbox, Select } from '@mantine/core';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { BOARD_GROUP_TYPES, CALENDAR_DATE_TYPES } from '@/domain/fields/registry';
import type { Collection, Field, View } from '@/domain/schema/types';
import { tryRun } from '@/store/actions';
import styles from './ViewToolbar.module.scss';

type Board = NonNullable<View['board']>;
type Calendar = NonNullable<View['calendar']>;

/** Board and calendar options: what groups or places the cards, and what cards show. */
export function LayoutOptions({
  collection,
  view,
  fields,
}: {
  collection: Collection;
  view: View;
  fields: readonly Field[];
}) {
  const save = (changes: { board?: Board; calendar?: Calendar }) => {
    tryRun('updateView', { id: view.id, changes });
  };
  const without = <T extends object>(obj: T, key: keyof T): T => {
    const copy = { ...obj };
    Reflect.deleteProperty(copy, key);
    return copy;
  };
  const cardFieldIds = (view.board ?? view.calendar)?.cardFields ?? [];
  const toggleCardField = (id: string, on: boolean) => {
    const next = on ? [...cardFieldIds, id] : cardFieldIds.filter((x) => x !== id);
    const ordered = fields.map((f) => f.id).filter((x) => next.includes(x));
    if (view.board)
      save({
        board: ordered.length
          ? { ...view.board, cardFields: ordered }
          : without(view.board, 'cardFields'),
      });
    else if (view.calendar)
      save({
        calendar: ordered.length
          ? { ...view.calendar, cardFields: ordered }
          : without(view.calendar, 'cardFields'),
      });
  };
  const options = (list: readonly Field[]) => list.map((f) => ({ value: f.id, label: f.name }));
  const cardChoices = fields.filter((f) => f.id !== collection.primaryFieldId);

  return (
    <div className={styles.groupEditor}>
      {view.board && (
        <>
          <Select
            size="xs"
            comboboxProps={{ withinPortal: false }}
            label="Columns by"
            allowDeselect={false}
            data={options(fields.filter((f) => BOARD_GROUP_TYPES.has(f.type)))}
            value={view.board.groupFieldId}
            onChange={(id) => {
              if (id && view.board)
                save({ board: { ...without(view.board, 'cardOrder'), groupFieldId: id } });
            }}
          />
          <Checkbox
            size="xs"
            label="Hide the no-value column"
            checked={view.board.hideEmpty === true}
            onChange={(e) => {
              if (view.board)
                save({
                  board: e.currentTarget.checked
                    ? { ...view.board, hideEmpty: true }
                    : without(view.board, 'hideEmpty'),
                });
            }}
          />
        </>
      )}
      {view.calendar && (
        <>
          <Select
            size="xs"
            comboboxProps={{ withinPortal: false }}
            label="Date"
            allowDeselect={false}
            data={options(fields.filter((f) => CALENDAR_DATE_TYPES.has(f.type)))}
            value={view.calendar.dateFieldId}
            onChange={(id) => {
              if (id && view.calendar) save({ calendar: { ...view.calendar, dateFieldId: id } });
            }}
          />
          <Select
            size="xs"
            comboboxProps={{ withinPortal: false }}
            label="Ends on"
            placeholder="Same day"
            clearable
            data={options(fields.filter((f) => f.type === 'date' || f.type === 'dateTime'))}
            value={view.calendar.endFieldId ?? null}
            onChange={(id) => {
              if (view.calendar)
                save({
                  calendar: id
                    ? { ...view.calendar, endFieldId: id }
                    : without(view.calendar, 'endFieldId'),
                });
            }}
          />
          <Select
            size="xs"
            comboboxProps={{ withinPortal: false }}
            label="Color by"
            placeholder="None"
            clearable
            data={options(fields.filter((f) => f.type === 'singleSelect'))}
            value={view.calendar.colorFieldId ?? null}
            onChange={(id) => {
              if (view.calendar)
                save({
                  calendar: id
                    ? { ...view.calendar, colorFieldId: id }
                    : without(view.calendar, 'colorFieldId'),
                });
            }}
          />
        </>
      )}
      <div>
        <div className={styles.optionsLabel}>Show on cards</div>
        <div className={styles.cardFields}>
          {cardChoices.map((f) => (
            <Checkbox
              key={f.id}
              size="xs"
              checked={cardFieldIds.includes(f.id)}
              label={
                <span className={styles.cardField}>
                  <FieldTypeIcon type={f.type} />
                  {f.name}
                </span>
              }
              onChange={(e) => {
                toggleCardField(f.id, e.currentTarget.checked);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
