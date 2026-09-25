---
status: accepted
date: 2026-09-08
---

# Session history converges on a server-stamped family timestamp

Inbound session-history hydration (CAP-004) needed a convergence rule that a phone can run on
every foreground without traffic growing with the length of history. We page session families in
ascending order of the parent session's `updated_at`, which the server already forces to its own
clock on every write and which a new trigger bumps whenever one of the session's attendees is
written, filtered to the current academic year. Steady state is therefore one small request that
returns only changed families, and the descending `(session_date, created_at, id)` RPC that passed
the 2026-09-04 hosted gate is dropped because no phone ever called it.

## Considered options

- **Descending date keyset, re-walked every run.** The gate-passed RPC. Correct and simple, but
  every run re-downloads every parent row in the window, so traffic grows with history and the
  per-page cost was unbounded until the per-arm `LIMIT` reshape.
- **Manifest re-walk.** A light `(id, updated_at, attendee_count)` page per run, fetching full rows
  only for unknown or changed ids. Cheap in bytes, still O(history) requests per run, and a second
  RPC to keep consistent.
- **Delta on a client-sent `updated_at`.** Rejected outright: a phone with a wrong clock would hide
  its own sessions from every other device.
- **Hybrid: date keyset for first hydration, delta afterwards.** Newest sessions appear first during
  the initial download, at the cost of two traversal engines, two cursors, and two test suites for a
  download that takes seconds on wifi.

## Consequences

- `sessions.updated_at` now means "family last written on the server", not "parent row last
  written". Consumers that want the parent's own write time must not use it.
- A `security definer` trigger on `session_attendees` updates the parent row; it touches only
  `updated_at`, so the restrictive forward-prep guard policy is unaffected.
- Clients rewind the watermark by two minutes for overlap and rely on idempotent upserts.
- First hydration arrives oldest-first; the History screen shows a quiet "downloading" line rather
  than blocking.
- The retention window is a client policy (active academic year `starts_on`) passed to the RPC, so
  changing it needs no migration.
- Revisit when a session edit UI ships (confirm attendee edits surface), when an EA's yearly volume
  exceeds a handful of 200-row pages, or if a less-trusted reader class appears and the aggregate
  boundary itself must change.
