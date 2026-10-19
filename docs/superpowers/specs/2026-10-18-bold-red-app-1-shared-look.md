# Bold Red app, part 1: Shared look

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Shared look: Bold Red on every screen

**Design source:** `RedSystemSheet` (the binding system sheet), the `red-*-components` boards (the
pieces that repeat across screens), and the `red-flow-01…11` journey. Where a components board
refines the system sheet and marks the refinement CHOSEN, the components board wins. Two cases: the
tab-root header sync pill (`red-children-components` §03, "glyph + count") and the segmented
control (`red-profile-components` §04, "sunlight-safe").

**Scope:** tokens, the Paper and React Navigation themes, the shared primitives, the tab bar, the
screen header, the status bar, the toast that replaces the 14 Snackbar hosts, the motion contract,
the suspended sign-in copy, guard tests, and the shared look on every screen that has no board.
Screens that have a board (Log in and reset password, Children and Class detail, Record, Session
complete, Profile) get the theme, tokens and toast here, and are laid out in their own PRs.

**Delivery:** this is the first PR, `feat/bold-red-shared-look`, with its own EAS preview build and
device check. Commit order inside it: (1) tokens, theme and guard tests, (2) primitives,
(3) navigation chrome, (4) toast, (5) sweep of the no-board screens, (6) docs. **No schema, RLS,
payload or outbox change.** `documentation/rls-sync-contract-map.md` is not touched.

### 1. What renders wrong today (evidence)

Paper's MD3 defaults and the system font show through wherever `App.js:93-117` does not override
them. The `theme` object overrides 20 of Paper's MD3 colour roles. Every role it leaves out keeps
Paper's purple-tinted MD3 baseline (`react-native-paper@5.14.5`,
`src/styles/themes/v3/LightTheme.tsx`).

| Leak | Source | Where it shows |
|---|---|---|
| **Snackbar action purple `#D0BCFF`** on a cool-grey `#313033` bar, text `#F4EFF4` | `inversePrimary`, `inverseSurface`, `inverseOnSurface` not overridden; `Snackbar.tsx:260-262` | All 14 Snackbar hosts; the suspended-EA "Dismiss" (ROADMAP §5) |
| Lavender card surfaces `rgb(247,243,249)` plus an Android elevation shadow, radius 12 | `elevation.level1`, `roundness: 4` × 3; Paper `Card` default mode `elevated` | 17 files using `Card` |
| Lavender search bar `rgb(238,232,244)`, grey-purple icon and placeholder `#49454F` | `elevation.level3`, `onSurfaceVariant` | `ChildrenListScreen`, `AssessmentChildSelectScreen`, `ChildSelector` (`Searchbar`) |
| Lavender menu `rgb(243,237,246)` | `elevation.level2` | `LiteracySessionForm` (`Menu`) |
| **Amber selected chips and segments** with near-black purple text `#1D192B` | `secondaryContainer` is mapped to `colors.warningBg`, `onSecondaryContainer` not overridden (`Chip/helpers.tsx:104`, `SegmentedButtons/utils.ts:90`) | `ProfileScreen` and `AssessmentRankingScreen` (`SegmentedButtons`); `TimeEntriesListScreen` (`Chip`); `ClassDetailScreen` (`contained-tonal` Button) |
| **Deep-purple `#21005D` plus icon on the red FAB** | `onPrimaryContainer` not overridden; `FAB` has no `color` prop (`ClassDetailScreen.js:237`) | Class detail |
| Grey-purple `#49454F` labels, placeholders, helper text, list icons and icon buttons | `onSurfaceVariant` | Every Paper `TextInput`, `HelperText`, `List.Item` and `IconButton` |
| Input outline nearly invisible, 1.24:1 | `outline: colors.border` (Line `#ECE5E4`) | Every outlined `TextInput`, outlined `Button` and outlined `Chip` |
| System font on all Paper text, in MD3 sizes (12/14/16) | `fonts: configureFonts()` default | All 258 `<Text variant=…>` uses |
| **iOS-blue back chevron and "Back"** on Reset password; grey `rgb(242,242,242)` scene background during transitions | `NavigationContainer` has no `theme` (`AppNavigator.js:356`), so React Navigation's `DefaultTheme` applies | `ForgotPassword` (Auth stack has no custom `headerLeft`); every stack transition |
| Red 500 used behind white text and as small red text, 4.30:1 (fails AA below 18.66px bold) | `colors.primary` = `#E72D4D`, used in 93 places | `BrandButton`, `HeaderBackButton` "Back" 17px, `LockedBottomTabBar` FAB, `ChipSelector`, `SelectSheet`, `ClockInBeforeSessionSheet` |
| Placeholder token 2.31:1 | `colors.placeholder` = `#B3A8A8` | Available to every input |
| Raw type | 77 `fontSize:`, 103 `fontWeight` outside `src/constants`; 4 importers of the legacy `typography` roles (`BrandButton`, `LoadingScreen`, `HandleOpenError`, `App.js` via `BrandButton`); 6 of the Home `typeRoles` | Every non-Home screen. ROADMAP's "97" was counted before Home's sweep. |
| Raw hex outside `src/constants` | 31: mostly `'#FFFFFF'`; `rgba(0,0,0,0.5)` scrim (`BottomSheet.js`); `'#000'` (`ClassDetailScreen`); `'#FFBB00'` copied in `RankedBarRow` and `LetterMasteryRankingScreen` (it belongs to `scoreBands.js`) | — |

**Android font rule, consequence:** once Paper's default family is Figtree, any `fontWeight`
style on that text makes Android fall back to the system font (the repo rule, enforced for
`typeRoles` by `__tests__/typography.test.js`). So every `fontWeight` in `src/` must go in this PR,
not only those in no-board screens, or board screens will show mixed fonts until their own PR.

### 2. Tokens

#### 2.1 Colour (`src/constants/colors.js`)

The system sheet's rule is binding. Red 600 is the action red: every red fill that carries text or
an icon, the FAB included. Red 500 is for graphics only (arcs, gauge progress, confetti), never
behind small text. Selected state is ink. Red appears only where the EA acts.

| Token | Today | New | Why |
|---|---|---|---|
| `primary` | `#E72D4D` (red500) | **`#C81F3E` (red600)** | Nearly all of its 93 uses are text, or fills behind text and icons. White on red500 is 4.30:1; on red600 it is 5.64:1. Retuning the one token fixes all of them, and Paper's `primary` follows. |
| `primaryDark` | `#C81F3E` | **`#A4182F` (red700)** | The pressed action (board "Pressed": Red 700 fill). |
| `placeholder` | `#B3A8A8` | **`#76696B` (Muted)** | The board placeholder is Muted. 2.31:1 → 5.25:1. |
| `emphasis` | `#E72D4D` | unchanged | Score band `needs_work` (ADR-0003) and data graphics. |
| all others | — | unchanged | — |

Graphic uses switch from `colors.primary` to the explicit ramp token, so their colour does not
move: `src/utils/sessionGoalPresentation.js:13` (gauge "progressing") and
`src/components/sessions/SessionsTodayRing.js:16` both become `colors.red500`. The Home gauge
stays Red 500, as its board requires.

**New export `tints`** gives names to the system sheet's derived alphas, so no screen writes
`+ '1F'` by hand. Values are token + alpha, all from approved hexes:

| `tints.` | Value | Board name | Use |
|---|---|---|---|
| `rule` | `INK + '1F'` | ink12 | Card, group and banner borders; header hairline; pill borders |
| `control` | `INK + '33'` | ink20 | Input, secondary button and 44 icon-button borders; segmented track; sheet grabber |
| `pressed` | `INK + '0F'` | ink06 | Pressed fill; focus halo on canvas |
| `onRedTile` | `'#FFFFFF24'` | white14 | Icon tile on red |
| `onRedHalo` | `'#FFFFFF52'` | white32 | Focus halo on red |
| `onRedOutline` | `'#FFFFFFD9'` | white 85% | Outline button on red ("Not now") |
| `onRedDisabled` | `'#FFFFFF61'` | white 38% | Disabled primary on red |
| `warningEdge` | `WARNING + '4D'` | amber 30% | Needs-attention pill and banner border |
| `warningButtonEdge` | `WARNING + '61'` | amber 38% | "Record without clocking in" border |
| `scrim` | `'#1C1517' + '7A'` | hero 48% | Sheet backdrop |

