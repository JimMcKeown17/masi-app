---
name: phone-health-check
description: Periodic end-to-end health check of the Masi app on the connected Android phone. Drives every main workflow, then proves each one on screen, on the staging backend and in a diagnostics bundle.
disable-model-invocation: true
---

# Phone health check

Drive the real app the way an EA does, and prove each workflow three ways: the **screen** (what the
EA sees), the **server** (what synced) and the **bundle** (what the phone says about itself). A
workflow passes only when all of its evidence agrees.

Read `docs/agents/phone-walkthrough.md` first. It holds the phone-sharing protocol, the driving rules
and the route for each workflow (W1–W8). Work from the repository root of an up-to-date checkout of
`origin/main`. Run `device:server-check` and `read-support-incidents.cjs` from the main checkout,
which has `.env.local`.

## Steps

1. **Claim the phone** as the reference describes. Done when the phone is claimed, or Jim says go.

2. **Start the run.**
   ```
   npm run -s device:phone -- start-run health    # prints the run dir and startedAtUtc
   npm run -s device:phone -- normalize
   ```
   `start-run` marks the run `device-runs/CURRENT`; screenshots land there. If `normalize` prints
   `WOULD …` lines, apply them with `--apply` only once the claim step showed the settings are not
   someone's test state. Then `launch` and screenshot Home. Done when Masi is in front on Home,
   online, and the greeting names a test EA (W1 confirms the email). If a different account is
   signed in, sign out and sign in as `test@masinyusane.org` (password via `type --stdin`).

3. **Walk W1–W8 in order.** For each workflow, take a screenshot at every screen change, and write
   one line per workflow into `device-runs/CURRENT/results.md`: workflow, screen result, the exact
   values you saw. A workflow that fails on screen is a finding. Finish the rest of the run anyway
   unless the app is unusable. Done when every workflow has a screen result.

4. **Check the server** with the command in the reference's "Server check" section. Match each
   section against the Evidence column of the route table and record the server result for each
   workflow. Copy every `FLAG`; a FLAG on the reference's known list is noted as known, any other is
   a finding. Done when every workflow has a server result and every FLAG is known or a finding.

5. **Check the bundle** (W8): fetch it and apply every check in the reference's bundle section.
   Done when each check has a pass/fail.

6. **Leave the phone tidy.** No smoke children left (the server's `children` section shows them
   archived), app on Home, then message the sessions you claimed the phone from that it is free.

7. **Report and record.** Write `device-runs/CURRENT/report.md`, then give Jim the same summary:
   - first line: PASS, or FAIL with the failing workflows;
   - the release under test (W1 values);
   - a table: workflow | screen | server | bundle | notes;
   - findings, each with the screenshot path and the server rows or bundle lines that show it;
   - anything about the run itself that went wrong (phone taken mid-run, a step redone).

   When the screen, server and bundle disagree, say which source says what, and treat the server and
   bundle as the record of what happened.

   Every finding that is a bug gets an MA-BUG record through the `bug-user` skill (recording only;
   fixes wait for Jim). First look for an existing record of the same cause (reference: "Finding
   existing bug records"), and add an occurrence there instead of a new record. When the run found a bug,
   or it is the first run on a new release label, add a Verification Register row to
   `documentation/build-log.md` on that same docs branch. Done when Jim has the report and every bug
   has a record, an occurrence, or Jim's word that it isn't one.

## What a finding is

- Any workflow whose screen, server and bundle evidence disagree, such as a session that saved on
  screen but never reached the server, or a `failedOutboxRows` entry.
- Any `FLAG` from `device:server-check` health checks.
- A crash, an error toast, a frozen screen, a spinner past about 15 seconds, or text that contradicts
  the data.
- Screen copy that is unclear or inconsistent is a design note, not a health finding. Collect design
  notes at the end of the report for `phone-design-review`.
