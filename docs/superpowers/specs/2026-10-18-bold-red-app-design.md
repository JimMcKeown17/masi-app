# Bold Red for the rest of the app: design

**Status:** draft for Jim's review, 2026-10-18. No code until Jim approves this spec.

**Design source:** the Design Round 4 canvas (https://claude.ai/artifact/8gQRtyqZ5Q1vTCTdSkz6zc,
private to Jim). Use the Bold Red (B) boards on these canvas pages: Log in, Children, Record / New
session, Session complete and Profile. Also use the `RedSystemSheet` board and the `red-flow-*`
journey on the Overview page. Board file names (`red-…`) are cited throughout.

**Follows:** the Bold Red Home, PR #70 and
[`2026-10-17-bold-red-home-design.md`](./2026-10-17-bold-red-home-design.md). Home's tokens, fonts,
type roles and components are the starting point.

**Roadmap:** `documentation/ROADMAP.md` §5 "Bold Red for the rest of the app".

## Why

Only Home is Bold Red. Every other screen still uses the old theme, and wherever Paper falls back
to its MD3 defaults the app shows purple: the Snackbar Dismiss button, elevation tints, the Class
detail FAB. The result looks like two apps stitched together. Jim wants the whole app on the
Bold Red design, built to the canvas boards.

## Decisions (Jim, 2026-10-18)

- **The Bold Red boards are final.** Build the recommended ("final") boards, not the variants:
  - Log in uses the charcoal arc, not the yellow one.
  - Children is grouped by class, not by school.
  - Record does not use the inline-ladder variant.
  - Session complete uses the Receipt, not the summary card.
  - Profile is as described below.
- **Approved behaviour changes:**
  - Log in: the offline notice (`red-login-p-offline`).
  - Record: a sticky submit bar with a live summary (`red-record-p-summary`,
    `red-record-p-summary-2`).
  - Record: save failure shown on the page (`red-record-p-save-failed`).
  - Profile: the compact layout (`red-profile-p1-compact`, `red-profile-p1-support-open`).
  - Profile: change password in a bottom sheet (`red-profile-p2-password-sheet`).
- **Sign-out sheets are restyled only.** Their behaviour (`useSignOutFlow`, Plan 3) does not change.
- **Record keeps its current structure.** Group-centred sessions (ROADMAP §4) will rebuild capture
  later. So this work invests in the look and in reusable components, not in restructuring Record.
- **Session complete gets its animation,** with a reduced-motion contract. That contract closes
  the ROADMAP §5 item.
- **Screens with no board get the shared look only:** tokens, type, buttons and headers. Their
  layouts are not redesigned.
- **Delivery:** the shared-look PR first, then one PR per screen. Each PR gets its own EAS preview
  build and device check.
- **Home v2 decisions stand.** There is no "Who to see next", and Home's bottom area only shows
  things to act on.

## Goals, non-goals, anti-goals

- **Goal:** every screen renders Bold Red. Board screens match their boards at 390×844, 360×640
  and 360×800, and at font scale 1.3. No MD3 purple remains anywhere.
- **Goal:** one component and token system. Guard tests stop new raw hex values, and stop
  `fontWeight` being set on a custom font family.
- **Non-goal:** no schema, RLS, payload or outbox change. None is needed; each part confirms this
  in its "Data" notes.
- **Non-goal:** no new features beyond the approved proposals.
- **Anti-goal:** a half-red app between PRs. The shared-look PR moves every screen at once, and
  the board PRs then refine their layouts.
- **Anti-goal:** Home changing. Home stays pixel-identical except for the 4dp `FAB_OVERHANG`
  adjustment noted below. Every PR's device check has a Home row.

## How this spec is organised

| Part | File | PR |
|---|---|---|
| Overview and system decisions (this file) | `2026-10-18-bold-red-app-design.md` | — |
| 1. Shared look | [`…-1-shared-look.md`](./2026-10-18-bold-red-app-1-shared-look.md) | PR 1 |
| 2. Children (My Children, Class detail) | [`…-2-children.md`](./2026-10-18-bold-red-app-2-children.md) | PR 2 |
| 3. Record | [`…-3-record.md`](./2026-10-18-bold-red-app-3-record.md) | PR 3 |
| 4. Session complete | [`…-4-complete.md`](./2026-10-18-bold-red-app-4-complete.md) | PR 4 |
| 5. Profile | [`…-5-profile.md`](./2026-10-18-bold-red-app-5-profile.md) | PR 5 |
| 6. Log in and reset password | [`…-6-login.md`](./2026-10-18-bold-red-app-6-login.md) | PR 6 |

Each part describes its screen's layout, states, copy, accessibility, tests and device checks.
The **System decisions** below are authoritative for every component name, file path, token, type
role, cross-screen behaviour and the PR order. Where a part disagrees with them, they win.

In the System decisions, "Shared look §N" means part 1 §N, "Children" means part 2, "Record" part
3, "Complete" part 4, "Profile" part 5 and "Login" part 6.

---

## System decisions (authoritative across all six parts)

**What this part does.** The six sections (shared look, Log in, Children, Record, Session
complete, Profile) were drafted independently. Where they disagree, **this part wins**. A builder
reads a screen section for layout, states, copy and tests, and reads this part for every component
name, file path, token, type role and cross-screen rule. The section text is not edited. Where a
section names something differently, the "Was called" column below maps it.

Jim's reply to the earlier open choices was "go with your picks". So every choice a section
recommended is now decided as recommended, unless this part overrides it. The questions left in
§6 each carry the default that gets built if Jim does not answer.

Verified against `feat/bold-red-app` @ `63cb00e` (code) and the board files (design).

---

### 1. Shared component inventory

**Which PR builds a primitive.** The shared-look PR builds a primitive only when the navigation
chrome or a screen with no board uses it. Otherwise the **first board PR that needs it** builds it,
in `src/components/common/`, to the spec below, and later PRs reuse it. This keeps the first PR
bounded, and each primitive ships with a real consumer and its device check. PR order is in §5.

