# Design System — Bold Red

**Standing reference, reconciled through Login PR 6 Task 8 on `feat/bold-red-login`, 2026-10-19.** This describes
the implementation, with all board-screen exceptions removed. Update it in the same branch
as a change to the system. Automated verification is recorded in [build-log.md](./build-log.md);
native visual acceptance remains the shared-look plan's Task 34, the Children plan's Task 11,
the Record plan's Task 14, the Session complete plan's Task 14, the Profile plan's Task 10 and
the Login plan's Task 11 (Reset D10 is deferred to recovery issue #78).

The design source is the Design Round 4 `RedSystemSheet` and chosen `red-*-components` boards.
The [overview](../docs/superpowers/specs/2026-10-18-bold-red-app-design.md) resolves conflicts in
the [shared-look spec](../docs/superpowers/specs/2026-10-18-bold-red-app-1-shared-look.md).
This guide uses the actual exports and props rather than superseded names in those drafts.
It supersedes the archived `BRANDING.md` and `colour-semantics.md`.

## Building a screen

Use a warm canvas, ink text, red actions, and ink selected states. Choose a `typeRoles` entry for
text and a shared primitive for controls. Let the navigator render `ScreenHeader`; use
`SectionHeader` only for sections inside the page. Compose forms from `TextField`, `SelectField`
and `SelectSheet`, actions from `BrandButton`, and lists from `ListGroup`/`ListRow`. Publish transient
feedback through `useToast()`; use `InlineNote` for a persistent field error or warning.

Use minimum heights for controls containing copy so they can grow with large text. Keep touch
targets separate; icon-only controls have fixed 44dp targets. Titles, field notes, buttons and
toasts wrap. Some existing compact displays deliberately cap scaling (documented below); do not
copy those restrictions onto ordinary body text. Screen headers and button labels use sentence
case; proper nouns such as Head Office and EGRA retain their capitals.

| Concern | Source | Verification |
|---|---|---|
| Colours, tints, spacing, radii, shadows | [`src/constants/colors.js`](../src/constants/colors.js) | `colors.test.js`, `contrast.test.js`, `noLegacyHues.test.js` |
| Faces and type roles | [`src/constants/typography.js`](../src/constants/typography.js) | `typography.test.js`, `homeTypeRoles.test.js` |
| Paper and navigation themes | [`src/theme/`](../src/theme/) | `paperTheme.test.js` |
| Shared primitives | [`src/components/common/`](../src/components/common/) | Component behaviour/accessibility tests |
| Toast ownership and placement | [`ToastContext.js`](../src/context/ToastContext.js), [`Toast.js`](../src/components/common/Toast.js) | `Toast.test.js`, `ToastActorScope.test.js`, `useKeyboardHeight.test.js` |
| Motion | [`MotionContext.js`](../src/context/MotionContext.js), [`deviceTier.js`](../src/utils/deviceTier.js), [`motion.js`](../src/constants/motion.js) | `MotionContext.test.js`, `deviceTier.test.js`, sheet/spinner tests |
| Source-wide adoption | [`designSystemGuard.test.js`](../__tests__/designSystemGuard.test.js) | All app JavaScript except WelaPLUS; board ratchet below |

## Colour and geometry tokens

Import `{ colors, tints, spacing, borderRadius, shadows }` from `src/constants/colors`.
`colors.test.js` pins exact keys and values and rejects colours outside its approved palette.
Adding a semantic token therefore requires an intentional test-contract change.

| Token(s) | Value | Use |
|---|---|---|
| `primary` | `#C81F3E` (`red600`) | Action fills and small action text; white text passes contrast |
| `primaryDark` | `#A4182F` (`red700`) | Pressed primary action |
| `primaryLight` | `#EC5470` (`red400`) | Existing light brand token |
| `red500`, `emphasis` | `#E72D4D` | Data graphics and score-band semantics; white small text on it fails 4.5:1 |
| `background` | `#F8F5F4` | Warm canvas |
| `surface`, `cardBackground`, `onDark` | `#FFFFFF` | White surfaces or foreground on dark/coloured fills |
| `text` | `#221A1B` | Ink: body text, selected control fills, toast background |
| `textSecondary`, `placeholder`, `info` | `#76696B` | Muted text, placeholder, neutral information |
| `border` | `#ECE5E4` | Dividers and disabled fills |
| `disabled` | `#B3A8A8` | Disabled foreground |
| `fieldEdge` | `#858182` | Editable-field rest edge; at least 3:1 against white and canvas |
| `shadowWarm` | `#3A2424` | Warm card/sheet/navigation shadows |
| `error` / `errorBg` | `#B3261E` / `#FCEAE8` | Errors and destructive actions; distinct from brand red |
| `warning`, `accent` | `#B26A00` | Caution glyphs and graphics |
| `warningBg` / `warningText` | `#FFF8E1` / `#8A4B00` | Caution surfaces and their readable text |
| `success` | `#3FA535` | Success graphics; use `successText` for small text or a filled text button |
| `successBg` / `successText` / `successBorder` | `#E7F3E5` / `#2B7524` / `#CDE8C9` | Success surfaces, text and edges |
| `tabActive` / `tabInactive` | `red600` / `textSecondary` | Destination glyphs and labels |
| `heroDark` / `heroSurface` / `heroBorder` / `onDarkMuted` | `#1C1517` / `#2A2224` / `#3A2F31` / `#C9BFC0` | Existing dark-hero palette |
| `ringNeutral` / `ringStart` | `#9AA3AB` / `#8A939C` | Home gauge's neutral and first-session stages |

The red ramp is `red50 #FDECEF`, `red100 #FBD5DC`, `red200 #F4A9B6`, `red300 #EE7D90`,
`red400 #EC5470`, `red500 #E72D4D`, `red600 #C81F3E`, `red700 #A4182F`, `red800 #7C1223`,
`red900 #530B17`. Red fields use the ramp by name; actions use `primary`/`primaryDark`.
Home's segmented gauge and the session-ranking bars explicitly use `red500` for progress.
Session complete uses the same gauge colour rule; the older `SessionsTodayRing` is deleted.

`successText` was deepened from `#2E7D27`: the old value on `successBg` was 4.4986:1 and failed
the full-precision threshold. `contrast.test.js` checks the declared text pairs at ≥4.5:1 and
graphic pairs at ≥3:1 without rounding. It is a defined-pair test, not an audit of every screen.
Assessment score-band meaning remains owned by `src/utils/scoreBands.js` (ADR-0003); do not
collapse distinct data colours into a generic UI status.

### Derived tints

Use named tints rather than repeating alpha literals in screens. Values are derived from approved
base colours in `colors.js`; the exact set is pinned by the colour tests.

| `tints` key | Derivation | Value | Use |
|---|---|---|---|
| `rule` | `text + '1F'` | `#221A1B1F` | Group/card edge, header hairline |
| `control` | `text + '33'` | `#221A1B33` | Secondary controls, chip/segment track, grabber |
| `pressed` | `text + '0F'` | `#221A1B0F` | Row pressed fill, canvas focus halo |
| `onRedTile` | `surface + '24'` | `#FFFFFF24` | Translucent red-surface control fill |
| `onRedHalo` | `surface + '52'` | `#FFFFFF52` | Red-field focus halo |
| `onRedKeyline` | `surface + 'B8'` | `#FFFFFFB8` | Login artwork keyline |
| `onRedOutline` | `surface + 'D9'` | `#FFFFFFD9` | Secondary button edge on red |
| `onRedDisabled` | `surface + '61'` | `#FFFFFF61` | Disabled primary fill on red |
| `warningEdge` | `warning + '4D'` | `#B26A004D` | Attention-pill edge |
| `warningControl` | `warning + '61'` | `#B26A0061` | Warning-button edge |
| `avatarEdge` | `red700 + '2E'` | `#A4182F2E` | Ringed roster-avatar edge |
| `spinnerTrack` | `textSecondary + '47'` | `#76696B47` | Canvas sync spinner track |
| `scrim` | `heroDark + '7A'` | `#1C15177A` | Sheet backdrop |

`spacing = { xs: 4, sm: 8, ms: 12, md: 16, ml: 20, lg: 24, xl: 32, xxl: 48 }`.
`borderRadius = { sm: 9, md: 14, lg: 18, xl: 22, pill: 999 }`. One-off geometry gaps may
remain literal; raw typography and colour literals have stricter rules below.

| Shadow | Colour | Offset y | Opacity | Radius | Android elevation |
|---|---|---|---|---|---|
| `card` | `shadowWarm` | 4 | 0.06 | 10 | 2 |
| `elevated` | `shadowWarm` | 6 | 0.10 | 14 | 4 |
| `primaryButton` | `red600` | 10 | 0.22 | 11 | 4 |
| `onRedButton` | `red900` | 8 | 0.22 | 10 | 4 |
| `fab` | `red600` | 10 | 0.28 | 10 | 8 |
| `toast` | `text` | 12 | 0.24 | 14 | 12 |
| `sheet` | `shadowWarm` | −8 | 0.10 | 12 | 16 |
| `nav` | `shadowWarm` | −8 | 0.06 | 12 | 8 |

