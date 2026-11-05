# EA access suspension and restoration

Built 2026-10-17; migration applied to `masi-app-sqlite` and device-proven on 2026-10-18. This runbook implements
Jim's decision to use Zazi's Auth-ban mechanism with an operator script before building a Head
Office website. The [ROADMAP §0](./ROADMAP.md) owns the remaining gates; the
[contract map](./rls-sync-contract-map.md#ea-access-suspension--applied-to-hosted-device-proven)
describes the SQL and grants. Handing over, ending and reopening an EA's children, classes and
groups, and undoing an EA's mistaken Delete child, is in
[Head Office lifecycle changes](#head-office-lifecycle-changes-handover-end-delivery-reopen) below.
(`ea:restore` below gives a suspended EA their login back; it is not the `restore child` command.)

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
- **No reopen, no restore, and no handover back to a former holder,** for an EA whose receipts show
  a refused archive or restore, until that phone has the app update (plan step O1; interim rule 2).
  Their phone would send the old archive again and end the row again.

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
npm run ho:restore -- child --ea ea@example.test --children <child-id>[,<child-id>...] --reason "Deleted by mistake" --operator "..."
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
| `restore child` | nothing | what that EA's Delete child ended, in place ([below](#undo-a-mistaken-delete-child-restore-child)) |

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
| `child_archived`, `class_archived`, `group_archived` | The script never gives access to an archived child, class or group. To undo an EA's mistaken Delete child, use `restore child`; any other un-archive: ask Jim. For an archived child that an EA still delivers to, use `end-delivery`. |
| `ea_not_in_programme` | The new EA has no open programme assignment for this class or group's programme. Fix their programme first, or their lessons would be refused. |
| `predecessor_not_holding` | `--from` does not hold this child, class or group. Check the plan; to give back an EA's own ended row, use `reopen`. |
| `no_row_to_reopen` | The EA never held it under the app's id. Use `handover` from the current holder. |
| `deterministic_id_conflict` | The row with the app's id belongs to someone else. Stop and record an MA-BUG. |

The script also refuses an email with no exact match or more than one match, a target without an
EA profile, `--from` and `--to` that are the same EA, a suspended `--to` (or reopened) EA, and an
unknown programme code.

### Apply, failures and reruns

`--apply` prints the same plan, then in one transaction: locks the rows in the fixed order
children → classes → groups (the named children; the named class, the group's class, and the
classes and groups of every child given a delivery row; the named group), works the plan out again
from the locked rows, stops if anything is refused or changed, makes the changes and commits. It then reads every changed row back by id and
prints `confirmed: true` only when each end is set, each opened row is open, and no `row_version`
moved. The script never deletes and never bumps `row_version`.

- **If `--apply` fails or the connection drops, the change may already have committed.** Run the
  same command without `--apply`. A change that already happened shows only `already_active` and
  `not_active`. Running it again with `--apply` is safe: it changes nothing that is already done.
- `ho_lifecycle_retry`, or a lock timeout, means a phone or another change touched the same rows.
  Nothing was changed; run the command again.
- `read_back_unconfirmed` means the commit may have happened but the read-back did not match. Run
  the dry run, and record an MA-BUG if it is not explained.

### Undo a mistaken Delete child (`restore child`)

Added 2026-11-05 (Jim). Use it when an EA deleted a child by mistake in the app (Delete child, or
Archive on the 1.5.0 app). It undoes that one EA's removal and nothing else. It is not for a child
Head Office ended or handed over (use `reopen` or `handover`), and it is not `ea:restore`.

**Before the dry run**, the EA's phone must have sent the removal: ask the EA to tap Sync now with
signal, then Send diagnostics, and check the receipt shows 0 waiting. A removal still queued on the
phone would land after the restore and remove the child again. The rules above apply: no restore
for an EA whose receipts show a refused archive or restore until their phone has the app update.

```sh
npm run ho:restore -- child --ea ea@example.test --children <child-id> --reason "Deleted by mistake" --operator "Your name"
```

**What it works out.** A removal ends its rows at one moment, printed as `removed_at` in
`plan.removals`. If the child is archived, that is when it was archived, and the archive must be
this EA's. If the child stayed live (another EA still holds it, so the EA only left), it is when this
EA's delivery row ended. One exception: on the 1.5.0 app, a phone whose clock was ahead lands each
row at the moment it reached the server, so an archive's rows end over a few seconds, from the
archive to the EA's delivery row (`removed_until`, with a `removal_spread` note). Restore treats
that span as the removal.

**Check `removed_at` against what the EA tells you.** A Delete child that ended nothing leaves no
trace in the data. That happens when the EA's delivery had already ended (a Head Office handover
or end-delivery) and the child is in none of their groups: the app still lets the EA who added the
child delete it. For a live child the plan then shows Head Office's end as `removed_at`. Restore
refuses a handover (`ended_by_handover`, below), but it cannot tell an end-delivery from the EA's
own removal. So compare `removed_at` (and the delivery row's gap hours) with when the EA says they
deleted the child. If `removed_at` is clearly earlier, do not apply: the EA's Delete child changed
nothing, and applying would undo Head Office's end. Use `reopen child` only when that Head Office
end was the mistake.

**What it reopens, in place** (same ids, start dates and row versions; ends cleared):

- the EA's own delivery row (`child_ea_assignments`), with the gap printed. The removal must have
  ended it; if it did not, restore refuses (`delivery_not_part_of_removal`, below);
- every programme enrolment, class membership and group membership of the child that ended at
  `removed_at` (or inside the span up to `removed_until`);
- the child itself, when the EA's removal archived it (`unarchive`: the archive date, archiver and
  reason are cleared).

It never reopens a row that ended at any other time, and never another EA's delivery row. A rerun,
or a child the EA already holds again, shows only `already_active` and changes nothing. That rerun
no longer shows the notes, so **save the `--apply` output** (paste it into the MA-BUG record or the
support ticket): it is the only record of what stayed ended.

| Note | Meaning and what to do |
| --- | --- |
| `class_archived_skipped` | The class has been archived since, so the child comes back without it. The app shows a child only through a live class (MA-BUG-20261104-015), so the EA cannot see the child and cannot fix this. Record an MA-BUG with the apply output and ask Jim to place the child in a live class. |
| `group_archived_skipped` | The group has been archived since, so that membership stays ended. The EA can add the child to a live group in the app. |
| `removal_spread` | The phone's clock was ahead, so the removal ended its rows over these seconds instead of at one moment. Restore reopens every row of the child that ended in between. Nothing to do. |
| `near_miss_not_reopened` | Rows that ended within an hour of the removal but not with it (`seconds_from_t`): a group membership; an enrolment or class membership the child can do without, because after the restore it is still enrolled in that programme and in a live class (for example the EA moved the child to another class just before the Delete child); or one that ended on the side a wrong clock cannot explain. Usually a separate change. They stay ended: check each one, and record an MA-BUG if one should have come back. |

| Refusal | Meaning and what to do |
| --- | --- |
| `child_not_found` | Wrong id. Copy it again. |
| `ea_never_held_child` | This EA never had a delivery row for the child. Restore the EA who deleted it. |
| `archived_by_another_ea` | Another EA's Delete child archived the child (`archived_by_user_id`). Restore that EA first, then this one. If `archived_by_user_id` is empty, record an MA-BUG and ask Jim. |
| `removal_not_finished` | The child is archived but this EA still holds it: the phone is still sending the removal. Wait until it has synced, then run the dry run again. |
| `delivery_not_part_of_removal` | The EA's removal (`removed_at`) did not end their delivery of the child, which had already ended at `delivery_ended_at`, usually by a Head Office handover or end-delivery. This happens when the EA added the child and deleted it from Class detail after Head Office moved it. Restore cannot tell which rows the removal ended without undoing Head Office's change. Nothing was changed. Record an MA-BUG with this output and ask Jim. |
| `ended_by_handover` | Head Office handed this EA's delivery of the child to another EA (`successor_name`, `successor_email`) at `delivery_ended_at`: the handover ended this EA's row and started theirs at the same moment. The EA's Delete child did not end it (it may have ended nothing), and restoring it would make both EAs deliver. Nothing was changed. If the handover was the mistake, hand the child back with `handover child --from <successor> --to <this EA>`. Otherwise record an MA-BUG with this output and ask Jim. |
| `nearby_end_not_restored` | An enrolment or class membership ended close to the removal but not with it (`rows`), and without it the restored child would have no open enrolment in that programme, or no class that is still live. It may be part of the removal (a 1.5.0 phone whose clock was ahead, on a child another EA also holds) or a separate change. Nothing was changed. Record an MA-BUG with this output and ask Jim. |
| `active_row_conflict` | The child already has another open enrolment in that programme, class membership for that academic year, or membership of that group or grouping (`conflicting_id`, `rule`), so reopening would make two. Nothing was changed. Decide with Jim which one should stay. |

A suspended EA, an unknown email and a profile-less login are refused as in the other commands.

**What the EA sees.** On their next sync the child is back in My Children, with the lessons and
assessments recorded before the removal still attached, as long as the child has a class that is
still live. With `class_archived_skipped` (and no other live class), the child comes back to no
list in the app: see that note. Ask them to tap Sync now. If the child does not come back, record
an MA-BUG with their Share database export and the saved apply output.

Apply locks the child, then the classes and groups of its open memberships and of the memberships
it reopens (and the class of each such group), works the plan out again, reopens only rows still
ended at the planned moment (otherwise `ho_lifecycle_retry`), commits, and reads every row back. Failures
and reruns work as above.

### What the script does not do

Apart from `restore child` undoing an EA's own Delete child, it does not un-archive anything, reopen
class or group memberships or programme enrollments, move children between classes or groups,
change an EA's programme, end group memberships (including the duplicates the daily check lists), or
delete anything. Those need a separate decision.

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
