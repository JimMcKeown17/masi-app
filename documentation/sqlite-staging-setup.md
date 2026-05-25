# SQLite Supabase Setup

This file records the non-secret setup for the clean-slate SQLite Supabase backend.

## Projects

| Purpose | Supabase Name | Project Ref | URL | Notes |
| --- | --- | --- | --- | --- |
| Current production backend | `masi-app` | `jcqrlwetutnpuchjoyyd` | `https://jcqrlwetutnpuchjoyyd.supabase.co` | Existing AsyncStorage-backed app target. Leave intact during the refactor. |
| SQLite backend | `masi-app-sqlite` | `segygjzpujphwvrubusm` | `https://segygjzpujphwvrubusm.supabase.co` | Clean-slate backend intended to become primary after release validation. |

## Local Environment

Store these values in `.env.local` or `.env`; both files are gitignored.

```bash
SUPABASE_PROJECT_ID_SQLITE=segygjzpujphwvrubusm
SUPABASE_PROJECT_URL_SQLITE=https://segygjzpujphwvrubusm.supabase.co
SUPABASE_DB_PASSWORD_SQLITE=your_db_password
SUPABASE_PUBLISHABLE_KEY_SQLITE=your_publishable_or_anon_key
```

Do not store service-role keys in this file.

Do not shell-source `.env.local` in scripts. Generated database passwords can contain shell metacharacters, so scripts must parse dotenv-style files as data.

## CLI Link

The local checkout is linked to the SQLite backend for Plan 1:

```bash
supabase link --project-ref segygjzpujphwvrubusm --password ...
```

`supabase/.temp/` is gitignored and contains the local link metadata.

## Helper Commands

Use the package scripts so SQLite staging commands always load the same env names and redact secrets in output:

```bash
npm run test:integration
npm run test:release
npm run sqlite:staging:check
npm run sqlite:staging:link
npm run sqlite:staging:migrations
npm run sqlite:staging:dry-run
npm run sqlite:staging:push
npm run sqlite:staging:advisors
npm run sqlite:staging:start
npm run sqlite:staging:ios
npm run sqlite:staging:android
```

`sqlite:staging:push` is non-interactive and passes `--yes` to the Supabase CLI.

`test:release` runs the full Jest suite, a focused SQLite integration suite under a separate file-backed better-sqlite setup, and `sqlite:staging:check`. Run it before promoting a SQLite build to testers.

## SQLite Migration History

The SQLite backend has these migrations applied locally and remotely:

- `20260521115412_masi_clean_base_schema.sql`
- `20260521115416_masi_clean_rls_policies.sql`
- `20260521115421_masi_seed_reference_data.sql`
- `20260521120147_masi_rls_advisor_cleanup.sql`
- `20260521135520_masi_staff_programme_assignment_uniqueness.sql`
- `20260521140331_masi_rls_review_fixes.sql`
- `20260521142324_masi_assignment_attendee_fixes.sql`
- `20260521143346_masi_assignment_insert_recursion_fix.sql`
- `20260521144901_masi_zazi_alignment_schema.sql`
- `20260521153217_masi_child_delete_guard.sql`
- `20260522103000_masi_session_upsert_visibility.sql`

`npm run sqlite:staging:advisors` is expected to report only:

- `multiple_permissive_policies` warnings for `children`, `classes`, and `groups`. Those warnings are intentional: each table has one assignment/programme SELECT policy plus one `created_by = auth.uid()` fallback policy so mobile upserts remain visible before related join rows sync.
- `auth_leaked_password_protection` until the hosted project plan/settings allow leaked-password protection to be enabled in Supabase Auth settings. Supabase documents leaked-password protection under Auth password security and notes that it is available on Pro Plan and above.

## Promotion Status

`masi-app-sqlite` remains the clean-slate backend intended to become primary after Plan 6 validation. Do not repoint field users until:

- `npm run test:release` passes. Status: passed on 2026-05-22.
- `npm run sqlite:staging:migrations`, `dry-run`, and `advisors` show no unexpected issues. Status: migrations and dry run passed; advisors have only recorded known warnings.
- Internal Android validation has covered offline writes, restart with pending outbox, sync, and support export. Status: emulator core path passed on 2026-05-22; corrected preview APK build `07d1c674-b06e-4d03-a611-4bf17c182a7b` launches to sign-in; physical-device sign-in/clock-in/offline-write validation remains pending.
- The cutover communication gate is logged in `documentation/sqlite-refactor-log.md`. Status: pending, user-owned.
