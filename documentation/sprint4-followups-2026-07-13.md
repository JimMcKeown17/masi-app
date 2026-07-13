# Sprint 4 Follow-Ups (2026-07-13)

Three items the Sprint 4B adversarial review surfaced and the sprint deliberately did NOT close. Recorded here rather than filed as GitHub issues, because the repo is public and item 1 describes a security-relevant hazard: **Jim decides whether these become issues, and whether item 1 should be private.**

Sources: `docs/superpowers/specs/2026-07-13-sprint4-pull-correctness-design.md` (sections C/D), `docs/superpowers/plans/2026-07-13-sprint4b-pull-reconcile.md` (dispositions S3, S13), `documentation/rls-sync-contract-map.md` ("Pull Persistence & Reconcile").

## 1. Server-authoritative acknowledgment RPC (closes the RLS under-return hazard)

**Priority: this is the only structural gap in reconcile.**

Sprint 4B ends local relationship rows the server stops acknowledging, so head-office removals stay gone offline (audit finding #4). Reconcile trusts the pull's per-scope results, but PostgreSQL RLS suppresses rows **without raising an error**: a drifted or overly restrictive SELECT policy returns an empty-but-successful result, which is indistinguishable client-side from "Head Office removed everything." A server authorization defect could therefore turn into durable local archives.

Shipped mitigations (conservative, not a complete fix):
- an errored scope never reconciles (per-scope gating);
- a scope at the 1000-row completeness limit never reconciles (truncation guard);
- the **mass-end circuit breaker**: a reconcile that would end more than 10 rows AND more than 50% of the scope's local active synced candidates is skipped, logged, and persisted as a needs-attention card on SyncStatusScreen with an explicit one-shot Apply. A human confirms before any mass removal lands.

Proposed fix: an authenticated RPC returning, in one server transaction, the active programme identity, the relationship-specific acknowledged id sets, and an explicit completeness claim, enforcing `auth.uid()` server-side. Plus an opt-in staging probe that seeds rows with service-role access and verifies the EA-scoped RPC returns every expected row. Needs a Supabase migration and a contract-map update.

## 2. Reference-table hard-delete strategy

Only `staff_programme_assignments` uses destructive scoped replacement on pull. Every other reference table (schools, teachers, job titles, academic years, assessment windows, programmes) only upserts returned rows, so a row hard-deleted server-side stays selectable on device indefinitely (for example a closed school still appearing in the class-creation picker). Not urgent, no data-loss risk, but it is a real staleness path with no current owner.

## 3. Product decision: server-deleted sessions and assessments

Sessions and assessments have no pull or reconcile path. A record deleted server-side remains visible in the device's history screens forever. It cannot resurrect roster entities (`getMyChildren` still requires the full active relationship chain), so this is a display-truth question, not a correctness bug.

**The decision Jim owns:** is offline retention of a server-deleted session/assessment a feature (the EA's own capture history is theirs) or a gap (head office deleted it for a reason)? The answer determines whether history needs a pull/reconcile path at all.
