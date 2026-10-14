# Ballet progression V2

The existing Ballet XP progression remains the source of level and XP. Level
thresholds are still 100 XP per level, capped at level 100; V8 adds practice
stats without introducing independent stat-XP tracks.

## Activity catalog

`ballet_activity_catalog` is the runtime source for activity copy, category,
minimum level, XP and Ballet Slippers rewards, cooldown, stat mapping, and
optional requirements. Stable activity IDs are also listed in TypeScript for
the slash-command choices. Current activities are Class, Barre, Center
Practice, Stretching, Technique, Pointe Practice, Rehearsal, Choreography,
Performance, Audition, Recital, and Showcase.

Requirements currently support an equipped catalog item and one prior
completed activity. Pointe Practice requires equipped Pearl Pointe Shoes;
later repertoire activities form a progression through earlier practice.
Both `/ballet activities` and the mutation service evaluate requirements, so
the command cannot bypass an unlock.

V18 adds stat gates for Pointe Practice, Choreography, Performance, Audition,
Recital, and Showcase. The activity browser shows current and required values;
the practice transaction checks the same requirements while holding the user's
progression lock. These gates use the existing six Ballet stats.

`/ballet academy` derives the canonical 19-stage Maison Noélia curriculum from
existing Ballet level, activity completions, stats, and best performance tiers.
The ordered stages run from Pre-School Dance and Preparatory Dance through Solo
Seal. The legacy `minis-bambinis` identifier resolves to Pre-School Dance;
stored history is not rewritten. Every later stage requires evidence beyond
level alone. Pointe practice is first required at Advanced Foundation, not for
beginners. The curriculum is centralized in `src/ballet/academy.ts`; current
thresholds are provisional gameplay defaults, not certification standards.
No separate Academy XP/rank table is created. `/profile` remains a read-only
aggregator. The seven fictional Academy-history chapters are content data in
`src/ballet/academy-history.ts`, separate from gameplay rules and not yet a
lesson workflow.

## Stats

`ballet_stats` persists Technique, Flexibility, Musicality, Performance,
Pointe, and Stamina for each dancer. Each catalog activity maps to one stat;
successful practice adds its configured amount up to a hard cap of 100. The
effective increase and resulting value are recorded with the immutable
completion row and replayed from that row for the same Discord interaction.

V8 initializes six rows for existing Ballet profiles and derives their initial
stats from the existing completion history and the activity-to-stat mapping.
The migration reads the history only; it does not rewrite Phase-1 completion
records.

## Atomic practice

Practice locks the Discord user and progression rows, validates level,
equipment, prior-activity, and cooldown requirements, then changes XP, the
selected stat, the existing Ballet Slippers wallet/ledger, and the immutable
completion record in one PostgreSQL transaction. A repeated interaction
returns its original reward/stat snapshot; a concurrent duplicate cannot award
twice. Stats affect presentation and activity progression only; they do not
increase Ballet Slippers rewards.

## Persistent Ballet classes

The separate /ballet class flow stores a versioned, Academy-stage-aware
session and uses the same six Ballet stats as weighted exercise inputs.
Preparation remains session-specific, persisted, and never a hard lock. A
separate, independent preparation roll applies a centralized failure risk:
zero required preparation reaches 65%, and partial preparation scales that
risk down linearly until half of the requirements are met. The score RNG and
preparation RNG are persisted separately, so saved outcomes replay without a
new roll. Unprepared training can still be attempted.
Class-attempt history stores neutral Preparation status/reason codes and a
bounded repeated-failure streak for a later Madame-consequence phase.

## Weekly Preparation and consistency stamina

The V3 stamina workload tables are the durable source for Weekly Preparation /
Gymnastics plans; no parallel plan or cooldown table is created. A new player
gets a persisted 20-exercise, seven-day plan when `/ballet training` is opened.
Successful guided-class exercises and Ballet practice activities record
append-only workload events. This foundation workload is counted at every
Academy stage, while V3 skills and short-term condition modifiers remain gated
as before. The existing five-per-rolling-24-hour skill event ceiling also caps
Preparation workload credit to prevent minute-scale grinding.

Long-term consistency stamina is separate from the legacy Ballet `stamina`
stat and short-term energy/fatigue. It starts at 100, is bounded to 0–150, and
changes only when a period is finalized: a completed target adds 2, a missed
period with at least 75% completion adds 1, and lower completion adds 0.
Recovery actions affect only short-term condition.

Targets are centrally bounded at 70. Completed periods can generate targets
between the previous target and 125%; missed periods use capped half-missing
carryover. The normal floor is 50% of the previous target. The named exception
has probability exactly `0.000001` (0.0001%, one in one million) and can lower
the target range below that floor. Periods use UTC elapsed time: 7 days through
20 exercises, 14 days through 40, 21 days through 63, and 42 days above 63.
RNG rolls, cycle number, outcome, stamina delta, and finalization time are
stored with each cycle. A user row lock and the active-cycle unique index make
lazy finalization safe across restarts and duplicate requests.

Migration `027_weekly_preparation_stamina.sql` adds the long-term stamina value,
cycle policy/audit fields, and separate performance-roll audit columns. It
preserves existing cycles and class attempts. Migration `025` and `026` remain
unchanged.
