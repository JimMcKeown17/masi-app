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

The `query` action (in `scripts/sqlite-staging.cjs`) reads `.env` then `.env.local`, validates the SQLite project ID/URL, and maps only the staging values into its command environment. It uses `--linked`, so verify the checkout's link as well as the printed target before operational work. It never sources the files or injects their unrelated values, legacy connection settings, or file-stored access tokens.

For every Supabase action (`link`, migrations, dry run, push, advisors, query), the helper creates a fresh directory under `os.tmpdir()` containing exactly one entry: a symlink named `supabase` to the invoking checkout's `supabase/` directory. The CLI runs with that temporary cwd, so it cannot auto-load the checkout-root `.env.local`. No env files are copied or created there. Cleanup runs in `finally`, including when spawn fails, and removes the temporary directory and symlink without deleting anything in the checkout's `supabase/` directory.

The CLI child inherits only `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `TERM`, `LANG`, `LC_ALL`, `LC_CTYPE`, the uppercase/lowercase HTTP/HTTPS/NO proxy variables, and `CI` when present, plus a nonempty `SUPABASE_ACCESS_TOKEN`. The helper then adds the validated `SUPABASE_DB_PASSWORD` and `EXPO_PUBLIC_*` staging mappings. All other inherited variables are dropped, including `SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `SUPABASE_URL`, API/secret keys, `SUPABASE_ENV`, and `SUPABASE_WORKDIR`. Expo actions keep their invoking cwd, inherited environment, and Android SDK setup.

Before CLI launch the safe summary includes these fixed, value-free lines:

```text
cli_cwd=isolated (symlink supabase -> <repo>/supabase; no env files)
cli_env=allowlist (inherited SUPABASE_* dropped except SUPABASE_ACCESS_TOKEN)
```

The parser accepts dotenv `KEY=value` and `KEY: value`, optional `export`, whitespace, comments, quoted/multiline values, embedded equals signs, and CRLF. Quotes preserve literal `#` characters; unquoted `#` starts a comment. There is no shell execution or variable expansion. Malformed records fail before a subprocess with the filename, line number, and key (or preceding assignment when a line has no key), without showing values.

The 2026-09-04 investigation found that the installed Supabase CLI, rather than the helper, emitted `LegacyDbConfigLoadError`: the old helper silently skipped unsupported lines. In the parent checkout's `.env.local`, `EXPO_PUBLIC_SENTRY_DSN` at line 70 used valid colon syntax, followed by malformed indented bullets at lines 71–73. The first CLI parser rejection was line 71. Those malformed lines accidentally prevented the legacy retargeting described below; repairing the file alone was not a safe resolution. With the helper's cwd and environment isolation in place, correct or comment such prose with `#`; do not bypass the parser, silently ignore it, or print the file to diagnose it. The parser still reports malformed input before CLI launch. Other CLI config-loading errors remain separate from this dotenv diagnostic.

## Auth gotchas behind a `401 Unauthorized` from `db query`/`projects list`

Before **every Supabase CLI launch** (`link`, migrations, dry run, push, advisors, query), the helper prints one of:

- `auth_path=environment-token`: a nonempty inherited `SUPABASE_ACCESS_TOKEN` is in effect and overrides stored login. The preflight reports the source only; it does not validate freshness or print the token, a fragment, or its length.
- `auth_path=keychain`: no nonempty inherited token; the CLI will use its stored login. An empty inherited token is removed from the child environment. This label is not proof that credentials are available: the CLI can use native credential storage or its own fallback file. See the [Supabase CLI login reference](https://supabase.com/docs/reference/cli/supabase-login).

An unsuccessful CLI result containing `Unauthorized` or `401` now fails with explicit recovery instructions, whether the diagnostic arrives on stdout, stderr, or a process error. The helper does not retry, refresh credentials, launch login, or change the parent shell's environment. Auth error details are replaced with the safe recovery message; other CLI output is buffered until exit and known credentials are redacted. Successful query rows containing the words `Unauthorized` or `401` remain ordinary output. Expo launchers keep their interactive streams.

- A **stale environment token** (often exported from a shell profile) overrides stored login. Use `unset SUPABASE_ACCESS_TOKEN` (or `env -u SUPABASE_ACCESS_TOKEN <cmd>`) to choose stored auth, or refresh the variable with a valid personal access token through your normal secure process. Running `supabase login` while the stale override remains can also return Unauthorized; unset it first.
- A **non-interactive shell** (e.g. an agent shell or CI without a token) may not have access to the stored login. Unsetting a stale token alone does not establish authentication. In an interactive terminal **outside the repository root**, unset the variable and run `supabase login`; then return to the checkout and run the helper in that same terminal. For non-interactive operation, provide a refreshed `SUPABASE_ACCESS_TOKEN` securely.
- Treat a Management API `401` as an access-token/login issue. PostgreSQL password or connection errors are separate; do not rotate the database password to repair a stale CLI token. Never paste credentials into output, command arguments, or documentation.

## Non-interactive fallback (verified 2026-07-12)

Direct psql with the DB password from `.env.local`, bypassing CLI auth entirely. Read-only probes only:

```
PGPASSWORD=<SUPABASE_DB_PASSWORD_SQLITE> /opt/homebrew/opt/libpq/bin/psql -h db.segygjzpujphwvrubusm.supabase.co -U postgres -d postgres
```

Never paste the password into output or docs. This is a direct `psql` connection with an explicit SQLite host; it does not invoke the Supabase CLI or establish CLI authentication. If switching back to CLI operations, use the isolated helper. Do not run raw CLI commands from the repository root as a fallback.

## Trap: CLI dotenv auto-loading and project overrides

The supplied 2026-09-04 orchestrator probes established two independent input paths in Supabase CLI 2.109.1 (Bun front end plus Go core): the CLI auto-loads `.env.local` from its working directory, including file-only access tokens, and an inherited `SUPABASE_PROJECT_ID` overrides the project selected by `--linked`. `SUPABASE_PROJECT_REF` and `SUPABASE_DB_URL` did not override in those probes, but the helper excludes them too. `--workdir` pointing at the repository still encountered its `.env.local`; it is not isolation.

The orchestrator identified the legacy `SUPABASE_PROJECT_ID` in the repository `.env.local` at line 24. A parseable file could therefore silently send a migration command to the legacy production database while the old helper printed the SQLite project ref. **Raw `supabase` commands must never be run from the repository root while `.env.local` defines `SUPABASE_PROJECT_ID`.** Do not source/inject the file either. `--linked` and a printed target alone do not prevent retargeting: use the helper, which isolates both the CLI cwd and inherited environment. The probes used deliberately bogus credentials and were not repeated during implementation.
