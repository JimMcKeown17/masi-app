# What Zazi's September–October Sync Work Means for Masi

**Point-in-time review, 2026-10-08.** Evidence window: Zazi iZandi commits 2026-09-08 through
2026-10-08 (`main` at `f0f78226`, plus the unmerged `feat/delta-fix-006-applier-20261008`,
`feat/setup-escape-after-no-progress-20261008`, `measure/pull-herd-load-20260924`,
`measure/rls-set-policies-20260925`, and `test/journeys-performance-20261007` branches). Masi
state: `feat/cap-004-session-history-hydration` at `4b887f4`.

This memo continues
[`zazi-field-lessons-for-masi-go-live-2026-08-27.md`](./zazi-field-lessons-for-masi-go-live-2026-08-27.md).
It is a dated record of evidence. Current status lives in [`ROADMAP.md`](./ROADMAP.md) and the plain-language
order in [`next-steps-2026-08-28.md`](./next-steps-2026-08-28.md). Five read-only research passes
(delta pull, first install, sync failures, measurement, identity) produced the findings. Every Masi
claim below marked **verified** was re-checked against source by the orchestrator. The other Masi
claims come from the research passes alone.

## Conclusion

Zazi spent the month fixing problems in the field that Masi can still avoid with cheap decisions now.

- **Phone-side apply cost dominated, not network cost.** On a Galaxy A03s, about 95% of a
  one-request delta was spent saving on the phone. Saving ran at 35–85 s/MB.
  - A busy account's 6.7 MB first download took 300 s. Of that, 271 s was history saves and 6 s was waiting on the RPC.
  - Skipping identical rows and preparing one statement per page cut it to 46 s.
- **A fixed watchdog falsely reported a working download as stuck.** A legitimate 215 s first download hit a fixed 90 s
  setup limit (ZZ-BUG-20261003-001). Zazi replaced it with "no progress for 90 s".
- **A first download that restarts from zero never finishes for an EA who clocks in and leaves.**
  This happened on 5 of 20 newly enabled EAs (ZZ-BUG-20261006-006). Masi's session history already
  commits its cursor with each page. Every other Masi pull should follow the same rule.
- **User saves queued behind long pull transactions.** Clock In waited 104 s and Start waited 70 s
  behind one pull merge, while the writes themselves took 0.05–0.15 s (ZZ-BUG-20261006-001). OTA +72
  made every save trigger a full re-download, and a session Start took 22.8 s (ZZ-BUG-20261004-001).
- **Server-owned rollout made canary and rollback free.** `private.mobile_pull_delta_rollout` holds
  one row per enabled account, or one row for everyone. Deleting a row rolls back without an
  OTA. Zazi bolted it onto a live fleet; Masi can build it before the first cohort.
- **Database capacity is finite and measurable.** Zazi's local herd harness measured older-style
  full pulls failing on a 2-core database somewhere between 1,000 and 3,000 EAs. 4 cores cleared
  1,000 EAs with p95 under 1 s. The absolute numbers are noisy: the same configuration ranged from
  57 to 116 s p95 between repeats.

Masi is already ahead of Zazi on several points:

- a server-stamped family timestamp (ADR-0006);
- a page-committed history cursor;
- raw-string timestamps;
- deterministic letter-mastery ids;
- reconcile that only ends `synced` rows;
- a WAL reader connection that keeps UI reads off the writer queue.

## Findings and dispositions

"Before Step 3" means before the assessment-history slice copies the session pattern.

