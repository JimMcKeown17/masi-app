# Bold Red app, part 3: Record

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Record / New session

**Boards (Bold Red track, 390x844):** `red-record-final`, `red-record-final-2`, `red-record-final-3`
(three scroll positions of one 2,186px column; `red-flow-04/05/06` are the same three frames),
states `red-record-s-groups`, `-s-errors`, `-s-errors-2`, `-s-level-sheet`, `-s-child-level`,
`-s-calendar`, `-s-tracker`, `-s-submitting`, `-s-discard`, approved proposals `red-record-p-summary`,
`red-record-p-summary-2`, `red-record-p-save-failed`, and `red-record-components`. The launch branch
`red-flow-03-clock-in-sheet` (Record tapped while clocked out) is covered here too. Ignored:
`red-record-v-ladder` (variant).

**Code:** `src/screens/sessions/SessionFormScreen.js`, `src/screens/sessions/LiteracySessionForm.js`,
`src/components/children/ChildSelector.js`, `src/components/session/LetterGrid.js`,
`src/components/session/LetterTrackerBottomSheet.js`, `src/components/common/SelectSheet.js`,
`src/components/common/BottomSheet.js`, `src/components/sessions/ClockInBeforeSessionSheet.js`,
`src/hooks/useSessionLaunchGuard.js`, `src/services/literacySessionPersistence.js`,
`src/constants/letterStateColors.js`.

**No schema, RLS, payload or outbox change.** `persistLiteracySession`, the session payload, the
session id lifecycle, `navigation.replace('SessionComplete', { childCount })`, the background sync
kick and the leave guard's dirty rule are unchanged. `documentation/rls-sync-contract-map.md` is
not touched. Nothing on any Record board needs data the app does not have (checked below).

### What changes, in one paragraph

The form keeps its order, fields, validation rules and save path. It loses the Paper cards and
outlined buttons and becomes one bare column on the canvas with numbered step headers whose disc
turns into an ink check when the step is valid. The roster gets avatar rows with a check circle,
groups become radio rows, letters become 6-column tiles, and every picker is a Bold Red bottom
sheet. Submit moves into a sticky white footer. Two approved behaviour changes ride with it: a live
summary line above Submit, and the save failure shown inline above Submit instead of a 3-second
Snackbar. Three presentation swaps keep their behaviour: the date popover (Paper `Menu`) becomes a
calendar sheet, the discard `Alert.alert` becomes a bottom sheet (Jim's "sheets over dialogs"
rule), and the native stack header becomes a canvas header with a Close button.

### Screen frame and header

- `SessionForm` route: `headerShown: false`. The screen draws `ScreenHeader` (shared look, see
  Components) on `colors.background`. Presentation stays the default card push (Builder's call 1).
- Header: top padding = top safe inset + 6, side padding 24, bottom padding 6, row min height 44,
  gap 12. Left: `IconCircleButton` 44x44, radius 22, `colors.surface`, 1.5 border
  `colors.text + '33'`, Ionicons `close` 22 `colors.text`, label **"Close"**, calls
  `navigation.goBack()` (so `beforeRemove` and the discard sheet still run). Title **"New session"**
  (was "New Session"), `typeRoles.displayTitle` (Bricolage 28/32, ls -0.56), `colors.text`, one
  line, `maxFontSizeMultiplier={1.2}`, accessibility role header.
- A 1px `colors.text + '1F'` hairline under the header shows only once the list has scrolled
  (`contentOffset.y > 0`), as on `final-2`/`final-3`. Toggle a boolean on threshold crossings only,
  never per scroll event.
- Status bar: dark content (root `StatusBar style="auto"` already gives this on the light canvas).
- `SessionFormScreen`'s two non-form states ("Loading your profile..." + "Retry", and "Session
  forms for {jobTitleName} are coming soon.") have no board: they get the same `ScreenHeader` and
  the shared look only (centred `textBody` `textSecondary`; "Retry" as `TextButton`). Copy
  unchanged except the header title.
- Layout is a flex column: header, the list (flex 1), the footer. The footer is a sibling, not an
  overlay, so the list ends at the footer's top edge (board `main` is 636 tall with the plain
  footer, 604 with the summary, 594 with the failure note). List content: 24 side padding, 28 top
  padding, 34 bottom padding.

### Vertical rhythm (board measurements, dp)

Step header to its control: 12. End of a section to the next step header: 24. Children step:
header row 32 (holds the count chip), 12, segmented control 44, 12, search 48, 22, roster. Groups
mode: segmented, 8, hint (18), 12, search. Step 6: header 20, description 2 below it (2 lines of
13/18), 12, first child block; 12 between child blocks. With an inline error: header, 12, error
note (34), 24, control.

### Step header (`StepHeader`, new)

One per section, `accessibilityRole="header"`. Disc 20x20 radius 10, 10 gap, then the label in
`typeRoles.textSectionLabel` (Figtree 800 12/16, ls 0.96, uppercase), `colors.textSecondary`.
Optional right slot, `typeRoles.textCaption` `textSecondary`.

| State | Disc | Label colour | Accessibility label |
|---|---|---|---|
| to-do | 1.5 ring `textSecondary`, numeral Figtree 800 12/12 `colors.text` | `textSecondary` | "Step 4: Session reading level" |
| done | `colors.text` fill, Ionicons `checkmark` 12 white | `textSecondary` | "Step 4: Session reading level, complete" |
| error | 1.5 ring `colors.error`, numeral `colors.error` | `colors.error` | "Step 4: Session reading level, needs attention" |

Done is derived state only: step 1 is always done (the date always has a value); step 2 done when
`selectedChildren.length > 0`; step 3 when `selectedLetters.length > 0`; step 4 when
`sessionReadingLevel` is set. Steps 5 and 6 are optional and never turn done. Error = the matching
key exists in `validationErrors` (set only by a Submit press, cleared by the existing handlers).
Labels (copy changes in bold): 1 **"Session date"**, 2 **"Select children"**, 3 **"Letters focused
on"** with right slot **"Tap to select"** (replaces the helper "Tap letters to select"), 4 **"Session
reading level"**, 5 **"Comments"** with right slot **"Optional"**, 6 **"Update child progress"**
with right slot **"Optional"** (replaces the divider "Update Child Progress (Optional)").