All x offsets are zero. Shared `SurfaceCard` and `ListGroup` have no shadow. The shadow names
`action` and `onRedAction` in the early part spec are superseded by `primaryButton` and
`onRedButton`; RN shadow radius uses roughly half the board's CSS blur.

## Typography

Import `{ fontFamilies, typeRoles }` from `src/constants/typography`. The legacy `typography`
export is retired. `App.js` loads Bricolage Grotesque 700/800 and Figtree 500/600/700/800 while the
splash is held; a load error is logged and releases the splash with system-font fallback.

| Family key | Registered face |
|---|---|
| `display` | `BricolageGrotesque_800ExtraBold` |
| `displayBold` | `BricolageGrotesque_700Bold` (lockup only) |
| `textMedium` | `Figtree_500Medium` |
| `textSemi` | `Figtree_600SemiBold` |
| `textBold` | `Figtree_700Bold` |
| `textHeavy` | `Figtree_800ExtraBold` |

Choose the face for the weight; never add `fontWeight` to a custom-family style, because Android
can fall back to the system font. Bricolage is for display headings/numerals at 18 or above;
Figtree carries UI copy, letters and row data. Roles carry geometry/family, not colour: add a
semantic `color` at the call site. The eight original Home roles remain unchanged.

The table lists all 45 roles. A dash means tracking is not set in the role (Paper explicitly uses
zero). **Addition** marks the seven shared-look plan additions beyond the overview's role table;
Children adds three initials roles. Each captures Home or board geometry so no extra raw-size
exemption is necessary.

| Role | Family key | Size / line | Tracking | Use / extra |
|---|---|---|---|---|
| `displayXL` | display | 32 / 36 | −0.8 | Original Home greeting; Paper displaySmall/headlineLarge |
| `displayNumeral` | display | 48 / 48 | — | Original Home gauge numeral |
| `displayM` | display | 20 / 26 | −0.4 | Original Home display; Paper titleLarge |
| `textBody` | textMedium | 15 / 20 | — | Body; Paper bodyMedium |
| `textBodyStrong` | textBold | 15 / 20 | — | Strong body, unselected segment, nested row |
| `textCaption` | textMedium | 13 / 18 | — | Supporting copy; Paper bodySmall |
| `textLabel` | textHeavy | 11 / 14 | 1.1 | Uppercase field/stat labels |
| `textButton` | textHeavy | 15 / 20 | — | Medium buttons, default tertiary, selected segments |
| `textInitialsSm` | textHeavy | 11 / 14 | 0.33 | Children PR 2: 28dp roster avatars |
| `textInitialsMd` | textHeavy | 14 / 18 | 0.42 | Children PR 2: 40dp child avatars |
| `textInitialsLg` | textHeavy | 22 / 28 | 0.66 | Children PR 2: 64dp avatars for later reuse |
| `display3XL` | display | 44 / 46 | −1.54 | Large headline; Paper displayLarge |
| `display2XL` | display | 38 / 42 | −1.14 | Large display; Paper displayMedium |
| `displayNumeralXL` | display | 64 / 64 | −1.28 | Session complete numeral |
| `displayTitle` | display | 28 / 32 | −0.56 | Screen titles, stat numerals |
| `displaySheetTitle` | display | 24 / 28 | −0.48 | Sheet and empty-state titles |
| `displayHeading` | display | 18 / 24 | −0.27 | Smaller display heading |
| `displayCount` | display | 20 / 24 | −0.4 | **Addition:** Home elapsed time and week counts |
| `textRowTitle` | textBold | 16 / 22 | — | Action-row titles and read-only values |
| `textBodyL` | textMedium | 16 / 22 | — | Paper bodyLarge |
| `textBodyLStrong` | textBold | 17 / 22 | — | **Addition:** Home gauge “/3” suffix |
| `textBodySemi` | textSemi | 15 / 20 | — | Toast message |
| `textParagraph` | textMedium | 15 / 22 | — | Sheet subtitles and longer body copy |
| `textInput` | textMedium | 17 / 22 | — | Field values and picker options |
| `textOptionSelected` | textHeavy | 17 / 22 | — | Selected picker option |
| `textButtonL` | textHeavy | 17 / 20 | — | Large button labels |
| `textButtonM` | textHeavy | 16 / 20 | — | Ink tertiary and warning buttons |
| `textLink` | textHeavy | 14 / 20 | — | Small tertiary, Dismiss, toggle-chip label |
| `textSearch` | textMedium | 16 / 20 | — | **Addition:** SearchField's board-sized value |
| `textMasked` | textMedium | 20 / 24 | 2.8 | **Addition:** Masked password value |
| `textSmall` | textMedium | 14 / 20 | — | Small body copy |
| `textSmallStrong` | textBold | 14 / 20 | — | Strong small copy; Paper titleSmall |
| `textPill` | textHeavy | 14 / 18 | — | Sync pill; tabular numerals |
| `textNote` | textSemi | 13 / 18 | — | Inline notes |
| `textChip` | textBold | 13 / 18 | — | Compact chip copy |
| `textBadge` | textHeavy | 12 / 16 | — | Status badges; tabular numerals |
| `textMetaStrong` | textBold | 12 / 16 | — | **Addition:** Paper labelMedium |
| `textSectionLabel` | textHeavy | 12 / 16 | 0.96 | Uppercase section labels |
| `textNavActive` | textHeavy | 11 / 13 | — | Active destination label |
| `textNavInactive` | textSemi | 11 / 13 | — | Inactive destination label |
| `textNavRecord` | textBold | 11 / 13 | — | **Addition:** Record label, board weight 700 |
| `textMicroStrong` | textBold | 11 / 14 | — | **Addition:** Paper labelSmall |
| `textLetter` | textBold | 20 / 24 | — | Letter glyphs |
| `textDay` | textSemi | 16 / 20 | — | Calendar day numerals |
| `textData` | textBold | 15 / 20 | — | Times/counts in rows; tabular numerals |

`displayStat` is `displayTitle`; `textToast` is `textBodySemi`. Neither old name is exported.

`logoType.wordmark` (display, 26/24, tracking 0.26) and `logoType.wordmarkSub` (displayBold,
12/15, tracking 1.56) are exported separately for `auth/BrandLockup`. They and the new
`fontFamilies.displayBold` face are lockup styling, not reading roles; do not use their sizes
for UI copy. The white mark plus typeset MASI/NYUSANE is one accessible “Masinyusane” element.

## Themes

`App.js` supplies `paperTheme` to `PaperProvider`; `AppNavigator` supplies `navigationTheme` to
`NavigationContainer`. All Paper MD3 colour roles are explicitly mapped. Ordinary Paper `Text`,
`IconButton`, `Portal` and other unratcheted utilities can still use the theme; the controls listed
under the guard must use primitives in new code.

| Paper colour role(s) | Token(s), in matching order |
|---|---|
| primary / onPrimary | `colors.primary` / `colors.onDark` |
| primaryContainer / onPrimaryContainer | `colors.red50` / `colors.red700` |
| secondary / onSecondary | `colors.text` / `colors.onDark` |
| secondaryContainer / onSecondaryContainer | `colors.text` / `colors.onDark` |
| tertiary / onTertiary | `colors.warningText` / `colors.onDark` |
| tertiaryContainer / onTertiaryContainer | `colors.warningBg` / `colors.warningText` |
| error / onError / errorContainer / onErrorContainer | `colors.error` / `colors.onDark` / `colors.errorBg` / `colors.error` |
| background / onBackground | `colors.background` / `colors.text` |
| surface / onSurface | `colors.surface` / `colors.text` |
| surfaceVariant / onSurfaceVariant | `colors.background` / `colors.textSecondary` |
| surfaceDisabled / onSurfaceDisabled | `colors.border` / `colors.disabled` |
| outline / outlineVariant | `tints.control` / `colors.border` |
| inverseSurface / inverseOnSurface / inversePrimary | `colors.text` / `colors.onDark` / `colors.onDark` |
| shadow / scrim / backdrop | `colors.shadowWarm` / `colors.heroDark` / `tints.scrim` |
| elevation.level0 / level1…level5 | `transparent` / `colors.surface` at every raised level |
| success (custom) | `colors.success` |

Paper `roundness` is 6. Its fonts use the following complete mapping:

| Paper variant(s) | `typeRoles` entry |
|---|---|
| displayLarge / displayMedium | `display3XL` / `display2XL` |
| displaySmall, headlineLarge | `displayXL` |
| headlineMedium / headlineSmall | `displayTitle` / `displaySheetTitle` |
| titleLarge / titleMedium / titleSmall | `displayM` / `textRowTitle` / `textSmallStrong` |
| labelLarge / labelMedium / labelSmall | `textButton` / `textMetaStrong` / `textMicroStrong` |
| bodyLarge / bodyMedium / bodySmall | `textBodyL` / `textBody` / `textCaption` |
| default | `fontFamilies.textMedium` (no size role) |

