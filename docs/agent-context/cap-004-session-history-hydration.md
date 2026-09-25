# CAP-004 Handoff: Session and Attendee History Hydration

**For:** Codex (review, then build) working in this repository on branch
`spec/cap-004-session-history-hydration` or its successor.
**From:** Claude, after a grill-with-docs design session with Jim, 2026-09-05 to 2026-09-08.
**Status on hand-over:** design approved by Jim; spec written; **not yet reviewed by anyone**. Jim
runs the adversarial review with Codex himself, then an implementation plan is written from the
reviewed spec.

## Read in this order

1. `AGENTS.md`, then `CONTEXT.md` (the new term **history reference child** is in "Programmes and
   delivery" and "Relationships").
2. `docs/superpowers/specs/2026-09-08-cap-004-session-history-hydration-design.md` — the spec.
3. `docs/adr/0006-session-history-converges-on-server-stamped-family-timestamp.md` — why the
   convergence rule is a server-stamped family timestamp rather than the date keyset.
4. `documentation/rls-sync-contract-map.md` — "Pre-Live History Authorization", "Session aggregate
   boundary", the "Delivery-history parent page" operation row, "Pull Persistence & Reconcile".
   These describe the **current** hosted contract the spec supersedes and the rails the spec keeps.
5. `documentation/field-app-capability-ledger.md` — CAP-004 and CAP-007.
6. `documentation/build-log.md` — Verification Register rows dated 2026-09-04 (hosted gate, the
   adversarial review, the two tooling PRs) and the 2026-09-08 Decision Register row.
7. Code the design fits into: `src/services/preloadedChildData.js` (scope results,
   `classifyPullFailureKind`, request queue usage), `src/context/ChildrenContext.js` (pull
   orchestration and stamps), `src/db/repositories/sessionsRepository.js`,
   `src/db/repositories/domainRepositoryUtils.js` (`serverPullWouldClobberPendingLocal`,
   `getActiveAcademicYear`), `src/db/repositories/syncStateRepository.js`, `src/db/migrations.js`,
   `scripts/history-authorization-postgres-harness.cjs`, `supabase/migrations/20260828004500_*.sql`
   and `20260828010000_*.sql`.

## Jim's decisions (do not reopen without him)

| Date | Decision | Where recorded |
|---|---|---|
| 2026-09-05 | Hydrate only sessions whose `session_date` falls in the **active academic year** (lower bound = `academic_years.starts_on`, computed on the device and passed to the RPC) | Spec §2, §5.2 |
| 2026-09-05 | Coattendees outside the actor's scopes are stored as **history reference children**: a minimal flagged `children` row, identity and display name only, excluded from roster/class/assessment reads, never uploaded, upgraded in place by a later roster pull | `CONTEXT.md`; spec §3, §6 |
| 2026-09-05 | Convergence is a **delta on the parent session's server-stamped `updated_at`**, bumped by a trigger when any attendee is written; two-minute overlap rewind; one RPC for first hydration and later runs. Jim's stated constraint: traffic must not grow with history | ADR-0006; spec §4.1, §4.2, §5 |
| 2026-09-08 | History renders SQLite immediately with a quiet inline status line; Sync Status gets a separate History row; nothing blocks capture | Spec §7 |
| 2026-09-08 | The descending session-date RPC `get_delivery_history_session_page` and its index are **dropped in the same migration** | Spec §4.4 |
| 2026-09-08 | Record the convergence decision as ADR-0006 | `docs/adr/0006-*.md` |

## State of the estate at hand-over

- Hosted `masi-app-sqlite` (`segygjzpujphwvrubusm`): session authorization migrations
  `20260828004500` and `20260828010000` applied 2026-09-04 and gate-passed. The RPC they added is
  live and has **no mobile consumer**; the CAP-004 migration replaces it.
- Open PRs, both green, stacked: **#55** (harness disposable-target guard) and **#56** (staging
  tooling: strict dotenv diagnostics, auth preflight, and CLI isolation from `.env.local`). This
  branch is stacked on #56. Merge order #55 → #56 → this, or #56 alone then this.
- Operator follow-ups outside the repo (Jim): rename `.env.local` line 24 `SUPABASE_PROJECT_ID` to
  `LEGACY_SUPABASE_PROJECT_ID` and comment out the prose at lines 71–73. Until #56 merges, never run
  raw `supabase` commands from the repository root: the CLI auto-loads `.env.local` and honours
  `SUPABASE_PROJECT_ID` over `--linked`, which would target the legacy production project.
- No field users are on the sqlite backend yet; its data is disposable dev/test data.

## Constraints that bind every task

