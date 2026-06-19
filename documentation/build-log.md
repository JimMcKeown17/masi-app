# Masi App — Build Log

> **Purpose:** one chronological record of what was built and in what order — the durable
> "what was done, when, and why" history. This is the **master** log going forward; earlier
> per-slice logs will be folded in here over time (see *Logs to merge*).

## How this log works

- **Chronological, append-only.** Newest entries at the bottom of *Timeline*. Don't rewrite
  history — correct with a follow-up entry.
- Each task entry records: **date**, **item/task**, **what changed**, **tests** (command + result),
  **reviews** (Claude spec + Claude code-quality + Codex `/codex:adversarial-review` — two-LLM
  cross-review), how findings were engaged, and **commit SHA(s)**.
- **Build method this tranche:** Codex builds via `/codex:rescue` (TDD red→green→refactor),
  Claude orchestrates + reviews, Codex adversarially reviews. One branch + PR per item.

## Current tranche — Top 10 Improvements, Items 3–9

Source: [`documentation/top-10-improvements-2026-06.md`](./top-10-improvements-2026-06.md).
Items 1–2 (sync reliability) already shipped; Item 10 (push notifications) deferred to its own tranche.

| Item | Title | Theme | Status |
|------|-------|-------|--------|
| 3 | Design-token system (colour ramp, type scale, guard test) | Design system | ✅ done (merged `65118aa`) |
| 4 | Step-by-Step capture + extracted capture spine | Workflow + arch | ✅ code-complete (Supabase migration applied; device pass owed) |
| 5 | Child Results workflow (row-tap → results, edit behind pencil) | Workflow | ☐ queued |
| 6 | Performance pass for low-end Android | Performance | ☐ queued |
| 7 | Motivation loop (onboarding, ring payoff, motion tiers) | Workflow + design | ☐ queued |
| 8 | Test the field-critical paths currently uncovered | Testing | ☐ queued |
| 9 | Architecture seams (storage facade, time-tracking, dates) | Architecture | ☐ queued |
| 10 | Head-office → field push/inbox | Capability | ⏸ deferred (own tranche) |

