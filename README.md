# Noélia

Noélia is a clean-slate Discord bot project built around a polished ballet and
balletcore identity. It is developed in TypeScript with Eris and is not a port
of the archived Lindsey bot.

The current runtime connects through Eris, validates PostgreSQL, applies the
fresh schema, and registers development-guild `/ping` and `/balance` commands
without replacing the guild's other commands. Ballet Slippers use integer
wallet balances with an auditable ledger and interaction idempotency. Daily
rewards, ballet progression, shop, inventory, and wardrobe are not implemented
yet.

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

## Project layout

```text
src/       TypeScript application source
tests/     Unit and opt-in PostgreSQL integration tests
```

Discord transport, domain logic, persistence, rendering, configuration, and
infrastructure are kept separate. No legacy Java code, database schemas, or
migration history is part of this repository.

## PostgreSQL safety

The migration runner tracks immutable, checksummed SQL migrations in
`noelia_schema_migrations`; V1 creates the Discord-user identity table and V2
adds the Ballet Slippers wallet, idempotency records, and append-only ledger.
Economy changes use PostgreSQL transactions and row locks to prevent negative
balances during concurrent spending. Discord interaction IDs are wallet
idempotency keys. Transactions always use one checked-out PostgreSQL client.
Queries with values use PostgreSQL parameters rather than string interpolation.

Integration tests are skipped unless `NOELIA_TEST_DATABASE_URL` is supplied.
When enabled, a hard guard requires `NODE_ENV=test`, a loopback host, and the
database name `noelia_test`; production/remote database URLs are rejected before
opening a connection. The project never copies data from the archived bot.