Large text: the label wraps (flex 1, no `nowrap`); the disc stays top-aligned.

### Error note (`ErrorNote`, shared; the same component as Login/Profile)

Inline validation notes keep today's copy: "Select at least one child", "Select at least one
letter", "Select a reading level". Placement changes: each note sits 12 under its step header,
above the control (today children's note is under the 12-row roster, letters' and level's under
their controls). Style: `colors.errorBg`, radius 9 (`borderRadius.sm`), padding 8/12, gap 8,
Ionicons `warning-outline` 16 `colors.error` (top-aligned, 1dp nudge), text Figtree 13/18
`colors.error` (board weight 600 maps to 700, `typeRoles.textCaptionStrong`). It wraps; height is a
minimum. `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`. In error state the
reading-level field also gets a 2px `colors.error` border and an `error` inner label.

### Step 1: Session date

- `SelectField` (new, shared): white `colors.surface`, radius 14, 1.5 border `colors.text + '33'`,
  min height 60, padding 0/16, gap 12. Leading Ionicons `calendar-outline` 22 `colors.text`;
  stacked inner label **"Day"** (`typeRoles.textLabel` 11/14 caps, `textSecondary`) over the value
  (`typeRoles.textInput` Figtree 500 17/22 `colors.text`, one line); trailing Ionicons
  `chevron-down` 20 `colors.text`. Pressed: `colors.border` fill. Role button, label "Session
  date, {value}. Change date", `accessibilityHint` none.
- Value copy (was "Thu, Oct 15, 2026" from `formatDateForDisplay`): the programme day
  (`getProgrammeCalendarDate()`) reads **"Today · Thu 15 Oct"**; any other day reads **"Mon 12 Oct
  2026"** (weekday, day, short month, year, so a wrong month is obvious). Spaces around the middle
  dot. New pure helper `formatSessionDateLabel(date, today)`.
- Tap opens the calendar sheet (below), replacing the Paper `Menu`.

### Step 2: Select children

