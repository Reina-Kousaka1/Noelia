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

The legacy ID `minis-bambinis` resolves to canonical `pre-school-dance` when
read. The canonical `preparatory-dance` stage remains distinct. Stored IDs and
audit history are retained; no database migration or data rewrite is needed.
No user age is stored or inferred from these education-inspired RPG stages.

New students can explicitly enroll in `/academy enroll`, practice stage-gated
rhythm and Ballet foundations, schedule timezone-aware Academy classes, and
review persisted attendance/report cards through `/academy report`. These
early evidence requirements supplement saved Ballet level, activity, stat,
class, and Knowledge evidence; time played or XP alone does not promote a
student. See [Early Academy Gameplay](../architecture/early-academy-gameplay.md)
for the starter wardrobe, attendance fairness, grading, and Migration 025
details. PostgreSQL verification of Migration 025 is still pending.
