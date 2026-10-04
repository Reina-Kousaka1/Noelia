# Early Academy Gameplay

The early Academy loop provides a structured entry into the existing
19-stage Ballet Academy. It reuses the canonical stage catalog, Academy
baseline, class engine, assessment flow, wallet, inventory, and wardrobe. It
does not add a character-age system or another progression track.

## Player flow

1. `/academy enroll` explicitly records enrollment. The first eligible
   Pre-School Dance enrollment receives three catalog-backed, one-time Academy
   hand-me-down items; they are equipped in the existing wardrobe and marked
   non-tradeable. Enrollment and the starter set share one transaction.
2. `/academy practice` records a beginner foundation. Four rhythm/listening/
   movement foundations are available at Pre-School Dance; four introductory
   Ballet foundations unlock at Preparatory Dance, with one action code per
   UTC day. These actions grant no Credits or XP.
3. `/academy schedule` books a regular class using a local date, time, and IANA
   timezone. Nonexistent or repeated wall times at a daylight-saving change
   are rejected, and bookings must be 30 minutes to 90 days ahead.
4. `/academy cancel` gives an excused cancellation at least one hour before
   class. `/academy checkin` uses the Discord interaction timestamp, so a
   delivery delay within the bounded grace period does not move the attendance
   window.
5. `/ballet class` begins or resumes the existing guided class. A checked-in
   booking is linked to that class; completing it saves one deterministic
   report card and adds five fictional Academy-comfort points in the same
   transaction.
6. `/academy report` shows current stage, foundations, attendance, and recent
   report cards. Promotion still requires the existing assessment and its
   saved result.

Academy comfort is a fictional game value only. It increases through saved
foundations and completed scheduled classes. It is not a measurement of a
person, clothing size, health, or real-world readiness.

V3 skill/condition/stamina effects remain locked during Pre-School Dance and
Preparatory Dance, then join the existing class and activity loop from
Pre-Primary onward. The earlier Academy stages still use their existing Ballet
curriculum and progression; this gate only delays the newer structured-training
effects until the intended transition.

## Attendance and fair recovery

Enrollment, actions, bookings, cancellation/check-in requests, attendance, and
report cards use PostgreSQL as their durable source of truth. Discord
interaction IDs and database uniqueness constraints prevent duplicate grants,
attendance, or reports. A bot restart resumes the saved class and cannot reroll
an existing exercise result.

The scheduler uses one process-level worker and one persisted heartbeat. It
waits through the configured Discord-delivery grace period before settling an
absence. A missed class is recorded only when the runtime continuously
observed the full check-in window; an uncertain window is recorded as
`SYSTEM_CANCELLED`. A missed class produces a 6 for participation/overall on
that report only; technical grades remain null and existing Ballet skills are
not reduced. Excused and system cancellations do not count against the early
attendance requirement.

Report grades are deterministic summaries of saved class review data. At
Pre-School Dance, rhythm and coordination dominate and no technical grade is
assigned. Later stages progressively include technique. Madame's bounded
attendance tone is derived from the five most recent relevant persisted
attendance events; excused and system-cancelled sessions are ignored, and
steady attendance can restore a warmer presentation. This never changes
permissions, moderation, grades, or transaction results.

## Persistence and validation

Migration `025_academy_early_sessions_v1.sql` is additive. It adds the
non-tradeable inventory flag, starter catalog entries, enrollment and beginner
evidence, scheduled classes, request records, attendance, report cards, and
scheduler continuity state. It does not rewrite older migration files or
existing Academy, inventory, or progression rows.

Scheduling horizons, check-in windows, delivery grace, cancellation cutoff,
heartbeat tolerance, and work batch size are centralized under
`GAMEPLAY_CONFIG.academySchedule`; the service validates injected policy values
for tests and future tuning.

PostgreSQL integration tests require the repository's explicit `noelia_test`
loopback database guard (`NODE_ENV=test` and `NOELIA_TEST_DATABASE_URL`). No
database integration test or Production migration was run as part of this
implementation pass on a host without a local PostgreSQL service.