Every variant, including `default`, explicitly sets `fontWeight: undefined` and
`letterSpacing: role.letterSpacing ?? 0`; otherwise `configureFonts` preserves MD3's weights and
tracking while merging. The theme test requires token values everywhere and a change wherever the
MD3 default is not itself a token. White on-colours already equal `colors.onDark`, so “every value
must differ from MD3” would be the wrong test.

Navigation uses `dark: false`; `primary` and `notification` → `colors.primary`, `background` and
`card` → `colors.background`, `text` → `colors.text`, `border` → `colors.border`. Its regular,
medium, bold and heavy fonts use `textMedium`, `textSemi`, `textBold` and `textHeavy`, each with
`fontWeight: 'normal'` because React Navigation requires that key. Stack `contentStyle` and tab
`sceneStyle` use the canvas colour to avoid a differently coloured transition background.

## Primitive reference

The following components are default exports from `src/components/common/` unless a different
path is named. Props listed here are the supported implementation, not a spread of arbitrary
native props.

### Actions and fields

**`BrandButton`** — `label, onPress, variant='primary', size='lg', surface='canvas',
tone='accent', icon, loading=false, loadingLabel, disabled=false, accessibilityLabel, style, testID`.
One `Pressable` for screen actions. `lg` has min height 56 and `textButtonL`; `md` has min height
44 and `textButton`. `sm` is useful for tertiary links (`textLink`); tertiary is always min 44.
Labels wrap. Buttons stretch by default; accent/onRed tertiary links align to their content.

| Variant | Use and appearance |
|---|---|
| `primary` | Main action: primary/white, primaryDark pressed, primaryButton shadow at rest. On surface='red': white/red, red50/red700 pressed, onRedButton shadow. |
| `secondary` | Quiet action: white/ink, control outline. On red: transparent/white, onRedOutline edge. |
| `tertiary` | Text action: tone='accent' red, tone='ink' ink/full-width/textButtonM, tone='onRed' white and underlined. Set tone explicitly; surface alone does not select onRed text. |
| `destructive` | Filled error/white confirmation action. |
| `destructiveQuiet` | White/error outlined destructive trigger. |
| `warning` | D8 caution action: warningBg/warningText, warningControl edge, warning-outline glyph, textButtonM. |
| `success` | Sequential assessment “Correct”: successText/white (plan addition for contrast). |

`icon` is an Ionicons name (20 at lg, 18 otherwise). Loading substitutes one 18dp native
`ActivityIndicator` in the variant's label colour (`colors.error` for `destructiveQuiet`) and
`loadingLabel ?? label`, keeps the active fill, and blocks taps. Disabled and busy accessibility
state are exposed; the accessible label follows the loading label unless overridden. Press scale
is 0.98 unless `reduceMotion`; there is no scale animation timeline. Primary pressed/disabled
styles drop the shadow. `style` applies to the button container. `BrandButton` forwards its ref
to the native `Pressable`, allowing Session complete to focus Done for screen readers; `testID`
also reaches that Pressable.

**`IconCircleButton`** — `icon, onPress, accessibilityLabel, surface='canvas', disabled=false,
testID`. Fixed 44dp circular target with a 22dp Ionicons glyph; white/ink/control-edge on canvas,
red700/white on red. Disabled uses a rule edge and disabled glyph. Supply the accessible label
(the component logs an error when it is missing).

**`TextField`** — `label, value, onChangeText, icon, placeholder, error, errorPlacement='field', disabled=false,
secureTextEntry, onToggleSecure, multiline=false, surface='canvas', inputRef, accessibilityLabel,
onFocus, onBlur, style, ...textInputProps`. A native input inside a min-60dp box, radius 14,
constant 2dp edge, inside caps label and `textInput` value. On canvas, focus uses ink plus an
absolute 4dp `tints.pressed` halo; an error uses the error edge without a halo. Error accessible name
is `'{label}, error: {error}'`. Tapping the box focuses the input. `inputRef` accepts a callback
or ref object; `style` styles the input, not the box. The secure toggle is a 44dp Show/Hide
password button; a nonempty masked value uses `textMasked`. Multiline raises the box minimum to
112 and the input minimum to 66. Disabled makes the input noneditable; canvas uses border fill,
transparent edge and disabled foreground. Red keeps the white box and dims its contents:

| `surface='red'` state | Edge and halo | Contents |
|---|---|---|
| Rest | Transparent 2dp edge; no halo | Muted label; ink value; icon muted when empty, ink when filled |
| Focus | Ink edge; `tints.onRedHalo` at −4dp | Ink icon and value |
| Error | Error edge; `colors.errorBg` at −4dp | Error label/icon; ink value |
| Disabled/loading | Retains the current edge/halo and white fill | Value opacity 0.7; label/icon/toggle opacity 0.5; input and toggle disabled |

`errorPlacement='field'` renders the field's `InlineNote` 8dp below. `errorPlacement='form'`
keeps the ring and accessible error but leaves the note to the form, for one message covering
several fields. A message about one field sits 8dp below that field; a form or server message
sits above the primary button. Form errors never use a toast.
It does not apply `NO_TEXT_SUGGESTIONS` automatically: domain-entry callers must pass that contract.

**`SelectField`** — `label, value, placeholder, icon, error, onPress, accessibilityLabel,
disabled=false`. A button styled like the field, with `chevron-down`, `textInput` value and
`InlineNote` for a nonempty string error. Boolean `error={true}` applies the error border and
label colour without a second note; Record renders its validation note under the step header.
Default spoken label joins label and value/placeholder. Use it to open a
picker, not a read-only `TextInput`. Pressed fill is `border`; disabled removes the visible edge.

**`SearchField`** — `value, onChangeText, placeholder, accessibilityLabel, autoFocus`. Min height
48; `textSearch`, search-outline glyph, fieldEdge at rest, ink/focus halo when focused. It applies
`NO_TEXT_SUGGESTIONS`. Nonempty text shows a 44dp “Clear search” target that empties and refocuses
the input; default accessible name is the placeholder.

**`InlineNote`** — `tone='error', size='sm', live='polite', children`. Error uses errorBg/error;
warning uses warningBg/warningText and a warning glyph. Both sizes wrap: sm has radius 9,
padding 8/12 and glyph 16; md has radius 14, padding 12/14 and glyph 18. Error is an alert and uses
`live` (`'assertive'` is supported); iOS announces on appearance or changed text, not an identical
rerender. Warning has no live announcement.

**`ToggleChip`** — `label, selected, onPress, testID`. Checkbox with checked state; selected ink
fill/white label/checkmark, otherwise white/ink/control outline. Min height 36 plus 4dp hit slop
and `textLink`. `src/components/forms/ChipSelector.js` composes these for domain choices.

**`SegmentedControl`** — `options, value, onChange, role='radio', accessibilityLabel`.
Options are `{ value, label }`; presses call `onChange(option.value)`. A white min-44dp pill
track with an ink selected thumb inset 4.5; selected `textButton`, unselected `textBodyStrong`.
Radio mode exposes radiogroup/radio with checked state; `role='tab'` uses tablist/tab with selected
state for changing displayed content.

### Signed-out Login and Reset

`useNetworkOffline()` (`src/hooks/useNetworkOffline.js`) is a read-only NetInfo subscription for
signed-out Login: only an explicit `false` connectivity or reachability value means offline;
unknown is treated as online to avoid flashing the caption at launch. It unsubscribes on unmount.
Signed-in screens keep `useOffline()`, whose `isConnected: null` means offline for sync policy.
Login cannot consume that provider because it exists only in the signed-in tree.

`auth/loginHeroGeometry.js` owns the artwork's scale, offsets and hide rule. Scale clamps to
0.74–1 between heights 640–844; `offsetX = windowWidth - 390 * scale`;
`offsetY = max(-43.8 * (1 - scale), anchorPanelTop - 446 * scale)`.
The anchor is the note-free rest panel top, so an error or offline caption covers more art without
moving its crop. Hide the decorative art when less than 120dp remains above the current panel
from the learner's top (`offsetY + 110 * scale`). `computeLoginLayout` owns rest, keyboard and
compact-keyboard mode; keyboard-mode bottom padding is 24dp.

