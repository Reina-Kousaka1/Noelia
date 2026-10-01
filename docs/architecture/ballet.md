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

`/ballet academy` derives Studio Student, Academy Apprentice, Repertoire Artist,
Soloist, and Principal Artist standing from the existing Ballet level, unique
activity completions, stats, and best recorded event tiers. It does not write a
second rank or XP record. `/profile` includes the current standing. Stage and
repertoire milestones remain deterministic and visible in the existing
activity and performance commands.

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
