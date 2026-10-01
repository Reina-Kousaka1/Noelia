# Noélia

Noélia is a clean-slate Discord bot project built around a polished ballet and
balletcore identity. It is developed in TypeScript with Eris and is not a port
of the archived Lindsey bot.

The current runtime connects through Eris, validates PostgreSQL, applies the
fresh schema, and registers development-guild `/help`, `/ping`, `/balance`, `/daily`,
`/ballet`, `/performance`, `/shop`, `/inventory`, `/wardrobe`, `/profile`, and `/market` commands without
replacing the guild's other commands.
Ballet Slippers use integer wallet balances with an auditable ledger and
interaction idempotency. Daily rewards, levelled Ballet practice with six
persistent capped stats, and a curated 62-item shop with transactional purchases
and persistent inventory are active. Inventory pages and a persistent,
ownership-checked wardrobe with saved outfit presets are also available, and `/profile` aggregates
wallet, Ballet progress, and equipped look. `/market` uses the existing Ballet Slippers wallet and ledger; listings
hold items in PostgreSQL escrow and use idempotency and row locks to protect
concurrent purchases. Only listing sellers can cancel their own listings.
`/performance` uses a data-backed catalog, the existing Ballet progression and
wallet, a fixed stat-weighted score, transactional rewards, and persistent
history; it does not use random outcomes or introduce a second economy. The
`/shop collections` command shows progress across 11 named collections; items held in
active marketplace escrow continue to count toward collection progress.

## Technology

- Node.js 24 LTS
- TypeScript 6, within the supported range of `typescript-eslint`
- Eris 0.18
- PostgreSQL 18.6 as the sole persistent data store
- ESLint, Prettier, and Vitest

## Development setup

Install Node.js 24 and npm, then install the locked dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env` and replace its placeholders locally. Startup
configuration validation is implemented and used at startup. Never commit
`.env` or paste its contents into logs or chat.

Required settings are `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`.
`NODE_ENV` defaults to `development` and accepts `development`, `test`, or
`production`. Validation errors identify variable names only and never echo
provided values.

Run the project checks:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

To start the bot after providing valid local settings, build and run:

```sh
npm run build
npm start
```

## Docker Compose

Copy `.env.example` to `.env`, set local credentials, then run:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Compose runs the bot and PostgreSQL 18.6. PostgreSQL data lives in the named
`postgres-data` volume and is not removed by ordinary `docker compose down`.
Do not use `docker compose down -v` unless you deliberately intend to erase
that database volume. PostgreSQL 18's official image stores its data under
`/var/lib/postgresql`, so the Compose volume targets that directory.

The bot receives `.env` values through a local, ignored env file; the database
container receives only its own initialization settings. No database port is
published to the host by default.

## Project layout

```text
src/       TypeScript application source
tests/     Unit and opt-in PostgreSQL integration tests
```

Discord transport, domain logic, persistence, rendering, configuration, and
infrastructure are kept separate. No legacy Java code, database schemas, or
migration history is part of this repository.

## Persona and visual language

Noélia's user-facing copy and Balletcore presence messages are centralized in
`src/persona/copy.ts`; embed colors and semantic success/warning accents live in
`src/ui/theme.ts`. Progression, shop, inventory, wardrobe, and profile responses
use a consistent blush-pink embed. Presence rotates every 15 minutes through
short studio-themed status lines. Infrastructure errors and future moderation
and audit messages remain direct and factual.

The moderation domain currently contains only a transport-independent case
draft and input policy; it does not perform moderation actions or persist cases.
Marketplace invariants and transaction behavior are documented in
`docs/architecture/marketplace.md`, `docs/architecture/performance.md`, and
`docs/architecture/catalog.md`, and `docs/architecture/wardrobe.md`.

## PostgreSQL safety

The migration runner tracks immutable, checksummed SQL migrations in
`noelia_schema_migrations`; V1 creates the Discord-user identity table, V2 adds
the Ballet Slippers wallet, idempotency records, and append-only ledger, V3 adds
append-only Daily claim history, V4 adds the first seeded Ballet activity
catalog and progression history, V5 adds the curated shop catalog, persistent
inventory, and immutable purchase history, V6 adds the persistent wardrobe
equipment slots, V7 adds marketplace listings, escrow, idempotency records, and
immutable sale history, V8 adds six Ballet stats, activity requirements, and
six more data-defined activities, V9 adds deterministic performances, V10
adds normalized collection membership and expands the curated catalog to 62
original pieces, and V11 adds persistent, idempotent outfit presets. Rarity
controls presentation only; collections grant no
automatic currency or gameplay bonuses. Purchases atomically check eligibility and balance, debit the wallet, add
inventory, and record the purchase. `/inventory` reads owned items in pages of 10. `/wardrobe` supports outfit view, equip, unequip, clear, and persistent outfit presets. Only owned items may
be equipped; preset application rechecks ownership, including marketplace
escrow, and metadata can make a costume occupy multiple slots. Economy,
practice rewards, and shop purchases use PostgreSQL transactions and row locks
to prevent negative balances or duplicate rewards during concurrent actions.
Daily reward amount is centrally configured in `src/config/gameplay.ts`
(currently 100 🩰) with a rolling 24-hour cooldown. Daily state and its
wallet/ledger reward share one transaction. Discord interaction IDs are
idempotency keys. Queries with values use PostgreSQL parameters rather than
string interpolation.

Integration tests are skipped unless `NOELIA_TEST_DATABASE_URL` is supplied.
When enabled, a hard guard requires `NODE_ENV=test`, a loopback host, and the
database name `noelia_test`; production/remote database URLs are rejected before
opening a connection. The project never copies data from the archived bot.
