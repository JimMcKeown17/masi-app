# What Zazi iZandi Taught Us Before Masi Goes Live

**Point-in-time field retrospective. Evidence window: 2026-07-27 through 2026-08-27.**

This is the practical companion to the broader
[`Masi/Zazi Field-App Portfolio Audit`](./masi-zazi-portfolio-audit-2026-08-27.md). That audit asks
what architecture the two apps should share. This memo asks a narrower question:

> What must Masi learn from Zazi's last month of field failures before EAs trust Masi with real work?

The answer is not “copy Zazi.” Zazi and Masi have different Programme, grouping, assessment,
assignment, reporting, and authorization models. The answer is to port the failure models,
invariants, verification attacks, and operating discipline that real field use made visible.

This review used Zazi mobile `origin/main` at `e50df3a3` and Masi `main` at `b377d96`. It was
read-only with respect to app code, databases, accounts, releases, and devices. Current
implementation status remains in [`ROADMAP.md`](./ROADMAP.md); this dated memo must not become a
second status ledger.

## Executive conclusion

Zazi's most important lesson is that an offline-first app is not safe because it can save locally
and eventually make an HTTP request. It is safe only when every important piece of work has a
provable causal journey:

```text
EA action
  -> durable local domain data plus durable upload intent
  -> exact server acceptance, rejection, conflict, or still-uncertain outcome
  -> exact local finalization
  -> safe pull and hydration
  -> support-visible recovery if any transition cannot complete
```

The field found failures at every arrow. Some work existed only on one phone while the UI looked
normal. Some server-accepted work was parked because the phone did not receive the reply. Some
retries created duplicate sessions. Some safety states had no component capable of releasing them.
Some correctly empty or RLS-filtered pulls were allowed to participate in destructive local
decisions. Some releases were published but could not be tied to the phone that produced a receipt.
And one major defect was not sync at all: teaching activity and child mastery had been collapsed
into one misleading concept.

Masi should therefore treat the following as pre-live outcomes, not optional hardening:

1. A fresh or replacement phone can recover authorized session and assessment history without
   widening RLS or deleting local intent.
2. A lost response cannot turn an accepted write into a duplicate, and cannot turn an unaccepted
   write into silent abandonment.
3. GPS timeout, disabled services, and denied permission have a deliberate time-capture outcome;
   they do not silently prevent an EA from clocking in or out.
4. Every terminal, blocked, quarantined, or incomplete state survives restart and reaches a named
   support reader with a safe action.
5. A support artifact identifies the actor, backend, native build, app/runtime/OTA, protocol, and
   affected record family without exposing child data.
6. Release acceptance proves the exact source, real SQLite, real PostgreSQL where relevant, hosted
   state, installed artifact, backend convergence, and field observation separately.
7. First-run readiness never renders partly hydrated or unknown state as an empty account, and late
   work from a prior actor cannot publish into the current actor's database.
8. Test credentials, staff PII, child data, and private operational evidence never enter Git,
   release logs, screenshots, or generalized telemetry.
9. Android backup, time-entry auto-closure, and unfinished-draft loss each have an explicit product
   and recovery policy; reinstall is not treated as a reliable clean reset.

The biggest strategic mistake would be to import Zazi's entire protocol-v2 and learner-lifecycle
state machinery before Masi has the same problem. The right move is smaller: attack Masi's existing
design with Zazi's real failure scenarios, then strengthen only the families that fail.

## What the month actually revealed

At the snapshot, Zazi's canonical registry held **31 causal bug records**: 7 P0, 20 P1, and 4 P2.
Twenty-four were confirmed. Fifteen were released, but only **one** was `FIELD_VERIFIED`; 14 were
`LOCAL_TESTED`, 3 had closed an end-to-end reproduction, and 13 were still `NOT_TESTED`. Those
numbers are not an indictment of the team. They are a warning about evidence vocabulary: release,
installation, recovery, and field verification are genuinely different events. [Z1]

The chronology shows how one layer of proof exposed the next:

| Period | What Zazi learned |
|---|---|
| July 28 | A locally invalid membership ID, false HTTP-200 acknowledgment, and destructive empty pull formed one silent-loss chain. The first stop-ship rule became: test the public producer through real SQLite and real PostgreSQL, then pull again. [Z2] |
| July 29–30 | Fixing forward acceptance did not fix process-death liveness. Lease recovery then exposed that the read path itself erased the causal provenance required to close an already accepted mutation. [Z3] |
| July 31–August 3 | Physical testing found setup, navigation, low-end bootstrap, and device-rendering failures that isolated component tests and polished full-data screens did not reveal. [Z13] [Z18] |
| August 4–11 | Build-versus-submit confusion, cloud-environment gaps, credential hygiene, and device-owned automatic closure showed that operational delivery and scheduler authority are part of product behavior. [Z14] [Z16] [Z20] |
| August 7 onward | A server-side cutover removed rows while offline phones retained descendants. “Parent first” was no longer enough: the system needed positive ancestor presence, mixed-version policy, and a recovery owner. [Z4] |
| August 13–20 | A canonical bug/receipt discipline made previously handled-but-invisible failures measurable. It also showed that receipt counts, Sentry groupings, affected users, eligible population, and current blockers are different quantities. [Z1] [Z11] |
| August 17–21 | Field-wide adversarial sweeps found unknown-outcome retry budgets, detector coverage holes, circuit one-way doors, and one logical lesson becoming dozens of sessions. [Z5] [Z7] |
| August 24–26 | Similar grouping symptoms were separated into rejected, accepted-without-completion, and pre-upload-conflict causes; teaching activity was separated from mastery; several released fixes still lacked installed/field proof. [Z9] [Z10] |
| August 25–27 | Release provenance, guarded OTA publishing, Android backup, provisioning, and documentation recovery made the final lesson explicit: repository, hosted, artifact, installed, recovered, and field states each need their own authority. [Z8] [Z15] [Z17] [Z19] |

The 31 records are easier to understand as six trust-boundary clusters:

