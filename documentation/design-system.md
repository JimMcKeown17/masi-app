# Design System — Bold Red

**Standing reference, reconciled with PR 1 on `feat/bold-red-app`, 2026-10-19.** This describes
the implementation, including the remaining board-screen exceptions. Update it in the same branch
as a change to the system. Automated verification is recorded in [build-log.md](./build-log.md);
native visual acceptance remains the shared-look plan's Task 34.

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
The older `SessionsTodayRing` still uses `primary` for below-target progress and is due for deletion
in the Session complete PR; it is not the shared Home gauge.

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
| `onRedHalo` | `surface + '52'` | `#FFFFFF52` | Reserved red-field focus halo |
| `onRedKeyline` | `surface + 'B8'` | `#FFFFFFB8` | Login artwork keyline |
| `onRedOutline` | `surface + 'D9'` | `#FFFFFFD9` | Secondary button edge on red |
| `onRedDisabled` | `surface + '61'` | `#FFFFFF61` | Disabled primary fill on red |
| `warningEdge` | `warning + '4D'` | `#B26A004D` | Attention-pill edge |
| `warningControl` | `warning + '61'` | `#B26A0061` | Warning-button edge |
| `avatarEdge` | `red700 + '2E'` | `#A4182F2E` | Reserved avatar edge |
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
export is retired. `App.js` loads Bricolage Grotesque 800 and Figtree 500/600/700/800 while the
splash is held; a load error is logged and releases the splash with system-font fallback.

| Family key | Registered face |
|---|---|
| `display` | `BricolageGrotesque_800ExtraBold` |
| `textMedium` | `Figtree_500Medium` |
| `textSemi` | `Figtree_600SemiBold` |
| `textBold` | `Figtree_700Bold` |
| `textHeavy` | `Figtree_800ExtraBold` |

Choose the face for the weight; never add `fontWeight` to a custom-family style, because Android
can fall back to the system font. Bricolage is for display headings/numerals at 18 or above;
Figtree carries UI copy, letters and row data. Roles carry geometry/family, not colour: add a
semantic `color` at the call site. The eight original Home roles remain unchanged.

The table lists all 42 roles. A dash means tracking is not set in the role (Paper explicitly uses
zero). **Addition** marks the seven plan additions beyond the overview's role table: each captures
existing Home or board geometry so no extra raw-size exemption is necessary.

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
| `display3XL` | display | 44 / 46 | −1.54 | Large headline; Paper displayLarge |
| `display2XL` | display | 38 / 42 | −1.14 | Large display; Paper displayMedium |
| `displayNumeralXL` | display | 64 / 64 | −1.28 | Reserved Session complete numeral |
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
`SessionsTodayRing` is a temporary exception in composition, not in the guard: its numeral spreads
`display2XL` (38/42, −1.14 tracking) then sets `fontFamily: fontFamilies.textBold`. There is no
36/40 role; the Session complete PR deletes this component. Do not introduce a new shared role
just for that retiring ring.

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

`icon` is an Ionicons name (20 at lg, 18 otherwise). Loading substitutes an 18dp spinner and
`loadingLabel ?? label`, keeps the active fill, and blocks taps. Disabled and busy accessibility
state are exposed; the accessible label follows the loading label unless overridden. Press scale
is 0.98 unless `reduceMotion`; there is no scale animation timeline. Primary pressed/disabled
styles drop the shadow. `style` applies to the button container.

**`IconCircleButton`** — `icon, onPress, accessibilityLabel, surface='canvas', disabled=false,
testID`. Fixed 44dp circular target with a 22dp Ionicons glyph; white/ink/control-edge on canvas,
red700/white on red. Disabled uses a rule edge and disabled glyph. Supply the accessible label
(the component logs an error when it is missing).

