# Bold Red app, part 4: Session complete

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Session complete

**Boards (the target):** `red-complete-final` (3/3, the Receipt layout; `red-flow-07-celebration` is
the same board), states `red-complete-s-midday`, `-s-first`, `-s-above`, `-s-offline`,
`-s-overflow`, `-s-backdated`, `-s-notarget`, and `red-complete-components` (motion storyboard,
confetti, gauge gating, sync line, receipt rules, secondary states, build notes). Ignored:
`red-complete-v-alt`, `-v-alt-midday` (summary-card variant). `red-flow-08-home-target-met` shows
the **v1** Home (who to see next, coverage row, Recent). Home v2 replaced it, so this section
takes only one thing from it: after Done, Home shows today's met state.

**Code today:** `src/screens/sessions/SessionCompleteScreen.js`, reached only from
`LiteracySessionForm.js:538` via `navigation.replace('SessionComplete', { childCount })`, so the
stack is always `[MainTabs, SessionComplete]`. Route options (`AppNavigator.js:253`): header
"Session saved", `headerLeft: () => null`, `gestureEnabled: false`.

**Scope:** this screen only, plus the pieces it needs: a size-parameterised gauge geometry, the
`deviceTier`/reduced-motion contract, extra route params from the form, and Done's destination.
**No schema, RLS, payload, or outbox change.** Every new value on the screen is already in the
form's state at submit time.

### What changes, element by element

| Element | Today | Bold Red |
|---|---|---|
| Header | Stack header "Session saved" | None (`headerShown: false`). The headline is the screen title (`accessibilityRole="header"`). |
| Top of screen | Canvas, a 72dp green `checkmark-circle` | Red field (`red600`) behind the status bar, with a halo ring, a white "captured" pill, and a 44dp white headline |
| Title | "Session captured" (Paper `titleLarge`) | "Session\ncaptured." or "Daily target\nreached." (rules below) |
| Confirmation | "Saved for 2 children." / "Nice work — it's saved." as body text | The pill: "Saved for 2 children" (no full stop), "Saved for 1 child", "Saved for 2 children · Tue 13 Oct" (back-dated), fallback "Nice work — it’s saved." |
| Progress | `SessionsTodayRing` (132dp full circle, "of 3"), caption "SESSIONS TODAY", hidden while `goal` is null | White card straddling the field edge: a 232x128 segmented half gauge (same geometry and colour rule as Home), heading, and an optional sub-line |
| Session detail | None | Receipt: Children / Letters / Reading level rows |
| Sync status | None | A live sync line above Done (presenter copy) |
| Done | Paper contained button, `navigation.goBack()` | Full-width 56dp red pill, pinned at the bottom; goes to the Home tab (see Navigation) |
| Motion | None | The storyboard below, with a still version |
| Errors | `getSessionsTodayGoal` has no `.catch`: a rejection is unhandled and the ring never appears | Rejection and `null` both get the no-card layout |

### Layout (dp at 390x844; flow-based, measured from the safe area)

The body is a `ScrollView` holding the field, pill, headline, card and receipt; they scroll
together. The footer (sync line + Done) sits **below** the ScrollView in a flex column, so content
never runs under it.

**Field and hero**

- Field: `colors.red600`, from the screen top (behind the status bar) to **108dp below the card's
  top edge**. Its height comes from its content, like Home's (`hero` padding plus the card's
  negative top margin, Home's `CARD_STRADDLE` pattern with 108 instead of 56).
- Pill: top = `insets.top + 11` (58 at iPhone safe area 47), centred horizontally.
- Headline: 16 below the pill, 24 side padding, centred, two lines.
- Gap from the headline's bottom to the card's top: `max(112, round(W/2 − 83))`. At 390 that is
  112, so the card top is at 312 and the field ends at 420, as on the board. The formula keeps the
  halo band 16dp clear of the headline on wide phones (411: 123, 430: 132).
