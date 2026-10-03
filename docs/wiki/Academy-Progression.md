# Academy Progression

**Status: Implemented — initial thresholds are provisional.**

The canonical derived curriculum is Minis & Bambinis, Pre-Primary, Primary,
Grades 1–8, Discovering Repertoire, Intermediate Foundation, Intermediate,
Advanced Foundation, Advanced 1, Advanced 2, and Solo Seal. Minis & Bambinis is
one stage. Progress derives from existing Ballet level, activity history,
stats, best performance tiers, and selected completed Knowledge lessons; there
is no separate XP track or persisted Academy rank. Missing lesson gates appear
with the other unmet requirements. Every stage after entry requires evidence
beyond level alone. Pointe practice begins at Advanced Foundation. Thresholds
are provisional Noélia gameplay, not official certification. Source:
`src/ballet/academy.ts`.

Completed `/ballet class` sessions add immutable class and section evidence to
this same progression query. Evidence can satisfy an existing distinct Ballet
activity requirement; exercise successes are separately recorded for future
assessment/repertoire use. Classes do not create a second rank or XP track and
do not change the user's current Academy stage retroactively: each session
keeps the stage and exercise sequence captured when it began. Migration 022
adds the class/evidence records without modifying prior Academy evidence.
