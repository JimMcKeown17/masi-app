# WelaPLUS implementation handoff — 2026-06-03

Drop this into a fresh session as the first message after compaction. Everything below is the load-bearing context to continue the WelaPLUS Question-component build without re-deriving it.

---

## Where you are

- **Repo**: `JimMcKeown17/masi-app` (https://github.com/JimMcKeown17/masi-app)
- **Worktree**: `/Users/jimmckeown/Development/masi-app/.claude/worktrees/feature+wela-plus-battery`
- **Branch**: `worktree-feature+wela-plus-battery` (local-only, not pushed)
- **Working directory for all commands**: the worktree path above. Do NOT `cd` to the main repo.

## What got built

The WelaPLUS Assessment Battery OSS package skeleton + first two Patterns, built **in-place under `src/assessment-questions/`** for later extraction to a standalone `@masinyusane/assessment-questions` repo. Decision rationale in `~/.claude/projects/-Users-jimmckeown-Development-masi-app/memory/project_wela_oss_in_place_build.md`. Extraction trigger: one clean Window of field data (~50 Runs).

Branch state (most recent first):

```
3969808 Fix 6 code-review findings on Pattern A (Q1) and Pattern B (Q3, Q4)
0766a5a Implement Pattern B Q3 and Q4 (oral checklists) per #17
365348c Implement Q1 LetterSoundsQuestion (Pattern A) per #16
d498408 Reserve capture_mode + correction_count on ResultDerived for 0.2.0 sequential mode
6608f0d Build WelaPLUS OSS package skeleton: types, hooks, contract framework, boundary guard
```

Closed GitHub issues this session: **#15, #16, #17**. Open issues #18–#34 are still open per the PRD-to-issues map.

## Current gate state

| Gate | Status |
|---|---|
| `npm test` | **392 / 392** passing |
| `npm run test:integration` | **113 / 113** passing (unchanged baseline) |
| `npm run test:types` (tsc --noEmit on the scoped tsconfig) | clean |
| Boundary live scan | 0 violations in `src/assessment-questions/**` |
| `npm run sqlite:staging:check` | not run in worktree (needs `.env.local` from main checkout) |

## What's open and unblocked

All four remaining Pattern issues are unblocked from #15. Each takes the template Q1/Q3/Q4 established:

| Issue | Component(s) | Notes |
|---|---|---|
| **#18 Pattern C** | `<ReadWordsQuestion>` (Q6), `<ReadSentencesQuestion>` (Q7), `<ReadPassageQuestion>` (Q8) | Pill-tile reading, Q6+Q8 are timed (durationSec drives), `markingPolarity: 'tap_correct' \| 'tap_wrong'` escape hatch, passage length variable. First-Pattern-C font-size hint per PRD user story 9. |
| **#19 Pattern D** | `<LetterWritingFromPicturesQuestion>` (Q5), `<WriteCvcsQuestion>` (Q9), `<WriteSentencesFromDictationQuestion>` (Q10) | Paper-marked. Q5 batch marking on a paginated grid; Q9/Q10 single-column live marking. End-of-Run photo capture is the host's responsibility (#24); these components emit Result only. |
| **#20 Pattern E** | `<StoryWritingRubricQuestion>` (Q11) | Divergent marking: 5-chip rubric per dimension (0-4), 4 dimensions for /16. Per ADR-0004, items[i].item_key is `'ea:<dimension>'` (load-bearing for the HQ NextJS dashboard's later `'hq:<dimension>'` row inserts). Result.derived.ea_rubric_total set. |
| **#21 Pattern F** | `<ListenAndAnswerStoryQuestion>` (Q2) | EA reads a story aloud from the intro screen, then 5 comprehension prompts. "Re-read story" pill opens a modal sheet without losing marks. Same shell as Pattern B's question phase. |

After Patterns: HITL issues **#11/#12/#13** (schema, columns, artifacts) plus the per-Pattern wiring issues **#27–#32** and the field-test/pedagogy tracking issues **#33/#34**.

## The Question template (use for #18–#21)

The Q1/Q3/Q4 components share this shape. New Patterns should replicate it unless the Pattern's spec diverges:

1. **File layout**: `src/assessment-questions/questions/<Name>/{index.tsx, types.ts}` plus a stub item set per language at `src/assessment-questions/itemsets/<question_code>.{en,xh}.ts`. Per-Question shape (`<Name>ItemSet`) is declared in `types.ts`; the stub itemset binds it via `ItemSet<<Name>ItemSet>`.

2. **Stub item_set_id MUST be marked**: use `<question_code>@stub-2026-06-02.<lang>` so any captured run during scaffolding is queryably distinguishable from real WelaPLUS content (real content swaps in via #34).

3. **Phase machine**: `'intro' | 'active' | 'finished'` (plus `'confirm-finish'` and `'abandon-picker'` for Pattern B; Pattern E will need different states). Intro renders `instructions` (optional) + Start. Finished returns `<View />`. The active phase renders the per-Pattern UI plus the End/Finish/Abandon controls.

4. **Refs**: `isMarkedRef` (synced via `useEffect`, NOT during render), `hasFinishedRef` (double-emit guard), `startTimeMsRef` (Date.now() captured on entering active phase).

5. **resolveItemSet**: type-guard the override with `isFullItemSet(value)` that checks BOTH the per-Question payload AND `item_set_id`/`question_version` are strings. Fall back to bundled default on invalid override. See Q1/Q3/Q4 for the canonical shape.

6. **finish(stoppedReason)**: builds the contract-shape `Result`, calls `onComplete`. Uses `isMarkedRef.current` for `items[i].is_correct`. `was_timed` reflects whether the Pattern is actually timed — for Pattern B, hardcoded `false`. `duration_ms` is `Date.now() - startTimeMsRef.current`. `last_attempted_position` is meaningful for timed Patterns only.

7. **onItemMarked**: fired per-tap with `{position, item_key, prompt, is_correct: willBeMarked}`. For Q4 (and any future Pattern with EA-visible side info), include `metadata: { word: ... }` to preserve display-only context for analytics.

8. **onAbandon**: must be exposed via an Abandon button + reason picker (6 reasons). Selecting a reason fires `onAbandon(reason)` then `finish(reason)`. Pattern A uses just an End button because the timer is the dominant exit; Pattern B added the Abandon flow per code-review finding 4.

9. **Contract test**: every Question gets a `<Name>.contract.test.tsx` colocated under `__tests__/`. Use `runContractTest` from #15. Test BOTH happy-path completion AND timer-expiry / Yes-confirm-with-unmarked / abandon paths — whichever apply.

10. **Boundary**: imports only from `react`, `react-native`, and `src/assessment-questions/**`. The live boundary scan catches `expo-*`, `@supabase/*`, `@react-native-community/*`, host `services/repositories/screens/db/config/context/` paths. Adding a host-concerning import will fail `npm test`.

## Key decisions / load-bearing context

- **In-place build, not standalone repo yet.** When codex (or any reviewer) suggests "move to a separate repo," disagree — that's deferred to post-field-test. The boundary lint guard is the extraction insurance. Documented in `CLAUDE.md` § "Adversarial Code Review with Codex" and in the `project_wela_oss_in_place_build.md` memory.

- **TDD is mandatory** per project CLAUDE.md. Red → Green → Refactor. The skill at `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/test-driven-development/SKILL.md` is the one in use.

- **OSS contract validator depth.** `validateResult` enforces: required top-level fields, string types for ID fields, `duration_ms` is a number, `stopped_reason` is in the enum, `items` is an array of objects with `position`/`prompt`/`is_correct`, `derived` has all required fields, AND the cross-field rule that `was_timed === true` OR `stopped_reason === 'timer'` requires `last_attempted_position` to be a number. The validator also accepts the optional `derived.was_timed`, `capture_mode`, `correction_count` (reserved for 0.2.0 sequential mode).

- **`runContractTest`** returns `{ rendered, verdict }`. Use `rendered.getByText(...)` etc. to drive interactive Questions before awaiting `verdict`. Layered check: if the test was invoked with a `durationSec` prop, the verdict also fails if the emitted Result has `was_timed !== true` and `last_attempted_position` is not a number.

- **Forward-compat reservation**: `derived.capture_mode?: 'grid' | 'sequential'` and `derived.correction_count?: number` are typed but currently ignored by the validator. They exist so 0.2.0 can add sequential capture (per ZZ's plan at `/Users/jimmckeown/Development/zazi-izandi-app/documentation/plans/2026-06-02-sequential-assessment-mode.md`) as an additive change.

## Codex review — what works and what doesn't

- **`codex review --uncommitted` via Bash** (the lightweight path) works through the new `codex` plugin runtime installed in this session. Use for per-commit checks — single agent, ~5-10k tokens. Rounds 1-4 earlier in the session caught real bugs each round.

- **`/code-review` slash command** triggers a **max-effort 9-parallel-angle multi-agent review** (~400k tokens). DO NOT use for routine per-commit review — use only periodically for deep audits. It DID surface the 6 findings we just fixed, so it's valuable, just expensive.

- **Codex API outages**: Earlier in this session the bare `codex review --uncommitted` hit upstream `model 'gpt-image-2' does not exist` errors. The new plugin runtime (Codex CLI 0.135.0, advanced runtime) routes differently and worked when last tested. If you hit the same error: try once more, then fall back to the multi-agent `/code-review` skill.

## Recent code-review findings — fixed in commit 3969808

All from a `/code-review` pass against commit `0766a5a` (#17 Pattern B). Numbers match the original review's ranking:

- **#1 (P1)** Pattern B `was_timed` wrongly reflected `durationSec` → hardcoded `was_timed: false` in Q3/Q4.
- **#2 (P2)** `resolveItemSet` accepted thin overrides → strict `isFullItemSet` guards on Q1/Q3/Q4 with fallback to bundled default.
- **#3 (P3 latent)** Dead `setPhase('active')` before `finish('completed')` in Yes button → removed.
- **#4 (P2)** No `onAbandon` UI → added Abandon button + 6-reason picker on Q3/Q4. Pattern A's End button is the equivalent (timer dominant); Pattern C/D/E/F should add this same Abandon shell.
- **#6 (P2)** Q4 dropped `word` gloss → now in `items[i].metadata.word` and `onItemMarked` payload.
- **#7 (P3 latent)** `isMarkedRef.current = isMarked` during render → moved into `useEffect([isMarked])` on Q1/Q3/Q4.

Findings **#5 (isiXhosa stubs contain English placeholders)** and **#8 (Q3+Q4 are ~95% duplicate)** were deferred:
- #5 is pedagogy work (#34 owns real content).
- #8 will be revisited once Pattern C lands (4 components is the better extraction moment).

## How to resume

1. **Read this file first**, then re-read the PRD at `documentation/wela-plus-battery-prd-2026.md` if the Pattern you're about to build needs spec recall (sections by Pattern letter).
2. **Confirm gate state**: `npm test` should be 392/392 passing, `npm run test:types` clean, `git log --oneline -5` should match the branch state above.
3. **Pick the next Pattern issue.** Suggested order:
   - #21 Pattern F (Q2 Listen-and-Answer Story) — smallest single-component issue; reuses Pattern B's question shell, adds a "Re-read story" modal.
   - #18 Pattern C (Q6/Q7/Q8) — three components; first introduces timed reading + `markingPolarity` escape hatch. Q6 is also a Pattern A timer cousin.
   - #20 Pattern E (Q11) — most architecturally different (5-chip rubric, ADR-0004 `ea:` prefix). Worth saving until you're warmed up.
   - #19 Pattern D — depends on the host's photo capture flow (#24); the Question components themselves are pure capture, no camera concerns.
4. **TDD discipline**: invoke `superpowers:test-driven-development` skill once at the start, follow Red → Green → Refactor.
5. **Adversarial review**: after committing each Pattern, run `codex review --uncommitted` via Bash. Engage substantively — fix the bugs, push back on the architectural disagreements (in-place build is the right call, do not relitigate).
6. **At commit time**: follow the project's commit convention from `CLAUDE.md` § "Committing changes with git" — Title-case, no conventional-commit prefix, HEREDOC for multi-line, include Co-Authored-By trailer.

## Files to keep in mind

- **CLAUDE.md** (project root): TDD rule, SQLite architecture, schema-drift warnings, RLS contract rule, codex-review guidance (§ "Adversarial Code Review with Codex" added this session).
- **`documentation/wela-plus-battery-prd-2026.md`**: 1608-line PRD. Sections by Pattern letter at lines 168 (A), 177 (B), 189 (C), 200 (D), 266 (F), 310 (E). The OSS contract is at line 100, the result shape at 114.
- **`src/assessment-questions/contractTest/validateResult.ts`**: the validator. Read it before changing the Result shape in any Question.
- **`src/assessment-questions/types/{Result,QuestionProps,ItemSet,BatteryConfig}.ts`**: the contract types.
- **`documentation/rls-sync-contract-map.md`**: not relevant for OSS Question components, but load-bearing for the HITL schema issues (#11/#12/#13) when those come up.
- **Memory files at `~/.claude/projects/-Users-jimmckeown-Development-masi-app/memory/`**: persistent decisions. The MEMORY.md index is loaded automatically; individual memory files load on demand.

## Things NOT to do

- Don't push the branch unless explicitly asked. PR-to-main follows when phase-1 HITL issues land.
- Don't extract the OSS package to a separate repo yet. Field test first.
- Don't import host code from `src/assessment-questions/**`. The boundary scan will fail `npm test`.
- Don't run `/code-review` for routine per-commit checks. Use `codex review --uncommitted` via Bash.
- Don't skip the contract test for a new Question. The `runContractTest` invocation is the deepest verification we have.
- Don't change `validateResult` rules without updating the validator's test file (`src/assessment-questions/__tests__/validateResult.test.ts`) AND adding a reason in the PR / commit.

Good luck.
