# Ostracon

A fast, information-dense record-keeping app that runs entirely in your browser. Keep collections
of records about the things in your life (people, restaurants, books, trips, devices) and view
them in different ways. Your data stays in a JSON file you own. There's no account, no server and
no tracking.

> **Status:** early development. The file, persistence, sync and keyboard infrastructure is in
> place. Collections, fields, views and editing are being built (see the plan).

**Features (planned)**

- Collections with user-defined fields: text, rich text, numbers with formats, ratings,
  durations, dates (including partial dates), selects, checkboxes, URLs, locations, formulas
- Two-way links between collections (e.g. restaurants ↔ the people you ate with)
- Views with filters (including relative dates such as "the past 3 weeks"), sorting, grouping
  and field visibility, as a table, board or calendar
- Templates for common collections, or a blank collection you define yourself
- Optional passphrase encryption and Dropbox sync with automatic merging
- Installable PWA that works offline, with keyboard shortcuts throughout

Try it without any data via **Try with demo data** on the welcome screen.

## Development

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev      # start the dev server
pnpm check    # typecheck, lint, format check, test, build
```

The production build (`pnpm build`) is a static site in `dist/` that can be served by any static
host.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the app works and
[AGENTS.md](AGENTS.md) for conventions and rules when contributing.

## Deployment (Cloudflare Workers)

The app is deployed as a Cloudflare Worker that serves only static assets
([`wrangler.jsonc`](wrangler.jsonc)). No Worker code runs.

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, and pick
   the GitHub repository.
2. Set the build command to `pnpm build` and the deploy command to `npx wrangler deploy`.
   Optionally, add a `VITE_DROPBOX_APP_KEY` build variable (see below).
3. After the first deploy, add a custom domain under the Worker's **Settings → Domains & Routes**.

## Dropbox sync (optional)

Ostracon can keep the data file in Dropbox so it can be used from several devices. It talks to
Dropbox directly from the browser (OAuth with PKCE, no server) and only has access to its own app
folder. Edits saved from two devices are merged.

1. Create an app at <https://www.dropbox.com/developers/apps>: Scoped access, App folder. Dropbox
   names the folder after the app (`Apps/<app name>`). If yours isn’t "Ostracon Database", update
   `DROPBOX_FOLDER` in `src/persistence/adapters/dropbox.ts` so the app shows the right location.
2. Under Permissions, enable `files.metadata.read`, `files.content.read` and
   `files.content.write`.
3. Under OAuth 2 → Redirect URIs, add each URL the app is served from, e.g.
   `http://localhost:5174/` and your deployed URL (with the trailing slash, without `#/…`).
4. Provide the app key at build time (`VITE_DROPBOX_APP_KEY=… pnpm build`, or in `.env.local`
   for `pnpm dev`), or paste it under Settings → Storage on each device.

The app key is not a secret; PKCE needs no client secret.

## Encryption (optional)

Settings → Storage → Encrypt with a passphrase writes the file as AES-256-GCM, with the key
derived from the passphrase by PBKDF2-SHA-256 (600,000 iterations). A lost passphrase can't be
recovered. Each device can remember the key (as a non-extractable key in IndexedDB) so it doesn't
ask every time.

## License

[MIT](LICENSE)
