# Masi Pre-Live Gate 0 Audit

**Point-in-time evidence dossier. Probed 2026-08-27.**

> **Follow-up status — 2026-09-04:** The findings below remain the pre-migration hosted-state
> baseline. The two session migrations are now applied to `masi-app-sqlite`; rollback-only hosted
> PostgreSQL and real PostgREST probes passed the accepted delivery-history/complete-family
> contract, and the actual PostgREST row cap is 1,000. No mobile hydration exists. Assessment
> authorization remains open. Current status lives in
> [`rls-sync-contract-map.md`](./rls-sync-contract-map.md) and [`ROADMAP.md`](./ROADMAP.md).

This is the first execution artifact from the
[`Masi/Zazi portfolio audit`](./masi-zazi-portfolio-audit-2026-08-27.md). It establishes what
actually exists before Masi uses its no-active-user window for structural hardening. It records
source intent, hosted state, live database truth, evidence boundaries, and the corrected order of
work. It is not a launch approval.

All backend probes in this audit were read-only. No application code, database rows, migrations,
EAS builds/updates/submissions, store state, or devices were changed.

## Executive findings

1. The portfolio documentation is safely on remote `main` at
   `2f6b903f7fb69fff1834346df2c09d617244ebf2`, and the exact post-push GitHub `tests` workflow
   completed successfully.
2. Current source/profile intent and local configuration consistently make `masi-app-sqlite`
   (`segygjzpujphwvrubusm`) the forward backend. Hosted production builds and production OTA
   history remain on the older 1.1/1.2 line; a new production build from current profiles would be
   a backend/runtime cutover. The older backend remains explicitly selectable and was not probed
   because the repository requires separate authorization for legacy-backend access.
3. The forward backend is not empty. It has 5 Auth users, 4 app users, 25 sessions, 49 attendees,
   31 assessments, and 900 assessment items. These appear to be test/pilot data, but that
   classification and their retention/reset treatment remain a user decision.
4. The 21 canonical Supabase migrations exactly match the 21 live migration-ledger entries through
   `20260714233000_sync_relationship_indexes`. The four history tables' live columns, indexes,
   RLS policies, and helper functions were inspected directly rather than inferred from migrations.
5. The accepted access model and live RLS disagree in a release-relevant way. The decision says
   session history is delivery-scoped and assessment history is class-scoped only for the current
   academic year. Live session and assessment policies both route through
   `private.current_user_can_read_child`, which also grants current class and group assignment
   access. Session history is therefore structurally broader than intended, while assessment
   history has no assessment-year bound.
6. That authorization mismatch must be corrected and behavior-proved before adding history
   hydration. Otherwise the new pull would make the wrong server-visible rows durable on devices.
7. The live Programme-scoped session query also showed the cost of using a broad projection helper
   as row-by-row authorization: only 25 candidate rows took 8.985 ms and 886 shared-buffer hits,
   including 875 buffer hits for five non-owned candidates. Adding an ordering index alone will not
   solve this.
8. After the authorization gate, sessions/attendees remain the correct first hydration family.
   Assessments/items follow only after their current-year class scope, existing class-assignment
   integration, and item-correction identity are explicit.

## Evidence layers

| Layer | Evidence earned | Non-claim |
|---|---|---|
| Source/Git | Audited merge `2f6b903` was clean at the probe baseline; exact refs/config inspected | Does not prove the current worktree, hosted, or installed state |
| Automated CI | GitHub run `33128554546` passed at exact merge SHA | Does not prove mobile binary/device behavior |
| Hosted EAS | Project, builds, channels, branches, updates, build numbers inspected | Store artifact does not prove submission/delivery/install |
| Live PostgreSQL | Explicit read-only catalog, RLS, count, aggregate, and plan probes against the forward project | Does not establish legacy-backend or physical-device state |
| TestFlight | Existing build log records a 1.3.0 TestFlight installation | Does not establish today's installed-device fleet |
| EAS Android artifact | Finished store-distribution AAB exists | No inspected evidence of Play-track upload, activation, enrollment, or install |
| Field | Jim reports no current staff use | Does not prove no old binary, local residue, or backend automation exists |

## Git and CI estate

- GitHub repository: `JimMcKeown17/masi-app`.
- Default branch: `main`.
- Audited merge: `2f6b903f7fb69fff1834346df2c09d617244ebf2`.
- GitHub workflow: `tests`, run `33128554546`, push event, exact merge SHA, successful.
- Workflow gates: `npm ci`, unit Jest, and the file-backed real-SQLite integration suite.
- The branch rule expects context `test`, but does not enforce admins. The direct push initially
  reported a bypass; the actual push-triggered run subsequently restored test evidence for the
  exact merge. The independent governance/control gap—admins can bypass the rule—remains open.
