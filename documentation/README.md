# Documentation Map

**Standing index. Updated 2026-08-27.**

This is the human-facing map. Agents should begin with
[`docs/agent-context/README.md`](../docs/agent-context/README.md), which routes by task and opens
these documents only when their detail is needed.

This directory deliberately separates current contracts from dated evidence. A document's location
now carries meaning:

- Top-level files describe the current product, an active workstream, an operational runbook, or a
  maintained teaching reference.
- `audits/` contains source evidence for the dated 2026-07-12 code audit.
- `learning/` contains focused teaching chapters. Each chapter carries its own status caveat.
- `archive/` contains completed, superseded, schema-dead, or repository-mismatched material.

For status questions, do not infer progress from a plan:

| Question | Source of truth |
|---|---|
| What should the product do? | [`PRD.md`](../PRD.md) |
| What do Masi's domain terms mean? | [`CONTEXT.md`](../CONTEXT.md) |
| What is still outstanding? | [`ROADMAP.md`](./ROADMAP.md) |
| What was built, when, and how was it verified? | [`build-log.md`](./build-log.md) |
| What needs a physical-device check? | [`device-gates-sqlite-backend-2026-07.md`](./device-gates-sqlite-backend-2026-07.md) |
| What product decisions remain unsettled? | [`open-decisions-backlog.md`](./open-decisions-backlog.md) |
| What is the current SQLite, sync, and RLS contract? | [`rls-sync-contract-map.md`](./rls-sync-contract-map.md) |
| What safety properties should Masi share with Zazi and future apps? | [`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md) |
| What are the current visual tokens and rules? | [`design-system.md`](./design-system.md) |

## Current standing references

| File | Role |
|---|---|
| [`LEARNING.md`](./LEARNING.md) | Architectural teaching record and durable engineering lessons |
| [`assessment-score-bands-config.md`](./assessment-score-bands-config.md) | Human-readable score-band contract and content gaps |
| [`auth-session-resilience-2026-04-24.md`](./auth-session-resilience-2026-04-24.md) | Current auth restoration and support-triage runbook |
| [`DATABASE_SCHEMA_GUIDE.md`](./DATABASE_SCHEMA_GUIDE.md) | Relational-modelling primer; its worked schema is historical, not authoritative |
| [`egra_letter_sets.md`](./egra_letter_sets.md) | Human-readable EGRA letter-set reference |
| [`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md) | Maintained cross-app safety, evidence, and package-graduation contract |
| [`sqlite-staging-setup.md`](./sqlite-staging-setup.md) | Current SQLite-backend CLI and environment runbook |
| [`sqlite-refactor-log.md`](./sqlite-refactor-log.md) | Compatibility redirect for historical links; new entries belong in the build log |

## Active workstream and strategic documents

| File | Why it remains active |
|---|---|
| [`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md) | Dated source/evidence baseline, capability matrix, port decisions, and staged modernization strategy |
| [`group-session-workflow.md`](./group-session-workflow.md) | Unbuilt group-centred session and durable-draft product contract |
| [`wela-plus-battery-prd-2026.md`](./wela-plus-battery-prd-2026.md) | WelaPLUS product and architecture contract; implementation remains off `main` |
| [`national-scale-readiness-250k-users-2026-07-15.md`](./national-scale-readiness-250k-users-2026-07-15.md) | Dated but still-useful scale, cost, POPIA, staffing, and target-architecture assessment |

[`zazi-architecture-backend-july-24-consideration.md`](./zazi-architecture-backend-july-24-consideration.md)
is preserved historical design input. Its selective-port argument informed the portfolio audit, but
its Zazi activation/status claims are superseded and it must not be used as a status ledger.

## Archive rule

Before moving a document into [`archive/`](./archive/README.md):

1. Verify its claims against the current tree and current operational state.
2. Move every genuinely unresolved item into `ROADMAP.md`, `open-decisions-backlog.md`, or a
   focused active specification.
3. Add a dated archive note explaining what superseded it.
4. Rebase relative links for the deeper path and run the Markdown link check.

The archive preserves rationale and dead ends. It is never a backlog.