**`TextField`** — `label, value, onChangeText, icon, placeholder, error, disabled=false,
secureTextEntry, onToggleSecure, multiline=false, surface='canvas', inputRef, accessibilityLabel,
onFocus, onBlur, style, ...textInputProps`. A native input inside a min-60dp box, radius 14,
constant 2dp edge, inside caps label and `textInput` value. Focus uses ink plus an absolute 4dp
halo; an error uses the error edge, no halo, and an `InlineNote` 8dp below. Error accessible name
is `'{label}, error: {error}'`. Tapping the box focuses the input. `inputRef` accepts a callback
or ref object; `style` styles the input, not the box. The secure toggle is a 44dp Show/Hide
password button; a nonempty masked value uses `textMasked`. Multiline raises the box minimum to
112 and the input minimum to 66. Disabled makes the input noneditable with border fill and disabled
foreground. **`surface='red'` currently renders the same canvas appearance; Login owns that variant.**
It does not apply `NO_TEXT_SUGGESTIONS` automatically: domain-entry callers must pass that contract.

**`SelectField`** — `label, value, placeholder, icon, error, onPress, accessibilityLabel,
disabled=false`. A button styled like the field, with `chevron-down`, `textInput` value and
`InlineNote` on error. Default spoken label joins label and value/placeholder. Use it to open a
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

### Surfaces, rows and supporting text

| Primitive and props | When and how to use it |
|---|---|
| `SurfaceCard({ children, style, testID })` | White, rule edge, radius 18, padding 16, no shadow. Replace Paper Card; put actions in a right-aligned row of md BrandButtons with gap 8. |
| `ListGroup({ children, style })` | White grouped surface, rule edge, radius 18, clipped corners, no shadow. Clones valid child elements with showDivider true except the last; custom row children must honour that prop. |
| `ListRow({ title, subtitle, lead, trailing, onPress, variant='action', busy=false, expanded, disabled=false, showDivider=false, accessibilityLabel, accessibilityRole })` | Action rows min 64, padding 10/16, 40dp lead and wrapping title/subtitle. Default spoken label combines both. Busy disables press and replaces trailing content with a spinner. trailing accepts chevron, external, share, send, disclosure or an element. Disclosure uses expanded for arrow and accessibility state. |
| `ListRow variant='readOnly'` | title is the caps label; subtitle is the value. An accessible View, no action, lead or trailing glyph. |
| `ListRow variant='nested'` | Min 56, left padding 68, 24dp lead and strong-body title. Dividers start at 104 for nested, otherwise 68 with a lead or 16 without. |
| `IconTile({ icon, tone='canvas', iconSize })` | Decorative 40dp tile, radius 14. canvas: background/ink/20dp; red: red50/red700/22dp; warning: warningBg/warningText/22dp. iconSize preserves Home's 22dp canvas glyph. |
| `StatusBadge({ label, tone='neutral' })` | Min 22, pill, textBadge, horizontal padding 8. Tones: neutral border/ink; warning warningBg/warningText; success successBg/successText; successStrong successText/white; error errorBg/error. |
| `EmptyState({ title, body, footnote, action })` | Left-aligned, type-led state without an illustration. displaySheetTitle/header, paragraph body, caption footnote. action is { label, onPress }, rendered as a primary md button. NoActiveProgrammeNotice uses this. |
| `SectionHeader({ title, hint, action, style })` | Caps textSectionLabel/header and optional caption hint. action is BrandButton props, forced tertiary with negative vertical margin to retain its 44dp target without enlarging the label row. Use hint, not the retired subtitle prop. |
| `dashboard/StatBar({ items })` | Bare stat columns. Items: { label, value, color?, onPress?, accessibilityLabel? }. displayTitle/tabular numeral, caps textLabel; actions use primary plus an 18dp chevron. color overrides the numeral for score meaning. Current compact labels retain one line, fit-to-size (floor 0.85), and 1.2 scaling caps on label/value. |

### Sheets