| # | Zazi evidence | Masi state | Disposition |
|---|---|---|---|
| Z1 | Client-supplied `updated_at` is unsafe as a delta signal (31-row mismatch). Zazi's history tables use trigger-set `server_updated_at`. | **Verified:** only `sessions` and `session_attendees` are stamped `before insert or update` (`20260925120000_session_history_family_delta.sql:7-15`). Every other domain table sets the time on update only (`20260521115412_masi_clean_base_schema.sql:312-380`; `20260521144901_masi_zazi_alignment_schema.sql:254-289`). An insert therefore keeps the phone clock. | **Before Step 3** for `assessments`, `assessment_items`, `letter_mastery`. Extend to every table before any other delta. First audit client reliance on the phone-sent value. |
| Z2 | Apply cost dominates on low-end Android. Skip-identical plus a prepared statement per page took 300 s to 46 s. | **Verified:** `saveHistoryPage` (`src/db/repositories/sessionsRepository.js:265`) awaits up to 2 existence lookups, a pending-local check, and an upsert per attendee, all inside one writer transaction. The 2026-10-08 device test used 20 sessions, which cannot reveal this. | **Step 2 device gate:** measure with a realistic account. **Before Step 3:** batch lookups per page and skip identical rows. |
| Z3 | Saves queued behind pull transactions: Clock In waited 104 s. Zazi added a real-SQLite write-wait test and `[TxnQueue] tag/enq/start/end` lines. | One FIFO writer queue (`src/db/client.js:93-101`). No write-wait measurement exists. | **Step 2 device gate:** time a save during a download. **Roadmap §3:** write-wait test and queue timing lines. |
| Z4 | Every save triggered a full re-download (22.8 s Start). Zazi now pins trigger budgets in `pullTriggerInventory.test.js`, `pullTriggerBudget.providers.test.js` and `syncTriggerBudget.test.js`. | No trigger-budget tests. | **Roadmap §3**, before the pilot. |
| Z5 | Fixed 90 s setup watchdog vs a 215 s legitimate download. The escape now appears only after 30 s without progress. | History has a 60 s *run budget* that resumes from its cursor and never claims failure. **Correction, Codex review:** nothing schedules the resume. History starts only after a roster pull (`ChildrenContext.js:331`), and roster pulls are skipped while their 15-minute stamps are fresh (`OfflineContext.js:224-239`). So a budget stop or failure is not resumed by a foreground or reconnect within 15 minutes. The roster pull has no watchdog or progress signal. | **Roadmap §3**: any user-visible limit measures lack of progress, never elapsed time. |
| Z6 | `pullRequestBoundary.js` sets a 30 s deadline per request. | **Verified:** `src/services/supabaseRequestQueue.js` has no deadline. **Correction, Codex review:** uploads share this queue too (`offlineSync.js:1014-1016, 1203-1205`), and history's caller-side deadline reports failure without releasing the hung task ahead of it. | **Before pilot**: the *queue* enforces bounded completion for every task, uploads included (Roadmap §3). |
| Z7 | `syncPullJitter.js` uses one shared 0–3 min admission window per cold open or reconnect. Empty-cache bootstrap and explicit refresh bypass it. The 10k-EA assessment found cold caches were not jittered. | No jitter outside the history re-walk. | **Roadmap §3**: jitter covers cold opens too. |
| Z8 | Server rollout/kill table with a `rollout_disabled` answer, a per-account canary, and rollback by deleting a row. Disabling keeps the cursor. | None. | **Before pilot** (§3 kill switch item). Also carries pull interval and minimum client protocol. |
| Z9 | Scope tables are always full snapshots (~150 rows per EA). Only the 5 history tables are delta. Pre-RLS ID-union CTEs keep scan work flat as unrelated rows grow from 1,000 to 6,000 (`20260912190000_mobile_pull_snapshot_scope_indexes.sql`). | Roster pulls are full, `select('*')`, capped at `PULL_SCOPE_COMPLETENESS_LIMIT=1000`. | **Roadmap §3**: delta history only, snapshot rosters with pagination, narrow before RLS, add a flat-scaling test. No blanket `updated_at` indexes. |
| Z10 | The server decides baseline mode: `no_cursor`, `since_in_future` (more than 5 minutes ahead of server time), and periodic. The cursor never advances past a row skipped because pending local work won. | Session history has the weekly re-walk and first-walk. There is no future-cursor guard; the 2026-09-26 migration normalised existing future rows once. **Correction, Codex review:** do not import Zazi's "cursor never passes a pending row" rule. Masi skips the dirty family and advances (`sessionsRepository.js:279, 318`). That avoids the head-of-line stall spec §12.3 rejected. A skipped family returns when its upload lands, because the server re-stamps it after the cursor, or at the re-walk. | **Roadmap §3**: future-cursor guard plus Masi's own convergence contract. |
| Z11 | Zazi never built tombstones. Removals rely on periodic baselines. | History never deletes on absence (ADR-0006). Roster reconcile uses full snapshots. | **Roadmap §3**: an explicit item, decided before any roster delta. |
| Z12 | Incident key reuse with a changed body was rejected (Zazi bug G). The schema went to v3 with `condition_key` and `report_generation`, an 8 KB allowlisted payload, and observed OTA provenance. | `sync_outbox` has only `status` and free-text `last_error` (`src/db/migrations.js:45-48`). | **Step 4** design rules. Add structured `error_class`/`error_code` columns while the schema is cheap to change. |
| Z13 | Four error classes (`retryable`, `needs-parent`, `terminal`, `support-needed`). Each disposition maps to a named owner and procedure, and the recovery module imports no writer. | `classifyError` (`src/services/offlineSync.js:440-482`) already defers `23503`/`42501` while parent or grant evidence is pending. | **Step 4**. |
| Z14 | Millisecond-vs-microsecond equality made every lifecycle request fail (ZZ-BUG-20260915-001). Fixed with a shared client/server corpus test. | Masi never parses pulled timestamps into a `Date`. Possible risk: a millisecond phone `unassigned_at` (`childrenRepository.js:154`) against a microsecond server `assigned_at` under `unassigned_at >= assigned_at` CHECKs. **Not reproduced.** | **Roadmap §2**: state one precision rule in the contract map and add a shared corpus test. |
| Z15 | Demo accounts without a marker appeared as real EAs in a live staff page. Seeders now always stamp `app_metadata.is_test_account`. | `scripts/createTesters.js` sets no marker. | **Step 6**. |
| Z16 | Suspension reuses an Auth ban plus inactive roster status. A signed-in phone keeps syncing for up to an hour, an accepted limitation. | `users.is_active` exists, but the research pass found no RLS policy that reads it. | **Roadmap §6**: decide the departed-user shape before national provisioning. |
| Z17 | Reporting RPCs are versioned `_vN`, never edited in place, with a post-apply verifier and a `pg_get_functiondef` md5 record. | Unversioned history RPCs. A disposable-PostgreSQL harness exists. | **Roadmap §9**: adopt the convention. |
| Z18 | Starting another group overwrote an unfinished session (ZZ-BUG-20260922-001). A session timer ran unbounded, and a 1,140-minute session was saved (ZZ-BUG-20260924-001). | Masi has no active-session key and no session timer yet. | **Roadmap §2**: key durable drafts per group, refuse a second start, and bound any session timer. |
| Z19 | Organisation label v1: a required `organization_id` on the EA roster, no default, identity only. | No organisation concept. | **Decision for Jim**: is a partner organisation plausible within a year? |
| Z20 | Sentry fingerprint overrides for known native SQLite rejections. | No fingerprint override in `src/services/observability.js`. | **Roadmap §0** (small). |

