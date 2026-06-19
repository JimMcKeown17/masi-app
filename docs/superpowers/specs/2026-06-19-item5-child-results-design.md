# Item 5 — Child Results Workflow (per-child foundation): Design

**Date:** 2026-06-19
**Status:** Design — awaiting spec review, then `writing-plans`.
**Branch:** `feature/child-results` (off `main` @ `8c48b8d`).
**Source:** `documentation/top-10-improvements-2026-06.md` §5; handoff `/tmp/masi-item5-handoff.md`.
**Build order:** 3 → 4 → 8 → **5** → 7 → 6 (then the new group-centric item, see §Deferred).

---

## 1. Context & the scope cut

§5 ("Child Results workflow: row-tap opens results, edit behind a pencil") was originally a single item
covering: extract a mastery panel, embed it in a renamed results screen, flip the `ClassDetail` row tap,
restructure navigation, and fold last-session letters into the session form.

During brainstorming, Jim raised a **strategic direction**: move to a **group-centric** UX (group cards with
"what was done last time / work on next," group-first session capture) — the field-tested Zazi fork pattern.
Grounding against `CONTEXT.md` confirmed this is **not a new direction** but a **documented, settled** one:

- *"All current programmes are group-based — even 1-on-1 child work is recorded against a group of size 1."* (`CONTEXT.md:37`)
- The child-picking session UI is explicitly *"a gap we want to close."* (`CONTEXT.md:100-101`)
- *"One session = one group-block of work"*, always scoped to one `group_id` (`CONTEXT.md:60`); `sessions.group_id`
  already exists (`migrations.js:561`, in go-live scope `CONTEXT.md:162`).
- The group **data layer is built and seeded** (`groups`, `child_group_memberships`, `group_ea_assignments`,
  `grouping_versions`; `groupsRepository`, `GroupPickerBottomSheet`, `groupColors`). Group **editing/
  reconciliation/auto-grouping** is deferred to next year (`CONTEXT.md:114,161`) — but group-centric
  **capture & navigation** is the wanted-now gap.

**Decision (Jim, 2026-06-19): split.** This item ships the **group-agnostic per-child foundation** that is
correct under *any* navigation model. The group-centric capture & navigation becomes its **own next item**
(see §Deferred), with its own brainstorm, a `grill-with-docs` pass, and an ADR.

The group-centric direction **supersedes** two original §5 sub-items rather than dropping them: the
`ClassDetail` row-tap flip and the session fold-in both solved "too many clicks to reach a child's work" —
group cards solve that same problem better, so building them per-child first would be build-then-rework.

---

## 2. In scope (A–E) / out of scope

**In scope — the per-child results foundation:**

| # | Workstream | Risk |
|---|-----------|------|
| **A** | Commit the parked `AssessmentResultsScreen` "count-as-primary" WIP (+ its test) | Low |
| **B** | Route `AssessmentResultsScreen.handleTryAgain` through `resolveAssessmentRoute` | Med |
| **C** | Extract **`LetterMasteryPanel`** from `LetterTrackerScreen` (one source of truth) | **High** |
| **D** | Rename `ChildAssessmentSummaryScreen` → **`ChildResultsScreen`** + embed the panel | Med |
| **E** | Nest `ChildrenList` + `ClassDetail` + `ChildResults` in a Children-tab stack (tab-bar fix) | **High** |

**Out of scope (deferred to the group-centric item):** `ClassDetail` row-tap flip + pencil (§5 F), session
fold-in / last-session letters (§5 G), unifying `LetterTrackerBottomSheet` into the panel (different write
semantics — see §3.C), reading-level cross-session persistence.

---

## 3. Design

### A — Commit the results-hero WIP (Low)
The working tree carries a complete, test-backed change to `src/screens/assessments/AssessmentResultsScreen.js`:
the hero number flips from `{accuracy}%` → `{correct_responses}` (raw count, e.g. `21`) with `68% correct`
demoted to a supporting line, plus `accessibilityLabel="Assessment main result"`. The untracked
`__tests__/AssessmentResultsScreen.test.js` pins exactly that (1 passing test). **Action:** re-run the test on
Node 20, confirm green, commit the change + test as the first Item 5 commit. Rationale (Jim): legitimate,
finished work parked because the screen was on the leave-untouched-until-Item-5 list.

