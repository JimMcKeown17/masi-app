# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. This repo is **single-context**.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary (settled decisions, glossary terms, go-live scope). This is the canonical vocabulary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in:
  - `0001-group-reconciliation-via-versioning-and-staging.md`
  - `0002-thousand-stories-synthetic-whole-class-group.md`
  - `0003-assessment-score-bands.md`
- **`documentation/open-decisions-backlog.md`** — open/deferred decisions not yet settled (do not assume these are decided).
- The wider doc set in `AGENTS.md` (DATABASE_SCHEMA_GUIDE, rls-sync-contract-map, sqlite-refactor-log, docs/agent-context/) for schema, sync, and in-flight workstream context.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-group-reconciliation-via-versioning-and-staging.md
│   ├── 0002-thousand-stories-synthetic-whole-class-group.md
│   └── 0003-assessment-score-bands.md
└── src/
```

There is no `CONTEXT-MAP.md` — confirmed single-context as of 2026-05-29. If Masi later splits into multiple bounded contexts, add a `CONTEXT-MAP.md` per the `grill-with-docs` convention and re-run setup.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` — e.g. **EA**, **Programme**, **Group**, **Session**, **Assessment Question / Battery / Battery Run**, **Assessment Window**. Don't drift to synonyms the glossary explicitly avoids (e.g. "youth", "course", "subtest", "assessment session", "Tool").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (group reconciliation via versioning) — but worth reopening because…_