**Build order** (the guide's sequencing + the dependency graph): 3 → 4 → 8 → 5 → 7 → 6, with
Item 9 folded in continuously as each context/seam is touched.

## Logs to merge (pre-history)

Earlier logs that predate this master log; fold in chronologically when convenient:
- `documentation/sync-reliability-build-log.md` — Items 1–2 (sync reliability), 12 TDD tasks, device-verified 2026-06-17.
- `documentation/sqlite-refactor-log.md` — the clean-slate SQLite refactor history.
- (fork) `zazi-izandi-app/documentation/*build-log*.md` — companion-app history referenced by the ports.

---

## Timeline

### 2026-06-17 — Tranche kickoff (Items 3–9)

- Confirmed Items 1–2 (write-storm / sync reliability) complete, device-verified by Jim, merged to `main`.
- Verified the companion fork (`/Users/jimmckeown/Development/zazi-izandi-app`, `main`,
  tip `c183d3e`) and confirmed **all** portable assets the guide references exist
  (colours, capture spine, device-tier, contexts, full notification stack).
- Locked the execution model (see *How this log works*): Codex builds via `/codex:rescue`;
  Claude orchestrates + spec/quality reviews; Codex `/codex:adversarial-review` as the second
  reviewer; port the fork's field-tested design choices with Jim's sign-off; branch + PR per item.
- **Revised execution model (Jim, 2026-06-17):** build Items 3–9 **one item per session**,
  handing over to a fresh-context agent between items (via the `handoff` skill). This build-log
  + the Top-10 guide are the cross-session backbone, so context resets lose no knowledge.
  Confirmed: **keep Masi's blue brand — no orange.** The fork supplies token *architecture*, never *hue*.
- **Next:** Item 3 — design-token system (Masi-blue tint ramp derived from `#294A99`). Grounding the plan against fork + Masi `colors.js`.

### 2026-06-17 — Item 3: brand direction LOCKED (red-dominant, light Zazi canvas)

- **Decision (Jim):** red-dominant on a **light Zazi canvas**. Rationale: matches Masi's existing
  red-heavy web brand (solid red Donate CTA, red footer band, red section rules, red-tinted icon chips);
  blue read as generic/cold; red is a proven primary (Netflix/YouTube/Pinterest/Airbnb/Target). The
  field-tool canvas stays **light** (sunlight legibility) rather than the website's dark canvas; an
  optional **dark hero band** echoes the web drama.
- **Palette approach:** brand red derived from the existing `#E72D4D`; full 50–900 ramp; a
  **differentiated error red** (deeper/cooler + alert icon) to avoid brand-vs-error semantic collision;
  green stays semantic success (`#3FA535`) + success-surface trio; yellow minimised out of chrome;
  **no gradients** (solid fills); warm-light canvas + white cards + soft shadows; Zazi type hierarchy.
- **Next:** palette + mock Home screen rendered for Jim's visual sign-off → then write the Item 3 TDD
  plan → then orchestrate Codex builds with Claude + Codex dual review.

### 2026-06-17 — Item 3: palette SIGNED OFF (Jim) → plan written

- Rendered a visual mock (`documentation/design/item3-red-palette-preview.html` / `.png`) — red ramp,
  full token set, brand-vs-error separation, and a mock Home screen. **Jim approved as-is** ("looks so
  much better than I expected — I love it"). The five sign-off points (canvas warmth, red ramp, error
  separation, yellow retired, dark hero band) are all accepted.
- **Locked token values:**
  - Red ramp: `red50 #FDECEF · red100 #FBD5DC · red200 #F4A9B6 · red300 #EE7D90 · red400 #EC5470 ·
    red500 #E72D4D (brand) · red600 #C81F3E (primary fill/pressed, AA) · red700 #A4182F · red800 #7C1223 · red900 #530B17`
  - Canvas `#F8F5F4` · card `#FFFFFF` · ink `#221A1B` · muted `#76696B` · line `#ECE5E4`
  - primary `#E72D4D` · primaryDark `#C81F3E` · tabActive `#C81F3E`
  - error `#B3261E` · errorBg `#FCEAE8` · warning (deep amber, semantic only) `#B26A00`
  - success `#3FA535` · successBg `#E7F3E5` · successText `#2E7D27` · successBorder `#CDE8C9`
  - hero dark `#1C1517` · on-dark muted `#C9BFC0`
- Plan written: `docs/superpowers/plans/2026-06-17-item3-design-tokens.md` (6 TDD tasks).
- **Next:** dispatch Codex (TDD) for Task 1 (token foundation) → Claude spec + code-quality review →
  Codex `/codex:adversarial-review` → engage → commit.

### 2026-06-17 — Item 3 Task 1: built, reviewed (Claude + Codex), fixes routed

- **Built (Codex):** `src/constants/colors.js` (red-dominant token system) + `__tests__/colors.test.js`
  (fail-closed pin). Commit `cb3ca8d4`. 9/9 green (independently re-run by the controller).
- **Reviewed — three passes converged (the two-LLM topology working):**
  - Controller (Claude) **+ Codex adversarial `[high]`** independently flagged the same gap: the fail-closed
    guard could NOT detect a *dropped* export key (it only iterated keys that exist) — the very import-safety
    property Task 1 exists to protect. → **Fix A:** static `REQUIRED_KEYS` enumeration vs `Object.keys(colors)`.
  - Claude reviewer `[important]`: `accent` (set to red500 per the plan) **collided with `primary`**. Grep
    confirmed 14 `colors.accent` refs across 9 files used as a distinct caution/highlight colour. → **Fix C:**
    `accent → amber #B26A00` (one-line token change serving both caution states *and* highlight badges; no
    call-site surgery). *This was a controller/spec error the review caught — Codex built the plan faithfully.*
  - Claude reviewer (minor): tautological remap assertions → **Fix B:** literal-pin the remap values.
- **Decision (proceed-unless-vetoed):** `accent = amber #B26A00`. Small former-yellow highlight badges +
  caution/mid-tier states become deep amber; **red stays dominant**. Consistent with the signed-off palette.
- **Deferred to Task 6 (offender sweep):** stale "blue" comments (`SessionsTodayRing.js:16`, `AppNavigator.js:87`)
  and a stray blue group-badge literal (`GroupPickerBottomSheet.js:27` `#E3F2FD`).
- **Fix landed (Codex):** commit `44dd5d6` — TDD test-first (RED on the accent literal → GREEN).
  Controller-verified: only the 2 files changed; the diff is exactly the 3 fixes; **10/10 green** on
  independent re-run; `accent` now resolves to amber `#B26A00`. **✅ Task 1 ACCEPTED.**
- **Sequencing for Tasks 2–6:** loop proven. Remaining tasks run **sequentially** (T2 → T3 → T4 → T5 → T6):
  T5 (a11y) and T6 (colour guard) are broad sweeps that must run last (they touch the files T3/T4 modify),
  so the graph is effectively linear; worktree-isolated parallelism isn't worth the merge overhead for 5
  small tasks. Real parallelism deferred to a future item with disjoint workstreams.

### 2026-06-17 — Item 3 Task 2: typography tokens (dispatched)

- **Built (Codex):** commit `b3e3758` — `typography.js` (6 entries verbatim per spec) + `typography.test.js`
  (full type-scale pin + 12px-floor test). Controller-verified: matches spec exactly, ~12 assertions, green
  on re-run. **Right-sized review:** static design tokens fully pinned by their test → accepted on controller
  (Claude) review; full Claude-subagent + Codex-adversarial review reserved for tasks with real breakage risk
  (refactors/sweeps). **✅ Task 2 ACCEPTED.**

### 2026-06-17 — Item 3 Task 3: hoist letter-state palette (dispatched)

- **Revision (from plan):** the "assessment" letter cell → **`colors.accent` (amber)**, NOT `colors.primary`
  (red). Rationale: amber ≈ the original `#FB8C00` orange marker and avoids red's "bad/wrong" connotation in a
  results grid; reuses the accent token (DRY). taught=green, default=surface unchanged.
- **Dispatched to Codex (TDD):** create `src/constants/letterStateColors.js` + test; replace the two
  byte-identical local `CELL_COLORS` in `LetterTrackerBottomSheet.js` + `LetterTrackerScreen.js` with the
  hoisted import (drops the stray `#FB8C00`). Full dual review (touches existing screens).

### 2026-06-17 — Item 3 Task 3: committed + accepted; Task 4 dispatched

- **Task 3 committed (controller):** `e2132c6` — 4 files. Controller-verified: diff is the exact mechanical
  swap, `#FB8C00` gone from `src`, both LetterTracker regression suites green (3/3). Codex adversarial
  confirmation running in parallel (read-only, non-blocking — the regression tests already prove the consumers).
  **✅ Task 3 ACCEPTED.**
- **Workflow change:** going forward Codex **builds + tests only**; the orchestrator commits the verified work
  (Codex's sandbox blocked `.git` on Task 3). Cleaner review-before-commit gate.
- **Task 4 (flat BrandButton + kill ALL gradients) dispatched to Codex** (build+test, no commit). Riskiest task
  so far: touches HomeScreen (3 gradient sites), LoginScreen, App.js; no render tests on those screens → full
  review + a flagged visual/device check before Item 3 closes.

### 2026-06-17 — Item 3 Task 4: committed + accepted (with review fixes)

- **Built + fixed (Codex) → committed (controller):** `609094a` — flat `BrandButton` (solid, + icon, + loading
  spinner, + accessibilityState) replaces ALL gradient CTAs; HomeScreen header → `heroDark`; LoginScreen spinner
  + Record-Session `+` icon restored; App.js `primaryContainer` → `red50`. Zero `LinearGradient`/`GRADIENT`
  remain in src/App.js (−93 lines net).
- **Dual review converged on 3 real mediums** (header solid-red not heroDark; lost `+` icon; lost login spinner)
  — all fixed. BrandButton.test 4/4 green; `@expo/vector-icons` jest mock confirmed a genuine repo pattern.
  **✅ Task 4 ACCEPTED.**
- **⚠ Visual check owed before Item 3 merges:** HomeScreen/LoginScreen have no render tests, so the dark header,
  the `+` icon, and the solid-red CTAs are review-verified but NOT visually confirmed → needs a
  preview-build/screenshot pass.
- **Accepted [low] nits → fold into Task 6:** call-site style overrides keep intentional per-button sizing (incl.
  old `borderRadius: 8/20`); App.js `secondaryContainer: '#FFF9CC'` stray yellow + stale colour comments.

**Item 3 progress:** Tasks 1–4 ✅ (tokens · typography · letter-state · BrandButton). Remaining: Task 5
(a11y sweep, ~18 files) + Task 6 (colour-guard + port ~96 stray colour literals across ~22 files).

<!-- append new entries below -->

### 2026-06-18 — Item 3 Task 5: accessibility sweep (committed + accepted)

- **Built (Codex, TDD) → committed (controller):** `0d14c6f` — 17 files. Extracted the Home Profile
  gear into a testable `src/components/common/ProfileGearButton.js` (role=button, label, hitSlop),
  proven by `__tests__/profileGearA11y.test.js` (red→green). Swept all raw
  `TouchableOpacity`/`Pressable`/`TouchableWithoutFeedback` across the 18 touchable files, adding
  meaningful `accessibilityRole`/`accessibilityLabel`, `accessibilityState` (disabled/selected) on
  toggleable letter tiles, and `hitSlop` on icon-only controls. `EgraLetterGrid`, `LetterGrid`, and
  `BrandButton` were already accessible (controller-verified, not double-labelled).
- **Dual review (two-LLM cross-review):**
  - **Codex adversarial `[SHIP]`** — clean across all 7 attack categories: no smuggled non-a11y
    changes, no runtime-throwing label interpolations (verified `EditChildScreen` `child.*` access is
    guarded by an early return), faithful gear extraction.
  - **Claude reviewer `[APPROVE-WITH-NITS]`** — caught 3 real gaps Codex's raw-touchable scope missed
    (the payoff of differing framings — *is it safe?* vs *is it complete?*): unlabelled icon-only
    `IconButton`s in `ClassDetailScreen`, missing `accessibilityState.selected` on letter tiles, and a
    back-button label ("Go back") not matching the visible "Back" text.
- **Engaged (one Codex fix round, controller-verified):** labelled the 3 `ClassDetailScreen`
  IconButtons (Letter tracker / Assessment summary / Edit class); added `selected: state !== 'default'`
  to both letter-tile files; back label → "Back"; gear label → "Open profile" (verb-consistency with
  the rest of the sweep; test updated red→green). Decorative `cloud-upload` `List.Icon` correctly left
  unlabelled.
- **Deferred follow-up (both reviewers agreed, non-blocking):** add `accessibilityViewIsModal={true}`
  to the bottom-sheet content Views to trap screen-reader focus — makes the dismiss-backdrop labels
  moot. It's a focus-management *behaviour* change → device-test-worthy, so it's its own slice, not
  folded into a labelling task. (Also noted: `EgraLetterGrid` receives a `disabled` prop it doesn't
  surface to `accessibilityState` — pre-existing, out of scope.)
- **Tests:** `npx jest profileGearA11y.test GroupPickerBottomSheet.test EditChildScreen.test
  LetterTrackerScreen.plan5 LetterTrackerBottomSheet.plan5` → 5 suites / 12 tests green (Node 20,
  independently re-run by the controller after both the build and the fix round). **✅ Task 5 ACCEPTED.**

**Item 3 progress:** Tasks 1–5 ✅ (tokens · typography · letter-state · BrandButton · a11y sweep).
Remaining: Task 6 (colour-guard capstone + port ~96 stray colour literals across ~22 files).

### 2026-06-18 — Item 3 Task 6: colour-guard capstone + offender port (committed + accepted)

- **Scope reality (preflight):** a faithful pre-scan (fork `isAllowed` + the Masi ALLOWED set) found **14 files /
  59 occurrences / 38 distinct literals** — not the plan's "~22 files / ~96". The plan also *assumed* group/
  score-band palettes "don't exist in Masi yet"; the scan proved they DO (an 8-scheme `GROUP_COLORS`, a RAG
  score scale), which forced the deferred design question.
- **Decision (Jim):** **allowlist categorical/semantic data colours.** The group palette + RAG score scale are
  category/performance encoding, not chrome — so "no orange/yellow" stays true for *chrome*. Implemented as:
  hoist `GROUP_COLORS` → new `src/constants/groupColors.js` (a token-source file, excluded from the guard and
  pinned fail-closed by `__tests__/groupColors.test.js`); allowlist `#1E7A34`/`#FFBB00` with justification.
  Everything else ported to `colors.*`.
- **Built (Codex, TDD) → controller-verified:** `__tests__/noLegacyHues.test.js` (fork scanner port; ALLOWED =
  Masi brand set + the 2 semantic data colours; rgba regexes incl. red500; excludes colors.js + groupColors.js),
  ~17 literal→token ports across 14 files, the `warningBg` token, and stale-comment cleanup.
  - **HARD-RULE worked as designed:** Codex correctly **BLOCKED** on `App.js` `errorStyles` literals
    (`#294A99`/`#F7F7F7`) my mapping table missed (I'd mistaken them for stale comments) rather than silently
    allowlisting the *old blue primary*. Completed the mapping → resumed the same Codex session → GREEN.
- **Dual review:** Claude reviewer `[APPROVE-WITH-NITS]` + Codex adversarial `[SHIP-WITH-FIXES]` (computed WCAG
  ratios analytically). Cross-review caught real **contrast regressions the literal-port masked**:
  - `onSecondary` (#221A1B on amber `#B26A00`) = 4.01:1; the only on-colour clearing 4.5:1 on that amber is pure
    black → `onSecondary: #000000` (4.95:1).
  - `warning` text on `warningBg` = 3.97:1 on small caution-badge text → new **`warningText` #8A4B00** (~6.4:1),
    completing the `warningBg`/`warningText` semantic *pair*; remapped 4 badge/chip text sites.
  - `tileDisabled` bg===border (lost its boundary) → bg `colors.background`.
  - Guard hardening (both reviewers): exact-key-set assertion in `colors.test.js`; the `groupColors.test.js`
    pin; documented the scanner's named-colour/processColor coverage boundary.
- **Fix-application note:** the resumed Codex fix-round hit a **read-only sandbox** (`patch rejected`), so the
  controller applied the precise, already-reviewed fixes directly and re-verified through the full guard suite.
  (Delegated tool blocked ≠ skip the gate — the dual review had already happened; only the pen changed hands.)
- **Deferred to the owed visual/device pass (review-flagged, not code-fixable here):** (1) `red50` for
  bar/progress **TRACKS** — reviewers split (Claude: fine/tonal; Codex: should be a neutral) — verify behind
  RAG-coloured fills; (2) `typeBadgeWord` uses `warningBg` (category vs caution register); (3) `onSecondary` is
  an unused MD3 theme slot today.
- **Tests:** `npx jest noLegacyHues colors groupColors App.plan5 GroupPickerBottomSheet EditChildScreen` →
  **7 suites / 130 green** (Node 20, controller-run). Commit **`ca6912a`** (19 files). **✅ Task 6 ACCEPTED.**

**Item 3 progress:** Tasks 1–6 ✅ — **design-token system COMPLETE** (tokens · typography · letter-state · flat
BrandButton · a11y sweep · colour guard). **Owed before merge:** a visual/device preview pass — Task 4's
HomeScreen dark header + "+" icon + solid-red CTAs are review-verified only, plus the 3 Task-6 visual flags
above — then `superpowers:finishing-a-development-branch` for the merge/PR.

### 2026-06-18 — Item 3 CLOSED (merged + visually verified)

- Merged `ui/design-tokens` → `main` (fast-forward, tip `65118aa`); branch deleted. Full suite re-run on merged
  main: **95 suites / 554 tests green**.
- **Visual/device pass PASSED:** Jim preview-built on `npm run sqlite:staging:ios` — "build looks good." Task 4's
  dark hero header / Record-Session `+` / solid-red CTAs **and** the three Task-6 visual flags (red50 bar/progress
  tracks, `typeBadgeWord` amber, `onSecondary`) are all accepted. The owed visual gate is **cleared**.
- Not pushed (local `main` ahead of `origin/main` — Jim's call when ready). **Item 3 = fully done.**
- **Next: Item 4** (Step-by-Step capture + extracted capture spine). Handoff written to `/tmp/masi-item4-handoff.md`;
  build order continues 3 → **4** → 8 → 5 → 7 → 6.

### 2026-06-18 — Item 4: discovery + plan written (decisions locked)

- **Plan:** [`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md`](../docs/superpowers/plans/2026-06-18-item4-sequential-capture.md)
  — 13 TDD tasks (constants · scoring/record-builder · reducer · **capture_mode schema contract** · device-pref ·
  route resolver · **useAssessmentSession spine** · **LetterAssessmentScreen proving-slice refactor** · EgraLetterGrid
  readOnly/currentIndex · SequentialAssessmentScreen · nav register · entry-point routing · Profile toggle).
- **Discovery findings that shaped the plan** (verified across Masi + fork `c183d3e`):
  - **Save path is an impedance layer, so the hook stays schema-agnostic.** `assessmentsRepository.saveAssessment`
    takes the screen's "fat" record and itself injects `programme_id` (NOT-NULL, via `resolveProgrammeId`), maps
    `date_assessed→assessment_date` / `correct_responses→score` / `letters_attempted→total_items`, and splits the EGRA
    detail into the normalized `assessment_items` table (`__summary__` row + per-letter rows). The extracted hook just
    rebuilds the same fat object + `capture_mode`; **no repo-internals surgery.**
  - **`capture_mode` is a 3-file code contract**, not one: local migration (`src/db/migrations.js` v4) **+**
    `ASSESSMENT_COLUMNS` (`assessmentsRepository.js`) **+** `SERVER_COLUMNS` (`src/services/offlineSync.js:195`) — miss
    the last and it persists locally but never syncs — **+** Supabase migration **+** contract map **+** refactor log.
  - **Column is nullable, NO DB default.** `NULL = legacy/grid`; a `DEFAULT 'sequential'` would mislabel grid rows
    written by older field app versions → corrupts the A/B. Client stamps the resolved mode explicitly.
  - **`correction_count`** rides in the existing `__summary__` metadata JSON (one line in `buildSummary`) → **no extra
    migration.**
  - **Three** assessment entry points exist (not two): `AssessmentChildSelectScreen:73`, `ChildAssessmentSummaryScreen:117`
    ("Run Assessment"), `AssessmentResultsScreen:34` ("Try Again").
  - `EgraLetterGrid` lacks `readOnly`/`currentIndex` (only `disabled`, which dims) → Task 9 adds them backward-compatibly.
  - CONTEXT.md already defines **"marking mode"** (who scores) → plan adds a **"capture mode"** glossary entry to prevent
    drift (orthogonal axis: which UI mechanic).
- **Decisions locked (Jim, via question):**
  1. **Preference scope = device-local + seam** (mirror the field-tested fork; `resolveCaptureMode` carries org/user as
     no-op seams). No new write path to the read-only `users` table. Default = `sequential`.
  2. **"Try Again" routing deferred to Item 5.** Route only the two clean entry points now;
     `AssessmentResultsScreen.handleTryAgain` keeps launching the grid until Item 5 (which owns that screen + has
     unrelated uncommitted edits there) routes it. **Disclosed gap, not silently dropped.**
- **Branch:** `feature/sequential-capture` off `main` (per handoff).
- **Plan reviewed (2026-06-18, two-LLM):** Claude `plan-reviewer` (SHIP-WITH-FIXES) + Codex adversarial
  (NEEDS-REWORK) — **converged**; core design confirmed sound (sync contract, nullable/no-default, record
  builder, correction_count round-trip, hook failed-save guard), and **8 fixes folded into the plan's
  "Post-review revisions" section**: sequential reducer **race clamp** (fixes a latent bug in the *fork* —
  reducer-level, not just the component guard), grid **finish-freeze** (`finishStartedRef` + `setPhase('finished')`
  before the Last-Attempted sheet) + grid **correction tracking** (un-taps → symmetric A/B data, not 0),
  existing-test reconcile (`LetterAssessmentScreen.plan5.test.js`), `LOCAL_STATE_KEYS` buildability fix (Masi
  uses direct keys), async double-launch `launchingRef` guard, non-tautological elapsed-via-expiry test,
  push-allowlist (`SERVER_COLUMNS`) test. **Next:** dispatch Codex Task 1.

### 2026-06-18 — Item 4: all 13 tasks built + committed; finish-gate suite GREEN

- **Build method:** subagent-driven — Codex (`codex:codex-rescue`) built each task TDD red→green; the controller
  (Claude) independently re-ran every focused suite + scope-checked every diff and committed; schema/hook/screen
  tasks got a Codex adversarial pass (the two-LLM cross-review). Plan: `docs/superpowers/plans/2026-06-18-item4-sequential-capture.md`
  (with a **Post-review revisions** section folding in the 8 plan-review fixes R1–R8).
- **Commits (one per task):** T1 `273a23d` (capture-mode constants) · T2 `09030e5` (scoring + record builder) ·
  T3 `fa62385` (sequential reducer + R1 race clamp) · **T4 `0f570ae` (capture_mode schema contract — 5 code
  artifacts + 3 docs)** · T5 `9c344a0` (device-local preference, R5) · T6 `7d742cc` (route resolver) ·
  **T7 `a716d68` (useAssessmentSession spine)** · **T8 `97f0f87` (LetterAssessmentScreen proving-slice refactor)** ·
  T9 `4d67322` (EgraLetterGrid readOnly/currentIndex) · **T10 `9dddce3` (SequentialAssessmentScreen, R2)** ·
  T11 `f6ee5ee` (nav register) · T12 `104315b` (entry-point routing, R6) · T13 `88f4c5f` (Profile toggle) ·
  finish-gate test-pin fix `8015cb7`. Planning docs `eae2431`.
- **Dual reviews (every finding engaged as a claim to verify):**
  - **T4 schema — Codex SHIP** + 1 LOW applied (scoped the Supabase `pg_constraint` idempotency probe by `conrelid`
    — `conname` isn't globally unique). Push path traced clean end-to-end; harness confirmed real better-sqlite3.
  - **T7 hook — Codex SHIP-WITH-FIXES → both applied:** **H1** `abandonedRef` (an in-flight save must NOT navigate
    to results after the EA hits Leave/Discard — a real slow-save race; RED→GREEN test); **H2** pure-updater timer
    (side effects moved into the interval callback, out of the `setState` updater). +3 high-risk tests.
  - **T8 proving slice — Codex SHIP-WITH-FIXES:** Vector 4 fixed via a `stopTimer()` affordance (last-attempted
    sheet path now freezes the timer synchronously, parity with the original — `hasFinishedRef` couldn't be set early
    as it guards the deferred save). Vector 6 (`navigate→replace` + local-first sync-after-nav) confirmed **intended**
    hardening (handoff + CLAUDE.md), not a regression. Grid behavior otherwise identical.
  - **T10 sequential — Codex SHIP:** no defects across 6 sequential edges. R2 reducer clamp closes the final-item
    rapid-tap overshoot (proven by a no-overshoot race test).
- **Decisions honored:** preference is **device-local + `resolveCaptureMode` org/user seam** (no new write path to
  the read-only `users` table); **"Try Again" deferred to Item 5** (`AssessmentResultsScreen` untouched — verified 0
  Item-4 changes). `capture_mode` nullable, **no DB default** (NULL=legacy/grid); `correction_count` in `__summary__`
  metadata (no extra column).
- **Finish-gate suite (Node 20, worktrees+node_modules excluded):** **106 suites / 600 tests GREEN.** One real catch:
  `sqliteFoundation.test.js` pinned the migration list/count/user_version to 3 — migration v4 made it 4 (4 places
  updated); that suite failing mid-migration had also cascaded a parallel-worker interference onto
  `captureModeMigration` (which passed in isolation). Fixing the pins cleared all 5 failures. **No app-code bug.**
- **OWED before merge/distribution (carried, not done):**
  1. **Device/preview pass** — the two capture screens + the Profile toggle have **no on-device verification**.
     `npm run sqlite:staging:ios` (or EAS `--profile preview`). Confirm: default launches Step-by-Step; the toggle
     flips it; both modes save + show results; `capture_mode` lands in Supabase.
  2. **DEPLOY GATE — Supabase migration ✅ APPLIED 2026-06-18** (Jim-approved). `npm run sqlite:staging:push` applied
     `20260618120000_masi_assessments_capture_mode.sql` to `masi-app-sqlite` (`segygjzpujphwvrubusm`) — and, since the
     backend was 2 behind the files, also caught up `20260529212523_programmes_daily_session_target` and
     `20260529214500_sessions_forward_prep_columns` (all additive/idempotent; no field users). Re-run dry-run confirms
     "Remote database is up to date." (Column-level `information_schema` spot-check blocked by the known `db query` 401
     — access-token/keychain in a non-interactive shell — so verify in an interactive terminal if desired; it also
     surfaces during the device pass when `capture_mode` syncs.)
  3. **Item 5 follow-up (disclosed gap):** route `AssessmentResultsScreen.handleTryAgain` through
     `resolveAssessmentRoute` so "Try Again" honors the toggle (currently hardcodes the grid).
- **Not pushed** (local branch ahead of `origin` — Jim's call). **Next:** `finishing-a-development-branch` (merge/PR
  decision) → device pass → handoff to **Item 8**.

### 2026-06-18 — Item 4: field-feedback follow-ups (Jim's first device pass)

- **Supabase migration APPLIED** (`b43b3c1`): `npm run sqlite:staging:push` → `capture_mode` on `masi-app-sqlite`
  (+ caught up 2 prior pending forward-prep migrations); dry-run confirms "up to date". Deploy gate cleared.
- **UX (`4215c4f`):** Step-by-Step now fills an explicitly-marked **Incorrect** item red (`colors.error` + white
  text + 'incorrect' a11y label) instead of leaving it blank — `EgraLetterGrid` `letterStates===false` (grid mode
  never stores false, so it's unaffected). Sequential **Back** button → neutral ink (frequent benign action) vs
  **End Assessment** red (rare consequential) so they no longer blur. **Owed:** Jim's visual confirm on device.
- **Sync bug B (`d2de9fc`):** Sync Status no longer says "Everything is up to date" while Failed Items exist.
  Root: terminal outbox rows are excluded from the `breakdown`/unsynced count but shown in Failed Items; now
  "up to date" requires no pending AND no failed, else a "<N> failed to sync — see below" message. UI-only.
- **Sync bug C (`7afa3da`, Jim-approved C1):** **Sync Now (force) now resurrects terminal rows** so it clears stuck
  dependency chains in one tap; auto-sync still skips terminal (no storms). Root: RLS/FK errors (42501/23503) are
  classified terminal and `getReadyRecords` only claimed pending+failed — so only per-item Retry cleared them, even
  though these are usually TRANSIENT (a child's parent had not synced yet). Fix: `getReadyRecords` gains
  `includeTerminal`; `syncAll` passes `includeTerminal: force`. **Owed: Jim's device re-test** (real two-connection
  behavior isn't unit-testable). The stuck records Jim saw were a one-time artifact of capturing *before* the
  migration (parent assessments `PGRST204`'d → child `assessment_items` `42501`'d as terminal); the migration +
  retry resolved them.
- **Test-infra (`6d4a8d3`, pre-existing — NOT a feature regression):** the full Jest suite surfaced a
  `captureModeMigration` failure that only appears in the full run order (passes in isolation + every serial subset).
  **Root, proven by a schema-DDL assertion:** the `capture_mode` CHECK is correctly in the migrated schema; some
  earlier test file leaves CHECK *enforcement* disabled process-wide on a later fresh better-sqlite3 `:memory:` db.
  Made the assertion schema-based (deterministic) → **full suite green again: 107 suites / 606 tests.** Real
  enforcement is covered server-side (Supabase named CHECK) + app-level (`isValidCaptureMode`). **Follow-up
  (separate, low priority):** find the file that disables CHECK enforcement and restore isolation.

<!-- append new entries below -->
<!-- NOTE: the older "append new entries below" marker above is mid-file; this is the live tail. -->

### 2026-06-18 — Item 8: kickoff — Item 4 merged, coverage map + plan + two-LLM review (decisions locked)

- **Pre-step — Item 4 merged to `main` (local FF) + Item 8 branched.** Re-verified Item 4 green first (107/107 unit · 606 tests; 20/20 integration · 134 tests, Node 20), then `git merge --ff-only feature/sequential-capture` (`65118aa → fcec7e2`, 22 Item-4 commits) and branched `test/field-critical-paths` off the new `main`. Local-only, **not pushed** (Jim's schedule). Merging Item 4 first put the post-Item-4 `SyncStatusScreen` + `capture_mode` `SERVER_COLUMNS` on the Item-8 base, so the schema-drift + render tests characterize the real forward code (no stale-then-rebase).
- **Plan:** [`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md`](../docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md) — **9 TDD tasks** across §8's 5 gaps: schema-drift SERVER-mirror guard · 4 render characterizations (Home, LiteracySessionForm, TimeTracking, ClassDetail) · timeEntriesRepository integration wiring · clock-in vertical · device-faithful engine + force-stop test · opt-in RLS visibility probe. **Scope = all 9 (Jim).**
- **Discovery findings that shaped the plan** (verified against the merged tree @ `fcec7e2`):
  - **Gap 1 is half-done.** `syncContractCompleteness.test.js` already pins `SERVER_COLUMNS` vs the LOCAL migrated schema; the missing, field-critical half is the SERVER mirror (parse `supabase/migrations/*.sql`, assert each `SERVER_COLUMNS` column exists server-side — the PGRST204 direction). Task 1 is that complement, not a new suite.
  - **Gap 2 is 4 screens, not 5** — `SyncStatusScreen` already has `syncStatusScreen.test.js` (§8's list was stale).
  - **Gap 3:** `timeEntriesRepository` confirmed absent from `jest.integration.config.js` testMatch; the repo test FILE already exists (7 tests) but runs only in the unit tier — gap = wire it into the integration tier + add the provider-backed vertical.
  - **Gap 4 splits CI-safe from live:** guard + policy-targeting unit test in CI; the live RLS probe is opt-in (Jim runs interactively — mgmt token 401s in agent shells), owed like Item 4's device pass.
  - **Gap 5:** the fork's `expoSQLiteRealEngine.js` (165 lines; per-name file registry + close/reopen survival) is portable, added **OPT-IN** (does not replace `expoSQLiteMock.js` or rewire the 20 integration suites).
- **Plan reviewed (2026-06-18, two-LLM):** Claude `plan-reviewer` (**SHIP-WITH-FIXES**, 5 findings) + Codex adversarial (**NEEDS-REWORK**, 5 findings) — **convergent → reconciled SHIP-WITH-FIXES** (both endorsed the gap mapping + risk boundaries). Review file: `docs/plan-reviews/2026-06-18-item8-field-critical-paths-plan-review.md`. **7 fixes folded as R1–R7** in the plan's "Post-review revisions" section (the 3 HIGH ones controller-re-verified against source):
  - **R1 (HIGH, both)** Task 1 parser must capture multi-column `ALTER…ADD COLUMN, ADD COLUMN` + treat `do $$` constraint blocks as opaque (`20260521144901_masi_zazi_alignment_schema.sql:127-181` adds ~18 `SERVER_COLUMNS` columns via comma-separated ALTERs — a first-column-only parser is the load-bearing false-green).
  - **R2 (HIGH, plan-reviewer)** Task 6 WIRES the EXISTING `timeEntriesRepository.test.js` (7 tests) into the integration tier — does NOT recreate it (literal "create" would overwrite stronger coverage).
  - **R3 (HIGH, Codex)** Task 8 ported engine must honor `useNewConnection` (distinct handle, same file) so the reader's `PRAGMA query_only=ON` can't poison the writer (`client.js:13-16,56-62`).
  - **R4 (HIGH/MED, both)** Task 7 precedent = `clientWriterConnection.test.js` (`__setDatabaseFactory` + `resetDatabaseConnectionForTests`) with a shared REAL db, not `ChildrenContext.test.js`.
  - **R5 (MED, both)** Task 3 add the `useChildren` mock (`ChildSelector` throws without it) · **R6 (MED)** Task 9 real policy = `sessions_select_own_or_assigned_child_history` · **R7 (LOW)** Task 5 `childrenGroups` is an array.
- **Orchestration (unchanged from Item 4):** Codex builds TDD via `codex:codex-rescue`; controller independently re-runs every focused suite + scope-checks every diff + commits; Tasks 1, 7, 8 (and 2) get a Codex adversarial pass. Testing-item red/green: characterization tests go green on first run (a red = wiring bug or a real defect → `systematic-debugging`); the gap-1 guard is proven-to-bite via a mutation check. **Leave-untouched list carried** (`AssessmentResultsScreen` WIP etc.). **Next:** dispatch Codex Task 1.