- Relevant older branches remain, including `release/1.3.0-preview` at `34c755d` and the off-main
  WelaPLUS branch. Branch existence is not release state.

## App, backend, and release identity

Current source resolves to:

| Identity | Current value |
|---|---|
| App | Masi |
| Expo slug/owner | `masi-mobile-app` / `jimmckeown` |
| App/runtime line | `1.3.0`; runtime policy `appVersion` |
| iOS/Android identity | `org.masinyusane.masi` |
| EAS project | `6a430b63-345e-4313-90ea-e332700295e9` |
| Default Supabase target | `sqlite-staging` |
| Forward Supabase project | `segygjzpujphwvrubusm` |
| Explicit legacy target | `primary` / `jcqrlwetutnpuchjoyyd` |

`config/supabaseProjectConfig.js` fails closed on unknown targets, target/project mismatch, and
target/URL mismatch. The repository's `sqlite:staging:check` also confirmed and redacted the exact
forward target before every direct database probe.

`package.json` has package metadata version `1.0.0` while Expo's application version is `1.3.0`.
Expo/EAS use the latter, so this is not presently a runtime bug; it is a source-of-truth ambiguity
to either document or align before automation starts consuming the package version.

## Hosted EAS estate

The hosted project identity matches source. The most relevant builds are:

| Build | Platform | Profile | Distribution | Version/build | Source |
|---|---|---|---|---|---|
| `7838c9fd-d875-4ae1-940c-7c25ef24f48b` | iOS | pilot | store | 1.3.0 / 7 | `34c755d` |
| `8c04cd52-4e6f-4bfe-b36a-9da658db2dd5` | Android | pilot | store | 1.3.0 / 5 | `34c755d` |
| `83f42fbf-6403-4c41-b010-365da178ff89` | iOS | preview | internal | 1.3.0 / 6 | `d01b0cc` |
| `6b0fef99-5796-4502-b2e8-df62272acb53` | Android | preview | internal | 1.3.0 / 4 | `d01b0cc` |

Important boundaries:

- There is no hosted production build on the 1.3.0 runtime line.
- Existing production build/update history is on the older 1.1/1.2 line.
- The current source `production` profile now targets the SQLite backend. Its first 1.3+ production
  build would therefore be a backend/runtime cutover event, not an ordinary continuation.
- The `preview` channel maps to the `preview` branch but has no published update group.
- The `production` channel maps to `production`; its newest inspected update targets runtime 1.2.0.
- There is an iOS-only `pilot` submit profile. Android pilot upload is intentionally manual, which
  protects the old Play track but needs an explicit release ledger.
- A finished store-signed EAS build does not prove submission, store acceptance, tester assignment,
  delivery, installation, populated-data convergence, or field verification.

Before launch, App Store Connect and Play Console still need direct inventory of builds, tracks,
groups, testers, rollout status, and installed-device expectations.

## Forward Supabase migration and data estate

The repository wrapper confirmed:

```text
target=sqlite-staging
project_ref=segygjzpujphwvrubusm
```

The Supabase CLI then hit the documented `.env.local` parser collision. The project runbook's
direct PostgreSQL fallback was used with credentials kept in-process and output redacted. Every SQL
probe began with `BEGIN READ ONLY` and ended with `COMMIT`.

### Reproducibility boundary

Safe repository entry points are:

```bash
npm run sqlite:staging:check
npm run sqlite:staging:migrations
npm run sqlite:staging:query -- "SELECT count(*) FROM public.sessions;"
npm run sqlite:staging:dry-run
npm run sqlite:staging:advisors
```

The first command succeeded and confirmed the redacted forward target. The migration command failed
before its remote request with
`LegacyDbConfigLoadError: failed to parse environment file: .env.local`; this was a local
CLI/environment parser failure, not migration-drift evidence. The read-only fallback followed
[`.claude/skills/sqlite-staging-sql/SKILL.md`](../.claude/skills/sqlite-staging-sql/SKILL.md),
section “Non-interactive fallback,” using direct PostgreSQL with credentials kept outside copied
commands and output.

The redacted probe set covered PostgreSQL/migration metadata; four-table columns, FKs, indexes, and
RLS flags; policy/helper definitions; aggregate counts, orphans, duplicates, null positions, and
timestamp ties; authenticated visibility counts; and `EXPLAIN (ANALYZE, BUFFERS)` for owner,
Programme, attendee-parent, and assessment-item-parent query shapes. It did not capture credentials,
URLs, user IDs, actor identity, or row contents. Never inject `.env.local` into Supabase CLI
commands; before any future write, re-run the target guard and confirm the forward project ref.

