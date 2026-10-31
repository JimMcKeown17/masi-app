# Masi Bug Registry

## Purpose and authority

This is Masi's single bug registry and contract. One bug record holds one causal
problem; many field reports, phone receipts, and Sentry events can be occurrences
of it. Channel skills own only intake. They share this contract, template,
scoring, privacy rules, and ID allocation.

```text
/bug-user
Record and triage these EA reports, screenshots, and Share logs.
```

```text
/bug-sync
Sweep phone incident receipts and report what is unrecorded.
```

## Registry

| ID | Title | Severity | Priority | Diagnosis | Delivery | Verification | Known users | Cause confidence | Updated | Record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Rows are added newest first. -->
| MA-BUG-20261031-002 | First sign-in says "No active programme · Contact your supervisor" until the first download lands | S2 (4) | P2 | CONFIRMED | NO_FIX_PROPOSED | NOT_TESTED | 3 (test) | 75% | 2026-10-31 | [record](records/MA-BUG-20261031-002-first-sign-in-shows-no-active-programme.md) |
| MA-BUG-20261030-008 | Device-gate and smoke-test receipts (deliberate, not a bug) | S4 (0) | P3 | CONFIRMED | NO_PRODUCT_CHANGE | NOT_TESTED | 0 | 95% | 2026-10-30 | [record](records/MA-BUG-20261030-008-device-gate-and-smoke-test-receipts.md) |
| MA-BUG-20261030-007 | The Android photo picker asks for Done when attaching one screenshot | S3 (1) | P3 | HYPOTHESIS | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 40% | 2026-10-30 | [record](records/MA-BUG-20261030-007-android-photo-picker-shows-done-step.md) |
| MA-BUG-20261030-006 | Send diagnostics text sits almost on the footer divider | S3 (1) | P3 | HYPOTHESIS | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 50% | 2026-10-30 | [record](records/MA-BUG-20261030-006-send-diagnostics-text-crowds-footer.md) |
| MA-BUG-20261030-005 | Diagnostics report a stale release label, no commit and no Android version code | S3 (2) | P2 | CONFIRMED | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 85% | 2026-10-30 | [record](records/MA-BUG-20261030-005-diagnostic-release-identity-stale.md) |
| MA-BUG-20261030-004 | Upload failures keep the server's message but drop its detail | S3 (2) | P2 | PROBABLE | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 80% | 2026-10-30 | [record](records/MA-BUG-20261030-004-upload-errors-drop-server-detail.md) |
| MA-BUG-20261030-003 | "Remove screenshot" is styled unlike "Replace screenshot" | S3 (1) | P3 | CONFIRMED | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 90% | 2026-10-30 | [record](records/MA-BUG-20261030-003-screenshot-actions-styled-differently.md) |
| MA-BUG-20261030-002 | Report a problem hides "Remove screenshot" while the keyboard is open | S3 (1) | P3 | HYPOTHESIS | NO_FIX_PROPOSED | NOT_TESTED | 1 (test) | 30% | 2026-10-30 | [record](records/MA-BUG-20261030-002-remove-screenshot-hidden-with-keyboard-open.md) |
| MA-BUG-20261030-001 | On Android, layouts stay shrunk after the keyboard closes | S2 (4) | P2 | CONFIRMED | FIXED_IN_CODE | E2E_REPRO_CLOSED | 1 (test) | 95% | 2026-10-30 | [record](records/MA-BUG-20261030-001-android-keyboard-leaves-layout-shrunk.md) |

## Intake channels

| Channel | Skill | Recorded-when frontmatter field |
| --- | --- | --- |
| Field reports (including Profile `ea_report` receipts) | `/bug-user` | `field_report_ids` |
| Phone incident receipts | `/bug-sync` | `support_incident_keys`, `support_incident_signatures` |
| Sentry evidence | Whichever skill the starting artifact belongs to | `sentry_issue_ids`, `sentry_event_ids` |

**Recorded** means a record declares the item in that frontmatter field. A
narrative mention does not claim it. Recorded does not mean diagnosed or fixed.
Sentry-led human reports start with `/bug-user`; receipt-led investigations stay
with `/bug-sync` when they add Sentry evidence.

Phones send immutable receipts; the reader groups them into conditions. A
`support_incident_keys` entry names a **condition**, actor-qualified:
`<reporter_id>/<kind>/<repeat_key>`. It covers every receipt of that condition,
past and future. Prefer exact keys. A signature, `<kind>/<a>/<b>`, claims every future matching
receipt. Declare one only when the condition belongs to exactly one causal
record. Two records declaring one signature is an error the reader refuses;
it must make no coverage claim.

