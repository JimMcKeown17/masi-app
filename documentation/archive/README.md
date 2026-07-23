# Documentation Archive

Historical documents retained for rationale, provenance, and dead ends. **Nothing in this directory
is current guidance or a live backlog.**

Before a file enters this archive, its remaining work must be moved to
[`ROADMAP.md`](../ROADMAP.md), [`open-decisions-backlog.md`](../open-decisions-backlog.md), or a
focused active specification. See the human-facing
[`documentation map`](../README.md) and the agent
[`documentation-system briefing`](../../docs/agent-context/documentation-system.md).

## Archived on 2026-07-23

| File | Why it was retired | Current source |
|---|---|---|
| [`bulk_import_children_plan.md`](./bulk_import_children_plan.md) | Unimplemented plan for retired `staff_children`, `children_groups`, legacy child text columns, random IDs, and synced flags | ROADMAP section 6 |
| [`seed_data_plan.md`](./seed_data_plan.md) | Unimplemented pre-SQLite seed plan using obsolete ad-hoc SQL and schema | ROADMAP section 6 |
| [`codebase-audit-2026-07-12.md`](./codebase-audit-2026-07-12.md) | Dated 21-finding audit; 19 closed and two survivors consolidated | ROADMAP sections 2 and 3 |
| [`improvements-2026-07.md`](./improvements-2026-07.md) | Ranked July review whose shipped work and survivors have separate owners | Build log and ROADMAP |
| [`improvements-2026-07-roadmap.md`](./improvements-2026-07-roadmap.md) | Phases 1-5 and most of Phase 6 shipped | Build log and ROADMAP |
| [`sprint4-followups-2026-07-13.md`](./sprint4-followups-2026-07-13.md) | Reconcile RPC completed; remaining Head Office rules consolidated | ROADMAP section 4 |
| [`wela-plus-battery-prd-2026-review.md`](./wela-plus-battery-prd-2026-review.md) | All 18 findings incorporated into the active WelaPLUS PRD | [`wela-plus-battery-prd-2026.md`](../wela-plus-battery-prd-2026.md) |
| [`zazi-izandi-feature-port-roadmap.md`](./zazi-izandi-feature-port-roadmap.md) | Most ports shipped or were superseded; group/session survivors extracted | [`group-session-workflow.md`](../group-session-workflow.md) |

## Dangerous retired guidance

| File | Why following it is unsafe |
|---|---|
| [`BRANDING.md`](./BRANDING.md) | Prescribes retired blue/yellow values that the colour guard forbids |
| [`colour-semantics.md`](./colour-semantics.md) | Uses the retired palette; its valid semantic-token rule moved to the design system |
| [`COMPONENT_TREE.md`](./COMPONENT_TREE.md) | Describes deleted `storage.js`, table scanning, old providers, and old navigation |
| [`assessment_feature_plan.md`](./assessment_feature_plan.md) | Shipped EGRA plan built around retired storage and migration paths |

## Completed or superseded work

| File | Current source or outcome |
|---|---|
| [`assessment_explanation_pwa.md`](./assessment_explanation_pwa.md) | Source material for the completed EGRA port |
| [`letter-tracker-explanation.md`](./letter-tracker-explanation.md) | Source material for the completed Letter Tracker port |
| [`rls-app-contract-audit-2026-05-25.md`](./rls-app-contract-audit-2026-05-25.md) | Replaced by the live RLS/sync contract map |
| [`sync-reliability-build-log.md`](./sync-reliability-build-log.md) | Twelve completed tasks absorbed into the master build log |
| [`mobile-field-reliability-ux-code-review-2026-04-24.md`](./mobile-field-reliability-ux-code-review-2026-04-24.md) | Findings closed or consolidated in ROADMAP |
| [`children-classes-groups-ux-logic-review-2026-03-25.md`](./children-classes-groups-ux-logic-review-2026-03-25.md) | Findings closed or consolidated in ROADMAP |
| [`field-app-dashboard-plan-review-2026-04-23.md`](./field-app-dashboard-plan-review-2026-04-23.md) | Review of an external web plan tied to the retired schema |
| [`top-10-improvements-2026-06.md`](./top-10-improvements-2026-06.md) | June tranche shipped; survivors consolidated in ROADMAP |
| [`zz-field-lessons-sync-review-2026-07-04.html`](./zz-field-lessons-sync-review-2026-07-04.html) | Sync rationale evidence; survivors consolidated in ROADMAP |
| [`zazi-izandi-feature-port-prd-2026-go-live.md`](./zazi-izandi-feature-port-prd-2026-go-live.md) | Go-live UX tranche shipped |
| [`masi-catch-up-from-zazi-izandi-2026-05-19.md`](./masi-catch-up-from-zazi-izandi-2026-05-19.md) | Pre-SQLite comparison superseded by shipped work and the focused group/session spec |

## Different-repository history

| File | Note |
|---|---|
| [`zazi-izandi-fork-plan.md`](./zazi-izandi-fork-plan.md) | Original fork plan for the separate Zazi iZandi app |
| [`zazi-izandi-fork-planv2.md`](./zazi-izandi-fork-planv2.md) | Executed mobile fork plus unexecuted design that belongs to Zazi repositories |

## Raw evidence

`android-validation/2026-05-22-plan6-emulator/` contains point-in-time emulator screenshots and UI
XML. Conclusions belong in the build log; the raw files are retained only as evidence.