## Deliberately not adopted

These items are retrofits for Zazi's legacy installs and old data, or proof machinery Masi has no use for:

- the legacy pull path, the client pinned to it, and the parity proofs between legacy and delta;
- generation fingerprints for skipping unchanged rebuilds (they never fired in the field);
- the prepared-statement `local_origin` replica;
- tuple-swap appliers;
- retained-grouping recovery;
- the 20-day and 60-day cursor floors;
- the schools fingerprint;
- entitlements, since Masi has no gated feature;
- the 4,024-cell RLS equivalence matrix;
- 3k and 10k crowd runs before Masi has a delta design.

## Corrections made during this review

- One research pass reported that Masi's `assessment_items` SELECT policy uses a bare `auth.uid()`.
  That is stale. `20260521120147_masi_rls_advisor_cleanup.sql:518` already uses
  `(select auth.uid())`.
- Zazi's own cost of getting this right was 14 spec revisions and about 12 review rounds for the
  delta-pull spec. The `check-solution` deletion test removed about 10 machinery items. Expect
  similar pressure on the Masi equivalents and use the same test.
- The Codex adversarial review of this memo and the plan edits (2026-10-08, verdict
  needs-attention) corrected Z5, Z6 and Z10 in place above. It also added three gaps that the plans
  now carry:
  - Upload requests share the unbounded queue.
  - Account revocation was deferred too far (Z16 moved before the pilot).
  - The first durable history page can take longer than a short app open: 6.0 s for 200 parents
    with 10 attendees each at 500 ms per RPC, probed in memory.

## Part 2: the three-month foundations review (2026-07-08 to 2026-10-08)

Jim asked for a wider window because the upload contract and the field-bug pipeline are
foundational. Four more read-only research passes covered:

- the upload protocol's mechanics;
- its history and cost;
- the incident and `/bug-sync` pipeline;
- the remaining July–September foundations.

**Verified** marks claims the orchestrator re-checked against Masi source.

### Uploads

Zazi's "sync protocol v2" did not come from field incidents. It came from the 2026-07-12 code audit
(`documentation/code-audit-2026-07-12.md`, findings A4, B1, B3) of a v1 upload path that was
almost exactly Masi's path today.

- **Production flip:** 2026-07-31.
- **Field bugs:** most August–September bugs were side effects of v2 or the cutover, not v1 failures.
- **Cost:**
  - 4,676 lines across 25 `syncProtocolV2*.js` files, plus about 12,000 lines of related server
    migrations.
  - A causal-architecture spec frozen at "needs revision" after 7 adversarial rounds.
  - Wave 2A was cut in half.