| Cluster | What failed in Zazi | Representative evidence | What Masi must learn |
|---|---|---|---|
| Acceptance and causal identity | The client sometimes treated transport completion as application acceptance; a later pull could destroy the last local copy. Lost replies later produced both parked work and duplicate sessions. | July 28 stop-ship; Bugs 013 and 021 [Z2] [Z5] [Z7] | Stable logical identity, typed acceptance, exact replay, and exact finalization are one contract. |
| Parent, authority, and lifecycle | A missing or server-deleted ancestor made descendants fail forever; accepted, rejected, and not-yet-uploaded learner-removal intents each found different absorbing states. | Bugs 009, 025, 026, 028, and 029 [Z4] [Z9] | Ordering is not enough. Authority, parent presence, command state, and recovery require positive causal evidence. |
| Pull, reconcile, and provenance | A correct empty pull became destructive because local `synced` was forged; later pulls deleted control-plane provenance needed to finish accepted work. | July 28–30 canaries [Z2] [Z3] | Absence is destructive evidence only after positive completeness. Pull must preserve control-plane evidence and local intent. |
| Capture policy and permissions | Missing GPS or denied location could prevent clocking, while other row-level failures stranded time and assessment work. | Bugs 001, 002, 015, and 016 [Z6] | Sensor failure is a product-policy branch, not an exceptional afterthought. Capture and flag when policy permits. |
| Observability and recovery | Handled failures were invisible; dedup keys either merged distinct records or minted a new incident every cycle; many support states had no recovery path or release identity. | Bugs 003, 010–012, 014, 018, and 024 [Z1] [Z8] | Telemetry is not a recovery system. Every support state needs stable identity, a reader, provenance, and an exit. |
| Domain and reporting meaning | Assignment projections drifted from authority; current school was derived from the wrong source; teaching activity was shown as mastery evidence. | Bugs 008, 022, and 030 [Z10] | Preserve independent domain axes and derive each report from its authoritative graph, not a convenient cached column. |

## The eighteen lessons Masi should carry forward

### 1. “Synced” is not a fact; it is the conclusion of a proof

The July 28 incident had three linked defects: mismatched identity, transport success interpreted as
application acceptance, and a pull that trusted the resulting local `synced` flag. The server's
empty answer was correct—the server had rejected the records. The dangerous act was allowing
server absence plus a mutable client status to authorize irreversible deletion. [Z2]

Mental model: local sync state is a cached conclusion, not authority. A destructive or finalizing
operation needs the evidence that justifies that conclusion: exact mutation identity, accepted
receipt or typed outcome, expected generation/claim, and complete scope.

For Masi:

- Preserve the existing one-transaction domain-write plus outbox pattern.
- Keep exact compare-and-set finalization; never finalize a newer row from a stale response.
- Test the complete journey through the real producer, serializer, server behavior, response
  interpreter, finalizer, subsequent pull, and restart. A unit test of each piece did not catch
  Zazi's chain.
- Treat any code path that writes `synced` or deletes an outbox row as an acknowledgment boundary,
  not housekeeping.
- Keep reads pure. Zazi's July recovery path briefly repaired missing setup state while reading it;
  that turned a load into a write, hid absence, and could double-save. A read should report the
  observed state. A separately named command should repair it with its own authority, transaction,
  and receipt.
- Test every field through a cross-layer round trip: local writer → positive allowlist serializer →
  server function/table → response → local reader. Zazi leaked local-only state when a blacklist
  serializer failed to know about a new field. A positive allowlist makes the server contract
  explicit and rejects drift closer to its producer.

### 2. An uncertain network result is not a rejection

Zazi initially gave network uncertainty the same small retry budget as deterministic refusal.
Field phones sent work, failed to hear the reply three times, and permanently parked the mutation.
Backend checks then showed the two possible realities: some rows had been accepted by the server,
while others existed only on the phone. The same visible state represented opposite server truths.
[Z5]

Mental model: after dispatch there are three states, not two—accepted, rejected, and unknown.
Unknown is safe only if the same logical operation can be retried idempotently or reconciled through
an exact receipt.

For Masi, fault-inject every important family at these boundaries:

1. before request dispatch;
2. after dispatch but before the server commits;
3. after the server commits but before the response reaches the phone;
4. after the response but before local finalization;
5. after local finalization but before the UI refreshes.

The expected result is never “probably succeeded.” It is the same stable operation converging once,
or a support-visible state that still owns the durable local work.

### 3. Ordering parents first is necessary, but not sufficient

Zazi correctly ordered parents before dependants and held new descendants behind unsynced local
parents. That still did not repair legacy rows marked synced whose parent never existed on the
server, nor rows whose server parent had later been wiped. Descendants then failed authorization
forever while the app continued to accept work locally. [Z4]

For Masi, parent/dependant verification must cover:

- a parent pending locally;
- a parent accepted but response lost;
- a parent believed synced but absent server-side;
- an RLS-filtered parent that exists but is not visible to the current actor;
- a parent removed by an authorized Head Office action;
- an assignment revoked between parent acceptance and child upload;
- a fresh installation pulling dependants before every parent page is durable.

Never infer server non-existence from an RLS-filtered pull. Never “repair” a parent by changing an
insert into an update unless positive server identity and current authority prove that transition.

### 4. Every safety state needs a reader, an action, and an exit

Zazi repeatedly did the safe first half—refusing an inconsistent payload, fencing a learner during
removal, quarantining suspicious work, or opening a circuit—but omitted the second half. The result
was a one-way door: locally durable work that no automatic path, EA action, or support tool could
advance. Bugs 025, 026, and 028 looked like the same grouping failure but were three different
absorbing states: server-rejected, server-accepted without causal-pull completion, and pre-upload
payload conflict. A full device export was needed to reclassify the alleged Bug 026 occurrence as
Bug 028. [Z9]

Mental model: “fail closed” is a transition, not an acceptable final architecture. Before adding a
status or circuit, name:

- who can see it;
- what exact evidence it preserves;
- whether the safe next step is automatic retry, prerequisite wait, supersession, or operator
  action;
