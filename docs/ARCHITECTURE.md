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
8. [Indexes](#8-indexes)
9. [Persistence, sync and encryption](#9-persistence-sync-and-encryption)
10. [UI conventions](#10-ui-conventions)
11. [Recipes](#11-recipes)

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
    model.ts      In-memory document shape and record bucket helpers
    commands/     Every document mutation, as a named command
    aggregates/   DocIndex (incremental indexes)
    sync/         Three-way document merge
    settings/     Registry of user-facing settings
    demo/         Synthetic data generator (demo mode, fixtures)
  store/        Zustand stores: document + undo, session (file I/O), prefs, UI state, toasts
  persistence/  Codec (serialize, encrypt), storage adapters, IndexedDB working copy, worker client
  workers/      io.worker.ts: parse, migrate, validate and serialize off the main thread
  keyboard/     Command catalog, key bindings, dispatcher, command palette
  components/   Shared UI components
  features/     One folder per screen: home, collection, settings
  lib/          Small pure utilities: dates, ids, formatting
  styles/       SCSS tokens and global color variables
scripts/        gen-demo.ts (synthetic data files), gen-icons.ts
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
   session decrypts them first (see §9). The I/O worker parses the JSON, migrates it to the
   current schema version, validates it with zod, runs integrity checks and converts it to the
   in-memory `DocModel`.
2. **Edit.** UI code calls `tryDispatch(name, payload)`. That runs a command inside Immer, records
   patches for undo, and updates the `DocIndex` from the patches.
3. **Autosave locally.** Every edit schedules a debounced write of the whole document to
   IndexedDB (the _working copy_). Closing the tab never loses edits.
4. **Save.** `session.save()` serializes in the worker, encrypts if enabled, and writes through
   the adapter. A revision check detects changes made elsewhere (see §9).

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

**v1 is still in development** and may change without a migration until it is frozen (at the end
of the domain-core phase); regenerate `fixtures/v1.json` when it changes:
`pnpm gen:demo --records 12 --seed 42 --end 2026-11-26 --out src/domain/schema/fixtures/v1.json`.

After that, to change the schema:

1. Edit `current.ts`.
2. Add `migrations/vN-to-vN+1.ts` and list it in `migrations/index.ts`.
3. Bump `CURRENT_SCHEMA_VERSION`.
4. Generate `fixtures/vN+1.json` with `pnpm gen:demo`.
5. Update the demo generator, the commands and the merge (`sync/merge.ts`) if needed.

Additive optional fields still need a version bump, so that an older app refuses the file instead
of silently dropping the field on save.

## 6. The in-memory model

`DocModel` (`domain/model.ts`) holds the same content as the file, but every entity list is a map
keyed by id (links are keyed by `linkKey`). Commands address entities directly, and Immer patch
paths contain the entity id, which is what makes incremental index updates cheap.

**Records are grouped and bucketed.** They are stored as `records[collectionId][bucket][id]`,
where the bucket is the first character of the id's random part (62 buckets). Immer copies a
container when an entry changes, so an edit copies about 1/62 of one collection's records. Always
use the helpers: `getRecord`, `putRecord`, `removeRecord`, `iterateRecords` and `countRecords`.

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
  tests are deterministic.
- An invalid command throws `CommandError`, and the document is left unchanged. UI code calls
  `tryDispatch` or `tryRun` (`store/actions.ts`), which turn errors into toasts. `toastWithUndo`
  adds an Undo button.
- `docStore.dispatch` runs the command with Immer's `produceWithPatches`. It pushes the inverse
  patches onto the undo stack and passes the touched records to `DocIndex.update`.
- Commands keep invariants. For example, a new collection always gets a primary field and a
  default view, and deleting a collection deletes its fields, views, records and links.

## 8. Indexes

`DocIndex` (`aggregates/docIndex.ts`) is built once on load and then updated per touched record.
Today it holds per-collection record counts and versions (view caches key on the version). Link
sides, the recently edited list and the search index are added as those features land.

## 9. Persistence, sync and encryption

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
It also requires **Trusted Types**: code-loading sinks accept only values from the single
`default` policy in `src/app/trustedTypes.ts`, which rejects any HTML containing markup.

## 10. UI conventions

- **Routing**: hash-based (`#/path`). Each screen is one entry in `app/routes.ts` plus a lazily
  loaded page in `features/<name>/`. Collections live at `#/c/<collectionId>/<viewId?>`.
- **Keyboard**: declare every command once in `keyboard/catalog.ts` and attach handlers with
  `useCommandHandlers`. Shortcuts, the ⌘K palette, the `?` overlay and Settings → Keyboard all
  read the catalog, and users can rebind any command. `g h` goes home, `g 1`…`g 9` to a
  collection by its sidebar position.
- **Settings**: declare options in `domain/settings/registry.ts` with `file` scope or `device`
  scope (`store/prefsStore.ts`). The Settings screen renders them automatically.
- **Styling**: SCSS modules next to their component. Use `@use '@/styles/tokens' as *;` for
  spacing, type and breakpoints, and `var(--os-*)` for colors. The accent is terracotta. Mantine
  provides complex controls and is themed compact in `app/theme.ts`.
- **Density**: rows are about 26px, base type is 13px, numbers are tabular, and chrome and
  explanatory text are kept to a minimum.
- **Heavy work** (parsing, migration, validation, serialization) runs in the I/O worker. zod and
  the codec stay out of the main bundle.

## 11. Recipes

**Add a command.** Write it in the relevant `domain/commands/*.ts` file, register it in
`commands/index.ts`, add a test, and call it from the UI with `tryDispatch`.

**Add a screen.** Add a route in `app/routes.ts` and a page in `features/<name>/`. Add a `go to`
keyboard command in the catalog if it deserves one.

**Before finishing any change.** Run `pnpm check`. Never commit real personal data; use
`pnpm gen:demo` for samples.
