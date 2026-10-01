# Moderation boundary

Status: the transport-independent case model, PostgreSQL case/outcome
persistence, and `/warn`, `/warnings`, `/modcase`, `/timeout`, `/kick`, and
`/ban` commands are implemented. AutoMod configuration and runtime rules are
still pending.

## Domain boundary

`src/moderation/case.ts` validates case drafts independently of Eris and
PostgreSQL. It defines the action vocabulary (`note`, `warning`, `timeout`,
`kick`, and `ban`), manual/AutoMod/system sources, reason length, distinct
actor and target, safe idempotency keys, and timeout-only expiry.

`ModerationService.createAttempt` records an immutable case before an external
Discord action. The guild and interaction idempotency key are unique; a replay
with the same payload returns the original pending or completed case, while a
different payload under the same key is rejected. `recordOutcome` stores one
immutable `SUCCEEDED`, `FAILED`, or `UNKNOWN` result separately. Safe outcome
codes may be stored, but raw Discord/API errors are not accepted by this API.
An attempt without an outcome remains visible as unresolved; replaying it must
not repeat an external side effect.

Migration V15 is additive. Cases and outcomes have append-only triggers,
foreign keys to the existing Discord-user table, guild/target history indexes,
and no destructive migration behavior. PostgreSQL remains the sole source of
truth. Integration tests are guarded by the isolated `noelia_test` database
configuration.

## Enforcement boundary

The persistence layer does not authorize users or execute Discord actions.
When commands are added, authorization, guild scope, bot permissions, role
hierarchy, and target membership must be checked centrally before the action.
The case attempt is written first; the Discord call follows; then its result is
recorded. If the process crashes between those steps, the case stays
unresolved and must be reviewed rather than blindly replayed. Warning, kick,
ban, and timeout results must never be reported as successful until Discord
confirms the action and the result has been recorded.

Moderation command output and audit records remain factual and do not use
persona rendering. AutoMod configuration, flood/invite detection, join-burst
handling, escalation policies, and message/member event listeners are not
implemented yet.