- **Count chip** (`CountChip`, new) in the header's right slot, height 32, radius 999, padding
  0/12, Figtree 700 13/18 (`textCaptionStrong`), tabular numerals, text "{n} selected" (unchanged).
  n > 0: `colors.text` fill, white text, **no check icon** (the step disc already shows done;
  Builder's call 2). n = 0: `colors.surface`, 1.5 border `colors.text + '1F'`, `textSecondary`.
  Not interactive.
- **Segmented control** (`SegmentedControl`, new shared, same as Profile): height 44, radius 999,
  `colors.surface`, inset 1.5 ring `colors.text + '33'`. Selected segment: `colors.text` pill inset
  4.5, white `typeRoles.textButton` (Figtree 800 15/20). Unselected: `colors.text`,
  `textBodyStrong` (Figtree 700 15/20). Was: canvas track, white selected chip with shadow and red
  text. Container role `tablist`; segments role `tab` with `accessibilityState={{ selected }}`,
  labels **"Children"** / **"Groups"** (were "Show children" / "Show groups"). Behaviour unchanged
  (`handleSelectionModeChange` clears search).
- **Groups hint** (Groups mode only): **"Choosing a group replaces your selection."**,
  `textCaption` `textSecondary`. New copy describing the existing `handleSelectGroup` behaviour.
- **Search** (`SearchField`, shared): height 48 (minimum), radius 14, `colors.surface`, 1.5 border
  `colors.text + '33'`, padding 0/16, gap 10, Ionicons `search` 20 `textSecondary`, input Figtree
  500 16/20 `colors.text`, placeholder **"Search children…"** / **"Search groups…"** (single ellipsis
  character; were "..."), placeholder colour `textSecondary`. Spreads `NO_TEXT_SUGGESTIONS`
  (`domainTextInputAudit` enforces it). Clear button when text is non-empty: 44x44, Ionicons
  `close-circle` 20 `textSecondary`, label "Clear search" (keeps Paper `Searchbar`'s clear
  affordance; Builder's call 3). Focus: 2px `colors.text` border plus a 4px `colors.text + '0F'`
  halo (system "ink06 focus halo").
- **Roster card.** The FlatList rows draw one grouped surface: white, 1px `colors.text + '1F'`
  border, radius 18. The first row carries the top edge and top radii, the last row the bottom
  edge and bottom radii, middle rows the side edges, all **inside** the row height, so every row
  has the same height and `getItemLayout` stays uniform (Builder's call 4). 22dp gap above it.
- **Child row** (`SelectableRow` variant `checkbox`, new; built on the shared `ListRow`): height
  `rosterRowHeight` (below), padding 10/16, gap 12. `Avatar` 40 (shared: round, `colors.red50`,
  initials `colors.red700` Figtree 800 14, ls 0.42; initials = first letter of first and last name,
  uppercased). Name `typeRoles.textRowTitle` (Figtree 700 16/22) one line with ellipsis; class
  `textCaption` `textSecondary`, 2 below, fallback **"No class"** (unchanged). Trailing 44x44 slot
  (6dp into the right padding) holding a 32 circle: selected = `colors.text` fill + Ionicons
  `checkmark` 18 white; not selected = 2px `colors.textSecondary` ring. Inset divider 1px
  `colors.border` from x 68 to the right edge, not on the last row. Whole row is the target.
  Pressed: `colors.text + '0F'` fill. `accessibilityRole="checkbox"`,
  `accessibilityState={{ checked }}`, label "{first} {last}, {class}" (was "{name}, selected / not
  selected"). The "Select"/"Selected" pill is removed.
- **Group row** (`SelectableRow` variant `radio`): same row; leading 40x40 radius 14 `colors.red50`
  tile with Ionicons `people-outline` 22 `colors.red700`; title "{group.name}", sub-line "{n}
  child"/"{n} children". Trailing 32 circle: selected = 2px `colors.text` ring with an 18
  `colors.text` dot; not selected = 2px `textSecondary` ring. Container role `radiogroup`; row role
  `radio`, `accessibilityState={{ checked }}`, label "{name}, {n} children". Selected = today's
  exact-match rule; tapping the selected group still clears the selection (unchanged).
- **Row height at large text.** `rosterRowHeight = max(64, ceil(20 + 2 + (22 + 18) * fontScale))`
  from `useWindowDimensions().fontScale` (64 at 1.0, 74 at 1.3). Rows stay uniform, so
  `getItemLayout` uses it directly. Names stay one line (board) with the full name in the label.
- **Empty states** (copy verbatim): "No children match your search", "No groups match your search",
  "No groups available", "No children available". Drawn as one roster-card row: padding 20/16,
  `textCaption` `textSecondary`, left-aligned (was centred plain text).
- `ChildSelector` keeps its public props, FlatList, memoised rows, ref-based `onToggle`, windowing
  constants and `extraData`; the step header, chip, segmented control, hint, search and error note
  render in its `ListHeaderComponent`; `ChildSelectorFooter`'s error slot is removed (the error now
  sits under the header).

### Step 3: Letters focused on (`LetterToggleGrid` + `LetterToggleTile`, new)

- 26 tiles in `LETTER_ORDER`, row-major, **6 columns**, 8 gap: rows `a e i o u m` / `l n s d k t` /
  `f g y w b p` / `c x j h v z` / `q r`. Was 5 columns at 18% width, square.
- Tile size = `floor((contentWidth - 5 * 8) / 6)`, capped at 56: 50 at 390dp, 45 at 360dp, 53 at
  411dp. Never below 44 on a supported phone (Builder's call 5; the board draws a fixed 50, which
  overflows a 360dp phone's 312dp content width).
- Radius 14. Rest: `colors.surface`, 1.5 border `colors.text + '33'`, letter `colors.text`.
  Selected: `colors.text` fill and border, white letter (was `primary` red). Pressed: `colors.border`
  fill, scale 0.96 (90ms in, 140ms out, native driver); with Reduce Motion on, no scale.
- Letter **lowercase** (was uppercase; see Questions for Jim), Figtree 700 20/24 (new
  `typeRoles.textLetter`), `maxFontSizeMultiplier={1.2}`.
- Accessibility unchanged in substance: role button, label "{LETTER}, selected"/"{LETTER}, not
  selected" (capital, so screen readers say the letter name), plus `accessibilityState={{ selected }}`.

### Step 4: Session reading level

- `SelectField` (as step 1) without a leading icon. Inner label **"Focused on today"**; value the
  level, or placeholder **"Select a level"** (kept) in `textSecondary` (board weight 400 maps to
  500). The helper "What level did you focus on today?" moves to the sheet subtitle. Error state as
  in Error note. Opens the level picker sheet.

### Step 5: Comments

- `TextArea` (new, shared with the system "single input style"): `colors.surface`, radius 14, 1.5
  border `colors.text + '33'`, padding 12/16, gap 4, **min** height 112 (grows with content and
  font size). Inner label **"Session notes"** (`textLabel` caps). Input `textInput` (Figtree 500
  17/22), placeholder **"Add session notes…"** (was "Add session notes..."), `NO_TEXT_SUGGESTIONS`,
  accessibility label "Comments, optional". Focus: 2px ink border + ink06 halo. Value handling
  unchanged (`comments.trim() || null`).

### Step 6: Update child progress (only when children are selected, as today)

- Description under the header: **"Record each child’s current level and update the letters they
  have mastered."** (`textCaption` `textSecondary`). Replaces the two cards "Reading Levels /
  Record each child's current level" and "Letter Tracker / Update letters each child has
  mastered".
- One `ChildProgressBlock` (new) per selected child, in selection order: `GroupedSurface` (white,
  1px `colors.text + '1F'`, radius 18). Head row min 64, padding 10/16, `Avatar` 40, name
  `textRowTitle` (ellipsis), class `textCaption`, 1px `colors.border` bottom rule. Then two
  `ListRow`s, min height 52, padding 0/12/0/16, gap 12, inset divider from x 16 between them:
  - **"Reading level"** (`textBodyStrong`, board 600 maps to 700): value = the level
    (`textBodyStrong` `colors.text`) or **"Not set"** (`textBody` `textSecondary`), then Ionicons
    `chevron-down` 20 `textSecondary`. Opens the child level sheet. Label "{name}, reading level,
    {value}".
  - **"Letter tracker"**: value **"Update"** (`textBodyStrong` `colors.text`, not red) or the
    badge **"+{n} new"** (height 22, radius 999, padding 0/8, `colors.successText` fill, white
    Figtree 800 12/16), then `chevron-down`. Opens the tracker sheet. Label "{name}, letter tracker,
    {Update | n new}". `n` = `getTrackerChangeCount` (unchanged).
- Both rows wrap at large text (label flex 1; value nowrap; row grows).

### Footer (`StickyActionFooter`, new shared) with Submit

- `colors.surface`, 1px top border `colors.border`, padding 11 top, 24 sides, bottom
  `max(bottom safe inset, 16)` (34 on the board's iPhone). Holds, top to bottom: the summary line
  (approved P-summary), the save-failure note when present (approved P-save-failed; 8 above the
  button), and the Submit button. Gap 12 between summary and button.
- **Submit** (`PillButton` primary, shared look): height 56 (minimum), radius 999,
  `colors.red600`, white `typeRoles.textButtonL` (Figtree 800 17/20), `shadows.primaryButton`
  (new token: `#C81F3E`, offset 0/10, opacity 0.22, radius 22). Pressed: `colors.red700`, no
  shadow, scale 0.98 (no scale under Reduce Motion). Label **"Submit session"** (was "Submit
  Session").
- **Saving** (`red-record-s-submitting`): label **"Saving…"** with a white 18dp spinner before it,
  `accessibilityState={{ busy: true, disabled: true }}`; press is ignored (the existing
  `submittingRef` guard stays the source of truth). The rest of the form stays interactive, as
  today.
- **Keyboard:** while the software keyboard is up (iOS `keyboardWillShow/Hide`, Android
  `keyboardDidShow/Hide`), the whole footer (summary, note, button) unmounts so the focused input
  keeps the room; it returns when the keyboard hides. This applies to Search and Comments. The
  focused Comments field must sit fully above the keyboard on both platforms (device gate; the form
  has no keyboard handling today and Android is edge-to-edge, so verify first, then add iOS
  `automaticallyAdjustKeyboardInsets` on the list and, on Android, `KeyboardAvoidingView
  behavior="height"` only if the device check shows the field covered).

### Approved behaviour 1: live summary line (`RequirementSummary`, new shared)

**What it counts.** One pure function is the single source of truth for both the summary and
Submit's validation (extract it from `handleSubmit` so they can never disagree):

```js
// src/utils/literacySessionValidation.js
export function validateLiteracySession({ selectedChildren, selectedLetters, sessionReadingLevel }) {
  const errors = {};
  if (selectedChildren.length === 0) errors.children = 'Select at least one child';
  if (selectedLetters.length === 0) errors.letters = 'Select at least one letter';
  if (!sessionReadingLevel) errors.readingLevel = 'Select a reading level';
  return errors;
}
```

These are today's three rules, quoted from `LiteracySessionForm.js:495-497`. An item is
**missing** exactly when its key is in that result. Optional fields (date, comments, child levels,
tracker) never appear. `handleSubmit` calls the same function, so Submit behaviour is byte-for-byte
the same: it never disables, it sets the inline errors and returns.

| Item (step) | Done text | Missing text |
|---|---|---|
| children (2) | "1 child" / "{n} children" | "Children" |
| letters (3) | "1 letter" / "{n} letters" | "Letters" |
| reading level (4) | the level, e.g. "3 Letter Blends" | "Reading level" |

**Look.** A row with wrap, justify space-between, row gap 12, column gap 8 (16 once wrapped), min
height 20. Done item: 18 `colors.success` disc with Ionicons `checkmark` 11 white, 6 gap, text
Figtree 700 14/18 `colors.text` (new `typeRoles.textMeta`), tabular numerals. Missing item: a real
button with a 44 hit area (negative vertical margin 12 so the line stays 20 tall), 18 empty disc
with a 2px `textSecondary` ring, text Figtree 800 14/18 `colors.red600`, then Ionicons
`arrow-forward` 14 `red600`. It is shown from the first render, so a fresh form shows three red
"missing" links (`p-summary` shows the mixed state, `p-summary-2` the ready state). Never
ellipsised; at large font or with long values it wraps and the footer grows.

**Jump.** Tapping a missing item scrolls the list so that step's header sits 12 below the header
hairline (`scrollToOffset`, offsets from `onLayout` of the step header; the children step is in the
list header, letters and level in the list footer, so footer offsets add the measured header
height plus `rows * rosterRowHeight`), then moves screen-reader focus to that step header
(`AccessibilityInfo.setAccessibilityFocus`). It changes no state and shows no error.

**Accessibility.** Done items are text with label "{text}, done". Missing items: role button, label
"{Missing text} missing. Go to step {n}" (board: "Reading level missing. Go to step"). The row is
**not** a live region (the board's `role="status"` would announce every letter tap; Builder's call
6). Failed-Submit announcements come from the inline error notes, as above.

### Approved behaviour 2: save failure inline

- **Which failures:** any rejection from `persistLiteracySession` inside `handleSubmit`'s `catch`,
  which is the only failure path that shows a message today: the SQLite transaction rolling back
  (write or constraint error), `resolveProgrammeId` throwing "No active programme assignment found"
  (the programme was removed by a pull while the form was open), or the database handle being
  unavailable. Not covered: validation (inline per step, as above), and the post-save
  `triggerBackgroundSync`/`refreshSyncStatus` work, which already runs after navigation and only
  logs.
- **Look** (`red-record-p-save-failed`): `ErrorNote` in the footer, 8 above Submit, copy
  unchanged: **"Failed to save session. Please try again."** `accessibilityRole="alert"`,
  `accessibilityLiveRegion="assertive"`; on iOS also `AccessibilityInfo.announceForAccessibility`
  with the same text, because iOS does not announce a newly mounted alert.
- **Retry:** tap Submit again. `submittingRef` is already reset in the `catch`, and `sessionId` is
  created once per form, so the retry writes the same id and a success persists exactly one session
  (the existing real-SQLite rollback test proves this). The note clears at the start of the next
  Submit press, before validation runs; if that attempt fails again the note returns and is
  announced again. Editing fields does not clear it. The leave guard stays armed after a failure
  (unchanged).
- The screen's `Snackbar`, `snackbarMessage`, `snackbarVisible` and `showSnackbar` are deleted
  (one fewer screen-local Snackbar host for ROADMAP §5).

### Sheets

**Shared sheet chrome** (restyle `BottomSheet` once, in the shared-look PR, used by every sheet
here): `colors.surface`, top radius 22 (`borderRadius.xl`, was 18), side padding 24, bottom
padding today's `max(insets.bottom, spacing.lg)` (Builder's call 7), `shadows.sheet` (new:
`#3A2424`, offset 0/-8, opacity 0.10, radius 24). Grabber 36x4 radius 2 `colors.text + '33'`, 8 from the top. Title 20 below
the grabber, `typeRoles.displayS` (Bricolage 24/28, ls -0.48) `colors.text`; subtitle 6 below,
`typeRoles.textLead` (Figtree 500 15/22) `textSecondary`. Scrim `colors.heroDark + '7A'` (48%;
was `rgba(0, 0, 0, 0.5)`). Behaviour unchanged (Portal, Android back dismisses, backdrop
dismisses). Text actions: `TextButton` height 44, full width, centred Figtree 800 16/20
`colors.text` (`textButtonM`).

**Picker sheet** (restyle `SelectSheet`, shared look): options are a list, not bordered cards:
min height 56, 1px `colors.border` bottom rule except the last, `textInput` (Figtree 500 17/22)
`colors.text`; selected = Figtree 800 and a trailing Ionicons `checkmark` 22 `colors.text` (was a
2px red border, red text and "✓"). Option role button with `accessibilityState={{ selected }}`
(unchanged). 8 above the list, 8 above the action.

- **Session reading level** (`red-record-s-level-sheet`): title **"Session reading level"** (was
  "Session Reading Level"), subtitle **"What level did you focus on today?"**, the seven
  `READING_LEVELS`, and a new **"Cancel"** action (pass `cancelLabel="Cancel"`; it only dismisses).
  Selecting still sets the level, clears its error and closes.
- **Child reading level** (`red-record-s-child-level`): title **"Reading level"** (was "Reading
  Level"), subtitle **the child's full name** (new), seven levels, "Cancel" (as today).

**Calendar sheet** (`red-record-s-calendar`; `MonthCalendar` new, inside a `BottomSheet`):
- Title **"Session date"**. Month row: two 44x44 radius-22 `IconCircleButton`s (Ionicons
  `chevron-back` / `chevron-forward` 20 `colors.text`, labels "Previous month" / "Next month") either
  side of the month title **"{Month} {yyyy}"** in new `typeRoles.displayHeading` (Bricolage 18/24,
  ls -0.27). Next disabled in the current month: border `colors.text + '1F'`, chevron
  `colors.disabled`, `accessibilityState={{ disabled: true }}`.
- Weekday row "Su Mo Tu We Th Fr Sa" (Sunday first, unchanged) in `textLabel` `textSecondary`.
- Day grid: 7 equal columns with no gap and 4 row gap; each cell centres a 44x44 circle (at 360dp
  the column is 44.6 wide, so the 44 target holds; a fixed 4dp column gap would drop it to 41).
  Day number Figtree 16/20, `maxFontSizeMultiplier={1.2}`: normal `colors.text` (board 600 maps to
  700, new `typeRoles.textDay`); selected `colors.text` disc, white, Figtree 800; today when not
  selected 1.5 ring `colors.text`, Figtree 800; future `colors.disabled`, Figtree 500, disabled.
- Labels **"Thu 15 October 2026"** (was "Select Thu, Oct 15, 2026"), future days append
  ", unavailable"; `accessibilityState={{ selected, disabled }}`.
- Behaviour unchanged: opens on the selected date's month, future days and months after the
  current one are blocked, tapping a day selects it and closes. "Cancel" closes without change.

**Letter tracker sheet** (`red-record-s-tracker`; restyled `LetterTrackerBottomSheet`):
- Title **"Letter tracker"** (was "Letter Tracker"). Subtitle **"{first} {last} · {n}/26 letters"**
  with "{n}/26" in Figtree 800 `colors.text` (was "{name} — {n}/26 letters"). Count logic
  (`countMastered`) unchanged.
- Legend, 14 below the subtitle, a 2-column grid, gap 8/16, 16x16 radius-5 swatches, `textCaption`
  `textSecondary`: **"Taught"** (`successText` fill), **"New this session"** (`successText` fill
  with a 6 white dot), **"Not yet"** (white, 1.5 `colors.text + '33'`), **"Assessment (locked)"**
  (`successBg` fill, 1.5 `successBorder`). Was three items with amber "Assessment".
- Grid: `LetterToggleGrid` (same tile maths as step 3, 6 columns), in `PEDAGOGICAL_ORDERS[language]`
  (unchanged), lowercase. Tile states (replaces `letterStateColors`' amber/green scheme):

| State (from `getCellState` + `pendingChanges`) | Fill / border | Letter | Mark | Label | a11y state |
|---|---|---|---|---|---|
| taught, already stored | `successText` / `successText` | white | none | "{l}, taught by coach" | selected |
| taught, added this session (`pendingChanges[l] === true`) | `successText` / `successText` | white | 8 white dot, top-right 6/6 | "{l}, taught, added this session" | selected |
| not yet | `surface` / `text + '33'` | `colors.text` | none | "{l}, not mastered" | not selected |
| assessment (locked) | `successBg` / `successBorder` | `successText` | Ionicons `lock-closed-outline` 12 `successText`, top-right 5/5 | "{l}, mastered from assessment, locked" | disabled |

  Tap logic (`handleCellTap`) is unchanged; locked tiles stay disabled.
- Loading (`loadMasteryState` in flight): title and subtitle stay, legend hidden, a
  `colors.text` spinner holds the grid area (was `primary`).
- New **"Done"** `PillButton` (56) under the grid: it only dismisses, exactly like the scrim and
  back (changes already apply live). `letterStateColors` stays for any other caller; the tracker
  stops using it.

**Discard sheet** (`red-record-s-discard`; new `ConfirmSheet`, shared): replaces `Alert.alert` in
the `beforeRemove` listener. Title **"Discard this session?"**, body **"Your session details have
not been saved. Leaving now will discard them."** (verbatim), then **"Discard"** (`PillButton`
destructive-quiet: 56, `colors.surface`, 1.5 `colors.text + '33'` border, `colors.error` Figtree 800
16/20) and **"Keep editing"** (`TextButton`; was "Keep Editing"), 12 apart. Role `alertdialog`
(Android: the sheet container gets `accessibilityViewIsModal`). Behaviour: identical guard. The
listener still `preventDefault()`s only when `!allowLeaveRef.current && isDirtyRef.current`, stores
`event.data.action` in a ref and shows the sheet; "Discard" hides the sheet and
`navigation.dispatch(storedAction)`; "Keep editing", the scrim and Android back hide it and clear
the ref. A clean form or a successful submit leaves without the sheet (unchanged).

> **Amended by overview §8 R8.** The guard moves from a `beforeRemove` listener to
> `usePreventRemove(preventLeave, ({ data }) => { storedActionRef.current = data.action; show sheet })`,
> with `preventLeave` as React state (`isDirty && !allowLeave`). The native stack turns it into
> `preventNativeDismiss`, so an iOS swipe on a dirty form is refused natively instead of
> removing the screen behind a sheet that can no longer bring it back. The sheet, copy, "Discard"
> dispatch and "Keep editing" are as above. Before the submit's `navigation.replace`, `allowLeave`
> is set and the replace waits for that state to commit (set it, then replace on the next
> effect), so a successful submit is never blocked. Device rows: iOS swipe on a dirty form then
> "Keep editing" keeps the same form with every value editable; swipe then "Discard" leaves; a
> successful submit leaves; Android back behaves the same.

**Clock-in sheet** (`red-flow-03-clock-in-sheet`; restyled `ClockInBeforeSessionSheet`, shown by
`useSessionLaunchGuard` before the form opens): copy unchanged ("You are not clocked in.", "Clock in
first so your hours are counted alongside this session.", "Clock in now", the
`SESSION_CLOCK_WARNING_COST` text, "Record without clocking in", "Cancel"). 24 under the subtitle, a
12-gap stack: "Clock in now" `PillButton` primary; warning box `colors.warningBg`, radius 14,
padding 12/14, gap 10, Ionicons `warning-outline` 18 `colors.warning`, text Figtree 13/18
`colors.warningText` (600 maps to 700); "Record without clocking in" `PillButton` caution (56,
`colors.surface`, 1.5 `colors.warning` border, `colors.warningText` Figtree 800 17/20; new variant);
"Cancel" `TextButton`. Was 52/48/42-high square-ish buttons at 14/13/13. Behaviour and labels
unchanged.

### Colour map (every board value)

| Board value | Token |
|---|---|
| `#F8F5F4` canvas | `colors.background` |
| `#FFFFFF` fields, rows, footer, sheets | `colors.surface` |
| `#221A1B` text, selected tiles, done discs, chips, segments, check circles, calendar selection | `colors.text` |
| `#76696B` labels, captions, empty rings, chevrons | `colors.textSecondary` |
| `#ECE5E4` dividers, footer top rule, pressed tile | `colors.border` |
| `rgba(34,26,27,.20)` control borders, grabber | `colors.text + '33'` |
| `rgba(34,26,27,.12)` card borders, header hairline, zero chip, disabled month button | `colors.text + '1F'` |
| focus halo (system ink06) | `colors.text + '0F'` |
| `#C81F3E` Submit, Done, Clock in now, missing summary link | `colors.red600` |
| `#A4182F` pressed Submit, avatar initials, group icon | `colors.red700` |
| `#FDECEF` avatar and group tiles | `colors.red50` |
| `#3FA535` summary done disc | `colors.success` |
| `#2E7D27` taught tile, "+n new" badge, locked letter and lock | `colors.successText` |
| `#E7F3E5` / `#CDE8C9` locked tile | `colors.successBg` / `colors.successBorder` |
| `#B3261E` / `#FCEAE8` errors, Discard text | `colors.error` / `colors.errorBg` |
| `#B3A8A8` future days, disabled chevron | `colors.disabled` |
| `#FFF8E1` / `#8A4B00` / `#B26A00` clock-in warning | `colors.warningBg` / `warningText` / `warning` |
| `rgba(28,21,23,.48)` scrim | `colors.heroDark + '7A'` |
| `0 10 22 rgba(200,31,62,.22)` red buttons | **new `shadows.primaryButton`** |
| `0 -8 24 rgba(58,36,36,.10)` sheets | **new `shadows.sheet`** |

No new colour token. The two shadows match the Profile section's names; `colors.test.js` pins
`shadows` with `toEqual`, so it changes with them.

### Type roles

Existing roles used: `textLabel` (inner field labels, weekday headers), `textCaption`,
`textBody`, `textBodyStrong`, `textButton`. New roles (names follow the Children/Profile sections
for reconciliation): `displayTitle` (Bricolage 28/32, ls -0.56; header), `displayS` (Bricolage
24/28, ls -0.48; sheet titles), `textSectionLabel` (Figtree 800 12/16, ls 0.96, caps; step labels),
`textRowTitle` (Figtree 700 16/22), `textLead` (Figtree 500 15/22), `textInput` (Figtree 500 17/22),
`textButtonL` (Figtree 800 17/20), `textButtonM` (Figtree 800 16/20), `textCaptionStrong` (Figtree
700 13/18), plus Record-only: `displayHeading` (Bricolage 18/24, ls -0.27; calendar month),
`textLetter` (Figtree 700 20/24; tiles), `textMeta` (Figtree 700 14/18; summary items), `textDay`
(Figtree 700 16/20; calendar). The missing summary link and selected/today calendar days use the
same size with `fontFamilies.textHeavy`; future days with `fontFamilies.textMedium` (a family swap,
never `fontWeight`). No new font weight is loaded: board 600 maps to Figtree 700 and board 400 to
Figtree 500, as in the sibling sections.

### States

| State | Behaviour |
|---|---|
| Fresh form | Step 1 done, steps 2–4 to-do, step 6 hidden, zero chip, summary shows three red missing links, Submit enabled. |
| Children loading or none | `ChildrenContext` gives an empty list: "No children available" row (unchanged behaviour). |
| Validation errors (`s-errors`, `s-errors-2`) | Submit with missing items: error discs and labels, `ErrorNote`s under the headers, level field red. Nothing scrolls (unchanged); the summary links are the way to jump. |
| Saving (`s-submitting`) | "Saving…" with spinner, busy. |
| Save failed (`p-save-failed`) | Footer note above Submit; retry as above. |
| Offline | No difference: the save is local SQLite, and the screen has no sync indicator (today's stack screen has none either). |
| Keyboard | Footer hidden; Comments visible above the keyboard (device gate). |
| 360x640 / 360x800 | Content width 312: tiles 45, calendar targets 44.6, child names ellipsise sooner. Header 80 tall on Android (24 status bar). |
| Large font (1.3) | Header title capped at 1.2; step labels wrap; roster rows 74 and uniform; fields, rows and footer grow from minimums; summary wraps and the footer grows; tile letters and calendar days capped at 1.2. Nothing clips; only roster names ellipsise (board rule). |

### Accessibility and contrast

44dp targets: Close 44, date and level fields 60, segments 44, search 48 (clear 44), roster rows
≥64, tiles ≥45 on 360dp, progress rows 52, Submit 56, missing links 44, calendar cells 44 and
month buttons 44, sheet options 56, Cancel and Keep editing 44, Done and Discard 56. Not
interactive: count chip, done summary items.

| Pair | Ratio | Result |
|---|---|---|
| `textSecondary` 12/16 caps on canvas (step labels) | 4.84 | pass |
| `textSecondary` on white (captions, legend) | 5.25 | pass |
| `error` on `errorBg` (notes) / on canvas (error labels) | 5.63 / 6.03 | pass |
| `red600` 14/18 800 on white (missing link) | 5.64 | pass |
| white on `red600` (Submit) / on `red700` (pressed) | 5.64 / 7.64 | pass |
| white on `successText` (taught tile, badge, dot) | 5.15 | pass |
| `successText` on `successBg` (locked letter, 20px 700 = large text) | **4.4986** | passes the 3:1 large-text rule and the control is disabled; fails 4.5 if anyone shrinks it below 18.66px bold |
| `success` disc on white (graphic) | 3.16 | pass (3:1 non-text) |
| `red700` on `red50` (initials, group icon) | 6.70 | pass |
| `warningText` on `warningBg` / on white; `warning` border | 6.40 / 6.80 / 4.24 | pass |
| `colors.disabled` on white (future days, disabled chevron) | **2.31** | disabled controls are exempt; "unavailable" is in the label |
| ink20 control borders on white / canvas (fields, search, rest tiles, segmented ring) | **1.52 / 1.51** | **below 1.4.11's 3:1.** System-wide choice (RedSystemSheet "ink20 control borders"); each control is still identified by its label, value, placeholder or letter. Flagged for the shared-look reconciliation, not changed here. |
| 2px `textSecondary` empty rings | 5.25 | pass |

### Board contradictions and data checks

- `red-record-final` draws a check inside the "2 selected" chip; the components board (recommended
  step-header option C) says the chip drops it. Built without (Builder's call 2).
- The board header's Close implies a modal; the route stays a push (Builder's call 1).
- Fixed 50dp tiles and a 4dp calendar column gap break 44 targets / fit at 360dp; replaced by the
  computed sizes above.
- The summary's `role="status"` is dropped (Builder's call 6).
- Data: avatar initials, class names, group child counts, "+n new", "n/26", "New this session"
  (`pendingChanges[l] === true`), "Today" (programme day) and every summary value come from state
  the form already holds. **No new data, schema, RLS or outbox work.**

### Components

| Component | Origin | Notes |
|---|---|---|
| `ScreenHeader`, `IconCircleButton` | shared look (Children section names) | Close variant here |
| `PillButton` (primary, destructive-quiet, new **caution** variant), `TextButton` | shared look (Profile names; Children calls the primary `PrimaryButton`) | loading label prop |
| `BottomSheet`, `SelectSheet` restyles | shared look, existing components | every sheet here |
| `SegmentedControl` | new shared (Profile uses it too) | role tablist here |
| `SearchField` | new shared (Children) | clear button |
| `GroupedSurface`, `ListRow`, `Avatar` | new shared (Children) | roster rows draw the surface edges themselves |
| `ErrorNote` | new shared (Login/Profile) | error tone |
| `SelectField`, `TextArea` | new shared (system "single input style") | future forms reuse |
| `StepHeader`, `CountChip` | new, `src/components/forms/` | extends Children's `SectionLabel` idea with a status disc |
| `SelectableRow` (checkbox, radio) | new, `src/components/forms/` | |
| `LetterToggleTile`, `LetterToggleGrid` | new, `src/components/session/` (distinct from the EGRA `assessment/LetterTile`) | focus grid and tracker |
| `ChildProgressBlock` | new, `src/components/session/` | |
| `MonthCalendar` | new, `src/components/common/` (moved out of the form) | |
| `StickyActionFooter`, `RequirementSummary` | new, `src/components/forms/` | generic: `items = [{ key, doneText, missingText, done, onPress, step }]` |
| `ConfirmSheet` | new shared | discard |
| `validateLiteracySession`, `formatSessionDateLabel`, `rosterRowHeight` | new pure functions | |

Nothing comes from `src/components/home/`: Home's attention card and icon tile have different
sizes and roles. `SyncIndicator` is not on this screen.

### Overlap with group-centred sessions

`documentation/group-session-workflow.md` (ROADMAP §4) will replace child-first selection with a
group picker, an attendee list from the group roster, durable drafts and a "Session in progress"
resume. So this PR invests in parts, not structure: `SelectableRow` (radio for the group picker,
checkbox for attendance exceptions), `StepHeader` + `RequirementSummary` + `StickyActionFooter`
(prop-driven, no literacy knowledge), `LetterToggleGrid`, `ChildProgressBlock`, `MonthCalendar`
(a backfill mode, if decided), and `ConfirmSheet` (the draft flow's "discard draft?"). The
literacy-specific glue (`ChildSelector`, the form) is what the rebuild replaces. Do not add a
group id, drafts, or "who to see next" here.

### Tests (behaviour-level, through the screen; real SQLite where saving is involved)

1. `validateLiteracySession` unit tests: each rule alone, all three, none.
2. Summary: fresh form shows three missing buttons ("Children missing. Go to step 2", "Letters
   missing. Go to step 3", "Reading level missing. Go to step 4"); selecting one then two children
   shows "1 child" then "2 children"; same for letters; picking a level shows its name; a group
   selection updates the count; Submit is never disabled.
3. Summary and validation agree: for every combination of the three inputs, the missing summary
   items equal the inline errors shown after pressing Submit.
4. Jump: pressing a missing item calls the list's `scrollToOffset` with that step's measured
   offset and sets accessibility focus on the step header; no error appears.
5. Step headers: accessibility labels for to-do, complete and needs-attention per step; steps 5–6
   never "complete".
6. Inline save failure (extend `LiteracySessionForm.submit.test.js`): an injected write failure
   shows "Failed to save session. Please try again." as an alert in the footer (no Snackbar in the
   tree), rolls back sessions, attendees and outbox; pressing Submit clears it immediately; the
   retry persists exactly one session with the original id and navigates once. A second failure
   shows the note again. A validation failure after a save failure shows only the inline errors.
7. Saving: during a pending save, Submit reads "Saving…" with busy state; the back-to-back press
   test still persists one session.
8. Discard sheet (rewrite the `Alert.alert` spy tests): a dirty form's `beforeRemove` is prevented
   and the sheet shows the verbatim copy; "Keep editing" hides it and does not dispatch; "Discard"
   dispatches the stored action; Android back on the sheet keeps editing; a clean form and a
   successful submit leave without the sheet; each dirty field still counts (reading level alone).
9. Keyboard: emitting `keyboardDidShow` hides Submit and the summary; `keyboardDidHide` restores
   them.
10. Date: the field reads "Today · {Wkd} {d} {Mon}" on the programme day and "{Wkd} {d} {Mon}
    {yyyy}" otherwise (keep the South Africa programme-day test); the calendar disables future days
    and next month in the current month; selecting a day closes the sheet and updates the field;
    Cancel changes nothing.
11. Children: rows are checkboxes with checked state and "{name}, {class}" labels; groups are
    radios; the hint shows only in Groups mode; group replace and tap-again-to-clear still hold;
    rewrite `ChildSelector.renderCount.test.js` to instrument `SelectableRow` so one toggle still
    re-renders only the changed row.
12. `rosterRowHeight`: 64 at font scale 1.0, 74 at 1.3; `getItemLayout` uses it.
13. Tracker sheet: labels and states for taught, added this session, not yet and locked (update
    `LetterTrackerBottomSheet.plan5.test.js` for ", locked"); "Done" dismisses; tap logic tests
    unchanged; loading hides the legend.
14. Level sheets: the session level sheet has "Cancel"; the child sheet's subtitle is the child's
    name; selecting still sets the right child's level (existing test).
15. `ClockInBeforeSessionSheet.test.js` passes with copy and labels unchanged.
16. Guards: `colors.test.js` for the two shadows; `typography.test.js` covers the new roles;
    `domainTextInputAudit` covers `SearchField` and the comments `TextArea`.

### Device checks (EAS preview build for this PR, iOS and Android)

- Screenshots against the boards: fresh form, mixed summary (`p-summary`), ready summary
  (`p-summary-2`), Groups mode, both error frames, saving, every sheet (calendar incl. previous
  month and a past day selected, both level sheets, tracker with taught / new / locked, tracker
  loading, discard, clock-in), on a 390-class iPhone and on the Galaxy A03s (360dp) plus a 360x800
  Android.
- Save failure, reproduced end to end: open the form, remove the test EA's active programme
  assignment on `masi-app-sqlite` (dev data), foreground the app so a pull applies it, fill the
  form, Submit: the inline note appears; restore the assignment, pull, Submit: one session saves.
- Keyboard: focus Search and Comments on both platforms; the footer hides, the field stays fully
  visible, the footer returns on dismiss.
- Discard: Close, iOS swipe-back and Android hardware back on a dirty form each show the sheet;
  Back with the sheet open keeps editing.
- Largest system font (iOS largest non-accessibility size and One UI 1.3): roster rows, step
  labels, fields, child blocks and the wrapped summary are complete, and every target stays
  tappable on its own.
- TalkBack and VoiceOver: step headers, checkbox/radio rows, tiles, summary jump focus, error and
  save-failure announcements.
- Reduce Motion on: tiles and Submit press without scaling.
- Low-end Android (A03s): roster scroll and tile taps stay smooth with 30+ children.

### Docs in the build branch

`documentation/design-system.md` (new roles, two shadows, the form components and the ink20-border
note), `PRD.md` session-capture section (summary line, inline failure, discard sheet),
`documentation/build-log.md`, and `documentation/ROADMAP.md` §5 (Record done; Snackbar host count
minus one).

### Out of scope

Group-first capture, drafts and resume, "who to see next" in the session flow, scrolling to the
first error on Submit (Warm Editorial P1c, not approved), moving the roster into a sheet (P2, not
approved), the inline level ladder variant, any change to what is saved, and other job titles'
forms.

### Builder's calls

1. **(my call)** Keep the push presentation; Close calls `goBack()`. A `fullScreenModal` would change
   the transition and iOS gestures for no field benefit.
2. **(my call)** Count chip without a check, per the components board, over the final frame.
3. **(my call)** `SearchField` keeps a clear button, matching today's Paper `Searchbar`.
4. **(my call)** Roster rows draw the grouped-card edges inside a uniform row height so
   `getItemLayout` and the render-count guarantee survive.
5. **(my call)** Tile size computed from the content width (6 columns, max 56), not a fixed 50.
6. **(my call)** The summary row is not a live region; the inline alerts carry announcements.
7. **(my call)** Sheet bottom padding keeps today's `max(insets.bottom, 24)`; the board's 34 is the
   iPhone inset.
8. **(my call)** Keep capital-letter accessibility labels on lowercase tiles so screen readers say
   letter names.
9. **(my call)** Figtree 600 maps to 700 and 400 to 500 rather than loading two more weights.
10. **(my call)** The save-failure note clears on the next Submit press, not on edits.

### Questions for Jim

1. The boards draw letter tiles **lowercase** ("m", not "M"), and the components board itself says
   to confirm with the programme team before shipping. Lowercase on both the focus grid and the
   tracker, or keep capitals?