Live PostgreSQL is 17.6. The live migration ledger has 21 entries, with the same first/latest
versions and names as the 21 files under `supabase/migrations/`:

```text
first  20260521115412_masi_clean_base_schema
latest 20260714233000_sync_relationship_indexes
```

Counts captured without reading record content:

| Table | Rows |
|---|---:|
| `auth.users` | 5 |
| `users` | 4 |
| `staff_programme_assignments` | 4 |
| `children` | 32 |
| `groups` | 13 |
| `time_entries` | 33 |
| `sessions` | 25 |
| `session_attendees` | 49 |
| `assessments` | 31 |
| `assessment_items` | 900 |

The rows span 4 session writers, 3 assessment writers, and one Programme. Sessions cover
2026-05-22 through 2026-07-28; assessments cover 2026-05-22 through 2026-08-04.

Aggregate shape:

| Family | Average children | Minimum | Maximum | p95 |
|---|---:|---:|---:|---:|
| Session attendees | 1.96 | 1 | 3 | 3 |
| Assessment items | 29.03 | 1 | 61 | 61 |

There were zero orphan attendees/items, zero duplicate session-child pairs, and zero duplicate
non-null assessment positions. Thirty-one assessment items have null `position`; this is compatible
with summary/special items and means item pagination cannot rely on position alone.

No duplicate `created_at` or `updated_at` groups happened in the current small dataset, but this is
not an identity guarantee. Every cursor still needs an immutable unique tie-breaker such as `id`.

`current_setting('pgrst.db_max_rows', true)` returned no value. The actual PostgREST cap therefore
remains unverified. With 900 live assessment items already near the conventional 1,000-row boundary
and up to 61 items per assessment, child-family pagination must be explicit rather than inferred
from current volume.

## Live history schema and indexes

All four history tables have RLS enabled. Their live columns match the current migration intent for
the inspected fields, including:

- `sessions.group_id` nullable and `sessions.state` defaulting to `completed`;
- nullable `session_attendees.group_id` and `grade_snapshot`;
- nullable `assessments.capture_mode` plus tool/window/snapshot fields;
- `assessment_items.metadata`, nullable `position`, and parent FK.

Current useful indexes include:

```text
sessions(user_id, programme_id)
sessions(session_date)
session_attendees(session_id)
assessments(user_id, programme_id)
assessments(child_id, programme_id)
assessment_items(assessment_id)
unique assessment_items(assessment_id, position) where position is not null
```

There is no history-keyset index proved for the intended capturer-agnostic scope. Candidate indexes
must be derived after the authorization/query shape is corrected; adding
`(programme_id, updated_at, id)` to the current broad per-row helper would not fix its authorization
cost.

All parent FKs are present. Parent deletion cascades to attendees/items; user/child deletion can
also cascade history. This conflicts with the standing product rule that historical sessions and
assessments are not casually hard-deleted. The current child-delete guard protects ordinary mobile
child deletion, but history retention must remain part of every future admin/control-plane review.

## Confirmed authorization-contract mismatch

The accepted tier model is:

| Data | Intended read scope |
|---|---|
| Child/current roster | Current class assignment |
| Assessment history | Current class assignment, current academic year only |
| Session history | Delivery assignment, capturer-agnostic; historical handover allowed |

The live helper `private.current_user_can_read_child(child_id)` returns true through any of:

- child creator;
- a direct `child_ea_assignments` row, including an ended one;
- an active class assignment joined to the child's active class membership;
- an active group assignment joined to the child's active group membership.

Live `sessions` SELECT delegates to `private.can_read_session`, which uses that general child-read
helper; attendee visibility derives from the parent session or the same broad child capability.
Consequently a class-only or group-only grant can structurally expose session/delivery history,
contrary to the accepted decision. Live `assessments` and `assessment_items` also depend on the
general helper, but do not bind assessment visibility to the current academic-year membership
window. They therefore implement a broad class/group-capable read, not the accepted current-year
assessment scope.

This is exactly the portfolio invariant P-03 failure mode: a broad child-visibility projection is
being reused as the authorization substrate for activity types whose grants intentionally differ.

Required correction before hydration:

1. Give session history its own delivery-history predicate. The owner remains visible; non-owner
   history requires the accepted direct delivery-assignment semantics, not the general child-read
   helper.
2. Give assessment history its own class/year predicate, including an explicit definition of the
   current academic year and the relevant membership window.
3. Apply the same parent semantics to attendees/items; child policies must not widen the parent.
4. Behavior-test owner, prior capturer, current/historical delivery assignee, class-only assessor,
   group-only editor, unrelated EA, revoked grant, and prior academic year.