**`BottomSheet`** — `visible, onDismiss, title, subtitle, dismissLabel, headerExtras, footer,
scrollable=true, keyboardAvoiding=true, maxHeight='80%', bodyContentStyle, scrollViewProps={},
children`. Uses Paper `Portal`, flexbox bottom anchoring, a scrim and explicit Android-back
dismissal while visible. Supply a meaningful backdrop `dismissLabel`. Title is
`displaySheetTitle`, subtitle `textParagraph`, radius 22, grabber 36×4/control, `shadows.sheet`,
sides 24 and bottom padding `max(insets.bottom, 24)`. The footer has a divider; optional content
styles compose with the scroll container. Set `scrollable=false` for a child `FlatList`.

The sheet measures its panel to determine slide distance (window height until measured), retains
the exit animation, and ignores touches/hides accessibility content as soon as `visible` becomes
false. Cancelling an old animation cannot unmount a newly reopened sheet. See motion below.
**C11 is still unverified:** keyboard avoidance uses `padding` on iOS and `undefined` on Android;
the wrapper is width 100%, not the conditional Task 35 full-overlay wrapper. Task 34's A03s
Create class → School search determines whether Task 35 is needed. No keyboard fix or device
pass is implied by the restyle.

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

## Navigation chrome

**`ScreenHeader({ navigation, route, options, back })`** is rendered by navigator `header`
options, not inside screen bodies. It reads string `options.headerTitle`, else `options.title`,
else `route.name`. `headerLeftIcon` is back by default, close for New session, or none;
Back needs a `back` entry and `headerBackVisible !== false`. Close/Back call `goBack()`.
`headerRight` is called with `{ canGoBack, tintColor: colors.text }`.

Geometry: canvas, top inset +9, sides 24, bottom 6, min-44 row, gap 12, title top padding 6.
Title is left-aligned `displayTitle`, header role, wrapping without `numberOfLines`, capped at
1.3 font scaling. `options.headerScrolled` adds a 1dp rule hairline.

`useHeaderHairline(navigation?)`, a named export from `ScreenHeader.js`, returns an `onScroll`
handler. It uses an explicit navigation argument or `NavigationContext`, and safely does nothing
without either. Attach it to the root ScrollView/FlatList with `scrollEventThrottle={16}`; it
calls `setOptions({ headerScrolled })` only when `contentOffset.y > 0` changes boolean value.

Class detail still says **“Class details”** until the Children PR uses the class name.
Session complete still has its **“Session saved”** header without a left icon until its PR.
Child onboarding suppresses back and gestures; Home, Login and the three assessment capture/results
surfaces retain hidden headers. Insights row titles use the sentence-case titles of their routes.

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
while the screen is focused; Home uses style='light'. Future red-field board screens use the
same pattern when built, rather than leaving a status-bar override active after navigation.

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
Preserve an existing host's timing/copy: auth and Profile use 4000ms. Choose tone from the outcome
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
keyboardWillShow/Hide or Android keyboardDidShow/Hide and returns zero while hidden. Future
sticky footers register their measured obstruction through the same hook.

The toast is ink, min height 56, radius 18, horizontal screen inset 24, white textBodySemi and
an always-visible underlined “Dismiss” (accessible name “Dismiss message”, min target height 44).
Success/error have a decorative status disc; neutral has none. Neutral/success are polite and
announced on iOS; the error message Text has alert/assertive semantics. It never takes focus.
Timers, animations and ID checks prevent an old exiting toast from removing its replacement.

Auth copy is centralised in `describeAuthError(error, action)` (`src/utils/authErrorCopy.js`,
action='sign_in' or 'reset'). Suspended sign-in says **“Your access is paused. Please contact
your supervisor.”** Known network, server and rate-limit errors have mapped copy; unknown errors
use the action-specific safe fallback rather than raw server messages. “Invalid login credentials”
is the retained sign-in wording. Auth errors remain toasts here; the Login PR moves them inline.

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
| BrandButton | Press scale 0.98 if reduceMotion is false | Current code checks reduceMotion, not tier: static hardware without the OS preference still gets the press scale |
| Native ActivityIndicator | OS-owned spinner | Still OS-owned; not replaced by this contract |

