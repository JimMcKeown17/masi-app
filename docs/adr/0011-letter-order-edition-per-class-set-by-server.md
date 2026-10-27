---
status: accepted
date: 2026-10-27
---

# Each class keeps a letter order edition set by the server

## Context

Lesson suggestions, content packs, trackers and the Session complete receipt previously drew on
different teaching sequences. Choosing a sequence by language alone would also change existing
classes whenever a newer sequence shipped. A class needs a stable teaching sequence while its
language and available content can change independently.

The shared [books design note at `9cd66f8`](https://github.com/JimMcKeown17/early-reader-books/blob/9cd66f8/docs/design/2026-10-23-letter-order-versions.md)
defines an edition as one order per language. Masi starts with `2026-10-23`; it does not need
Zazi's legacy-edition rollout because lesson flow and letter orders reach Masi field phones
together. Implementation is specified in the
[letter order editions plan](../superpowers/plans/2026-10-26-letter-order-editions.md).

## Decision

**The server sets each class's edition, and the app never changes or uploads it.** The server
fills existing classes and new inserts with `2026-10-23`, and preserves the stored edition on
app updates. The phone's local default permits offline class creation. Every authoritative
server edition is accepted on pull, including when a class has pending local edits; missing or
null server values preserve the phone's stored edition.

**Edition plus language resolves one teaching order from the shared registry.** The registry is
vendored unchanged from books. Lesson inputs, suggestions, the tracker sheet, the mastery panel
and the receipt all use that order. The mastery panel resolves the child's active class
membership. An unknown edition shows “Update the app to teach this class's letters.” rather than
substituting a different sequence.

**Packs are chosen by order id.** A new pack names its `letter_order`; lint checks its letter and
sound steps against the registry. Release versions are immutable, and older packs remain bundled
for saved drafts. Preview packs retain their explicit developer gate.

**Mastery belongs to the child and language.** Its counts and validation use that language's 26
tracker letters, independent of teaching sequence. Changing order requires no conversion of
mastery records. Sorting Wrap up and the receipt is display behavior; the draft and saved session
keep the letters' tap order. EGRA cards and assessment content keep their own orders.

**There is no Masi edition schedule yet.** It arrives with the second edition, in the migration
that widens the server check constraint. Data requests advertise the editions the app
understands; field release gates currently ensure phones understand the only Masi edition.

## Consequences

- A language edit selects that language's order within the same edition. A change to one
  language's sequence requires a new edition that may reuse the other languages' orders.
- The server owns the durable choice across phones and creation paths. Offline class creation
  uses a provisional local value; server truth wins after pull without losing pending renames.
- New editions require coordinated registry, pack, server and app releases. The hosted migration
  must precede installation, and SQLite schema 19 prevents downgrading to a build that cannot read
  it. Physical device and rollout checks remain separate from automated tests.
- Retaining older pack versions costs bundle space but preserves saved draft references. Existing
  test-phone drafts can retain old suggestions and must be finished or discarded before install.
- The new-order previews currently have no readers. Reader content remains a books follow-up.

## Considered alternatives

- **One current order per language.** Rejected: a content update would silently move existing
  classes to a different sequence.
- **A phone-owned per-class order id.** Rejected: language edits would require a matching re-pin,
  competing phones could choose differently, and client uploads would gain a new mutable field.
- **Store letter sequences in the database.** Rejected for now: the books registry already owns
  the shared definitions, while the server only needs to record which edition a class holds.
- **Add the schedule with the first Masi edition.** Deferred: every Masi class starts on the same
  edition. The second edition supplies the first actual scheduling decision.