- **Coverage gap:** Zazi's per-install generations and record heads only stop one install's delayed
  write from overtaking that install's newer one. Cross-writer edits (Head Office vs EA, deliverer vs
  deliverer) remain last-write-wins in Zazi (`documentation/plans/2026-07-23-wave2a-gate7b3a-classes-family.md`
  ~L840; the letter-mastery RPC does not compare the prior `server_updated_at`). Masi's real
  conflict risk is the cross-writer case, so copying generations would add machinery without closing it.

| # | Finding | Masi state | Disposition |
|---|---|---|---|
| U1 | Zazi's 20 s hard request boundary with `AbortController` | **Verified:** no upload deadline; shared queue (Z6) | **Before pilot**: a queue-level contract. A timeout is an *uncertain* outcome, retried, and never counted toward the deterministic-error cap. |
| U2 | Bundle RPCs make a root plus its members all-or-nothing | Assessment and items upload as separate rows; a partial assessment reads as a real low score | **Step 3**: one insert-or-ignore assessment-plus-items RPC. ADR-0007 immutability means no heads or generations. Sessions are **not** bundled: CAP-004 already treats a parent without attendees as legitimate. |
| U3 | Stale writes | Plain upsert, last *arrival* wins | **Before pilot, for multi-writer mutable tables**: a base-version check. The client sends the `updated_at` it last saw from the server, and the server rejects a mismatch as `stale_base`. Never compare phone clocks. Letter mastery needs Jim's decision (D1 below). |
| U4 | `mutation_id` plus server receipt makes retried *edits* exactly-once | Deterministic ids make inserts idempotent; edits rely on upsert | **Later**: needed only if U3 proves insufficient. Support visibility comes from the incident lane (B1). |
| U5 | Submit duplicates: 302 extra session copies from 14 lessons (ZZ-BUG-20260819-021) | **Verified:** `LiteracySessionForm.js:502` mints `uuidv4()` per submit, guarded only by React state (`:389`) | **Before pilot**: a ref-based lock and one id minted per form, not per tap. |
| U6 | Restored or copied database replays accepted work (ZZ-BUG-20260907-001; the Android Auto Backup trap) | **Verified:** no `allowBackup` setting in `app.json`/`app.config.js` | **Before pilot**: the existing §0 Android backup decision, now with field evidence. |
| U7 | Environment circuit breaker, closed acknowledgement inventory, activation matrix, cutover, downgrade guard | Not needed for a clean-slate fleet | **Skip**. Revisit the breaker with real outage data. Per-record ordering is *not* skipped: see Codex round 2 below. |

Masi already has the parts of Zazi's floor it needs. Retries are bounded: errors that will always
fail stop after 8 attempts (`offlineSync.js:440, 1083`), and only transport errors retry without a
limit, which is correct. Masi also has:

- contextual classification;
- dependency ordering with parent-evidence deferral;
- local compare-and-set finalization;
- owner-scoped claims;
- insert-or-ignore for immutable assignments.

### Field incidents and `/bug-sync`

The phone sends small incident envelopes, and a `/bug-sync` skill sweeps them into a git-tracked
bug registry. The pipeline:

- **Phone:** a local `sync_support_incident_queue` (8 KB per row, at most 200 rows) feeds a reporter
  with backoff and an actor fence.
- **Server:** `report_mobile_sync_support_incident` (SECURITY DEFINER, `auth.uid()` authority, exact
  key allowlist, payload hash idempotency, 100 per actor per day) writes a table that only
  `service_role` can read.
- **Sweep:** `.agents/skills/bug-sync/SKILL.md` and `scripts/read-sync-incidents.cjs` feed
  `docs/bugs/records/`.

Results:

- 1,242 receipts by 2026-09-22.
- 86 registry records by 2026-09-24, 55 of them released.
- 22 records cite receipts; 67 cite human field reports.
- The hardest bugs needed a Share Database plus Share Logs export. Receipts said who and where;
  exports said what.

| # | Finding | Disposition |
|---|---|---|
| B1 | A minimal Masi lane: a `mobile_sync_incidents` table with key `(actor_user_id, incident_key)`, readable only by `service_role`; a reporting RPC; a capped local queue kept separate from the outbox that fails soft | **Before pilot** (Step 4) |
| B2 | Key on the causal condition. A newer report of the same condition updates the row in place. | **Before pilot**: this avoids Zazi's key-payload-mismatch and per-cycle flood bugs (011, 012) by construction |
| B3 | Report only terminal, support-needed, or long-failing outbox rows and reconcile-breaker events, never ordinary retries. 62% of Zazi's active EAs raised a receipt in 10 days, mostly from upstream bugs. | **Before pilot** |
| B4 | A trimmed `/bug-sync` skill (sweep, dedupe against the registry, check whether each record exists on the server before diagnosing) and an `MA-BUG` registry (S1–S4 severity plus diagnosis, delivery and verification states) | **Before pilot** |
| B5 | "Receipts are leads, not proof." Bind attribution to the actor id in the receipt, never to a forwarded file. | Rule in the skill |
| B6 | Make the support export carry outbox rows with `error_class`/`error_code`. Keep `deviceName` out of every incident payload (`runtimeDiagnostics.js` collects it today). | **Before pilot** |
| B7 | Health panel, retention job, schema-version ceremony, guarded auto-recovery, `bug-user` intake | **Later** |