Login renders no “Forgot password?” link. `ForgotPassword` remains registered in `AuthNavigator`
with the navigator's “Reset password” header, canvas TextField and inline errors. Its sent state
sets `title: ''`, shows “Check your email” as the sole heading, and uses `popTo('Login')` so Back
cannot reopen Reset. Recovery and Reset's native D10 gate are tracked in
[#78](https://github.com/JimMcKeown17/masi-app/issues/78).

### Surfaces, rows and supporting text

| Primitive and props | When and how to use it |
|---|---|
| `SurfaceCard({ children, style, testID })` | White, rule edge, radius 18, padding 16, no shadow. Replace Paper Card; put actions in a right-aligned row of md BrandButtons with gap 8. |
| `ListGroup({ children, style })` | White grouped surface, rule edge, radius 18, clipped corners, no shadow. Clones valid child elements with showDivider true except the last; custom row children must honour that prop. |
| `ListRow({ title, subtitle, lead, trailing, onPress, variant='action', busy=false, expanded, disabled=false, showDivider=false, accessibilityLabel, accessibilityRole, style, accessibilityState, titleNumberOfLines, titleAccessory })` | Action rows min 64, padding 10/16, 40dp lead and wrapping title/subtitle. Default spoken label combines both. Busy disables press and replaces trailing content with a 20dp textSecondary spinner. trailing accepts chevron, external, share, send, disclosure or an element. Disclosure uses expanded for arrow and accessibility state. titleAccessory follows the title in a centred, wrapping row with an 8dp gap. Optional style composes onto the row; accessibilityState supplies caller state while busy/disabled/expanded stay owned by ListRow; titleNumberOfLines defaults to wrapping and lets roster rows request one line. |
| `ListRow variant='readOnly'` | title is the caps label; subtitle is the value. An accessible View with an optional supplied lead tile, no action or trailing glyph; label and value wrap. |
| `ListRow variant='nested'` | Min 56, left padding 68, 24dp lead and strong-body title. Dividers start at 104 for nested, otherwise 68 with a lead or 16 without. |
| `IconTile({ icon, tone='canvas', iconSize })` | Decorative 40dp tile, radius 14. canvas: background/ink/20dp; red: red50/red700/22dp; warning: warningBg/warningText/22dp. iconSize preserves Home's 22dp canvas glyph. |
| `StatusBadge({ label, tone='neutral' })` | Min 22, pill, textBadge, horizontal padding 8. Tones: neutral border/ink; warning warningBg/warningText; success successBg/successText; successStrong successText/white; error errorBg/error. |
| `EmptyState({ title, body, footnote, action })` | Left-aligned, type-led state without an illustration. displaySheetTitle/header, paragraph body; footnote accepts text (caption styling) or a React element rendered directly. action forwards BrandButton props, including icon, variant and style; size is always md, primary by default, with action.style composed after the default top margin. NoActiveProgrammeNotice uses this. |
| `SectionHeader({ title, hint, action, style })` | Caps textSectionLabel/header and optional caption hint. action is BrandButton props, forced tertiary with negative vertical margin to retain its 44dp target without enlarging the label row. Use hint, not the retired subtitle prop. |
| `dashboard/StatBar({ items })` | Bare stat columns. Items: { label, value, color?, onPress?, accessibilityLabel? }. An explicit accessibilityLabel groups a column into one accessible element; onPress gives it the button role, with the existing “View {label}: {value}” fallback when no label is supplied. displayTitle/tabular numeral, caps textLabel; actions use primary plus an 18dp chevron. color overrides the numeral for score meaning. Current compact labels retain one line, fit-to-size (floor 0.85), and 1.2 scaling caps on label/value. |

### Settings lists (Bold Red Profile)

Use `SectionHeader` above a `ListGroup`. Read-only rows pass the label as `title`, the value as
`subtitle`, and an optional `IconTile` as `lead`; each is one accessible “label, value” element.
Profile names, emails, schools and row titles wrap without `titleNumberOfLines`.

A disclosure uses `trailing="disclosure"` and `expanded` for both its glyph and spoken state.
Profile's Support tools starts collapsed. Its open panel uses `colors.background` and a 1dp
`colors.border` top edge, with `variant="nested"` rows: min height 56, left padding 68, a bare
20dp lead glyph in a 24dp column, and dividers inset 104. The nested panel owns those dividers.
The Share database row passes `titleAccessory={<StatusBadge label="Sensitive" tone="warning" />}`;
the 8dp wrapping title line lets the badge drop below the title when space runs out.

| Destination | `trailing` | Glyph |
|---|---|---|
| Opens inside the app | `chevron` | `chevron-forward` |
| Expands a nested panel | `disclosure` | `chevron-down` closed; `chevron-up` open |
| OS share action, including database export confirmation | `share` | `share-outline` |
| Crash-reporting test | `send` | `send-outline` |
| Browser | `external` | `open-outline`; use link role and “opens in browser” label |

Trailing glyphs use `colors.textSecondary`, except the expanded disclosure's ink arrow.
`busy` replaces the glyph with a spinner, exposes `busy: true, disabled: true` and blocks presses.
Other support actions remain independent; collapsing the panel does not suppress their outcome
toasts. Database export first opens `ExportDatabaseSheet`, a `ConfirmSheet` wrapper with the
Sensitive title accessory and `confirmVariant="destructive"`.

### Children components (Bold Red PR 2)

| Piece and source | Contract |
|---|---|
| [`Avatar`](../src/components/common/Avatar.js) | `label='', size=40, shape='circle', icon, ring=false, testID='avatar', style`; supports 28/40/64dp circles with the matching initials role, or `shape='tile'` (40dp class monogram, radius 14, textButton). red50 fill/red700 text; decorative and hidden from accessibility. Initials cap at 1.2; tiles fit one line. ring adds a 1dp avatarEdge border and a 2dp surface surround; style applies to the outer ring when present, otherwise the disc. |
| [`getInitials(firstName, lastName)`](../src/utils/initials.js) | Trims each name and uppercases its first character; missing/null names contribute nothing and two blank names return an empty string. |
| [`AvatarStack({ initials })`](../src/components/children/AvatarStack.js) | First three initials in supplied order, using decorative ringed 28dp Avatars with 4dp disc overlap; an empty array renders nothing. |
| [`GroupChip` / `GroupDot`](../src/components/children/GroupChip.js) | Default GroupChip takes `groupName, color, onPress, accessibilityLabel`: assigned means a white dot/name/chevron pill; null/undefined groupName means the amber “Group” assign pill. Min-44dp target, min-28dp visual pill, −8dp vertical margins. Named export GroupDot takes `color, size=8` and draws a decorative dot; picker/Edit child retain their 12/10dp dots. |
| [`SyncBanner({ onSyncNow })`](../src/components/common/SyncBanner.js) | Reads useOffline through describeSyncBanner; count and visibility use waitingCount. Hidden at zero or when needsAttentionCount is positive; waiting/offline/syncing copy, with “Sync now” only while waiting online. No alert role or live region; the header pill carries needs-attention. |
| [`InlineLoading({ label })`](../src/components/common/InlineLoading.js) / [`SpinnerArc`](../src/components/common/SpinnerArc.js) | Loading line: polite live region, 22dp primary arc and wrapping textBodySemi label. SpinnerArc takes `size=22, color=colors.primary, testID='spinner-arc'`; rotates once per second in full/calm, remains still under Reduce Motion or motionLevel='still', and stops on cleanup. |
| [`listGroupItemFrame(index, count)` / `ListGroupDivider({ inset })`](../src/components/common/ListGroup.js) | Named helpers for a virtualised FlatList: per-row white/rule frame, only outer rows have top/bottom edges and radius 18; place the top divider before each row after the first. Children uses inset 70 for classes and 68 for child rows. Use these when the list must remain virtualised rather than wrapping all rows in a ScrollView. |

**Group colour.** [`getGroupDotColor(index)`](../src/utils/groupHelpers.js) is the only group
colour lookup. It cycles the six [`GROUP_DOT_COLORS`](../src/constants/groupColors.js) in order;
negative or non-finite indices fall back to the first. The hue appears only on the dot and the
group name is always printed. Assigned group text, selected picker borders/checkmarks and Edit
child field text are ink (`colors.text`); orange is suitable for a graphic, not small text on
white. `getGroupColor` is removed; `GROUP_COLORS[].bg` remains in the palette but has no consumer.

Children list and Class detail use one FlatList each under the navigator header, with
`FAB_OVERHANG + 16` bottom clearance. The list header is an element of the module-scope
`ChildrenListHeader`, preserving search focus. Loading replaces content only when
`(loading || classesLoading) && classes.length === 0`; cached classes, stats, search and banner
remain during a pull. Class detail keeps `useHeaderHairline(navigation)` above its early returns.
Child-row results, group, letter-tracker and edit actions are separate controls: retain the 8dp
gap above the meta row so GroupChip's negative margins cannot overlap the results target.

### Sheets

**`BottomSheet`** — `visible, onDismiss, title, subtitle, dismissLabel, headerExtras, footer, footerStyle,
scrollable=true, keyboardAvoiding=true, maxHeight='80%', bodyContentStyle, scrollViewProps={},
panelRole, children`. Uses Paper `Portal`, flexbox bottom anchoring, a scrim and explicit Android-back
dismissal while visible. Supply a meaningful backdrop `dismissLabel`. Title is
`displaySheetTitle`, subtitle `textParagraph`, radius 22, grabber 36×4/control, `shadows.sheet`,
sides 24 and keyboard-down bottom padding `max(insets.bottom, 24)`. The footer has a divider;
`footerStyle` merges last onto its View, allowing a caller to remove the divider or change padding.
Optional content styles compose with the scroll container. Set `scrollable=false` for a child `FlatList`.
Optional `panelRole` sets the panel's role and `accessibilityViewIsModal`; `ConfirmSheet` uses
`alertdialog`.

The sheet measures its panel to determine slide distance (window height until measured), retains
the exit animation, and ignores touches/hides accessibility content as soon as `visible` becomes
false. Cancelling an old animation cannot unmount a newly reopened sheet. See motion below.

With `keyboardAvoiding=true`, `KeyboardAvoidingView` uses `behavior="padding"` on **both**
platforms. Its wrapper fills the overlay (`flex: 1`, `justifyContent: 'flex-end'`, width 100%)
with top padding `insets.top + spacing.sm`. The panel keeps flexbox anchoring; never position it
with an absolute bottom. When `useKeyboardHeight() > 0`, panel bottom padding is `spacing.xs`
(4dp), because the safe-area inset lies behind the keyboard. Keyboard-down padding stays
`max(insets.bottom, spacing.lg)`; sheets opting out of avoidance keep that padding. Both wrappers (keyboard-avoiding or
not) fill the overlay below `insets.top + spacing.sm` with `flex: 1` and `justifyContent:
'flex-end'`: a percentage `maxHeight` needs a parent of definite height, or Yoga grows the
wrapper to panel ÷ fraction and the sheet floats 25% of its height above the bottom (polish,
A03s). The default `maxHeight` remains `'80%'`; the password sheet alone passes
`'100%'` to use the remaining space above the keyboard.

**C11 landed in Profile Task 2.** Jim reproduced Create class → School search results under the
keyboard on the Galaxy A03s, build 15. Local tests pin the shared fix; the A03s/iPhone “no double
lift” row remains open in Profile Task 10. This is not a post-fix device pass.

**`SelectSheet`** — `visible, onDismiss, title, subtitle, dismissLabel, options, selectedKey,
onSelect, confirmLabel, cancelLabel, emptyMessage, maxHeight, searchable=false,
keyboardAvoiding=true`. Options are `{ key, label, description?, accessibilityLabel? }`.
Without `confirmLabel`, selection calls `onSelect(key)` then dismisses; with it, rows change a
draft selection and the confirm button commits it. `cancelLabel` adds an ink tertiary dismiss
action. Optional search filters labels case-insensitively and resets when visibility changes.
Flat min-56dp rows have border dividers; selected text uses `textOptionSelected` plus an ink
checkmark. The class picker already used this component before Task 25; that task retained it.

**`sessions/ClockInBeforeSessionSheet`** — `visible, onDismiss, onClockInNow, onContinueAnyway`.
The D8 launch-guard sheet: primary “Clock in now”, md warning note, warning “Record without
clocking in”, then ink tertiary “Cancel”. It keeps its existing warning copy and handlers and
opts out of scrolling/keyboard avoidance. Other domain sheets compose `BottomSheet` rather than
introducing another overlay host.

### Password sheets (Bold Red Profile)

[`ChangePasswordSheet`](../src/components/profile/ChangePasswordSheet.js) takes
`visible, onClose, changePassword, handle`. Its `BottomSheet` header (title and Show/Hide passwords)
and footer (Change password and Cancel) stay outside the scrolling body. `footerStyle` removes
the rule and sets 16dp top padding; the action gap is 8dp. The body contains three `TextField`s,
the hint and any form error, with `keyboardShouldPersistTaps="handled"`. Current focuses on open;
Next moves Current → New → Confirm, and Done uses the same submit path as the button. Password
manager assistance remains enabled. Field errors use `TextField.error`; form errors use `InlineNote`.

[`computeScrollTarget({ blockY, blockHeight, scrollY, viewportHeight })`](../src/utils/scrollIntoView.js)
returns `null` when a field-plus-error block is fully visible, its top when above the viewport or
taller than it, and its bottom minus viewport height when below it. The sheet caches block,
viewport and scroll measurements: focus scrolls immediately, missing measurements defer until
layout, error growth waits for the changed block's layout, and a keyboard-induced viewport
resize retries the pending or focused block. This preserves the fixed submit area on small phones;
native visibility and Next-key behavior at 360×640/font scale 1.3 still need Task 10.

Validation remains required → length → match → verification → update. Loading disables fields
and duplicate submits; Show/Hide and dismissal remain usable. Dismissal clears values, errors,
password visibility and loading state so reopening starts empty. A result from an abandoned
attempt, including after leaving Profile, produces one 4000ms success/error toast without changing
a reopened form. A stale handle produces no feedback. Active-form failures stay inline; success
closes and resets the sheet and publishes the success toast through the actor-scoped root host.

## Forms (Bold Red, 2026-10)

Record keeps one virtualised `ChildSelector` list and a sibling footer under the navigator's
“New session” header. The form derives completion from its current values; it does not store a
second set of completion flags. Submit and the live summary both call
[`validateLiteracySession`](../src/utils/literacySessionValidation.js) with
`{ selectedChildren, selectedLetters, sessionReadingLevel }`. Its only required fields are
children, letters and the session reading level. Optional comments and child progress do not
affect readiness. Submit remains enabled until a save is in flight.

| Component and source | Supported props and contract |
|---|---|
| [`StepHeader`](../src/components/forms/StepHeader.js) | `step, label, status='todo', right, onLayout`, with a forwarded ref for accessibility focus. A 20dp disc shows a numeral for to-do, an ink check for done, or an error ring/numeral. The wrapping textSectionLabel and top-aligned disc expose “Step {n}: {label}”, adding “complete” or “needs attention”. right accepts text or a node. Date is always done; children, letters and level derive done from their values; optional steps never become done. Errors appear only after Submit validation. |
| [`CountChip`](../src/components/forms/CountChip.js) | `label, active`. Noninteractive, min 32dp pill with textChip/tabular numerals and no check icon. Active is ink/white; zero selection is surface/muted with a rule edge. Record passes “{n} selected”. |
| [`SelectableRow`](../src/components/forms/SelectableRow.js) | `variant, title, subtitle, lead, selected, onPress, position, height, accessibilityLabel`. Supply variant as checkbox or radio; there is no default. Memoised ListRow composition; position is first/middle/last/only. Grouped-card edges and the inset divider stay inside the supplied fixed height. Rows carry checkbox/radio plus checked state; the virtualised roster has no radiogroup wrapper. Titles use one line with the full name in the accessible label. |
| [`RequirementSummary`](../src/components/forms/RequirementSummary.js) | `items=[{ key, doneText, missingText, done, onPress, step }]`. A wrapping row, not a live region. Done items have a success disc and textSmallStrong; missing items use textLink/primary, an arrow and a min-44dp target. Labels read “{text}, done” or “{Missing text} missing. Go to step {n}”. The caller derives every done value from the same validation result as Submit. |
| [`StickyActionFooter`](../src/components/forms/StickyActionFooter.js) | `children, surface='always', overflowing=false, hideOnKeyboard=false, style`. White with a 1dp border top, 11dp top/24dp side padding and bottom padding max(insets.bottom, 16) on iOS, max(insets.bottom + 11, 16) on Android (an opaque 3-button bar fills its whole inset; on the A03s the action otherwise touched the bar). With surface='onOverflow', it is transparent without a top edge until overflowing is true. style composes last; Session complete sets top padding to 12. Render as a sibling after the flexing list, never an overlay. Record passes hideOnKeyboard: the footer unmounts while the keyboard is visible and returns on dismiss. It registers its measured visible height with useToastObstruction; hidden footers do not obstruct the toast. |
| [`ConfirmSheet`](../src/components/common/ConfirmSheet.js) | `visible, title, titleAccessory, body, confirmLabel, confirmVariant='destructiveQuiet', cancelLabel, onConfirm, onCancel, dismissLabel`. Composes BottomSheet and BrandButton instead of a native dialog. The panel has alertdialog and accessibilityViewIsModal; backdrop and Android back call onCancel. titleAccessory uses the sheet's headerExtras slot; Profile can reuse it with confirmVariant='destructive'. |
| [`ChildProgressBlock`](../src/components/sessions/ChildProgressBlock.js) | `child, className, readingLevel, trackerChangeCount, onOpenLevel, onOpenTracker`. Avatar/name/class heading plus min-52dp ListRow actions for Reading level and Letter tracker. Unset level says “Not set”; positive changes use StatusBadge tone='successStrong' (“+{n} new”). Callbacks receive child.id for level and the child object for tracker. |
| [`MonthCalendar`](../src/components/common/MonthCalendar.js) | `selectedKey, todayKey, onSelect`. Calendar keys only; opens on the selected month, Sunday first. Seven equal columns have no horizontal gaps, with centred 44dp day targets and 4dp row gaps. Future days and navigation beyond today's month are disabled. The caller closes the enclosing BottomSheet on selection or Cancel. |
| [`LetterToggleGrid`](../src/components/sessions/LetterToggleGrid.js) | `letters, tileFor, onPressLetter`. Six columns, 8dp gaps; tileFor(letter) supplies each tile's tone, disabled flag and accessibility props. Named export letterTileSize(w) is min(56, floor((w − 40) / 6)). Measured content width replaces the initial window-width-minus-48 fallback. The grid itself is capped at 376dp (six 56dp tiles + five 8dp gaps), preventing a seventh column on wider screens. |
| [`LetterToggleTile`](../src/components/sessions/LetterToggleTile.js) | `letter, tone, size, onPress, disabled=false, accessibilityLabel, accessibilityState`. Tones: rest, selected, taught, taughtNew, locked. Lowercase textLetter capped at 1.2 scaling, radius 14; selected focus letters are ink/white. Focus-grid labels keep capitals (“M, selected”); tracker/panel labels keep lowercase (“m, not mastered”). Press motion follows the contract below. |

[`rosterRowHeight(fontScale)`](../src/utils/sessionFormLayout.js) is
`max(64, ceil(20 + 2 + (22 + 18) * fontScale))`: 64dp at 1.0 and 74dp at 1.3. Every roster row
and `getItemLayout` use the same height. Summary jumps use `stepScrollOffset` from that module:
measured list-header/footer positions plus the **visible** row count times row height, or the
measured empty-row height. The target sits 12dp below the header hairline, then receives
screen-reader focus. Jumping changes no form value and creates no validation error.

**Calendar dates are not instants.** [`formatSessionDate(dateKey, style)`](../src/utils/sessionDateFormat.js)
accepts a `YYYY-MM-DD` key, never a `Date`. Styles are field (“Mon 12 Oct 2026”), fieldToday
(“Today · Thu 15 Oct”), calendarLabel (“Thu 15 October 2026”), pill (“Tue 13 Oct”) and spoken
(“Tuesday 13 October”). Fixed English names and UTC-only calendar arithmetic keep device timezone
out of formatting. `MonthCalendar` also takes and returns keys. Record defaults directly to
`toLocalDateString(new Date())` in Africa/Johannesburg (SAST), retains that key in state and saves
it unchanged: no device-local-midnight Date round trip. This closes overview S6's Auckland case,
where converting a local-midnight calendar date to SAST could show or save the previous day.

**One mastery palette.** [`letterStateColors`](../src/constants/letterStateColors.js) supplies
LetterToggleTile on the tracker sheet and LetterMasteryPanel (Letter tracker and Child results).
Stored taught/EA-confirmed letters use successText fill/edge and onDark text; new confirmations
add a white corner dot. Assessment mastery uses successBg/successBorder, successText letter and
lock glyph, and disabled interaction. Unmastered is surface/control/ink. The sheet has four legend
items, including “New this session”; the panel has three because it has no pending session state.
This preserves the existing stored 'taught' terminology and tap rules; it changes presentation.

**Save failure and leaving.** The footer's InlineNote uses live='assertive' and the existing
“Failed to save session. Please try again.” copy. A new Submit press clears it before validation;
another failed save remounts/announces it, and retry retains the same session id. Editing alone
does not clear it. Dirty forms use `usePreventRemove` and ConfirmSheet with “Discard” / “Keep
editing”; cancel, scrim and Android back keep the draft. A successful save releases the guard in
React state and waits for that render's effect before replacing the route. Tests use the real
StackRouter; native swipe-back still needs the Record device gate. iOS enables
automaticallyAdjustKeyboardInsets on the list. Android KeyboardAvoidingView remains conditional
on a device reproduction of Comments being covered.

## Navigation chrome

**`ScreenHeader({ navigation, route, options, back })`** is rendered by navigator `header`
options, not inside screen bodies. It reads string `options.headerTitle`, else `options.title`,
else `route.name`. `headerLeftIcon` is back by default, close for New session, or none;
Back needs a `back` entry and `headerBackVisible !== false`. Close/Back call `goBack()`.
`headerRight` is called with `{ canGoBack, tintColor: colors.text }`.

Geometry: canvas, top inset +9, sides 24, bottom 6, min-44 row, gap 12, title top padding 6.
Title is left-aligned `displayTitle`, header role, wrapping without `numberOfLines`, capped at
1.3 font scaling. An empty resolved title renders no header-role element; a spacer preserves
the trailing action's position, and the Back circle remains. `options.headerScrolled` adds a
1dp rule hairline.

`useHeaderHairline(navigation?)`, a named export from `ScreenHeader.js`, returns an `onScroll`
handler. It uses an explicit navigation argument or `NavigationContext`, and safely does nothing
without either. Attach it to the root ScrollView/FlatList with `scrollEventThrottle={16}`; it
calls `setOptions({ headerScrolled })` only when `contentOffset.y > 0` changes boolean value.

Children list sets **“Children”**; Class detail sets the class name (empty while loading or
not found) and keeps “Manage classes” calling `popToTop()`.
Session complete sets `{ headerShown: false, gestureEnabled: false }`; its hero headline is the
screen title. Done and Android back share one guarded `popTo('MainTabs', { screen: 'Home' })`.
Child onboarding suppresses back and gestures; Home, Login and the three assessment capture/results
surfaces retain hidden headers. Insights row titles use the sentence-case titles of their routes.

Root-stack scroll screens cover the tab bar. Their `contentContainerStyle` uses
[`useScrollBottomPadding(extra = spacing.lg)`](../src/hooks/useScrollBottomPadding.js), which
returns `insets.bottom + extra`. Preserve the existing bottom gap as `extra` and leave top and
horizontal padding unchanged. Time tracking keeps its inner content padding and passes zero;
Profile keeps its 40dp gap. Do not add this inset to tab-owned screens or scroll content above
an inset-aware sibling footer: Record, Session complete, assessment capture and Assessment
results already have one. Reset password uses the helper only on its form; its sent-state footer
and Login's panel already handle the inset. BottomSheet owns its own inset independently.

**`SyncIndicator({ onPress, variant='default' })`** uses `useOffline()` and the shared sync
presenter. The default is the canvas header pill; there is no variant='pill' API. Its outer
target is at least 44×44 and the visual pill at least 32 high/36 wide. Synced shows the success
cloud; waiting/offline show the corresponding muted cloud and “{n} waiting”; syncing shows the
arc; needs-attention shows warning-outline, count and a 14dp chevron on warningBg. Counts cap at
99+, text uses `textPill` with a 1.2 scale cap, and the accessible label includes “Open sync status”.
`variant='hero'` keeps Home's disc and badge; both spinners obey the motion contract.

**`navigation/LockedBottomTabBar({ state, descriptors, navigation })`** keeps Home, Children,
Record, Insights, Assess order and the launch guard. **`navigation/BottomTabIcon({ routeName,
focused, color, size })`** renders the destination glyph in a 56×30 active red50 pill.
Destination labels use textNavActive/textNavInactive and cap at 1.3. Record uses a 60dp red disc
inside a 70dp white ring (5dp surround), textNavRecord in ink, and the existing “Record a session”
label. The bar has a min-56 destination row, nav shadow and bottom padding `max(insets.bottom, 8)`.

Import `FAB_OVERHANG` (24) from `LockedBottomTabBar` for content clearance (`FAB_OVERHANG + 16`).
The white ring extends another 5dp: the bar registers measured height +24+5 as a toast obstruction
only while its navigator is focused. Home's content padding is consequently 4dp shorter than
before PR 1; Home's hero gear remains its existing implementation, not `IconCircleButton`.

The root status bar is dark. **`FocusAwareStatusBar({ style })`** renders Expo's StatusBar only
while the screen is focused; Home, Login and Session complete use style='light'. Reset uses
the root dark style on its canvas.

## One actor-scoped root toast

Use the named exports `ToastProvider`, `ToastActorScope`, `useToast`, `useToastObstruction` from
`src/context/ToastContext`. `useToast()` returns stable `{ show, hide }` publishers:

```js
const toast = useToast();
toast.show({ message: 'Class updated', tone: 'success', duration: 3000 });
// toast.hide() dismisses this publisher's actor's current message.
```

`tone` must be neutral, success or error; invalid/missing tone logs an error and falls back
to neutral. Duration defaults to 3000ms; a new message replaces the old one, with no queue.
Preserve an existing host's timing/copy: Profile uses 4000ms. Choose tone from the outcome
at the call site (failure error, confirmation success, other neutral), not message-text matching.
Profile forwards its existing `type` classification. `useToast()` throws without a provider;
`useToastObstruction(height, active=true)` is safe without one and registers only positive active
heights, cleaning up on change/unmount.

The actual root order is SafeAreaProvider → MotionProvider → ToastProvider → PaperProvider →
auth/app tree. ToastProvider renders the Paper subtree **then** its own `ToastHost` as a later
native sibling. The host is not a Paper Portal: separate portal wrappers are ordered by mount
order, and a child's zIndex cannot put an earlier toast above a later sheet. The sibling host
uses tokens directly and remains outside that portal ordering.

The signed-in tree wraps publishers in `ToastActorScope({ handle, children })` inside the keyed
SignedInEAProvider. `useToast()` reads this scope, tags messages `${userId}:${epoch}`, and checks
`handle.isCurrent()` on both show/hide. A stale publisher silently does nothing; actor changes
clear messages belonging to another key. Outside the scope, publishers have actorKey=null;
the root rejects such a publish while a signed-in actor is registered. This lets a toast survive
navigation within one EA but prevents it appearing on Login or the next EA after sign-out.

`common/Toast.js` default-exports the internal `ToastHost({ toast, maxObstruction=0, onDismiss,
onExited })`; screens use the hook, not this internal host. Its bottom is exactly
`8 + max(insets.bottom, 8, maxObstruction, keyboardHeight)`; obstruction heights compete by
maximum, they do not add. `useKeyboardHeight()` (`src/hooks/useKeyboardHeight.js`) reads iOS
keyboardWillShow/Hide or Android keyboardDidShow/Hide and returns zero while hidden.
StickyActionFooter registers its measured visible obstruction through `useToastObstruction`.

The toast is ink, min height 56, radius 18, horizontal screen inset 24, white textBodySemi and
an always-visible underlined “Dismiss” (accessible name “Dismiss message”, min target height 44).
Success/error have a decorative status disc; neutral has none. Neutral/success are polite and
announced on iOS; the error message Text has alert/assertive semantics. It never takes focus.
Timers, animations and ID checks prevent an old exiting toast from removing its replacement.

Auth copy is centralised in `describeAuthError(error, action)` (`src/utils/authErrorCopy.js`,
action='sign_in' or 'reset'). Suspended sign-in says **“Your access is paused. Please contact
your supervisor.”** Known network, server and rate-limit errors have mapped copy; unknown errors
use the action-specific safe fallback rather than raw server messages. “Invalid login credentials”
is the retained sign-in wording. Login and Reset render this copy inline. Reset maps the original
response error before storing its message, preserving code/status/retryable-fetch classification.

## Motion contract

`MotionProvider({ value, children })` exposes `useMotion()` → `{ tier, reduceMotion, motionLevel }`.
`value` supplies the whole test override and skips detection. Without a provider the safe default
is `{ tier: 'high', reduceMotion: false, motionLevel: 'full' }`. In production the provider reads
`AccessibilityInfo.isReduceMotionEnabled()` and subscribes to `reduceMotionChanged`; a newer event
wins over a late initial read. Detection failure falls back to false. It logs the initial device
signals (totalMemory, deviceYearClass, platform and tier) for device verification.

`classifyTier({ platform, deviceYearClass, totalMemory, reduceMotion=false })` is a pure function;
it exports TIER_HIGH/TIER_LOW/TIER_STATIC and `motionLevelForTier(tier)`. Rules apply in order:

1. Reduce Motion forces static on every platform.
2. Otherwise iOS is high.
3. Other platforms with positive reported memory below 1.5 GiB are static.
4. Positive device year class before 2019, or positive memory below 3 GiB, gives low.
5. If both year and memory are unknown/nonpositive, use low; otherwise use high.

Use reported OS-visible memory, not marketed RAM. Unknown memory alone does not force low if a
known recent year class is available. Tiers map to high/full, low/calm, static/still.

| Consumer | full / calm | still |
|---|---|---|
| BottomSheet | Measured-height slide over base (250ms); scrim over quick (200ms), enter easing; reverse on close | Panel and scrim fade (150ms); no slide |
| Toast | Entry opacity + 16dp translation over quick (200ms); exit opacity fade (150ms) | Entry opacity still uses quick (200ms), exit fade (150ms); no translation |
| Hero/canvas sync indicator | 1000ms linear rotation while syncing | Static glyph/arc, also static whenever reduceMotion is true |
| Children SpinnerArc (InlineLoading and child-row “Syncing…”) | 1000ms linear rotation | Static arc, also static whenever reduceMotion is true |
| BrandButton | Press scale 0.98 if reduceMotion is false | Current code checks reduceMotion, not tier: static hardware without the OS preference still gets the press scale |
| LetterToggleTile | Press scale 0.96 over 90ms in / 140ms out, native driver, when enabled and reduceMotion is false | Like BrandButton, checks reduceMotion rather than tier; Reduce Motion stops/resets the scale and disables scaling |
| Native ActivityIndicator | OS-owned spinner | Still OS-owned; not replaced by this contract |

`duration = { fade: 150, quick: 200, base: 250, sweep: 300 }`;
`easing.enter = Easing.bezier(0.2, 0.8, 0.2, 1)`, `easing.sweep = Easing.out(Easing.cubic)`.
Sheet/toast/sync animations use the native driver and stop on cleanup. The table records the
actual toast still-entry timing (200ms), rather than the part spec's general 150ms fade rule.
Session complete consumes this contract as described below. Its sync-line spinner checks only
`reduceMotion`, so static hardware without the OS preference still gets a rotating sync glyph.

## Session complete

[`SessionCompleteScreen`](../src/screens/sessions/SessionCompleteScreen.js) composes
`SessionCompleteHero`, `CapturedPill`, `CelebrationGauge`, `SessionReceipt` and `SyncStatusLine`
from `src/components/sessions/`. The red field, card and receipt share one ScrollView; the sync
line and `BrandButton` Done sit in a sibling `StickyActionFooter surface='onOverflow'`.
`overflowing` is content height greater than viewport height. Done works from mount, including
during the goal read and animation. The footer registers its height with the root toast, which
sits 8dp above the greatest obstruction.

[`deriveSessionCompleteView`](../src/utils/sessionCompleteView.js) owns copy and gating.
The form supplies `{ childCount, childNames, letters, readingLevel, sessionDate }`, with the date
read directly from `session.session_date`. The screen compares that key with the SAST day at
arrival. Back-dated or missing dates get a static gauge and no confetti. A null/rejected goal
removes both card and halo and keeps “Session\ncaptured.”. Today’s met state uses
“Daily target\nreached.” and hides the duplicate card sub-line; confetti is only for the exact
target today. Names stay in selection order, including duplicates and the “Child” fallback.

### Celebration and still motion

`CELEBRATION_LEVELS = ['full', 'calm']` uses `useMotion().motionLevel`; OS Reduce Motion maps to
still. [`useCelebrationTimeline`](../src/components/sessions/celebrationTimeline.js) owns stable
animated values and stops both entrance and goal composites on unmount. The `TIMELINE` contract
is below (milliseconds). Card and pill start at mount; all other tracks start when the goal
settles. Only tracks allowed by the view model run.

| Track | Delay | Duration | Easing / effect |
|---|---|---|---|
| `cardEnter` | 0 | 300 | `easing.enter`; opacity and 24dp rise |
| `pillEnter` | 0 | 200 | `easing.enter`; opacity and −8dp translation to rest |
| `content` | 0 | 150 | Linear skeleton/content cross-fade |
| `earned` | 250 | 300 | `easing.sweep`; earned arc dash offset |
| `flip` | 650 | 150 | `easing.enter`; numeral/copy cross-fade and 4dp rise, stage colour layers when needed |
| `confettiLayer` | 700 | 0 | Reveal the 22-piece layer |
| `confettiTravel` | 700 | 300 | `easing.sweep`; 36dp along each ray |
| `confettiFade` | 1000 | 300 | Linear opacity fade out |
| `headlineTarget` | 800 | 300 | `easing.enter`; opacity and 8dp rise |
| `headlineOther` | 100 | 300 | `easing.enter`; opacity and 8dp rise |
| `still` | 0 | 150 | Linear, opacity only |

All timing tracks request the native driver except `earned` (SVG `strokeDashoffset` uses JS).
The still version places pill, receipt, footer and skeleton immediately, then reveals the final
content and headline with one 150ms opacity fade: no sweep, flip, confetti or rise. The sync line
continues its 150ms state cross-fades; its glyph stops rotating only under OS Reduce Motion.
Local animation tests use a test-only JS-driver harness to verify timing and cleanup; native
smoothness, especially calm motion on the A03s, remains the Task 14 device gate.

### Shared gauge and halo geometry

[`sessionGaugeGeometry.js`](../src/components/sessions/sessionGaugeGeometry.js) exports
`GAUGE_SIZES`, `buildGaugeGeometry`, `buildEarnedArc` and `buildSkeletonGeometry`.
[`SegmentedSessionGauge`](../src/components/sessions/SegmentedSessionGauge.js) keeps Home’s
geometry; `CelebrationGauge` uses the larger preset.

| Size | Width | Stroke | Radius | Height |
|---|---|---|---|---|
| `home` | 176 | 16 | 79.5 | 97 |
| `celebration` | 232 | 22 | 104.5 | 128 |

Both use `cx = cy = width/2`, `r = width/2 − stroke/2 − 0.5`,
`height = cy + stroke/2 + 1`, 5° gaps and end dots of radius `stroke/2`.
Targets above six use a continuous arc. `buildEarnedArc(goal, size)` returns `{ d, length }`
for the newly earned segment/slice (`length = r × spanRadians`), or null for no target,
count below one or count above target. The skeleton is a continuous border-coloured arc and
two bars; the second bar’s 13dp top gap makes the padded card 218dp, equal to the with-sub-line
card using `textSmall` 14/20. The final goal’s accessible image label is present from frame one.

[`haloGeometry(W)`](../src/utils/haloGeometry.js) returns `cx = W/2`, `r = W/2 + 19`, stroke 32,
`svgHeight = r − 9`, `cy = svgHeight + 26` and
`headlineGap = max(112, round(W/2 − 83))`. The SVG is anchored at the field’s bottom, putting
the centre 26dp below that edge; the card straddles it by 108dp. Halo and confetti are decorative
and hidden from accessibility.

### Receipt and type

`SessionReceipt({ rows })` exports `ReceiptRow({ label, value, accessibilityLabel, isLast })`
from the same file. Children, Letters and Reading level appear only when supplied. Rows have
min height 52, a 16dp gap and a 1dp `tints.rule` divider except after the last row. Labels use
`textSectionLabel`; values use `textRowTitle`. A wrapped text value becomes left-aligned with
its label on the first line. Letters wrap at a 6dp gap, max width 246, and switch from right to
left alignment when tile content exceeds one row. That measurement subtracts the container’s
16dp vertical padding before comparing with the 36dp tile height.

`LetterReceiptTile({ letter })` is read-only: 36×36, radius 9, `red50` fill, 1.5dp `red100`
edge and `red700` text. Tiles draw lowercase in `LETTER_ORDER`; the grouped row’s accessibility
label keeps capitals (“Letters: M, L, N, S”). Children are spoken with “and”, and every row is
one accessible phrase. Values never collapse to “+N”.

| Role | Use |
|---|---|
| `display3XL` | Hero headline |
| `displayNumeralXL` | Gauge numeral |
| `displayHeading` | Card heading |
| `textPill` | Captured pill |
| `textSectionLabel` | Receipt labels |
| `textRowTitle` | Receipt values, letter tiles and suffix face |
| `textSmall` | Card sub-line, 14/20 |
| `textNote` | Sync line, Figtree 600 |
| `textButtonL` | Done |

The gauge suffix takes its 24/28 dimensions from `displaySheetTitle` while keeping the
`textRowTitle` face. Headline, numeral, suffix and letter tiles cap scaling at 1.2; other
content wraps. The screen announces one summary after the goal settles and focuses Done.
Its summary calls `getGoalCopy(goal, true)`; the fallback pill’s spoken form omits the full
stop because the summary adds it. There are no live regions on this screen.

### Truthful sync line

[`SyncStatusLine`](../src/components/sessions/SyncStatusLine.js) calls
`refreshSyncStatus({ autoTrigger: false })` once on mount. Its reserved 18dp slot stays blank
until a non-null object returns while the component is mounted and its EA handle is current.
Only then does it follow live context through `deriveSyncState` / `describeSyncState`.
Null, undefined, rejection or a stale handle produces “Saved on this phone” for the remainder
of that screen’s life; later counters cannot promote an unproven read to “synced”.

| Phase / state | Copy | Glyph | Glyph / text colour |
|---|---|---|---|
| Pending | Blank | None | — |
| Fallback | Saved on this phone | `cloud-outline` | `textSecondary` / `textSecondary` |
| Live / waiting | Saved on your phone · {n} waiting to sync | `cloud-upload-outline` | `textSecondary` / `textSecondary` |
| Live / offline | Saved on your phone · {n} will sync when you’re online | `cloud-offline-outline` | `textSecondary` / `textSecondary` |
| Live / syncing | Syncing… | 18dp spinner | `textSecondary` / `textSecondary` |
| Live / synced | All saved and synced | `cloud-done-outline` | `successText` / `textSecondary` |
| Live / needs_attention | 1 item needs attention / {n} items need attention | `alert-circle-outline` | `warningText` / `warningText` |

Live copy comes verbatim from the presenter. The centred `textNote` Text contains an inline
26×18 View: an 18dp glyph plus 8dp space inside the box, since nested Text ignores margins.
The spinner uses `tints.spinnerTrack`, stroke 2.6, radius 7.7 and a 1000ms linear native loop.
Message changes cross-fade old/new layers for 150ms, stopping on cleanup. The line is neither
pressable nor a live region.

## Guard rules and the completed board ratchet

`designSystemGuard.test.js` strips comments and scans `App.js` plus `src/**/*.js`, excluding
`src/assessment-questions/**` (WelaPLUS owns separate TypeScript tokens). `PENDING_SWEEP` and its
temporary test/filter are deleted: every included source file is checked.

- No fontWeight outside src/constants/typography.js, with exactly two theme exceptions:
  navigationTheme may set 'normal' and must use four fontFamilies faces; paperTheme may set
  only undefined to erase MD3 weights. Theme tests also check the resulting fonts.
- No string-literal fontFamily outside typography.js; reference a face or spread a role.
- No raw numeric fontSize, lineHeight or letterSpacing outside typography.js; there are
  no remaining board exceptions. The typography test separately pins roles, a size floor of 11,
  no role weights and a Bricolage floor of 18.
- No hex, rgb( or rgba( outside src/constants/** and src/utils/scoreBands.js.
  There is no decorative-colour exception. Use tokens for UI and the existing data palettes for
  score/group/letter semantics. Retired blue #294A99 and yellow #FFDD00 must not return.
- No Paper Snackbar named import anywhere. No new named Paper TextInput, Searchbar,
  SegmentedButtons, Card, Chip, FAB, Banner, Menu, Button or HelperText imports
  anywhere in the scanned sources. Button and HelperText are plan additions to the guard.
- No fontWeight, fontFamily or fontStyle in `src/assessment-questions/**/*.ts` or `.tsx`
  outside `__tests__/` and `theme/`. `styleGuard.test.ts` owns `FONT_RATCHET` for existing
  offenders; remove an entry when its file no longer violates.
- No fontSize, lineHeight, color, backgroundColor, borderColor, borderWidth or borderRadius
  keys, or React Native Text, Pressable, TouchableOpacity, TouchableHighlight,
  TouchableWithoutFeedback or Modal imports, in the same package outside `__tests__/`,
  `theme/` and `ui/`. `STYLE_RATCHET` covers existing offenders. Both package guards strip
  comments and ignore interface/type declarations; stale or missing ratchet entries fail.

`BOARD_RATCHET` is empty after Login Tasks 6 and 8 removed its final two entries. The guard
explicitly requires it to stay empty, and every scanned file now meets the same type/control
rules without per-screen allowances.

## Remaining delivery boundaries

Children list and Class detail are built on `feat/bold-red-children`; Record Tasks 1–12 are built
on `feat/bold-red-record`. LiteracySessionForm, ChildSelector, LetterTrackerBottomSheet and
SessionFormScreen pass the full guard without ratchet entries. Session complete Tasks 1–11 are
built on `feat/bold-red-complete`; its screen left `BOARD_RATCHET` in Task 10. Profile Tasks 1–7
are built on `feat/bold-red-profile`; ProfileScreen and SignOutSheets have left `BOARD_RATCHET`.
Login and Reset are built through Task 8 on `feat/bold-red-login`; the Forgot link stays hidden
pending #78. CountChip, StickyActionFooter (including surface='onOverflow'),
ConfirmSheet and the celebration components are available above.
Avatar, SyncBanner and InlineLoading are available; SyncStatusBanner and its test are removed.

The dead SessionsScreen, SessionsTodayRing, ProfileGearButton and HeaderBackButton are
removed. The shared Home gauge lives at `src/components/sessions/SegmentedSessionGauge.js`.
The remaining native
gates are Task 34's EAS preview checks, including fonts, 360dp/large text, keyboard/toast/sheet
ordering, navigation gestures and Home comparison. C11's shared fix landed in Profile Task 2;
its no-double-lift device check belongs to Profile Task 10.
Record's Task 14 preview/device gate and branch review remain orchestrator-owned: board screenshots,
native discard gestures, keyboard visibility, large text, screen-reader focus/announcements,
Reduce Motion, A03s scrolling and Home comparison are not proved by local Jest results.
Session complete’s Task 13 branch review and Task 14 EAS preview/device gate remain
orchestrator-owned: native animation timing, large-text wrapping, screen readers, footer/toast
placement, exit behaviour and Home comparison still need those checks.
Profile's Task 9 branch review and Task 10 preview/device gate remain orchestrator-owned:
keyboard visibility, no double lift, large-text wrapping, screen-reader behavior, native share/toast
placement, the Android Profile header and Home comparison are not proved by local Jest results.
Login's Task 10 branch review and Task 11 preview/device gate remain orchestrator-owned:
art crop, fonts, keyboard/compact layouts, large text, screen-reader order, sign-out/status-bar
transitions and Home comparison need native checks. Reset D10 is deferred to #78.