For example, a hypothetical `pull_failing/session_history/query` signature could
belong to one isolated query defect only after ruling out competing causes.
Otherwise declare the exact reporter-qualified keys. This is an illustration,
not a learned mapping or an ownership declaration.

For `upload_terminal`, `a`/`b` are `errorClass`/`errorCode`; for pulls,
`scopeFamily`/`failureKind`; for breakers, `scopeFamily`/`-`; for app errors,
`errorName`/the first eight characters of `messageDigest`. Exact keys match
before signatures. `ea_report`, `diagnostics_sent` and the three Plan 3 kinds
have no signature. For `ea_report`, declare the exact condition key in
`field_report_ids`; its `er:` handle is only a display shortcut.

An incident is the phone's durable observation of a condition. A condition is
identified by reporter, kind, and condition key. A receipt is one immutable
server row reporting it; daily kinds can re-report a persisting condition about
once a day. Plan 3 episode kinds use once cadence while retained locally.
A receipt is a lead rather than proof of data loss, current impact, or recovery.

Recorded is not reviewed. A full sweep uses one unfiltered SQL statement snapshot,
passing the previous **Last full sweep** boundary minus ten minutes as
`--review-since` (first sweep omits it). All unrecorded conditions remain listed;
recorded conditions with new receipts are listed for review too. Subtract the
overlap once in the caller. Duplicates in that window are harmless; arbitrarily
long commit delays can escape it. It is a bounded convention, not an unlimited
late-commit guarantee.

## Affected-user linkage

`affected_user_ids` contains exact EA Auth UUIDs only. Append an ID only when a
report or verified evidence identifies that account, or a causally assigned
receipt identifies its `reporter_id`. Never infer one from a name, school,
email guess, or affected-user count. Keep the list append-only; document proven
attribution corrections in the timeline. It records historical impact, not
current blockage, release uptake, or recovery.

## Coverage

| Channel | Last full sweep | Seen | Unrecorded | Notes |
| --- | --- | --- | --- | --- |
| Field reports | never | 3 Profile reports | 0 | Profile `ea_report` receipts were read in the phone sweep below (3, all gate tests, claimed by 008). Reports outside the app (messages, calls) have no sweep yet. Records 001–007 come from Claude's A03s device-gate observations on 2026-10-30. MA-BUG-20261031-002 records issue #80/#94 plus two sightings from the 2026-10-31 EGMA device gate (targeted intake, not a sweep). |
| Phone incident receipts | 2026-10-30T23:08:55.076884+00:00 | 10 receipts, 10 conditions | 0 | First full sweep: one unfiltered snapshot, `coverage.complete: true`, exit 0. Reader from `fix/incident-reader-and-first-sweep` (read-only transaction fix, ahead of main `f002e08`); registry read at `origin/main` `f002e08` (empty), then rechecked at this branch's HEAD. All ten were deliberate tests, claimed by exact key in 008. Next sweep passes `--review-since 2026-10-30T22:58:55Z`. |
| Sentry | never | unknown | unknown | Not searched: no read-only Sentry connector in this session. |

Update after intake or a sweep. State scope, time window, counts, and limits.
Store the exact reader `snapshotAt` as Last full sweep only after a successful
canonical unfiltered sweep completes, with reader/registry commits and limits.
Filtered, targeted, failed or contested runs belong in Notes; they do not advance
Last full sweep or claim full-channel coverage. Unknown is not zero. A sweep
that writes records is unfinished until they reach `origin/main` with authorization.

## Record and frontmatter contract

Create records from [_template.md](_template.md). Preserve every field and body
section; use `unknown` for missing facts. Keep the index consistent with the
record. Machine-read lists MUST be YAML block lists, never inline `[a, b]`,
except the empty `[]`. This includes repositories, affected users, releases,
devices, OS versions, channel IDs, evidence paths, GitHub issues, and duplicate
links. Populate a nonempty list like this:

```yaml
repositories:
  - masi-app
```

## Operating model and ID allocation

An occurrence is one observation, labeled `R1`, `R2`, and so on within its causal
record. IDs are `MA-BUG-YYYYMMDD-NNN`; filenames are
`<ID>-<short-kebab-title>.md` under `docs/bugs/records/`.

1. Run `git fetch origin` and read `docs/bugs/` from `origin/main`, not a stale
   feature checkout. If fetch fails, report the blocker before allocating.
2. Scan that day's records and any known unintegrated local allocations. Choose
   the next unused sequence starting at `001`.
