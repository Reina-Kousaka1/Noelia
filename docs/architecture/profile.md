# Profile V2

The profile is a read-only aggregator, not a persistence owner. It reads the
wallet balance, Ballet level and stats, current wardrobe, collection
completion count, and selected achievement badge from their respective domain
ports concurrently. It writes none of those states and does not duplicate
their repositories.

`/profile` presents the information compactly: progress to the next level,
six capped Ballet stats, Ballet Slippers, current outfit, completed collection
count, and the optional featured achievement. The profile remains an
ephemeral Discord response. Relationship status will be added as a read-only
field after the relationship domain is implemented.