- the compare-and-set predicate for that step;
- the condition that ends the state;
- what the UI tells the EA in plain language.

If none of those components owns a state, delete the state or redesign the flow.

### 5. Pull absence is not deletion evidence without positive completeness

An empty or short pull can mean deletion, RLS filtering, wrong actor, wrong Programme, pagination
truncation, deadline expiry, a partially loaded scope, or a server error. Zazi's July stop-ship made
this concrete. Masi's existing reconcile rails—pending-local-wins, no reconcile on error/truncation,
and the mass-removal breaker—are worth preserving. They should be extended, not replaced. [M2]

History hydration must therefore launch with its completeness contract, not acquire pagination
later:

- bounded keyset pages with immutable `id` tie-breakers;
- structural request deadlines;
- positive parent and child completion;
- no absence-based deletion for retained history;
- parents durable before children;
- one failed or expired page makes the scope incomplete;
- React state republished from a fresh SQLite read only after durable application.

### 6. Pull must preserve local control-plane evidence

The July 30 recovery work initially repaired stale `in_flight` liveness, but the faithful
process-death scenario included a pull between restart and replay. That pull deleted and reinserted
domain rows and cleared the local provenance needed for exact finalization. The first integration
test had skipped the load-bearing step; a later test even pinned the damaged state as expected.
Review forced the root correction across every pull-merged table. [Z3]

For Masi, every new pull family needs a red test showing that server-applied domain fields can
refresh without erasing:

- pending/failed/terminal local intent;
- owner identity;
- mutation/claim or equivalent finalization evidence;
- lifecycle/archive intent;
- local-only support metadata;
- draft or device-only state that is deliberately outside the server row.

This is why “replace the table from the server” is dangerous even when the resulting domain rows
look correct.

### 7. Aggregate retries need one stable logical identity

Zazi session submission could partially fail after saving locally. Retrying the user flow rebuilt
the lesson with new identities, creating many server sessions for one real lesson. Six intended
lessons became 169 hosted session rows; one logical lesson became 83. The screen's in-flight lock
protected one request, not the business command, and the later error invited another attempt with a
new UUID. A uniqueness constraint after the fact is not a sufficient idempotency strategy for a
parent/child aggregate. [Z7]

Masi should test sessions and assessments as families, not only rows:

- the EA presses submit twice;
- the app dies during submit;
- the parent is accepted but one or more children are not;
- the reply is lost after full server acceptance;
- the same logical draft is resumed after restart;
- a second device or Head Office writer changes the aggregate;
- a stale response arrives after a newer local edit.

Where partial server acceptance would be invalid or user-misleading, use one server-atomic family
operation or prove rigorously that stable-ID row upserts are sufficient. Do not generalize this into
a portfolio-wide protocol before the family test demonstrates the need.

The safer model is a durable stopped-session submission command: mint the session and attendee IDs
when the draft begins; preserve fixed end time, active duration, attendees, and command identity;
and retry the same command after exceptions, backgrounding, or process death. If the session is
already saved and only later work failed, the UI must say that the session was saved and finishing
work remains. A generic “Submit failed” message is a duplication affordance.

### 8. Sensor failure is a normal field condition, not an exceptional path

Zazi found both server rejection of clock entries without GPS and a more basic UX failure: an EA
who denied location permission could not clock in, and the system had no occurrence because nothing
durable was created. The absence of incident records therefore understated the problem. [Z6]

Masi currently has a direct contract/runtime mismatch. The PRD says clock-in/out uses approximate
geolocation “when available” and must fall back in about ten seconds, while `locationService` and
`TimeTrackingContext` return without creating or closing a time entry when services, permission, or
location acquisition fails. [M3]

Before launch, settle and implement one explicit policy:

- recommended: capture the truthful time entry with nullable coordinates plus a privacy-safe
  `location_unavailable_reason`, flag it for review, and keep the EA working;
- if Masi intentionally requires location as a hard payroll/attendance gate, say so in the PRD,
  make the block front-loaded and support-visible, and prove the offline escalation path.

Do not leave the current contradiction for EAs to discover indoors or after tapping “Don't allow.”

### 9. Observability must be durable, causal, and privacy-safe

Zazi only understood many failures after shipping automatic sync-support receipts. It then learned
that incident design has its own identity problems: one dedup key collapsed many affected records,
another minted a fresh finding every pull cycle, and receipts initially could not identify the
native build or running OTA. Raw receipt counts also did not equal affected EAs or eligible field
population. [Z1] [Z8]

Masi already has privacy-hardened Sentry, runtime diagnostics, local logs, and a SQLite support
export. Those are useful, but process-local deduplication does not survive restart and Sentry is not
a durable recovery ledger. [M4]

The minimum pre-live incident lane should carry:

- stable causal incident identity and affected local record/family identity;
- first seen, last seen, and occurrence count;
- actor scope, without staff names in the technical key;
- backend/project, app version, runtime, native build, OTA/update identity, protocol, platform;
- normalized disposition and bounded privacy-safe reason;
- whether the server has the exact record when that check is safe;
- the named support reader and permitted next action;
- retention and redaction rules.

Do not upload full SQLite databases, learner names, assessment content, notes, coordinates, tokens,
or arbitrary console arguments. Preserve raw evidence outside Git and commit only sanitized facts.

### 10. Release is a ladder of evidence, not a boolean

Zazi's release discipline became strict because OTA publication could alter protocol behavior on a
large mixed-version fleet. Its guarded release path verified profile/environment authorization and
read both Android and iOS manifests back after publication. Even that proved only publication—not
that an affected phone installed the release, recovered its row, or stopped recurring. [Z8]

Use this evidence ladder for every Masi field fix:

1. source/diff and focused behavior tests;
2. ordinary unit tests;
3. real SQLite behavior;
4. real/disposable PostgreSQL for RLS, RPC, migration, and transaction semantics;
5. hosted migration/deployment and target identity;
6. exact Android and iOS artifact/update identity;
7. physical install, launch, login, offline/reopen, and core workflow;
8. populated-data convergence;
9. affected or causally equivalent field recovery;
10. explicit no-recurrence observation window.

