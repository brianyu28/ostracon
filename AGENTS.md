# Agent & contributor guide

Ostracon is a client-side-only record-keeping PWA: React + TypeScript, no backend. User data
lives in a versioned JSON file the user owns; the app opens, edits and saves it. A document holds
user-defined **collections** of **records**, each collection with its own **fields** and
**views**.

**Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the data model, schema versioning,
persistence, sync and encryption.

## Commands

Use **pnpm** (never npm/yarn).

| Command                         | What it does                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                      | Dev server                                                                           |
| `pnpm check`                    | **Run before calling any change done**: typecheck, lint, format check, tests, build  |
| `pnpm test` / `pnpm test:watch` | Vitest                                                                               |
| `pnpm format`                   | Prettier write                                                                       |
| `pnpm build` / `pnpm preview`   | Production build (static `dist/`) and local preview                                  |
| `pnpm gen:demo --out <file>`    | Write a synthetic demo data file (`--records`, `--seed`, `--end`)                    |
| `pnpm gen:icons`                | Regenerate every app icon in `public/` from `assets/icon.svg` (the only icon source) |

## Layout

```
src/
  app/          shell: App root, routes table, layout, theme, file dialogs, PWA update prompt
  domain/       pure TypeScript logic (no React, no store) + unit tests
  store/        Zustand stores: document + undo, session (file I/O), prefs, UI state, toasts
  persistence/  codec (serialize / encrypt), storage adapters, IndexedDB working copy
  workers/      Web Workers (file load/save off the main thread)
  keyboard/     command catalog, shortcuts, command palette
  components/   shared UI components
  features/     one folder per screen (home, collection, settings, …)
  lib/          small generic utilities (date, id, format)
  styles/       _tokens.scss (spacing/type/breakpoints/mixins), global.scss (color variables)
```

Navigation is driven by the single route table in `src/app/routes.ts`. Adding a screen means one
entry there plus a page component in `src/features/<name>/`.

Other single sources of truth:

- **Keyboard commands**: declare a command once in `src/keyboard/catalog.ts` (id, title, default
  keys), then attach a handler where it applies with `useCommandHandlers`. Shortcuts, the ⌘K
  palette, the `?` overlay and Settings → Keyboard all read the catalog; users can rebind any of
  them.
- **Settings**: declare user-facing options in `src/domain/settings/registry.ts` (file or device
  scope); the Settings screen renders them automatically. Device preferences live in
  `src/store/prefsStore.ts`.
- **Document changes**: add a command in `src/domain/commands/` and register it in
  `src/domain/commands/index.ts`. UI code calls `tryDispatch`/`tryRun` (`src/store/actions.ts`),
  which show rejected commands as toasts.

## Rules

- **Public repository: never commit personal data.** No real names, places or data files in
  code, tests, fixtures, screenshots or commit messages. Use synthetic data. Data files
  (`*.ostracon.json`) are gitignored.
- **`domain/` and `lib/` stay pure**: no React, Mantine, store or feature imports (ESLint
  enforces this). Logic goes here so it is testable and reusable from Web Workers.
- **Dates are `YYYY-MM-DD` strings** (`ISODate`), compared lexically. No time zones, no `Date`
  math on calendar dates.
- **Record values are keyed by field id**, never by field name, and every value goes through
  its field type's definition (`src/domain/fields/`): `normalize` on input, `format` for text.
  Links between records live in the document's `links` table, never on records.
- **UI mutates data only through named store commands** (they power undo/redo).
- **Schema changes**: until the first web deployment, v1 is edited in place (no migration;
  regenerate `fixtures/v1.json` with `pnpm gen:demo`). After deployment they need a migration:
  bump the schema version, add a single-step migration and a fixture, and keep older fixtures migrating cleanly (see
  `src/domain/schema/migrations/index.ts`). The only schema module is
  `src/domain/schema/current.ts`; old versions exist as fixtures. Fixtures are generated with
  `pnpm gen:demo` and must not be hand-formatted.
- **Access records and links through the helpers in `src/domain/model.ts`** (`getRecord`,
  `putRecord`, `removeRecord`, `iterateRecords`; `getLink`, `putLink`, `removeLink`,
  `iterateLinks`). Both are stored in buckets so an edit doesn't copy everything. In commands,
  read links with `linksOf(…, ctx.links)`, never by scanning.
- **Heavy work runs in the I/O worker** (`src/workers/io.worker.ts`): parsing, migration,
  validation and serialization. Keep zod and the codec out of the main bundle.
- **Performance matters**: assume 50k records in a file and 10k in one collection. Virtualize
  long lists and keep derived data incremental or memoized. Run `pnpm bench` when touching
  commands, the index or per-record code.
- **Styling**: SCSS modules co-located with components (`Foo.tsx` + `Foo.module.scss`), one
  component per file. `@use '@/styles/tokens' as *;` for sizes/breakpoints; colors via
  `var(--os-*)`. No Tailwind or CSS-in-JS. Mantine for complex controls, themed compact
  (`src/app/theme.ts`).
- **Information density**: compact rows (~26px), 13px base type, tabular numbers, minimal chrome
  and explanatory text.
- **No HTML strings**: never use `dangerouslySetInnerHTML`, `innerHTML` or inline scripts. The
  CSP enforces Trusted Types and rejects markup (`src/app/trustedTypes.ts`); rich text renders
  through React elements. Test UI changes with `pnpm build && pnpm preview`, which applies the
  production headers.
- Keep dependencies minimal; justify any new one.
- Routing is hash-based (`#/path`) so the static build works on any host without rewrites.
