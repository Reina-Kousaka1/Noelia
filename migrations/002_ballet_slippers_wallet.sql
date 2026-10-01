CREATE TABLE ballet_slippers_wallets (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^[0-9]{17,20}$'),
  operation_type text NOT NULL CHECK (operation_type IN (
    'DAILY_REWARD',
    'BALLET_ACTIVITY',
    'PERFORMANCE_REWARD',
    'SHOP_PURCHASE',
    'MARKET_PURCHASE',
    'MARKET_SALE',
    'ADMIN_ADJUSTMENT'
  )),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger (
  transaction_id bigint NOT NULL
    REFERENCES wallet_transactions (id) ON DELETE RESTRICT,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  amount_delta bigint NOT NULL CHECK (amount_delta <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, discord_user_id)
);

CREATE INDEX wallet_ledger_user_created_idx
  ON wallet_ledger (discord_user_id, created_at DESC, transaction_id DESC);

CREATE FUNCTION reject_wallet_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wallet ledger entries are immutable';
END;
$$;

CREATE TRIGGER wallet_ledger_append_only
BEFORE UPDATE OR DELETE ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION reject_wallet_ledger_mutation();

CREATE TRIGGER wallet_ledger_no_truncate
BEFORE TRUNCATE ON wallet_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION reject_wallet_ledger_mutation();