Use exact verbs in reports: recorded, diagnosed, fixed in code, merged, deployed, published,
installed, recovered, and field verified.

The candidate must also be tested as a fleet, not only as the newest build. Zazi's cutovers showed
that a server reset or contract change is distributed across every offline replica and every older
binary still capable of writing. Inventory installed versions, their backend/channel bindings, and
their write shapes; keep additive compatibility where any older writer remains; and prove no-wipe
upgrade plus rollback containment. A store approval or active track does not prove tester
enrollment, installation, or OTA activation.

### 11. Operational health is one population state plus independent overlays

Zazi's support workflow became more useful when it stopped treating “no activity,” “has a bug,”
“has a sync receipt,” and “blocked” as synonyms. Every expected EA belongs to exactly one activity
state, while bug, sync, setup, and support conditions are independent overlays. Counts must conserve
the expected population. A quiet user needs a status check; they are not automatically blocked.
[Z11]

Before Masi expands beyond the initial cohort, define:

- the canonical expected-EA roster and activation cutoff;
- mutually exclusive base states such as productive, opened/no synced work, previously active but
  silent, and never activated;
- independent overlays for setup, sync, device, data quality, and human-confirmed support status;
- daily reconciliation that fails loudly when the population does not conserve;
- a staff-safe report with plain-language next actions, not raw IDs or database errors.

### 12. Similar words can hide different domain axes

Zazi's in-session tracker selected a newer word assessment before restricting candidates to letter
assessments, hiding valid letter mastery. The UI also asked EAs to mark letters “taught” while the
rest of the product consumed the tap as mastery evidence. Historical taps could not safely be bulk
reinterpreted because the EA's old intent was unknowable. [Z10]

Masi has even more axes that must remain independent:

- session teaching activity versus assessment evidence versus mastery;
- current reading level versus a session's historical reading-level snapshot;
- delivery assignment versus class-wide assessment scope;
- Programme identity versus current job title;
- current class/group membership versus historical attendance;
- current roster versus the authority ledger;
- local upload completion versus history hydration completion.

When evidence ties exactly or historical meaning is ambiguous, fail closed. Do not invent an ID
tie-breaker or rewrite old rows to make the dashboard look complete.

Assessment administration rules belong in this same model. A stop rule changes which items are
observed, so it changes the data-generating process even if the wire format does not change. Raw
correct count, attempted-item accuracy, completion time, mastery, and censored/unattempted items are
different statistics. Masi must re-check every downstream score, comparison, praise string,
grouping decision, and report when capture rules change. [Z12]

### 13. First-run setup is a durable state machine, not a tour

Zazi's first-run failures looked unrelated: a nearly invisible active step, a checklist that retired
too early, a class flow that returned to Home instead of continuing to child creation, guidance on a
screen the common one-class journey skipped, and a low-end Android showing a false empty-account
state for about ten seconds. They shared one cause: multiple screens inferred progress from
partially overlapping data while independent contexts hydrated at different times. [Z13]

Mental model: unknown is a domain state. It must never be presented as empty truth. Setup completion
is a predicate over durable state, not an event emitted by one button. Navigation guidance must live
where the EA actually lands, and a late asynchronous result is authorized by both actor identity and
database generation—not merely by the fact that its promise eventually resolved.

For Masi:

- derive one setup stage from SQLite and make every setup surface consume it;
- give one bootstrap owner responsibility for critical data, publish caches, then write the durable
  readiness marker last;
- use a bounded watchdog with Retry and Sign out instead of an indefinite spinner or “continue
  anyway” into partial state;
- test one-class and multi-class routes, offline first launch, 10–15 second hydration, process kill,
  background reclaim, actor switch during bootstrap, restart after each milestone, and partial
  reference data;
- never ask a user who sees a false empty state to recreate children or classes before preserving and
  inspecting the local database.

### 14. “Automatic” behavior must name its authority and liveness assumption

Zazi's ten-hour auto-clock-out ran in the mobile provider. It could close SQLite while the app was
alive and catch up after reopen, but it could not close a hosted row while the app was killed,
offline, or never reopened. The overdue hosted row was therefore a consequence of the chosen
authority, not an inexplicable timer defect. [Z14]

Masi currently has the same device-owned shape: the ten-hour close runs from
`TimeTrackingContext`, either on a 30-second in-process interval or when an active entry is loaded.
That may be the right trade-off, but the staff report and operating runbook must be honest about it.
[M7]

Before launch, choose explicitly among device authority, server authority with fencing against later
offline writes, or a hybrid that records an administrative inferred close separately from the
device-reported close. Test app killed before the limit, offline past it, reopened after it, never
reopened, South African midnight, and phone-clock skew. A report may flag an overdue open row; it
must not mutate or fabricate a clock-out merely to make the dashboard look tidy.

### 15. Reinstall and reset are distributed data operations

Zazi discovered that Android Auto Backup could include actor-scoped SQLite because the native
configuration did not explicitly disable or exclude it. An uninstall/reinstall intended as a clean
reset could restore the stale, parked, or server-orphaned database. The prevention decision was not
yet approved, so this is an unresolved native risk—not a shipped Zazi fix. [Z15]

Masi's minimal checked-in `app.json` also makes no explicit Android backup decision. Before the
field build, either disable backup for the app or use native extraction rules that exclude domain
SQLite and outbox state while retaining only deliberately safe preferences. Then test Google-backup
restore, device migration, actor switch, uninstall/reinstall, and upgrade without clearing data.
[M8]

The support rule is stricter: export logs/database and preserve release/update evidence before
sign-out, clear storage, uninstall, or reinstall. Reset is a recovery command with a required
postcondition, not a generic troubleshooting reflex.

### 16. Credentials, operational PII, and reference-data readiness are launch architecture

