# SQLite Refactor Log

This log is the durable record for the clean-slate AsyncStorage-to-SQLite refactor.

## Current Phase Checklist

- [ ] Spec signoff
- [ ] Plan 1 - Backend and config guardrails
- [ ] Plan 2 - Foundation and schema
- [ ] Plan 3 - Repositories and storage facade
- [ ] Plan 4 - Sync engine and outbox
- [ ] Plan 5 - Context and screen migration
- [ ] Plan 6 - Cleanup, export, and release gate

## Decision Register

| Date | Decision | Rationale | Revisit Trigger |
| --- | --- | --- | --- |
| 2026-05-20 | Use a clean-slate SQLite cutover instead of migrating local AsyncStorage domain data. | Field users can install a fresh app and restart from the new backend, which removes the riskiest compatibility work. | User decides current field-test device data must be preserved. |
| 2026-05-20 | Split the old monolithic plan into one spec plus six smaller implementation plans. | Zazi's refactor found many late review issues; smaller reviewable plans reduce conflict and make logs more useful. | A plan grows across unrelated ownership boundaries. |
| 2026-05-20 | Keep npm for this refactor. | The repo currently uses npm and package-lock; changing package managers during storage replacement adds avoidable risk. | User explicitly asks for pnpm migration or dependency security work becomes the main task. |
| 2026-05-20 | Separate job titles from programmes. | Job titles are profile/HR labels; programmes are operational dimensions for groups, sessions, assessments, and child work. | A staff member can hold multiple active programme assignments at the same time. |
| 2026-05-20 | Use `child_ea_assignments` and `child_group_memberships` in the clean schema. | The new backend is not constrained by old table names, and the EA wording matches the operational handoff model better than generic staff wording. | Masi decides non-EA staff roles must use the same table name. |
| 2026-05-20 | Migrate `app.json` to `app.config.js` in Plan 1. | Supabase target guardrails need dynamic config; treating this as optional leaves the old EAS `.env` pitfall in place. | Expo config needs to stay static for an EAS constraint we uncover. |
| 2026-05-20 | Auto-enroll newly created children into the actor's current programme. | Child creation should produce a complete working record without requiring a separate programme enrollment step. | EAs are allowed to create children for a programme other than their active assignment. |
| 2026-05-20 | Allow children to have multiple concurrent programme enrollments. | The same child may receive literacy, numeracy, and other support from different EAs; programme belongs to the work relationship, not permanently to the child. | Masi decides a child can belong to only one programme at a time. |
| 2026-05-20 | Scope My Children to the user's active programme. | EAs work one programme at a time, so the working list should show children assigned to the user and enrolled in that current programme. | Product needs a default cross-programme child list. |
| 2026-05-20 | Permit broad cross-programme reads for the same child at RLS level and enforce programme display in repositories. | Trusted field staff may need handover/history visibility, and simpler RLS is easier to debug than programme-isolated policies. | Masi adds less-trusted partner, parent, or external read-only users. |
| 2026-05-20 | Use dual SELECT policies for mobile-created tables. | Assignment/membership SELECT handles normal visibility; `created_by = auth.uid()` preserves upsert visibility before related join rows sync. | Backend no longer uses Supabase upserts from the mobile client. |
| 2026-05-20 | Enforce handover write blocking through active `child_ea_assignments`. | Historical assignees can read prior work, but old EAs should not keep writing child-specific event rows after handover. | Product wants old EAs to keep contributing after handover. |
| 2026-05-20 | Keep `time_entries` self-scoped by `user_id`. | Time tracking belongs to the staff member, not to child assignment state. | Time entries become manager-editable through the mobile app. |
| 2026-05-20 | Use one-shot field cutover with user-managed 1-2 day notice. | The user accepts losing unsynced device data at cutover and prefers a clean simultaneous restart. | Field operations require a rolling or reversible cutover. |
| 2026-05-20 | Keep `AGENTS.md` and `CLAUDE.md` aligned with the clean-slate refactor before implementation starts. | Future agents should not optimize for legacy backwards compatibility or skip the refactor log/TDD discipline after the user locked the clean-slate decision. | The refactor finishes or the user changes the cutover strategy. |

## Bug And Gap Register

| Date | Gap/Bug | Resolution | Reuse Note |
| --- | --- | --- | --- |
| 2026-05-20 | Original plan over-weighted backwards compatibility. | Superseded with clean-slate spec and six smaller plans. | Ask whether field data must be preserved before designing storage migrations. |
| 2026-05-20 | Zazi review findings were present as lessons but not mandatory contracts. | Added transaction, outbox finalization, pull concurrency, PRAGMA, RLS, and real-device validation contracts to the sub-plans. | Every Zazi production trap should become a testable contract. |
| 2026-05-20 | `AGENTS.md` still emphasized backwards-compatible production schema changes without calling out the SQLite refactor exception. | Updated `AGENTS.md` and `CLAUDE.md` to point to the clean-slate spec, TDD skill, npm exception, app.config.js migration, and mandatory refactor log. | Keep agent context files aligned when major project direction changes. |

## Verification Register

| Date | Command/Check | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-20 | `rg -n "clean-slate|sqlite-refactor-log|Test Driven Development|backwards-compatible|app.config.js|TDD skill|/Users/jimmckeown/Development/masi-app/.agents/skills/tdd" AGENTS.md CLAUDE.md` | Passed | Confirmed both agent context files mention the refactor, log, TDD skill, compatibility exception, and `app.config.js` direction. |
| 2026-05-20 | `rg -n "[[:blank:]]$" AGENTS.md CLAUDE.md docs/superpowers/specs/2026-05-20-sqlite-migration-design.md docs/superpowers/plans/2026-05-20-sqlite-*.md documentation/sqlite-refactor-log.md` | Passed | No trailing whitespace in updated docs. |
