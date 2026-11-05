# EA access suspension and restoration

Built 2026-10-17; migration applied to `masi-app-sqlite` and device-proven on 2026-10-18. This runbook implements
Jim's decision to use Zazi's Auth-ban mechanism with an operator script before building a Head
Office website. The [ROADMAP §0](./ROADMAP.md) owns the remaining gates; the
[contract map](./rls-sync-contract-map.md#ea-access-suspension--applied-to-hosted-device-proven)
describes the SQL and grants. Handing over, ending and reopening an EA's children, classes and
groups is in [Head Office lifecycle changes](#head-office-lifecycle-changes-handover-end-delivery-reopen)
below.

## Before first use

Run `npm run verify:ea-access:postgres` against a disposable local PostgreSQL instance with the
same `HISTORY_RLS_ADMIN_DATABASE_URL`, `HISTORY_RLS_DATABASE_NAME`, and
`HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE` setup as the existing history
harness. The name must start with `masi_history_rls_`; this harness appends `_ea_access`, replays
canonical migrations, checks behavior and grants, then drops that database. It refuses hosted
targets. CI runs it on every pull request.

The migration was applied on 2026-10-18 with Jim's explicit yes. For a fresh project, hosted apply
again requires Jim's explicit yes. Apply
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
the one-hour window used by Zazi. The hosted access-token lifetime was measured at 3600 s on
2026-10-18; recheck it if Auth settings change. Supabase documents the distinction between session termination and remaining JWT
validity in its [session guidance](https://supabase.com/docs/guides/auth/sessions).

`users.is_active` is an operational flag: the app and RLS do not enforce it. Suspension does not
end assignments, remove worked hours, delete history, or erase the phone's per-EA SQLite file.
Unsent work is kept and can upload after restoration and sign-in. An offline phone cannot learn
about a server ban until it reconnects. Do not clear app storage or uninstall as part of suspension.

Proven on Android build 14 on 2026-10-18 (Verification Register): a suspended, signed-in phone
signed out at its first refresh after real token expiry, could not sign in while banned, kept an
offline clock-in, and uploaded it after restore and sign-in. Before a token expires, a suspended
phone that reconnects can still upload with it; that is the accepted residual window. When testing,
let the token really expire: moving the phone's clock forward makes it look expired to the phone
only, so the server still accepts uploads. Repeat this proof on the pilot build if auth or sync
changes.

## Head Office lifecycle changes: handover, end delivery, reopen

Built 2026-11-05 for the November 2026 retest (lifecycle-safety plan step H1,
[plan](../docs/superpowers/plans/2026-11-04-lifecycle-safety.md); ADR-0014). Every Head Office
change to who teaches a child, class or group goes through `scripts/ho-lifecycle.cjs`. It uses the
same fixed `masi-app-sqlite` target, `.env.local` password handling, `psql` setup and exact,
case-insensitive email match as the EA access commands above. So far it has run only on disposable
PostgreSQL with the current migrations (`npm run verify:ho-lifecycle:postgres`, also in CI). The
first `--apply` against `masi-app-sqlite` needs Jim's go-ahead.

### Rules

- **End or reopen rows only with this script.** Never edit `unassigned_at`, `handover_reason` or
  `row_version` by hand, and never bump `row_version` when you end a row.
- **Never DELETE** children, classes, groups, Auth users or `public.users` rows. Deleting a login
  deletes that EA's sessions, assessments and ticks (MA-BUG-20261104-008).
- **Off-boarding is suspend only**, in this order:
  1. the EA taps Profile → Support tools → Send diagnostics;
  2. support checks the receipt shows 0 waiting, and that every needs-attention item has its own
     receipt on the server (`npm run bugs:incidents`);
  3. `npm run ea:suspend` (above);
  4. hand the EA's children, classes and groups over with this script.
- **Until the server fix (plan step R1) is live and the EA's phone has the app update**, the EA's
  phone must upload everything before any change (interim rule 1 in
  [`lifecycle-interim-field-rules.md`](./lifecycle-interim-field-rules.md)).
- **No reopen, and no handover back to a former holder,** for an EA whose receipts show a refused
  archive or restore, until that phone has the app update (plan step O1; interim rule 2). Their
  phone would send the old archive again and end the row again.

### Commands

Run from this checkout with Node 20 (`PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`). Every
command needs `--reason` (1–1000 characters) and `--operator` (1–200). Without `--apply` it only
reads and prints the plan. Child, class and group ids are UUIDs: copy them from the dashboard or a
read-only query; the plan prints each one's name so you can check it.

```sh
npm run ho:handover -- child --from old@example.test --to new@example.test --children <child-id>[,<child-id>...] --reason "EA left the school" --operator "Your name"
npm run ho:handover -- class --from old@example.test --to new@example.test --class <class-id> --programme literacy --delivery move --reason "..." --operator "..."
npm run ho:handover -- group --from old@example.test --to new@example.test --group <group-id> --reason "..." --operator "..."
npm run ho:end-delivery -- --ea ea@example.test --children <child-id>[,<child-id>...] --reason "..." --operator "..."
npm run ho:reopen -- child --ea ea@example.test --children <child-id>[,<child-id>...] --reason "..." --operator "..."
npm run ho:reopen -- class --ea ea@example.test --class <class-id> --programme literacy --reason "..." --operator "..."
```

Add `--apply` to the same command to make the change.

| Command | Ends (at server time) | Opens |
| --- | --- | --- |
| `handover child` | `--from`'s delivery rows (`child_ea_assignments`) for each child | `--to`'s delivery row: reopened in place if they held the child before, otherwise added with the app's id |
| `handover class --delivery move` | `--from`'s class row for that programme, and their delivery rows for children with an open membership in the class | `--to`'s class row and those delivery rows, reopened or added the same way |
| `handover class --delivery stay` | `--from`'s class row only (an assessor takeover); the plan lists the delivery children left with `--from` | `--to`'s class row |
| `handover group` | `--from`'s `group_ea_assignments` row | a new row for `--to` with a fresh id |
| `end-delivery` | the EA's delivery rows for the named children | nothing |
| `reopen child` / `reopen class` | nothing | the EA's own earlier row, in place |

- **A class handover never moves groups.** The plan lists `--from`'s groups in that class; hand
  each one over with `handover group`, or the new EA's group lessons will be refused.
- **Reopen and handover-back keep the row's identity and start date** and clear its end. The plan
  prints the gap (`from`, `to`, `hours`). The EA held nothing during the gap, so work dated inside it
  is still not covered by this row.
- **A group handover always adds a new row.** A group's app id depends on the group alone and the EA
  on a row cannot change, so an earlier row is never reopened for a different EA. To give a group
  back, hand it over again.
- Ends set `handover_reason` to your `--reason` on class and group rows (delivery rows have no such
  column). New rows have no `created_by`; your `--operator` appears only in the printed output, so
  keep that output in the operational record.

### Read the plan before `--apply`

The output is JSON lines: `targets` (both EAs' ids and emails, the programme, and the named
children, class or group with their names), then `plan`:

- `actions`: `end`, `reopen` (with `gap`), `insert`, `already_active` (nothing to do) or `not_active`
  (that EA held nothing to end).
- `notes`: things the command will not do for you, such as `groups_not_moved` or
  `delivery_stays_with_predecessor`.
- `refusals`: the command will not run. Fix the cause, then run the dry run again.

| Refusal | Meaning and what to do |
| --- | --- |
| `child_not_found`, `class_not_found`, `group_not_found` | Wrong id. Copy it again. |
| `child_archived`, `class_archived`, `group_archived` | The script never gives access to an archived child, class or group. Un-archiving is not in this script: ask Jim. For an archived child that an EA still delivers to, use `end-delivery`. |
| `ea_not_in_programme` | The new EA has no open programme assignment for this class or group's programme. Fix their programme first, or their lessons would be refused. |
| `predecessor_not_holding` | `--from` does not hold this child, class or group. Check the plan; to give back an EA's own ended row, use `reopen`. |
| `no_row_to_reopen` | The EA never held it under the app's id. Use `handover` from the current holder. |
| `deterministic_id_conflict` | The row with the app's id belongs to someone else. Stop and record an MA-BUG. |

The script also refuses an email with no exact match or more than one match, a target without an
EA profile, `--from` and `--to` that are the same EA, a suspended `--to` (or reopened) EA, and an
unknown programme code.

### Apply, failures and reruns

`--apply` prints the same plan, then in one transaction: locks the rows in the fixed order
children → classes → groups, works the plan out again from the locked rows, stops if anything is
refused or changed, makes the changes and commits. It then reads every changed row back by id and
prints `confirmed: true` only when each end is set, each opened row is open, and no `row_version`
moved. The script never deletes and never bumps `row_version`.

- **If `--apply` fails or the connection drops, the change may already have committed.** Run the
  same command without `--apply`. A change that already happened shows only `already_active` and
  `not_active`. Running it again with `--apply` is safe: it changes nothing that is already done.
- `ho_lifecycle_retry`, or a lock timeout, means a phone or another change touched the same rows.
  Nothing was changed; run the command again.
- `read_back_unconfirmed` means the commit may have happened but the read-back did not match. Run
  the dry run, and record an MA-BUG if it is not explained.

### What the script does not do

It does not un-archive anything, reopen class or group memberships or programme enrollments, move
children between classes or groups, change an EA's programme, end group memberships (including the
duplicates the daily check lists), or delete anything. Those need a separate decision.

### Daily check

`scripts/lifecycle-invariants.sql` is one read-only query. The `/bug-sync` sweep runs it daily
during the retest (weekly after week 1) and turns each new hit into an MA-BUG record:

```sh
npm run sqlite:staging:query -- "$(cat scripts/lifecycle-invariants.sql)"
```

Each row is one hit: `check_name`, `entity_table`, `entity_id` and the evidence in `detail`. Zero
rows means every check passed.

| Check | What it finds |
| --- | --- |
| `archived_child_still_held`, `archived_class_still_assigned`, `archived_group_still_assigned` | An archived child, class or group that an EA can still write for |
| `live_group_in_archived_class` | A live group whose class is archived |
| `unheld_live_child`, `unheld_live_class` | A live child or class that no EA holds |
| `delivery_child_without_live_class` | A child someone delivers to with no open membership in a live class: it drops out of My Children |
| `duplicate_active_group_membership` | The same child twice in one group (MA-BUG-20261104-017) |
| `upload_terminal_receipts` | Refused uploads, by table and error code, across all receipts |
| `suspended_ea_with_backlog` | A suspended EA whose newest receipt shows work still waiting, or who never sent one: restore, let the phone upload, suspend again |