Zazi's durable build-log history contained a plaintext shared test credential alongside identifiable
tester information. This memo intentionally does not reproduce it. Once a password enters Git
history, later editing is not remediation; the credential must be treated as compromised. Zazi's
later provisioning runbook adopted the correct boundary: unique temporary passwords, an owner-only
`0600` artifact persisted before the irreversible Auth mutation, sanitized Git evidence, and an
apply-once partial-failure protocol. [Z16]

Before launch Masi should scan the full Git history—not only the current tree—plus issues, fixtures,
screenshots, build logs, and release notes for credentials, private URLs, tokens, staff PII, and
child data. Every exposed credential must be disabled or rotated. EAS public, sensitive, and secret
visibility are not interchangeable; verify secrets remain absent from cloud-build output.

This is not hypothetical for Masi: its own append-only build log records that an older tester loader
printed a committed shared password before the loader was disabled and replaced. This retrospective
did not retrieve or reproduce that value, and the log does not establish that every historical
credential was subsequently rotated. [M10]

Provisioning also has three distinct gates: reference-data readiness, identity creation, and
programme setup. Schools and other required picker values must exist before an EA's first login. An
Auth row is not acceptance proof: perform a real password sign-in and the same authenticated RLS
reads the app needs. Existing email or fuzzy name matches hard-stop an apply; they do not prove
identity authority. [Z17]

### 17. Field UX is measured on the modal device, not inferred from styles

Zazi testers interpreted continuous hero motion as a loading spinner; a setup step that looked
adequate in design was barely visible on-device; Android edge-to-edge required a 25-surface inset
audit; and polished populated screens concealed weak empty, partial, offline, glare, and low-end
states. Several grading ladders also disagreed, so polishing a result component before settling its
meaning would have created another inconsistency. [Z18]

For Masi's final two weeks, freeze global navigation and chrome unless a field-critical defect
requires change. Test the exact candidate on a representative low-end Android and iPhone at narrow
width, with long names, keyboard open, gesture and three-button navigation, high glare, grayscale or
color-deficiency simulation, slow/partial data, and all recovery states. Use text, glyph, or shape in
addition to red/green. An animation needs an intentional rest state if “still working” is not the
meaning.

### 18. Documentation needs one authority per question

Zazi's roadmap became mostly past-tense narration duplicated from the build log and agent roadmap;
all three drifted. Plans also retained wrong metrics, stale line numbers, unnecessary migrations,
unsafe release assumptions, and incomplete algorithms after review corrections. The lesson is not
to stop documenting. It is to assign one document responsibility and make review falsify
assumptions rather than accumulate machinery. [Z19]

Masi's current contract is the right pattern: PRD for behavior, CONTEXT for domain meaning, ROADMAP
for outstanding work, build log for append-only evidence, bug records for independent diagnosis /
delivery / verification axes, and audits/plans as dated evidence. Reconcile plans against current
symbols and invariants before implementing them. A review finding should name the false assumption,
violated invariant, evidence, and smallest correction. Stop the bounded audit once the defect is
fixed, behavior-tested, and standing docs agree.

## Masi pre-live gate: minimum safe launch package

These gates are ordered by risk to irreplaceable field work. They map to the existing roadmap rather
than creating a second backlog.

| Priority | Gate | Current Masi evidence | Closure proof |
|---|---|---|---|
| Stop-ship | Correct history authorization before hydration | The live 2026-08-27 audit found session visibility broader than delivery scope and assessment visibility not bounded to the current academic year. [M1] | Authenticated PostgreSQL fixtures cover owner, prior capturer, current/historical delivery assignee, class-only assessor, group-only editor, unrelated EA, revoked authority, and prior year; query plans pass on the corrected predicates. |
| Stop-ship | Hydrate sessions/attendees, then assessments/items | Fresh TestFlight could not recover server history; a green sync label currently means outbound completion only. [M5] | Fresh install, reinstall, second device, force-stop, offline restart, incomplete page, same-timestamp boundary, and two-device handover pass on real SQLite plus hosted RLS. |
| Stop-ship | Make the location policy truthful | PRD requires fallback; runtime blocks clock-in/out on location failure. [M3] | Permanent denial, services off, indoor timeout, stale last-known location, offline mode, and successful GPS all produce the approved time-entry result on Android and iOS. |
| Stop-ship | Prove family retry and exact finalization | Masi has durable outbox, owner scope, dependency ordering, and local compare-and-set, but no field evidence for Zazi's lost-response and duplicate-submit attacks across every core family. [M2] | Sessions and assessments converge once after lost reply, process death, partial child failure, stale finalizer, and repeated submit; no local work or outbox evidence disappears. |
| Stop-ship | Add minimum incident and release provenance | Sentry/export exist; no durable incident identity, server receipt, support reader/action, or restart persistence exists. [M4] | Reproduce one terminal/reconcile condition across force-stop; exactly one privacy-safe incident survives with first/last seen, exact release/backend/actor provenance, and a safe support action. |
| Stop-ship | Prove first-run readiness and actor-generation isolation | Current contexts have cache-first/bootstrap protections, but Zazi's false-empty and late-result failures show that independent green loaders are not enough. [Z13] | Low-end Android and iPhone pass slow, offline, partial, process-kill, background, Retry, and account-switch-during-bootstrap scenarios; no unknown state renders as an empty account and no result from EA A publishes for EA B. |
| Stop-ship | Complete credential/PII and provisioning preflight | Zazi proved that durable logs can become a secret-delivery channel; Masi's own log records an older committed shared-password path, while current evidence does not establish rotation, a full-history scan, or exact live-roster/reference-data readiness. [Z16] [Z17] [M10] | Full-history/current-artifact scan is reviewed without printing secrets; every hit is rotated/removed from use; required schools/programmes exist; each provisioned account passes real password login and authenticated RLS reads. |
| Stop-ship | Fail safe on newer local schema | The roadmap records this as open. An older bundle must not mutate a database created by a newer bundle. | Install/publish a deliberately older compatible test bundle over a newer-schema database; it stops with a diagnosable non-destructive recovery path. |
| Explicit launch decision | Set auto-clock-out authority and Android backup policy | Auto-close is device-owned; `app.json` contains no explicit backup rule. [M7] [M8] | The chosen time-authority conflict contract is behavior-tested while killed/offline; reinstall/restore cannot silently resurrect domain SQLite or outbox state; staff reports label overdue open rows honestly. |
| Explicit accepted risk or stop-ship | Revisit unfinished form loss | `CONTEXT.md` currently accepts that navigate-away or process death can lose an unfinished session or assessment while durable drafts wait for a later tranche. [M9] | Jim explicitly accepts the field/support consequence after a physical force-kill demonstration, or one SQLite-backed draft/run lifecycle ships and survives restart. Do not imply autosave if it does not exist. |
| Before cohort expansion | Establish the field operating loop | No Masi equivalent of Zazi's conserved User Health plus canonical bug/receipt reconciliation is yet evidenced. | Every expected EA appears in one base state; overlays link to causal records; the daily report names owners/actions; raw receipt counts are never presented as fleet prevalence. |
| Before cohort expansion | Prove low-end and mixed-network behavior | Masi has targeted device gates, but the highest-signal outstanding set includes indoor GPS, low-end roster scrolling, actor isolation, and force-quit removal persistence. [M6] | Exact release passes the named low-end Android and iOS gates across Wi-Fi, cellular, offline, background reclaim, and restart. |

