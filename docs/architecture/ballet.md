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
Seal. Every later stage requires evidence beyond
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
Preparation is session-specific, optional, and persisted. Exercise outcomes,
the single RNG roll, skill/preparation snapshots, corrections, interaction
idempotency, and final review are saved independently from the existing
deterministic /performance domain. Completed class/section evidence feeds the
existing Academy activity-evidence query. See ballet-classes.md for the data
flow and transaction boundaries.