### B — "Try Again" routing (Med, carried from Item 4)
`handleTryAgain` currently hardcodes `navigation.replace('LetterAssessment', …)` (verified on-disk) — it does
**not** honor the capture-mode toggle, so a Step-by-Step EA still gets the grid on retry. **Action:** make
`handleTryAgain` `async` and route through `resolveAssessmentRoute()` (`src/utils/assessmentRouting.js`), which
returns `{ screenName, captureMode }` from `storage.getCaptureMode()`. This is the **third** entry point; the
two clean ones (`ChildAssessmentSummaryScreen`, `AssessmentChildSelectScreen`) already route through it (Item 4
T12 precedent — mirror it, including a `launchingRef`-style guard if the screen re-renders). **TDD:** SEQUENTIAL
mode → replaces with `SequentialAssessment` (carrying `child`, `letterSet`, `attemptNumber+1`, `assessmentType`,
`captureMode`); grid/NULL mode → `LetterAssessment`.

### C — Extract `LetterMasteryPanel` (High — the keystone)
`LetterMasteryPanel({ child, classItem })` becomes the **one source of truth** for the mastery grid, extracted
from `LetterTrackerScreen`. It owns:
- **Data load on focus:** assessment mastery (`assessmentsRepository.getAssessments({ userId, childId })` →
  filter `letter_egra` + language → `computeAssessmentMastery(latest, letterSet, pedagogicalOrder)`); taught
  letters (`masteryRepository.getLetterMastery({ userId, childId })` → active, non-`_deleted`, language-matched
  → `{ letter: recordId }` map).
- **Meta row** (language badge, mastered count, last-assessed date), **legend**, **5-column grid**, `getCellState`.
- **Immediate-write cell-tap** — preserving the load-bearing details: soft-delete on un-taught (re-fetch the
  active record first to survive id drift, then `updateLetterMasteryRecord(active.id, { _deleted:true, … })`);
  create-new via `saveLetterMasteryRecord(record)` which **returns the canonical id** (use the returned id, not
  the passed uuid); reactivate an existing soft-deleted record (`{ _deleted:false, deleted_at:null, … }`) to
  avoid duplicate-key sync errors. Trigger `refreshSyncStatus()` + `triggerBackgroundSync?.()` after each write.
- **`onLayout` width measurement** (fork pattern) so the grid renders correctly inside a padded `Card`.

`LetterTrackerScreen` becomes a **thin wrapper**: screen chrome (header) around `<LetterMasteryPanel>`. Its
callers are unchanged in Item 5 — `ClassDetailScreen`'s letter `IconButton` (F deferred, so the rows are
untouched) and `LetterMasteryRankingScreen` (Assessments-tab rankings, passes `{ child, classItem }`). §5's
"thin wrapper for the Assessments-tab flow" *end state* (only the rankings caller) arrives when the
group-centric item redesigns `ClassDetail` into group cards and drops the per-row letter icon.

**Deliberately NOT unified:** `LetterTrackerBottomSheet` looks like the same grid but has **opposite write
semantics** — it collects `pendingChanges` and lets `LiteracySessionForm` batch-persist on submit, vs. the
panel's immediate per-tap write. Folding it in would force a dual-mode write abstraction and risk the
session-capture flow for a DRY win that isn't worth it mid-field-test. §5's "one source of truth for the
mastery grid" is correctly read as unifying the two **full-screen** views (`LetterTracker` ↔ `ChildResults`),
not the session-local sheet — which is also what the fork chose. The bottom sheet stays untouched.

