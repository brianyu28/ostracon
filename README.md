# Ostracon

[Ostracon](https://ostracon.brianyu.me/) is a record-keeping web application for maintaining a personal database. Keep track of restaurants, books, movies, trips, or any other collections of your choice.

Your data is always yours: Ostracon has no servers and no accounts. Your data is kept in a single file that you own.

**Features**

- Create collections with user-defined fields.
- Link records between collections.
- Sort, filter, and group data into different views of your collections.
- Optional AES-256-GCM encryption.
- Optional Dropbox sync.

[Try Ostracon](https://ostracon.brianyu.me/) via **Try with demo data** on the welcome screen.

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

## License

[MIT](LICENSE)