Home's `colors.text + '1F'` (`AttentionArea.js:9`) becomes `tints.rule` during reconciliation.

**Contrast of every pair the boards use** (WCAG 2.1, computed):

| Pair | Ratio | Verdict |
|---|---|---|
| white on red600 (primary buttons, FAB, today tile) | 5.64 | AA |
| red600 on white / on canvas (tertiary links, active tab) | 5.64 / 5.20 | AA |
| red600 on red50 (active tab label in its pill) | 4.95 | AA |
| red50 on red600 (captions on red) | 4.95 | AA |
| white on red700 / red700 on red50 | 7.64 / 6.70 | AA |
| ink on canvas / white on ink (toast) | 15.72 / 17.05 | AA |
| Muted on white / on canvas | 5.25 / 4.84 | AA |
| warningText on warningBg (badges, banner, D8 note) | 6.40 | AA |
| error on errorBg (error note) / error on white / white on error | 5.63 / 6.54 / 6.54 | AA |
| successText on successBg ("Synced" badge) | **4.50** | AA, exactly at the limit: do not lighten either token |
| white on red500 | **4.30** | **Fails** for text: red500 stays graphic-only (now enforced, because `primary` moves) |
| success glyph on white (synced cloud) / white check on success (toast disc) | 3.16 / 3.16 | Passes 3:1 for graphics; never use for text |
| ink20 control border on white / on canvas | **1.52 / 1.51** | **Fails WCAG 1.4.11 (3:1)** as drawn. The inside caps label and the white box identify the field, so I keep the board (see Builder's calls). |
| white box on canvas | 1.08 | Decorative; the ink20 border carries the edge |
| disabled text `#B3A8A8` on Line; red700 on white38-on-red | 1.86 / 2.52 | Disabled controls, exempt |
| amber `#B26A00` on white | 4.24 | Fails for text: amber stays a glyph or border colour; text uses `warningText` |

#### 2.2 Type (`src/constants/typography.js`)

**Fonts:** add `Figtree_600SemiBold` to `useFonts` in `App.js` (same package, already installed,
no new dependency), as `fontFamilies.textSemi`. The boards use weight 600 for the error note, the
toast, the canvas sync line and inactive tab labels. Weight 400 (board placeholders) is not loaded:
React Native draws a placeholder in its input's face, so placeholders use 500.

**Roles to add** to `typeRoles` (Home's eight stay as they are). Families are chosen per weight and
`fontWeight` is never set:

| Role | Family | Size/line | Tracking | Board name | Used for |
|---|---|---|---|---|---|
| `display3XL` | Bricolage 800 | 44/46 | -1.5 | display.xl | Session complete headline |
| `display2XL` | Bricolage 800 | 38/42 | -1.1 | display | "Sign in", "Reset password" |
| `displayTitle` | Bricolage 800 | 28/32 | -0.6 | title | Screen header title |
| `displaySheetTitle` | Bricolage 800 | 24/28 | -0.5 | sheet title | Sheet titles, empty-state titles, profile name |
| `displayHeading` | Bricolage 800 | 18/24 | -0.3 | heading | Card headings |
| `displayStat` | Bricolage 800 | 28/32 | -0.6 | numeral | Stat bar numerals (tabular) |
| `textRowTitle` | Figtree 700 | 16/22 | 0 | rowTitle | List row titles |
| `textBodyL` | Figtree 500 | 16/22 | 0 | — | Paper `bodyLarge` |
| `textParagraph` | Figtree 500 | 15/22 | 0 | body | Sheet bodies, empty-state bodies, notes on canvas |
| `textData` | Figtree 700 | 15/20 | 0 | time · data | Times and counts in rows (tabular) |
| `textSmallStrong` | Figtree 700 | 14/20 | 0 | — | Paper `titleSmall` |
| `textInput` | Figtree 500 | 17/22 | 0 | input value | Field values, picker options |
| `textOptionSelected` | Figtree 800 | 17/22 | 0 | selected option | Selected option in a picker sheet |
| `textButtonL` | Figtree 800 | 17/20 | 0 | 56 button | 56dp button labels |
| `textLink` | Figtree 800 | 14/20 | 0 | tertiary | Text buttons on canvas ("View all", "Sync now", "Add child") |
| `textNote` | Figtree 600 | 13/18 | 0 | errorNote | Error and warning notes, the canvas sync line |
| `textToast` | Figtree 600 | 15/20 | 0 | toast | Toast message |
| `textChip` | Figtree 700 | 13/18 | 0 | chip | "2 selected" |
| `textBadge` | Figtree 800 | 12/16 | 0 | badge | Status badges, Home's sync badge count |
| `textSectionLabel` | Figtree 800 | 12/16 | 1.0, caps | label | In-content section labels |
| `textNavActive` / `textNavInactive` | Figtree 800 / 600 | 11/13 | 0 | nav | Tab labels |

Board rule, enforced by test: Bricolage only at 18px and above, and only for display text, titles
and standalone numerals. Letters, times in rows and all UI copy are Figtree.

**Retire the legacy `typography` export** (`screenTitle`, `cardTitle`, `body`, `caption`,
`statValue`, `sectionLabel`). It sets `fontWeight` with no family, so it renders the system font.
Its importers move to `typeRoles`: `BrandButton` → `textButtonL`, `LoadingScreen` and
`HandleOpenError` titles → `displaySheetTitle`, their bodies → `textParagraph`, and
`HandleOpenError` captions → `textCaption`. A single type system remains.

#### 2.3 Spacing, radii, elevation (`src/constants/colors.js`)

- `spacing`: add `ms: 12` and `ml: 20`. The boards use 12 and 20 as constantly as 8, 16 and 24.
  Other one-off gaps (2, 6, 10, 14, 18) stay literal.
- `borderRadius`: add `pill: 999`. The boards' radii are `sm 9` (notes), `md 14` (inputs, tiles),
  `lg 18` (cards, groups, banners, toast), `xl 22` (sheets, gauge card), `pill`, and height/2 on
  small fixed pills.
- `shadows`: add these. CSS blur becomes half its value as an RN `shadowRadius`; Android uses
  `elevation` plus `shadowColor` (honoured on API 28+).

| `shadows.` | Colour | Offset y | Opacity | Radius | Elevation | Board |
|---|---|---|---|---|---|---|
| `action` | `#C81F3E` | 10 | 0.22 | 11 | 6 | Red 600 button on canvas |
| `onRedAction` | `#530B17` | 8 | 0.22 | 10 | 6 | White button on a red field |
| `fab` | `#C81F3E` | 10 | 0.28 | 10 | 8 | Record button (plus its 5dp white ring) |
| `toast` | `#221A1B` | 12 | 0.24 | 14 | 12 | Toast |
| `sheet` | `colors.shadowWarm` (`#3A2424`) | -8 | 0.10 | 12 | 16 | Bottom sheet |
| `nav` | `colors.shadowWarm` (`#3A2424`) | -8 | 0.06 | 12 | 8 | Tab bar |

`card` and `elevated` stay. Cards and grouped lists have **no** shadow: the board allows "two
cards in the whole body", and those are Home's.

#### 2.4 Motion (`src/constants/motion.js`, new)

`duration = { fade: 150, quick: 200, base: 250, sweep: 300 }`;
`easing.enter = Easing.bezier(0.2, 0.8, 0.2, 1)` (the board's card, pill, headline and sheet
curve); `easing.sweep = Easing.out(Easing.cubic)`.

### 3. Paper theme mapping (`src/theme/paperTheme.js`, new; `App.js` imports it)

Build the theme by spreading `MD3LightTheme`, then set **every** colour role, so no MD3 default
remains (a test enforces this):

| MD3 role | Token | Notes |
|---|---|---|
| `primary` / `onPrimary` | `colors.primary` (red600) / `colors.onDark` | Buttons, focus, `ActivityIndicator`, switches |
| `primaryContainer` / `onPrimaryContainer` | `red50` / `red700` | Fixes the purple FAB icon (6.70:1) |
| `secondary` / `onSecondary` | `colors.text` / `colors.onDark` | **Today `secondary` is amber**, which is why chips and segments are amber |
| `secondaryContainer` / `onSecondaryContainer` | `colors.text` / `colors.onDark` | Selected chips and segments become the board's ink fill with white text |
| `tertiary` / `onTertiary` | `colors.warningText` / `colors.onDark` | Caution (6.80:1) |
| `tertiaryContainer` / `onTertiaryContainer` | `warningBg` / `warningText` | |
| `error` / `onError` / `errorContainer` / `onErrorContainer` | `error` / `onDark` / `errorBg` / `error` | |
| `background` / `onBackground` | `colors.background` / `colors.text` | |
| `surface` / `onSurface` | `colors.surface` / `colors.text` | |
| `surfaceVariant` / `onSurfaceVariant` | `colors.background` / `colors.textSecondary` | Removes `#49454F` from labels, placeholders and icons |
| `surfaceDisabled` / `onSurfaceDisabled` | `colors.border` / `colors.disabled` | Board disabled button: Line fill, `#B3A8A8` text |
| `outline` / `outlineVariant` | `tints.control` / `colors.border` | Control borders at ink20; dividers in Line |
| `inverseSurface` / `inverseOnSurface` / `inversePrimary` | `colors.text` / `colors.onDark` / `colors.onDark` | Any Paper Snackbar left anywhere is ink with a white action, never purple |
| `shadow` / `scrim` / `backdrop` | `colors.shadowWarm` / `colors.heroDark` / `tints.scrim` | |
| `elevation.level0…5` | `'transparent'`, then `colors.surface` × 5 | Removes the lavender tint from cards, search bars and menus |
| `success` (custom, existing) | `colors.success` | |

- `roundness: 6`. Paper multiplies it: Card 3× = 18 (`borderRadius.lg`), Button 5× = 30 (a pill at
  ≤ 60dp), Chip 2× = 12. Paper inputs, snackbars and search bars are replaced by primitives, so
  their radius no longer matters.
- `fonts: configureFonts({ config })` with every MD3 variant set explicitly, `fontWeight:
  undefined` on each:

| Variant | Role | Variant | Role |
|---|---|---|---|
| `displayLarge` | `display3XL` | `titleMedium` | `textRowTitle` |
| `displayMedium` | `display2XL` | `titleSmall` | `textSmallStrong` |
| `displaySmall`, `headlineLarge` | `displayXL` | `labelLarge` (Paper Button labels) | `textButton` |
| `headlineMedium` | `displayTitle` | `labelMedium` | Figtree 700 12/16 |
| `headlineSmall` | `displaySheetTitle` | `labelSmall` | Figtree 700 11/14 |
| `titleLarge` | `displayM` | `bodyLarge` | `textBodyL` |
| `bodyMedium` | `textBody` (15/20) | `bodySmall` | `textCaption` (13/18) |
| `default` | `{ fontFamily: fontFamilies.textMedium }` | | |

  Text gets slightly larger (bodySmall 12→13, bodyMedium 14→15). That is the board's floor, and
  the 360dp device check covers its layout effect.

**React Navigation theme** (`src/theme/navigationTheme.js`, new), passed to `NavigationContainer`:
`colors = { primary: colors.primary, background: colors.background, card: colors.background, text:
colors.text, border: colors.border, notification: colors.primary }`. `fonts.regular` / `medium` /
`bold` / `heavy` = Figtree 500 / 600 / 700 / 800, each with `fontWeight: 'normal'`. Native-stack
`screenOptions` add `contentStyle: { backgroundColor: colors.background }`, and the tab navigator
adds `sceneStyle` the same, so no transition flashes grey.

### 4. Shared primitives

Primitives live in `src/components/common/`. **Home** marks pieces Home already built.
Reconciliation should use these names across all sections.

#### `BrandButton` (existing; extended into the one button)

Props: `label`, `onPress`, `variant`, `size = 'lg'`, `surface = 'canvas'`, `icon`, `loading`,
`loadingLabel`, `disabled`, `accessibilityLabel` (defaults to `label`). It stays a `Pressable` with
`hitSlop` 8, `accessibilityRole="button"` and `accessibilityState={{ disabled, busy: loading }}`.

| `variant` | Canvas | On red (`surface="red"`) |
|---|---|---|
| `primary` | `primary` fill, white `textButtonL`, `shadows.action`. Pressed: `primaryDark`, no shadow. Disabled: `border` fill, `disabled` text, no shadow. | White fill, `primary` text, `shadows.onRedAction`. Pressed: `red50` fill, `red700` text. Disabled: `tints.onRedDisabled` fill, `red700` text. |
| `secondary` | White, 1.5 `tints.control` border, ink text ("Update", "Change password") | Transparent, 1.5 `tints.onRedOutline` border, white text ("Not now") |
| `tertiary` | No fill, `primary` `textLink`, height 44, horizontal padding 2 | No fill, white `textButton` ("Forgot password?") |
| `destructive` | `error` fill, white text: only the confirming tap inside a sheet | — |
| `destructiveQuiet` | White, 1.5 `tints.control` border, `error` text: the trigger on a screen ("Sign out", "Delete class") | — |
| `warning` | `warningBg` fill, 1.5 `tints.warningButtonEdge` border, `warningText` text at 16/20 800, leading `warning-outline` 18 in `colors.warning`: the D8 sheet only | — |

- `size="lg"`: height 56 minimum, pill, full width by default. `size="md"`: height 44 minimum,
  horizontal padding 20 (18 for outlined), `textButton`. Heights are minimums: at large text the
  label wraps and the button grows.
- Loading: an 18dp spinner (white on filled, `primary` on outlined) beside `loadingLabel` or the
  label. The width does not change. Taps are ignored.
- An `icon` sits 8dp before the label: 18dp at `md`, 20dp at `lg`.

#### `RoundIconButton` (new; Home's hero gear and sync discs are the red version)

44×44 disc, radius 22, 22dp Ionicons glyph. Canvas: white fill, 1.5 `tints.control` border, ink
glyph (Back = `chevron-back`, Close = `close`, Edit = `create-outline`). Red: `red700` fill, white
glyph. `accessibilityLabel` is required. Home's inline `styles.heroButton` can adopt it during
reconciliation.

#### `TextField` (new; replaces Paper `TextInput` + `HelperText`)

- Box: min height 60, radius 14, white, 1.5 `tints.control` border, padding 0 16 (0 4 0 16 when it
  has a trailing 44 button). Label inside: `textLabel` (11/14, caps, 1.1 tracking) Muted. Value:
  `textInput` ink. Placeholder: `colors.placeholder` (Muted). 2dp gap between label and value.
  Tapping anywhere on the box focuses the input.
- Focus: 2dp ink border, plus a 4dp `tints.pressed` halo (a wrapping view, radius 18).
- Error (`error` string): 2dp `error` border, label in `error`, and an `InlineNote tone="error"`
  8dp below. The input's `accessibilityLabel` becomes "{label}, error: {message}".
- Disabled: `border` fill, value in ink, glyphs in `colors.disabled`.
- `secureTextEntry` + `onToggleSecure`: a 44 trailing button with an eye glyph, labelled "Show
  password" / "Hide password". Profile's single "Show passwords" toggle passes the state in.
- `multiline`: min height 112, padding 12 16, value min height 66.
- `surface="red"` (Login panel): border transparent at rest, `tints.onRedHalo` focus halo, a 4dp
  `errorBg` halo on error. The Login section owns that state.

#### `FieldButton` (new): a field-styled trigger that opens a sheet

The same box as `TextField`. The caps label is over the value ("Today · Thu 14 Oct"), or a Muted
placeholder ("Choose a level"), with a trailing `chevron-down` 20 Muted. `accessibilityRole="button"`;
label "{label}, {value or placeholder}".

#### `SearchField` (new; replaces Paper `Searchbar`)

Height 48, radius 14, white, 1.5 `tints.control` border, padding 0 16, gap 10. Leading `search` 20
Muted, value 16/20 Figtree 500 ink, placeholder Muted. When there is text, a trailing 44 clear
button labelled "Clear search". `accessibilityLabel` = the placeholder ("Search classes…").

#### `InlineNote` (new; the board's "errorNote")

- `tone="error"`: `errorBg` fill, radius 9, padding 8 12, `textNote` in `error`,
  `accessibilityRole="alert"`.
- `tone="warning"`: `warningBg` fill, radius 14, padding 12 14, `warning-outline` 18 in
  `colors.warning`, 8 gap, `textNote` in `warningText` (the D8 note).

It wraps; it never truncates.

#### `BottomSheet` (existing; restyled, behaviour unchanged)

| Part | Today | Board |
|---|---|---|
| Top radius | 18 | **22** (`xl`) |
| Grabber | 36×4 `border` | 36×4 `tints.control`, 8 from the top |
| Title | Paper `titleMedium` + `fontWeight: '700'`, system font | `displaySheetTitle` ink, 20 below the grabber, `accessibilityRole="header"` |
| Subtitle | `bodySmall` Muted | `textParagraph` Muted, 6 below the title |
| Scrim | `rgba(0,0,0,0.5)` | `tints.scrim` |
| Shadow | none | `shadows.sheet` |
| Padding | 24 sides, bottom `max(inset, 24)` | unchanged |
| Footer rule | 1dp `border` | unchanged |

Motion (new, follows §7): the sheet rises from 100% of its height with `easing.enter` over
`base` (250ms), and the scrim fades over `quick`. At the `still` level both fade over `fade` (no
slide). Dismiss reverses the animation. The Portal, hardware back and keyboard handling stay as
they are.

#### `SelectSheet` (existing; restyled to the board's picker sheet)

Rows become flat options at least 56 tall, with 1dp `border` dividers between them (none after the
last), `textInput` ink. Selected: `textOptionSelected` plus a trailing 22dp `checkmark` in ink.
**No red** (today the selected row has a 2dp `primary` border and `primary` text). The optional
search uses `SearchField`; the actions use `BrandButton`. Each option keeps
`accessibilityRole="button"` with `accessibilityState={{ selected }}`.

#### `ClockInBeforeSessionSheet` (existing; the D8 sheet, drawn verbatim in the system sheet)

Copy is unchanged; the board says "D8 copy verbatim". The title "You are not clocked in." and the
body come from the restyled `BottomSheet`. Then, with 12 gaps, 24 below the body:
`BrandButton primary lg` "Clock in now" → `InlineNote tone="warning"` (the cost sentence) →
`BrandButton warning lg` "Record without clocking in" → a 44-tall text button "Cancel" in ink
16/20 800 (today Muted 13/700). Today's buttons are radius 9 and 52/48/42 tall with 14/13/13 text.

#### `ScreenHeader` (new; the board's "H2 canvas header")

See §5.2.

#### `ListGroup` + `ListRow` (new; the board's "grouped surface")

- Group: white, 1dp `tints.rule` border, radius 18, `overflow: hidden`, no shadow.
- Row: min height 64, padding 10 16, gap 12. Lead (optional), 40dp: `Avatar`, or a settings tile
  (40, radius 14, `colors.background` fill, ink glyph 20). Then the title (`textRowTitle` ink,
  wraps) and the sub-line (`textCaption` Muted, wraps). Trailing: `chevron-forward` 20 Muted (opens
  something in the app), `open-outline` (leaves the app), `share-outline` (OS share), a
  `StatusBadge`, or a `ToggleChip`.
- Dividers: 1dp `border`, inset to the text start (16 + 40 + 12 = 68 with a lead, else 16).
- Pressed: `tints.pressed` fill. The whole row is one button whose label combines title and
  sub-line. Read-only rows use a caps `textLabel` over a `textRowTitle` value and have no trailing
  glyph.

#### `SurfaceCard` (new; replaces Paper `Card` in no-board screens)

White, 1dp `tints.rule` border, radius 18, padding 16, no shadow. `Card.Actions` becomes a
right-aligned row of `BrandButton size="md"`, gap 8. Card titles use `textRowTitle`.

#### `Avatar` (new; Children, Record, Profile, Session complete)

`red50` fill with `red700` initials, `textBadge`-weight face (Figtree 800), letter spacing 0.4.
Sizes: 28 (roster preview, 2dp surface ring), 40 (rows; circle for children, radius-14 tile for
class monograms), 64 (profile, 22px initials). Hidden from accessibility: the row label names the
child.

#### `StatusBadge` (new)

Min height 22, horizontal padding 8, pill, `textBadge`. Tones: `warning` ("Unsynced",
"Sensitive"), `success` ("Synced"), `error` ("Failed"), `neutral` (`border` fill with ink text,
"Grade 1"). It grows with large text; it does not clip.

#### `ToggleChip` and `SelectionChip` (new; Record and Children)

- `ToggleChip`: height 36 minimum. Selected: ink fill, white 14 800 text, leading `checkmark` 16,
  padding 0 14 0 10. Unselected: white, 1.5 `tints.control` border, ink text, padding 0 16.
  `accessibilityRole="checkbox"` with `checked`.
- `SelectionChip` ("2 selected"): height 32, ink fill, white `textChip`, leading check 16. Display
  only.

`ChipSelector` (`src/components/forms/ChipSelector.js`, used by Add child and Edit child) renders
`ToggleChip`s. Today it renders Paper `Chip` with a `colors.primary` selected fill.

#### `SegmentedControl` (new; replaces Paper `SegmentedButtons` and Record's Children | Groups)

Height 44, pill, white track with an inset 1.5 `tints.control` edge. Each segment is a full-height
button; the selected one has an ink thumb inset 4.5 with white 15/20 800 text, and the others have
ink 15/20 700 text (17:1, sunlight-safe). `role="radio"` (default: `radiogroup` / `radio`, for
choosing a mode, as in Profile's capture mode and Insights' range) or `role="tab"` (`tablist` /
`tab`, for switching visible content, as in Record's Children | Groups).

#### `EmptyState` (new; "type-led", from `red-children-components` §03)

Bare on canvas and left-aligned: title `displaySheetTitle`, 8 gap, body `textParagraph` Muted,
optional `BrandButton size="md"` 16 below the body. No icon, emoji or illustration. Title
`accessibilityRole="header"`. `NoActiveProgrammeNotice` renders through it: title "No active
programme", body copy unchanged. Today it is a centred white card with a 48dp grey icon.

#### `SectionHeader` (existing; restyled to the board's section label)

`textSectionLabel` Muted caps, min height 20, `accessibilityRole="header"`. Optional trailing
`action` (a `BrandButton tertiary`, 44 hit area: "Add child", "Show passwords"). The optional
`subtitle` becomes a hint below it in `textCaption` Muted. Page titles that duplicate the new
screen header are removed (§8).

#### `StatBar` (existing; restyled to the board's bare stat bar)

No container and no shadow. Each item has a `displayStat` numeral in ink (tabular), and under it a
`textLabel` caps label in Muted, min height 56, 2 gap. A tappable item (`onPress`) turns `primary`
(numeral and label) with a trailing `chevron-forward` 16; its label is unchanged. Today it is
white pills with a 20/700 `primary` value and a **10px** label (below the 11 floor). An item's
`color` prop still overrides the numeral colour (score semantics stay with the caller).

#### `SyncBanner` (existing `SyncStatusBanner`, unused today; restyled for Children and Profile)

Min height 56, radius 18, padding 8 16 8 14, gap 12, white, 1dp `tints.rule` border. Message in
`textBodyStrong` ink. Hidden when synced.

| State | Message (new presenter fn `describeSyncBanner`) | Action |
|---|---|---|
| `waiting` | "{n} item(s) waiting to sync" | `BrandButton tertiary` "Sync now" → `syncNow()` |
| `offline` | "{n} item(s) will sync when you're online" | none |
| `syncing` | "Syncing {n} item(s)…" | none |
| `needs_attention` | "{n} item(s) need(s) attention", on `warningBg` with a `tints.warningEdge` border and `warningText` text | "Review" (`warningText`) → `SyncStatus` |

The banner is `accessibilityRole="summary"`, and its action is a separate button. The straight
apostrophe matches the presenter.

#### `SyncIndicator` default variant (existing; becomes the canvas header pill)

From `red-children-components` §03 A (chosen). The hit area is 44 tall; the pill is 32 tall,
radius 16, white with a 1dp `tints.rule` border, gap 6.

| State | Pill | Content |
|---|---|---|
| `synced` | 36 wide, glyph only | `cloud-done-outline` 18 in `success` |
| `waiting` | padding 0 12 0 9 | `cloud-upload-outline` Muted + "{n} waiting" in ink 14/18 800 |
| `offline` | same | `cloud-offline-outline` Muted + "{n} waiting" |
| `syncing` | 36 wide | Muted spinner (1000ms linear, still when `motionLevel === 'still'`) |
| `needs_attention` | padding 0 6 0 9, `warningBg`, `tints.warningEdge` border | `alert-circle-outline` `warning` + "{n}" in `warningText` |

The label keeps "Open sync status, {describeSyncState accessibilityLabel}". It drops Paper `Badge`.
The `hero` variant (Home) is unchanged.

#### `Toast` + `ToastProvider` + `useToast` (new; replaces Paper `Snackbar`)

See §6.

### 5. Navigation chrome

#### 5.1 Tab bar (`LockedBottomTabBar`, `BottomTabIcon`)

| Part | Today | Board |
|---|---|---|
| Bar | white, 1dp `border` top, padding 8 top / 6 sides | white, 1dp `border` top, `shadows.nav`; destination row 56 + bottom inset; padding 0 4 |
| Destination | min 50, icon 22, a 5dp dot above it when focused | 56 tall, padding-top 6, 3 gap; icon 24 in a 56×30 pill (radius 15). Focused pill `red50` with `tabActive` (red600) glyph; unfocused transparent pill, Muted glyph. **The dot goes** (the pill is the indicator). |
| Glyphs | filled focused / outline unfocused | unchanged mapping (`home`, `people`, `bar-chart`, `clipboard`) |
| Label | 10/700, Muted or red600 | `textNavActive` red600 / `textNavInactive` Muted, 11/13 |
| Record FAB | 58, `primary` (red500), 4dp surface border, `shadows.elevated`, `add` 31 | **60**, `primary` (now red600), **5dp** white ring, `shadows.fab`, `add` 28 white; top edge 24 above the destination row |
| Record label | 10/800 `primaryDark` | 11/13 Figtree 700 **ink**, 39 below the row top |
| Labels | "Home", "Children", "Record", "Insights", "Assess" | unchanged |

Unchanged: the five-slot order, `accessibilityRole="tab"` and `selected` on destinations, the
labels "{label} tab" and "Record a session", `tabPress` / `tabLongPress`, and the session launch
guard and its D8 sheet. Labels cap at `maxFontSizeMultiplier={1.3}`, so the bar keeps its height
at the largest font. The tab bar also registers its height with the toast host (§6).

#### 5.2 Screen header (`ScreenHeader`, the chosen H2)

The rejected H1 (a slim Red 600 band) is not built: red stays reserved for acting.

- Container: `colors.background`, paddingTop `insets.top + 6`, paddingHorizontal 24,
  paddingBottom 6. Row min height 56, centred vertically, gap 12.
- Left: a `RoundIconButton` (canvas): "Back" (`chevron-back`) on pushed screens, "Close" (`close`)
  on the Record modal (`SessionForm`), nothing on tab roots.
- Title: `displayTitle` ink, `flex: 1`, **left-aligned** (today centred), wraps to two lines and
  never truncates, `accessibilityRole="header"`, `maxFontSizeMultiplier={1.3}`.
- Right: tab roots show the canvas `SyncIndicator` (→ `SyncStatus`). Pushed screens show one
  optional `BrandButton tertiary` (Class detail's "Manage classes"), or nothing.
- Hairline: 1dp `tints.rule` at the bottom, **only once content has scrolled under it**.
  `useHeaderHairline()` returns an `onScroll` handler that calls
  `navigation.setOptions({ headerScrolled })` only when the boolean flips, never on every frame.
- Wiring: the native stacks (Main, Children, Auth) and the tab navigator set
  `header: (props) => <ScreenHeader {...props} />`, so every screen gets the header from one place.
  `HeaderBackButton.js` is deleted; iOS swipe-back and Android hardware back are unchanged. Screens
  that set `headerShown: false` keep it: Home, Login, Session complete, `LetterAssessment`,
  `SequentialAssessment`, `AssessmentResults`.
- `ChildOnboarding` keeps `headerBackVisible: false` (no left button). `SessionComplete` keeps no
  back button; its section decides whether it shows a header at all.

#### 5.3 Status bar

- The root `<StatusBar>` in `App.js` becomes `style="dark"` (today `"auto"`). The app is pinned to
  light mode (`app.config.js:26`), so this changes nothing visible; it makes the rule explicit.
- Red-field screens (Home, Login and reset password, Session complete) use a new
  `FocusAwareStatusBar style="light"`, extracted from Home's inline pattern (`HomeScreen.js:160`):
  mounted only while focused, so blur restores the root style. Each also paints its red behind the
  top inset, as Home does.
- Android is edge-to-edge (`app.config.js:52`). Every canvas screen paints behind the status bar
  through `ScreenHeader`'s top padding. Bottom sheets' scrim covers the status bar area; the icons
  stay dark.

### 6. Toast: one root host instead of 14 Snackbars (ROADMAP §5)

> **Amended by overview §4 S3 and §8 (R2, R4):** the host is a later native sibling of the whole
> `PaperProvider` tree, not a Paper `Portal`. Signed-in publishers are bound to the current
> handle, and a toast never survives sign-out or crosses EAs. Where this section says otherwise,
> the overview wins.

Design: `red-profile-components` §06 "Toast (replaces Snackbar)", CHOSEN.

- **API:** `const toast = useToast(); toast.show({ message, tone, duration })`.
  `tone`: `'neutral' | 'success' | 'error'`, required at every call site. `duration` defaults to
  3000. `toast.hide()`. A new toast replaces the visible one (no queue), as each Snackbar host
  behaves today.
- **Placement in the tree:** `ToastProvider` sits inside `PaperProvider` and wraps
  `DatabaseBootstrapGate` / `AuthProvider`, so every context (including `TimeTrackingProvider`)
  can call it. The host renders through Paper's `Portal` with `zIndex: 2000`, above
  `BottomSheet`'s 1000. Paper's portal layer is a sibling of the app tree, so a host rendered
  in-tree would sit under every sheet.
- **Anatomy:** min height 56, radius 18, ink fill, `shadows.toast`, padding 8 4 8 16, gap 12.
  - Status disc, 24dp: `success` fill with a white `checkmark` 14 (success); `errorBg` fill with an
    `error`-coloured `alert` glyph 14 (error); no disc for neutral.
  - Message: `textToast` white, `flex: 1`, wraps and never truncates.
  - "Dismiss": 44 tall, padding 0 12, white 14/800, underlined (17:1), label "Dismiss message".
- **Position:** absolute, left and right 24. Its bottom sits `max(insets.bottom, 8) + 8` above the
  bottom of the screen, plus the **registered obstruction**: `LockedBottomTabBar` reports its
  measured height via `useToastObstruction(height)` while its navigator is focused, and clears it
  on blur and unmount. Toasts on tab screens therefore sit above the bar and the Record ring; on
  pushed screens they sit above the home indicator. When the keyboard is up, the toast sits 8
  above it.
- **Motion:** in `quick` (200ms), translateY 16→0 and opacity 0→1 with `easing.enter`; out with
  opacity over `fade`. At `still`: opacity only.
- **Accessibility:** neutral and success use `accessibilityLiveRegion="polite"` (Android) and
  `AccessibilityInfo.announceForAccessibility(message)` (iOS). Error uses
  `accessibilityRole="alert"` and `accessibilityLiveRegion="assertive"`. The toast never takes
  focus.
- **Migration (copy and timing unchanged):**

| Host | Duration | Notes |
|---|---|---|
| `LoginScreen` | 4000 | Error tone. The Login PR then moves server errors inline (`red-login-s-error-server`). |
| `ForgotPasswordScreen` | 4000 | Error tone. The Login PR moves it inline too. |
| `ProfileScreen` | 4000 | Tone per message ("…successfully" → success; "Failed…" → error) |
| `HomeScreen` + `TimeTrackingContext` | 3000 | The context's `snackbarMessage` / `snackbarVisible` / `setSnackbarVisible` state goes; `showSnackbar` calls `toast.show`. The auto clock-out message is neutral, "Failed to clock in…" is error. |
| `TimeTrackingScreen`, `TimeEntriesListScreen` (×2), `SyncStatusScreen`, `SessionHistoryScreen`, `AssessmentHistoryScreen`, `AddChildScreen`, `EditChildScreen`, `CreateClassScreen`, `EditClassScreen`, `LiteracySessionForm` | 3000 | Tone per message |

  A root host also outlives navigation, so a "saved" toast fired just before `goBack()` stays
  visible. Today the Snackbar unmounts with its screen.

### 7. Motion and reduced-motion contract (ROADMAP §5; Session complete uses it first)

`src/context/MotionContext.js` (new): `MotionProvider` at the root (beside `ToastProvider`), and
`useMotion()`, which returns `{ motionLevel, reduceMotion, deviceTier }`.

- **`reduceMotion`:** `AccessibilityInfo.isReduceMotionEnabled()` at mount, kept current by the
  `reduceMotionChanged` listener. Covers iOS Reduce Motion and Android "Remove animations".
- **`deviceTier`:** a pure `getDeviceTier({ platform, totalMemory })` in `src/utils/deviceTier.js`,
  fed from `expo-device` (already a dependency), computed once.
  - iOS → `'standard'`.
  - Android with `totalMemory` below **3 GiB** reported (phones sold as 2–3 GB) → `'low'`.
  - Android with `totalMemory` unknown → `'low'` (fail calm).
  - Otherwise `'standard'`.
- **`motionLevel`:** `'still'` if `reduceMotion`, else `'calm'` if `deviceTier === 'low'`, else
  `'full'`.

| Motion class | `full` | `calm` (low-end) | `still` (OS reduce motion) |
|---|---|---|---|
| Celebration (confetti, earned-segment sweep, staged sequences, haptic beat) | as designed | **none**: final state in one `fade` (150ms) | **none**: final state in one `fade` |
| Transitions (sheet rise, toast slide, card enter) | as specified | as specified | opacity `fade` only, no translation |
| Ambient loops (syncing glyph rotation) | yes | yes | static glyph |
| Functional OS spinners (`ActivityIndicator`) | yes | yes | yes (OS-owned) |

- Every animation uses `useNativeDriver: true` except SVG props (the board's one 300ms path), stops
  on unmount, and never blocks input. Session complete's Done is live from 0ms.
- `useMotion()` accepts a test override via `MotionProvider value`, so screen tests can pin a level
  without mocking `AccessibilityInfo`.
- Home's `HeroSyncIndicator` (`SyncIndicator.js:21-35`) reads `useMotion()` instead of its own
  `isReduceMotionEnabled` call (reconciliation). Same behaviour, and it gains the change listener.

### 8. Suspended sign-in copy (ROADMAP §5)

A banned EA sees Supabase's raw "User is banned" in a purple-action Snackbar
(`LoginScreen.js:35`: `setError(error.message || 'Failed to sign in')`).

- New pure `describeSignInError(error)` in `src/utils/authErrorCopy.js`:
  - If `error.code === 'user_banned'`, or the message matches `/user is banned/i` (older SDK
    shapes), it returns **"Your access is paused. Please contact your supervisor."** "Supervisor"
    is the app's existing term (`NoActiveProgrammeNotice`, `useSessionLaunchGuard`); ROADMAP's
    "coordinator" was an example.
  - Otherwise it returns `error.message || 'Failed to sign in'` (unchanged).
- `LoginScreen` uses it. In this PR it shows as an error toast (ink, no purple). After the Login PR
  it shows in the inline error note above Sign in.
- The signed-in suspension path (silent sign-out at the next refresh, ROADMAP §0) is unchanged and
  out of scope.

### 9. Screens with no board: shared look only

Each gets: the `ScreenHeader` (title copy unchanged), the theme, `typeRoles` in place of every raw
`fontSize`/`fontWeight`, `tints`/tokens in place of every raw hex, the toast in place of its
Snackbar, and these primitive swaps: `<Button mode="contained">` → `BrandButton primary`,
`outlined` → `secondary`, `text` → `tertiary`, outlined with an error colour → `destructiveQuiet`;
Paper `Card` → `SurfaceCard`; `TextInput` + `HelperText` → `TextField`; `Searchbar` →
`SearchField`; `SegmentedButtons` → `SegmentedControl`. **No layout change** beyond these.

| Screen | Specific changes |
|---|---|
| `TimeTrackingScreen` ("Time Tracking") | 4 cards → `SurfaceCard`. "Clock In" → `primary`. "Clock Out" (today `buttonColor={colors.emphasis}`, white on red500 4.30:1) → `secondary`, matching Home's quieter clock-out. The work-history link → `secondary`. Spinner `primary`. |
| `TimeEntriesListScreen` ("Work History") | Entry card → `SurfaceCard`. "Today" chip → `StatusBadge neutral`. "Unsynced" chip (amber border on `accent + '10'`) → `StatusBadge warning`. Section headers → `SectionHeader`. 2 toasts. |
| `InsightsScreen` ("Insights", tab root) | Header with the sync pill. The in-content `SectionHeader` "Insights" duplicates the header: the title goes, and the subtitle stays as a `textParagraph` Muted line. The insight cards become a `ListGroup` of `ListRow`s with a settings-tile lead (ink glyph, **not** red: today the glyph is `colors.primary`). |
| `SessionCountRankingScreen`, `LetterMasteryRankingScreen`, `AssessmentRankingScreen` | `StatBar` restyle (shared). `AssessmentRankingScreen`'s `SegmentedButtons` → `SegmentedControl role="radio"`. `RankedBarRow` and `LetterMasteryRankingScreen` import the yellow band from `scoreBands.js` instead of repeating `'#FFBB00'`. Bar colours are data and stay. |
| `AssessmentsScreen` ("Assessments", tab root) | Header with the sync pill. The duplicate `SectionHeader` title goes; the subtitle stays as a line. Cards → `SurfaceCard`; their 3 buttons → `primary` / `primary` / `secondary` at `md`. `NoActiveProgrammeNotice` → `EmptyState`. |
| `AssessmentChildSelectScreen` ("Select Child") | `Searchbar` → `SearchField`. Language picker via the restyled `SelectSheet`. |
| `LetterAssessmentScreen`, `SequentialAssessmentScreen` (no header) | Buttons → `BrandButton`. Sequential's Correct/Incorrect (today `buttonColor` `success` with white text, **3.16:1, fails**, and `error`) → filled `successText` (white 5.15:1) and `destructive` (6.54:1), both `lg`, labels unchanged. `CaptureHeader`, `CountdownTimer` and the grids: tokens and type only. |
| `AssessmentResultsScreen` (no header), `AssessmentDetailScreen` | Local `StatCard` → `SurfaceCard` + `displayStat`. Score-band colours unchanged (data). Buttons → `secondary` "Try Again" + `primary` "Done". |
| `AssessmentHistoryScreen`, `SessionHistoryScreen` | Cards → `ListGroup` rows with a `textData` time column. `IconButton` keeps its glyph and becomes `RoundIconButton` when it stands alone. Toast. |
| `ChildResultsScreen` ("Child Results") | Card → `SurfaceCard`; buttons → `secondary` + `primary`. |
| `LetterTrackerScreen` | Tokens and type only (the panel is shared with Record's tracker sheet). |
| `AddChildScreen`, `EditChildScreen`, `CreateClassScreen`, `EditClassScreen` | Remove the duplicate `SectionHeader` titles ("Add New Child", "Edit Child", "Create New Class", "Edit Class"). Form card → `SurfaceCard`. `TextInput`/`HelperText` → `TextField`. Pickers → `FieldButton` + `SelectSheet`. `ChipSelector` → `ToggleChip`s. "Save Changes" / "Add Child" / "Create Class" → `primary lg`. "Delete Child" / "Delete Class" → `destructiveQuiet lg`. `EditChildScreen`'s `primary`-bordered option boxes → ink selection. Toast. |
| `ClassOnboardingScreen` ("Set Up Your Class"), `ChildOnboardingScreen` ("Add Your Children") | Cards → `SurfaceCard`; buttons → `primary` / `secondary`. `ChildOnboarding` keeps no back button and no gesture. |
| `SyncStatusScreen` ("Sync Status") | 5 cards and the failed-item cards → `SurfaceCard`. "Sync now" and "Apply" → `primary md`; "Retry" → `secondary md`. The summary icon keeps `describeSyncState` colours. Toast. |
| `SessionsScreen` (unrouted; exercised only by `sessionLaunchGuard.test.js`) | Mechanical token/type sweep so the guards pass. File an issue to delete it and move its hook tests to `LockedBottomTabBar`. |
| `LoadingScreen`, `HandleOpenError`, `App.js` `ErrorBoundary` | Legacy `typography` → `typeRoles` (§2.2). Buttons → `BrandButton`; "Share Error Logs" → `secondary`. `ErrorBoundary`'s raw sizes and `'#FFFFFF'` → roles and tokens. Copy unchanged. |
| Sheets: `GroupPickerBottomSheet`, `LetterTrackerBottomSheet`, `LastAttemptedBottomSheet` | Inherit the `BottomSheet` restyle. Inner buttons → `BrandButton`; `IconButton`s keep their glyphs. Group colour swatches are data (`groupColors.js`) and stay. |

`ProfileGearButton` and `SessionsTodayGauge` have no importers. Delete them (and the gauge's test)
rather than sweep them.

**Board screens in this PR** (`LoginScreen`, `ForgotPasswordScreen`, `ChildrenListScreen`,
`ClassDetailScreen`, `SessionFormScreen`, `LiteracySessionForm`, `SessionCompleteScreen`,
`ProfileScreen`, `SignOutSheets`, `ChildSelector`):
- They receive the theme, the header, the toast, the `primary` retune and the `fontWeight` sweep
  (a mechanical weight-to-face swap).
- Their raw `fontSize`s and Paper `TextInput` / `Searchbar` / `List` / `FAB` / `Banner` / `Menu`
  uses stay on the guard's ratchet list until their PR.
- One interim fix: `ClassDetailScreen`'s FAB gets `color={colors.onDark}`, so it is white on red600
  instead of `red700` on red.

### 10. Guard tests (fail-closed)

1. **`__tests__/designSystemGuard.test.js`** (new). A static scan of `App.js` and `src/**/*.js`,
   with comments stripped:
   - No `fontWeight` anywhere outside `src/constants/typography.js`, with one named exception:
     `src/theme/navigationTheme.js` may set `fontWeight: 'normal'` on its `fonts` entries (React
     Navigation's theme type requires the key), and each of those entries' `fontFamily` must be a
     `fontFamilies` face. The test asserts both. (Overview §8 R7.) A second named exception:
     `src/theme/paperTheme.js` may contain `fontWeight: undefined` (and no other `fontWeight`
     value), because Paper's `configureFonts` merges each variant over the MD3 defaults, so omitting
     the key keeps weight 400/500. (Overview §8 R11.)
   - No string-literal `fontFamily` outside `typography.js` (must reference `fontFamilies` or
     `typeRoles`).
   - No raw numeric `fontSize`, `lineHeight` or `letterSpacing` outside `typography.js`, except a
     **ratchet list** of the 10 board-screen files with their exact current counts. The test fails
     if any count rises, and also if a listed file reaches zero but is still listed. Each screen PR
     must delete its line.
   - No hex, `rgb(` or `rgba(` literal outside `src/constants/**` and `src/utils/scoreBands.js`.
     **No allowlist.**
   - No `Snackbar` import from `react-native-paper`. **No allowlist.**
   - No `TextInput`, `Searchbar`, `SegmentedButtons`, `Card`, `Chip`, `FAB`, `Banner` or `Menu`
     import from `react-native-paper` outside the same ratchet list.
2. **`__tests__/paperTheme.test.js`** (new):
   - Every key of `MD3LightTheme.colors`, including each `elevation.level*`, is present in the
     theme, and none equals its MD3 default (except `level0 = 'transparent'`).
   - Every colour value is a `colors` or `tints` value.
   - Every `fonts` variant has a `fontFamilies` face and `fontWeight === undefined`.
   - `roundness === 6`.
   - The navigation theme has no `DefaultTheme` colour left.
3. **`__tests__/colors.test.js`** (update): pins `primary` `#C81F3E`, `primaryDark` `#A4182F` and
   `placeholder` `#76696B`, the exact `tints` set and values, `spacing.ms` / `spacing.ml`,
   `borderRadius.pill`, and the six new shadows.
4. **`__tests__/contrast.test.js`** (new): computes the WCAG ratio for the declared text pairs in
   §2.1 (≥ 4.5) and graphic pairs (≥ 3). It fails if a token change breaks one, for example
   lightening `successText`.
5. **`__tests__/typography.test.js`** (update):
   - The new roles are pinned.
   - The legacy `typography` export is gone.
   - No role has `fontWeight`.
   - The `fontSize` floor is 11.
   - Every role with the Bricolage face is at least 18.

### 11. Tests (behaviour, through public surfaces)

- `BrandButton`: each variant and surface renders its label. A press fires `onPress`.
  Disabled and loading ignore presses and expose `disabled` / `busy`. Loading keeps the label (or
  shows `loadingLabel`).
- `TextField`: the label is the accessible name. Tapping the box focuses the input. An `error`
  renders a role-alert note and changes the accessible name. The secure toggle switches between
  "Show password" and "Hide password". Disabled is not editable.
- `SearchField`: clear appears with text and empties it.
- `SegmentedControl`: radio and tab roles, the selected state, and a press calls `onChange`.
- `ToggleChip`: checkbox role and `checked`.
- `ScreenHeader` through `AppNavigator` (rewrite `AppNavigator.headers.test.js`, which asserts
  `headerTitleAlign: 'center'` today):
  - Every routed stack screen renders the custom header with a left-aligned title,
    `accessibilityRole="header"`, and a "Back" button that calls `goBack`.
  - `SessionForm` shows "Close". `ChildOnboarding` shows no button.
  - Tab roots show the sync pill, which navigates to `SyncStatus`.
  - The hairline appears only after an `onScroll` with y > 0.
- `LockedBottomTabBar` / `BottomTabIcon` (update existing): the focused destination shows the pill
  (no `tab-active-indicator` dot), roles and labels are unchanged, and Record still opens the D8
  sheet when clocked out.
- `SyncIndicator` default: the glyph, words and label for all five states.
  `SyncIndicator.hero.test.js` stays green.
- `SyncBanner`: per-state copy. "Sync now" calls `syncNow`; "Review" navigates. Hidden when synced.
- Toast:
  - `useToast().show` renders the message. It auto-hides after its duration (fake timers).
    Dismiss hides it. A second `show` replaces the first.
  - Error tone has `accessibilityRole="alert"`.
  - With the tab bar registered, the toast's bottom offset includes the bar height.
  - A toast shown from inside an open `BottomSheet` renders above it.
  - A toast shown before navigation survives the screen unmounting.
- Snackbar migration: each of the 14 hosts' existing tests that assert snackbar text keep passing,
  rendered with `ToastProvider` (one shared `renderWithProviders` helper). Assert one success and
  one error tone per screen family.
- `TimeTrackingContext`: the auto clock-out shows "Auto clocked out after 10 hours." as a toast
  while Home is mounted, with no Home-local Snackbar.
- Motion:
  - `getDeviceTier`: each rule above, and the 3 GiB boundary on both sides.
  - `MotionProvider`: `reduceMotionChanged` switches `motionLevel` to `still` and back.
  - `BottomSheet` at `still` renders without a translate animation.
- Suspended copy (`LoginScreen` test): `signIn` resolving
  `{ error: { code: 'user_banned', message: 'User is banned' } }` shows "Your access is paused.
  Please contact your supervisor." and never "User is banned". Another error still shows its
  message. Unit tests for `describeSignInError`.
- Theme: a Paper `Snackbar`, `Chip selected`, `SegmentedButtons` and `Card` rendered under the
  theme resolve to the expected token colours (spot checks beside the static theme test).

### 12. Device checks (EAS preview build of this PR)

On iPhone, and on Android (A03s at 360dp, plus a 411dp phone), against `RedSystemSheet` and the
flow boards:

1. **No purple anywhere:**
   - a toast with Dismiss (Login wrong password, and the suspended account);
   - a focused input; selected chips; Insights' segmented control; the Class detail FAB;
   - the search bars; the session form's menu; any card; the Reset password back button.
2. Fonts: Figtree and Bricolage on every screen of the flow, including Paper text (spot check
   `bodySmall` captions and button labels). No system-font fallback on Android where a weight
   used to be set.
3. Tab bar: five slots, the 60dp Record ring is not clipped, the active pill, the label sizes, and
   the bottom inset on a gesture-nav phone and a 3-button-nav phone.
4. Headers:
   - left-aligned title, 44 back button;
   - a long title (any Class detail with a long name) wraps to two lines;
   - the hairline appears on scroll;
   - no grey flash on push and pop;
   - swipe-back (iOS) and hardware back (Android).
5. Status bar: dark icons on every canvas screen, light on Home, and correct after leaving Home
   from Profile and from a sheet.
6. Toast placement: above the tab bar on Home (trigger the auto clock-out or clock-in messages),
   above the home indicator on Profile, above the keyboard on Add child, and above an open sheet.
7. Sheets: the rise animation, the scrim colour and the title face; Android back dismisses.
8. Motion:
   - with iOS Reduce Motion and Android "Remove animations" on, sheets fade without sliding and the
     syncing glyph is still;
   - the A03s reports its tier: log it on first launch;
   - record the reported `totalMemory` of each test phone in the build log.
9. Large text at 1.3 and the largest system size, at 360dp:
   - buttons, fields, banners, toast and header titles wrap and grow; nothing truncates or clips;
   - the 44dp targets stay separate.
10. Every no-board screen in §9, once, at 360×640: compare with today's layout. Only colour, type,
    radius, header and button style changed.

### 13. Documentation in the same branch

- `documentation/design-system.md`: the new `primary`, `tints`, the role table, the theme mapping,
  the primitives, the motion contract and the guards. Remove the "Typography has almost no
  adoption" open-work note.
- `documentation/ROADMAP.md` §5: close "Replace the 14 screen-local Snackbar hosts", "Roll
  typography tokens out", "Add a deviceTier/reduced-motion contract" and "Suspended sign-in copy".
  Narrow "Bold Red for the rest of the app" to the per-screen PRs.
- `documentation/build-log.md`: work, review findings, verification and device results.
- `PRD.md`: no change (no product behaviour change).

### 14. Out of scope

- Per-screen layouts that have boards (their own sections and PRs).
- Converting the 22 native `Alert.alert` calls to sheets. They are OS-styled and cannot leak
  purple; the memory note prefers sheets, but that is per-screen design work.
- Sentence-casing existing titles and button labels ("Session History", "Save Changes"). Copy
  stays unchanged here; the boards' sentence case arrives with each board.
- Status colours that use brand red for mid accuracy (`ChildResultsScreen.js:27`,
  `AssessmentResultsScreen.js:12`, `AssessmentChildSelectScreen.js:122`) disagree with ADR-0003
  (red = `needs_work`). That is data semantics; file it as its own issue.
- The splash screen (`app.config.js` white background). Haptics (a Session complete proposal).

### Builder's calls

1. **Retune `colors.primary` to red600** rather than add a parallel `action` token. Nearly all 93 uses
   are action-red cases, and one token keeps Paper's `primary` and the app's `primary` the same
   thing. The 2 graphic uses move to `colors.red500`. *(my call)*
2. Load `Figtree_600SemiBold`; skip 400 (placeholders use the input's 500). *(my call)*
3. Keep the board's ink20 field and secondary-button borders (1.52:1) despite WCAG 1.4.11, because
   the inside label and the white box identify the control. The contrast test records the pair as
   a known exception, so it cannot get worse. *(my call)*
4. Toasts always show "Dismiss" (the board draws it on every toast; today only 3 hosts had it).
   There is no queue: the newest replaces the current one. *(my call)*
5. The low-end threshold is 3 GiB reported RAM on Android, and unknown counts as low. *(my call;
   see the question below)*
6. Sheets gain the board's rise animation (they appear instantly today). *(my call)*
7. Tab labels and header titles cap at 1.3× font scale; everything else scales freely. *(my call)*
8. `TimeTrackingScreen`'s "Clock Out" becomes `secondary`, not red, to match Home. Sequential
   assessment's green "Correct" fill becomes `successText`, which passes contrast. *(my call)*
9. Delete the dead `ProfileGearButton` and `SessionsTodayGauge`. Sweep the dead `SessionsScreen`
   and file its deletion. *(my call)*
10. The tab-root sync pill uses the Children board's "glyph + count" treatment (chosen there) over
    the system sheet's long-text pill. *(my call)*
11. The suspended copy says "supervisor", the app's existing word, not ROADMAP's "coordinator".
    *(my call)*

### Questions for Jim

1. **Which phones count as "low-end" for the still Session complete?** My default is Android phones
   with under 3 GB of RAM, so 4 GB phones such as many Galaxy A-series models get the full
   animation. If most of the field fleet is 4 GB or less and you would rather every budget phone
   get the still version, the threshold becomes 4 GB. The animation is cheap
   (transform/opacity on the native driver), so I lean to 3 GB plus a frame check on the A03s.
