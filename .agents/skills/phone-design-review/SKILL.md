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

Read `docs/agents/phone-walkthrough.md` first (claiming the phone, driving rules, routes W1–W8).
Before you start, read the "Building a screen" section and the sections on the components you will
meet in `documentation/design-system.md`, and the glossary terms for the screens you visit in
`CONTEXT.md`.

## The EA lens

Judge every screen as this person: a Masi Education Assistant teaching small groups of Grade 1–3
children in an Eastern Cape school. They hold a low-end Android phone (about 411 dp wide, 3 GB RAM),
often in one hand, often in sunlight, while managing children. English is often their second
language. They are interrupted mid-task, and the signal comes and goes. Questions to ask on every
screen:

- **Speed.** How many taps from intent to done? What waits?
- **Clarity.** Would an EA know what this screen wants and what just happened? Is the wording plain,
  with no internal jargon?
- **Consistency.** Does the same action have the same name and look everywhere? Does the screen
  follow `design-system.md`?
- **Reach and size.** Measure tap targets from the dump bounds: dp = px × 160 / density (280 on the
  A03). Under 48 dp is a finding when the target is used often.
- **Safety.** Can a slip lose work or record the wrong child? Is undo or a confirmation where it
  matters, and absent where it only slows the EA down?
- **Truth.** Does the screen match the data (counts, names, dates, sync state)?
- **Gaps.** What did you need that the app does not offer?

## Steps

1. **Claim the phone** and start a run labelled `design`, as in the reference. The account is the
   test EA.

2. **Tour.** Walk W1–W8. Also open the screens around them: Home, Children list and Class detail,
   Child results, Letter tracker, the Insights cards, Sync status, the lesson picker's group rows,
   and the other sheets and empty states you pass. Screenshot every screen and every state you meet
   (sheet, empty, loading, error, keyboard open). For each screen, write raw observations into
   `$DEVICE_RUN_DIR/observations.md`: screenshot path, what you did, what you noticed against the
   lens, and the measurements. Done when every W1–W8 screen and every screen listed above has an
   entry, even if the entry is "nothing notable".

3. **De-duplicate.** For each observation, search what is already known: `docs/bugs/`,
   `documentation/ROADMAP.md`, `documentation/open-decisions-backlog.md`, and
   `gh issue list --repo JimMcKeown17/masi-app --state open --search "<keywords>"`. Drop what is
   tracked, keeping its reference for the report. Behaviour that is wrong, not just improvable, is a
   bug: record it through `bug-user` and keep it out of the suggestions.

4. **Rank.** Turn the rest into suggestions. Rank by EA impact: frequency of the workflow × how much
   it hurts (lost work > wrong data > confusion > slowness > polish), then by cost. Keep the top 10.
   The others go in a short "Also noticed" list.

5. **Report.** Write `$DEVICE_RUN_DIR/design-review.md` and give Jim the summary. Each suggestion:
   - **Title**, as the change you propose;
   - **Kind**: design or functionality;
   - **Where**: the screen, and the screenshot path;
   - **What the EA experiences**: one or two sentences, in plain words;
   - **Evidence**: a measurement, a tap count, a quote of the screen copy, or a server/data fact;
   - **Suggestion**: concrete enough to mock up, using the design-system names for components and
     tokens;
   - **Size**: S (copy or token), M (one screen), L (a flow or data change); and your confidence.

   End with "Already tracked" (the matches from step 3) and "Also noticed". Offer to publish the
   report as an artifact with the screenshots, and to file the suggestions Jim picks as GitHub
   issues. File only the ones he picks.

6. **Leave the phone tidy** and release it, as in the reference.