**Folder rule.** New session-flow components go in `src/components/sessions/` (plural, which is
where Session complete's gauge moves). The existing `src/components/session/` files
(`LetterGrid`, `LetterTrackerBottomSheet`) stay where they are. Moving them is churn.

#### 1.1 Built in the shared-look PR

| Name | Path | Props | Was called | Used by | Resolved spec / conflict |
|---|---|---|---|---|---|
| `BrandButton` (existing, extended) | `common/BrandButton.js` | `label, onPress, variant, size='lg', surface='canvas', tone, icon, loading, loadingLabel, disabled, accessibilityLabel` | PillButton (Login, Record, Profile), PrimaryButton (Children), TextLinkButton (Login, Children), TextButton (Record, Profile) | every screen | **One button component.** Variants: `primary`, `secondary`, `tertiary`, `destructive`, `destructiveQuiet`, `warning`, as in shared-look §4. Record's "caution" variant = `warning`, and the shared-look spec is the correct one (see §7 W2). `tertiary` takes a `tone`: `accent` (`colors.primary`, `textButton` 15/20; `size="sm"` → `textLink` 14/20), `ink` (`colors.text`, `textButtonM` 16/20, full width, 44 tall: Cancel, Keep editing, Back to sign in), and `onRed` (white, `textButton`, underlined: Forgot password?). Pressed: darker fill and no shadow, plus scale 0.98 unless `reduceMotion` (Login and Record asked for the scale; shared look left it out; the scale is in). Loading keeps the fill, never dims, and shows an 18dp spinner and `loadingLabel` ("Signing in…", "Saving…", "Sending…"). |
| `IconCircleButton` | `common/IconCircleButton.js` | `icon, onPress, accessibilityLabel (required), surface='canvas'\|'red', disabled` | RoundIconButton (shared look) | headers, Class detail edit, calendar month arrows, Home hero gear (optional adoption) | 44×44, radius 22, 22dp Ionicons. Canvas: white fill, 1.5 `tints.control` border, ink glyph. Red: `red700` fill, white glyph. Disabled: `tints.rule` border, `colors.disabled` glyph (calendar "Next month"). |
| `ScreenHeader` + `useHeaderHairline` | `common/ScreenHeader.js` | rendered by the navigators' `header` option; reads `options.title`, `options.headerRight`, `options.headerLeftIcon` (`'back'` default, `'close'`, `'none'`), `options.headerScrolled`, and `back` | — | every stack screen | **Navigator-rendered, not screen-rendered** (§3 C1). Geometry from the boards (§7 W3): `paddingTop: insets.top + 9`, sides 24, bottom 6; content row min height 44, `alignItems: 'flex-start'`, gap 12. Title `displayTitle` with `paddingTop: 6`; it wraps and never truncates, `maxFontSizeMultiplier={1.3}`, `accessibilityRole="header"`. 1dp `tints.rule` hairline only once scrolled. Total height = inset + 59. |
| `TextField` | `common/TextField.js` | `label, value, onChangeText, icon, placeholder, error, disabled, secureTextEntry, onToggleSecure, multiline, surface='canvas'\|'red', inputRef, …TextInput props` | TextField (all); TextArea (Record) = `multiline` | Add/Edit child, Create/Edit class, Reset, Profile sheet, Record comments, Login | Login §TextField is the master spec: box min 60, radius 14, 2dp border at all times so nothing shifts, halo as an absolute sibling at inset −4, leading icon 22, label inside (`textLabel`), value `textInput`, placeholder `colors.placeholder` (now `#76696B`). Canvas rest border `colors.fieldEdge` (§8 R6); focus 2dp ink + `tints.pressed` halo; error 2dp `error`, no halo. `surface="red"` (rest transparent, focus `tints.onRedHalo`, error `errorBg` halo) is built in the **Login PR**. Disabled: on canvas, `border` fill, transparent edge, `disabled` glyph and value (Profile's `s-password-loading` board); on red, opacity 0.7 value / 0.5 chrome (Login's `s-loading` board). Masked value 20/24, letter spacing 2.8. It must not spread `NO_TEXT_SUGGESTIONS` by default (`domainTextInputAudit`); domain fields pass it. |
| `SelectField` | `common/SelectField.js` | `label, value, placeholder, icon, error, onPress, accessibilityLabel` | FieldButton (shared look), SelectField (Record) | form pickers, Record date and level | The `TextField` box with a trailing `chevron-down` 20. Pressed: `colors.border` fill. Role button. |
| `SearchField` | `common/SearchField.js` | `value, onChangeText, placeholder, accessibilityLabel, autoFocus` | — | Assessment child select (shared look), Children, Record | Height 48, radius 14, 1.5 `colors.fieldEdge` border (§8 R6), leading `search-outline` 20 Muted, value 16/20 Figtree 500, focus as `TextField`. Clear button: Children's board drawing (44 target, 22dp `colors.border` disc, 14dp ink `close`), label "Clear search". Spreads `NO_TEXT_SUGGESTIONS`. |
| `InlineNote` | `common/InlineNote.js` | `tone='error'\|'warning', size='sm'\|'md', children` | ErrorNote (Login, Record, Profile) | every form; D8 sheet; sign-out warning; Record footer | Board-measured. `sm` (default): radius 9, padding 8/12, gap 8, 16dp `warning-outline`, `textNote` (Figtree **600** 13/18). Error: `errorBg` / `error`. Warning: `warningBg` / `warningText`, glyph `warning`. `md` (D8 board): radius 14, padding 12/14, gap 10, glyph 18. Error tone: `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"` (Record's save failure passes `assertive`), plus an iOS `announceForAccessibility` when it appears (not on re-render). It wraps and never truncates. |
| `ToggleChip` | `common/ToggleChip.js` | `label, selected, onPress` | — | `ChipSelector` | As in shared look §4. |
| `SegmentedControl` | `common/SegmentedControl.js` | `options, value, onChange, role='radio'\|'tab', accessibilityLabel` | — | Assessment ranking (shared look), Record, Profile | Height 44 min, pill, white track, 1.5 `tints.control` inset edge, ink thumb inset 4.5. Selected label white `textButton`, unselected ink `textBodyStrong`. `radio` → `radiogroup`/`radio` + `checked`; `tab` → `tablist`/`tab` + `selected`. |
| `SurfaceCard` | `common/SurfaceCard.js` | `children, style` | — | no-board screens | Shared look §4. |
| `ListGroup` + `ListRow` | `common/ListGroup.js`, `common/ListRow.js` | Group: `children`. Row: `title, subtitle, lead, trailing ('chevron'\|'external'\|'share'\|'send'\|'disclosure'\|node), onPress, variant='action'\|'readOnly'\|'nested', busy, accessibilityLabel, accessibilityRole` | GroupedSurface (Children, Record), SettingsGroup/SettingsRow (Profile) | Insights, histories, Children, Record, Profile | Group: white, 1dp `tints.rule` border, radius 18, `overflow: hidden`, no shadow; inset `colors.border` dividers, none after the last row. Row: min 64, padding 10/16, gap 12. `readOnly` and `nested` are Profile's spec, built in the shared-look PR because they are generic. Screen-specific rows (class row, child row, roster row) compose `ListRow` or sit inside `ListGroup`. |
| `IconTile` | `common/IconTile.js` | `icon, tone='canvas'\|'red'\|'warning'` | settings tile (shared look) | Insights rows, Profile rows, Record group rows, Home `AttentionArea` | Extracted from `AttentionArea.js:64-65`: 40×40, radius 14. `canvas`: `background` fill, ink glyph 20. `red`: `red50` fill, `red700` glyph 22 (Record group row). `warning`: `warningBg` (Home). Home's look must not change. |
| `StatusBadge` | `common/StatusBadge.js` | `label, tone` | Badge (Profile) | Time entries, Children, Profile, Record | Min height 22, pill, padding 0 8, `textBadge`. Tones: `warning` (`warningBg`/`warningText`: "Unsynced", "Sensitive"), `success` (`successBg`/`successText`), `successStrong` (`successText` fill, white: Record's "+{n} new"; new tone), `error`, `neutral`. |
| `EmptyState` | `common/EmptyState.js` | `title, body, footnote, action` | — | `NoActiveProgrammeNotice`, Children | Type-led and left-aligned: `displaySheetTitle`, `textParagraph` Muted, optional `BrandButton size="md"`. |
| `SectionHeader` (existing, restyled) | `common/SectionHeader.js` | `title, hint, action` | SectionLabel (Profile), textSectionLabel rows (Children) | everywhere | `textSectionLabel` Muted, `accessibilityRole="header"`; optional `hint` (`textCaption` Muted, 4 below); optional trailing `action` (`BrandButton tertiary`, with negative vertical margin so its 44 target does not grow the row). |
| `StatBar` (existing, restyled) | `dashboard/StatBar.js` | unchanged + `onPress` per item | — | Children, Assessments, Insights rankings | Bare stat bar, as in Children §Stat bar: numeral `displayTitle` + tabular, `textLabel` caps. A tappable item is `colors.primary` with an **18dp** chevron (Children's board value; shared look said 16). The item's `color` prop still overrides the numeral, for score semantics. |
| `BottomSheet` (existing, restyled) | `common/BottomSheet.js` | unchanged | — | every sheet | Top radius 22, grabber 36×4 `tints.control` 8 from the top, title `displaySheetTitle` 20 below the grabber, subtitle `textParagraph` Muted 6 below, scrim `tints.scrim`, `shadows.sheet`, rise animation per `useMotion()`. Bottom padding stays `max(insets.bottom, 24)`. The Android keyboard change is in §3 C11. |
| `SelectSheet` (existing, restyled) | `common/SelectSheet.js` | unchanged + `cancelLabel` | — | forms, Record level sheets | Flat 56 options, `border` dividers, `textInput`; selected is `textOptionSelected` plus a trailing ink `checkmark` 22. No red. |
| `ClockInBeforeSessionSheet` (existing, restyled) | `sessions/ClockInBeforeSessionSheet.js` | unchanged | — | tab bar launch guard | **Shared-look spec** (D8 board: `warning` button = `warningBg` fill + `tints.warningControl` border). Record's description of this sheet is superseded. |
| `SyncIndicator` default variant (restyled) | `common/SyncIndicator.js` | unchanged | `variant="pill"` (Children) | tab-root headers | **Restyle the default variant; do not add a `pill` variant.** The default is only used as a header right slot (`AppNavigator.js:98,124`). Spec: Children §Header sync pill, which matches the board (§7 W5): `needs_attention` uses `warning-outline` + "{n}" + a 14dp `chevron-forward` in `warningText`. Text `textPill`; "99+" cap; spinner track `tints.spinnerTrack`. `hero` unchanged. |
| `LockedBottomTabBar` + `BottomTabIcon` (restyled) | `navigation/` | + export `FAB_OVERHANG` | — | tabs | Shared look §5.1. **Export `FAB_OVERHANG`**, computed from the new 60dp ring (top edge 24 above the row, so 24, not today's 28). `HomeScreen.js:34` imports it instead of its local constant. Home's bottom padding changes by 4dp: check it on Home's device row. |
| `Toast`, `ToastProvider`, `useToast`, `useToastObstruction` | `common/Toast.js`, `context/ToastContext.js` | `show({ message, tone, duration })`, `hide()` | SnackbarContext (ROADMAP) | all 14 hosts + `TimeTrackingContext` | Shared look §6. Message `textBodySemi` (Figtree 600 15/20; Profile had 700). Dismiss is always shown, `textLink` white underlined. The obstruction registry also takes `StickyActionFooter` (§4 S3). It sits above the keyboard via `useKeyboardHeight`. |
| `MotionProvider` + `useMotion` | `context/MotionContext.js` | returns `{ tier, reduceMotion, motionLevel }` | useMotionPreference (Complete) | sheets, toast, spinners, buttons, Session complete | §3 C6. |
| `classifyTier` | `utils/deviceTier.js` | `({ platform, deviceYearClass, totalMemory, reduceMotion })` | getDeviceTier (shared look) | `MotionProvider` | Ported from Zazi (`zazi-izandi-app/src/utils/deviceTier.js`) without the letter fields. |
| `FocusAwareStatusBar` | `common/FocusAwareStatusBar.js` | `style` | — | Home, Login, Session complete | Extracted from `HomeScreen.js:160`. |
| `useKeyboardHeight` | `hooks/useKeyboardHeight.js` | → height (0 when hidden) | — | Toast, Login, Record footer | `keyboardWillShow/Hide` on iOS, `keyboardDidShow/Hide` on Android. |
| `describeAuthError` | `utils/authErrorCopy.js` | `(error, action: 'sign_in'\|'reset')` | describeSignInError (shared look) | Login, Reset | **One function; Login's full table.** It ships in the shared-look PR (it closes "Suspended sign-in copy"), shown as a toast there and moved inline by the Login PR. The fallback is "Couldn’t sign in. Please try again.", never `error.message`; the only raw string kept is "Invalid login credentials". |
| `paperTheme`, `navigationTheme` | `src/theme/` | — | — | `App.js`, `AppNavigator.js` | Shared look §3. |

#### 1.2 Built by the first board PR that needs them (reused later)

| Name | Path | Props | Introduced by | Reused by | Resolved spec / conflict |
|---|---|---|---|---|---|
| `Avatar` | `common/Avatar.js` | `label, size=28\|40\|64, shape='circle'\|'tile', icon, ring` | **Children** | Record, Profile | Merges Avatar (shared look, Children, Record), Monogram (Children) and InitialsAvatar (Profile). `red50` fill, `red700` Figtree 800. Initials: 11 at 28, 14 at 40, 22/28 at 64, letter spacing 0.03em. `shape="tile"` (radius 14) is Children's class monogram at 15. `icon` covers Profile's null-profile `person-outline`. `ring` covers the roster stack: a 1dp `tints.avatarEdge` border plus a 2dp surface ring. Decorative. |
| `getInitials(first, last)` | `utils/initials.js` | — | **Children** | Record, Profile | Merges Children's `childInitials` with Profile's and Record's rules. `classMonogram` stays in `utils/childrenPresentation.js`. |
| `AvatarStack`, `GroupChip` | `children/` | Children §spec | **Children** | `GroupPickerBottomSheet`, `EditChildScreen` | Six dot colours via `getGroupDotColor` (Children). |
| `SyncBanner` (existing `SyncStatusBanner`, renamed and restyled) | `common/SyncBanner.js` | `onSyncNow` | **Children** | — | Children is the only user (shared look's "and Profile" is wrong: Profile has no banner). States `waiting`, `offline`, `syncing`; hidden when synced **and** when needs-attention (the pill carries that). The count comes from `waitingCount` (§3 C9). |
| `InlineLoading` | `common/InlineLoading.js` | `label` | **Children** | Class detail | 22dp spinner + line, `accessibilityLiveRegion="polite"`. |
| `StepHeader`, `CountChip`, `SelectableRow` | `forms/` | Record §spec | **Record** | the group-session rebuild | `CountChip` replaces shared look's `SelectionChip` (no check icon, per the components board). `SelectableRow` composes `ListRow`. |
| `LetterToggleTile` + `LetterToggleGrid` | `sessions/` | Record §spec | **Record** | the tracker sheet | Distinct from EGRA `assessment/LetterTile`. |
| `ChildProgressBlock`, `MonthCalendar`, `RequirementSummary` | `sessions/`, `common/MonthCalendar.js`, `forms/` | Record §spec | **Record** | — | — |
| `StickyActionFooter` | `forms/StickyActionFooter.js` | `children, surface='always'\|'onOverflow', hideOnKeyboard` | **Record** | Session complete | Merges Record's StickyActionFooter and Complete's StickyFooter. `always` (Record): white, 1dp `border` top. `onOverflow` (Complete): bare canvas until the scroll content overflows. Bottom padding `max(insets.bottom, 16)`. It registers its height with `useToastObstruction`. |
| `ConfirmSheet` | `common/ConfirmSheet.js` | `visible, title, titleAccessory, body, confirmLabel, confirmVariant='destructiveQuiet'\|'destructive', cancelLabel, onConfirm, onCancel` | **Record** (discard) | **Profile** (Export database sheet renders through it, `titleAccessory` = Sensitive badge, `confirmVariant="destructive"`) | Profile's `ExportDatabaseSheet` becomes a thin wrapper around it. `accessibilityViewIsModal`. |
| `validateLiteracySession`, `rosterRowHeight` | `utils/` | Record §spec | **Record** | — | — |
| `formatSessionDate(dateKey, style)` | `utils/sessionDateFormat.js` | `style: 'field'\|'fieldToday'\|'pill'\|'spoken'\|'calendarLabel'` | **Record** | Session complete | §4 S6. Merges Record's `formatSessionDateLabel` with Complete's pill formatter. Fixed English arrays, no `Intl`. |
| `formatNameList(names, { spoken })` | `utils/childNames.js` | — | **Session complete** | — | — |
| `CelebrationGauge`, `SessionCompleteHero`, `CapturedPill`, `ConfettiBurst` + `confettiPieces.js`, `SessionReceipt`, `ReceiptRow`, `LetterReceiptTile`, `SyncStatusLine` | `sessions/` | Complete §spec | **Session complete** | — | Complete's read-only `LetterTile` is renamed **`LetterReceiptTile`** (it clashes with `assessment/LetterTile.js`). It does **not** share a component with `LetterToggleTile`: the size, colour and role differ. They share the letter-case rule (§6 Q3). |
| `buildGaugeGeometry(goal, size)` + `GAUGE_SIZES`, `SegmentedSessionGauge` | moved `home/` → `sessions/` | Complete §spec | **Session complete** | Home | Home must stay pixel-identical (Home device row). |
| `deriveGoalState`, `deriveSessionCompleteView`, `haloGeometry` | `utils/` | Complete §spec | **Session complete** | — | — |
| `ProfileIdentity`, `ChangePasswordSheet`, `ExportDatabaseSheet`, `AppReleaseInfo` | `profile/` | Profile §spec | **Profile** | — | — |
| `LoginHeroArt`, `BrandLockup` | `auth/` | Login §spec | **Login** | — | — |
| `useNetworkOffline` | `hooks/useNetworkOffline.js` | → boolean | **Login** | — | Signed-out only. Signed-in screens keep `useOffline()`. |

**Not reused from Home:** `AttentionArea`'s card and `HomeClockRow` stay Home-only. **Taken from Home:** the tile (→ `IconTile`), the hero disc (→ `IconCircleButton surface="red"`), the status-bar pattern (→ `FocusAwareStatusBar`), `FAB_OVERHANG`, the gauge geometry, and `HeroSyncIndicator`'s reduce-motion read (→ `useMotion`). Each Home adoption is a zero-visual-change refactor, done in the PR named above, and covered by that PR's Home device row.

---

### 2. Token list (deduplicated, resolved)

#### 2.1 Colour (`colors.js`)

| Token | Today | New | Notes |
|---|---|---|---|
| `primary` | `#E72D4D` | **`#C81F3E`** (red600) | Shared look §2.1. **Rule for every section:** action reds use `colors.primary`, and pressed uses `colors.primaryDark`. Red *fields* (Login, Session complete, Home hero) use `colors.red600` by name. Graphics use `colors.red500` by name. |
| `primaryDark` | `#C81F3E` | **`#A4182F`** (red700) | Pressed action. |
| `placeholder` | `#B3A8A8` | **`#76696B`** | Equal to `textSecondary`. Login's "do not use `colors.placeholder`" is moot after the retune. |
| `emphasis` | `#E72D4D` | unchanged | **Gap, see §3 C13:** text uses of `emphasis` fail contrast. |
| `successText` | `#2E7D27` | **`#2B7524`** | `#2E7D27` on `successBg` is 4.4986:1, just under 4.5. The new value is 4.996:1 on `successBg` and 5.72:1 on white (§8 R10). Visibly the same green, a shade deeper. |
| `fieldEdge` | — | **`#858182`** (new) | Editable field rest edge, 3:1 on white and canvas (§8 R6). |
| `shadowWarm` | — | **`#3A2424`** (new) | Sheet and nav shadow colour, so `src/theme` and `shadows` carry no raw hex (§8 R7). |
| everything else | — | unchanged | Every other board hex maps to an existing token (all six sections agree). |

**Graphic uses that must switch to `colors.red500` by name** (so they keep their colour when
`primary` moves): `sessionGoalPresentation.js:13` (Home gauge, "progressing"), the Session
complete halo and in-progress segments, and the `SessionCountRankingScreen.js:62` bar colour.
That third one is missing from shared look §2.1 (§7 W6). `SessionsTodayRing.js:16` is deleted
with its file (§3 C14), so it needs no switch.

**New export `tints`** (in `colors.js`, values derived from tokens, not hand-written hex), used
everywhere a section wrote `token + 'xx'`:

| `tints.` | Derivation | Sections' spelling |
|---|---|---|
| `rule` | `text + '1F'` (12%) | `colors.text + '1F'` |
| `control` | `text + '33'` (20%) | `colors.text + '33'` |
| `pressed` | `text + '0F'` (6%) | `colors.text + '0F'` |
| `onRedTile` | `surface + '24'` (14%) | — |
| `onRedHalo` | `surface + '52'` (32%) | `colors.surface + '52'` |
| `onRedKeyline` | `surface + 'B8'` (72%) | `colors.surface + 'B8'` (Login arc). **New** |
| `onRedOutline` | `surface + 'D9'` (85%) | — |
| `onRedDisabled` | `surface + '61'` (38%) | — |
| `warningEdge` | `warning + '4D'` (30%) | `colors.warning + '4D'` |
| `warningControl` | `warning + '61'` (38%) | `colors.warning + '61'`; shared look's `warningButtonEdge`, renamed because Children's assign chip uses it too |
| `avatarEdge` | `red700 + '2E'` (18%) | `colors.red700 + '2E'`. **New** |
| `spinnerTrack` | `textSecondary + '47'` (28%) | `colors.textSecondary + '47'`. **New** |
| `scrim` | `heroDark + '7A'` (48%) | `colors.heroDark + '7A'` |

Home's `AttentionArea.js:10` `CARD_BORDER` becomes `tints.rule`.

`__tests__/colors.test.js` conflicts: line 39 pins the exact `colors` key set, line 78 pins
`shadows` with `toEqual`, and line 95 checks every `colors` value against an approved palette.
The test stays fail-closed (§8 R9):
- `REQUIRED_KEYS` gains exactly `fieldEdge` and `shadowWarm`.
- `APPROVED` gains exactly `#858182` and `#3A2424`, plus the retuned `successText` `#2B7524`, which
  replaces `#2E7D27`.
- Each changed value gets an explicit pin (`primary`, `primaryDark`, `placeholder`, `successText`,
  `fieldEdge`, `shadowWarm`).
- Nothing is loosened to accept arbitrary additions.
- `tints` needs its own pin, plus a rule that every `tints` value is an approved hex plus an alpha.
- `contrast.test.js` compares the full-precision ratio against 4.5 or 3, never a rounded one.

#### 2.2 Fonts and type roles (`typography.js`)

**Load `Figtree_600SemiBold`** as `fontFamilies.textSemi`, as shared look proposed. **This
overrides** the four sections (Login, Children, Record, Profile) that mapped board weight 600 to
700. The boards use 600 constantly: 27 tab labels, 12 15/20 labels, every error note and the sync
line. It is one more file from an installed package, and the pixel-perfect bar makes it worth
loading. **Weight 400 stays unloaded** (placeholders use 500; all agree).

**Final new roles.** Each is a weight-specific face with no `fontWeight`. Letter spacing comes
from the board's em values × size (system sheet): −.035em, −.03em, −.02em, −.015em, and .08em for
labels.

| Role | Face | Size/line | Tracking | Was called | Used for |
|---|---|---|---|---|---|
| `display3XL` | Bricolage 800 | 44/46 | −1.54 | `displayHero` (Complete) | Session complete headline |
| `display2XL` | Bricolage 800 | 38/42 | −1.14 | `displayHero` (Login) | Login "Sign in" only. Shared look also listed "Reset password", but that title is 28 in the header |
| `displayNumeralXL` | Bricolage 800 | 64/64 | −1.28 | — | Session complete gauge numeral |
| `displayTitle` | Bricolage 800 | 28/32 | −0.56 | `displayL` (Login, Profile); `displayStat` (shared look, an identical duplicate, dropped) | Header titles, "Check your email", stat numerals (+ `fontVariant: ['tabular-nums']`) |
| `displaySheetTitle` | Bricolage 800 | 24/28 | −0.48 | `displayS` (Children, Record); `displayTitle` (Login, Profile) | Sheet titles, empty-state titles, profile name, Login compact-keyboard heading |
| `displayHeading` | Bricolage 800 | 18/24 | −0.27 | `displayS` (Complete) | Session complete card heading, calendar month |
| `textRowTitle` | Figtree 700 | 16/22 | 0 | `textValue` (Complete) | Row titles, read-only values, receipt values and receipt letter tiles |
| `textBodyL` | Figtree 500 | 16/22 | 0 | — | Paper `bodyLarge` |
| `textBodySemi` | Figtree **600** | 15/20 | 0 | `textToast` (shared look) | Toast message, Record child-progress row labels, other board 15/20 600 text |
| `textParagraph` | Figtree 500 | 15/22 | 0 | `textLead` (Login, Record, Profile) | Sheet subtitles and bodies, empty-state bodies, Reset paragraph, job title, Class detail body |
| `textInput` | Figtree 500 | 17/22 | 0 | — | Field values, picker options |
| `textOptionSelected` | Figtree 800 | 17/22 | 0 | — | Selected picker option |
| `textButtonL` | Figtree 800 | 17/20 | 0 | — | 56dp buttons |
| `textButtonM` | Figtree 800 | 16/20 | 0 | — | Ink tertiary buttons (Cancel, Keep editing, Back to sign in) |
| `textLink` | Figtree 800 | 14/20 | 0 | — | `tertiary size="sm"`: "Sync now", "View all", "Show passwords", Dismiss, missing-summary links |
| `textSmall` | Figtree 500 | 14/20 | 0 | `textMeta` (Children), `textSmall` 14/19 (Complete) | Class detail meta lines, Session complete card sub-line (board 14/19 → 14/20) |
| `textSmallStrong` | Figtree 700 | 14/20 | 0 | `textMeta` 14/18 (Record) | Paper `titleSmall`, Record summary done items |
| `textPill` | Figtree 800 | 14/18 | 0 | `textChip` (Complete) | Header sync pill text, captured pill |
| `textNote` | Figtree **600** | 13/18 | 0 | `textCaptionStrong` 700 (Login, Record, Profile) | `InlineNote`, Session complete sync line, other board 13/18 600 text |
| `textChip` | Figtree 700 | 13/18 | 0 | — | `CountChip`, `GroupChip` name, "{n} children" in class rows |
| `textBadge` | Figtree 800 | 12/16 | 0 | — | `StatusBadge`, Home's sync badge |
| `textSectionLabel` | Figtree 800 | 12/16 | 0.96, caps | `textSection` (Profile), `textRowLabel` (Complete); shared look's 1.0 | Section labels, step labels, receipt labels |
| `textNavActive` / `textNavInactive` | Figtree 800 / **600** | 11/13 | 0 | — | Tab labels |
| `textLetter` | Figtree 700 | 20/24 | 0 | — | Record letter tiles |
| `textDay` | Figtree **600** | 16/20 | 0 | Record mapped 600 → 700 | Calendar day numbers |
| `textData` | Figtree 700 | 15/20 | 0, `tabular-nums` | — (shared look §9; added in §8) | History time columns |

Unchanged existing roles: `displayXL`, `displayNumeral`, `displayM`, `textBody`,
`textBodyStrong`, `textCaption`, `textLabel` (11/14, 1.1 = the board's .1em), and `textButton`.

**Retired:** the legacy `typography` export (shared look §2.2). `__tests__/typography.test.js:5-29`
pins it, so those assertions are deleted with it (not edited to pass).

**Paper `fonts` mapping:** shared look §3, with `displayStat` read as `displayTitle`.

#### 2.3 Spacing, radii, shadows, motion

- `spacing.ms = 12`, `spacing.ml = 20`. `borderRadius.pill = 999`.
- **Shadows.** CSS blur ÷ 2 = RN `shadowRadius`. Record and Profile used the raw blur (22, 24,
  28), which roughly doubles the spread; that is corrected here.

| `shadows.` | Colour | Offset y | Opacity | Radius | Elevation | Was called |
|---|---|---|---|---|---|---|
| `primaryButton` | `red600` | 10 | 0.22 | 11 | 4 | `action` (shared look), `button` (Complete); radius 22 (Record, Profile) |
| `onRedButton` | `red900` | 8 | 0.22 | 10 | 4 | `onRedAction` (shared look) |
| `fab` | `red600` | 10 | 0.28 | 10 | 8 | — |
| `toast` | `text` (`#221A1B`) | 12 | 0.24 | 14 | 12 | radius 28 (Profile) |
| `sheet` | `shadowWarm` | −8 | 0.10 | 12 | 16 | radius 24 (Record, Profile) |
| `nav` | `shadowWarm` | −8 | 0.06 | 12 | 8 | — |

  `card` and `elevated` stay. Android elevations are starting values that the device check tunes
  against the boards.
  Session complete's captured pill shadow stays component-local, built from tokens (one use).
- **Motion constants** (`constants/motion.js`): shared look §2.4. Complete's per-track timings
  use `easing.enter` and `easing.sweep` by name.

---

### 3. Contradictions and resolutions

**C1. Who renders the header.** Shared look wires `ScreenHeader` through each navigator's
`header` option. Children, Record, Login and Profile set `headerShown: false` and draw it inside
the screen.
→ **Navigator option.** One place guarantees every no-board screen gets the header. Board
screens configure it through options instead of drawing it:
- ChildrenList: `title: 'Children'`, sync pill `headerRight`, as today.
- ClassDetail: `useLayoutEffect` → `setOptions({ title: classItem?.name ?? '', headerRight:
  Manage classes })`; loading and not-found give an empty title.
- SessionForm: `{ title: 'New session', headerLeftIcon: 'close' }`.
- Profile: `title: 'Profile'`.
- ForgotPassword: `headerShown: true`, `title: 'Reset password'`; the sent state sets `title: ''`.

Scroll hairlines go through `useHeaderHairline()`. `headerShown: false` stays only on Home,
Login, SessionComplete and the three assessment capture screens.

**C2. Header geometry.** Shared look: top +6, row 56. Children: +15 / +9. Login: max(+9, 34).
Profile: inset + 56.
→ The boards (§7 W3): top `inset + 9`, row 44, bottom 6, title `paddingTop: 6`. This
reproduces every board, including Children's tab root (title top at inset + 15).

**C3. Title truncation.** Children, Login and Record: one line with an ellipsis. Shared look:
wrap, never truncate.
→ Wrap (the app's no-truncation rule). `maxFontSizeMultiplier` 1.3 (Record said 1.2).

**C4. Font weight 600.** → Load it (§2.2). Every "600 → 700" builder's call in Login, Children,
Record and Profile is void.

**C5. Type role names.** → §2.2 table.

**C6. Motion contract.** Shared look: `MotionProvider` / `useMotion` with `getDeviceTier`
(3 GiB, unknown → low) and levels full / calm / still. Complete: `useMotionPreference` +
`classifyTier` from Zazi (high / low / static, year class, < 1.5 GB static).
→ One contract:
- `classifyTier` ported from Zazi. It encodes real `totalMemory` readings: reported RAM is below
  nominal, so a "3 GB" phone reads under 3 GiB.
- Exposed by `MotionProvider` / `useMotion()` as
  `motionLevel = static → 'still', low → 'calm', high → 'full'`. Reduce Motion forces `static`.
- `calm` keeps transitions, ambient loops and the spinner. `still` keeps only opacity fades.
- Which levels play the Session complete celebration is one constant,
  `CELEBRATION_LEVELS` in `sessionCompleteView.js`. Default: `['full', 'calm']` (§6 Q2).
- `HeroSyncIndicator` and the canvas pill spinner read `useMotion().reduceMotion`.
- The contract ships in the **shared-look PR** (sheets and toast need it first). It closes ROADMAP
  §5 "deviceTier/reduced-motion contract".

**C7. Auth error copy.** Shared look's `describeSignInError` (passes the raw message through) vs
Login's `describeAuthError` (maps everything).
→ Login's function and table, shipped in the shared-look PR (§1.1).

**C8. Sync pill: new variant or restyle.** → Restyle the default (§1.1). Children's state table
is the spec, not shared look's: its `needs_attention` glyph and chevron are wrong (§7 W5).

**C9. Banner count vs pill count** (Children Q1). → **(b)**: the banner reads `waitingCount`
from `useOffline()`, the same source as the pill, so the two never disagree. "Sync now" already
syncs everything.

**C10. Sticky footer.** Record (always white) vs Complete (white only on overflow). → One
`StickyActionFooter` with a `surface` prop (§1.2).

**C11. BottomSheet keyboard on Android.** Profile changes `BottomSheet` to `behavior="padding"` on
both platforms. Shared look says keyboard handling stays as it is.
→ It is a root-cause fix, but it changes every sheet. Most sheets pass
`keyboardAvoiding={false}`; `SelectSheet` defaults to `true`, as do the School, language and
level pickers. Steps:
1. **Shared-look PR:** reproduce it first on the A03s with Create class → School search (an
   existing text-entry sheet).
2. If the search field sits under the keyboard, the fix lands in the shared-look PR with that
   device check.
3. If it does not reproduce there, the Profile PR verifies with the password sheet and fixes it
   there.
4. Either way, the fix has a "no double lift" device row.

**C12. Error note anatomy.** Shared look: no glyph. Login, Record, Profile: a glyph.
→ The glyph is in (board). Sizes per `InlineNote` (§1.1).

**C13. `colors.emphasis` as text (gap, no section covers it).** `emphasis` stays red500 for
ADR-0003 score bands. But it is also used as **text colour** at small sizes, 4.30:1 on white
(fails), in:
- `AssessmentResultsScreen.js:14` / `AssessmentDetailScreen.js:14` ("Keep practicing!" colour,
  plus the `StatCard` accents);
- `ChildResultsScreen.js:28`;
- `AssessmentHistoryScreen.js:93`;
- `AssessmentTimer.js:10`;
- the `StatBar` value colours on the Insights rankings;
- `ProfileScreen.js:485` (Sign out text, replaced in the Profile PR);
- `TimeTrackingScreen.js:109`.

→ In the shared-look sweep, text uses take `colors.primary` (5.64:1, still "red" for ADR-0003),
and fills, bars and swatches keep `emphasis`. Add these pairs to `contrast.test.js`.

**C14. Dead files.** Shared look deletes `ProfileGearButton` and `SessionsTodayGauge` and sweeps
`SessionsScreen`. Complete deletes `SessionsTodayRing` and says `SessionsTodayGauge` stays. Both
are partly wrong (§7 W1).
→ The **shared-look PR deletes `SessionsScreen`** (unrouted; `AppNavigator.js` never imports it).
- Its launch-guard tests in `sessionLaunchGuard.test.js:141-216` are history-hydration tests of a
  dead screen and go with it; the hook's own guard tests stay.
- It also deletes `SessionsTodayGauge` (no importer), `ProfileGearButton` (no importer) and their
  tests.
- The Session complete PR then deletes `SessionsTodayRing` (its last importer).
- This replaces "sweep it and file an issue".

**C15. Tracker colours diverge from Letter tracker / Child results.** Record moves the tracker
sheet off `letterStateColors`: taught becomes `successText`, assessment becomes `successBg` + lock.
But `LetterMasteryPanel` (used by `LetterTrackerScreen` and `ChildResultsScreen`) also reads
`letterStateColors`. The same mastery would then show in two colour schemes. Shared look's "the
panel is shared with Record's tracker sheet" is wrong (§7 W7).
→ The **Record PR changes `letterStateColors` itself** and gives `LetterMasteryPanel` the same
four tile states and lock glyph, so all three surfaces match. Today's taught tile is white on
`success`, 3.16:1, which fails, so this is a fix as well.

**C16. Session complete route params.** Record says `navigation.replace('SessionComplete', {
childCount })` is unchanged; Complete adds params.
→ The Session complete PR adds them (it ships after Record). Record does not touch the call.

**C17. Date format.** The Complete board says the pill uses "the form's format" (today
"Tue, Oct 13, 2026"). After the Record PR, the form reads "Tue 13 Oct" style, so the board becomes
true. → One `formatSessionDate` (§4 S6).

**C18. Apostrophes.** Children uses the curly "you’re" in new banner copy. Shared look and
Complete keep the presenter's straight `'`.
→ Curly ’ in all user-facing copy these PRs write. The shared-look PR switches
`syncStatusPresenter.js` messages to ’ and updates their tests, so the banner, Home and Session
complete agree.

**C19. Sentence case on no-board screens.** Shared look keeps "Session History" and "Save
Changes"; the board screens move to sentence case.
→ **Sentence-case header titles and button labels in the shared-look sweep** (the words stay the
same). Otherwise "New session" sits next to "Session History". This follows the
full-rollout-for-consistency rule. Tests that assert those strings change in the same PR.

**C20. SyncBanner on Profile.** → None (§1.2).

**C21. Binding-decision checks.**
- Record keeps its structure: yes. The calendar sheet, discard sheet and native-header swap are
  presentation only.
- Session complete builds the Receipt final: yes.
- Children by class: yes.
- Login charcoal arc, no yellow: yes.
- Profile compact + password sheet: yes.
- Sign-out restyle only: yes. Profile builds neither p4's plain confirmation nor p3's copy.
- Home v2 (no "Who to see next"): Record and Complete both exclude it.
- Animation with a still version: yes.

No section contradicts a binding decision.

---

### 4. Cross-screen seams (no single section owns these)

**S1. Record → Session complete → Home.**
1. The tab-bar Record button runs the launch guard (D8 sheet when clocked out), then
   `navigate('SessionForm')`, giving the stack `[MainTabs, SessionForm]`.
2. Submit: `validateLiteracySession` → `persistLiteracySession` → `allowLeaveRef = true` →
   `navigation.replace('SessionComplete', { childCount, childNames, letters, readingLevel,
   sessionDate })`. The stack is now `[MainTabs, SessionComplete]`.
3. `triggerBackgroundSync` (1 s debounce) and `refreshSyncStatus` run after the replace.
4. Session complete calls `refreshSyncStatus({ autoTrigger: false })` on mount. The sync line
   stays blank until that call returns a **non-null** snapshot while the handle is still current
   (`handle.isCurrent()`). `refreshSyncStatus` resolves `null` on a read failure or a stale handle,
   and keeps the previous counters (`OfflineContext.js:78-119`). So a resolved promise alone does not
   prove the status is fresh. On `null` the line shows the neutral "Saved on this phone", with the
   `cloud-outline` glyph and `textSecondary`. It never shows "All saved and synced". Live context
   updates after a non-null snapshot may change the line as usual. (Review round 1, R1.)
5. Done or Android back: `popTo('MainTabs', { screen: 'Home' })`, guarded against a double tap.
   This lands on the Home tab even when Record was launched from Children. The iOS swipe stays
   disabled.
6. Home refocuses, reloads its goal, and shows the new count **statically**. Home gets no
   animation change.
7. A save failure stays on the form with the inline note. No toast, no navigation.
8. Status bar: canvas (dark) on the form, then `FocusAwareStatusBar light` on Complete, then light
   on Home. No flash, because the stack and tab `contentStyle` / `sceneStyle` are canvas, and
   Complete paints red behind the inset as Home does.

**S2. Sync signals: one source, four presentations.** All derive from `useOffline()` →
`deriveSyncState` / `describeSyncState`:
- Home hero (unchanged);
- the tab-root header pill;
- the Children `SyncBanner` (count = `waitingCount`, C9);
- the Session complete `SyncStatusLine`.

Only one of them speaks: the pill's `accessibilityLabel`. The banner and the line are not live
regions. Signed out, Login uses `useNetworkOffline`, which treats unknown as online so nothing
flashes at launch. `OfflineContext` (`OfflineContext.js:281`) treats `isConnected: null` as
offline. That difference is intentional and must stay documented beside the hook.

**S3. Toast host.**
- One `ToastProvider` at the root, inside `SafeAreaProvider` and **outside** `PaperProvider`. It
  holds the toast state and renders `<PaperProvider>{app}</PaperProvider>` followed by its own
  `<ToastHost />` as a **later sibling**. Toasts do **not** use Paper `Portal`.
  - Why: every `BottomSheet` renders through Paper `Portal` (`BottomSheet.js:105`). Paper's
    `PortalManager` appends each portal in its own absolute-fill wrapper in mount order, so a child
    `zIndex` cannot order one portal above another.
  - A later native sibling of the whole Paper tree always draws above every portal, whatever the
    mount order.
  - `ToastHost` uses tokens and `typeRoles` directly; it needs no Paper theme. (Review round 1, R4.)
  - Device rows: toast then sheet, sheet then toast, and a toast replaced while a sheet stays open.
    Dismiss must stay tappable in all three.
- Obstructions register their measured height through `useToastObstruction`: the tab bar while
  its navigator is focused, and `StickyActionFooter` while mounted. The keyboard is read through
  `useKeyboardHeight`. The toast sits 8 above the highest of these.
- The Login PR removes the auth screens' toasts (errors go inline). The Record PR removes the
  form's (save failure inline). The Profile password sheet uses inline errors, except for an
  outcome that arrives after the sheet was dismissed.
- **Toasts are actor-scoped** (review round 1, R2).
  - The root host outlives `AuthProvider`. A late callback from a signed-out EA's tree could
    otherwise publish onto Login or onto the next EA's session. For example, the clock-out result
    in `TimeTrackingContext.js:264-268` publishes after an awaited `refreshSyncStatus`.
  - Inside the signed-in tree, `useToast()` returns a publisher bound to the current handle
    (`useSignedInEA().handle`). Each `show()` checks `handle.isCurrent()` first and is dropped
    silently if the handle is stale. Each message is tagged `actorKey = ${userId}:${epoch}`.
  - Outside the signed-in tree (Login, Reset, bootstrap), `useToast()` returns an unscoped
    publisher (`actorKey = null`).
  - When the current actor key changes (sign-out, account switch), the host clears every message
    whose tag differs from the new key, including the one on screen.
  - So a toast survives navigation within one EA's session, never survives sign-out, and never
    crosses EAs. The suspension message is published by the signed-out Login screen, so it is
    unaffected.
  - Tests: a clock-out held across sign-out publishes nothing on Login; the same across an account
    switch; a toast survives navigation from Record to Home within one session.

**S4. Sign-out → Login.**
- The `useSignOutFlow` behaviour and its strings are unchanged, and `signOutFlow.test.js` stays
  unchanged.
- The sheets restyle to `BrandButton`: "Clock out now" `primary`, "Stay clocked in…" `secondary`,
  "Sign out anyway" `destructive`, upload `secondary`, Cancel `tertiary tone="ink"`.
- The clocked-in warning becomes `InlineNote tone="warning" size="md"`.
- After sign-out, `AppRoot` renders Login on the red field with no provider dependency
  (`useNetworkOffline`).
- Suspension: a banned EA's next sign-in shows "Your access is paused. Please contact your
  supervisor." It is a toast after the shared-look PR and an inline note after the Login PR. The
  signed-in silent sign-out path is unchanged.

**S5. Motion.** One `MotionProvider`. Consumers:
- `BottomSheet` rise;
- `Toast` slide;
- `BrandButton` and `LetterToggleTile` press scale (off under `reduceMotion`);
- the header pill and `HeroSyncIndicator` spinners (still under `reduceMotion`);
- the Children "Syncing…" row spinner;
- Session complete (`CELEBRATION_LEVELS`).

Screen tests pin a level through `MotionProvider value`.

**S6. One session date format** (`utils/sessionDateFormat.js`):

| Style | Example | Used by |
|---|---|---|
| `fieldToday` | "Today · Thu 15 Oct" | Record date field, on the programme day (`toLocalDateString`) |
| `field` | "Mon 12 Oct 2026" | Record date field, any other day |
| `calendarLabel` | "Thu 15 October 2026" | Calendar day labels (", unavailable" appended by the caller) |
| `pill` | "Tue 13 Oct" | Session complete back-dated pill suffix |
| `spoken` | "Tuesday 13 October" | Session complete announcement |

**Inputs are `YYYY-MM-DD` calendar keys only** (review round 1, R3). `formatSessionDate` never
receives a `Date`.
- Record's picker `Date` is a calendar-day carrier built at device-local midnight
  (`LiteracySessionForm.js:63-65`). The form turns it into a key with its existing calendar-part
  serialisation (`formatDateForStorage`, `:56-60`), the same key it saves.
- `toLocalDateString` (Africa/Johannesburg) is applied only to real instants such as "now", to get
  today's key for the `fieldToday` comparison.
- Passing the picker `Date` through `toLocalDateString` would shift the day on a device whose zone
  is east of Johannesburg. With `TZ=Pacific/Auckland`, 18 Oct at local midnight becomes 17 Oct.
- So "today" is the same key on the form, on Complete and on Home, and the field, calendar, stored
  date and receipt always agree.
- Test: under `TZ=Pacific/Auckland`, the field label, calendar selection, stored `session_date`
  and Session complete pill all name the same day.

**S7. Initials and names.** `getInitials` serves Children rows, the Record roster, Record progress
blocks and the Profile identity. `formatNameList` serves the Session complete receipt. First names
come from the same `children` rows, so a child's initials match on every screen.

**S8. Letters.** One letter-case rule (§6 Q3) for the Record focus grid, the tracker sheet,
`LetterMasteryPanel` (C15) and the Session complete receipt. Order: the focus grid and receipt use
`LETTER_ORDER`; the tracker uses `PEDAGOGICAL_ORDERS[language]` (unchanged). Accessibility labels
keep capitals so screen readers say letter names (Record call 8 applies to the receipt as well).
EGRA capture screens are out of scope.

**S9. Bottom clearance on tab roots.** Home, Children and Class detail pad their last content by
the exported `FAB_OVERHANG + 16`.

**S10. Group colour.** `getGroupDotColor(index)` (six colours) is the only group colour:
Class detail chips, the group picker rows and Edit child, all in the Children PR. Groups at index
5 and above change hue versus today's eight-colour tints. Accepted, because the old colours
already differed between screens.

**S11. Supervisor wording.** New copy says "supervisor", matching the existing strings
(`NoActiveProgrammeNotice.js:22`, `useSessionLaunchGuard.js:15`, `HomeScreen.js:243`). Children
keeps its existing "Ask Head Office to assign your active programme" (a different actor, existing
copy).

---

### 5. PR order

Merge PRs one at a time, rebasing each on the last. Parallel branches that append build-log
register rows conflict (known gotcha). Each PR gets its own EAS preview build and device check.

1. **Shared look** (`feat/bold-red-shared-look`). Everything in §1.1: tokens, `tints`, roles,
   Figtree 600, themes, header, tab bar, toast, motion contract, `describeAuthError`, the
   no-board sweep (including C13, C18, C19), dead-file deletions (C14), and guards. The ratchet
   list is the 10 board files. `src/assessment-questions/**` (the WelaPLUS package, `.ts`/`.tsx`
   with its own `theme/tokens.ts`) is **excluded** from the guard and the sweep: it is a separate
   package with its own token contract. Home device row: unchanged apart from the 4dp
   `FAB_OVERHANG`.
2. **Children** (most-used tab after Home). It is the lowest-risk behaviour change and the first
   consumer of `ListGroup`/`ListRow` on a board screen. It builds `Avatar`, `getInitials`,
   `SyncBanner` and `InlineLoading`, which Record and Profile reuse.
3. **Record.** It needs `Avatar`, `SearchField`, `SegmentedControl` and `ListRow`. It builds
   `StickyActionFooter`, `ConfirmSheet`, `formatSessionDate` and `validateLiteracySession`, plus
   C15.
4. **Session complete**, right after Record, for three reasons:
   - It edits the same `handleSubmit` (route params).
   - It reuses `StickyActionFooter` and `formatSessionDate`.
   - The capture flow can then be device-checked end to end (S1) on one build.
5. **Profile.** It reuses `ConfirmSheet`, `Avatar`, `TextField` and `SegmentedControl`, and lands
   C11 if the shared-look PR did not.
6. **Login and reset password.** This PR is independent: it touches only `auth/` screens, the
   `TextField` red tone and `useNetworkOffline`. It is **blocked on assets and consent (§6 Q1)**,
   so it goes last by default and may move up as soon as the assets arrive. The suspended-EA copy
   is already live after PR 1, so nothing urgent waits on it.

---

### 6. Questions for Jim (only ones that change the build; default built if unanswered)

**Jim's answers (2026-10-19). These supersede the defaults below.**
1. **Login assets: supplied.** Jim provided the learner photo and the white mark (Masi's own
   material). They are built from the canvas originals, which carry the board's exact crop:
   - `assets/login/learner-artwork.webp` at @1x, @2x and @3x (296×430 dp; 22, 56 and 102 KB,
     lossy WebP with alpha, q80). The source PNG was 2.8 MB.
   - `assets/brand/masi-mark-white.png` at @1x, @2x and @3x (48×41 dp).
   - The wordmark stays typeset (MASI in Bricolage 800, NYUSANE in Bricolage 700), as the board
     draws it. The Login PR loads `BricolageGrotesque_700Bold` from the already-installed package
     as `fontFamilies.displayBold`.
   - Jim's `white-logo.png` (the real logotype lockup) is only 106×41 px, too small for 2x/3x
     screens. If Jim later wants the real logotype instead of typeset text, a lockup of at least
     318×123 px (ideally SVG) is needed. That is a follow-up, not a blocker.
   - The Login PR is no longer blocked.
2. **Celebration on A03s-class phones: yes.** The default stands (`CELEBRATION_LEVELS =
   ['full', 'calm']`). Jim will confirm smoothness on a real device when the PR is built.
3. **Lowercase letter tiles: yes**, as the boards draw them.
4. **Hide "Forgot password?" until reset is fixed.** The Login PR removes the link from the Log
   in screen, and the `ForgotPassword` route stays registered but unreachable. The Reset password
   restyle in part 6 is still built, so it is ready when recovery is fixed. The Login PR files a
   GitHub issue: "Password recovery: deep link + set-new-password screen". It is not decided by a
   device check any more.
5. Sign-out (Q5) and splash (Q6) keep their defaults. Q6: the splash is out of scope.

1. **Login assets and consent (blocks the Login PR).** The board's white Masi lockup and the
   learner cut-out are canvas blobs that are not in the repo. Can you supply both at full
   resolution, and confirm Masi has consent to show that child in the app? *Default:* the Login PR
   waits. Without consent, we need a different photo.
2. **Do 3 GB phones like the A03s get the Session complete celebration?** Zazi's tiers (field-proven
   cutoffs) put the A03s (about 2.9 GB reported) at `low`.
   - "Low-end gets still", read literally, means the A03s class never sees the celebration.
   - The animation is cheap: one 300ms JS-driven path, the rest native-driver transforms.
   - *Default:* the celebration plays at `full` and `calm`. The still version goes only to Reduce
     Motion and the `static` tier (Android below 1.5 GB reported, Android Go class).
   - This is gated by a 60fps screen-record frame check on the A03s. If that drops frames, the
     constant becomes `['full']`.
   - Your answer changes that one constant and what the device check verifies.
3. **Lowercase letters?** The boards draw tiles lowercase ("m"), and the Record components board
   asks to confirm with the programme team. It applies to the Record focus grid, the tracker sheet,
   Letter tracker / Child results (C15) and the Session complete receipt. *Default:* lowercase, as
   drawn.
4. **Reset link (if the D9 device check shows it dead-ends).** The reset email points at
   `masi-app://reset-password`. The app has no deep-link config, `detectSessionInUrl: false`, and
   `updatePassword` has no caller. *Default:* if D9 confirms the dead end, hide "Forgot password?"
   and file "password recovery screen + deep link" as its own issue. A button that sends an email
   that goes nowhere is worse than no button. The alternative is to ship it anyway.
5. **Sign-out confirmation when nothing is pending.** Your decision says the confirmation "already
   exists". It exists only when the EA is clocked in or has unsent items. Otherwise one tap signs
   her out (`useSignOutFlow.js:46`), and offline she then cannot sign back in. *Default:*
   unchanged, per "do not change its behaviour". p4's plain "Sign out?" and p3's copy are not
   built.
6. **Splash.** Cold start shows Expo's placeholder `splash-icon.png` on white, then a full-red
   Login. *Default:* out of scope. If yes, the Login PR sets a `red600` splash with the white
   mark, which needs the mark asset from Q1.

**Decided by Jim's "go with your picks"** (no longer questions):
- The banner count uses `waitingCount` (C9).
- Done goes to the Home tab via `popTo`. This matches ROADMAP §5's recorded request and overrides
  the components board's "goBack()" build note.
- Sign-out copy stays as it is today.

**Builder's calls Jim should glance at** (risky or visible):
1. **`colors.primary` red500 → red600** across about 90 uses, with graphics pinned to `red500` by
   name (§2.1). Every red button, link and FAB darkens slightly.
2. **Editable fields get a darker edge than the boards** (review round 1, R6, changed from
   "kept at 1.52:1").
   - The boards' ink-20% edge is 1.52:1 on white and 1.40:1 on canvas. A white field on the canvas
     is only 1.08:1, so nothing else marks the editable area. That fails WCAG 1.4.11's 3:1.
   - New solid token **`colors.fieldEdge = '#858182'`** (ink at 55% over white): 3.85:1 against
     white and 3.55:1 against canvas.
   - Used for the rest edge of `TextField`, `SearchField` and `SelectField` on canvas. Their
     focus (2dp ink) and error (2dp `error`) states are unchanged.
   - Secondary buttons, tiles, chips and segmented tracks keep `tints.control`, since their label
     or glyph identifies them.
   - Login's fields on red are unaffected: white on `red700` is far above 3:1.
   - `contrast.test.js` pins both `fieldEdge` pairs.
   - Visible change: field outlines read a step darker than the boards.
3. **Figtree 600 loaded** (overrides four sections).
4. **Header from the navigator.** Titles change: "My Children" → "Children", "Class Details" →
   the class name, "My Profile" → "Profile", "New Session" → "New session", "Reset Password" →
   "Reset password". Titles are left-aligned.
5. **Sentence case swept onto no-board screens** (C19).
6. **Toast replaces every Snackbar**, always shows Dismiss, and outlives navigation.
7. **BottomSheet Android keyboard change** (C11) affects every keyboard-avoiding sheet.
8. **Class detail FAB removed**, replaced by an "Add child" link.
9. **Record presentation swaps:** the date popover becomes a calendar sheet, the discard
   `Alert.alert` becomes a sheet, and the Snackbar becomes an inline save failure.
10. **`SessionsScreen`, `SessionsTodayGauge`, `ProfileGearButton` and `SessionsTodayRing` deleted,
    with their tests** (C14).
11. **Tracker and mastery colour scheme changed app-wide** (C15).
12. **Contrast fixes that change colour:**
    - Sequential assessment "Correct" becomes `successText`.
    - Time tracking "Clock Out" becomes `secondary`.
    - Taught letter tiles become `successText`.
    - The Session complete synced glyph becomes `successText`.
    - Small-text uses of `emphasis` become `primary` (C13).
13. **Session complete board deviations:**
    - three-fan confetti instead of the final board's stale scatter;
    - a halo radius formula, so the halo is not cut flat at 411dp;
    - " today" after the no-target numeral (Home has none);
    - the sync line held until its own refresh resolves.
14. **Password sheet** can be dismissed mid-request; a late outcome becomes a toast.

---

### 7. Section claims checked against the code and found wrong

| # | Section | Claim | Fact (file:line) | Effect |
|---|---|---|---|---|
| W1 | Complete | "`SessionsTodayRing` … this screen is its only consumer"; "`SessionsTodayGauge` stays: the orphaned `SessionsScreen` still imports it" | `src/screens/main/SessionsScreen.js:13` imports **`SessionsTodayRing`**. `SessionsTodayGauge` has no importer (only `__tests__/SessionsTodayGauge.test.js`). | Deleting the Ring alone breaks `SessionsScreen` and `sessionLaunchGuard.test.js`. Resolved by C14. |
| W2 | Record | "Record without clocking in": `colors.surface` fill, 1.5 solid `colors.warning` border | Board `red-flow-03-clock-in-sheet` and `RedSystemSheet`: `background:#FFF8E1`, `border:1.5px solid rgba(178,106,0,.38)` | Use shared look's `warning` variant (`warningBg` + `tints.warningControl`). |
| W3 | Shared look | Header: `paddingTop insets.top + 6`, row min height 56 | Boards: `padding:56px 24px 6px` at a 47dp inset, with a 44 content row (`red-record-final`, `red-profile-p1-compact`, `red-login-s-forgot`); the tab root has `62px` with a 32 title row (`red-children-final`) | Resolved geometry C2 (inset + 9, row 44). |
| W4 | Shared look | `tertiary` = `textLink` 14/20 for "View all", "Sync now", "Add child" | Boards: "Add child", "Manage classes", "Add another class" and "Forgot password?" are **15/20** 800. Only "Sync now", "View all" and "Show passwords" are 14/20. | `tertiary` defaults to `textButton`; `size="sm"` gives `textLink`. |
| W5 | Shared look | Pill `needs_attention`: `alert-circle-outline` + "{n}" | `red-children-components` §03 A: a triangle `warning` glyph + "1" + a 14dp `chevron-forward` in `#8A4B00` | Children's table is the spec. |
| W6 | Shared look | "The 2 graphic uses" of `colors.primary` move to `red500` | Also `SessionCountRankingScreen.js:62` `barColor={colors.primary}` (a bar graphic) and `StatBar.js:53` (a tappable underline, replaced by the restyle) | Add the bar to the `red500` list. |
| W7 | Shared look | `LetterTrackerScreen`: "the panel is shared with Record's tracker sheet" | `LetterTrackerScreen.js:5` renders `assessment/LetterMasteryPanel`. The sheet is a separate component (`session/LetterTrackerBottomSheet.js`). They share only `constants/letterStateColors.js` (`LetterMasteryPanel.js:8`, `LetterTrackerBottomSheet.js:11`). | Resolved by C15. |
| W8 | Shared look | `SyncBanner` "restyled for Children and Profile" | The Profile section has no banner, and no board draws one there | Children only. |
| W9 | Shared look | Theme at `App.js:93-117`; "overrides 20 MD3 roles"; `NavigationContainer` at `AppNavigator.js:356` | Theme is `App.js:109-132` and sets 18 MD3 roles plus the custom `success`; `NavigationContainer` is `AppNavigator.js:364` | Citations only. The finding stands. |
| W10 | Profile | `BottomSheet`'s "`maxHeight: '100%'`" resolves against the space above the keyboard | `BottomSheet.js:25` defaults `maxHeight = '80%'`. Keyboard avoidance is opt-in per sheet (`keyboardAvoiding`, default `true` at `:24`; five sheets pass `false`) | The fix must set the wrapper's height and keep the 80% default unless the password sheet passes its own value. Blast radius is the keyboard-avoiding sheets only. |
| W11 | Record, Profile, Complete | Shadow radii 22 / 24 / 28 | They copy the CSS blur. RN `shadowRadius` ≈ blur ÷ 2 (shared look's rule) | §2.3 values. |
| W12 | Login, Children, Record, Profile | "Figtree 600 is not loaded, so map it to 700" | True today (`App.js` `useFonts` loads only 500/700/800), but superseded | C4. |

The other line-cited claims check out against the code:
- `OfflineProvider` exists only in the signed-in tree (`App.js` `AppRoot`).
- `redirectTo: 'masi-app://reset-password'` (`AuthContext.js:284`); `detectSessionInUrl: false`
  (`supabaseClient.js:23`); `updatePassword` has no caller.
- The three validation rules (`LiteracySessionForm.js:495-497`); `replace(… { childCount })`
  (`:538`); `Alert.alert` (`:419`); the Snackbar save failure (`:548`).
- The 1000ms sync debounce (`OfflineContext.js:11`).
- Sign out with nothing pending finishes at once (`useSignOutFlow.js:46`).
- `isInvalidCredentialsError` (`ProfileScreen.js:23`); `FAB_OVERHANG = 28` (`HomeScreen.js:34`).
- The Class detail FAB has no `color` (`ClassDetailScreen.js:236`).
- `GROUP_COLORS` includes `#C62828` and `#F57F17` (`groupColors.js:8-9`).
- `edgeToEdgeEnabled` (`app.config.js:52`).
- React Navigation 7.5.3 `StackRouter` `NAVIGATE` pushes unless `pop: true`, so `popTo` is
  correct.
- `isAuthRetryableFetchError` and the `user_banned`, `invalid_credentials` and rate-limit codes
  exist in auth-js 2.100.1, re-exported by supabase-js.

---

### 8. Review round 1 (Codex adversarial review and builder check, 2026-10-19)

**Codex verdict: needs-attention, 7 findings. All accepted and fixed in this file.** Where a part
still says otherwise, this section wins.

| # | Finding | Resolution |
|---|---|---|
| R1 | High: Session complete's sync line could say "All saved and synced" after a failed or stale `refreshSyncStatus` (it resolves `null` and keeps old counters). | §4 S1 step 4: the line waits for a non-null, current-handle snapshot. On `null` it shows "Saved on this phone". New test: refresh resolves `null` while previous counters are zero, so the line never says synced. |
| R2 | Medium: the root toast outlives the EA's tree, so a late callback (clock-out result after an awaited refresh) could publish on Login or over the next EA. | §4 S3: toasts are actor-scoped. Signed-in publishers check `handle.isCurrent()`; the host clears other actors' messages on change. Tests across sign-out and account switch. |
| R3 | Medium: `formatSessionDate` taking `Date`s through `toLocalDateString` can name yesterday for Record's local-midnight picker date east of Johannesburg. | §4 S6: keys only. Record keys its picker date with `formatDateForStorage`; `toLocalDateString` only for instants. Auckland-timezone regression test. |
| R4 | Medium: zIndex cannot order separate Paper portals, so a toast could sit under a later sheet and lose Dismiss. | §4 S3: the toast host is a later native sibling of the whole `PaperProvider` tree, not a portal. Three device rows for mount order. |
| R5 | Medium: Reset password's "Back to sign in" keeps `navigate('Login')`, which pushes `[Login, ForgotPassword, Login]`; Back reopens the finished reset screen. | Part 6: "Back to sign in" calls `navigation.popTo('Login')`. The test uses the real stack router and asserts one `Login` route and that Back does not reopen Reset. |
| R6 | Medium: the 1.52:1 field edge fails WCAG 1.4.11, and the white field on canvas is 1.08:1, so nothing else marks the editable area. | Builder's call 2 reversed: new `colors.fieldEdge` `#858182` for editable fields only, pinned in `contrast.test.js`. |
| R7 | Medium: part 1's guards contradict part 1's own theme (`navigationTheme` needs `fontWeight: 'normal'`; sheet and nav shadows use raw `#3A2424`). | Part 1 §10 amended: one named exception, `src/theme/navigationTheme.js` may set `fontWeight: 'normal'` on its `fonts` entries, because React Navigation's theme type requires the key. That file's `fontFamily` values must still be `fontFamilies` faces. `#3A2424` becomes `colors.shadowWarm`, so the hex rule needs no exception. |

**Builder check: "nothing important left."** It confirmed that Home never reads `colors.primary`;
that the form, Session complete and Home share one Johannesburg day rule; that only two consumers
read `letterStateColors`; that the Zazi `deviceTier.js` source is on disk; and that every cited
board exists. Its three small gaps are settled as builder's calls:
1. **`textData`** (Figtree 700 15/20, tabular) is added to the §2.2 role table. Part 1 §9 uses it.
2. **The Children banner shows and hides on `waitingCount`** (C9's count), in the waiting,
   offline and syncing states, not on `totalUnsyncedCount`. So it also appears when only sessions
   or time entries are waiting, and a pull alone never shows "Syncing 0 items…".
3. **The Login learner photo is decorative** (`accessible={false}`, no alt text). Part 6's hero-art
   spec wins over its builder's call. The photo may change anyway under §6 Q1.

It also noted a cost: with no `fontWeight` allowlist, PR 1 rewrites about 103 uses across 50 files.
That is intended. Leaving any of them would drop Android back to the system font once Paper's
default face is Figtree.

#### Round 2 (Codex, 2026-10-19)

**Recheck of round 1:** R1 to R6 are confirmed closed against the code. A router probe confirmed
R5: `popTo` gives `[Login]`, while `navigate` gave `[Login, ForgotPassword, Login]`. R7 was only
half closed (R8 below). **Four new findings, all accepted:**

| # | Finding | Resolution |
|---|---|---|
| R8 | High: Record's discard guard uses `beforeRemove`, which a native-stack iOS swipe bypasses. `onDismissed` dispatches `POP` after the native view has already gone, so "Keep editing" cannot bring the form back and the draft is lost. This is inherited from today's code (`LiteracySessionForm.js:415-433`, `AppNavigator.js:245-251`); the restyle would have kept it. | Part 3 "Discard sheet" amended. The guard uses React Navigation 7's `usePreventRemove(preventLeave, ({ data }) => …)`. The native stack honours it as `preventNativeDismiss`, so the swipe is refused natively. `preventLeave` is React state, `isDirty && !allowLeave`, from the same dirty rules as today. The sheet, copy and stored-action dispatch are unchanged. A clean form and a successful submit still leave freely. This is a correctness fix, not a behaviour change: today's intended behaviour finally holds on iOS. Device rows: on iOS, a dirty form swiped then "Keep editing" keeps the same form with every entered value editable; swipe then "Discard" leaves; a successful submit is not blocked; Android back behaves as on iOS. |
| R9 | Medium: the new `fieldEdge` and `shadowWarm` tokens break `colors.test.js`'s exact key set and palette. | §2.1: the test contract adds exactly those keys and values, with explicit pins. |
| R10 | Medium: `successText` on `successBg` is 4.4986:1, so the full-precision contrast gate would fail on the prescribed palette. | `successText` is retuned to `#2B7524` (4.996:1). The contrast test never rounds. |
| R11 | Medium: Paper's `configureFonts` merges each variant over the MD3 defaults, so the theme must set `fontWeight: undefined` explicitly, which the guard forbade. | Part 1 §10: a second named exception. `src/theme/paperTheme.js` may contain `fontWeight: undefined` and nothing else. `paperTheme.test.js` asserts that every resulting variant has `fontWeight === undefined` and a `fontFamilies` face. |


#### Round 3 (Codex, 2026-10-19): approve

No material findings.
- **R8:** confirmed with a probe against the installed React Navigation core and stack router.
  - A successful submit replaces once with no prompt.
  - A clean form leaves freely.
  - "Keep editing" preserves the draft, and "Discard" dispatches the stored action without a
    second prompt.
  - The form stays guarded after a save failure.
  - Replacing immediately after the state setter, without waiting for the next effect, is blocked,
    which is why the spec waits.
- **R9 and R10:** the 44 colour keys pass the amended palette contract. `successText` is 4.996:1
  on `successBg`.
- **R11:** `configureFonts` keeps an explicit `undefined` weight across all 16 variants.
- **Still to verify in the build:** the device gates and the new `contrast.test.js`.
