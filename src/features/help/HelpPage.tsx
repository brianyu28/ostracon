import { Kbd } from '@mantine/core';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { FIELD_TYPE_ORDER, fieldType } from '@/domain/fields/registry';
import { FUNCTIONS } from '@/domain/formulas/functions';
import { DATE_INPUT, FIELD_HELP, FUNCTION_GROUPS, OPERATORS } from './helpContent';
import styles from './HelpPage.module.scss';

const SECTIONS = [
  ['basics', 'Basics'],
  ['fields', 'Field types'],
  ['links', 'Links'],
  ['views', 'Views'],
  ['formulas', 'Formulas'],
  ['keys', 'Keyboard'],
  ['file', 'Your file'],
] as const;

/** Short reference: how collections, records, fields, links, views and formulas work. */
export function HelpPage() {
  return (
    <div className={styles.root}>
      <nav className={styles.toc} aria-label="Help sections">
        {SECTIONS.map(([id, title]) => (
          <a
            key={id}
            href={`#/help`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'start' });
            }}
          >
            {title}
          </a>
        ))}
      </nav>
      <div className={styles.content}>
        <section id="help-basics">
          <h2>Basics</h2>
          <dl className={styles.terms}>
            <dt>Collection</dt>
            <dd>A list of one kind of thing (People, Books). Start blank or from a template.</dd>
            <dt>Record</dt>
            <dd>One item in a collection. Its title is the primary field.</dd>
            <dt>Field</dt>
            <dd>
              A column with a type. Rename, reorder or change the type anytime; you’ll see what
              converts first.
            </dd>
            <dt>View</dt>
            <dd>A saved way to look at a collection: filters, sorts, groups, visible fields.</dd>
            <dt>Link</dt>
            <dd>A field connecting records across collections (or within one).</dd>
          </dl>
        </section>

        <section id="help-fields">
          <h2>Field types</h2>
          <table className={styles.table}>
            <tbody>
              {FIELD_TYPE_ORDER.map((t) => (
                <tr key={t}>
                  <th>
                    <span className={styles.type}>
                      <FieldTypeIcon type={t} />
                      {fieldType(t).label}
                    </span>
                  </th>
                  <td>{FIELD_HELP[t]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Typing dates</h3>
          <table className={styles.table}>
            <tbody>
              {DATE_INPUT.map(([input, meaning]) => (
                <tr key={input}>
                  <th>
                    <code>{input}</code>
                  </th>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="help-links">
          <h2>Links</h2>
          <ul className={styles.list}>
            <li>A link field points at one collection, to one record or many.</li>
            <li>
              A <b>backlink</b> is the matching field in the other collection. It’s optional: add or
              remove it later in the field editor; the links stay.
            </li>
            <li>Linking a collection to itself can use one shared field (like Friends).</li>
            <li>Type to find records; “Create” adds a new one and links it.</li>
            <li>Paste titles (“Ana, Bo”) into a link column to link by name.</li>
          </ul>
        </section>

        <section id="help-views">
          <h2>Views</h2>
          <ul className={styles.list}>
            <li>
              <b>Filter</b>: conditions joined by and/or, nestable. Dates can be relative (last 7
              days, this month, year to date).
            </li>
            <li>
              <b>Sort</b>: several fields, in priority order.
            </li>
            <li>
              <b>Group</b>: by one field; dates by day, week, month or year. Click a group to
              collapse it.
            </li>
            <li>
              <b>Summaries</b>: click the footer under a column (sum, average, earliest…).
            </li>
            <li>
              <b>Board</b>: a column per option (or checked, or rating). Drag cards to change the
              value or order; <Kbd>⇧</Kbd>+arrows move the selected card.
            </li>
            <li>
              <b>Calendar</b>: records on their dates; ranges span days. Drag to reschedule.{' '}
              <Kbd>T</Kbd> today, <Kbd>[</Kbd> <Kbd>]</Kbd> months, <Kbd>N</Kbd> adds on the
              selected day.
            </li>
            <li>
              Add a view with <b>+</b> next to the tabs; a tab’s menu switches its layout.
            </li>
            <li>
              <b>Search</b> (<Kbd>⌘F</Kbd>) only filters what you see; it isn’t saved.
            </li>
          </ul>
        </section>

        <section id="help-formulas">
          <h2>Formulas</h2>
          <ul className={styles.list}>
            <li>
              Refer to fields in braces: <code>{'{Pages} / 2'}</code>. Renaming a field doesn’t
              break formulas.
            </li>
            <li>
              The result is a number, text, date or yes/no, shown as you type. Errors appear before
              you save.
            </li>
            <li>
              A record that can’t be calculated (like dividing by zero) shows <code>#ERR</code>.
            </li>
            <li>A link field inside a formula is its linked titles, comma-separated.</li>
          </ul>
          <h3>Operators</h3>
          <table className={styles.table}>
            <tbody>
              {OPERATORS.map(([op, meaning]) => (
                <tr key={op}>
                  <th>
                    <code>{op}</code>
                  </th>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {FUNCTION_GROUPS.map(([group, names]) => (
            <div key={group}>
              <h3>{group}</h3>
              <table className={styles.table}>
                <tbody>
                  {names.map((name) => {
                    const fn = FUNCTIONS.get(name);
                    return fn ? (
                      <tr key={name}>
                        <th>
                          <code>{fn.signature}</code>
                        </th>
                        <td>{fn.description}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section id="help-keys">
          <h2>Keyboard</h2>
          <ul className={styles.list}>
            <li>
              Press <Kbd>?</Kbd> for every shortcut, <Kbd>⌘K</Kbd> for commands. Rebind them in
              Settings.
            </li>
            <li>
              In a table, typing edits the selected cell. <Kbd>Enter</Kbd> edits, <Kbd>Esc</Kbd>{' '}
              cancels, <Kbd>Tab</Kbd> moves on.
            </li>
            <li>
              <Kbd>Space</Kbd> opens the record panel. <Kbd>⌘C</Kbd>/<Kbd>⌘V</Kbd> copy and paste
              with spreadsheets. <Kbd>⌘D</Kbd> fills down.
            </li>
            <li>
              Letter shortcuts (like <Kbd>n</Kbd> for a new record) work outside the table: press{' '}
              <Kbd>Esc</Kbd> first.
            </li>
          </ul>
        </section>

        <section id="help-file">
          <h2>Your file</h2>
          <ul className={styles.list}>
            <li>
              Everything lives in one file you own (<code>.ostracon.json</code>), optionally
              encrypted with a passphrase.
            </li>
            <li>
              Changes are kept in this browser until you save, so nothing is lost if you close the
              tab.
            </li>
            <li>
              Undo (<Kbd>⌘Z</Kbd>) covers every change, including deletes and imports.
            </li>
            <li>
              <b>Search</b> every collection with <Kbd>⌘P</Kbd> or <Kbd>/</Kbd>; start with{' '}
              <Kbd>&gt;</Kbd> for commands.
            </li>
            <li>
              <b>Import</b> a CSV from a collection’s menu (or New collection): columns map to
              fields, new fields get a guessed type, link columns match titles. Import an exported
              collection (or any Ostracon file) to copy its collections into this one.
            </li>
            <li>
              <b>Export</b> a view as CSV, a collection (to import elsewhere) or its records as JSON
              from its menu; a copy of the whole file from the file menu. Exports are never
              encrypted.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
