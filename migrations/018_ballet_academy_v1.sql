CREATE TABLE ballet_activity_stat_requirements (
  activity_code text NOT NULL
    REFERENCES ballet_activity_catalog (activity_code) ON DELETE RESTRICT,
  stat_key text NOT NULL CHECK (stat_key IN (
    'technique', 'flexibility', 'musicality', 'performance', 'pointe', 'stamina'
  )),
  minimum_value integer NOT NULL CHECK (minimum_value BETWEEN 1 AND 100),
  PRIMARY KEY (activity_code, stat_key)
);

INSERT INTO ballet_activity_stat_requirements (activity_code, stat_key, minimum_value) VALUES
  ('pointe-practice', 'technique', 9),
  ('choreography', 'musicality', 2),
  ('performance', 'performance', 3),
  ('audition', 'technique', 6),
  ('recital', 'performance', 7),
  ('showcase', 'stamina', 8);

INSERT INTO achievement_catalog (achievement_id, display_name, description, badge_mark) VALUES
  ('first-recital', 'First Recital', 'Complete the Spring Recital on stage.', '🌷'),
  ('prima-star', 'Prima Star', 'Earn the Prima tier in the Prima Audition.', '🦢');
