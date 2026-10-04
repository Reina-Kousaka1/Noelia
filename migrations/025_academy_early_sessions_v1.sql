-- Early Academy enrollment, beginner evidence, scheduled sessions and reports.
-- All user-facing progression values are fictional gameplay state.

ALTER TABLE user_inventory
  ADD COLUMN tradeable boolean NOT NULL DEFAULT true;

INSERT INTO shop_catalog (
  item_id, display_name, description, category, rarity, price,
  active, purchasable, stackable, minimum_ballet_level, collection, cosmetic_metadata
) VALUES
  (
    'academy-hand-me-down-leotard', 'Academy Hand-Me-Down Leotard',
    'A gently pre-owned academy leotard, freshly cared for and ready for a first studio day.',
    'leotard', 'common', 1, true, false, false, 1, 'First Position',
    '{"color":"soft-pink","slots":["leotard"],"academy_uniform_roles":["academy-leotard"],"academy_starter":true,"condition":"gently-pre-owned"}'::jsonb
  ),
  (
    'academy-hand-me-down-tights', 'Academy Hand-Me-Down Tights',
    'A clean, well-kept beginner pair from the Academy wardrobe.',
    'tights', 'common', 1, true, false, false, 1, 'First Position',
    '{"color":"soft-ivory","slots":["tights"],"academy_uniform_roles":["academy-tights"],"academy_starter":true,"condition":"gently-pre-owned"}'::jsonb
  ),
  (
    'academy-hand-me-down-flats', 'Academy Hand-Me-Down Soft Ballet Slippers',
    'A simple, cared-for pair of soft ballet slippers for a new Academy student.',
    'ballet_flats', 'common', 1, true, false, false, 1, 'First Position',
    '{"color":"soft-rose","slots":["shoes"],"academy_uniform_roles":["academy-flat"],"academy_starter":true,"condition":"gently-pre-owned"}'::jsonb
  )
ON CONFLICT (item_id) DO NOTHING;

CREATE TABLE ballet_academy_enrollments (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  enrollment_interaction_id text NOT NULL UNIQUE
    CHECK (enrollment_interaction_id ~ '^[0-9]{17,20}$'),
  enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  academy_comfort integer NOT NULL DEFAULT 0 CHECK (academy_comfort BETWEEN 0 AND 100)
);

CREATE TABLE ballet_academy_beginner_actions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES ballet_academy_enrollments (discord_user_id) ON DELETE RESTRICT,
  academy_stage_id text NOT NULL CHECK (academy_stage_id IN (
    'pre-school-dance', 'preparatory-dance', 'pre-primary', 'primary',
    'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5', 'grade-6',
    'grade-7', 'grade-8', 'discovering-repertoire', 'intermediate-foundation',
    'intermediate', 'advanced-foundation', 'advanced-1', 'advanced-2', 'solo-seal',
    'minis-bambinis'
  )),
  action_code text NOT NULL CHECK (action_code IN (
    'CLAP_RHYTHM', 'FIND_THE_BEAT', 'WALK_TO_THE_BEAT',
    'FOLLOW_THE_MUSIC', 'SIMPLE_MOVEMENT_PATTERN',
    'FIRST_POSITIONS', 'SIMPLE_PLIES', 'SIMPLE_PORT_DE_BRAS', 'RHYTHM_SEQUENCE'
  )),
  outcome text NOT NULL DEFAULT 'COMPLETED' CHECK (outcome = 'COMPLETED'),
  familiarity_gain integer NOT NULL CHECK (familiarity_gain BETWEEN 1 AND 5),
  action_day date NOT NULL DEFAULT ((clock_timestamp() AT TIME ZONE 'UTC')::date),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (discord_user_id, action_code, action_day)
);

CREATE INDEX ballet_academy_beginner_actions_history_idx
  ON ballet_academy_beginner_actions (discord_user_id, created_at DESC);

CREATE TABLE ballet_academy_scheduled_classes (
  scheduled_class_id uuid PRIMARY KEY,
  interaction_id text NOT NULL UNIQUE
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES ballet_academy_enrollments (discord_user_id) ON DELETE RESTRICT,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  class_type text NOT NULL DEFAULT 'REGULAR' CHECK (class_type IN (
    'REGULAR', 'TECHNIQUE', 'BARRE_FOCUS', 'CENTRE_FOCUS', 'TURNS',
    'ALLEGRO', 'CONDITIONING', 'REPERTOIRE', 'ASSESSMENT_PREPARATION'
  )),
  academy_stage_id text NOT NULL CHECK (academy_stage_id IN (
    'pre-school-dance', 'preparatory-dance', 'pre-primary', 'primary',
    'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5', 'grade-6',
    'grade-7', 'grade-8', 'discovering-repertoire', 'intermediate-foundation',
    'intermediate', 'advanced-foundation', 'advanced-1', 'advanced-2', 'solo-seal',
    'minis-bambinis'
  )),
  academy_stage_name text NOT NULL,
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 80),
  scheduled_at timestamptz NOT NULL,
  check_in_opens_at timestamptz NOT NULL,
  check_in_closes_at timestamptz NOT NULL,
  cancellation_deadline_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN (
    'SCHEDULED', 'ATTENDED', 'CANCELLED_EXCUSED',
    'MISSED_UNEXCUSED', 'SYSTEM_CANCELLED'
  )),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  class_id uuid UNIQUE REFERENCES ballet_classes (class_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (check_in_opens_at < scheduled_at),
  CHECK (scheduled_at < check_in_closes_at),
  CHECK (cancellation_deadline_at <= scheduled_at),
  UNIQUE (scheduled_class_id, discord_user_id)
);

