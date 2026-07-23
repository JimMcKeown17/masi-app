> **Archived 2026-07-23.** The reconcile acknowledgment RPC is deployed and
> live-probed. Jim's no-delete and ignore-flag rulings, plus the remaining Head
> Office visibility work, are consolidated in
> [`documentation/ROADMAP.md`](../ROADMAP.md).

# Sprint 4 Follow-Ups (2026-07-13)

Items the Sprint 4B adversarial review surfaced and the sprint deliberately did NOT close. Jim's domain rulings (2026-07-13) are recorded inline; two of the three original items are now closed.

Sources: `docs/superpowers/specs/2026-07-13-sprint4-pull-correctness-design.md` (sections C/D), `docs/superpowers/plans/2026-07-13-sprint4b-pull-reconcile.md` (dispositions S3, S13), `documentation/rls-sync-contract-map.md` ("Pull Persistence & Reconcile").

> **Status update, 2026-07-14:** Item 1 is implemented on branch `fix/server-authoritative-reconcile`: additive migration `20260714220000_server_authoritative_reconcile_acknowledgments.sql`, fail-closed client consumption, real-SQLite under-return and unavailable-RPC coverage, and an exact live probe are built. It is not operationally closed until the migration is applied to `masi-app-sqlite` and `npm run rls:probe` passes. The original review text below is retained as dated design evidence.

## 1. OPEN: server-authoritative acknowledgment RPC (closes the RLS under-return hazard)

**The only structural gap left in reconcile.** Not urgent while the SQLite backend has no field users, but it must be settled before the head-office writer exists.

Sprint 4B ends local relationship rows the server stops acknowledging, so head-office removals stay gone offline (audit finding #4). Reconcile trusts the pull's per-scope results. But PostgreSQL RLS suppresses rows **without raising an error**: a drifted or overly restrictive SELECT policy returns an empty-but-successful result, indistinguishable client-side from "Head Office removed everything." A server authorization defect could therefore turn into durable local archives.

Shipped mitigations (conservative, not a complete fix):
- an errored scope never reconciles (per-scope gating);
- a scope at the 1000-row completeness limit never reconciles (truncation guard);
- the **mass-end circuit breaker**: a reconcile that would end more than 10 rows AND more than 50% of the scope's local active synced candidates is skipped, logged, and persisted as a needs-attention card on SyncStatusScreen with an explicit one-shot Apply. A human confirms before any mass removal lands.

Proposed fix: an authenticated RPC returning, in one server transaction, the active programme identity, the relationship-specific acknowledged id sets, and an explicit completeness claim, enforcing `auth.uid()` server-side. Plus an opt-in staging probe that seeds rows with service-role access and verifies the EA-scoped RPC returns every expected row. Needs a Supabase migration and a contract-map update.

## 2. CLOSED: reference-table hard-delete strategy

**Jim (2026-07-13): schools are never closed.** A programme may be paused in a school, or run in one year and not another, but the school itself always stays valid in master selections. Reference rows are therefore never hard-deleted, so no reconcile path is needed for them and the staleness concern is void.

**Note for the future head-office work (not a Sprint 4 gap):** "programme paused in this school this year" is **not modeled today**. There is no school-by-programme-by-year table; the only thing tying a programme to a school is `staff_programme_assignments (user_id, programme_id, school_id, assigned_at, ended_at)`, which carries no academic year. Today a pause can only be expressed by ending staff assignments. If head office needs to pause a programme in a school for a year without touching staffing, that needs a real model. Raise it when the head-office UI is designed, not before.

## 3. RESHAPED: no deletion; use an ignore flag

**Jim (2026-07-13): head office should not be deleting things.** The intent is to attach an **ignore flag** to data that should not be processed, calculated, or used, rather than removing it.

This already matches what Sprint 4B built: **reconcile never deletes entities.** It only end-dates the relationship rows that define an EA's scope (assignment, enrollment, membership). Children, classes, and groups keep their rows and their history; an entity only disappears from a device when head office ends the relationship, and a genuine archive arrives as a tombstone on the row itself.

The ignore flag is a **different axis** and is not built: excluding *captured records* (sessions, assessments, mastery) from calculation. Design sketch when it comes up:
- a nullable, synced column (for example `ignored_at` + `ignored_reason` + `ignored_by_user_id`) on the record tables, additive and backwards-compatible;
- every stats and reporting consumer filters on it (`dashboardStats`, mastery computation, the ZZ compute path, any future head-office reporting);
- the mobile app keeps showing the record in the EA's own history, because it is still their work; it simply stops counting.

This replaces the original question ("should a server-deleted session vanish from the device?"). It should not, because head office should not be deleting sessions.

## 4. NEW (low priority, Jim: "not a major concern right now"): tell the EA what head office changed

When head office corrects data on an EA's behalf, the device should mirror it **and visibly say so**, because head office also makes mistakes and a silent change is hard to question.

Today: mass changes already surface (the breaker's needs-attention card, item 1), but a small change (one child unassigned) mirrors silently. A future "what changed" surface would close this. Design it alongside the head-office UI, when the vocabulary of allowed head-office actions actually exists.