### Two-week launch sequence

This is sequencing, not a second backlog. The named work remains authoritative in `ROADMAP.md`.

| Window | Outcome |
|---|---|
| T-14 to T-11 | Close irreversible decisions: credential rotation/full-history scan; Android backup; location branches; automatic time authority; unfinished-form acceptance; field roster and reference data; exact backend/release estate; history authorization. |
| T-10 to T-7 | Break the app deliberately: history completeness, lost replies, partial aggregate save, stale finalizer, bootstrap/account switch, all GPS branches, kill/offline auto-close, backup restore, newer-schema bundle, and privacy-safe incident persistence. Fix roots, not fixture-only symptoms. |
| T-6 to T-3 | Freeze navigation/global chrome; build and submit the exact iOS and Android candidate; verify hosted environment and source maps; inspect live store tracks/enrollment/country/reviewer access; install without wiping; run open → close → open for OTA activation; execute the full device story below. |
| T-2 to field day | Rehearse operations: generate the conserved User Health report; privately distribute exact credentials; assign owners for `needs_status_check`, setup, permissions, install, sync, and confirmed bugs; rehearse preserve-first export; set cohort stop conditions and no-recurrence windows. |

### Required end-to-end scenarios

The launch candidate should pass these as one coherent acceptance story, not as disconnected unit
checks:

1. Provision required reference data before identities; sign in through the real password flow and
   prove the same authenticated profile/reference reads the app requires.
2. Fresh-install one iPhone and one representative low-end Android phone against the exact forward
   backend and release identity. Exercise Android backup restore separately; a “fresh” test must
   prove it did not inherit a prior domain database.
3. Sign in as EA A through slow bootstrap, hydrate their authorized roster and history, then go
   offline. Repeat with process kill and an actor switch during hydration.
4. Clock in with good GPS, then test timeout, disabled services, and permanent denial according to
   the approved location policy.
5. Leave a session and assessment unfinished, force-kill, and demonstrate the exact accepted loss or
   the durable draft recovery. Then complete a session and assessment offline and force-stop at
   meaningful transaction/upload
   boundaries, reopen, and prove every local family remains durable.
6. Simulate server acceptance with a lost response; retry the same logical operation and prove one
   server aggregate.
7. Simulate a missing/unauthorized parent and prove descendants wait or become support-visible
   without losing local work.
8. Pull a complete server scope, then an errored, timed-out, truncated, and RLS-narrowed scope;
   prove only the complete authorized scope can advance completeness and none can delete history.
9. Sign out and sign in as EA B; prove EA A's outbox, drafts, incidents, and cached domain data do
   not become writable or visible to EA B.
10. Leave a time entry open, kill the app across the ten-hour boundary, remain offline, then reopen;
    prove the chosen device/server authority and conflict outcome without fabricating report data.
11. Install the next release or OTA and verify exact native/runtime/update identity in both Profile
   and the emitted support artifact.
12. Confirm the exact session, attendees, assessment, and items on the hosted backend, then recover
    them onto a second device.

### First two weeks in the field

Start with a deliberately small cohort and expand only after the following operating loop is
routine:

- Review the complete expected-EA population every working day; contact silent users instead of
  inferring health from the absence of reports.
- Capture human reports immediately, preserve the reporter's words, and assign causal bugs only
  after record-level evidence supports deduplication.
- Correlate UI visibility, local domain rows, outbox/support state, exact backend rows, and eventual
  convergence separately.
- Preserve the affected phone before reset, sign-out, clear-storage, uninstall, reinstall, or account
  recreation. Export logs/database support evidence first.
- Stop cohort expansion on any server-missing session/assessment, cross-actor visibility, duplicate
  logical session, destructive incomplete pull, unexplained terminal state, or release/backend
  identity mismatch.
- Report publication, installed uptake, recovered rows, and no-recurrence as separate counts.
- Keep staff reports plain: who needs help, what they should do, who owns the next action, and
  whether their work has reached the server.
- Treat a quiet phone as unknown, not healthy. Treat a generic Sentry issue as a grouping hypothesis,
  not a causal bug, until representative events and exact record evidence agree.
- Never ask an EA to recreate work, sign out, clear storage, or reinstall until local SQLite,
  outbox, incident, log, and release/update evidence has been preserved.

## Simplicity brake: what should exist now

**Cycle objective:** within the two-week pre-live window, an EA must be able to capture time,
sessions, and assessments offline; recover authorized history on a fresh phone; and get safe support
without silent loss, duplication, or cross-user exposure.

