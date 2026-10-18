# EA access suspension and restoration

Built 2026-10-17. Hosted migration apply and device proof are still open. This runbook implements
Jim's decision to use Zazi's Auth-ban mechanism with an operator script before building a Head
Office website. The [ROADMAP §0](./ROADMAP.md) owns the remaining gates; the
[contract map](./rls-sync-contract-map.md#ea-access-suspension--built-hosted-apply-and-device-proof-pending)
describes the SQL and grants.

## Before first use

Run `npm run verify:ea-access:postgres` against a disposable local PostgreSQL instance with the
same `HISTORY_RLS_ADMIN_DATABASE_URL`, `HISTORY_RLS_DATABASE_NAME`, and
`HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE` setup as the existing history
harness. The name must start with `masi_history_rls_`; this harness appends `_ea_access`, replays
canonical migrations, checks behavior and grants, then drops that database. It refuses hosted
targets. Codex's sandbox could not connect to localhost, so the SQL cases still need a controller
run. Inspect the hosted Auth/profile schema before applying the migration.

**Hosted apply requires Jim's explicit yes.** Apply
`supabase/migrations/20261018120000_ea_access_suspension.sql` through the isolated
[`sqlite-staging-sql` workflow](../.claude/skills/sqlite-staging-sql/SKILL.md), and read back its
functions, table, RLS, and grants. Do not use ad-hoc DDL or the legacy Supabase project.

Run the commands below from this checkout with Node 20. The only supported target is
`masi-app-sqlite` (`segygjzpujphwvrubusm`). Install `psql` on PATH or at
`/opt/homebrew/opt/libpq/bin/psql`. The script uses the IPv4 session pooler on port 5432, database
`postgres`, user `postgres.segygjzpujphwvrubusm`, and `sslmode=require`. The host defaults to
`aws-1-eu-west-2.pooler.supabase.com`; `MASI_DB_POOLER_HOST` can select another Supabase pooler host.
The project/user stay fixed, and a resolved legacy ref is refused.

Put `SUPABASE_DB_PASSWORD_SQLITE` in the checkout's `.env.local` using the existing environment
setup. The script parses that file as data with `sqlite-staging.cjs`; it never sources it. It takes
no password from command-line arguments or inherited environment, and passes the parsed password
only through the child process's `PGPASSWORD`. Connection-routing environment overrides are
discarded. Never paste credentials into an operator command or incident note. Output includes
the target email and audit reason/operator, so keep it in authorized operational records.

## Status, dry run, and apply

Replace the example address and operator with the reviewed target and your name. Email matching
is exact and case-insensitive; missing or ambiguous matches are refused.

```sh
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run ea:status -- --email ea@example.test

PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run ea:suspend -- --email ea@example.test --reason "Access review" --operator "Operator name"
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run ea:suspend -- --email ea@example.test --reason "Access review" --operator "Operator name" --apply

PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run ea:restore -- --email ea@example.test --reason "Access review resolved" --operator "Operator name"
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run ea:restore -- --email ea@example.test --reason "Access review resolved" --operator "Operator name" --apply
```

Without `--apply`, the command only reads: it prints the project, target UUID/email, ban,
`is_active`, latest event, and proposed change, then exits successfully. A reason (1–1000
characters) and operator (1–200) are required for both dry-run and applied mutations. The dry-run
preview can become stale; the applied function rechecks and locks the target before changing it.

An applied suspend atomically bans for 876000 hours, deactivates an active profile, and inserts
an audit event. The script rereads by UUID and reports `confirmed: true` only when its audit event
is still latest, `banned_until` is over 24 hours in the future, and `is_active` is false. A repeated
suspend records another event and preserves the original restoration baseline.

Restore requires the latest audit event to be a suspend (`restore_not_available` otherwise).
It clears the ban and reactivates only if the **first suspend in the current uninterrupted run**
recorded an active profile. Thus active → suspend → suspend → restore ends active, while initially
inactive → suspend → suspend → restore stays inactive. Each event still records that call's
actual before/after values. A prior restore starts a new run. An account banned elsewhere without
an outstanding script suspension cannot be restored by this script. Coordinate with anyone using
other Auth-admin tooling: an external change made during a script suspension is outside this
audit history and is not distinguished by the latest-event rule.

The event, reread state, and confirmation are printed after apply. A failed command exits nonzero.
If the response or read-back fails, the transaction might already have committed: run `ea:status`
and inspect the latest event before another action. Do not infer rollback from a connection error.
Reasons/operators are supplied as quoted psql variables, not interpolated SQL. The private audit
table has no API-role grants; only the three functions are executable by service_role for a future
Head Office server. The current script runs as postgres.

## What the phone experiences

The Auth ban prevents sign-in and token refresh. It does not invalidate an already-issued access
token immediately; the residual server-access window lasts until that token expires. Jim accepts
the one-hour window used by Zazi. Verify the hosted JWT lifetime before pilot use; this task did
not read it. Supabase documents the distinction between session termination and remaining JWT
validity in its [session guidance](https://supabase.com/docs/guides/auth/sessions).

`users.is_active` is an operational flag: the app and RLS do not enforce it. Suspension does not
end assignments, remove worked hours, delete history, or erase the phone's per-EA SQLite file.
Unsent work is kept and can upload after restoration and sign-in. An offline phone cannot learn
about a server ban until it reconnects. Do not clear app storage or uninstall as part of suspension.

After the hosted apply, prove on the pilot build that a suspended, already-signed-in phone signs
out at its next refresh, cannot sign in while banned, and keeps unsent work. Restore it, sign in
again, and verify the retained work uploads. Record hosted settings and device results in the
Verification Register; unit and disposable-database checks do not prove this behavior.
