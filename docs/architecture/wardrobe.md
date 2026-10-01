# Wardrobe and outfit presets

Migration V11 adds user-owned outfit presets without changing the existing
wardrobe equipment model. A preset is a snapshot of the item's stable catalog
IDs and occupied slots; it does not grant or reserve ownership. Presets can be
created from the current non-empty outfit, replaced from the current outfit,
applied, renamed, and deleted. Users can also clear all currently equipped
pieces.

Applying a preset is one PostgreSQL transaction. The service locks the user's
identity row, verifies that every referenced item is still in their inventory,
and only then replaces their equipped slots. Items moved into marketplace
escrow therefore cannot be re-equipped through a saved preset; a failed apply
leaves the current outfit untouched. Existing wardrobe ownership checks and
slot-conflict behavior remain authoritative.

Preset mutations and wardrobe clearing use Discord interaction IDs as
idempotency keys. Their immutable request records store a fingerprint and the
result needed to replay a successful interaction. Concurrent operations for a
user serialize on the existing `discord_users` row. Each user may keep up to 20
presets, with names unique after Unicode normalization and case folding.

Commands:

- `/wardrobe view`, `/wardrobe equip`, `/wardrobe unequip`, `/wardrobe clear`
- `/wardrobe presets list|create|save|apply|rename|delete`

Presets intentionally do not prevent selling a referenced item. If an item is
sold, applying that preset fails clearly until the user reacquires the item.
