# Moderation boundary

Status: the transport-independent case model, PostgreSQL case/outcome
persistence, `/warn`, `/warnings`, `/modcase`, `/timeout`, `/kick`, and `/ban`
commands are implemented. AutoMod has opt-in per-guild configuration, bounded
in-memory detection, and moderator-review case notes; it never automatically
deletes messages, times out members, or bans members.

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

Migration V16 adds per-guild rule configuration, allowlists, and an immutable
interaction-idempotency log. `/automod status`, `/automod rule`, `/automod allow`,
and `/automod unallow` are restricted to users with Manage Server permission
(or the guild owner); their responses are private. Rules default to disabled.
Supported review signals are message flood, repeated messages, mention spam,
Discord invite links, and join bursts. `CASE` escalation records a factual
moderation note; `OBSERVE` only emits structured operational metadata.

Runtime listeners are disabled by default. `AUTOMOD_MESSAGE_SCANNING_ENABLED`
opts into the Guild Messages, Message Content, and Guild Members gateway intents;
`ANTI_RAID_JOIN_MONITORING_ENABLED` opts into Guild Members. The corresponding
privileged intents must also be enabled in the Discord Developer Portal. These
environment settings do not enable the intents in Discord on their own. Raw
message text is not stored or logged; only a process-keyed HMAC fingerprint and
bounded event counters are retained in memory for repeated-message detection.
Allowlisted users, bots, and members with moderation permissions bypass message
scanning. Join bursts produce review signals only.

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
persona rendering. Runtime detection is a conservative foundation, not a
replacement for Discord AutoMod or human review. Configuration changes are
transactional and use the Discord interaction ID as an idempotency key.
