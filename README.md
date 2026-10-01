# Noélia

Noélia is a clean-slate Discord bot project built around a polished ballet and
balletcore identity. It is being developed in TypeScript with Eris; it is not a
port of the archived Lindsey bot.

This initial bootstrap establishes the project toolchain and identity only.
PostgreSQL, economy, shop, wardrobe, and ballet gameplay are not implemented
yet. The current runtime connects through Eris and registers a development-guild
`/ping` command without replacing the guild's other commands.

## Technology

- Node.js 24 LTS
- TypeScript 6 (kept within the currently supported range of `typescript-eslint`)
- Eris 0.18
- PostgreSQL is planned as the sole persistent data store
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
tests/     Unit tests
```

Domain modules, Discord transport, persistence, rendering, configuration, and
infrastructure will be added in separate, tested steps. No legacy Java code,
database schemas, or migration history is part of this repository.
