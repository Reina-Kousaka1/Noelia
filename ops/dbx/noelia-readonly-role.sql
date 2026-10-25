\set ON_ERROR_STOP on
-- Execute with psql against Noélia's existing database as a database
-- administrator. Pass dbx_database and dbx_schema_owner with -v,
-- after reading the actual values locally on the Pi. This is not a migration.
-- It deliberately fails if the role already exists; inspect existing grants
-- rather than silently changing an existing principal.

BEGIN;

CREATE ROLE noelia_dbx_readonly
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

ALTER ROLE noelia_dbx_readonly SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE :"dbx_database" TO noelia_dbx_readonly;
GRANT USAGE ON SCHEMA public TO noelia_dbx_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO noelia_dbx_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO noelia_dbx_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE :"dbx_schema_owner" IN SCHEMA public
  GRANT SELECT ON TABLES TO noelia_dbx_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dbx_schema_owner" IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO noelia_dbx_readonly;

COMMIT;
