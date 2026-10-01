# Relationships V1

Relationship state is owned by `src/relationships` and PostgreSQL migration
V13. The domain is intentionally separate from profile and has no Ballet
Slippers, shop, or inventory dependency. `/profile` only reads the current
relationship through its aggregator port.

`/marry user` creates a public pending proposal with Accept, Decline, and
Cancel proposal buttons. Only the target can accept or decline; only the
sender can cancel. `/marriage` reads the current partner privately, and
`/divorce` ends the active relationship while retaining its history.

The service locks the involved `discord_users` rows in numeric ID order before
mutating proposal or relationship state. A primary key on pending participants
prevents overlapping proposals. Another primary key on active relationship
members prevents a user from having multiple active marriages, including
across guilds. Acceptance, decline, cancellation, and divorce update all
related rows in one transaction. Discord interaction IDs are unique request
keys with stored operation fingerprints and results, so a repeated interaction
replays its result and reusing an ID for a different operation is rejected.

Marriage records are fictional social state, not a gameplay bonus. Proposals
do not expire automatically in V1. A user may propose again after a proposal
is declined/cancelled or after a relationship is ended.
