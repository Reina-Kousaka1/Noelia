CREATE TABLE ballet_classes (
  class_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  start_interaction_id text NOT NULL UNIQUE
    CHECK (start_interaction_id ~ '^[0-9]{17,20}$'),
  class_type text NOT NULL CHECK (class_type IN (
    'REGULAR', 'TECHNIQUE', 'BARRE_FOCUS', 'CENTRE_FOCUS', 'TURNS',
    'ALLEGRO', 'CONDITIONING', 'REPERTOIRE', 'ASSESSMENT_PREPARATION'
  )),
  academy_stage_id text NOT NULL,
  academy_stage_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('PREPARING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  current_section text CHECK (current_section IN (
    'BARRE', 'CENTRE', 'ADAGIO', 'TURNS', 'ALLEGRO',
    'TECHNIQUE', 'CONDITIONING', 'REPERTOIRE'
  )),
  current_exercise_index integer NOT NULL DEFAULT 0 CHECK (current_exercise_index >= 0),
  curriculum_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(curriculum_snapshot) = 'object'
    AND curriculum_snapshot ->> 'version' = '1'
    AND jsonb_typeof(curriculum_snapshot -> 'sections') = 'array'
    AND jsonb_typeof(curriculum_snapshot -> 'exercises') = 'array'
  ),
  review_snapshot jsonb CHECK (
    review_snapshot IS NULL OR jsonb_typeof(review_snapshot) = 'object'
  ),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK ((status = 'ABANDONED') = (abandoned_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR abandoned_at IS NULL),
  UNIQUE (class_id, discord_user_id)
);

CREATE UNIQUE INDEX ballet_classes_one_open_per_user_idx
  ON ballet_classes (discord_user_id)
  WHERE status IN ('PREPARING', 'IN_PROGRESS');

CREATE INDEX ballet_classes_user_history_idx
  ON ballet_classes (discord_user_id, started_at DESC, class_id);

CREATE TABLE ballet_class_actions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  class_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'START', 'PREPARATION', 'BEGIN', 'ATTEMPT', 'ABANDON'
  )),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX ballet_class_actions_user_history_idx
  ON ballet_class_actions (discord_user_id, created_at DESC);

CREATE TABLE ballet_class_preparation (
  class_id uuid NOT NULL REFERENCES ballet_classes (class_id) ON DELETE RESTRICT,
  area text NOT NULL CHECK (area IN (
    'GENERAL_WARM_UP', 'MOBILITY', 'CORE_ACTIVATION', 'BALANCE',
    'BARRE', 'TURNS', 'JUMPS'
  )),
  marked_interaction_id text NOT NULL UNIQUE
    CHECK (marked_interaction_id ~ '^[0-9]{17,20}$'),
  marked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (class_id, area)
);

CREATE TABLE ballet_class_attempts (
  attempt_id uuid PRIMARY KEY,
  interaction_id text NOT NULL UNIQUE
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  class_id uuid NOT NULL REFERENCES ballet_classes (class_id) ON DELETE RESTRICT,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  exercise_id text NOT NULL,
  exercise_name text NOT NULL,
  section text NOT NULL CHECK (section IN (
    'BARRE', 'CENTRE', 'ADAGIO', 'TURNS', 'ALLEGRO',
    'TECHNIQUE', 'CONDITIONING', 'REPERTOIRE'
  )),
  outcome text NOT NULL CHECK (outcome IN ('PERFECT', 'SUCCESS', 'SHAKY', 'FAIL')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  roll_micros integer NOT NULL CHECK (roll_micros BETWEEN 0 AND 999999),
  skill_snapshot jsonb NOT NULL CHECK (jsonb_typeof(skill_snapshot) = 'object'),
  preparation_snapshot text[] NOT NULL DEFAULT ARRAY[]::text[],
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  UNIQUE (class_id, position),
  UNIQUE (attempt_id, class_id),
  UNIQUE (attempt_id, class_id, discord_user_id)
);

CREATE INDEX ballet_class_attempts_class_order_idx
  ON ballet_class_attempts (class_id, position);

CREATE TABLE ballet_class_corrections (
  correction_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE,
  class_id uuid NOT NULL REFERENCES ballet_classes (class_id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN (
    'BALANCE', 'TIMING', 'FOOTWORK', 'TECHNIQUE', 'COORDINATION',
    'POSTURE_PLACEMENT', 'TURN_CONTROL', 'JUMP_CONTROL', 'MUSICALITY'
  )),
  severity integer NOT NULL CHECK (severity BETWEEN 1 AND 3),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attempt_id, class_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id) ON DELETE RESTRICT
);

CREATE INDEX ballet_class_corrections_class_category_idx
  ON ballet_class_corrections (class_id, category);

CREATE TABLE academy_training_evidence (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  class_id uuid NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'CLASS_COMPLETED', 'SECTION_COMPLETED', 'EXERCISE_SUCCESS',
    'ASSESSMENT_PASSED', 'REPERTOIRE_COMPLETED'
  )),
  evidence_code text NOT NULL,
  academy_activity_code text CHECK (academy_activity_code IN (
    'class', 'barre', 'center-practice', 'stretching', 'technique',
    'pointe-practice', 'rehearsal', 'choreography', 'performance',
    'audition', 'recital', 'showcase'
  )),
  source_attempt_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_attempt_id, class_id, discord_user_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id, discord_user_id) ON DELETE RESTRICT,
  CHECK (
    (evidence_type = 'EXERCISE_SUCCESS' AND source_attempt_id IS NOT NULL
      AND academy_activity_code IS NULL)
    OR
    (evidence_type <> 'EXERCISE_SUCCESS' AND source_attempt_id IS NULL)
  ),
  UNIQUE (discord_user_id, class_id, evidence_type, evidence_code)
);

CREATE INDEX academy_training_evidence_activity_idx
  ON academy_training_evidence (discord_user_id, academy_activity_code)
  WHERE academy_activity_code IS NOT NULL;

CREATE FUNCTION reject_ballet_class_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ballet class action and training evidence history is immutable';
END;
$$;

CREATE TRIGGER ballet_class_actions_append_only
BEFORE UPDATE OR DELETE ON ballet_class_actions
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_actions_no_truncate
BEFORE TRUNCATE ON ballet_class_actions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_preparation_append_only
BEFORE UPDATE OR DELETE ON ballet_class_preparation
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_preparation_no_truncate
BEFORE TRUNCATE ON ballet_class_preparation
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_attempts_append_only
BEFORE UPDATE OR DELETE ON ballet_class_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_attempts_no_truncate
BEFORE TRUNCATE ON ballet_class_attempts
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_corrections_append_only
BEFORE UPDATE OR DELETE ON ballet_class_corrections
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER ballet_class_corrections_no_truncate
BEFORE TRUNCATE ON ballet_class_corrections
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER academy_training_evidence_append_only
BEFORE UPDATE OR DELETE ON academy_training_evidence
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_class_history_mutation();

CREATE TRIGGER academy_training_evidence_no_truncate
BEFORE TRUNCATE ON academy_training_evidence
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_class_history_mutation();
