# Sync Reliability Slice — Build Log

> **Scope:** Top-10 Items 1 + 2 — eliminate the SQLite connection storm / pragma leak
> (dedicated writer + read-only reader + CAS-preserving bulk finalize) and make the outbox
> sync converge (bounded backoff, manual-sync bypass, per-record/per-batch error guard).
> **Dependency-skip redesign is descoped** to a later `dependency-ordering-and-orphan-prevention` slice.

**Branch:** `fix/sync-reliability-writer-batch`
**Spec:** [`docs/superpowers/specs/2026-06-16-sync-reliability-design.md`](../docs/superpowers/specs/2026-06-16-sync-reliability-design.md)
**Plan:** [`docs/superpowers/plans/2026-06-16-sync-reliability.md`](../docs/superpowers/plans/2026-06-16-sync-reliability.md) — 12 TDD tasks, 5 phases
**Execution mode:** subagent-driven-development (fresh implementer per task → spec review → code-quality review → `/codex:adversarial-review` → engage findings → commit).

---

## Why a fresh build log

`documentation/sqlite-refactor-log.md` is the historical clean-slate-refactor record and has gone stale.
This slice is well-bounded with its own spec + plan, so it gets a dedicated, readable log here.
The **final device/emulator pass** (Plan Task 12, Step 4) is *also* recorded in `sqlite-refactor-log.md`
per AGENTS.md, so the durable device-verification trail stays in the canonical place.

---

## Conventions

Each task entry records: **status**, **what changed**, **tests** (command + result), **Codex adversarial-review**
findings and how each was resolved (verified against code first, per the established review loop), and the **commit SHA(s)**.
All Jest/integration commands are prefixed with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`
(shell default is Node v22; `better-sqlite3` is built for Node 20 — recorded in memory).

---

## Pre-flight

### P0 — Scope the unit Jest config to the repo (exclude sibling worktrees)

- **Problem found:** the **unit** Jest config (`package.json` `jest` key, used by `npm test` and every
  `npx jest <name>`) had no `testPathIgnorePatterns` beyond the implicit `node_modules`. An in-repo git
  worktree, `.claude/worktrees/feature+wela-plus-battery`, contains **72 test files**, many sharing names
  with the root suite (`offlineSyncOutbox.test.js`, `assessmentsRepository.test.js`, `OfflineContext.test.js`, …).
  Bare `npm test` ran both copies; focused runs like `npx jest offlineSyncOutbox` (used by Plan Tasks 6/8/9/11)
  matched the worktree copy too — corrupting the green/red signal from a *different branch's* code.
  The **integration** config was already safe (explicit `<rootDir>/__tests__/<file>` `testMatch` allowlist).
- **Fix:** added `testPathIgnorePatterns` **and** `modulePathIgnorePatterns` to the unit config excluding
  `node_modules` + `.claude/worktrees` + `.codex/worktrees`. `testPathIgnorePatterns` stops worktree test
  *discovery*; `modulePathIgnorePatterns` removes the worktree from Jest's *module/haste map* (killing the
  `nonprofit-field-app` package.json haste collision). `jest.integration.config.js` inherits both via its
  `...packageJson.jest` spread, so no second edit was needed.
- **Verified:** `npx jest offlineSyncOutbox --listTests` → only the root copy, no collision warning;
  integration `--listTests` → exactly the 13 root allowlist files.
- **Status:** ✅ done
- **Commit:** `af2b7c0` — _test: scope jest to repo, exclude sibling worktrees_

### P1 — Baseline green

- Establish the pre-change baseline (`npm test` + `npm run test:integration`) so any later red is attributable
  to the task that caused it.
- **Result:**
  - **Integration:** ✅ 13 suites / 113 tests pass (`--runInBand`, file-backed SQLite — the reliable signal for db/sync work).
  - **Unit:** 371/373 pass. The 2 "failures" — `AssessmentHistoryScreen.plan5` and `SessionHistoryScreen.plan5` —
    are **pre-existing load-induced `waitFor` timeout flake** (16–17s under the 78-suite parallel run; **pass
    deterministically in isolation in ~1.3s**). Orthogonal to this slice (UI history screens, not the db/sync
    layer) and **not** caused by the P0 jest-scope change (which only *excludes* paths). Not fixed here (out of
    slice scope — they belong to the Plan-5 UI work). **At Task 12** the release-gate full run may flake on these
    two; if so, re-run them in isolation to confirm green before judging the gate.
- **Status:** ✅ baseline accepted (green modulo the 2 documented pre-existing UI flakes)

---

## Phase 1 — Foundation

### Task 1 — `chunkArray` + `sqlPlaceholders` helpers
_status: pending_

### Task 2 — Migrations run FK-off via manual BEGIN/COMMIT
_status: pending_

### Task 3 + 4 — Dedicated writer + read-only reader; all writes via writer (ONE atomic commit)
_status: pending_

### Task 5 — FK migration-order audit (positive + negative)
_status: pending_

## Phase 2 — Bulk finalize & batch failure semantics

### Task 6 — CAS-preserving bulk finalize (all outcomes)
_status: pending_

### Task 7 — Batch failure semantics (B4)
_status: pending_

## Phase 3 — Convergence

### Task 8 — Backoff cap + retry reset + manual "Sync Now" bypass
_status: pending_

### Task 9 — Per-record error guard in `syncAll`
_status: pending_

## Phase 4 — Sync-contract completeness, then batched upserts

### Task 10 — `INTENTIONALLY_UNSYNCED` + `LOCAL_ONLY_COLUMNS` + completeness test
_status: pending_

### Task 11 — Extend `BATCHABLE_UPSERT_TABLES` + contract-map update
_status: pending_

## Phase 5 — Verification

### Task 12 — Full suite + device/emulator stress pass (AC #10)
_status: pending_