3. Rescan immediately before creating each record; never overwrite a record.
4. Recheck ID uniqueness when integrating. Fetch-and-rescan is not an atomic
   lock; concurrent branches can still allocate the same ID.

Work on a branch from `origin/main`, preserve unrelated work, commit registry
changes, and ask before merging or pushing. If permissions prevent a commit,
report the blocker and leave reviewable changes; do not work around it.
Edit skills in `.agents/skills/`; `.claude/skills/` holds symlinks.

## Intake principles

- Capture first. Do not require a complete diagnosis before saving a report.
- Preserve the reporter's words separately from interpretation.
- Record exact local time and timezone when known; also normalize to UTC.
- Record the app release/build, environment, device, OS, user or staff UUID,
  school, network state, and attempted workflow when available.
- Link exact Sentry events as well as grouped Sentry issues.
- Use `unknown` for unavailable facts. Never fill gaps with plausible guesses.
- Classify repeated, predictable "user error" as a possible UX or training
  defect rather than dismissing it automatically.

## Classification

Use one primary classification:

- `product_defect`
- `support_or_education`
- `account_or_provisioning`
- `data_or_configuration`
- `network_or_environment`
- `device_or_os`
- `observability_noise`
- `duplicate`
- `not_a_bug`
- `unknown`

## Diagnosis / Delivery / Verification

Do not use one ambiguous `fixed` status. Track three states independently.

### Diagnosis

- `UNTRIAGED`
- `INVESTIGATING`
- `NEEDS_EVIDENCE`
- `HYPOTHESIS`
- `PROBABLE`
- `CONFIRMED`

### Delivery

- `NO_FIX_PROPOSED`
- `FIX_PROPOSED`
- `FIX_APPROVED`
- `IN_PROGRESS`
- `FIXED_IN_CODE`
- `RELEASED`
- `NO_PRODUCT_CHANGE`

### Verification

- `NOT_TESTED`
- `LOCAL_TESTED`
- `E2E_REPRO_CLOSED`
- `DEVICE_VERIFIED`
- `FIELD_VERIFIED`
- `NO_RECURRENCE_OBSERVED`

A record closes only when its diagnosis, delivery, and verification states tell
an honest and complete story. Record the exact release, causal recovery evidence, exposure, and observation
window. Local tests, release delivery, field recovery, and no recurrence are
separate claims; advance each only with its own evidence.

## Severity scoring

Score severity from 0 to 10 using four components. Record the component scores
in the bug file so the total is auditable.

### User impact: 0-4

- `0` — no demonstrated user impact
- `1` — cosmetic issue or minor inconvenience
- `2` — workflow degraded, confusing, or materially slower
- `3` — core task blocked for the affected user
- `4` — app unusable, crash loop, or multiple core tasks blocked

### Data, security, or privacy risk: 0-3

- `0` — no evidence of data, security, or privacy risk
- `1` — delayed sync or uncertain state, with durable data likely preserved
- `2` — plausible loss, corruption, duplication, misattribution, or exposure
- `3` — confirmed loss, destructive corruption, cross-account access, credential
  exposure, or other security/privacy incident

### Scope: 0-2

- `0` — one user or scope unknown
- `1` — multiple users but less than 10% of the relevant exposed population
- `2` — at least 10%, rapidly growing, or plausibly fleet-wide

Use the relevant exposed population, such as Sentry-observed users on the
affected release, rather than automatically dividing by every EA.

### Recoverability: 0-1

- `0` — safe workaround exists or the operation self-recovers
- `1` — no safe workaround, manual repair may be required, or recovery is
  unknown for a core workflow

### Severity bands

- `S0 Critical` — score 9-10
- `S1 Major` — score 7-8
- `S2 Moderate` — score 4-6
- `S3 Minor` — score 1-3
- `S4 Informational` — score 0

Apply an `S0 Critical` override regardless of arithmetic for confirmed
cross-account access, credential exposure, destructive corruption, material
security/privacy incidents, or a credible fleet-wide data-loss mechanism.

Severity describes impact. Priority describes response urgency; they may differ.

## Priority

- `P0` — investigate immediately; consider pausing the affected workflow or
  release while preserving evidence
- `P1` — same-day investigation
- `P2` — schedule promptly and monitor
- `P3` — backlog, education, or low-impact improvement

Any alleged data loss, cross-account visibility, credential exposure, crash
loop, widespread login failure, or rapidly growing core-workflow failure gets
an immediate `P0` review. `P0` means the cost of being wrong is high; it does
not mean the allegation is already confirmed.

## Root-cause confidence

Record a percentage and a one-sentence evidence basis. The percentage is
confidence in the causal mechanism, not confidence that the symptom exists.