CREATE UNIQUE INDEX ballet_academy_one_scheduled_class_per_time_idx
  ON ballet_academy_scheduled_classes (discord_user_id, scheduled_at)
  WHERE status = 'SCHEDULED';

CREATE INDEX ballet_academy_scheduled_classes_due_idx
  ON ballet_academy_scheduled_classes (check_in_closes_at)
  WHERE status = 'SCHEDULED';

CREATE INDEX ballet_academy_scheduled_classes_user_history_idx
  ON ballet_academy_scheduled_classes (discord_user_id, scheduled_at DESC);

CREATE TABLE ballet_academy_schedule_actions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL,
  scheduled_class_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('CANCEL', 'CHECK_IN')),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (scheduled_class_id, discord_user_id)
    REFERENCES ballet_academy_scheduled_classes (scheduled_class_id, discord_user_id)
    ON DELETE RESTRICT
);

CREATE INDEX ballet_academy_schedule_actions_user_history_idx
  ON ballet_academy_schedule_actions (discord_user_id, created_at DESC);

CREATE TABLE ballet_academy_attendance (
  attendance_id uuid PRIMARY KEY,
  scheduled_class_id uuid NOT NULL UNIQUE,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN (
    'ATTENDED', 'CANCELLED_EXCUSED', 'MISSED_UNEXCUSED', 'SYSTEM_CANCELLED'
  )),
  academy_comfort_gain smallint NOT NULL DEFAULT 0 CHECK (academy_comfort_gain BETWEEN 0 AND 5),
  checked_in_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (attendance_id, discord_user_id),
  CHECK ((status = 'ATTENDED') = (checked_in_at IS NOT NULL)),
  FOREIGN KEY (scheduled_class_id, discord_user_id)
    REFERENCES ballet_academy_scheduled_classes (scheduled_class_id, discord_user_id)
    ON DELETE RESTRICT
);

CREATE INDEX ballet_academy_attendance_user_history_idx
  ON ballet_academy_attendance (discord_user_id, recorded_at DESC);

CREATE TABLE ballet_academy_report_cards (
  attendance_id uuid PRIMARY KEY
    REFERENCES ballet_academy_attendance (attendance_id) ON DELETE RESTRICT,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  academy_stage_id text NOT NULL CHECK (academy_stage_id IN (
    'pre-school-dance', 'preparatory-dance', 'pre-primary', 'primary',
    'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5', 'grade-6',
    'grade-7', 'grade-8', 'discovering-repertoire', 'intermediate-foundation',
    'intermediate', 'advanced-foundation', 'advanced-1', 'advanced-2', 'solo-seal',
    'minis-bambinis'
  )),
  rhythm_grade smallint CHECK (rhythm_grade BETWEEN 1 AND 6),
  technique_grade smallint CHECK (technique_grade BETWEEN 1 AND 6),
  coordination_grade smallint CHECK (coordination_grade BETWEEN 1 AND 6),
  preparation_grade smallint CHECK (preparation_grade BETWEEN 1 AND 6),
  academy_comfort_gain smallint NOT NULL DEFAULT 0 CHECK (academy_comfort_gain BETWEEN 0 AND 5),
  participation_grade smallint NOT NULL CHECK (participation_grade BETWEEN 1 AND 6),
  overall_grade smallint NOT NULL CHECK (overall_grade BETWEEN 1 AND 6),
  source_class_id uuid UNIQUE REFERENCES ballet_classes (class_id) ON DELETE RESTRICT,
  evidence_snapshot jsonb NOT NULL CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attendance_id, discord_user_id)
    REFERENCES ballet_academy_attendance (attendance_id, discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX ballet_academy_report_cards_user_history_idx
  ON ballet_academy_report_cards (discord_user_id, created_at DESC);

CREATE TABLE ballet_academy_scheduler_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  runtime_instance_id uuid NOT NULL,
  last_heartbeat_at timestamptz NOT NULL,
  continuity_started_at timestamptz NOT NULL
);

CREATE FUNCTION reject_ballet_academy_early_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Academy actions, attendance and report history are immutable';
END;
$$;

CREATE TRIGGER ballet_academy_beginner_actions_append_only
BEFORE UPDATE OR DELETE ON ballet_academy_beginner_actions
FOR EACH ROW EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();
CREATE TRIGGER ballet_academy_beginner_actions_no_truncate
BEFORE TRUNCATE ON ballet_academy_beginner_actions
FOR EACH STATEMENT EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();

CREATE TRIGGER ballet_academy_schedule_actions_append_only
BEFORE UPDATE OR DELETE ON ballet_academy_schedule_actions
FOR EACH ROW EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();
CREATE TRIGGER ballet_academy_schedule_actions_no_truncate
BEFORE TRUNCATE ON ballet_academy_schedule_actions
FOR EACH STATEMENT EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();

CREATE TRIGGER ballet_academy_attendance_append_only
BEFORE UPDATE OR DELETE ON ballet_academy_attendance
FOR EACH ROW EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();
CREATE TRIGGER ballet_academy_attendance_no_truncate
BEFORE TRUNCATE ON ballet_academy_attendance
FOR EACH STATEMENT EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();

CREATE TRIGGER ballet_academy_report_cards_append_only
BEFORE UPDATE OR DELETE ON ballet_academy_report_cards
FOR EACH ROW EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();
CREATE TRIGGER ballet_academy_report_cards_no_truncate
BEFORE TRUNCATE ON ballet_academy_report_cards
FOR EACH STATEMENT EXECUTE FUNCTION reject_ballet_academy_early_history_mutation();