### Other foundations

| # | Finding | Masi state | Disposition |
|---|---|---|---|
| F1 | One SQLite file per actor plus a connection epoch (Zazi audit A6: a second user on a shared phone saw and edited the first user's cache) | One shared `masi.db`. **Verified:** a null-owner outbox row is claimable by any signed-in actor (`syncOutboxRepository.js:88`). Device gates A4 and H3 cover the behaviour but not the design. | **Decision for Jim (D2)** before the first install. Either way, a null owner fails closed. |
| F2 | Newer-schema guard: an older bundle must not write a newer database | `runMigrationsNow` has no `userVersion > CURRENT_SCHEMA_VERSION` branch (agent-reported, `src/db/migrations.js:637-650`) | **Before pilot**: about 10 lines and a blocking screen |
| F3 | OTA publish wrapper binding channel to profile, with manifest readback | Raw `eas update`; no wrapper | **Before pilot**: the wrapper and readback only |
| F4 | Server-authoritative assignment end (revocation and ending the assignment graph in one server transition) | Client writes `unassigned_at` directly | **Roadmap** (§2 cross-school reassignment). Build one server RPC if the pilot includes handover. |
| F5 | User Health: exclusive operational states that sum to the eligible population | Not built; Step 9 wants it | **Roadmap**. Now: make sure server rows carry actor, build, and last-sync evidence so it can be derived later. |
| F6 | Startup repair, generation fingerprints, and recovery tools for already-damaged field data | Not needed | **Skip** |

### Decisions for Jim

- **Jim decided both on 2026-10-08:**
  - D1: the most recently *made* correction wins, using a server guard on the correction time
    with future times clamped to now.
  - D2: one database per EA. Another EA's file is deleted only when nothing is unsent and it has
    been unused for 30 days.
- **D1. Letter mastery under concurrent correction.** "Latest server write wins" (2026-09-23)
  currently means latest *arrival*: a phone offline for a week overrides a fresh correction from
  another deliverer. Options:
  - keep latest-arrival, explicitly and logged;
  - reject a stale correction (U3) and show it to the EA.
- **D2. Local database ownership.** Options:
  - one SQLite file per signed-in actor, so a second EA on a phone sees nothing of the first by
    construction;
  - keep the shared file with owner columns enforced everywhere, which every query must remember.

  The orchestrator recommends one file per actor. After launch, the change means migrating live
  databases. Field facts (Jim, 2026-10-08): EAs bring their own phones, and short-term sharing
  for a day or two is the common case, so A→B→A alternation and a borrower's data left on a
  personal phone are the real scenarios.

Both decisions are hard to reverse once phones hold work. Run them through `grill-with-docs`, which
creates the ADRs (AGENTS.md).

### Codex round 2 (2026-10-08): the minimal contract was underspecified

The second adversarial round (needs-attention, 5 high and 1 medium) found two **live defects** in
current code, confirmed by the orchestrator:

- An EA's edit to a Head Office-created child is owned by the office account and never uploads
  (`childrenRepository.js:404-426`; `outboxOwnership.js` resolves `children` from `created_by`).
- A queued upload can execute under the next EA's session (`offlineSync.js:1009-1016`).

It also showed that U1 and U3 as written would create new failures:

- Releasing a timed-out whole-row upsert lets it commit after a newer acknowledged write. This
  single-writer reordering case is exactly what Zazi's per-record generations prevent, so this
  memo's U7 "skip generations" was too quick.
- A `stale_base` check has no base to compare against, because pushes return no server version.

**Revised disposition:** U1–U3 become requirements for a dedicated upload-contract design spec,
which must define uncertain-outcome recovery, same-record ordering, and the version lifecycle
together. D2 becomes an actor-lifecycle contract: per-actor storage plus execution-time actor and
epoch fencing. The assessment bundle must be the exclusive insertion boundary. The history
short-open remedy is to separate parent commit size from attendee page size.
