# Wrap up: one card per child, matching tracker rows

Date: 2026-11-05. Owner: Jim (design choice: option A of the wrap-up mockups,
https://claude.ai/artifact/8YNGvtCUuVN3UKVRk61MbF).

## Problem

On the literacy **Wrap up** screen (pilot build, iPhone screenshot 2026-11-05):

- Children's controls run together on the grey page, so it is hard to see where one child ends
  and the next begins.
- The letter tracker opener is a bare red `6/26 ›`. Nothing says what the number is.
- The reading level is a labelled select field, so two things that do the same job (show where
  the child is now; tap to change it) look unrelated.
- The heading asks only about today's letters ("Who knows k u without help?"), but the screen
  also records reading-level progress.

The numeracy **Wrap up** has the same bare `3 / 37 ›` count and the same un-grouped rows.

## Design (option A)

Each child is a white card (`SurfaceCard` look: surface, `tints.rule` border, radius `lg`):

```
┌──────────────────────────────────────┐
│ (G) Gua                              │  avatar initial + name
│ [k] [u] (None yet)                   │  today's letter tiles + chip, one row
├──────────────────────────────────────┤
│ Letter tracker              6/26  ›  │  matching rows: label left,
├──────────────────────────────────────┤  value right (red), chevron
│ Reading level      2 Letter Blends  ›│
└──────────────────────────────────────┘
```

- **Rows.** One shared `WrapUpTrackerRow` (label, value, chevron, 52 dp minimum) for both openers.
  The label is "Reading level", not "Reading Tracker": CONTEXT.md makes "reading level" the term,
  and the row opens the level picker, not a tracker screen.
- **Heading** (literacy, shown when letters were ticked, as today): "Who learned something new
  today?" with the note "Tap **k u** if a child knows it without help. Teaching it today doesn't
  count." (letters in red, as today).
- **"None of these yet" becomes a "None yet" chip** in the tile row; its accessibility label
  stays "{name}, none of these yet".
- **Numeracy** gets the same card and a "Number tracker · 3 / 37" row. Its heading and step chips
  are unchanged.
- Accessibility labels of the openers do not change (`{name}, letter tracker, 6/26`,
  `{name}, reading level, …`, `{name}, 3 of 37 steps`).
- No behaviour, data or save change. JS-only, so it can ship as an OTA on runtime 1.5.0.

## Tasks

1. **Tests first** (`__tests__/LessonWrapUpScreen.test.js`, `__tests__/NumeracyWrapUpScreen.test.js`):
   the heading copy; each child sits in a card (`wrap-up-child-<id>` card with the name);
   the "Letter tracker" and "Reading level" rows show label and value; "None yet" chip;
   numeracy "Number tracker" row with `3 / 37`. Run: RED.
2. **`src/components/lessons/WrapUpChildCard.js`**: card shell (avatar + name header, body,
   rows section with top hairlines) and `WrapUpTrackerRow`.
3. **`WrapUpChildRow`** (literacy) and **`WrapUpStepRow`** (numeracy) render through the card;
   `LessonWrapUpScreen` heading copy and card gap. Run the two suites, then the full suite: GREEN.
4. **Docs**: `documentation/design-system.md` wrap-up entries; `CONTEXT.md` if the wording
   changes; `documentation/build-log.md` entry with verification.
5. **Ship**: PR to `main`. OTA on `preview` with `npm run ota:publish` from a release branch
   that contains the commit phones run now (the unmerged `feat/app-release-card` stack) plus this
   branch, so the update cannot roll phones back.
6. **Device check (A03s, default text size)**: two cold starts to take the update, Profile shows
   the new update; open a lesson's Wrap up for TestB's group and check cards, rows, chip and
   heading pixel by pixel; leave without saving (staging now holds EA retest data).

## Update 2026-11-05: "None yet" removed

Jim: the chip made little sense. Nothing read its answer (`tracker_check: 'none'` had no reader in
the app, backend or dashboards), and the numeracy Wrap up had already dropped the same chip and
field for that reason (2026-10-31). Removed: the chip, `toggleNoOneNew`, `ticks.noOneNew`. Kept:
`activities.lesson.tracker_check`, now `'marked'` or `null`; an older draft's leftover
`noOneNew` is ignored. A bolder "only tap what the child knows" warning is being mocked up
(canvas row W1–W4) and lands in the same OTA.