- **DDL only through canonical migrations** under `supabase/migrations/`, applied with the isolated
  staging helper (`npm run sqlite:staging:dry-run`, then `:push`) after the disposable-PostgreSQL
  harness passes. Confirm the printed `project_ref=segygjzpujphwvrubusm` before any push. Never
  inject or source `.env.local` into CLI commands. The Supabase MCP server stays disabled.
- **Node 20** for anything touching `better-sqlite3`:
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test`.
- **TDD in vertical slices** (`.agents/skills/tdd`): failing test first, real SQLite for migration,
  transaction, and foreign-key behaviour; the disposable-PostgreSQL harness for RLS, trigger, RPC,
  and plan behaviour. The harness needs `HISTORY_RLS_ADMIN_DATABASE_URL` (localhost only, no query
  string), `HISTORY_RLS_DATABASE_NAME` starting `masi_history_rls_`, and
  `HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE`; see `.github/workflows/tests.yml`.
- **Safety rails that must survive:** pending/failed local rows win; `synced`/`terminal` are
  replaced; history absence never deletes; ordinary RLS-filtered, expired, errored, or truncated
  results never mark hydration complete; raw server timestamp strings are never converted through a
  millisecond `Date` before being used as a cursor.
- **Docs ship with code in the same branch:** `rls-sync-contract-map.md`, the capability ledger,
  `ROADMAP.md`, and `build-log.md` (append at the **bottom** of each register, newest last). Update
  `CONTEXT.md` only for domain language.
- **Git:** one branch per task; never add an agent co-author trailer to commit messages (Jim's
  rule). If your sandbox cannot commit, leave the working tree for the orchestrator and say so.

## Suggested slice order for the implementation plan

1. **Server migration + harness (red first).** Trigger `private.touch_session_family()`, RPCs
   `get_delivery_history_page` and `get_delivery_history_attendee_page`, indexes, drops, grants.
   Extend `scripts/history-authorization-postgres-harness.cjs`: six-actor matrix for both RPCs,
   late-attendee bump, keyset exactness on equal `updated_at`, dense-owner/dense-delivery/deep-page
   fixtures with inner-plan measurement, old function and index absent.
2. **SQLite migration + repository.** `children.history_reference`; `CHILD_COLUMNS` update;
   `sessionsRepository.saveHistoryPage` with cursor advance in-transaction; reference-child insert
   and in-place upgrade; real-SQLite tests for atomicity, foreign keys on, pending-local-wins, no
   absence delete, resume after mid-page throw.
3. **Traversal service** `src/services/sessionHistoryPull.js` with a fake client: page loop,
   attendee pages, incomplete-family handling, deadlines and run budget, overlap rewind, window
   reset on new academic year, raw cursor strings.
4. **Orchestration + UX.** Trigger after roster/reference pulls; single-flight; History inline line;
   Sync Status History row through `syncStatusPresenter`; reader-intent audit (§6.4).
5. **Reads audit.** Every `children` reader excludes `history_reference = 1` where the join path
   does not already do so; tests per reader.
6. **Standing docs + build-log rows.**
7. **Hosted gate** (isolated helper apply; six actors; >1,000-attendee HTTP walk; zero residue),
   then **device gates** (new phone within a minute on iPhone and low-end Android; two-device
   convergence with a backdated session; force-stop and offline mid-download).

## Review focus Jim may hand to the reviewing Codex

- Does the per-arm `ORDER BY`/`LIMIT` before `UNION` remain exact for every cursor position,
  including equal `updated_at` across arms and a session that qualifies through both arms?
- Can the attendee trigger miss a family change (attendee deleted; `session_id` changed; batch
  insert ordering) or create a write hot-spot on a parent row?
- Is the two-minute overlap sufficient against PostgREST/pgbouncer transaction timing, and is the
  string-safe rewind implementable without a `Date` round-trip?
- Can a history reference child ever appear in a roster, group picker, assessment eligibility, or
  be pushed by any outbox path?
- Does dropping the gate-passed RPC in the same migration leave any consumer, test, or document
  pointing at it?
- Does "family incomplete → cursor stops before it" ever wedge a traversal permanently?

## Definition of done

Spec §8 tiers all green with evidence rows in `build-log.md`; `rls-sync-contract-map.md`, ledger,
and roadmap updated in the same branch; an EA signing in on a brand-new phone sees their own
history within a minute; two devices converge; the green upload label never implies history
completeness.

## Safe resumption point

This branch: `CONTEXT.md` term, spec, ADR-0006, roadmap pointer, decision-register row, and this
briefing. No implementation has started. Nothing has been applied to the hosted backend for CAP-004.
