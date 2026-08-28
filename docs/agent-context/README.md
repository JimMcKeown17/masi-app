# Agent Context Index

Use this directory for progressive disclosure. Start with the smallest context set that can answer
the task, then open deeper sources only when the task crosses that boundary.

## Start here

For every non-trivial task:

1. Read `AGENTS.md`.
2. Read `CONTEXT.md` before changing domain language, UX meaning, schema, authorization, or
   reporting semantics.
3. Pick the task row below. Do not read the entire documentation tree by default.
4. Verify important claims against current code, migrations, tests, and live external state where
   relevant. Documentation is routing and intent; current implementation wins when they disagree.

## Task router

| Task | Read first | Add only when needed |
|---|---|---|
| What should we work on next? | `documentation/ROADMAP.md` | `documentation/build-log.md` for closure evidence; GitHub issues for execution-ready tickets |
| Product or feature behavior | `PRD.md`, `CONTEXT.md` | the focused active spec named by the roadmap |
| UI, navigation, or visual change | `documentation/design-system.md`, relevant PRD section | device gates, current screen/component tests, design artifact named by the task |
| SQLite repository or migration | `src/db/migrations.js`, relevant repositories | `documentation/rls-sync-contract-map.md` when data syncs |
| Supabase, RLS, payload, outbox, or pull/reconcile | `documentation/rls-sync-contract-map.md` | canonical `supabase/migrations/`, live schema/probes, `documentation/sqlite-staging-setup.md` |
| Device/release acceptance | `documentation/device-gates-sqlite-backend-2026-07.md` | `DEPLOYMENT.md`, latest build-log entries |
| Auth cold start or sign-out | `documentation/auth-session-resilience-2026-04-24.md` | AuthContext, persisted-session service, support logs |
| Assessment score meaning/content | `CONTEXT.md`, `documentation/assessment-score-bands-config.md` | `documentation/egra_letter_sets.md`, pedagogy decisions |
| WelaPLUS | [`wela-assessment-component-build.md`](./wela-assessment-component-build.md) | Wela PRD, assessment-battery learning chapter, relevant ADRs |
| Group-centred sessions | `documentation/group-session-workflow.md` | contract map, CONTEXT, open decisions, relevant ADRs |
| Masi/Zazi comparison or shared field-app infrastructure | `documentation/field-app-capability-ledger.md`, `documentation/field-app-portfolio-invariants.md`, `documentation/masi-zazi-portfolio-audit-2026-08-27.md` | current app contract maps, source, tests, live probes, and relevant ADRs |
| Pre-live estate, history hydration, or history authorization | `CONTEXT.md`, `documentation/pre-live-gate0-audit-2026-08-27.md`, `documentation/rls-sync-contract-map.md`, `docs/adr/0005-assessment-delivery-scope-two-tier-access.md` | `documentation/field-app-capability-ledger.md`, canonical migrations, live authenticated probes, release/device gates |
| Documentation cleanup or status reconciliation | [`documentation-system.md`](./documentation-system.md) | `documentation/README.md`, archive index, build log |
| National scale or government readiness | `documentation/national-scale-readiness-250k-users-2026-07-15.md` | roadmap sections for still-open execution work |

## Current focused briefings

- [`documentation-system.md`](./documentation-system.md): documentation roles, update rules, and
  archive workflow.
- [`wela-assessment-component-build.md`](./wela-assessment-component-build.md): WelaPLUS branch,
  product, schema, package, and resumption context.

Add a new briefing when a workstream spans several source documents or has a non-obvious safe
resumption point. Remove or archive a briefing when the workstream becomes ordinary product
maintenance and the standing docs are sufficient.