### D — `ChildResults` rename + embed (Med)
Rename `ChildAssessmentSummaryScreen` → `ChildResultsScreen` (file, component, registered route
`ChildAssessmentSummary` → `ChildResults`). It already takes `{ child, classItem }` and already routes "Run
Assessment" through `resolveAssessmentRoute` — keep that. Replace the tappable **stub** "Letter Tracker" nav
card (currently `navigation.navigate('LetterTracker', …)`) with an **embedded** `<LetterMasteryPanel
child={child} classItem={classItem} />` inside a titled `Card` (fork layout). Update the one caller —
`ClassDetailScreen`'s chart `IconButton` (`onPress → navigate('ChildResults', …)`).

**Backwards-compat note:** route-name renames are **safe** across deployed app versions — navigation route
names are internal to each app bundle, not persisted data or a server contract, so an older field build using
its own `ChildAssessmentSummary` is unaffected. This is *not* a schema/sync change.

### E — Children-tab stack (High — not unit-testable, device-verify)
Add a `ChildrenStackNavigator` nesting `ChildrenList` + `ClassDetail` + `ChildResults` under the **Children
tab**, moving those three off the root `MainNavigator`. Everything else — `EditChild`, `AddChild`,
`LetterTracker`, `LetterAssessment`, etc. — **stays on root**. This keeps the bottom tab bar **visible** on
`ClassDetail` (the auto-routed single-class EA's landing screen per the count-aware route `CONTEXT.md:148`) and
on `ChildResults` (the per-child results destination), fixing the documented tab-bar-hiding bug.

Caller verification (each moved screen's only caller moves with it): `navigate('ClassDetail', …)` comes only
from `ChildrenListScreen` (now same stack ✓); `navigate('ChildResults', …)` comes only from `ClassDetailScreen`
(now same stack ✓). Outbound calls from nested screens to root screens (`ChildResults` "Run Assessment" →
`LetterAssessment`) resolve by bubbling up the navigator tree ✓.

**Forward-compatible with the group item:** a future `GroupDetail` slots into this same Children stack; nesting
these three now is a strict prefix of the group-centric nav, not throwaway work.

**Device-verify gate (before close):** tapping My Children keeps the tab bar; `ClassDetail` and `ChildResults`
show the tab bar; back-from-`ClassDetail` doesn't bounce; count-aware auto-route still lands single-class EAs
directly in `ClassDetail` with the tab bar visible.

---

## 4. Testing & regression strategy

Characterization-first for screen work (the Item-8 render tests are the safety net); TDD for logic.

- **A:** `__tests__/AssessmentResultsScreen.test.js` (existing WIP test) — re-run green, commit.
- **B:** new routing test — SEQUENTIAL → `SequentialAssessment`, grid/NULL → `LetterAssessment`.
- **C:** the write-path tests in `__tests__/LetterTrackerScreen.plan5.test.js` **migrate to a new
  `LetterMasteryPanel` test** (cell tap, soft-delete-reuse, id-canonicalization, error handling); the thin
  `LetterTrackerScreen` keeps/gets a render test. `LetterTrackerBottomSheet.plan5.test.js` **untouched**.
- **D:** new `ChildResultsScreen` render test (embeds the panel; assessment cards present; "Run Assessment"
  routes via resolver). `ClassDetailScreen.test.js` nav assertion updates `ChildAssessmentSummary` → `ChildResults`.
- **E:** not unit-testable → device-verify gate above. Re-run `ClassDetailScreen.test.js` + `HomeScreen.test.js`
  for no regression.
- **Full gate (Node 20):** `npm test && npm run test:integration` green before close (baseline:
  115 unit suites / 629 tests + 23 integration / 145).

---

## 5. Task slices, sequencing & review plan

Subagent-driven (handoff model): **Codex builds TDD via `codex:codex-rescue` (background); the controller
re-runs every focused suite on Node 20, scope-checks every diff, and commits** (Codex's sandbox blocks `.git`).
Right-size review by risk; every finding is a claim to verify. Commit footer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

| Task | Depends on | Review level |
|---|---|---|
| **T1** — commit WIP (A) | — | controller-only (verify test green) |
| **T2** — Try Again routing (B) | T1 (same file) | route-resolver change → plan note + Codex adversarial build pass |
| **T3** — extract `LetterMasteryPanel` (C) | — | **HIGH:** two-LLM plan review + Codex adversarial build |
| **T4** — `ChildResults` rename + embed (D) | T3 | Med: Codex adversarial or careful controller review |
| **T5** — Children-tab stack (E) | T4 | **HIGH:** two-LLM plan review + device-verify gate |

**Order:** T1 → T2 → T3 → T4 → T5. T2 is file-disjoint from T3–T5 and *could* parallelize with T3, but default
to serial for clean per-file commits (concurrent Codex agents share one working tree). The two HIGH-risk tasks
(T3 extraction, T5 nav) and the route-resolver change (T2) get a Claude `plan-reviewer` + Codex adversarial
cross-review at plan time, per the handoff.

---

## 6. Risks & open items

- **C's write path is the load-bearing risk** — the id-reuse-on-reactivation + canonical-id-on-save logic
  prevents duplicate-key sync errors; the migrated tests must prove it survives extraction.
- **E is not unit-testable** — depends on the device-verify gate; the caller analysis bounds the risk but
  cross-navigator behavior is only confirmed on device.
- **Leave-untouched (never stage):** `skills-lock.json`, `.claude/skills/*`, `.agents/skills/*`, the two
  untracked PRDs. Exception: the `AssessmentResultsScreen` pair (T1 owns it).

---

## 7. Deferred — the next item: **group-centric capture & navigation**

The group-centric workflow Jim wants becomes its own item, designed next (brainstorm → `grill-with-docs` →
ADR → plan). It is the documented "gap to close" (`CONTEXT.md:100-101`) and ports the fork's field-tested
group stack (`GroupsScreen`, `GroupDetailScreen`, `GroupCard`, group-scoped `NewSessionScreen`,
`SessionHistoryBottomSheet`) **minus** the deferred editing/auto-grouping (`CONTEXT.md:114,161`) — except where
"replacement" pulls some editing forward (below). It absorbs §5 F (group cards replace the flat-child-list
row-flip) and §5 G (group-based last/next summaries replace the child-based fold-in).

**Confirmed requirements (Jim, 2026-06-19) — EAs need whole-class access, deliberately:**
1. **Control-group assessment:** EAs assess the **entire class** (impact-evaluation control groups), even though
   they only *deliver* to their assigned ~12. → **Assessment scope ⊋ delivery scope.** The assess-all-class path
   is a first-class requirement, not an edge case.
2. **Replacement:** when a child in the EA's roster churns out, the EA picks a replacement **from the broader
   class** — requiring whole-class visibility and *some* group-edit capability sooner than the "next-year"
   editor.

**Direct tension with a settled decision — must be reconciled here (not in Item 5):** `CONTEXT.md:149` says
*"ClassDetail shows the EA's assigned, active-programme children — not the whole physical class… whole-class
visibility would be a deliberate cross-EA data expansion, not a UI tweak. Do not 'fix' `getChildrenInClass` to
surface the whole class."* Jim's requirement **deliberately wants** that expansion. The group item must:
- Introduce a **scoped whole-class read path** (RLS policy + sync visibility) distinct from the delivery roster
  — i.e., make the "deliberate cross-EA data expansion" real and bounded, with the contract-map + RLS-probe
  treatment (`documentation/rls-sync-contract-map.md`, `npm run rls:probe`).
- Distinguish **assessment scope (whole class)** from **delivery scope (assigned groups)** in the UI and the
  data layer (`getMyChildren` vs a new whole-class accessor).
- Decide whether **replacement** (roster churn) needs a minimal go-live group-edit path vs. staying within the
  deferred editor — reconciling against `CONTEXT.md:114` ("go-live groups are seeded and static").
- Update `CONTEXT.md:149` + relevant ADR(s) via `grill-with-docs` once the boundary is settled.
- Resolve the per-programme variation (Core Literacy pairs ×3 classes vs Numeracy/ECD whole-class-in-groups vs
  Literacy ECD 12-kids-1-class) — all group-based, differing only in group size / class count.

---
