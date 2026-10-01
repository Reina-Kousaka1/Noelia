# Contributing to Noélia

Thanks for considering a contribution. Keep changes focused, explain the user
or maintenance problem they address, and use a pull request so the repository's
checks can run.

## Development environment

- Node.js 24 or newer (the CI workflow uses Node.js 24)
- npm 11, as declared by `packageManager` in `package.json`
- PostgreSQL 18.6 for integration tests and local bot runs

Install dependencies from the lockfile:

```sh
npm ci
```

Copy `.env.example` to `.env` for local development and fill in local-only
settings. Never commit `.env` or place credentials in logs, screenshots, test
fixtures, or pull request descriptions.

## Checks

Run the available quality gates before opening a pull request:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

`npm run check` runs formatting, lint, typecheck, tests, and build. PostgreSQL
integration tests are opt-in locally through `NOELIA_TEST_DATABASE_URL`. Use a
loopback PostgreSQL test database named `noelia_test` with `NODE_ENV=test`;
the test guard rejects other database targets. CI provisions this isolated test
database automatically.

## Migrations

The application applies ordered, checksummed SQL migrations from `migrations/`
at startup. Applied migrations are immutable. Add a new additive migration for
every schema change; do not edit or renumber an existing migration.

For a migration, verify a fresh database and an upgrade from the previous
schema. Keep existing data intact, use parameterized SQL for values, and add
integration coverage where appropriate.

## Architecture and safety

- Keep domain rules independent from Discord rendering and interaction details.
- PostgreSQL is the persistent source of truth.
- Persona generation and copy are presentation concerns; they must not decide
  domain outcomes.
- Preserve Discord Interaction ID idempotency for mutations and make retries
  safe.
- Do not log secrets, tokens, credentials, webhook URLs, or `.env` contents.
- Use parameterized SQL; do not interpolate user-provided values into queries.
- Put permission-sensitive checks in shared server-side logic, not only in UI
  visibility or command registration.

## Pull requests

Prefer focused commits and small, reviewable changes. Avoid unrelated rewrites
and generated output. Include tests and update documentation when behavior or
developer workflows change. Contributors may work on a branch and submit a
pull request; do not force-push over another contributor's published work.
