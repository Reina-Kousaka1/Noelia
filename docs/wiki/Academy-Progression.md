# Academy Progression

**Status: Implemented — initial thresholds are provisional.**

The canonical 19-stage curriculum is Pre-School Dance, Preparatory Dance,
Pre-Primary, Primary, Grades 1–8, Discovering Repertoire, Intermediate
Foundation, Intermediate, Advanced Foundation, Advanced 1, Advanced 2, and
Solo Seal. Progress derives from existing Ballet level, activity history,
stats, best performance tiers, and selected completed Knowledge lessons before
an assessment baseline is captured. Missing lesson gates appear
with the other unmet requirements. Every stage after entry requires evidence
beyond level alone. Pointe practice begins at Advanced Foundation. Thresholds
are provisional Noélia gameplay, not official certification. Source:
`src/ballet/academy.ts`.

Completed `/ballet class` sessions add immutable class and section evidence to
this same progression query. Evidence can satisfy an existing distinct Ballet
activity requirement; exercise successes are separately recorded for future
assessment/repertoire use. Users without an assessment baseline retain the
existing evidence-derived stage. The first guided class or assessment start
captures that stage as an immutable baseline. Afterward, only a passed
assessment advances one stage. Each class keeps the stage and exercise sequence
captured when it began. Migration 023 adds the progression pointer and
assessment records without modifying prior Academy evidence. Production has
not been migrated by this implementation work.

Historical `minis-bambinis` baselines resolve to Pre-School Dance at read time;
the immutable baseline and historical class/assessment snapshots remain intact.
All other saved stage IDs retain their meaning. A previously started assessment
that would skip Preparatory Dance is completed without promotion when resumed,
then a new assessment can target the inserted stage. No user age is stored or
inferred from these education-inspired RPG stages.
