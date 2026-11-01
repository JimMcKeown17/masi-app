---
status: accepted
date: 2026-11-01
---

# Numeracy ticks in a parallel skill mastery table

## Context

Numeracy records an EA's confirmation of a child knowing a curriculum step, identified by a
step key such as `add.5`. `letter_mastery` cannot hold that key: its letter CHECK permits
one lowercase character, its language is a two-letter code, and `set_letter_mastery` enforces
those shapes with its RPC regex. Generalising it would reopen a contract that just passed
hardened review while November's literacy field retest starts on that contract.

The [numeracy design](../superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md#81-skill_mastery-a-parallel-table-not-letter_mastery)
chooses a parallel table. Numeracy is outside the November field retest; the December trial
and partner sign-off remain separate gates.

## Decision

Store numeracy ticks in `skill_mastery`, with `(child_id, step_key)` as the natural key.
Copy the hardened letter mastery contract: a deterministic UUIDv5 id in the new namespace
`20002406-1d97-4087-b350-a8d41515dd39`, append-only correction receipts, the
`(changed_at, correction_id)` winner, one outbox slot per current row, and a history pull
with no Programme or academic-year bound. The last writer or any current child deliverer
can read the row. Only the receipt-backed correction RPC writes it. The skill history
switch is independent of literacy history.

A step key's meaning never changes. The server checks only `^[a-z_]+\.[0-9a-z]+$`;
the phone's write interface checks the bundled curriculum. History accepts any well-formed
key, including keys unknown to the installed edition or retired by a newer edition.

Accepted risks A2 and A3 are inherited unchanged from the
[letter mastery contract](../../documentation/rls-sync-contract-map.md): A2 can hold back a
delayed tap while a correction queued under a fast clock remains owed after clock correction;
A3 can revert a slow phone's later tap to another phone's newer server winner until the slow
clock catches up. This decision adds no causal ordering mechanism.

## Consequences

The repositories and RPCs duplicate code deliberately. Literacy's repository, correction
service and migrations retain their existing behavior. “Unify mastery tables” is a roadmap
item owned by the plan's documentation task. Revisit this decision when a third mastery
domain arrives, or when a change is needed in both contracts at once.

Both server skill tables reference children with ON DELETE RESTRICT. The child-history guard
also checks skill ticks. RESTRICT closes the race in which a correction commits between the
history check and the child delete: deletion fails rather than erasing an acknowledged tick
and its receipt. Service-role cleanup must remove skill rows and receipts before children.
Letter mastery retains its existing cascade behavior and latent delete race.

Reporting counts received skill correction receipts by their writer, including receipts
whose correction no longer wins the current row. The new migration must be applied at Jim's
Task 7 gate before this branch merges; hosted application, phone integration and device
verification are separate from this task's disposable PostgreSQL proof.
