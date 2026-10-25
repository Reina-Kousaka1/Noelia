# Noélia's DBX read-only connector

This directory contains only Noélia's side of the shared DBX operations setup:
an optional Compose overlay that attaches the existing PostgreSQL service to
the dedicated `dbx-ops` network and a manual read-only-role bootstrap script.
Noélia's bot, database schema, migration runner, and existing Compose defaults
remain unchanged. This does not add a DBX service to Noélia; the single shared
DBX Web service is maintained in [Tori's DBX operations guide](https://github.com/Reina-Kousaka1/Tori/blob/main/Tori/ops/dbx/README.md).

The overlay gives PostgreSQL the network alias `noelia-postgres` and does not
publish a host port or attach the bot to the shared operations network. The
existing PostgreSQL named volume is untouched by the overlay. Applying the
overlay can recreate the PostgreSQL container to attach the network; schedule
that step and verify the actual Compose project/volume mapping on the Pi first.
Never run `docker compose down -v`.

## Later Pi steps

These steps are documentation only; nothing here has been executed against a
Pi or database.

After the DBX-only change has been reviewed and merged to Noélia `main`:

1. In the existing Noélia workspace, check `git status --short --branch`, the
   Compose project name, container, and exact named volume. Preserve any dirty
   files; do not reset or stash them.
2. Pull only the intended branch with `git pull --ff-only origin main`.
3. From the Noélia repository root, resolve the full configuration before
   applying it:

   ```sh
   docker compose -f compose.yaml -f ops/dbx/compose.dbx.override.yaml config --quiet
   ```

4. During an approved maintenance window, apply only the existing PostgreSQL
   service so it joins the already-created `dbx-ops` network:

   ```sh
   docker compose -f compose.yaml -f ops/dbx/compose.dbx.override.yaml up -d postgres
   ```

   Expect a brief database-container restart. Verify readiness and confirm it
   reused the same named volume. This is a network-only change, not a schema or
   data migration.
5. Bootstrap a dedicated `noelia_dbx_readonly` role only after confirming the
   actual database name and schema-owner role. Review
   `noelia-readonly-role.sql`; for the standard Compose bootstrap role, run it
   from the repository root with:

   ```sh
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v dbx_database="$POSTGRES_DB" -v dbx_schema_owner="$POSTGRES_USER"' < ops/dbx/noelia-readonly-role.sql
   ```

   First verify the schema owner used by migrations; if it differs from
   `POSTGRES_USER`, substitute that exact role for `dbx_schema_owner`. The
   script grants only connect, schema usage, and SELECT on current/future
   `public` tables and sequences. It does not store a password. After it
   succeeds, open an interactive session with
   `docker compose exec postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`,
   then use psql's non-echoing `\password noelia_dbx_readonly` prompt. Enter
   the credential directly into the authenticated DBX connection form. Never
   put it in this repository, shell history, or an environment file.
6. In the shared DBX Web UI, configure a separate connection named exactly
   `noelia-production-readonly`, using host `noelia-postgres`, port `5432`, the
   actual existing Noélia production database name, and the dedicated
   `noelia_dbx_readonly` role. Enable DBX Read Only and Production Protection.
   Do not use the bot's `POSTGRES_USER`/`POSTGRES_PASSWORD` credentials.

The central DBX operator should also restrict MCP to this exact connection and
database, with Read-only execution and metadata/query tools only. Its loopback-
only Web binding and the DBX password/encryption key are configured in Tori's
DBX operations directory. Do not expose PostgreSQL or DBX Web publicly.