- Status bar: light content through a focus-scoped `<StatusBar style="light" />`, and a fixed
  `red600` strip of height `insets.top` outside the scroll content, both exactly as Home does it.
  Red overscroll above the content (Home's `overscrollRed`).

**Halo** (decorative, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`)

- One circle stroke, `colors.red500`, stroke width 32, `cx = W/2`, **`r = W/2 + 19`**,
  **`cy = fieldBottom + 26`**, clipped by the field (`overflow: 'hidden'`). At 390 this is
  exactly the board's circle (cx 195, cy 446, r 214).
- Draw it in an Svg anchored to the field's bottom (`position: 'absolute', bottom: 0`, height
  `r − 9`) so no `onLayout` is needed.
- Why the formula and not the board's fixed r 214: the board relies on the inner edge (r − 16)
  exiting the screen sides above the field edge. With a fixed 214 on the 411dp A03s, the inner edge
  never reaches the sides and the band is cut flat at the field's bottom corners. With
  `r = W/2 + 19` the inner leg exits the sides 7–9dp above the field edge at every width from 360 to
  430, and the outer band's top stays 16dp or more below the headline when the gap formula above is
  used.

**Pill**

- `minHeight` 34, radius 17, white (`colors.surface`), padding 0 16 0 7, gap 8, row, centred.
- Shadow: `shadowColor: colors.red900`, offset 0/6, opacity 0.18, radius 8, `elevation` 3
  (board: `0 6px 16px rgba(83,11,23,.18)`).
- Check disc: 22x22, radius 11, `colors.success`, white check 14dp (board path `m5 12.5 4.5 4.5L19
  7.5`, stroke 3, round caps, via react-native-svg).
- Text: `textChip` (new role, below), `colors.text`. At large sizes the pill grows taller and the
  text wraps centred. It never truncates.

**Card** (`accessibilityLabel="Today’s sessions"` on the container, like Home)

- White, `borderRadius.xl` (22), `shadows.elevated` (the board's card shadow is the same CSS Home
  mapped to `elevated`), margin 0 24, padding 18 top, 20 sides, 16 bottom, centred.
- Gauge 232x128 (below). Heading 10 below the gauge. Sub-line 2 below the heading.
- Height 217 with a sub-line, 196 without.

**Receipt** (20 below the card, 24 side margins)

Rows in this order: **Children**, **Letters**, **Reading level**. A row renders only if its value is
present. If no row has data, there is no receipt.

- Row: `minHeight` 52, `flexDirection: 'row'`, `justifyContent: 'space-between'`, gap 16.
  Divider 1dp `colors.text + '1F'` under every row except the last.
- Label: `textRowLabel` (new), `colors.textSecondary`, never wraps.
- Value: `textValue` (new), `colors.text`, `flex: 1`, padding 8 top and bottom.
  - Text rows (Children, Reading level): right-aligned on one line. When `onTextLayout` reports
    more than one line, the value turns left-aligned and the label aligns to the first line
    (label `marginTop` 11 instead of being centred). This matches `s-overflow`.
  - Letters: wrapping row of tiles, `justifyContent: 'flex-end'` (`'flex-start'` once it wraps),
    gap 6, `maxWidth` 246, so 6 tiles fit per row at 390. The label `marginTop` is 18, which lines
    it up with the first tile row whether there is one row or several. Tiles never shrink and
    never collapse to "+N".
- Letter tile (read-only): 36x36, radius 9 (`borderRadius.sm`), fill `colors.red50`, border 1.5
  `colors.red100`, letter `textValue` in `colors.red700`, centred, `maxFontSizeMultiplier={1.2}`.
- Values:
  - Children: the first names in selection order, joined as "A", "A & B", or "A, B & C" (the
    rule from Home's retired `formatChildNames`). Always the full list, never "+3 more".
  - Letters: the selected letters **sorted by `LETTER_ORDER`**, the teaching order every board
    uses.
  - Reading level: the `READING_LEVELS` string ("3 Letter Blends").
- Each row is one accessible element (`accessible`) with the label "Children: Anelisa and
  Athenkosi" (spoken with "and", not "&"), "Letters: m, l, n, s", or "Reading level: 3 Letter
  Blends". The tiles are not read one by one.

**Footer** (pinned)

- Padding 12 top, 24 sides, `max(insets.bottom, 16)` bottom. The sync line sits 14 above Done.
- At rest the footer is bare canvas. When the ScrollView's content height is greater than its
  viewport (from `onContentSizeChange` and `onLayout`), the footer gets the sticky style: white
  (`colors.surface`) with a 1dp `colors.border` top edge. This is the same treatment as Record's
  sticky submit bar, so it is one shared component (see Components).
- Sync line: `textCaption`, `colors.textSecondary`, centred, `minHeight` 18. The glyph is
  **inside** the Text (a nested 18dp Ionicons, 8dp right margin), so a wrap cannot strand it.
  When it wraps at large text the footer grows upwards and Done does not move.
- Done: the shared-look primary button (`BrandButton` after the shared-look PR restyles it):
  height 56, full width, radius 999, `colors.red600`, label "Done" in `textButtonL`, white.
  Shadow `shadowColor: colors.red600`, offset 0/10, opacity 0.22, radius 11 (Android: elevation 4;
  shadow colour only from API 28). It can be tapped from mount and never waits for the goal or for
  motion.

### Gauge

**Reuse Home's geometry, not Home's component.** Measured from the board, the 232x128 gauge is
Home's `sessionGaugeGeometry` scaled. Both are built by the same formulas:
`cx = cy = width/2`, `r = width/2 − stroke/2 − 0.5`, `height = cy + stroke/2 + 1`, 5° gaps, and
end dots of radius `stroke/2`.

| Size | width | stroke | r | height | numeral | suffix |
|---|---|---|---|---|---|---|
| `home` (unchanged) | 176 | 16 | 79.5 | 97 | `displayNumeral` 48 | text 17 |
| `celebration` | 232 | 22 | 104.5 | 128 | `displayNumeralXL` 64 | Figtree 700 24/28 |

- `buildGaugeGeometry(goal, size = GAUGE_SIZES.home)` takes the size, and both `GAUGE` presets
  live in it. The segment, continuous (target above 6), no-target, and colour rules are unchanged
  (`getGaugeColor`).
- Numeral: `colors.text` (`textSecondary` at 0, Home's rule), tabular, `maxFontSizeMultiplier={1.2}`,
  centred on the gauge's centre line, bottom offset 1. Suffix "/3": Figtree 700 24/28,
  `colors.textSecondary`, 1dp left margin, on the zero-width anchor Home uses.
  - `below`/`met`: "/{target}".
  - `exceeded`: no suffix.
  - `no_target`: **" today"** with a 4dp left margin. The board shows this; Home shows no suffix. Home
    stays as it is.
- Heading: `getGoalCopy(goal, true).title` in `displayS`, `colors.text`, centred. One line at
  normal sizes, wraps at large sizes.
- Sub-line: `getGoalCopy(goal, true).subtitle` in `textSmall`, `colors.textSecondary`, centred.
  **Hidden whenever the headline is "Daily target reached."** so the screen does not say it twice.
- Accessible: one `image` with `getGaugeAccessibilityLabel(goal)` for the **final** goal from the
  first frame, even while the numeral still shows count − 1.
- **Skeleton** (before the goal resolves; board F0): the track as one continuous `colors.border`
  arc with border-coloured end dots (the target is not known yet), no numeral, then two bars:
  168x18 radius 9 (13 below the gauge) and 212x12 radius 6 (12 below that), both `colors.border`.
  This is exactly the card's height with a sub-line (217).

### Content rules (the gating table)

`isToday = route.params.sessionDate === toLocalDateString(now)`. This is the same day key
`getSessionsTodayGoal` counts. A missing `sessionDate` counts as not today, so the fallback is
static and never a false celebration.

| Case | Headline | Card sub | Gauge motion | Confetti | Boards |
|---|---|---|---|---|---|
| `isToday && state === 'met' && count === target` | "Daily target\nreached." | hidden | sweep from count − 1, then flip | **yes** | final, s-overflow |
| `isToday && state === 'met' && count > target` (up to the ceiling) | "Daily target\nreached." | hidden | numeral cross-fade only (already green) | no | components 06 "4 of 3" |
| `isToday && state === 'below'` | "Session\ncaptured." | shown | sweep from count − 1, then flip | no | s-first, s-midday, s-offline |
| `isToday && state === 'exceeded' && count === ceiling + 1` | "Session\ncaptured." | shown | no sweep; green to amber flip; "/3" fades out with the old numeral | no | s-above |
| `isToday && state === 'exceeded' && count > ceiling + 1` | "Session\ncaptured." | shown | numeral cross-fade only | no | (follows s-above) |
| `!isToday` (back-dated) | "Session\ncaptured." | shown | **static**: today's gauge, which does not include this session | no | s-backdated |
| `state === 'no_target'` | "Session\ncaptured." | shown | static neutral arc; numeral cross-fade if `isToday` | no | s-notarget |
| goal `null` or rejected | "Session\ncaptured." | n/a | **no card, no halo**; the field ends 32 below the headline and the receipt starts 20 below the field | no | components 06 (not drawn) |
| `isToday && count === 0` (count disagrees with the save; defensive) | "Session\ncaptured." | shown | static | no | none |

- The pill's back-dated suffix is " · {Ddd D Mmm}", for example " · Tue 13 Oct": day and month, no
  year. It is formatted from the `YYYY-MM-DD` parts with fixed English arrays (as
  `formatDateForDisplay` does), not `Intl`, so Hermes' ICU cannot change it. Note: the board calls
  this "the form's format", but the form today shows "Tue, Oct 13, 2026".
- A goal `null` happens when there is no active programme, or the programme row is not on the
  phone yet, at read time. `persistLiteracySession` resolves the active programme inside the save,
  so this should be rare. The screen confirms the capture and says nothing else. Home owns the
  no-programme messaging.
- `getGoalCopy` is called with `isSignedIn = true`. If the count is 0, the sub-line would otherwise
  be "Clock in to start your day." That is the wrong prompt on this screen.

### Motion

**Library:** React Native `Animated` + `react-native-svg` 15.12.1. Both are installed, and Home's
sync spinner already uses `Animated`. **No new dependency.** `react-native-reanimated` would move
the one SVG-prop animation (the earned-segment sweep) to the UI thread. But it brings a native
module, a Babel plugin and new-architecture coupling, all for a single 300ms path. The rest runs on
the native driver anyway. Not worth it.

**Gauge layers (stage flip without colour interpolation):** two stacked Svgs, each in its own
`Animated.View`:

- The **from** layer is drawn from `fromGoal`, where `fromGoal = { ...goal, count: count − 1,
  state: deriveGoalState({ target, ceiling, count: count − 1 }) }`. `deriveGoalState` is
  extracted from `getSessionGoal` so the state rule lives in one place.
- The **to** layer is drawn from `goal`.
- The cross-fade is opacity only, on the native driver.
- **Earned segment:** in the from layer, the arc this session filled (segment index `count − 1`,
  or the `(count−1)/target … count/target` slice of the continuous arc above 6) is an
  `Animated.createAnimatedComponent(Path)`. Its `strokeDasharray` is `[len, len]` and
  `strokeDashoffset` animates `len + 1 → 0` on the JS driver, because SVG props cannot use the
  native driver.
- `len` is the arc length `r × spanRadians` (103.4 at target 3). No `getTotalLength`.
- It sweeps in the **from** colour (`getGaugeColor(fromGoal)`). When `count − 1 === 0` it sweeps in
  the **to** colour instead, because there is nothing to flip from (board: "1/3 sweeps in
  ringStart", and Yeboneer's 1/1 sweeps straight in green).
- There is an earned segment only when `count ≤ target`. When the two layers' colours are
  identical, skip the layer cross-fade and keep only the numeral cross-fade.

**Numeral and heading:** two stacked Text layers. The old one (count − 1, with its suffix) fades
out. The new one fades in and rises 4dp (`translateY 4 → 0`). The heading and sub-line swap the
same way, from `getGoalCopy(fromGoal, true)` to `getGoalCopy(goal, true)`. When
`fromGoal.count === 0`, the old sub-line slot is left blank, so "Record your first session." never
flashes.

**Timeline.** Card and pill: from **mount**. Everything else: from **goal resolve** (t = 0, about
20–80ms after mount on SQLite).

| Track | Property | Time | Easing | Driver |
|---|---|---|---|---|
| Card | translateY 24 → 0, opacity 0 → 1 | mount + 0–300 | Enter `Easing.bezier(0.2, 0.8, 0.2, 1)` | native |
| Pill | translateY −8 → 0, opacity 0 → 1 | mount + 0–200 | Enter | native |
| Skeleton to content | opacity cross-fade | 0–150 | linear | native |
| Earned segment | strokeDashoffset len+1 → 0 | 250–550 | `Easing.out(Easing.cubic)` | JS |
| Stage flip + numeral (+ heading/sub) | layer opacity; new numeral 4dp rise | 650–800 | Enter | native |
| Confetti travel | 36dp out along each ray | 700–1000 | `Easing.out(Easing.cubic)` | native |
| Confetti fade | opacity 1 → 0 | 1000–1300 | linear | native |
| Headline (exact target only) | opacity 0 → 1, translateY 8 → 0 | 800–1100 | Enter | native |
| Headline (every other case, incl. goal null) | same | 100–400 | Enter | native |
| Sync line | opacity cross-fade per state change | 150 each | linear | native |

- Card and pill run from mount because their content is known at mount. If the goal is slow, the
  card enters showing its skeleton (board F0). The storyboard's "0 ms = goal resolved" applies to
  every goal-dependent track. This is my call (see Builder's calls).
- Before the goal resolves, the headline slot keeps its two-line height at opacity 0, so nothing
  moves when it appears.
- The tracks start together with `Animated.parallel` of `Animated.sequence([Animated.delay(t),
  Animated.timing(...)])`. Every composite is stopped in the effect cleanup, so unmounting
  mid-animation is safe. Nothing loops or pulses. The sync spinner is sync state, not
  celebration.
- Total under 1.5s. At rest the screen shows exactly the final board.

**Confetti** (the components board's C3 "three fans", which was chosen):

- 22 absolutely positioned `View`s in a layer between the halo and the card: z-order field → halo
  → confetti → pill/headline → card. Pieces that start below the card's top edge emerge from
  behind it.
- One shared `travel` value and one shared `fade` value (both 0 → 1, native). Each piece gets
  `translateX/Y = −36·u·(1 − travel)` and `opacity = 1 − fade`.
- The layer's opacity jumps from 0 to 1 at 700ms (a 0ms timing in the sequence), so pieces are not
  visible at their start positions beforehand.
- Two values, not the board's single value with an `inputRange [0, .5, 1]` easing: native
  interpolation cannot carry an easing function.
- Kinds:
  - sliver: 3.5x14, radius 1.5, rotated to its ray;
  - dot: 8, radius 4;
  - square: 8x8, radius 1.2.
- Colours: `colors.surface` (white), `colors.red100`, `colors.red200` only. Never green.
- Rest positions are relative to (centre x, card top). `dx` is multiplied by `min(1, W/390)` so
  the outer pieces stay 12dp or more inside the frame at 360. Taken from the storyboard's F4 frame
  (the peak), with the ray `u` from F3 → F4:

| # | kind | colour | dx | dy | rot° | u |
|---|---|---|---|---|---|---|
| 1 | sliver | white | −100.8 | −33.7 | −31 | (−0.51, −0.86) |
| 2 | dot | white | −122.9 | −23.3 | 0 | (−0.62, −0.79) |
| 3 | square | white | −100.6 | −63.5 | 18 | (−0.45, −0.89) |
| 4 | sliver | white | −124.0 | −49.8 | −34 | (−0.56, −0.83) |
| 5 | dot | red100 | −148.1 | −36.3 | 0 | (−0.66, −0.75) |
| 6 | dot | red200 | −100.7 | −92.3 | 0 | (−0.40, −0.92) |
| 7 | sliver | white | −132.3 | −77.7 | −32 | (−0.53, −0.85) |
| 8 | square | red200 | −163.1 | −60.3 | 5 | (−0.64, −0.76) |
| 9 | dot | white | 0.0 | −19.7 | 0 | (0.00, −1.00) |
| 10 | square | red200 | 18.4 | −40.7 | 51 | (0.11, −0.99) |
| 11 | dot | white | −18.4 | −40.7 | 0 | (−0.11, −0.99) |
| 12 | dot | red100 | 44.9 | −60.6 | 0 | (0.22, −0.97) |
| 13 | square | white | 0.0 | −63.7 | 45 | (0.00, −1.00) |
| 14 | dot | red100 | −44.9 | −60.6 | 0 | (−0.22, −0.97) |
| 15 | sliver | white | 103.9 | −38.9 | 31 | (0.52, −0.86) |
| 16 | dot | white | 119.2 | −18.6 | 0 | (0.62, −0.79) |
| 17 | square | white | 98.8 | −60.0 | 72 | (0.45, −0.89) |
| 18 | sliver | white | 127.3 | −54.8 | 34 | (0.55, −0.83) |
| 19 | dot | red100 | 148.3 | −30.7 | 0 | (0.67, −0.75) |
| 20 | dot | red200 | 99.1 | −88.6 | 0 | (0.41, −0.91) |
| 21 | sliver | white | 134.4 | −81.1 | 32 | (0.53, −0.85) |
| 22 | square | red200 | 159.2 | −55.7 | 85 | (0.64, −0.77) |

Board conflict: `red-complete-final`, `-s-overflow` and `red-flow-07` draw a different 24-piece
scatter (close to the rejected C1), although the storyboard says F4 "is the frame the final comp
shows". This spec builds C3 (above). The final boards' confetti is stale.

**Still version (reduce motion or low-end device):** no sweep, no flip, no confetti, no rises or
slides.

- At mount the pill, receipt and footer are in place and the card shows its skeleton.
- When the goal resolves (or fails), the card's final content and the headline fade in once, over
  150ms (opacity only).
- The sync line still cross-fades. The syncing glyph does not rotate under OS Reduce Motion (Home's
  rule). It still rotates on a low-end device, as Home's hero spinner does.

### `deviceTier` / reduced-motion contract (closes ROADMAP §5 item)

This PR adds it. Session complete is the first celebratory animation, and the ROADMAP item says the
contract must come first.

- `src/utils/deviceTier.js`: a pure `classifyTier({ platform, deviceYearClass, totalMemory,
  reduceMotion })` → `'high' | 'low' | 'static'`, ported from Zazi
  (`zazi-izandi-app/src/utils/deviceTier.js`) without the letter-rain fields.
  - iOS: `high`.
  - Android under 1.5 GB reported RAM: `static`.
  - Android with year class before 2019, or under 3 GB: `low`.
  - Android with no signal: `low`.
  - Reduce Motion on: always `static`.
- `src/hooks/useMotionPreference.js` returns `{ tier, reduceMotion }`. It reads
  `AccessibilityInfo.isReduceMotionEnabled()`, subscribes to `reduceMotionChanged`, and reads
  `expo-device` `deviceYearClass` and `totalMemory`. `expo-device` is already installed. Android's
  "Remove animations" setting reports as Reduce Motion.
- Session complete: `motion = tier === 'high' ? 'full' : 'still'`. This follows Jim's "low-end gets
  still" literally. See Questions: the A03s test phone reports 2.9 GB and is therefore `low`.
- `HeroSyncIndicator` (`SyncIndicator.js`) switches from its own `isReduceMotionEnabled` call to
  `useMotionPreference().reduceMotion`. That leaves one source of truth, and it now also follows
  live changes to the setting.

### Sync line

- Driven by `deriveSyncState` + `describeSyncState` from `useOffline()`. The copy is the
  presenter's own `message`, verbatim, straight apostrophe included:
  - "Saved on your phone · 3 waiting to sync"
  - "Saved on your phone · 5 will sync when you're online"
  - "Syncing…"
  - "All saved and synced"
  - "1 item needs attention" / "{n} items need attention"
- Glyphs (18dp):

| State | Glyph | Colour |
|---|---|---|
| waiting | `cloud-upload-outline` | `textSecondary` |
| offline | `cloud-offline-outline` | `textSecondary` |
| synced | `cloud-done-outline` | **`colors.successText`** (see a11y) |
| needs_attention | `alert-circle-outline`, text in `colors.warningText` | `colors.warningText` |
| syncing | 18dp ring: track `colors.textSecondary + '47'` (28%), quarter arc `textSecondary`, stroke 2.6, rotating 1000ms linear on the native driver | `textSecondary` |

- The board does not draw `needs_attention`.
- **Truthfulness fix:** `OfflineContext` state is stale at mount. `navigation.replace` runs before
  `refreshSyncStatus()`, so an EA who was fully synced would briefly see "All saved and synced"
  for work that has not uploaded.
  - The screen calls `refreshSyncStatus({ autoTrigger: false })` on mount. It renders the line
    only after that call returns a **non-null** snapshot while `handle.isCurrent()`. The 18dp slot
    stays reserved and blank until then.
  - If the call returns `null` (read failure or stale handle; previous counters are kept), the
    line shows the neutral "Saved on this phone" (`cloud-outline`, `textSecondary`), never
    "All saved and synced" (overview §8 R1).
  - Test: previous counters all zero, refresh resolves `null`, so the line says "Saved on this
    phone".
  - The extra call is one cheap SQLite read, and the form's own call stays as it is.
- Board timing claim corrected: "Syncing…" appears about 1s after mount, not 50–200ms, because
  `triggerBackgroundSync` debounces by 1000ms (`OfflineContext.js:11`).
- A plain View, not a live region, and not tappable. Home's attention card handles
  `needs_attention` after Done.

### Navigation

- **Done → Home tab:** `navigation.popTo('MainTabs', { screen: 'Home' })`.
  - React Navigation 7 gotcha (verified in `@react-navigation/routers` 7.5.3,
    `StackRouter` NAVIGATE): a plain `navigate('MainTabs', …)` **pushes a second MainTabs**,
    because v7 only goes back to an existing route with `pop: true`. Use `popTo`.
  - A ref guards against a double tap.
- Android hardware back calls the same exit, through a focus-scoped `BackHandler` that returns
  `true`. The iOS swipe stays disabled (`gestureEnabled: false`, unchanged).
- Home reloads on focus (`HomeScreen.js:66`) and shows the new count **statically**. Home does not
  animate: the payoff now plays here, and animating again on Home would celebrate twice (the
  board's G1 note).
- **This closes the ROADMAP §5 item "Session completion should return to the Home payoff state
  instead of a bare `goBack()`."** It contradicts the components board's build note ("Done …
  goBack()"). See Questions.

### Route params (data, not behaviour)

`LiteracySessionForm.handleSubmit` passes everything it already holds:

```js
navigation.replace('SessionComplete', {
  childCount: selectedChildIds.length,
  childNames: selectedChildren.map((c) => c.first_name || 'Child'),
  letters: sortByLetterOrder(selectedLetters),
  readingLevel: sessionReadingLevel,
  sessionDate: formatDateForStorage(sessionDate), // 'YYYY-MM-DD', the stored session_date
});
```

All values are serialisable strings or arrays. **No new data source, no schema/RLS/outbox
change.** Group names are not available: the form writes `group_ids: []`. The board's open question
"show the group name?" belongs to the group-session rebuild (ROADMAP §4).

### Type roles and tokens

**No new colour token.** Every hex on the boards maps to an existing token.

| Hex | Token | Board use |
|---|---|---|
| #C81F3E | `red600` | field, Done, status-bar strip |
| #E72D4D | `red500` / `primary` | halo; in-progress segments |
| #3FA535 | `success` | met segments, check disc |
| #B26A00 | `accent` | exceeded segments |
| #8A939C | `ringStart` | 1-session segment |
| #9AA3AB | `ringNeutral` | no-target arc |
| #ECE5E4 | `border` | empty segments, skeleton, sticky footer edge |
| #FDECEF / #FBD5DC / #A4182F | `red50` / `red100` / `red700` | letter tile |
| #F4A9B6 | `red200` | confetti |
| #221A1B / #76696B / #F8F5F4 / #FFF | `text` / `textSecondary` / `background` / `surface` | — |

Translucent fills follow the design-system rule (token + alpha):

- dividers `colors.text + '1F'`;
- spinner track `colors.textSecondary + '47'`.

Shadows:

- card: `shadows.elevated`;
- pill: `shadowColor: red900`;
- Done: `shadowColor: red600`.

**New type roles** (proposed, in `typeRoles`; each a weight-specific face with no `fontWeight`;
reconcile names with the other sections):

| Role | Face | Size/line | Tracking | Used for |
|---|---|---|---|---|
| `displayHero` | Bricolage 800 | 44/46 | −1.5 | headline (`maxFontSizeMultiplier` 1.2) |
| `displayNumeralXL` | Bricolage 800 | 64/64 | −1.3 | gauge numeral (cap 1.2) |
| `displayS` | Bricolage 800 | 18/24 | −0.3 | card heading |
| `textSmall` | Figtree 500 | 14/19 | 0 | card sub-line |
| `textChip` | Figtree 800 | 14/18 | 0 | pill |
| `textRowLabel` | Figtree 800 | 12/16 | 0.96, uppercase | receipt labels |
| `textValue` | Figtree 700 | 16/22 | 0 | receipt values, letter tiles |
| `textButtonL` | Figtree 800 | 17/20 | 0 | Done (likely the shared-look button role) |

Existing roles used: `textCaption` (sync line). The board's sync line is Figtree **600**, which the
app does not load (500/700/800 only). `textCaption` (500) is used rather than loading a fourth
weight.

**Proposed shadow token:** `shadows.button` (red600, 0/10, 0.22, 11, elevation 4), if the
shared-look PR does not already add one. `__tests__/colors.test.js` pins `shadows` exactly, so the
test changes with it.

### Accessibility

- **One announcement**, once, when the goal resolves or fails:
  - iOS: `AccessibilityInfo.setAccessibilityFocus(Done)`, then
    `announceForAccessibilityWithOptions(summary, { queue: true })`, so the summary is not cut off
    by the focus change.
  - Android: `announceForAccessibility(summary)`, then focus Done.
  - No `accessibilityLiveRegion` anywhere. The pill and sync line must not speak twice.
  - Summary text: `"Session captured. " + pillSpoken + ". " + [title + ".", subtitle].join(" ")`,
    where title and subtitle are `getGoalCopy(goal)`. Example: "Session captured. Saved for 2
    children. 3 of 3 sessions today. Daily target reached."
  - When the goal is null: "Session captured. Saved for 2 children."
  - Back-dated `pillSpoken`: "Saved for 2 children, for Tuesday 13 October", the long form, because
    "Tue 13 Oct" reads badly.
- Reading order: pill, headline (header), card (gauge image, heading, sub-line), the three receipt
  rows, sync line, Done (button, label "Done").
- Halo and confetti are hidden from the accessibility tree.
- Touch: Done is 56 tall and full width. Nothing else is interactive.

**Contrast** (computed):

| Pair | Ratio | Result |
|---|---|---|
| white on red600 (headline, Done) | 5.64 | pass |
| text on white (pill, numeral, heading) | 17.05 | pass |
| textSecondary on white (suffix, sub) | 5.25 | pass |
| textSecondary on canvas (labels, sync line) | 4.84 | pass |
| text on canvas | 15.72 | pass |
| red700 on red50 (tiles) | 6.70 | pass |
| warningText on canvas | 6.27 | pass |
| white check on success disc | 3.16 | non-text, 3:1 pass |
| **success glyph on canvas ("All saved and synced")** | **2.91** | fails 3:1 → use `successText` (4.75); the text carries the meaning either way |
| ringNeutral 2.56 / border 1.24 on white (gauge track) | — | not information-bearing: the numeral, heading and image label carry it (same as Home) |

### States

- **Loading** (goal not yet resolved): skeleton card; empty headline slot; pill, receipt and Done
  are live.
- **Error / null goal:** no card, no halo, "Session captured.", and the receipt starts below the
  field. The rejection is caught and logged (`console.error`). No error copy: the session is saved.
- **Offline:** the sync line reads offline. Nothing else changes.
- **Overflow** (for example 5 children with 8 letters, or 7+ letters with a sub-line): the body
  scrolls and the footer turns sticky (`s-overflow`).
- **Small phones:** at 360x640 and 360x800 the body scrolls and the footer is sticky. Done is
  always visible.
- **Large font (1.3):**
  - Headline, numeral, suffix and tiles cap at 1.2.
  - Everything else scales: the pill and sync line wrap, receipt values wrap with the label on the
    first line, the heading wraps, the field grows, and the halo and confetti follow the card.
  - Nothing truncates.
  - The headline's text is set when the goal arrives. If "Daily target" wraps to three lines, the
    field grows during the card's entry, not after it settles.
- **No `childCount`** (defensive; the form always sends it): pill "Nice work — it’s saved.".
- **Missing receipt params:** those rows are omitted.

### Components

| Component | Source | Notes |
|---|---|---|
| `buildGaugeGeometry(goal, size)` + `GAUGE_SIZES` | **from Home**, generalised | move `sessionGaugeGeometry.js` and `SegmentedSessionGauge.js` from `components/home/` to `components/sessions/`; Home keeps `size: home` |
| `deriveGoalState({ target, ceiling, count })` | extracted from `utils/sessionGoal.js` | `getSessionGoal` calls it |
| `CelebrationGauge` | new (`components/sessions/`) | from/to layers, earned path, numeral cross-fade, skeleton |
| `SessionCompleteHero` | new | field, halo, `CapturedPill`, headline, `ConfettiBurst` |
| `ConfettiBurst` + `confettiPieces.js` | new | the C3 table above |
| `SessionReceipt`, `ReceiptRow`, `LetterTile` (read-only) | new | Record's selectable letter tiles should share `LetterTile` (reconcile) |
| `SyncStatusLine` | new, reusable | presenter-driven inline glyph line; candidate for Record's sticky bar |
| `StickyFooter` | new, shared with Record's sticky submit bar | bare at rest, sticky style when content overflows |
| `BrandButton` | existing, restyled by the shared-look PR | Done |
| `useMotionPreference` + `utils/deviceTier.js` | new (ported from Zazi) | the motion contract |
| `utils/sessionCompleteView.js` | new, pure | `deriveSessionCompleteView({ goal, params, now, motion })` → headline, showSub, pill text and spoken form, announcement, gauge plan (`fromGoal`, `earned`, `flip`), confetti flag, headline timing |
| `utils/childNames.js` `formatNameList(names, { spoken })` | new (Home's retired rule) | "&" or "and" |
| `haloGeometry(width)` | new, pure | `r`, `cy` offset, headline gap |

**Deleted:** `SessionsTodayRing.js` and `__tests__/SessionsTodayRing.test.js` (this screen is
its only consumer). `SessionsTodayGauge` stays: the orphaned `SessionsScreen` still imports it.

### Tests

Behaviour-level, per the repo's TDD rule. Screen tests mock `useMotionPreference` to `still` unless
a test says otherwise.

- `deriveGoalState`: matches `getSessionGoal` for below / met / exceeded / no_target, including
  target = ceiling.
- `deriveSessionCompleteView`: every row of the gating table, plus:
  - Yeboneer 1/1: earned segment in green, confetti;
  - numeracy 5/5;
  - target 7 (continuous slice);
  - 5 → 6 suffix drop;
  - 7 above the ceiling (numeral only);
  - back-dated met (sub-line shown);
  - missing `sessionDate` → static;
  - `count − 1 === 0` sweeps in the "to" colour with a blank old sub-line;
  - the summary text for each case, including null goal and the fallback pill.
- `formatNameList`: 1, 2, 3, 5 names; the spoken "and" form.
- Pill: "Saved for 1 child", "Saved for 2 children", " · Tue 13 Oct" from `2026-10-13`, independent
  of the device timezone.
- `haloGeometry`: at 360, 390, 411, 430, the inner leg exits the sides above the field edge and the
  band top is 16 or more below the headline bottom; 390 reproduces r 214 / cy 446 / gap 112.
- `confettiPieces`: 22 pieces, colours only from {surface, red100, red200}; at rest at 360 and 390
  no piece overlaps the headline box (+8/+10), the card (+12 above, +10 sides) or the frame edges
  (12).
- `classifyTier`: Zazi's cases. iOS high; Android <1.5 GB static; <3 GB low; year class 2018 low; no
  signal low; reduce motion always static. Session complete maps high → full, else still.
- `SessionCompleteScreen`:
  - pill text; receipt rows by accessibility label ("Letters: m, l, n, s" with letters given in tap
    order "s, m, n, l");
  - 3/3 today shows "Daily target reached." and no card sub-line;
  - 2/3 shows "Session captured." and "One more pair reaches your target.";
  - back-dated shows the date pill and a static gauge (no animated path rendered);
  - goal `null` and goal rejected both show no card and no unhandled rejection;
  - Done tapped before the goal resolves calls `popTo('MainTabs', { screen: 'Home' })` exactly once
    on a double tap;
  - hardware back calls the same;
  - the announcement is made once with the exact summary;
  - the sync line is blank until the screen's own `refreshSyncStatus` resolves, then shows
    "Saved on your phone · 3 waiting to sync" (no "All saved and synced" at mount with a stale
    zero);
  - the gauge's accessible label is the final goal's.
- Full motion (fake timers): the numeral shows "2" before 650ms and "3" after 800ms; the confetti
  layer exists only for exact target today; unmounting at 400ms stops everything (no
  state-after-unmount warnings).
- Navigation integration (real `NavigationContainer` + the app's stack and tabs): from Children tab
  → SessionForm → replace → Done lands on the Home tab with a stack of one MainTabs. This guards
  the v7 `navigate` gotcha.
- `HeroSyncIndicator`: reduce motion from the shared hook still stops the spin (existing test,
  re-pointed).
- `LiteracySessionForm.test.js:259` and `.submit.test.js:105`: assert the full param object.

### Device checks (each on the EAS preview build of this PR; iPhone and A03s)

1. 3/3 today on the iPhone, full motion. Screen-record at 60fps and frame-step against the
   storyboard: card/pill entry, sweep 250–550, flip 650–800, confetti 700–1300, headline 800–1100,
   nothing moving after 1.3s, Done tappable mid-animation.
2. 2/3, 1/3, 4/3, 6 (above the ceiling), back-dated (pick yesterday on the form while today is
   already 3/3), no-target programme (needs a test EA on 1000 Stories on `masi-app-sqlite`;
   disposable staging data), offline (A03s: `cmd wifi set-wifi-enabled disabled` + watchdog;
   airplane mode re-enables Wi-Fi), and overflow (5 children, 8 letters: scroll + sticky footer).
   Compare each to its board, pixel by pixel.
3. Reduce Motion: iOS Settings → Accessibility → Motion; Android "Remove animations". Still
   version, one 150ms fade. The A03s at default settings shows whatever the tier answer decides.
4. 360dp (`wm density 320`) at font scale 1.0 and 1.3, and 360x640 (`wm size 720x1280` at density
   320):
   - halo legs leave the sides above the field edge with no flat cut;
   - confetti clears the text and the card;
   - nothing truncates;
   - Done is pinned.
5. VoiceOver and TalkBack: the summary is heard once and in full, focus lands on Done, receipt rows
   read as one phrase each, and confetti/halo are silent.
6. Done and hardware back both land on Home showing the new count. No visible stale-count snap
   during the pop. One MainTabs (a second back press leaves the app as normal; it does not
   reveal a duplicate Home).
7. Sync line live: waiting → Syncing… (about 1s) → All saved and synced, cross-fading, with the
   footer height steady.

### Documentation in the build branch

- `documentation/design-system.md`: the motion contract (tiers, still version, Enter/Sweep
  curves), the gauge sizes, the receipt row, the sync line, and the new type roles.
- `documentation/ROADMAP.md`: remove "Session completion should return to the Home payoff state…"
  and "Add a `deviceTier`/reduced-motion contract…".
- `documentation/build-log.md`: work, review, verification, device checks.
- `PRD.md`, if it describes the completion screen. CONTEXT.md:262 lists it as in scope, which is
  still true.

### Out of scope

- The haptic at 650ms (board: "proposal · expo-haptics"). Not among Jim's approved proposals, and
  it would add a dependency.
- C4 halo sparks at 4/3 and 5/3 (a board open question). No beat beyond the target.
- Group name in the receipt (group-session rebuild).
- A Home gauge animation on return.
- Any change to what is saved, or to the form's layout (the Record section owns the form).

### Builder's calls

- *My call:* the card and pill enter from mount, not from goal resolve. Their content is known at
  mount, and the F0 skeleton is then the frame a slow read actually shows. Every goal-dependent
  track is timed from goal resolve, as the storyboard says.
- *My call:* `r = W/2 + 19` for the halo, and the headline-to-card gap `max(112, round(W/2 − 83))`,
  so the board's geometry holds at 360–430 (the board's fixed r 214 leaves flat-cut stumps at
  411).
- *My call:* confetti uses the storyboard's C3 F4 positions (table), not the scatter drawn on
  `red-complete-final`. Three fans for every target, not one fan per target session.
- *My call:* the skeleton track is one continuous arc, because the target is not known before the
  goal.
- *My call:* the "All saved and synced" glyph is `successText`, not `success` (2.91 fails 3:1).
- *My call:* the sync line uses Figtree 500 (`textCaption`). The board's 600 is not a loaded
  weight.
- *My call:* the screen calls `refreshSyncStatus({ autoTrigger: false })` and holds the sync line
  until it resolves, so it never claims "synced" for unsynced work.
- *My call:* letters sorted by `LETTER_ORDER`. Names in selection order, first names only, no
  disambiguation of duplicates.
- *My call:* the sub-line hides whenever the headline says "Daily target reached.". The old sub-line
  slot is blank when `count − 1` is 0.
- *My call:* the receipt's wrap handling uses `onTextLayout` (left-align and first-line label).
- *My call:* the footer sits below the ScrollView (no overlap), with the sticky style toggled on
  content overflow.
- *My call:* the back-dated date uses fixed arrays, not `Intl`. The spoken form is the long date.
- *My call:* `no_target` shows " today" after the numeral here (board) while Home keeps no suffix.
- *My call:* `SessionsTodayRing` and its test are deleted; `HeroSyncIndicator` moves onto the
  shared reduce-motion hook.

### Questions for Jim

1. **Is the Galaxy A03s "low-end"?** Your rule says low-end devices get the still version. Zazi's
   tiering puts Android under 3 GB at `low`, and the A03s reports 2.9 GB. As specified, the A03s
   (and similar field phones) **never see the celebration**. The motion is cheap: one 300ms
   JS-driven path plus native-driver transforms on 22 views. My recommendation: still only for
   `static` (Reduce Motion, or Android under 1.5 GB), and a frame check on the A03s. Your answer
   changes one constant and what the device check verifies.
2. **Done goes to Home, or back to wherever Record was tapped?** The components board says
   `goBack()` (returns to the tab the EA was on). The ROADMAP §5 item, and your June request, say
   return to Home. This spec goes to Home and closes the ROADMAP item. Home shows the new count
   without animating again.
