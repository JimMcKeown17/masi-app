# Bold Red Home — Design

**Date:** 2026-10-17
**Status:** Draft for Codex adversarial review
**Branch:** `feat/bold-red-home`
**Design source:** the "Home · Simplified (Red)" page of the Design Round 4 canvas
(https://claude.ai/artifact/8gQRtyqZ5Q1vTCTdSkz6zc, private to Jim). The **v2** block is the target:
`red-home-v2-final` plus its states and `red-home-v2-components`. The v1 block below it is history.
**Scope:** the Home screen only, plus the shared pieces Home needs (fonts, a segmented gauge, a hero
sync button, the attention area). Every other screen keeps its current look until it gets its own
spec. No schema, RLS, payload, or outbox change: `documentation/rls-sync-contract-map.md` is not
touched.

## Why

Home today is a dark hero with seven blocks: identity, a labelled sync pill, the clock, the session
gauge, "who to see next", the week strip, assessment coverage, and recent sessions. Jim wants a
calmer Home with one job: show today's status, and speak up only when something needs doing.

## Decisions locked with Jim

| Date | Decision |
|---|---|
| 2026-10-15 | Bold Red is the direction for the app redesign. |
| 2026-10-15 | Remove "Who to see next" from Home. It moves into the session-flow rebuild (separate work). |
| 2026-10-15 | Remove the assessment coverage row and the Recent list from Home. |
| 2026-10-15 | Session history moves to the Insights tab. **Done on this branch** (`InsightsScreen.js`, test in `__tests__/InsightsScreen.test.js`), so history is never unreachable. |
| 2026-10-15 | The "All saved and synced" pill becomes an icon button beside settings. Jim: "perfect". |
| 2026-10-15 | Layout: the **moderate** variant. The clock stays inside the red hero; the session card is smaller. |
| 2026-10-15 | The area under the week strip is an **attention area**: blank by default, shows only things to act on. |
| 2026-10-17 | The auto clock-out card disappears 1 day after the auto clock-out was detected. It is also dismissible. |
| 2026-10-17 | The assessment card is dismissible. |
| 2026-10-17 | Keep the assessment card's sub-line ("11 of 12 children assessed") as designed. Do not add a time window yet. |

## What Home shows

Top to bottom, on the red field then the warm canvas:

1. **Top row** (right-aligned): sync button, settings button. 44x44 circles, `colors.red700`.
2. **Greeting**: "Molo, {first_name}." and the subtitle "{programme} · {school}".
3. **Clock row**: a `red700` inset row inside the hero. Three states (below).
4. **Session card**: white card straddling the red field's bottom edge. Segmented half gauge, a
   heading, and the supporting line. Status only: not tappable.
5. **Week strip**: Monday to Friday, bare on the canvas.
6. **Attention area**: zero, one, or two cards. Nothing at all when empty.
7. The existing `LockedBottomTabBar` with the centre Record button is unchanged.

Removed from Home: "who to see next", coverage row, Recent, "View all", and every query and state
that only fed them (`whoToSeeNext`, `recentSessions`, `getSessionsTabStats` on Home,
`formatChildNames`, `getChildName`).

## Visual spec

All colours below are existing tokens in `src/constants/colors.js`. **No new colour token is
needed.** Measurements are in dp at a 390-wide phone; the layout is flow-based, not absolute.

### Hero field and arc

- The red field (`colors.red600`) starts at the top of the screen, behind the status bar, and ends
  **56dp below the top of the session card**, so the card straddles it. The field's height comes
  from the content above it, not a fixed number, so a two-line name or larger text pushes the field
  and everything below it down together.
- One decorative ring: a circle stroke, `colors.red500`, stroke width 50, radius 236, centred 170dp
  right of the screen's right edge and 40dp below the screen top. It is clipped by the field. It
  passes behind the two top-row buttons and never under the greeting or subtitle text. It is
  decorative (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`).
- The status bar uses light content while Home is focused, via a focus-scoped `<StatusBar>` so it
  joins React Native's status-bar stack and blur restores the root setting.

### Top row, greeting, subtitle

- Top row sits at the safe-area top plus 6dp. Buttons 44x44, radius 22, `red700`, 8dp apart,
  aligned to the right content edge (24dp side padding).
- Settings: gear icon, white, 22dp. Label "Settings. Open profile". Navigates to `Profile`.
- Greeting: display font (see Typography) 32/36, weight 800, letter spacing -0.8, white. Starts
  10dp below the top row. Wraps; never truncates.
- Subtitle: text font 15/20, weight 500, `colors.red50`, 4dp below the greeting. Built from the
  programme name and school as today; omitted if both are empty.

### Sync button (hero variant of `SyncIndicator`)

Driven by the existing `deriveSyncState` and `describeSyncState`. No new sync logic.

| State | Disc | Glyph (white unless noted) | Badge |
|---|---|---|---|
| `synced` | `red700` | cloud with check | none |
| `waiting` | `red700` | cloud with up arrow | white pill, `red700` count, 2dp `red600` ring |
| `offline` | `red700` | cloud off | same as waiting |
| `syncing` | `red700` | rotating sync arrows (1000ms linear loop, native driver) | none |
| `needs_attention` | `colors.warningBg` | cloud with alert, `colors.warningText` | `warningText` pill, white count, 2dp `red600` ring |

- Badge: min width 20, min height 20, radius 10, offset -4/-4 from the top-right, text 12/16
  weight 800, tabular numbers, horizontal padding 5. Counts above 99 show "99+". Its text caps at
  `maxFontSizeMultiplier={1.2}`, like the other compact numbers, and the badge grows with its line
  height rather than clipping (a plain `View` + `Text`, not Paper's `Badge`, which hides overflow).
  The full count is always in the button's accessibility label.
- Accessibility label: `describeSyncState(...).accessibilityLabel + ". Sync status"`. Role button.
- Navigates to `SyncStatus`, as today.
- Reduce Motion on: the syncing glyph does not rotate.
- The existing default (non-hero) `SyncIndicator` used in the stack headers is unchanged.

### Clock row

A row at least 64dp tall, radius 18, `red700`, 12dp left / 10dp right padding, 20dp below the
subtitle. The left part is a button (to `TimeEntriesList`) that holds a 40x40 icon tile (radius 14,
white at 14%) and the status text. The right part is the clock action. At normal text sizes the row
is exactly 64dp in every state, so nothing jumps when the state changes.

**Large text:** heights are minimums, never fixed. When the system font scale is above 1.3, the row
stacks: the status button takes the full width (its text may wrap), and the clock action sits
below it at full width, still 44dp minimum. Both stay independently tappable.

| State | Left text | Live dot | Action |
|---|---|---|---|
| Not clocked in | "Not clocked in" 17/22 weight 800 white, chevron | none | **Clock in**: filled white pill, `red600` text, the hero's strongest element |
| Getting location (`loadingLocation`) | spinner in the tile, "Getting location…" | none | none (keeps its width so nothing jumps) |
| Clocked in | caps label "ON THE CLOCK" 11/14 weight 800 tracking 0.1em `red50` with chevron, then elapsed time 20/24 display font, white, tabular | 12dp white dot with a 2.5dp `red700` ring, top-right of the tile | **Clock out**: transparent pill, 1.5dp white border, white text |

- Action pill: height 44, min width 106, horizontal padding 18, radius 999, text 15/20 weight 800.
- Labels: "On the clock since {sign-in time from `formatDisplayTime`, e.g. 07:52}. View work history" / "Not clocked in.
  View work history". (A start time stays true; a duration baked into a label goes stale between
  renders.) Action labels "Clock in" / "Clock out". The getting-location row is
  `accessibilityLiveRegion="polite"`.
- Behaviour is unchanged: `handleSignIn`, `handleSignOut`, `loadingLocation` from
  `useTimeTracking`. There is still no confirm before clocking out (see Out of scope).
- Elapsed time keeps using the `ElapsedTime` leaf so only that text re-renders. On Home it shows
  hours and minutes only ("3h 24m"); other screens keep seconds.

### Session card

- White, radius 22, the `shadows.elevated` shadow, 16dp below the clock row. Content centred,
  padding 18 top, 16 sides and bottom.
- **Segmented half gauge** (new `SegmentedSessionGauge`, 176x97, arc centre (88, 88), radius
  79.5): one arc segment per target session, stroke 16 with square (butt) ends, 5° gaps between
  segments (about 7dp), and a round dot of radius 8 at each outer end of the half circle. Each
  segment spans `(180 - 5 * (target - 1)) / target` degrees. The start dot takes the first
  segment's colour; the end dot takes the last segment's colour.
  - Colour rule is the locked R3 rule, unchanged: `ringNeutral` at zero or no target, `ringStart`
    at one session, `primary` while progressing, `success` at target, `accent` above the ceiling.
  - Below target, filled segments use the state colour and the rest use `colors.border`.
  - `met`: every segment green. `exceeded`: every segment amber. `no_target`: one continuous
    neutral arc, no segments.
  - If the target is above 6, draw one continuous arc filled to `count/target` instead of segments.
  - The numeral (display font 48, weight 800, tabular) sits on the gauge's centre line. "/3" hangs
    off its right edge in the text font 17 weight 700 `textSecondary` and takes no width. No suffix
    for `exceeded` and `no_target`. The numeral is `textSecondary` at zero, `text` otherwise.
  - The gauge is one accessible image with the existing `SessionsTodayGauge` labels.
- Heading: display font 20/26 weight 800; one line at normal sizes, wraps when text is enlarged
  (never truncates). Supporting line: text font 15/20 weight 500,
  `textSecondary`, 4dp below. Copy is the existing `getGoalCopy` output, unchanged.
- Loading: skeleton blocks in the same footprint (gauge, heading, line), only while a load is in
  flight and nothing has loaded yet. A failed refresh keeps the last good stats. A failed first load
  shows "Couldn’t load today’s sessions" / "They’ll refresh next time you open Home."
- The existing `SessionsTodayGauge` stays for any other caller; Home switches to the segmented one.

### Week strip

- 20dp below the card. Five equal columns with 8dp gaps. Day label 11/14 weight 800 tracking 0.1em
  `textSecondary` (today: `red600`), 6dp above a 40dp tile, radius 14.
- Tile: past day with sessions = `successBg` fill, `successText` number; today = `red600` fill,
  white number, soft shadow; past day with none = no fill, `textSecondary` "0"; future = no fill,
  `textSecondary` en dash. Numbers in the display font 20/24, tabular.
- Data: the existing `getWeekSessionCounts`, unchanged.
- Each column is one accessible element: "{Weekday}, {n} sessions", "{Weekday}, today, {n}
  sessions", "{Weekday}, upcoming". The strip has an accessible heading "This week" that is not
  drawn.

### Attention area

20dp below the week strip. Holds at most two cards, 8dp apart. When there is nothing to show, the
area is not rendered at all (no heading, no placeholder, no empty accessibility container).

**Card:** white, radius 18, 1dp border `rgba(34,26,27,0.12)` (ink at 12%), min height 60. A main
button fills the card: 40x40 icon tile (radius 14), a title (text font 15/20 weight 700; the copy
below fits one line on a 360dp phone at normal size, and wraps when text is enlarged), a sub-line
(13/18 weight 500 `textSecondary`, wraps), then either a chevron or nothing. A dismissible card
has a separate 44x44 dismiss button (cross icon, `textSecondary`) at the right instead of the
chevron. Pressed state: the whole card at 98% scale with a 6% ink fill.

The area is a list with the accessibility label "Needs your attention"; each card is a list item.
Cards are not announced when they appear.

### Bottom spacing and scrolling

- Home scrolls. The content's bottom padding keeps the last card at least 16dp above the Record
  button's ring at rest.
- At a normal font size on a 360x800 phone, two cards fit without scrolling.
- Font scaling: the greeting, the gauge numeral, the week numbers, and the sync badge cap at
  `maxFontSizeMultiplier={1.2}`; everything else scales freely. With large text the page scrolls,
  text wraps inside its control, and the clock row stacks (above). Nothing is truncated or clipped.

## The attention items

### Model

A pure function in a new `src/utils/homeAttention.js`:

```js
deriveHomeAttentionItems({
  needsAttentionCount,  // from useOffline(): terminal outbox items + reconcile-breaker notes
  autoClockOut,         // null | { entryId, signInTime, detectedAt, dismissedAt } from useTimeTracking()
  coverage,             // { assessed, total } from getAssessmentCoverage, or null while loading
  assessmentDismissedOn,// null | 'YYYY-MM-DD' (local date)
  now,                  // Date
}) => AttentionItem[]   // ordered, length 0..2
```

`AttentionItem = { kind, title, subtitle, accessibilityLabel, route, dismissible }`. Kinds, in
priority order (highest first):

| Kind | Shows when | Title | Sub-line | Tap | Dismiss |
|---|---|---|---|---|---|
| `sync_attention` | `needsAttentionCount > 0`, whatever the transport state (it stays visible while a sync pass runs) | "1 item needs attention" / "{n} items need attention" (the existing `describeSyncState` wording) | "Open sync status to sort it out" | `SyncStatus` | No. It clears only when the count reaches zero. Amber icon tile. |
| `auto_clock_out` | an auto clock-out was detected less than 24 hours ago and is not dismissed | "Clocked out after 10 hours" | "Automatic · {day} · check hours" | `TimeEntriesList` | Yes. Amber icon tile. |
| `assessment_due` | coverage loaded, `total > 0`, `total - assessed > 0`, and not dismissed today | "1 child to assess" / "{n} children to assess" | "{assessed} of {total} children assessed" | the `Assessments` tab | Yes, until the next local day. Neutral icon tile. |

- `{day}` is "Today" when the clocked-in day is today, otherwise the short weekday ("Wed").
- "10 hours" comes from the same `MAX_SHIFT_HOURS` constant the auto clock-out uses; export it
  instead of copying the number.
- Only the top two items are shown. A third waits until one of the first two clears. With three
  kinds this can only hide `assessment_due` behind two higher-priority items.
- Accessibility labels: the title and sub-line as one sentence plus the destination, for example
  "2 items need attention. Open sync status to sort it out". Dismiss buttons say
  "Dismiss: {title}".
- Why the sync card does not say "couldn't upload": `needsAttentionCount` adds reconcile-breaker
  notes (a large Head Office roster change waiting to be applied, `OfflineContext.js:96-103`) to
  terminal outbox items. Neither the count nor the wording can claim every item is a failed upload.
  The canvas boards say "couldn't upload"; this spec supersedes them.
- The hero sync button keeps following `deriveSyncState`, so during a sync pass it shows the
  spinner even when the card is showing. The card is the persistent signal.

### Auto clock-out record

Today the app only shows a snackbar when it auto-clocks someone out
(`TimeTrackingContext.js:62`), and nothing remembers it. The snackbar stays. In addition:

**One conditional close for both clock-out paths.** Today `updateTimeEntry` overwrites a row by id
whether or not it is still open, and manual clock-out writes a snapshot it read before waiting up to
~10 seconds for GPS. If the 10-hour watchdog closes the entry during that wait, the manual write
silently replaces the automatic sign-out. Add `timeEntriesRepository.closeOpenTimeEntry(id,
closeFields, { onClosed })`: inside one writer transaction it updates the row only if
`sign_out_time is null`, enqueues the outbox mutation only if it updated, runs `onClosed(txn)` only
if it updated, and returns whether it closed the row. Both clock-out paths use it:

- Manual: if it returns false, show "You are not clocked in." and reload the active entry (today's
  existing message for this case).
- Automatic: if it returns false (already closed by another path or an earlier call), do nothing:
  no record, no snackbar.

**The notice record.** When the automatic close succeeds, `onClosed` writes one row to
`local_state` in the same transaction, under the key
`home_attention.auto_clock_out.{entry.user_id}`, value `{ entryId, signInTime, detectedAt }`.

- The key uses the time entry's own `user_id`, never "whoever is signed in now", so a late write
  can only ever land in its owner's slot. Home reads only the current user's slot.
- `detectedAt` is the device time when the app noticed, not the computed `sign_out_time`. If the
  phone was off for three days, the computed sign-out time is three days old, but the EA has never
  been told.
- The record is device-local and is never synced. A newer auto clock-out replaces it; one card at
  most.

**Dismissal.** `dismissAutoClockOutNotice(entryId)` sets `dismissedAt` inside one writer
transaction, and only if the stored record's `entryId` equals the one the EA dismissed. A
mismatch leaves the record alone (a newer notice arrived) and the provider reloads it. The card
hides when `dismissedAt` is set or `now - detectedAt >= 24h`.

**Publication.** `TimeTrackingContext` owns the notice. It loads the current user's record when the
user changes, republishes it in state right after a successful automatic close and after a
dismissal, and exposes `autoClockOutNotice` and `dismissAutoClockOutNotice` through
`useTimeTracking()`. Home renders from that state, so an auto clock-out that commits while Home is
already on screen (the watchdog, or the startup check finishing after Home's first load) shows the
card without navigation.

### Assessment dismissal record

- Dismissing writes the local date to `local_state` key
  `home_attention.assessment_due_dismissed_on.{userId}`. The card hides while that date equals
  today's local date, and comes back the next day if children still need assessing.

### Freshness

- Today Home recomputes its stats only when the screen gains focus. If the app sits in the
  background overnight, it shows yesterday's numbers the next morning until the EA navigates.
- Add: when the app returns to the foreground (`AppState` `active`) while Home is focused, recompute
  the stats and refresh Home's `now`. Focus does the same, as today. This keeps the gauge, the week
  strip, the assessment card, and the notice expiry current after the phone has been locked
  overnight.
- The sync card and the auto clock-out card come from live provider state and update without a
  reload.
- **Accepted risk (no timer):** if Home stays on screen with the phone unlocked across midnight, or
  past a notice's 24-hour expiry, it shows the old day or the expired card until the next focus or
  foreground. Phones lock long before that in practice, and locking triggers the foreground
  refresh. A midnight timer is not worth its complexity.

## Typography and fonts

The design uses two Google fonts: **Bricolage Grotesque** (display: the greeting, numbers,
headings) and **Figtree** (text). The app ships neither today; it uses the system font.

**Recommendation:** add `@expo-google-fonts/bricolage-grotesque` and `@expo-google-fonts/figtree`
(maintained by Expo, widely used, OFL-licensed fonts; `expo-font` ships with Expo SDK 54). Pin exact
versions that have been published for more than 24 hours, per the repo's supply-chain rule. Load
only the weights used: Bricolage 800; Figtree 500, 700, 800. Load them at the app root with
`useFonts` and hold the splash screen until they load or fail (`expo-splash-screen`:
`preventAutoHideAsync` before the first render, `hideAsync` once settled); on failure fall back to
the system font so the app never blocks.

Add font roles to `src/constants/typography.js` (`displayXL` 32, `displayL` 48 numeral,
`displayM` 20, `textBody` 15, `textCaption` 13, `textLabel` 11 caps) carrying family, size, line
height, weight, and letter spacing. Home uses only these roles.

**Consequence Jim should accept explicitly:** for a while, Home will use the new fonts and the rest
of the app the system font, until each screen gets its redesign. The alternative is to switch the
whole app's text font at once in a separate change.

## Testing

Test through public surfaces, per the repo TDD rule.

- `homeAttention` unit tests: every kind's show and hide conditions; priority order; the two-item
  cap; plurals; "Today" vs weekday; the 24-hour boundary on both sides; dismissed today vs
  yesterday; coverage still loading; zero children.
- `homeAttention` sync cases: reconcile-note-only attention (no outbox failures) shows the generic
  copy; the card stays while `isSyncing` is true with a non-zero attention count.
- `closeOpenTimeEntry`, with real SQLite (`better-sqlite3`): closes an open row once and enqueues
  one outbox mutation; a second call on the closed row changes nothing and enqueues nothing;
  `onClosed` runs only on success, in the same transaction (a throw inside it rolls back the close).
- Clock-out race: the watchdog closes the entry while a manual clock-out waits for GPS; the
  automatic sign-out and `auto_clocked_out` survive, the notice exists, and the manual path shows
  "You are not clocked in."
- Notice record: `detectedAt` is the detection time, not the computed sign-out time; a repeated
  automatic attempt keeps the original `detectedAt` and dismissal; the key uses the entry's
  `user_id`; dismissing an `entryId` that no longer matches the stored record changes nothing.
- Provider publication: Home's first load finishes, then the auto clock-out commits; the card
  appears without navigation or an `AppState` change.
- `SegmentedSessionGauge`: segment count and colour per state, the continuous fallback above 6,
  the no-target arc, the accessible label.
- Hero `SyncIndicator`: glyph, disc, badge, and label for each of the five states; "99+".
- `HomeScreen` tests: rewrite the tests for removed sections (who to see next, recent, coverage
  row) into tests for the new layout; keep the onboarding-routing and stats-failure tests; add
  clock-row states, attention cards with tap and dismiss, foreground refresh, and the date
  rollover.
- `colors.test.js` does not change (no new tokens).
- Device gate: iOS and Android screenshots of normal day, morning, getting location, target met,
  above ceiling, no target, sync attention, offline, two messages, a 360dp Android phone with two
  messages, compared against the canvas boards; and the largest system font size on both
  platforms, checking that all text is complete and the clock action and dismiss buttons are each
  tappable on their own; sync badges showing 1, 12, and 99+ are complete.

## Documentation updates in the build branch

- `PRD.md` §6.2 Home: replace the list with the new contents and the attention-area rules.
- `documentation/design-system.md`: the typography roles and fonts; the segmented gauge; the
  attention card.
- `documentation/build-log.md`: the work, review findings, verification, device checks.
- `documentation/ROADMAP.md`: remove any Home items this closes.

## Out of scope

- Every other screen's redesign (login, children, record, celebration, profile).
- Moving "who to see next" into the session flow (Jim's session-flow rebuild).
- A time window for "assessed" (today a child counts as assessed if ever assessed:
  `getAssessmentCountsSince` is called without a start date). Revisit with Insights.
- A confirm step before clocking out. The canvas has a proposal; it is not decided.
- Insights redesign beyond the Session History entry already added.
- **Existing account-switch race in `TimeTrackingProvider` (file as its own issue).** The provider
  outlives sign-out (`App.js`), and `loadActiveEntry` publishes its result without checking that
  the same user is still signed in. A Codex probe reproduced: EA A's slow startup check finishing
  after EA B signs in clears B's clock display and shows A's snackbar. It needs a sign-out followed
  by a different sign-in on one phone while a read is still running, so it is rare, and it predates
  this work. This spec only makes sure the new notice cannot leak across accounts (it is keyed by
  the entry's owner and read for the current user only).

## Open questions

1. Accept the mixed-font period above, or switch the whole app's text font at once?
2. If an EA has two auto clock-outs in a row without opening the app, the card describes only the
   latest one. Acceptable? (Work history shows both.)

## Review log

**Codex adversarial review, round 1 (2026-10-17): needs attention, 7 findings.**

| Finding | Decision |
|---|---|
| High: account isolation for the new record | Partly accepted. The record is keyed by the time entry's own `user_id` and read for the current user only. The underlying provider race predates this work and is rare; filed as out of scope. |
| High: a manual clock-out can overwrite an automatic one | Accepted: `closeOpenTimeEntry`, a conditional close shared by both paths; only a successful automatic close writes the notice. |
| Medium: dismissal can clobber a newer notice | Accepted: dismissal is conditional on `entryId`. |
| Medium: the attention count is not an upload-failure count, and syncing hides the card | Accepted: generic "needs attention" copy; the card follows the count, not the transport state. |
| Medium: an auto clock-out does not reach a Home already on screen | Accepted: the time-tracking provider owns and publishes the notice. |
| Medium: no refresh across midnight or at notice expiry while Home stays on screen | Declined, recorded as an accepted risk: foregrounding covers the real case; a timer is not worth it. |
| Medium: fixed heights and one-line rules break at large text sizes | Accepted: heights are minimums, text wraps, and the clock row stacks above font scale 1.3. |

**Round 2 (2026-10-17): needs attention, 1 finding.** Codex confirmed the round-1 fixes are
buildable. Medium: the sync badge's fixed height clipped its count at large text sizes. Accepted:
the badge caps at 1.2x like the other compact numbers and grows instead of clipping. Codex's
implementation note, carried into the plan: `closeOpenTimeEntry` must keep the repository's
existing pending-insert coalescing behaviour. With that one narrow, verified fix, the spec is
approved for planning; no third round.

**Plan review (2026-10-17): needs attention, 4 findings, all accepted and folded into the spec and
plan.** A failed first load left the skeleton up forever (now a truthful fallback; refresh failures
keep the last good stats); the imperative status-bar setter fought the root `<StatusBar>` (now a
focus-scoped declarative one); the splash was not held during font loading (now
`expo-splash-screen`); the clock label test assumed 12-hour time but the app's formatter is 24-hour.

**Plan review round 2 (2026-10-17): approve, no findings.** Codex executed the plan's snippets and
test rewrites in memory on Node 20: 134 tests passed across 23 suites (Home 18/18, including the
failed-first-load fallback, refresh-failure retention, focus-scoped status bar, 24-hour clock label,
and the real-SQLite conditional-close, rollback, publication, and race tests). Not verified there:
real dependency installation, the file-backed integration setup, and native startup; those are the
build's Task 6, Task 10 Step 5, and Task 12 gates.
