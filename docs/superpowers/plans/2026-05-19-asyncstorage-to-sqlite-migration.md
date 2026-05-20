# AsyncStorage To SQLite Migration Plan

> **Status:** Superseded on 2026-05-20.

This file is intentionally retained only as a pointer. Do not execute the old 2026-05-19 monolithic plan.

The active clean-slate SQLite migration docs are:

- `docs/superpowers/specs/2026-05-20-sqlite-migration-design.md`
- `docs/superpowers/plans/2026-05-20-sqlite-1-backend-and-config-guardrails.md`
- `docs/superpowers/plans/2026-05-20-sqlite-2-foundation-and-schema.md`
- `docs/superpowers/plans/2026-05-20-sqlite-3-repositories-and-storage-facade.md`
- `docs/superpowers/plans/2026-05-20-sqlite-4-sync-engine-outbox.md`
- `docs/superpowers/plans/2026-05-20-sqlite-5-context-and-screen-migration.md`
- `docs/superpowers/plans/2026-05-20-sqlite-6-cleanup-export-and-release-gate.md`
- `documentation/sqlite-refactor-log.md`

Reason for replacement:

- the user confirmed a clean-slate cutover is acceptable
- field users can install a fresh app and start from the new backend
- no local AsyncStorage domain migration is required
- no current Supabase backend compatibility release is required
- the work is now split into smaller reviewable plans with a shared log
