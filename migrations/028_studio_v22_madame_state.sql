-- Studio V2.2 adds a durable teacher mood, per-session patience, corrective
-- tasks, and one bounded follow-up workload adjustment. Existing V2.1 state
-- and history remain untouched.
ALTER TABLE ballet_stamina_cycles
  ADD CONSTRAINT ballet_stamina_cycles_cycle_user_unique UNIQUE (cycle_id, discord_user_id);

CREATE TABLE ballet_madame_mood_states (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  mood text NOT NULL DEFAULT 'SUPPORTIVE'
    CHECK (mood IN ('SUPPORTIVE', 'ATTENTIVE', 'CONCERNED', 'STERN', 'FRUSTRATED')),
  consecutive_failures smallint NOT NULL DEFAULT 0
    CHECK (consecutive_failures BETWEEN 0 AND 20),
  preparation_gap_streak smallint NOT NULL DEFAULT 0
    CHECK (preparation_gap_streak BETWEEN 0 AND 20),
  last_reason_code text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ballet_studio_session_states (
  class_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  patience smallint NOT NULL DEFAULT 3 CHECK (patience BETWEEN 0 AND 3),
  consecutive_failures smallint NOT NULL DEFAULT 0
    CHECK (consecutive_failures BETWEEN 0 AND 20),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
  early_ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (class_id, discord_user_id),
  FOREIGN KEY (class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  CHECK (early_ended_at IS NULL OR status = 'ABANDONED')
);

CREATE INDEX ballet_studio_session_user_active_idx
  ON ballet_studio_session_states (discord_user_id, updated_at DESC)
  WHERE status = 'ACTIVE';

CREATE TABLE ballet_corrective_tasks (
  task_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  task_type text NOT NULL CHECK (task_type = 'SECTION_SUCCESS'),
  target_section text NOT NULL CHECK (target_section IN (
    'BARRE', 'CENTRE', 'ADAGIO', 'TURNS', 'ALLEGRO',
    'TECHNIQUE', 'CONDITIONING', 'REPERTOIRE'
  )),
  reason_code text NOT NULL CHECK (reason_code IN (
    'REPEATED_TRAINING_FAILURE', 'REPEATED_PREPARATION_FAILURE'
  )),
  status text NOT NULL CHECK (status IN ('OPEN', 'COMPLETED', 'EXPIRED')),
  source_class_id uuid NOT NULL,
  source_attempt_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  completed_class_id uuid,
  completed_attempt_id uuid UNIQUE,
  UNIQUE (task_id, discord_user_id),
  FOREIGN KEY (source_class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_attempt_id, source_class_id, discord_user_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (completed_class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (completed_attempt_id, completed_class_id, discord_user_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id, discord_user_id) ON DELETE RESTRICT,
  CHECK (due_at > created_at),
  CHECK (
    (status = 'COMPLETED') =
    (completed_at IS NOT NULL AND completed_class_id IS NOT NULL AND completed_attempt_id IS NOT NULL)
  ),
  CHECK (completed_attempt_id IS NULL OR completed_attempt_id <> source_attempt_id)
);

CREATE UNIQUE INDEX ballet_corrective_tasks_one_open_per_user_idx
  ON ballet_corrective_tasks (discord_user_id)
  WHERE status = 'OPEN';

CREATE INDEX ballet_corrective_tasks_user_history_idx
  ON ballet_corrective_tasks (discord_user_id, created_at DESC, task_id);

CREATE TABLE ballet_studio_followups (
  followup_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (reason_code IN (
    'EARLY_SESSION_END', 'CORRECTIVE_TASK_IGNORED'
  )),
  source_attempt_id uuid,
  source_class_id uuid,
  source_task_id uuid,
  extra_workload smallint NOT NULL CHECK (extra_workload BETWEEN 1 AND 2),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_cycle_id uuid UNIQUE REFERENCES ballet_stamina_cycles (cycle_id) ON DELETE RESTRICT,
  UNIQUE (followup_id, discord_user_id),
  FOREIGN KEY (source_task_id, discord_user_id)
    REFERENCES ballet_corrective_tasks (task_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_attempt_id, source_class_id, discord_user_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id, discord_user_id) ON DELETE RESTRICT,
  CHECK ((source_attempt_id IS NOT NULL) <> (source_task_id IS NOT NULL)),
  CHECK ((source_attempt_id IS NOT NULL) = (source_class_id IS NOT NULL)),
  CHECK (expires_at > created_at),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL AND consumed_cycle_id IS NOT NULL))
);

CREATE UNIQUE INDEX ballet_studio_followups_one_pending_per_user_idx
  ON ballet_studio_followups (discord_user_id)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX ballet_studio_followups_attempt_source_idx
  ON ballet_studio_followups (source_attempt_id)
  WHERE source_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX ballet_studio_followups_task_source_idx
  ON ballet_studio_followups (source_task_id)
  WHERE source_task_id IS NOT NULL;

CREATE TABLE ballet_studio_cycle_adjustments (
  cycle_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  followup_id uuid NOT NULL UNIQUE
    REFERENCES ballet_studio_followups (followup_id) ON DELETE RESTRICT,
  base_target_workload smallint NOT NULL CHECK (base_target_workload BETWEEN 1 AND 70),
  added_workload smallint NOT NULL CHECK (added_workload BETWEEN 1 AND 2),
  applied_at timestamptz NOT NULL,
  CHECK (base_target_workload + added_workload <= 70),
  FOREIGN KEY (cycle_id, discord_user_id)
    REFERENCES ballet_stamina_cycles (cycle_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (followup_id, discord_user_id)
    REFERENCES ballet_studio_followups (followup_id, discord_user_id) ON DELETE RESTRICT
);

CREATE TABLE ballet_studio_events (
  event_id uuid PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 200),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  class_id uuid,
  attempt_id uuid,
  task_id uuid,
  followup_id uuid,
  cycle_id uuid REFERENCES ballet_stamina_cycles (cycle_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'ATTEMPT_RESOLVED', 'CORRECTIVE_ASSIGNED', 'CORRECTIVE_COMPLETED',
    'CORRECTIVE_EXPIRED', 'SESSION_ENDED_EARLY', 'FOLLOWUP_ASSIGNED',
    'FOLLOWUP_CONSUMED', 'FOLLOWUP_EXPIRED', 'MOOD_EASED', 'RECOVERY_RESOLVED'
  )),
  reason_code text NOT NULL CHECK (reason_code IN (
    'NORMAL_SUCCESS', 'NORMAL_FAILURE', 'REPEATED_TRAINING_FAILURE',
    'PREPARATION_GAP', 'REPEATED_PREPARATION_FAILURE', 'CORRECTIVE_TASK_COMPLETED',
    'CORRECTIVE_TASK_IGNORED', 'PATIENCE_EXHAUSTED', 'EARLY_SESSION_END', 'NEUTRAL_ATTEMPT',
    'FOLLOWUP_CONSUMED', 'FOLLOWUP_EXPIRED', 'MOOD_DECAY', 'FICTIONAL_SETBACK_RESOLVED'
  )),
  mood_before text CHECK (mood_before IN ('SUPPORTIVE', 'ATTENTIVE', 'CONCERNED', 'STERN', 'FRUSTRATED')),
  mood_after text CHECK (mood_after IN ('SUPPORTIVE', 'ATTENTIVE', 'CONCERNED', 'STERN', 'FRUSTRATED')),
  patience_before smallint CHECK (patience_before BETWEEN 0 AND 3),
  patience_after smallint CHECK (patience_after BETWEEN 0 AND 3),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (attempt_id, class_id, discord_user_id)
    REFERENCES ballet_class_attempts (attempt_id, class_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id, discord_user_id)
    REFERENCES ballet_corrective_tasks (task_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (followup_id, discord_user_id)
    REFERENCES ballet_studio_followups (followup_id, discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX ballet_studio_events_user_history_idx
  ON ballet_studio_events (discord_user_id, occurred_at DESC, event_id);

CREATE FUNCTION reject_ballet_studio_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ballet Studio V2.2 event history is immutable';
END;
$$;

CREATE TRIGGER ballet_studio_events_append_only
BEFORE UPDATE OR DELETE ON ballet_studio_events
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_studio_event_mutation();

CREATE TRIGGER ballet_studio_events_no_truncate
BEFORE TRUNCATE ON ballet_studio_events
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_studio_event_mutation();