5. Prove the final query shape and indexes under authenticated RLS or a least-privilege RPC before
   writing the mobile pull.

## Live query-plan evidence

An authenticated test actor with one active Programme was selected without printing identity.

Owner-constrained session history:

```text
predicate: user_id = auth.uid() and programme_id = active programme
returned: 20 rows
execution: 0.819 ms
shared buffers: 13
```

Programme-scoped, capturer-agnostic session history through current RLS:

```text
candidate rows: 25
visible rows: 20
execution: 8.985 ms
shared buffers: 886
five non-owned candidates caused 875 helper buffer hits
```

This tiny fixture already makes the broad helper path roughly eleven times slower than the
owner-constrained path. It is not an acceptable national-scale query shape merely because it is
fast enough on 25 rows.

Child-family plans were viable at current volume but still show policy work:

- 40 attendees by 20 parent IDs: 1.304 ms, 86 shared-buffer hits.
- 604 assessment items by 22 parent IDs: 3.101 ms, 227 shared-buffer hits; assessment-policy
  evaluation accounted for 191 hits.

These measurements justify bounded parent-ID chunks and query-specific plan gates. They do not yet
choose between direct PostgREST keyset queries and an actor-derived page RPC.

## Corrected order of work

### Gate 0A — authorization and evidence correction

- Align live session/assessment RLS with ADR-0005.
- Add exact authenticated PostgreSQL behavior fixtures and query-plan gates.
- Decide whether a least-privilege history RPC gives a clearer completeness/cursor contract than
  several raw table queries.
- Verify and reuse the existing `ClassesContext`/SQLite class-assignment hydration; make the
  assessment scope consume one canonical durable query rather than React context timing.
- Confirm the PostgREST cap through hosted HTTP or management configuration.

### Gate 0B — release/data decisions

- Decide whether the current forward-backend test data is retained, snapshotted, or reset.
- Explicitly designate the next app/runtime version; do not accidentally treat 1.3.0 source as an
  ordinary continuation of the legacy production line.
- Inventory App Store Connect, Play tracks, tester groups, and known test devices.
- Obtain explicit authorization before probing the legacy backend; until then its data/automation
  estate remains unknown.

### Slice 1 — sessions and attendees

- Use Programme plus the corrected delivery-history authority; do not filter to capturer only.
- Use deterministic bounded keyset pages with `id` as a tie-breaker and an explicit request deadline
  from the first implementation. There is no unpaginated intermediate contract.
- Persist returned server parents, then attendees, without overwriting pending/failed/terminal
  local intent.
- Treat history as retained truth: page absence never deletes a local session or attendee.
- Mark hydration complete only after every parent and child page succeeds.
- Treat a successful final page as hydration completeness for that request, not as a server
  attestation that absent historical rows should be deleted.
- Publish UI state from a fresh SQLite read.
- Prove reinstall, second device, force-stop, same-timestamp boundaries, cross-capturer handover,
  incomplete page, and revoked-authority behavior.

### Slice 2 — assessments and items

- Prove the existing class-assignment hydration feeds a canonical SQLite assessment-scope query,
  then land the current-year assessment read predicate.
- Resolve whether assessment items are immutable attempt evidence or mutable per-position results.
  Today their deterministic ID changes with correctness while the server enforces one non-null
  position per assessment; correction semantics are therefore not safely implicit.
- Page parents and items independently; never mark a parent family complete after a truncated item
  query. Every page request has the same bounded deadline/completeness contract as sessions.
- Preserve the special summary item and exact mastery/recency semantics.

### Parallel lane — durable incidents and release provenance

Continue the minimum incident/provenance work from the portfolio audit, but do not let it delay the
authorization correction. The incident lane is how future incomplete/forbidden history pulls become
supportable rather than silent.

For future writes, do not make causal-protocol adoption depend only on observed bugs. A second
writer, shared mutable aggregate, side-effecting RPC, or unsafe partial family triggers an explicit
proof that stable-ID upsert is sufficient—or a narrower causal command—without importing Zazi
protocol v2 wholesale.

## Open decisions requiring Jim

1. May the audit perform counts-only, read-only inspection of the legacy Masi Supabase project, or
   should it remain completely out of scope?
2. Should the current forward-backend test/pilot data be retained as a regression fixture,
   snapshotted and reset, or left untouched until the history slices pass?
3. Should the next internal pilot remain on runtime/app 1.3.0, or should the pre-live architecture
   changes establish a new 1.4.0 compatibility boundary?
4. For assessment correction, is a submitted item immutable evidence, or may an EA reopen and edit
   the same attempt?

The first three implementation choices can be prepared without guessing those answers, but no
legacy probe, destructive reset, store action, or assessment-identity change should happen until
the relevant decision is explicit.