`duration = { fade: 150, quick: 200, base: 250, sweep: 300 }`;
`easing.enter = Easing.bezier(0.2, 0.8, 0.2, 1)`, `easing.sweep = Easing.out(Easing.cubic)`.
Sheet/toast/sync animations use the native driver and stop on cleanup. The table records the
actual toast still-entry timing (200ms), rather than the part spec's general 150ms fade rule.
Session complete's future celebration is approved for full and calm, still for static/Reduce
Motion; its `CELEBRATION_LEVELS` and celebration components are not implemented by this PR.

## Guard rules and the remaining board ratchet

`designSystemGuard.test.js` strips comments and scans `App.js` plus `src/**/*.js`, excluding
`src/assessment-questions/**` (WelaPLUS owns separate TypeScript tokens). `PENDING_SWEEP` and its
temporary test/filter are deleted: every included source file is checked.

- No fontWeight outside src/constants/typography.js, with exactly two theme exceptions:
  navigationTheme may set 'normal' and must use four fontFamilies faces; paperTheme may set
  only undefined to erase MD3 weights. Theme tests also check the resulting fonts.
- No string-literal fontFamily outside typography.js; reference a face or spread a role.
- No raw numeric fontSize, lineHeight or letterSpacing outside typography.js except the
  existing board ceilings below. The typography test separately pins roles, a size floor of 11,
  no role weights and a Bricolage floor of 18.
- No hex, rgb( or rgba( outside src/constants/** and src/utils/scoreBands.js.
  There is no decorative-colour exception. Use tokens for UI and the existing data palettes for
  score/group/letter semantics. Retired blue #294A99 and yellow #FFDD00 must not return.
- No Paper Snackbar named import anywhere. No new named Paper TextInput, Searchbar,
  SegmentedButtons, Card, Chip, FAB, Banner, Menu, Button or HelperText imports
  outside the listed per-file allowances. Button and HelperText are plan additions to the guard.

`BOARD_RATCHET` in the guard is the only remaining adoption exception. Raw counts may fall but
not rise; only the listed Paper component names are permitted. This is a migration ceiling,
not permission for a new screen to copy legacy controls. It never exempts colour or font-weight
violations. A board PR finishes its file's roles/control replacements and **deletes its ratchet
line once both categories are zero**; the guard fails if a fully clean file stays listed.

| File under `src/` | Raw-type ceiling | Permitted ratcheted Paper imports | Owner |
|---|---|---|---|
| screens/auth/LoginScreen.js | 0 | TextInput, Button | Login |
| screens/auth/ForgotPasswordScreen.js | 0 | TextInput, Button | Login |
| screens/main/ChildrenListScreen.js | 2 | Searchbar, Button, Card, Banner | Children |
| screens/children/ClassDetailScreen.js | 5 | Card, FAB, Button | Children |
| screens/sessions/SessionFormScreen.js | 0 | Button | Record |
| screens/sessions/LiteracySessionForm.js | 0 | TextInput, Button, Card, Menu | Record |
| screens/sessions/SessionCompleteScreen.js | 2 | Button | Session complete |
| screens/main/ProfileScreen.js | 2 | TextInput, Button, Card, SegmentedButtons | Profile |
| components/profile/SignOutSheets.js | 5 | None | Profile |
| components/children/ChildSelector.js | 0 | Searchbar | Children |

## Remaining delivery boundaries

Children, Record, Session complete, Profile and Login/reset retain their own board PRs. Components
such as Avatar, SyncBanner, InlineLoading, CountChip, StickyActionFooter, ConfirmSheet
and the celebration are future work, not available primitives. SyncStatusBanner is the existing
unused component with a token-only change; do not treat it as the future Children banner.

The dead SessionsScreen, SessionsTodayGauge, ProfileGearButton and HeaderBackButton are
removed. SessionsTodayRing survives only until the Session complete PR. The remaining native
gates are Task 34's EAS preview checks, including fonts, 360dp/large text, keyboard/toast/sheet
ordering, navigation gestures, Home comparison and C11. Task 35 is conditional on the C11 repro.
