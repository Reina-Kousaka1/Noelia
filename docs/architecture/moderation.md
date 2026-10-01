# Moderation boundary

Status: the initial, transport-independent case model and input policy are
implemented. There are no moderation commands, Discord enforcement actions,
database tables, AutoMod rules, or audit-log persistence yet.

## Domain boundary

`src/moderation/case.ts` validates case drafts independently of Eris and
PostgreSQL. It defines the initial action vocabulary (`note`, `warning`,
`timeout`, `kick`, and `ban`), manual/AutoMod/system sources, reason length,
distinct actor and target, safe idempotency keys, and timeout-only expiry. The
factory copies dates so callers cannot mutate the returned draft by changing
their original `Date` instances.

This policy is not a Discord permission check and does not execute any action.
When enforcement is added, authorization, Discord role hierarchy, bot
permissions, and guild scope must be checked centrally before an action is
attempted. Case persistence must record outcomes and failures factually and
must not depend on persona rendering.

## Next persistence and transport work

Add versioned PostgreSQL migrations and repositories only alongside an actual
moderation feature. Cases should be append-only audit facts, keyed by guild and
target, with the invoking interaction ID as the idempotency key for manual
mutations. Automated records should use a stable source-event key. Preserve
actor, action, reason, source, timestamps, expiry, and action outcome without
logging secrets or exposing private notes to the target.

Keep Discord handlers thin: parse and authorize, call a moderation service,
then render a factual result. Warning/kick/ban/timeout operations and their case
records need a deliberate consistency strategy for Discord API failures; never
claim an enforcement action succeeded merely because a database insert did.

Tests for a future persistence layer must use the isolated `noelia_test`
database guard. This foundation intentionally makes no schema or runtime
behavior changes.
