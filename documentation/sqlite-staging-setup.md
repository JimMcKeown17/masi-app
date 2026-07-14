# SQLite Supabase Setup

**Standing doc.** Backend identity, env wiring, and helper commands for the SQLite Supabase backend.

> For *running ad-hoc SQL* against this backend (the `query` helper, the 401 auth gotcha, the
> non-interactive psql fallback), use the `sqlite-staging-sql` skill (`.claude/skills/sqlite-staging-sql/`).
> This file covers **what the backend is and how it is wired**; the skill covers **how to query it**.

## Projects

| Purpose | Supabase Name | Project Ref | URL | Notes |
| --- | --- | --- | --- | --- |
| Current forward backend | `masi-app-sqlite` | `segygjzpujphwvrubusm` | `https://segygjzpujphwvrubusm.supabase.co` | SQLite backend for new app work and preview builds. |
| Legacy pre-SQLite backend | `masi-app` | `jcqrlwetutnpuchjoyyd` | `https://jcqrlwetutnpuchjoyyd.supabase.co` | Existing AsyncStorage-backed app target. Leave intact for legacy reference unless the user explicitly asks for old-backend maintenance. |

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

The local checkout is linked to the SQLite backend:

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
npm run sqlite:staging:query      # ad-hoc SQL — see the sqlite-staging-sql skill
npm run sqlite:staging:migrations
npm run sqlite:staging:dry-run
npm run sqlite:staging:push
npm run sqlite:staging:advisors
npm run sqlite:staging:start
npm run sqlite:staging:ios
npm run sqlite:staging:android
```

Never inject `.env.local` into a `supabase` CLI command: it can silently retarget the legacy backend
even with `--linked`. Every helper prints `project_ref=` in its summary — confirm
`segygjzpujphwvrubusm` (SQLite), not `jcqrlwetutnpuchjoyyd` (legacy), before any write.

`sqlite:staging:push` is non-interactive and passes `--yes` to the Supabase CLI.

`test:release` runs the full Jest suite, a focused SQLite integration suite under a separate file-backed better-sqlite setup, and `sqlite:staging:check`. Run it before promoting a SQLite build to testers.

## SQLite Migration History

Canonical migrations live in `supabase/migrations/` on disk. **That directory is the inventory** —
this file used to duplicate it as a hand-maintained list, which drifted (the list said 14 while disk
had 18). Run `ls supabase/migrations/` or `npm run sqlite:staging:migrations` instead.

## Advisor Expectations

`npm run sqlite:staging:advisors` is expected to report only:

- `multiple_permissive_policies` warnings for `children`, `classes`, and `groups`. Those warnings are intentional: each table has one assignment/programme SELECT policy plus one `created_by = auth.uid()` fallback policy so mobile upserts remain visible before related join rows sync.
- `auth_leaked_password_protection` until the hosted project plan/settings allow leaked-password protection to be enabled in Supabase Auth settings. Supabase documents leaked-password protection under Auth password security and notes that it is available on Pro Plan and above.

## Status

`masi-app-sqlite` is the forward backend. All new feature and UI work targets it unless the user
explicitly asks for legacy-backend maintenance.

**Dated verification results are not recorded here.** A frozen "as of 2026-05-26, 56 suites / 296
tests" snapshot used to live in this file and went stale immediately. The live record of suite counts,
device passes, and release gates is `documentation/build-log.md` (Verification Register); what remains
open is `documentation/codebase-audit-2026-07-12.md` and
`documentation/device-gates-sqlite-backend-2026-07.md`.
