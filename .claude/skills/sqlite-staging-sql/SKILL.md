---
name: sqlite-staging-sql
description: Run ad-hoc SQL against the masi-app-sqlite Supabase backend (segygjzpujphwvrubusm) for read-only preflights, verification queries, and disposable-data cleanup. Use when querying the SQLite staging backend, debugging a 401 from supabase db query, or needing the non-interactive psql fallback. NOT for DDL - schema changes go through supabase/migrations/.
---

# Ad-hoc SQL against masi-app-sqlite

Scope: read-only preflights, verification queries, disposable-data cleanup. NOT DDL — schema changes go through canonical migrations under `supabase/migrations/`.

Always verify the target before any write: the command summary prints `project_ref=` — confirm `segygjzpujphwvrubusm` (sqlite), not `jcqrlwetutnpuchjoyyd` (legacy).

## The helper (preferred)

```
npm run sqlite:staging:query -- "select count(*) from letter_mastery;"
# or:  node scripts/sqlite-staging.cjs query "delete from letter_mastery;"
```

The `query` action (in `scripts/sqlite-staging.cjs`) reads the DB password from `.env`/`.env.local` and builds a clean command env that only ever targets `masi-app-sqlite` via `--linked`. It needs the CLI to be logged in (`supabase login`).

## Auth gotchas behind a `401 Unauthorized` from `db query`/`projects list`

It's the access token, not the DB password:

- A **stale `SUPABASE_ACCESS_TOKEN` env var** (often exported from a shell profile) **silently overrides `supabase login`** — the CLI trusts the env var first, so a fresh login "doesn't take." Fix: `unset SUPABASE_ACCESS_TOKEN` (or `env -u SUPABASE_ACCESS_TOKEN <cmd>`), then re-run.
- A **non-interactive shell** (e.g. an agent's Bash, CI without a token) often **can't reach the keychain** where `supabase login` stores the token, so it 401s even when your own terminal works. Run `db query`/cleanup in the **same interactive terminal where you logged in**.

## Non-interactive fallback (verified 2026-07-12)

Direct psql with the DB password from `.env.local`, bypassing CLI auth entirely. Read-only probes only:

```
PGPASSWORD=<SUPABASE_DB_PASSWORD_SQLITE> /opt/homebrew/opt/libpq/bin/psql -h db.segygjzpujphwvrubusm.supabase.co -U postgres -d postgres
```

Never paste the password into output or docs.

## Trap: `.env.local` injection

Running the `supabase` CLI with `.env.local` injected into its environment (e.g. a `dotenv` wrapper) can make the CLI pick up the legacy connection and silently query the wrong backend even with `--linked`. Don't inject `.env.local` into `supabase` commands — use `--linked` (or the `sqlite:staging:query` helper, which does this correctly).