| Element | A: user-visible delta | B1: scenario occurs? | B2: user can tell? | C: deletion test | Build | Carrying | Verdict |
|---|---|---|---|---|---|---|---|
| Bounded session/assessment history hydration | Yes — an EA replacing or reinstalling a phone can see authorized prior work offline. | Yes — Masi TestFlight reproduced empty history while the server held it. | Yes — History is visibly empty or populated. | Deleting the capability reintroduces separate continuity gaps across 6 named consumers: session parents, attendees, assessment parents, items, sync completeness, and History UI. | 5 counted gates: history RLS, session family, assessment family, Android device, iOS device. | 6 named consumers. | NOW |
| Minimum durable incident and release-provenance lane | Yes — an EA gets an honest needs-attention state and support can identify the exact release/record and act safely. | Yes — Zazi field incidents and Masi's existing terminal/reconcile states establish the scenario. | Yes — otherwise work looks merely pending or healthy and support cannot distinguish releases. | Without one lane, identity/action logic reappears across 5 named subsystems: local producers, persistence, server receipt, support reader, and runtime diagnostics. | 4 roadmap slices: identity, durable transport, provenance, reader/action/retention. | 5 named subsystems. | NOW |
| Wholesale port of Zazi's learner-lifecycle state machine | None — Masi's current launch objective does not include Zazi's removal/grouping protocol or its historical compatibility states. | No equivalent Masi field evidence exists. | No. | Deleting the proposed port makes its app-specific complexity vanish; Masi's own assignment and group contracts remain. | Not countable because no scoped Masi plan exists. | 0 current Masi consumers require the Zazi state machine. | NEVER |
| Generalized causal protocol imposed on all Masi outbound families before pilot | None — the user benefit comes from family-specific correctness, not from one universal protocol. | No Masi incident shows all 17 outbound families need Zazi protocol v2. | No user can distinguish the framework from narrower correct adapters. | Deleting the universal layer removes configuration/state machinery; the same failure attacks can be applied directly to each family that needs them. | Not countable because no approved implementation plan exists. | Would force 17 current `PUSH_ORDER` family adapters to carry the abstraction. | NEVER |
| Separate temporary form-draft store beside the agreed future SQLite run lifecycle | It could preserve an unfinished form, but would create two competing draft authorities and a migration problem. | Process death is real. | Yes — the EA sees lost or restored form work. | Deleting the temporary mechanism still leaves the agreed single SQLite-backed session/run lifecycle as the correct destination. | Not countable because no approved temporary design exists. | Would overlap session form, assessment flow, future group session, and WelaPLUS run ownership. | NEVER |
| Server auto-clock-out scheduler without a stale-offline-write conflict contract | It could make hosted reports close sooner while a phone is absent. | Overdue hosted rows can occur. | Usually not until the EA or staff sees a conflicting time entry/report. | Deleting the scheduler preserves today's coherent device authority; the real need is the authority decision and honest report semantics. | Not countable until server/device/hybrid authority is chosen. | Would add scheduler, server writer, conflict fencing, mobile reconcile, and reporting semantics. | NEVER |

NEVER: do not port Zazi's learner-lifecycle state machine into Masi without a Masi domain requirement and equivalent field evidence.

NEVER: do not make all 17 Masi outbound families carry a generalized causal protocol before
family-level conformance tests show which aggregates actually need one.

NEVER: do not add a temporary form-draft store beside the agreed SQLite run lifecycle; either accept
the current boundary explicitly or implement the one durable owner.

NEVER: do not add a server auto-clock-out scheduler until stale offline writes, administrative
closure provenance, mobile reconciliation, and report semantics have one accepted authority
contract.

## What not to learn from Zazi

Some Zazi complexity is the cost of its history, mixed installed versions, TeamPact cutover, learner
removal/grouping model, and protocol-v2 activation. Masi should explicitly avoid:

- copying Zazi table names, lifecycle phases, incident kinds, or recovery ledgers without a matching
  Masi responsibility;
- inventing a shared runtime framework before two shipped consumers prove an identical seam;
- using review rounds to ratchet a design into more states after the simpler authority boundary is
  already visible;
- turning temporary compatibility decoders into permanent architecture;
- “fixing” safety by raising retry counts while another circuit still prevents those retries;
- adding telemetry fields with no support reader or decision that consumes them;
- weakening hashes, receipts, or fences merely to make a stuck state disappear;
- rewriting ambiguous historical data so current reporting looks cleaner;
- treating a successful EAS/hosted deployment as evidence that a field phone recovered.

The goal is not fewer safeguards. It is fewer, stronger safeguards placed at the actual trust
boundaries.

## Evidence index

All Zazi citations refer to `origin/main` at `e50df3a3` in
`/Users/jimmckeown/Development/zazi-izandi-app`. Masi citations refer to `main` at `b377d96` in this
repository. Line numbers are for those exact refs.

