ALTER TABLE ballet_activity_catalog
  ADD COLUMN description text NOT NULL DEFAULT 'A focused ballet studio session.',
  ADD COLUMN category text NOT NULL DEFAULT 'TECHNIQUE'
    CHECK (category IN ('FOUNDATION', 'TECHNIQUE', 'CONDITIONING', 'REPERTOIRE', 'PERFORMANCE')),
  ADD COLUMN stat_key text NOT NULL DEFAULT 'technique'
    CHECK (stat_key IN ('technique', 'flexibility', 'musicality', 'performance', 'pointe', 'stamina')),
  ADD COLUMN stat_gain integer NOT NULL DEFAULT 1 CHECK (stat_gain BETWEEN 1 AND 10),
  ADD COLUMN required_equipped_item_id text
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  ADD COLUMN required_activity_code text
    REFERENCES ballet_activity_catalog (activity_code) ON DELETE RESTRICT;

UPDATE ballet_activity_catalog
SET description = 'A guided fundamentals class for clean placement and quiet confidence.',
    category = 'FOUNDATION', stat_key = 'technique', stat_gain = 2
WHERE activity_code = 'class';

UPDATE ballet_activity_catalog
SET description = 'A measured barre session to build balance and dependable stamina.',
    category = 'FOUNDATION', stat_key = 'stamina', stat_gain = 2
WHERE activity_code = 'barre';

UPDATE ballet_activity_catalog
SET description = 'A center-floor combination that sharpens phrasing and musicality.',
    category = 'TECHNIQUE', stat_key = 'musicality', stat_gain = 2
WHERE activity_code = 'center-practice';

UPDATE ballet_activity_catalog
SET description = 'A gentle mobility session for comfortable, controlled flexibility.',
    category = 'CONDITIONING', stat_key = 'flexibility', stat_gain = 2
WHERE activity_code = 'stretching';

UPDATE ballet_activity_catalog
SET description = 'A deliberate detail session for cleaner lines and precise technique.',
    category = 'TECHNIQUE', stat_key = 'technique', stat_gain = 3
WHERE activity_code = 'technique';

UPDATE ballet_activity_catalog
SET description = 'A careful pointe session in your equipped pointe shoes.',
    category = 'TECHNIQUE', stat_key = 'pointe', stat_gain = 3,
    required_equipped_item_id = 'pearl-pointe-shoes'
WHERE activity_code = 'pointe-practice';

INSERT INTO ballet_activity_catalog (
  activity_code, display_name, minimum_level, xp_reward, slippers_reward, cooldown_ms,
  description, category, stat_key, stat_gain, required_activity_code
) VALUES
  ('rehearsal', 'Rehearsal', 4, 35, 40, 14400000,
   'A focused run-through that turns careful practice into stage-ready presence.',
   'REPERTOIRE', 'performance', 3, 'class'),
  ('choreography', 'Choreography', 7, 45, 55, 21600000,
   'Shape a phrase with musical detail, intention, and a soft finish.',
   'REPERTOIRE', 'musicality', 3, 'center-practice'),
  ('performance', 'Performance', 10, 55, 70, 28800000,
   'Practice sharing your work with calm focus and expressive clarity.',
   'PERFORMANCE', 'performance', 4, 'rehearsal'),
  ('audition', 'Audition', 12, 65, 80, 43200000,
   'Prepare a concise audition combination with poise and precision.',
   'PERFORMANCE', 'technique', 4, 'performance'),
  ('recital', 'Recital', 20, 80, 100, 86400000,
   'Polish a recital variation, from the opening pose to the final bow.',
   'PERFORMANCE', 'performance', 5, 'audition'),
  ('showcase', 'Showcase', 30, 100, 125, 172800000,
   'Bring your strongest rehearsal habits together in a studio showcase.',
   'PERFORMANCE', 'stamina', 5, 'recital');

CREATE TABLE ballet_stats (
  discord_user_id text NOT NULL
    REFERENCES ballet_progress (discord_user_id) ON DELETE RESTRICT,
  stat_key text NOT NULL CHECK (stat_key IN (
    'technique', 'flexibility', 'musicality', 'performance', 'pointe', 'stamina'
  )),
  stat_value integer NOT NULL DEFAULT 0 CHECK (stat_value BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_user_id, stat_key)
);

WITH earned AS (
  SELECT completion.discord_user_id,
         activity.stat_key,
         LEAST(100, SUM(activity.stat_gain))::integer AS stat_value
  FROM ballet_activity_completions AS completion
  INNER JOIN ballet_activity_catalog AS activity
    ON activity.activity_code = completion.activity_code
  GROUP BY completion.discord_user_id, activity.stat_key
)
INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value)
SELECT progress.discord_user_id, stats.stat_key, COALESCE(earned.stat_value, 0)
FROM ballet_progress AS progress
CROSS JOIN (VALUES
  ('technique'), ('flexibility'), ('musicality'),
  ('performance'), ('pointe'), ('stamina')
) AS stats(stat_key)
LEFT JOIN earned
  ON earned.discord_user_id = progress.discord_user_id
 AND earned.stat_key = stats.stat_key;

ALTER TABLE ballet_activity_completions
  ADD COLUMN stat_key text CHECK (stat_key IN (
    'technique', 'flexibility', 'musicality', 'performance', 'pointe', 'stamina'
  )),
  ADD COLUMN stat_gain integer CHECK (stat_gain BETWEEN 0 AND 10),
  ADD COLUMN stat_value_after integer CHECK (stat_value_after BETWEEN 0 AND 100),
  ADD CONSTRAINT ballet_completion_stat_snapshot_check CHECK (
    (stat_key IS NULL AND stat_gain IS NULL AND stat_value_after IS NULL) OR
    (stat_key IS NOT NULL AND stat_gain IS NOT NULL AND stat_value_after IS NOT NULL)
  );