| Confidence | Evidence standard |
| ---: | --- |
| 0% | No causal hypothesis |
| 10-20% | Symptom, screenshot, or issue title only |
| 30-40% | Plausible code path; timing and mechanism fit |
| 50-60% | Reproduced or supported by multiple independent occurrences, but alternatives remain |
| 70-80% | Mechanism isolated and major alternatives ruled out |
| 90-95% | Controlled reproduction plus a targeted intervention removes the failure without breaking surrounding contracts |
| 99% | Exact released correction closes the E2E reproduction and field evidence supports the causal account |
| 100% | Reserve for effectively definitive proof; rarely appropriate in production debugging |

Do not raise cause confidence merely because a unit test is green. A test that
does not reproduce the field mechanism is not causal proof.

## Safety, privacy and evidence rules

Intake and diagnosis permit bug documentation and read-only investigation.
Implementing fixes, changing Sentry state, database/Auth writes, repairs,
builds, releases, deploys, merges, and pushes need explicit authorization.

- Preserve evidence before suggesting uninstalling, clearing storage, or
  recreating missing work.
- Check UI visibility, local rows, outbox state, backend rows and relationships,
  and convergence separately before claiming data loss or recovery.
- J4 authorizes raw ids, payloads, error text/stacks, logs, EA identity and full
  device detail in field-month diagnostic capture. Do not redact the diagnostic
  bundle itself. This capture contract is separate from safe Git publication.
- Never commit credentials, tokens, passwords, learner PII, or an unredacted
  Share database export, including its support JSON.
- Inspect artifacts first. Safe derivatives go to
  `docs/bugs/evidence/<BUG-ID>/` with sanitized filenames and a recorded SHA-256.
  Never move or delete originals. Private originals live in
  `docs/bugs/user-submissions*/`, which is gitignored; never force-add them.
- `/tmp` and clipboard paths are not durable evidence links. Preserve a safe
  derivative or a stable controlled-storage reference.
- Use connected read-only Sentry tools when present; record `unavailable`
  otherwise. Retrieve the exact event before citing it. A valid-query miss is
  negative evidence within that query's scope, not proof no event was emitted.
  Never reuse any upload-scoped token, including `SENTRY_AUTH_TOKEN`.

## Relationship to implementation tracking

The bug record is the causal and evidence ledger. Executable work is a GitHub
issue on `JimMcKeown17/masi-app`, managed via `gh` and linked from the record's
`github_issues` list. `documentation/build-log.md` records what shipped and what
verification passed. Intake alone does not authorize implementation.

## Masi evidence sources

- **Profile → Share logs:** inspect the actual log, time window, release, and
  workflow; preserve safe excerpts only.
- **Profile → Share database:** support JSON export with failed/terminal
  `sync_outbox` rows and `error_class`/`error_code`, every incident queue row,
  actual `wirePayload` and `serverRecordId`. Verify the export's actor before
  joining raw `recordId`/wire identities; assessments use `p_assessment.id`,
  `letter_mastery` has no server record id, and serialization failure retains
  `wirePayloadError`. A bounded bundle or support summary cannot prove every
  local row exists.
- **Diagnostic bundles:** `node scripts/read-support-incidents.cjs --fetch <handle>`
  downloads the latest bundle-bearing receipt and that receipt's optional
  screenshot, printing its report id. Inspect the actual export/log tail/image.
  Originals stay unchanged under gitignored
  `docs/bugs/user-submissions-bundles/<handle>/`; only safe excerpts with hashes
  go to `docs/bugs/evidence/<BUG-ID>/`. Fetch can be unavailable or failed.
- **Receipt reader:** `npm run bugs:incidents` uses
  `scripts/read-support-incidents.cjs`; direct node with `--json` avoids npm
  banners. Its default registry is committed `origin/main`. One unfiltered psql
  statement joins both identity sources and enumerates all receipts, with an
  exact snapshot boundary and no paging. `--actor`, `--kind`, `--since` are
  display filters, not full sweeps. `--review-since` alone preserves coverage.
  Contested ownership (exit 2) refuses coverage; exit 1 is a failed/unsupported
  operation. Inspect fetch/resolve statuses even after exit 0. Use `--resolve`
  before diagnosing record-bearing leads; existence is not convergence.
- **Backend:** use the `sqlite-staging-sql` skill at
  `.claude/skills/sqlite-staging-sql/SKILL.md` for read-only SQL against
  `masi-app-sqlite` (`segygjzpujphwvrubusm`). Verify the target and live schema;
  never query the legacy backend `jcqrlwetutnpuchjoyyd` for this workflow.
