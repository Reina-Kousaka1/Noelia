ALTER TABLE user_inventory
  DROP CONSTRAINT user_inventory_source_check;

ALTER TABLE user_inventory
  ADD CONSTRAINT user_inventory_source_check
  CHECK (source IN (
    'SHOP_PURCHASE', 'BALLET_REWARD', 'DAILY_REWARD', 'EVENT_REWARD',
    'ADMIN_GRANT', 'MARKETPLACE'
  ));

CREATE TABLE marketplace_listings (
  listing_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  item_id text NOT NULL
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99999),
  unit_price bigint NOT NULL CHECK (unit_price BETWEEN 1 AND 9223372036854775807),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SOLD', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (listing_id, seller_user_id, item_id),
  CHECK (
    (status = 'ACTIVE' AND sold_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'SOLD' AND sold_at IS NOT NULL AND cancelled_at IS NULL) OR
    (status = 'CANCELLED' AND sold_at IS NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX marketplace_active_listings_idx
  ON marketplace_listings (created_at DESC, listing_id DESC)
  WHERE status = 'ACTIVE';

CREATE INDEX marketplace_seller_listings_idx
  ON marketplace_listings (seller_user_id, created_at DESC, listing_id DESC);

CREATE TABLE marketplace_requests (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  operation text NOT NULL CHECK (operation IN ('SELL', 'BUY', 'CANCEL')),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  listing_id bigint REFERENCES marketplace_listings (listing_id) ON DELETE RESTRICT,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((completed AND listing_id IS NOT NULL) OR (NOT completed AND listing_id IS NULL))
);

CREATE TABLE marketplace_escrow (
  listing_id bigint PRIMARY KEY,
  seller_user_id text NOT NULL,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99999),
  original_source text NOT NULL CHECK (original_source IN (
    'SHOP_PURCHASE', 'BALLET_REWARD', 'DAILY_REWARD', 'EVENT_REWARD',
    'ADMIN_GRANT', 'MARKETPLACE'
  )),
  original_acquired_at timestamptz NOT NULL,
  deposited_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (listing_id, seller_user_id, item_id)
    REFERENCES marketplace_listings (listing_id, seller_user_id, item_id)
    ON DELETE RESTRICT
);

CREATE TABLE marketplace_sales (
  trade_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL UNIQUE
    REFERENCES marketplace_listings (listing_id) ON DELETE RESTRICT,
  interaction_id text NOT NULL UNIQUE
    REFERENCES marketplace_requests (interaction_id) ON DELETE RESTRICT,
  buyer_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  seller_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  item_id text NOT NULL
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99999),
  unit_price bigint NOT NULL CHECK (unit_price > 0),
  total_price bigint NOT NULL CHECK (total_price > 0),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  wallet_transaction_id bigint NOT NULL UNIQUE,
  buyer_balance_after bigint NOT NULL CHECK (buyer_balance_after >= 0),
  seller_balance_after bigint NOT NULL CHECK (seller_balance_after >= 0),
  sold_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_user_id <> seller_user_id),
  CHECK (total_price = quantity::bigint * unit_price),
  FOREIGN KEY (interaction_id, wallet_transaction_id)
    REFERENCES wallet_transactions (idempotency_key, id) ON DELETE RESTRICT
);

CREATE INDEX marketplace_sales_buyer_time_idx
  ON marketplace_sales (buyer_user_id, sold_at DESC, trade_id DESC);

CREATE INDEX marketplace_sales_seller_time_idx
  ON marketplace_sales (seller_user_id, sold_at DESC, trade_id DESC);

CREATE FUNCTION enforce_marketplace_listing_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'marketplace listings are retained as audit records';
  END IF;

  IF OLD.status <> 'ACTIVE'
     OR NEW.status NOT IN ('SOLD', 'CANCELLED')
     OR NEW.listing_id <> OLD.listing_id
     OR NEW.seller_user_id <> OLD.seller_user_id
     OR NEW.item_id <> OLD.item_id
     OR NEW.quantity <> OLD.quantity
     OR NEW.unit_price <> OLD.unit_price
     OR NEW.created_at <> OLD.created_at
     OR (NEW.status = 'SOLD' AND (NEW.sold_at IS NULL OR NEW.cancelled_at IS NOT NULL))
     OR (NEW.status = 'CANCELLED' AND (NEW.cancelled_at IS NULL OR NEW.sold_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid marketplace listing transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_listing_transition
BEFORE UPDATE OR DELETE ON marketplace_listings
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_listing_transition();

CREATE FUNCTION reject_marketplace_state_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'marketplace state cannot be truncated';
END;
$$;

CREATE TRIGGER marketplace_listings_no_truncate
BEFORE TRUNCATE ON marketplace_listings
FOR EACH STATEMENT
EXECUTE FUNCTION reject_marketplace_state_truncate();

CREATE TRIGGER marketplace_escrow_no_truncate
BEFORE TRUNCATE ON marketplace_escrow
FOR EACH STATEMENT
EXECUTE FUNCTION reject_marketplace_state_truncate();

CREATE TRIGGER marketplace_requests_no_truncate
BEFORE TRUNCATE ON marketplace_requests
FOR EACH STATEMENT
EXECUTE FUNCTION reject_marketplace_state_truncate();

CREATE FUNCTION enforce_marketplace_escrow_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  listing_status text;
  listing_quantity integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status, quantity
      INTO listing_status, listing_quantity
      FROM marketplace_listings
     WHERE listing_id = NEW.listing_id;

    IF listing_status <> 'ACTIVE' OR listing_quantity <> NEW.quantity THEN
      RAISE EXCEPTION 'escrow must match an active marketplace listing';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT status
      INTO listing_status
      FROM marketplace_listings
     WHERE listing_id = OLD.listing_id;
    IF listing_status = 'ACTIVE' THEN
      RAISE EXCEPTION 'escrow cannot be released while a listing is active';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'marketplace escrow entries are immutable';
END;
$$;

CREATE TRIGGER marketplace_escrow_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON marketplace_escrow
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_escrow_lifecycle();

CREATE FUNCTION enforce_marketplace_request_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'marketplace request records are immutable after completion';
  END IF;

  IF OLD.completed
     OR NOT NEW.completed
     OR NEW.interaction_id <> OLD.interaction_id
     OR NEW.operation <> OLD.operation
     OR NEW.request_fingerprint <> OLD.request_fingerprint
     OR NEW.created_at <> OLD.created_at
     OR NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'marketplace request records are immutable after completion';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_request_completion
BEFORE UPDATE OR DELETE ON marketplace_requests
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_request_completion();

CREATE FUNCTION reject_marketplace_sale_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'marketplace sale history is immutable';
END;
$$;

CREATE TRIGGER marketplace_sales_append_only
BEFORE UPDATE OR DELETE ON marketplace_sales
FOR EACH ROW
EXECUTE FUNCTION reject_marketplace_sale_mutation();

CREATE TRIGGER marketplace_sales_no_truncate
BEFORE TRUNCATE ON marketplace_sales
FOR EACH STATEMENT
EXECUTE FUNCTION reject_marketplace_sale_mutation();