| Key | Evidence |
|---|---|
| Z1 | `docs/bugs/README.md:27-61` (31-record registry and state axes); `docs/bugs/README.md:129-157` (coverage and raw-receipt limits). |
| Z2 | `documentation/field-testing/july28-child-data-loss-stop-ship-audit.md:17-23, 99-125, 331-365, 403-415` (false acknowledgment plus destructive absence and the missing real-path test). |
| Z3 | `documentation/field-testing/july30-retained-incident-lease-recovery-claude-review.md:20-26, 57-85, 104-110, 218-232, 262-272` (liveness fix, pull-erased provenance, and corrected proof boundary). |
| Z4 | `docs/bugs/records/ZZ-BUG-20260817-009-ancestor-missing-cascade.md:138-167, 183-197, 354-386, 431-456` (server-missing roots, descendant cascade, server wipe sibling, and open field gates). |
| Z5 | `docs/bugs/records/ZZ-BUG-20260817-013-three-uncertain-network-attempts-are-terminal.md:109-160, 196-236, 244-276` (unknown outcomes, accepted/absent split, retry budget, and shared-counter regression). |
| Z6 | `docs/bugs/records/ZZ-BUG-20260818-015-location-permission-denial-blocks-clock-in.md:59-80, 108-175` and `docs/bugs/records/ZZ-BUG-20260813-001-clock-entry-without-gps-rejected.md:18-33, 140-177, 264-305` (permission block, invisible prevented attempts, and no-GPS server contract). |
| Z7 | `docs/bugs/records/ZZ-BUG-20260819-021-session-submit-retry-duplicates.md:75-160, 207-269, 305-334` (duplicate logical sessions after retry and repair boundary). |
| Z8 | `docs/bugs/records/ZZ-BUG-20260821-024-sync-receipt-release-provenance-missing.md:73-191` plus `documentation/build-log.md:15353-15400` (release provenance and OTA-versus-phone proof). |
| Z9 | `docs/bugs/records/ZZ-BUG-20260824-025-rejected-lifecycle-command-permanently-fences-class-grouping.md:76-131, 286-360`; `docs/bugs/records/ZZ-BUG-20260824-026-lifecycle-intent-never-resolves.md:69-138, 256-318`; `docs/bugs/records/ZZ-BUG-20260825-028-pre-upload-lifecycle-payload-mismatch-parks-removal.md:66-132, 177-251` (three similar symptoms, distinct absorbing states). |
| Z10 | `docs/bugs/records/ZZ-BUG-20260826-030-in-session-letter-tracker-selects-word-assessment.md:65-92, 130-172` (teaching versus mastery, duplicated selector, exact-tie fail-closed behavior). |
| Z11 | `documentation/user-health-reconciliation/README.md:20-61, 77-100, 126-146`; `.agents/skills/user-health-blocker-reconciliation/references/tracking-contract.md:16-56, 131-169` (exclusive activity population, independent overlays, staff-safe output, and proof ladder). |
| Z12 | `documentation/plans/2026-07-31-letter-assessment-stop-rule.md:33-68, 78-173, 177-233` (administration rule, corrected metric, censoring consequences, reuse of existing metadata, and deterministic terminal precedence). |
| Z13 | `documentation/field-testing/july28-improvements.md:1-13`; `documentation/plans/2026-07-31-onboarding-field-test-improvements.md:14-83`; `documentation/plans/2026-08-01-first-install-readiness-implementation.md:1-26, 77-85` (on-device setup failures, shared classifier, bootstrap ownership, and ready-last barrier). |
| Z14 | `documentation/build-log.md:12693-12707` (device-owned auto-clock-out and accepted server-liveness consequence). |
| Z15 | `docs/agent-context/safety-guards.md:349-381`; `app.json:24-47` (unapproved Android backup prevention candidate and absent explicit `allowBackup` setting). |
| Z16 | Redacted security finding at `documentation/build-log.md:12205-12210`; `.agents/skills/provision-blank-users/SKILL.md:35-75, 177-241`; `EAS-INTERNAL-TESTING-CHECKLIST.md:37-67` (credential leak boundary, owner-only apply-once provisioning, and EAS secret visibility). Do not quote the historical credential lines. |
| Z17 | `.agents/skills/provision-blank-users/SKILL.md:8-19, 54-75, 143-241`; `documentation/build-log.md:14333-14373` (identity/reference/programme separation, preflight hard-stops, and real sign-in/RLS proof). |
| Z18 | `docs/redesign/tongi-suggestions/2026-08-08-tongi-suggestions-assessment.md:145-193, 214-250`; `documentation/field-testing/july28-improvements.md:1-13` (grading and accessibility inconsistencies, device reality, navigation stability, and setup visibility). |
| Z19 | `AGENTS.md:85-149, 346-355`; `documentation/build-log.md:9416-9444, 15519-15530` (one authority per document, evidence-layer language, roadmap drift, and stale-state recovery). |
| Z20 | `documentation/build-log.md:9246-9272, 12189-12204, 13721-13816, 14640-14685, 15483-15518`; `DEPLOYMENT.md:350-517` (cloud-build fail-closed configuration, build-versus-submit, channel/APK holds, guarded OTA, and installed-uptake proof). |
| M1 | [`pre-live-gate0-audit-2026-08-27.md`](./pre-live-gate0-audit-2026-08-27.md) (live RLS, volume, query plans, and corrected order of work). |
| M2 | [`field-app-capability-ledger.md`](./field-app-capability-ledger.md) CAP-001–CAP-003 and CAP-007 (existing persistence/reconcile strengths and remaining pull gaps). |
| M3 | [`PRD.md`](../PRD.md) lines 208-216; `src/services/locationService.js:19-22, 109-181`; `src/context/TimeTrackingContext.js:119-151, 168-204` (location contract/runtime mismatch). |
| M4 | [`field-app-capability-ledger.md`](./field-app-capability-ledger.md) CAP-006, lines 169-185 (current observability and missing durable incident path). |
| M5 | [`build-log.md`](./build-log.md) line 527 and [`ROADMAP.md`](./ROADMAP.md) lines 134-172 (fresh-install history gap and closure contract). |
| M6 | [`ROADMAP.md`](./ROADMAP.md) lines 119-132 and `documentation/device-gates-sqlite-backend-2026-07.md` (highest-signal remaining device gates). |
| M7 | `src/context/TimeTrackingContext.js:44-63, 65-107` (device-owned ten-hour close on load or in-process interval). |
| M8 | `app.json:1-6` (no explicit Android backup/data-extraction policy in the checked-in minimal native config). |
| M9 | [`CONTEXT.md`](../CONTEXT.md) lines 171-174 and [`ROADMAP.md`](./ROADMAP.md) correctness section (submit-and-go choice and current unfinished session/assessment loss). |
| M10 | [`build-log.md`](./build-log.md) lines 753 and 654 (historical record of the disabled tester loader's committed shared-password behavior and the redacted current pre-live gap; this memo deliberately does not retrieve or reproduce the credential). |

## Final go-live rule

Masi does not need to prove that bugs are impossible. It needs to prove that one ordinary field
failure cannot silently destroy, duplicate, misattribute, or permanently strand the last durable
copy of an EA's work—and that support can identify and recover the exact failure without wiping the
evidence.
