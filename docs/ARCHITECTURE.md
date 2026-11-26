# Ostracon architecture

This document explains how Ostracon is built: where data lives, how it is shaped and versioned,
and how it is loaded, edited, saved, synced and encrypted.

> Ostracon is early in development. This document describes what exists; sections grow as
> features land.

## Contents

1. [Principles](#1-principles)
2. [Code map](#2-code-map)
3. [Data flow](#3-data-flow)
4. [The data file](#4-the-data-file)
5. [Schema versioning and migrations](#5-schema-versioning-and-migrations)
6. [The in-memory model](#6-the-in-memory-model)
7. [Commands, undo and redo](#7-commands-undo-and-redo)
8. [Fields, links and views](#8-fields-links-and-views)
9. [Indexes](#9-indexes)
10. [Persistence, sync and encryption](#10-persistence-sync-and-encryption)
11. [UI conventions](#11-ui-conventions)
12. [Recipes](#12-recipes)
13. [Performance](#13-performance)

## 1. Principles

- **No backend.** Ostracon is a static site. All logic runs in the browser and all data lives in
  a JSON file the user owns. The optional Dropbox sync talks to Dropbox directly from the
  browser.
- **The file is the product.** Its format is documented, versioned and migrated forward forever.
  A file written by any past version must open in every later version.
- **Schema-driven.** Users define collections and their fields. The file stores the schema
  (collections, fields, views) alongside the data (records, links), and the app's behavior for a
  value comes from its field's type.
- **Fast at scale.** Assume 50,000 records in a file and 10,000 in one collection. Lists are
  virtualized and derived data is incremental or memoized.
- **Pure core.** Logic lives in `src/domain/`, which imports no React, no store and no UI
  library. That keeps it unit-testable and lets the Web Worker run it.

## 2. Code map

```
src/
  app/          App root, route table, layout, theme, file menu and file dialogs
  domain/       Pure logic and its unit tests
    schema/       zod schema (current.ts), types, versions, migrations, fixtures, integrity checks
    model.ts      In-memory document shape, record and link bucket helpers
    fields/       Field type registry (one definition per type), operators, formatting, type changes
    links.ts      Link pairs: canonical storage, keys, lookups
    records.ts    Record titles and value text
    formulas/     Formula tokenizer, parser, type checker, functions, evaluator, compile cache
    computed.ts   Formula values per record (cached), the computed-value layer
    templates/    Template catalog (data), planning a template into an editable plan
    views/        View repair (keeping views consistent with their fields), row order (rows.ts)
    commands/     Every document mutation, as a named command
    aggregates/   DocIndex (incremental indexes: record counts, link sides)
    sync/         Three-way document merge
    settings/     Registry of user-facing settings
    demo/         Synthetic data generator (demo mode, fixtures, benchmarks)
  store/        Zustand stores: document + undo, session (file I/O), prefs, UI state, toasts
  persistence/  Codec (serialize, encrypt), storage adapters, IndexedDB working copy, worker client
  workers/      io.worker.ts: parse, migrate, validate and serialize off the main thread
  keyboard/     Command catalog, key bindings, dispatcher, command palette
  components/   Shared UI components
  features/     One folder per screen or area: home, collection (page, bulk bar, phone list),
                views (tabs, toolbar, filter/sort/group editors), table (grid, cells, editors,
                group and summary rows), record (panel and page), schema (collection and
                field editing dialogs), settings
  lib/          Small pure utilities: dates, ids, formatting, TSV, the Markdown subset
  styles/       SCSS tokens and global color variables
scripts/        gen-demo.ts (synthetic data files), gen-icons.ts
bench/          Performance benchmarks against a synthetic ~50k-record file
```

ESLint enforces the layering. `domain/` and `lib/` may not import from `store/`, `features/`,
`components/`, `app/`, React or Mantine.

## 3. Data flow

```
 file bytes ──▶ [worker] decode: unwrap JSON → migrate → validate (zod) → DocModel
                                                                       │
                     UI ──dispatch(command)──▶ docStore (Immer) ───────┤
                      ▲                          │ patches              │
                      │                          ▼                      ▼
                      └──── selectors ◀── DocIndex (incremental)   working copy (IndexedDB)
                                                                       │
 file bytes ◀── [worker] encode ◀── session.save() ◀───────────────────┘
```

1. **Open.** A storage adapter returns raw bytes. If the bytes are an encrypted envelope, the
   session decrypts them first (see §10). The I/O worker parses the JSON, migrates it to the
   current schema version, validates it with zod, runs integrity checks and converts it to the
   in-memory `DocModel`.
2. **Edit.** UI code calls `tryDispatch(name, payload)`. That runs a command inside Immer, records
   patches for undo, and updates the `DocIndex` from the patches.
3. **Autosave locally.** Every edit schedules a debounced write of the whole document to
   IndexedDB (the _working copy_). Closing the tab never loses edits.
4. **Save.** `session.save()` serializes in the worker, encrypts if enabled, and writes through
   the adapter. A revision check detects changes made elsewhere (see §10).

## 4. The data file

A data file (`*.ostracon.json`) is a single JSON object:

```jsonc
{
  "format": "ostracon",
  "schemaVersion": 1,
  "meta": { "fileId", "revision", "createdAt", "savedAt", "savedBy", "appVersion" },
  "settings": { "locale", "weekStartsOn", "defaultCurrency" },
  "collections": [ … ],
  "fields": [ … ],
  "views": [ … ],
  "records": [ … ],
  "links": [ [fieldId, fromId, toId, createdAt], … ],
  "tombstones": [ { "id", "deletedAt" } ]
}
```

The authoritative definition is `src/domain/schema/current.ts`. TypeScript types are inferred
from it (`schema/types.ts`), so types and validation cannot drift apart.

### Conventions

| Concept         | Representation                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar dates  | `YYYY-MM-DD` strings (`ISODate`), compared lexically. Never use `Date` arithmetic on them.                                                              |
| Timestamps      | ISO 8601 with offset, used for `createdAt`, `updatedAt`, `savedAt` and tombstones.                                                                      |
| Ids             | `<kind>_<random>`, e.g. `col_…`, `fld_…`, `viw_…`, `rec_…`, `opt_…` (`lib/id.ts`). Ids are never reused.                                                |
| Schema entities | Collections, fields and views are top-level arrays; fields and views carry `collectionId`. Each merges, undoes and tombstones on its own.               |
| Record values   | `values` is keyed by **field id**, so renaming a field never touches records. Empty values are omitted.                                                 |
| Links           | Stored once in `links`, from the canonical side of a link field pair, never on records. The model key `fieldId\|fromId\|toId` is also the tombstone id. |
| Optional fields | Omitted when they hold the default (`false`, empty). Code treats `undefined` as the default. Flags are `z.literal(true).optional()`.                    |
| Ordering        | User-orderable entities carry a numeric `order`. Arrays in the file are written in a canonical order so diffs stay small.                               |
| Deletion        | Removing an entity adds a tombstone `{ id, deletedAt }`, so a merge can tell "deleted" from "never existed".                                            |

## 5. Schema versioning and migrations

- `CURRENT_SCHEMA_VERSION` (`schema/version.ts`) is the version this build reads and writes.
- **There is exactly one schema module, `current.ts`.** Older versions exist as **fixtures**
  (`schema/fixtures/vN.json`) plus **migrations** (`schema/migrations/vN-to-vN+1.ts`).
- A migration upgrades raw JSON by exactly one version. It works on plain objects, never on
  current types, so old migrations keep compiling as the schema changes.
- When a file loads, migrations run in sequence up to the current version, and then the result
  is validated against `current.ts`. If migrations ran, the user is told and offered a download
  of the original. The upgraded file is written on the next save.
- A file with a newer `schemaVersion` than the app supports is refused with a clear message. It
  is never rewritten.
- The fixture test migrates every fixture forward and validates it. Fixtures are generated by
  `pnpm gen:demo`, never written by hand, and are excluded from Prettier.

**Until the first web deployment, v1 changes in place**: there are no users or real documents
yet, so the schema is edited directly (no migration, no version bump) to get v1 right. After a
change, regenerate the fixture with
`pnpm gen:demo --records 12 --seed 42 --end 2026-11-26 --out src/domain/schema/fixtures/v1.json`.

Once the app is deployed, to change the schema:

1. Edit `current.ts`.
2. Add `migrations/vN-to-vN+1.ts` and list it in `migrations/index.ts`.
3. Bump `CURRENT_SCHEMA_VERSION`.
4. Generate `fixtures/vN+1.json` with `pnpm gen:demo`.
5. Update the demo generator, the commands and the merge (`sync/merge.ts`) if needed.

Additive optional fields still need a version bump, so that an older app refuses the file instead
of silently dropping the field on save.

## 6. The in-memory model

`DocModel` (`domain/model.ts`) holds the same content as the file, but every entity list is a map
keyed by id. Commands address entities directly, and Immer patch
paths contain the entity id, which is what makes incremental index updates cheap.

**Records are grouped and bucketed.** They are stored as `records[collectionId][bucket][id]`,
where the bucket is the first character of the id's random part (62 buckets). Immer copies a
container when an entry changes, so an edit copies about 1/62 of one collection's records. Always
use the helpers: `getRecord`, `putRecord`, `removeRecord`, `iterateRecords` and `countRecords`.

**Links are bucketed too**, by the first random character of their `from` record id, and keyed
by `linkKey` (`fieldId|fromId|toId`): `links[bucket][key]`. Use `getLink`, `hasLink`, `putLink`,
`removeLink`, `iterateLinks` and `countLinks`. (With one flat map, adding a single link to a
60k-link document cost ~25 ms of Immer copying; bucketed, it is well under 1 ms.)

Conversion between the file and the model happens in the codec
(`persistence/codec/serialize.ts`), which runs in the worker.

## 7. Commands, undo and redo

Every mutation is a **command** (`domain/commands/*.ts`) declared with `defineCommand` and
registered in `commands/index.ts`:

```ts
// Simplified from domain/commands/collections.ts
export const updateCollection = defineCommand<{ id: Id; changes: CollectionChanges }>({
  label: 'Edit collection',
  run(draft, { id, changes }, { now }) {
    const collection = required(draft.collections[id], 'Collection');
    if (changes.name !== undefined && !changes.name.trim())
      throw new CommandError('Collection name is required.');
    applyChanges(collection, changes);
    collection.updatedAt = now;
  },
});
```

- Commands are pure functions of `(draft, payload, ctx)`. `ctx` supplies `now` and `newId`, so
  tests are deterministic, and `links`: a reader that answers "which records are linked to this
  one" from the `DocIndex` (which still describes the document before the command) plus the
  links the command has added so far. Link commands never scan all links. Without a reader
  (e.g. in the demo generator) `linksOf` falls back to scanning.
- An invalid command throws `CommandError`, and the document is left unchanged. UI code calls
  `tryDispatch` or `tryRun` (`store/actions.ts`), which turn errors into toasts. `toastWithUndo`
  adds an Undo button.
- `docStore.dispatch` runs the command with Immer's `produceWithPatches`. It pushes the inverse
  patches onto the undo stack and passes the touched records and links to the `DocIndex`.
- Commands keep invariants. A new collection always gets a primary field and a default view;
  deleting a collection deletes its fields, views, records and links, and the link fields in
  other collections that point at it; links keep both sides' cardinality; views are repaired
  whenever a field they use is deleted or retyped.
- Schema-driven value changes (deleting or retyping a field) don't touch a record's
  `updatedAt`: they aren't edits of the record.

## 8. Fields, links and views

### Field types

Every field type has one definition in `domain/fields/types/` (`FieldTypeDef`, registered in
`fields/registry.ts`). Everything that handles values goes through it:

| Member                             | Purpose                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `defaultConfig`, `normalizeConfig` | A new field's options; checking and completing options from user input (e.g. new select options get ids and colors). |
| `normalize`                        | Input → stored value, `undefined` for empty (which is then omitted), `INVALID` for the wrong shape.                  |
| `isValid`                          | Whether a stored value is valid (the integrity check uses it).                                                       |
| `compare`                          | Sort order of two non-empty values.                                                                                  |
| `format`                           | Text of a value: `display` (locale formats) or `raw` (canonical text `parse` reads back exactly).                    |
| `parse`                            | Typed or pasted text → value (paste, CSV import, type changes).                                                      |
| `operators`                        | Filter operators and the operand kind each takes (`fields/operators.ts`).                                            |
| `summaries`                        | Summaries offered in footers and group headers.                                                                      |

Value shapes: text-like types store strings; numbers are JSON numbers (percent as a fraction);
ratings are integers 1…max; durations are whole seconds; dates are partial dates (`YYYY`,
`YYYY-MM` or `YYYY-MM-DD`, partial only when the field allows it); date-times are floating
local time (`YYYY-MM-DDTHH:mm`); date ranges are `{ start, end? }`; selects store option ids
(multi-select in the options' order); a checked checkbox is `true` (unchecked is empty);
locations are `{ name?, address?, city?, region?, country?, lat?, lng? }`. Link, formula,
created-time and modified-time fields store nothing on records.

**Changing a field's type** (`fields/convert.ts`) plans the whole change first (new config,
every record's converted value, counts of converted and lost values, examples of what's lost)
so the UI can preview exactly what the command will do. Values go through the source type's raw
text and the target type's `parse`, with direct conversions where text would lose meaning
(select ↔ multi-select, date ↔ range ↔ date-time). Converting to a select derives its options
from the values; converting a link field yields its linked records' titles.

### Links

A link field pair (Restaurants.People ↔ People.Restaurants) shares one set of links, stored
once from the **canonical** side, the field with the smaller id: `[canonicalFieldId, fromId,
toId, createdAt]`. A symmetric link (People.Friends) is one field paired with itself, stored
with the smaller record id first. Each side has its own `multiple` flag, giving one-to-one,
one-to-many and many-to-many; link commands (`commands/links.ts`) keep both sides' cardinality
(linking to a target whose side is single-valued moves it off its previous record). Links are
listed oldest first; links added together get consecutive millisecond timestamps, so they keep
the order they were chosen in. `domain/links.ts` has the helpers.

### Views

A view stores its layout (table, board or calendar), the field order, visibility and widths,
and optional filter (nested and/or groups of conditions, with absolute or relative date
operands), sorts, grouping, summaries and board or calendar options. `views/repair.ts` keeps a
view consistent with its collection's fields: it drops references to deleted fields and to
operators or summaries a field's new type lacks, and moves a board or calendar to another
usable field (or back to a table). Commands run it after every field change; `updateView`
rejects settings that repair would change. A view's field list always covers every field
(missing ones are kept, hidden, at the end).

**View evaluation** (`views/evaluate.ts`) runs filter → quick search → sort → group over one
collection. `filter.ts` compiles the filter tree once into a predicate; conditions missing an
operand are ignored (so a half-built filter hides nothing) and negative operators ("is not",
"has none of", "is not within") match empty values. Dates compare as spans of days
(`dates.ts`): a partial date covers its month or year, a range covers its days, and relative
operands (rolling "past 3 weeks", calendar "last month", "year to date") resolve against
today and the file's week start. `groups.ts` splits sorted records by one field (option order,
date buckets, location part; empty group last) and `summaries.ts` computes footer and
group-header summaries. The UI (`features/views/useViewResult.ts`) memoizes the result on the
collection's index version, the view, the fields, the search text and today's date.

### Formulas

A formula field stores its expression with field ids (`{fld_…}`); the editor shows names
(`formulas/expression.ts`). `formulas/` parses it (precedence climbing), checks it statically
(result type number/text/date/yes-no, the fields it reads, whether it uses `TODAY()` or links;
cycles are found by following references into other formulas) and evaluates it. Compiled
formulas are cached per version of the document's field map. `computed.ts` evaluates a
formula for a record and caches the result on the record object (records are immutable), reused
while the fields are unchanged, the day is the same (for `TODAY()`) and, for formulas that read
links, the document is the same. Errors are per record (`#ERR`). Views read formulas through
`views/values.ts`, so a formula filters, sorts, groups and summarizes like a field of its result
type (`fields/dynamic.ts` gives its operators and summaries). Commands reject a formula that
doesn't check, including cycles. Sorting computes each record's sort values once.

### The table

`features/table/` is the table layout: a virtualized grid (one scroll element for both axes, a
sticky header, a frozen gutter and primary column) driven by `tableStore`, which holds the cell
cursor, the range anchor, the cell being edited, checked rows and whether the record panel is
open. Cells are addressed by record and field id, so the cursor stays on its record when rows
re-sort. The grid is one focusable element; keys are handled there (`navigation.ts` for
movement) and typing a character starts editing. Commands that act on records are in the
keyboard catalog and avoid bare letters, so they don't collide with typing.

Range work is pure and tested in `selection.ts`: copying writes canonical text (each type's
`raw` format) as TSV, pasting plans per-cell text (a single cell fills the range; a block adds
rows past the end) and dispatches one `setFromText` command, which parses each cell by its type
and creates missing select options in the same undo step. Fill down and clearing dispatch
`editRecords`.

Editors (`table/editors/`) share one contract: they produce a value or text change and commit
on Enter or Tab, cancel on Esc, and save a pending change if they close any other way (a click
elsewhere). The same editors serve table cells, the record panel and bulk "Set field".
A link field's backlink (the paired field in the other collection) is optional: a one-way
field stores its links under its own id. `addBacklink` and `removeBacklink` change that at any
time without losing links; when the pair's canonical side changes, `rekeyLinks` moves the
links (the old keys are tombstoned). Merge repair turns a field whose pair vanished into a
one-way field.

Link fields edit like other values: record commands take a link field's value as the full
list of linked record ids (`setRecordValues`, `editRecords`, `setFieldValue`), and
`setFromText` reads pasted titles (case-insensitive; several separated by commas, semicolons
or lines). `createLinkedRecord` adds a record to the other collection and links it in one undo
step (the picker's "Create"). In the table, a link chip in the selected cell opens the linked
record.

**Screen sizes.** Phones (< 640px wide) show the view as a list (with group headers) and open
records as pages; the view tabs and an icon-only toolbar stay. Short screens (≤ 520px tall:
landscape phones) fold the collection header into the view bar. Touch screens show row
controls without hover and edit a selected cell on tap. Dialogs fill the screen on phones
(`app/theme.module.scss`).

`record/RecordDetails` lists every field of a record and is both the side panel and the record
page (`#/c/<collectionId>/r/<recordId>`, also the phone view of a record). Phones get a list
instead of the grid.

## 9. Indexes

`DocIndex` (`aggregates/docIndex.ts`) is built once on load and then updated per touched record
and link:

| Index                                             | Used for                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| record counts                                     | Home tiles, headers                                                            |
| `collectionVersion`                               | Bumped by any record or link change in a collection; view caches key on it     |
| link sides (forward/backward per canonical field) | `linked(field, recordId)` in O(links of the record), for either side of a pair |

The recently edited list and the search index are added as those features land.

## 10. Persistence, sync and encryption

### Storage adapters

Adapters (`persistence/adapters/`) move opaque bytes. They know nothing about JSON, schemas or
encryption.

| Adapter     | Where                                                                                                          | Change detection                         |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `fs-access` | A real file on disk (File System Access API, Chromium desktop). The handle is kept in IndexedDB for reopening. | `lastModified`                           |
| `download`  | Everywhere else: open with a file picker, save by downloading (or the share sheet on touch devices)            | Revision comparison on open              |
| `dropbox`   | The app's own Dropbox folder (OAuth PKCE in the browser, no server)                                            | Dropbox `rev`, and `update` mode uploads |

To add a backend, implement `StorageAdapter` (`persistence/types.ts`) and register it in
`adapters/index.ts`.

### Working copy

The open document is continuously written to IndexedDB (`persistence/workingCopy.ts`), together
with its source, base revision and dirty flag. On startup, the working copy is restored, and the
user is told if it holds unsaved edits. IndexedDB also holds the remembered file handles,
remembered encryption keys, and the **merge base**: the bytes last read from or written to
storage.

### Revisions, conflicts and merging

- `meta.revision` increments on every save. `savedBy` records a per-device id.
- Before overwriting, an adapter checks that the stored file is still the version that was last
  read (`lastModified` or `rev`). If it isn't, the save returns `changed` with the other version's
  bytes. If only the timestamp changed and the revision didn't, the save proceeds.
- The conflict dialog offers **Merge both** (recommended), Keep only mine, Save mine as a copy,
  or Use theirs.
- **Merging** (`domain/sync/merge.ts`) is a three-way merge of `base`, `local` and `remote`:
  - Collections, fields, views and records merge per entity, by id. An entity changed on one side
    only takes that side's version. An entity changed differently on both sides keeps the newer
    edit and is reported as a conflict. An edit always beats a deletion.
  - Links merge as a set: each side's additions and removals apply.
  - Settings merge field by field, and tombstones are unioned.
  - A repair pass then removes references the other side's deletions broke: values for deleted
    fields, view columns for deleted fields, links to deleted records or fields.
  - The merged document is saved on top of the remote revision, and the user sees a summary.
- On startup, and whenever the app comes back (visible again, focused, restored from the
  back/forward cache, or back online), it checks whether the file changed elsewhere. If there are
  no local edits, it reloads silently. If there are, it offers the merge.
- Unsaved changes are tracked against the undo history: each step has a content id, and the
  document is clean when its current id is the one last saved.

### Encryption

Encryption is opt-in per file (`persistence/codec/crypto.ts`). The encrypted file is a JSON
envelope:

```jsonc
{
  "format": "ostracon-encrypted",
  "envelopeVersion": 1,
  "fileId": "fil_…",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "…" },
  "cipher": { "name": "AES-GCM", "iv": "…" },
  "payload": "…base64…",
}
```

- The key is derived from the passphrase with PBKDF2. The salt is fixed per file and the IV is
  fresh on every save. The file id is bound as additional authenticated data.
- The working copy and the merge base are stored encrypted too. A device can remember the key as
  a **non-extractable** `CryptoKey` in IndexedDB. Otherwise the passphrase is asked for on open.
- The plaintext inside the envelope is a normal data file, so schema versioning is independent
  of encryption.
- An encrypted file never becomes unencrypted without the user's say-so: if an unencrypted copy
  of the open encrypted file is about to be loaded or merged in, the user is asked first.

### Security headers

`public/_headers` sets the production headers (`pnpm preview` applies the same ones). The CSP
allows scripts from this origin only and network requests to this origin and Dropbox's API only.
Images may load from any `https:` origin, for URL fields shown as thumbnails (opt-in per
field). It also requires **Trusted Types**: code-loading sinks accept only values from the single
`default` policy in `src/app/trustedTypes.ts`, which rejects any HTML containing markup.

## 11. UI conventions

- **Routing**: hash-based (`#/path`). Each screen is one entry in `app/routes.ts` plus a lazily
  loaded page in `features/<name>/`. Collections live at `#/c/<collectionId>/<viewId?>` and
  records at `#/c/<collectionId>/r/<recordId>`.
- **Keyboard**: declare every command once in `keyboard/catalog.ts` and attach handlers with
  `useCommandHandlers`. Shortcuts, the ⌘K palette, the `?` overlay and Settings → Keyboard all
  read the catalog, and users can rebind any command. `g h` goes home, `g 1`…`g 9` to a
  collection by its sidebar position.
- **App-wide dialogs**: the new-collection, collection-settings and field-editor dialogs
  (`features/schema/`) are mounted once in `App` and opened through `ui` (`store/uiStore.ts`),
  so any screen, menu or keyboard command can open them.
- **Colors**: select options and collections use the named palette (`domain/fields/colors.ts`);
  each color has `--os-<name>` (swatch), `--os-<name>-bg` and `--os-<name>-fg` (chips), checked
  for 4.5:1 contrast in both themes.
- **Settings**: declare options in `domain/settings/registry.ts` with `file` scope or `device`
  scope (`store/prefsStore.ts`). The Settings screen renders them automatically.
- **Styling**: SCSS modules next to their component. Use `@use '@/styles/tokens' as *;` for
  spacing, type and breakpoints, and `var(--os-*)` for colors. The accent is terracotta. Mantine
  provides complex controls and is themed compact in `app/theme.ts`.
- **Density**: rows are about 26px, base type is 13px, numbers are tabular, and chrome and
  explanatory text are kept to a minimum.
- **Heavy work** (parsing, migration, validation, serialization) runs in the I/O worker. zod and
  the codec stay out of the main bundle.

## 12. Recipes

**Add a command.** Write it in the relevant `domain/commands/*.ts` file, register it in
`commands/index.ts`, add a test, and call it from the UI with `tryDispatch`.

**Add a screen.** Add a route in `app/routes.ts` and a page in `features/<name>/`. Add a `go to`
keyboard command in the catalog if it deserves one.

**Add a formula function.** Add an entry to `domain/formulas/functions.ts` (parameters, result
type, implementation); checking, evaluation and the editor's autocomplete read the table.

**Add a template.** Add an entry to `domain/templates/catalog.ts` (fields by key, links to other
templates by key, starter views); the gallery, preview and `createFromTemplate` read it. The
catalog test checks every config and creates every template.

**Add a field type.** Add `FieldType` to the schema (`current.ts`, a schema change), write its
definition in `fields/types/`, register it in `fields/registry.ts` (and `FIELD_TYPE_ORDER`),
cover it in `fields/types.test.ts`, then add its display to `table/cells/CellValue.tsx`, its
editor to `table/editors/ValueEditor.tsx` and its config to `schema/FieldConfigEditor.tsx`.

**Before finishing any change.** Run `pnpm check`, and `pnpm bench` if you touched commands,
the index or anything that runs per record. Never commit real personal data; use
`pnpm gen:demo` for samples.

## 13. Performance

`pnpm bench` builds a ~50k-record document (7,400 people with restaurants, visits, books, trips
and devices; ~60k links, 20 MB) and fails if a target is missed. Current results on a laptop:
parse + validate + integrity ~380 ms, serialize ~120 ms, index build ~75 ms, one edit ~0.1 ms,
setting one record's links ~1 ms, adding a field 0.2 ms, bulk-setting or retyping a field on
22k records ~200 ms, pasting 1,000 rows ~10 ms, evaluating a filtered and sorted 22k-record view ~20 ms, searching
it ~33 ms.
