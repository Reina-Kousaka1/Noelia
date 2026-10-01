CREATE TABLE achievement_catalog (
  achievement_id text PRIMARY KEY CHECK (achievement_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL UNIQUE,
  description text NOT NULL,
  badge_mark text NOT NULL CHECK (length(badge_mark) BETWEEN 1 AND 16),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO achievement_catalog (achievement_id, display_name, description, badge_mark) VALUES
  ('first-steps', 'First Steps', 'Complete your first Ballet activity.', '🩰'),
  ('ballet-level-ten', 'Studio Regular', 'Reach Ballet level 10.', '🌸'),
  ('first-performance', 'First Performance', 'Complete your first Ballet performance.', '🦢'),
  ('spotlight-moment', 'Spotlight Moment', 'Earn a Gold or Prima performance tier.', '✨'),
  ('first-boutique-piece', 'First Boutique Piece', 'Make your first shop purchase.', '🎀'),
  ('first-studio-look', 'First Studio Look', 'Equip your first wardrobe piece.', '🤍'),
  ('first-market-sale', 'First Market Sale', 'Sell a piece through the studio exchange.', '🌷'),
  ('first-market-purchase', 'Exchange Keepsake', 'Buy a piece through the studio exchange.', '🪷'),
  ('first-collection', 'Collection Curator', 'Complete your first shop collection.', '🌹'),
  ('three-collections', 'Three Perfect Sets', 'Complete three shop collections.', '💐');

CREATE TABLE user_achievements (
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  achievement_id text NOT NULL
    REFERENCES achievement_catalog (achievement_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN (
    'BALLET_ACTIVITY', 'BALLET_LEVEL', 'PERFORMANCE', 'SHOP_PURCHASE',
    'WARDROBE_EQUIPPED', 'MARKETPLACE_SALE', 'MARKETPLACE_PURCHASE', 'COLLECTION'
  )),
  source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 128),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_user_id, achievement_id)
);

CREATE INDEX user_achievements_user_time_idx
  ON user_achievements (discord_user_id, unlocked_at DESC, achievement_id);

CREATE FUNCTION reject_user_achievement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'unlocked achievement history is immutable';
END;
$$;

CREATE TRIGGER user_achievements_append_only
BEFORE UPDATE OR DELETE ON user_achievements
FOR EACH ROW
EXECUTE FUNCTION reject_user_achievement_mutation();

CREATE TRIGGER user_achievements_no_truncate
BEFORE TRUNCATE ON user_achievements
FOR EACH STATEMENT
EXECUTE FUNCTION reject_user_achievement_mutation();

CREATE TABLE featured_user_achievements (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  achievement_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (discord_user_id, achievement_id)
    REFERENCES user_achievements (discord_user_id, achievement_id) ON DELETE RESTRICT
);

CREATE TABLE achievement_feature_requests (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('FEATURE', 'CLEAR')),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX achievement_feature_requests_user_time_idx
  ON achievement_feature_requests (discord_user_id, created_at DESC);

CREATE FUNCTION reject_achievement_feature_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'achievement feature requests are immutable';
END;
$$;

CREATE TRIGGER achievement_feature_requests_append_only
BEFORE UPDATE OR DELETE ON achievement_feature_requests
FOR EACH ROW
EXECUTE FUNCTION reject_achievement_feature_request_mutation();

CREATE TRIGGER achievement_feature_requests_no_truncate
BEFORE TRUNCATE ON achievement_feature_requests
FOR EACH STATEMENT
EXECUTE FUNCTION reject_achievement_feature_request_mutation();
