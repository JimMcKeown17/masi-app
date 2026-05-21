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

## Plan 1 Migration History

The SQLite backend has these Plan 1 migrations applied locally and remotely:

- `20260521115412_masi_clean_base_schema.sql`
- `20260521115416_masi_clean_rls_policies.sql`
- `20260521115421_masi_seed_reference_data.sql`
- `20260521120147_masi_rls_advisor_cleanup.sql`
- `20260521135520_masi_staff_programme_assignment_uniqueness.sql`
- `20260521140331_masi_rls_review_fixes.sql`
- `20260521142324_masi_assignment_attendee_fixes.sql`
- `20260521143346_masi_assignment_insert_recursion_fix.sql`

`npm run sqlite:staging:advisors` is expected to report only `multiple_permissive_policies` warnings for `children`, `classes`, and `groups`. Those warnings are intentional: each table has one assignment/programme SELECT policy plus one `created_by = auth.uid()` fallback policy so mobile upserts remain visible before related join rows sync.
