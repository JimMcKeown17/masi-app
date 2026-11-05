---
name: phone-design-review
description: Walk the Masi app's main workflows on the connected Android phone as a field EA would, and come back with ranked, evidence-backed suggestions to improve its design and functionality.
disable-model-invocation: true
---

# Phone design review

Use the app on the real phone as an EA does in a classroom, and come back with a short, ranked list
of improvements. Each one must be grounded in a screenshot and a measurement or quote, and none may
already be tracked. The value is in what only a hands-on pass reveals: friction, confusion,
inconsistency and missing capability. Generic UI advice adds nothing.

Read `docs/agents/phone-walkthrough.md` first (claiming the phone, driving rules, routes W1–W8 and
"Other screens"). From `documentation/design-system.md`, read "Building a screen", "Typography",
"Actions and fields", "Surfaces, rows and supporting text", "Sheets" and "Forms". Look up other
sections and `CONTEXT.md` glossary terms by name when a screen raises a question about them.

## The EA lens

Judge every screen as this person: a Masi Education Assistant teaching small groups of Grade 1–3
children in an Eastern Cape school. They hold a low-end Android phone (about 411 dp wide, 3 GB RAM),
often in one hand, often in sunlight, while managing children. English is often their second
language. They are interrupted mid-task, and the signal comes and goes.

- **Clarity.** Would an EA know what this screen wants and what just happened? Plain words: short
  sentences, one idea each, everyday verbs, no internal terms ("row", "sync outbox", "tier").
- **Consistency.** Does the same thing have the same name, format and look everywhere: the same
  action, the same concept (for example "known" vs "taught" vs "mastered"), times and dates?
- **Truth.** Does every number, name, date and status match the data and agree with the other
  screens that show it?
- **Reach and size.** Measure tap targets (`dump --json` bounds; dp = px × 160 / 280 on the A03).
  A target under 48 dp that the EA uses often is a finding.
- **Speed.** Count the taps from intent to done for each W1–W8 workflow and put them in one table.
  Call out only the outliers.
- **Safety.** Can a slip lose work or record the wrong child, and is there a way back?
- **Gaps.** What did you need that the app does not offer?

## Steps

1. **Claim the phone** and start a run labelled `design`, as in the reference. The account is the
   test EA.

2. **Tour.** Walk W1–W8 (teach one small group, preferably a one-child group; run one quick test),
   then every screen in the reference's "Other screens" table, and Word Reading's intro. Take a
   screenshot of every screen and every state you meet (sheet, empty, loading, error, keyboard
   open). For each screen, write raw observations into `device-runs/CURRENT/observations.md`:
   screenshot path, what you did, what you noticed against the lens, and measurements. Done when
   every W1–W8 screen and every "Other screens" row has an entry, even if the entry is "nothing
   notable", and the tap-count table is filled.

3. **Sort and de-duplicate.** Sort each observation:
   - The screen contradicts the data, loses work, or breaks layout: a **bug**.
   - The screen is correct but confusing, slow, inconsistent or missing something: a **suggestion**.

   Then check what is already known, using the reference's "Finding existing bug records" (bugs, and
   the ROADMAP and open-decisions documents for planned UX work) and
   `gh issue list --repo JimMcKeown17/masi-app --state open --search "<keywords>"`. Move tracked items
   to "Already tracked" with their reference. Done when every observation is a bug, a suggestion, or
   already tracked.

4. **Rank** the suggestions by EA impact: how often the workflow runs × how much it hurts (lost work
   > wrong data > confusion > slowness > polish), then by size. Keep the top 10; the rest go to "Also
   noticed".

5. **Report.** Write `device-runs/CURRENT/design-review.md` and give Jim the summary. Each suggestion:
   - **Title**, as the change you propose;
   - **Kind**: design or functionality;
   - **Where**: the screen, and the screenshot path;
   - **What the EA experiences**: one or two sentences, in plain words;
   - **Evidence**: your measurement or tap count, or a quote of the screen, marked as which it is;
   - **Suggestion**: concrete enough to mock up. Name components as `src/components/common/` names
     them (check there);
   - **Size**: S (copy or token), M (one screen), L (a flow or data change), and your confidence.

   Then the sections **Possible bugs** (each with its evidence), **Already tracked** and **Also
   noticed**, and the tap-count table. Each possible bug gets an MA-BUG record through the
   `bug-user` skill (recording only). Offer to publish the report as an artifact with the
   screenshots, and to file the suggestions Jim picks as GitHub issues. File only the ones he picks.

6. **Leave the phone tidy** and release it, as in the reference.
