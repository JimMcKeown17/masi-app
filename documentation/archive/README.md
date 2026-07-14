# Archive

Historical documents, retired 2026-07-13 after a full audit of `documentation/`. **Nothing here is
current.** Several files actively contradict the code — that is *why* they are here.

Kept rather than deleted because they are cited by historical plans and reviews, and because a dead
end recorded is worth as much as a success. But do not treat anything in this folder as guidance.

**Before archiving, every open item in these files was verified against the code and lifted into
`documentation/open-work.md`.** If you are looking for outstanding work, read that file, not this
folder.

## What is here and why it was retired

### Actively dangerous — they teach patterns the code now forbids

| File | Why retired |
|---|---|
| `BRANDING.md` | Prescribes `#294A99` (blue) and `#FFDD00` (yellow). `__tests__/colors.test.js` lists **exactly those two hexes** in `FORBIDDEN_VALUES`. Following this doc produces code CI rejects. Superseded by `documentation/design-system.md`. |
| `colour-semantics.md` | Same pre-June-2026 blue palette. Its *rule* (semantic → token, decorative → hex) was correct and has been carried into `design-system.md`. |
| `COMPONENT_TREE.md` | A February 2026 snapshot. Teaches `src/utils/storage.js` (deleted in Sprint 4A) and `synced: false` table scanning, which `AGENTS.md` explicitly bans. Describes 3 providers (there are 6) and the wrong tab bar. |
| `assessment_feature_plan.md` | The original EGRA implementation plan. Shipped — and shipped *past*: it prescribes `storage.js`, `SYNC_TABLES`, and the retired `supabase-migrations/` directory. |

### Superseded — the work landed

| File | Superseded by |
|---|---|
| `assessment_explanation_pwa.md` | Reverse-engineered spec of the **old Firebase PWA's** EGRA feature, used as port source material. The port is complete (PRD Phase 8). |
| `letter_tracker_explanation (1).md` | Same, for the PWA's Letter Progress Tracker. Shipped as Phase 9 (`letter_mastery`, `LetterTrackerScreen`). Its three "known issues to avoid in rebuild" were all honoured. |
| `rls-app-contract-audit-2026-05-25.md` | A point-in-time audit. Replaced by the living `documentation/rls-sync-contract-map.md`. Its last open item (retire `repairGroupOwnershipForSync()`) is now in `open-work.md`. |
| `sync-reliability-build-log.md` | All 12 tasks done, device-passed 2026-06-17, absorbed into `documentation/build-log.md`. Its one unanswered product question (pull-to-refresh force-pushes) is now in `open-work.md`. |
| `mobile-field-reliability-ux-code-review-2026-04-24.md` | All P0/P1/P2 findings closed. Its one survivor — crash reporting was never added — is now in `open-work.md`. |
| `children-classes-groups-ux-logic-review-2026-03-25.md` | Most findings closed by the SQLite cutover. Its four surviving UX gaps are now in `open-work.md`. |
| `field-app-dashboard-plan-review-2026-04-23.md` | Reviews a plan for a **web** PM dashboard whose code lives outside this repo. Every finding is anchored to the legacy schema (`children_groups`, `staff_children`, `synced`), none of which exists. If that dashboard is still wanted it needs re-planning from scratch. |
| `top-10-improvements-2026-06.md` | The June review. Items 1-6, 8, 9a, 9c done. Its three survivors (push notifications/inbox, the motivation-loop specs, `SnackbarContext`) are in `open-work.md` — **the full specs for those remain here**, this file is their only detailed source. |
| `zz-field-lessons-sync-review-2026-07-04.html` | All four P0s closed, plus the render-perf and sync-trust findings. Its four survivors are in `open-work.md`. Still the best written statement of *why* Masi's sync architecture is shaped the way it is — worth reading for rationale. |
| `zazi-izandi-feature-port-prd-2026-go-live.md` | The go-live UX tranche shipped (ring, completion screen, hero stat, tab indicator, section header). Its two survivors (the 2026-cohort seed script; `sessions.group_id` capture) are in `open-work.md`. |
| `masi-catch-up-from-zazi-izandi-2026-05-19.md` | A 15-item "what Masi should adopt from ZZ" review written *before* the SQLite cutover. Superseded on nearly every axis; its centrepiece (the SQLite-vs-AsyncStorage argument) is moot. Its residual items are better specified in `zazi-izandi-feature-port-roadmap.md`, which is **still live**. |

### Belongs to a different repository

| File | Note |
|---|---|
| `zazi-izandi-fork-plan.md` | v1 plan to fork Masi into the standalone **Zazi iZandi app**. Superseded by v2 and executed — that app now lives at `~/Development/zazi-izandi-app`. |
| `zazi-izandi-fork-planv2.md` | v2 fork plan: ZZ mobile fork + a FastAPI service + ZZ website migration. **Phases 2 and 3 contain real unexecuted design, but it belongs to the ZZ repos, not masi-app.** Consider moving it there rather than leaving it archived here. |

### Raw evidence

| Path | Note |
|---|---|
| `android-validation/2026-05-22-plan6-emulator/` | 6.3 MB of emulator screenshots and UI XML dumps from the Plan 6 validation session. Point-in-time evidence; the conclusions are in the build log. |

## Still live — do not look for these here

`open-work.md` · `build-log.md` · `rls-sync-contract-map.md` · `codebase-audit-2026-07-12.md` ·
`design-system.md` · `device-gates-sqlite-backend-2026-07.md` · `improvements-2026-07.md` ·
`improvements-2026-07-roadmap.md` · `zazi-izandi-feature-port-roadmap.md` (Groups Workflow and Session
Reliability are **unbuilt** and this is their only spec) · `wela-plus-battery-prd-2026.md` ·
`open-decisions-backlog.md` · `sprint4-followups-2026-07-13.md` · `LEARNING.md` ·
`DATABASE_SCHEMA_GUIDE.md` (a teaching primer, not a schema reference).
