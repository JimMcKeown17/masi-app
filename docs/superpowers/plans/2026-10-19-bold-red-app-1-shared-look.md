# Bold Red App, PR 1: Shared Look Implementation Plan

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time; Claude reviews each task's diff and tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every screen of the Masi field app onto Bold Red at once: retuned tokens and tints, Figtree 600, a fully mapped Paper and React Navigation theme, the shared primitives, a navigator-rendered screen header, the restyled tab bar, one actor-scoped root toast in place of all 14 Snackbar hosts, the motion contract, Masi auth-error copy, the no-board sweep, dead-file deletions, and fail-closed guard tests.

**Architecture:** Tokens (`src/constants/colors.js`, `typography.js`, `motion.js`) feed two themes (`src/theme/`), which feed small presentational primitives in `src/components/common/`. Two root providers sit outside `PaperProvider`: `MotionProvider` (one reduced-motion/device-tier decision) and `ToastProvider` (state plus a host rendered as a later native sibling of the whole Paper tree, so it draws above every Paper portal). `ToastActorScope` binds signed-in publishers to the current EA handle. The navigators render `ScreenHeader` through their `header` option. A static guard test (`designSystemGuard.test.js`) enforces the token rules; a temporary `PENDING_SWEEP` list shrinks task by task and is deleted at the end; a permanent `BOARD_RATCHET` list holds the 10 board files until their own PRs. No schema, RLS, payload or outbox change.

**Tech Stack:** React Native 0.81.5 / Expo SDK 54, react-native-paper 5.14.5, @react-navigation 7 (native-stack, bottom-tabs), react-native-safe-area-context 5, expo-device 8, expo-font 14, `@expo-google-fonts/figtree@0.4.1` and `@expo-google-fonts/bricolage-grotesque@0.4.1` (already installed), Jest 29 + @testing-library/react-native 13.3.3.

**Spec:** the overview `docs/superpowers/specs/2026-10-18-bold-red-app-design.md` ("System decisions" §1–§5 are authoritative; §6 Jim's answers and §8 review rounds override the parts) and this PR's part `docs/superpowers/specs/2026-10-18-bold-red-app-1-shared-look.md`. Where the part and the overview disagree, the overview wins. Read both before any task. Visual source: the Design Round 4 canvas boards (`RedSystemSheet`, `red-*-components`, `red-flow-*`).

## Global Constraints

- Branch `feat/bold-red-app`, stacked on `origin/main`. It already carries the spec, the ROADMAP entry and the Login assets (commits `63cb00e`, `8768e98`, `ff0606b`). Never push without Jim.
- **Commits are run by the orchestrator**, not Codex (the Codex sandbox usually cannot commit). Each task's last step lists the exact files to stage and the subject line. Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never `git stash`, never commit unrelated files.
- In commands, `jest` means `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest`, and `integration` means `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration --`. Integration tests are the files listed in `jest.integration.config.js` `testMatch`.
- **The suite stays green after every task.** Each task runs its own tests, the guard test (from Task 4 on), and every existing test file that imports a file it changed (`grep -rln "<module path>" __tests__`).
- TDD: behaviour gets a failing test first. Pure restyles assert structure, tokens and accessibility through `@testing-library/react-native` (`StyleSheet.flatten` on the host element, roles, labels). No snapshot tests.
- **Never change behaviour the spec does not approve.** Copy is unchanged except: sentence case for header titles and button labels (C19, same words; proper nouns such as Head Office and EGRA keep their capitals), the curly apostrophe in `syncStatusPresenter.js` (C18), the header titles in Task 19, and the auth error copy (Task 8). Validation messages, alert text, field labels and accessibility labels keep their wording unless a task says otherwise.
- No schema, RLS, payload, outbox or repository change. `documentation/rls-sync-contract-map.md` is not touched.
- **No new packages.** Stay on npm and `package-lock.json`. Every font face comes from the two installed font packages.
- `src/assessment-questions/**` (WelaPLUS, `.ts`/`.tsx`, own tokens) is excluded from the guard and from every sweep. Do not edit it.
- **Android font rule:** a custom family is chosen per weight; `fontWeight` is never set anywhere outside `src/constants/typography.js` (two named exceptions in `src/theme/`, Task 3). Weight→face mapping for the sweep: `'400'`/`'500'`/`'normal'` → `fontFamilies.textMedium`; `'600'` → `fontFamilies.textSemi`; `'700'`/`'bold'` → `fontFamilies.textBold`; `'800'`/`'900'` → `fontFamilies.textHeavy`. If the text's Paper `variant` resolves to a Bricolage role (`display*`, `headline*`, `titleLarge`), delete the `fontWeight` without adding a family.
- **Sweep recipe** (every no-board file, Tasks 20–28): replace raw `fontSize`/`lineHeight`/`letterSpacing`/`fontWeight` with the nearest `typeRoles` role of equal weight (never below 11; raw 12 text becomes 13/18 `textCaption`, the board floor); replace raw hex with tokens (`'#FFFFFF'` → `colors.onDark` on coloured fills, `colors.surface` for white backgrounds); replace `fontFamily: 'monospace'` with `typeRoles.textData`; swap primitives per part 1 §9 (`<Button mode="contained">` → `BrandButton variant="primary"`, `outlined` → `secondary`, `text` → `tertiary`, outlined with an error colour → `destructiveQuiet`; Paper `Card` → `SurfaceCard`, `Card.Actions` → a right-aligned row of `BrandButton size="md"` with gap 8; `TextInput`+`HelperText` → `TextField`; picker inputs → `SelectField`; `Searchbar` → `SearchField`; `SegmentedButtons` → `SegmentedControl`); replace the screen's Snackbar with `useToast()` (copy and duration unchanged); text uses of `colors.emphasis` → `colors.primary` (fills, bars and swatches keep `emphasis`, C13); wire `useHeaderHairline()` to the screen's root `ScrollView`/`FlatList` (`onScroll` plus `scrollEventThrottle={16}`); then delete the file from `PENDING_SWEEP`. **No layout change** beyond these swaps.
- Existing tests: update only assertions on changed copy (sentence case), on removed Paper props, or on a Snackbar now rendered as a toast. Never delete a behaviour assertion; port it. A component that starts calling `useToast()` throws without a `ToastProvider`, so every test that renders it (directly or through a parent) switches to `renderWithProviders` / `AllProviders` (Task 6) in the same task, and the commit stages those test files too.
- Every 44dp touch target and every component height in the spec is a **minimum** (`minHeight`), never a fixed `height`, so large text grows instead of clipping. Header titles, toasts, notes and buttons wrap; nothing in this PR sets `numberOfLines` on user copy except where a task says so.
- Standing docs ship in this branch (Task 32): `documentation/design-system.md`, `documentation/build-log.md` (append Verification Register rows; record decisions and dead ends), `documentation/ROADMAP.md` §5. `CONTEXT.md` and `PRD.md` do not change (no domain term or product behaviour changes).

## Review Focus

1. **A late toast from a signed-out EA.** The clock-out result arrives after an awaited refresh, after the EA has signed out or switched accounts. Expected: nothing appears on Login or over the next EA; a toast on screen at sign-out disappears. Pinned in Task 6 (held publisher across unmount and across a second scope).
2. **A toast and a bottom sheet open together, in either order.** Expected: the toast draws above the sheet and Dismiss stays tappable. Pinned in Task 6 (the host is the last child of the provider root, after the whole Paper subtree, and Dismiss fires while a sheet is open) and the device rows in Task 34.
3. **The keyboard is up on a form when a toast fires.** Expected: the toast sits 8dp above the keyboard, not under it. Pinned in Task 6 (a `keyboardDidShow` event moves the toast's `bottom`).
4. **The largest font size at 360dp.** Expected: header titles wrap to two lines and never truncate, tab labels cap at 1.3, buttons grow. Pinned in Task 19 (title has no `numberOfLines`, `maxFontSizeMultiplier` 1.3) and Task 9 (`minHeight`, never `height`).
5. **A sheet dismissed and reopened inside its 250ms exit animation.** Expected: it reopens fully interactive, and during the exit its content is hidden from screen readers and ignores touches. Pinned in Task 14.

---

### Task 1: Colour, spacing, radius and shadow tokens

**Files:**
- Modify: `src/constants/colors.js`
- Modify: `src/utils/sessionGoalPresentation.js:13`
- Modify: `src/screens/insights/SessionCountRankingScreen.js:62`
- Modify: `__tests__/colors.test.js`, `__tests__/sessionGaugeGeometry.test.js`
- Create: `__tests__/contrast.test.js`

**Interfaces:**
- Produces: `colors.primary = '#C81F3E'`, `colors.primaryDark = '#A4182F'`, `colors.placeholder = '#76696B'`, `colors.successText = '#2B7524'`, new `colors.fieldEdge = '#858182'`, new `colors.shadowWarm = '#3A2424'`; new export `tints` (13 keys below); `spacing.ms = 12`, `spacing.ml = 20`; `borderRadius.pill = 999`; new `shadows.primaryButton`, `onRedButton`, `fab`, `toast`, `sheet`, `nav`.

- [ ] **Step 0: Baseline.** Confirm `git branch --show-current` is `feat/bold-red-app` and `git status` is clean. Run `jest` and `integration` once; record the suite/test counts for the build log (Task 32).

- [ ] **Step 1: Write the failing tests.**

In `__tests__/colors.test.js`:
- `primary` → `'#C81F3E'`, `primaryDark` → `'#A4182F'`; add `expect(colors.placeholder).toBe('#76696B')`, `expect(colors.fieldEdge).toBe('#858182')`, `expect(colors.shadowWarm).toBe('#3A2424')`; `successText` → `'#2B7524'`.
- `REQUIRED_KEYS` gains exactly `'fieldEdge'` and `'shadowWarm'`.
- `APPROVED` gains exactly `'#858182'` and `'#3a2424'`, and `'#2e7d27'` is replaced by `'#2b7524'`. Nothing else is loosened.
- Spacing/radius: `{ xs: 4, sm: 8, ms: 12, md: 16, ml: 20, lg: 24, xl: 32, xxl: 48 }` and `{ sm: 9, md: 14, lg: 18, xl: 22, pill: 999 }`.
- The `shadows` `toEqual` gains the six new entries (values in Step 3), and `card`/`elevated` keep their values.
- New test:

```js
it('pins the derived tints, each an approved hex plus a two-digit alpha', () => {
  expect(tints).toEqual({
    rule: '#221A1B1F', control: '#221A1B33', pressed: '#221A1B0F',
    onRedTile: '#FFFFFF24', onRedHalo: '#FFFFFF52', onRedKeyline: '#FFFFFFB8',
    onRedOutline: '#FFFFFFD9', onRedDisabled: '#FFFFFF61',
    warningEdge: '#B26A004D', warningControl: '#B26A0061',
    avatarEdge: '#A4182F2E', spinnerTrack: '#76696B47', scrim: '#1C15177A',
  });
  Object.entries(tints).forEach(([name, value]) => {
    expect({ name, ok: /^#[0-9A-F]{8}$/i.test(value) && APPROVED.has(value.slice(0, 7).toLowerCase()) })
      .toEqual({ name, ok: true });
  });
});
```
(Hoist `APPROVED` to module scope so both tests use it.)

In `__tests__/sessionGaugeGeometry.test.js`, every `colors.primary` becomes `colors.red500` (the gauge stays Red 500).

Create `__tests__/contrast.test.js`. It computes the WCAG 2.1 ratio at full precision (never rounded) from token names:

```js
import { colors } from '../src/constants/colors';

const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, where]
const TEXT_PAIRS = [
  ['onDark', 'primary', 'primary buttons, FAB'], ['primary', 'surface', 'tertiary links, C13 text'],
  ['primary', 'background', 'active tab, links on canvas'], ['primary', 'red50', 'active tab label in its pill'],
  ['red50', 'red600', 'captions on red'], ['onDark', 'red700', 'hero disc'], ['red700', 'red50', 'avatar, FAB icon'],
  ['text', 'background', 'body on canvas'], ['text', 'surface', 'body on white'], ['onDark', 'text', 'toast, selected chip'],
  ['textSecondary', 'surface', 'muted on white'], ['textSecondary', 'background', 'muted on canvas'],
  ['placeholder', 'surface', 'placeholder'], ['warningText', 'warningBg', 'badges, D8 note'],
  ['error', 'errorBg', 'error note'], ['error', 'surface', 'destructiveQuiet'], ['onDark', 'error', 'destructive'],
  ['successText', 'successBg', 'Synced badge'], ['successText', 'surface', 'taught tile text'],
  ['onDark', 'successText', 'Sequential Correct'],
];
const GRAPHIC_PAIRS = [
  ['success', 'surface', 'synced cloud'], ['onDark', 'success', 'toast check disc'],
  ['fieldEdge', 'surface', 'field edge on white'], ['fieldEdge', 'background', 'field edge on canvas'],
  ['warning', 'surface', 'amber glyph'], ['warning', 'warningBg', 'D8 glyph'],
];

test.each(TEXT_PAIRS)('%s on %s (%s) passes 4.5:1 text contrast', (fg, bg) => {
  expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
});
test.each(GRAPHIC_PAIRS)('%s on %s (%s) passes 3:1 graphic contrast', (fg, bg) => {
  expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
});
test('red500 stays graphic-only: it is not the action red and fails text contrast with white', () => {
  expect(colors.primary).not.toBe(colors.red500);
  expect(contrast(colors.onDark, colors.red500)).toBeLessThan(4.5);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `jest __tests__/colors.test.js __tests__/contrast.test.js __tests__/sessionGaugeGeometry.test.js`. Expected: FAIL (old `primary`, missing `tints`, `successText` 4.4986:1 on `successBg`).

- [ ] **Step 3: Implement in `src/constants/colors.js`.**
  - Add constants `SUCCESS_TEXT = '#2B7524'`, `FIELD_EDGE = '#858182'`, `SHADOW_WARM = '#3A2424'`, `SURFACE = '#FFFFFF'`. `primary: RED[600]`, `primaryDark: RED[700]`, `placeholder: MUTED`, `fieldEdge: FIELD_EDGE`, `shadowWarm: SHADOW_WARM`. Everything else unchanged (`emphasis` stays `RED[500]`).
  - `export const tints` built from the constants by string concatenation (`INK + '1F'`, `SURFACE + '24'`, `WARNING + '4D'`, `RED[700] + '2E'`, `MUTED + '47'`, `'#1C1517' + '7A'` through the existing `heroDark` constant). No hand-written 8-digit hex.
  - Shadows (shape `{ shadowColor, shadowOffset: { width: 0, height }, shadowOpacity, shadowRadius, elevation }`): `primaryButton` RED[600]/10/0.22/11/4; `onRedButton` RED[900]/8/0.22/10/4; `fab` RED[600]/10/0.28/10/8; `toast` INK/12/0.24/14/12; `sheet` SHADOW_WARM/−8/0.10/12/16; `nav` SHADOW_WARM/−8/0.06/12/8. `card` and `elevated` use `SHADOW_WARM` instead of the literal.
  - `sessionGoalPresentation.js:13`: `return colors.red500;`. `SessionCountRankingScreen.js:62`: `barColor={colors.red500}`.

- [ ] **Step 4: Run to verify they pass.** Same command, plus `jest __tests__/noLegacyHues.test.js __tests__/SessionCountRankingScreen.test.js __tests__/SegmentedSessionGauge.test.js __tests__/HomeScreen.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/constants/colors.js src/utils/sessionGoalPresentation.js src/screens/insights/SessionCountRankingScreen.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/sessionGaugeGeometry.test.js
git commit -m "feat(tokens): action red to red600, tints, field edge, shadows, contrast gate"
```

---

### Task 2: Type roles, Figtree 600, and retiring the legacy `typography` export

**Files:**
- Modify: `src/constants/typography.js`, `App.js` (`useFonts` only)
- Modify: `src/components/common/BrandButton.js` (label style only), `src/components/bootstrap/LoadingScreen.js`, `src/components/bootstrap/HandleOpenError.js`
- Modify: `__tests__/typography.test.js`

**Interfaces:**
- Produces: `fontFamilies.textSemi = 'Figtree_600SemiBold'`; every role below in `typeRoles`; the `typography` export no longer exists.

Roles to add (face / size / lineHeight / letterSpacing; no `fontWeight`; `fontVariant` only where noted):

| Role | Face | Size/LH | LS | Extra |
|---|---|---|---|---|
| `display3XL` | display | 44/46 | −1.54 | |
| `display2XL` | display | 38/42 | −1.14 | |
| `displayNumeralXL` | display | 64/64 | −1.28 | |
| `displayTitle` | display | 28/32 | −0.56 | |
| `displaySheetTitle` | display | 24/28 | −0.48 | |
| `displayHeading` | display | 18/24 | −0.27 | |
| `displayCount` | display | 20/24 | −0.4 | **plan addition:** Home clock elapsed and week-strip counts (Task 17), today `displayM` + `lineHeight: 24` |
| `textRowTitle` | textBold | 16/22 | | |
| `textBodyL` | textMedium | 16/22 | | |
| `textBodyLStrong` | textBold | 17/22 | | **plan addition:** Home gauge "/3" suffix (Task 17) |
| `textBodySemi` | textSemi | 15/20 | | |
| `textParagraph` | textMedium | 15/22 | | |
| `textInput` | textMedium | 17/22 | | |
| `textOptionSelected` | textHeavy | 17/22 | | |
| `textButtonL` | textHeavy | 17/20 | | |
| `textButtonM` | textHeavy | 16/20 | | |
| `textLink` | textHeavy | 14/20 | | |
| `textSearch` | textMedium | 16/20 | | **plan addition:** `SearchField` value (board 16/20) |
| `textMasked` | textMedium | 20/24 | 2.8 | **plan addition:** masked password value (overview §1.1 `TextField`) |
| `textSmall` | textMedium | 14/20 | | |
| `textSmallStrong` | textBold | 14/20 | | |
| `textPill` | textHeavy | 14/18 | | `fontVariant: ['tabular-nums']` |
| `textNote` | textSemi | 13/18 | | |
| `textChip` | textBold | 13/18 | | |
| `textBadge` | textHeavy | 12/16 | | `fontVariant: ['tabular-nums']` |
| `textMetaStrong` | textBold | 12/16 | | **plan addition:** Paper `labelMedium` (part 1 §3) |
| `textSectionLabel` | textHeavy | 12/16 | 0.96 | `textTransform: 'uppercase'` |
| `textNavActive` | textHeavy | 11/13 | | |
| `textNavInactive` | textSemi | 11/13 | | |
| `textNavRecord` | textBold | 11/13 | | **plan addition:** tab bar "Record" label (board Figtree 700 11/13) |
| `textMicroStrong` | textBold | 11/14 | | **plan addition:** Paper `labelSmall` (part 1 §3) |
| `textLetter` | textBold | 20/24 | | |
| `textDay` | textSemi | 16/20 | | |
| `textData` | textBold | 15/20 | | `fontVariant: ['tabular-nums']` |

The eight Home roles (`displayXL`, `displayNumeral`, `displayM`, `textBody`, `textBodyStrong`, `textCaption`, `textLabel`, `textButton`) are unchanged. The "plan addition" roles exist because the guard forbids raw sizes outside `typography.js`, and each one carries a value a board or Home already uses.

- [ ] **Step 1: Write the failing tests** in `__tests__/typography.test.js`. Delete the whole `'Masi typography tokens'` describe and the `'the legacy roles are untouched'` test (they pin the retired export; overview §2.2). Add:

```js
import * as typographyModule from '../src/constants/typography';

test('the legacy typography export is retired', () => {
  expect(typographyModule.typography).toBeUndefined();
});
test('Figtree 600 is a named face', () => {
  expect(fontFamilies.textSemi).toBe('Figtree_600SemiBold');
});
test('Bricolage only at 18px and above', () => {
  for (const [name, role] of Object.entries(typeRoles)) {
    if (role.fontFamily === fontFamilies.display) expect({ name, size: role.fontSize >= 18 }).toEqual({ name, size: true });
  }
});
test.each([
  ['displayTitle', 'BricolageGrotesque_800ExtraBold', 28, 32, -0.56],
  ['displaySheetTitle', 'BricolageGrotesque_800ExtraBold', 24, 28, -0.48],
  ['textBodySemi', 'Figtree_600SemiBold', 15, 20, undefined],
  ['textNote', 'Figtree_600SemiBold', 13, 18, undefined],
  ['textSectionLabel', 'Figtree_800ExtraBold', 12, 16, 0.96],
  ['textNavInactive', 'Figtree_600SemiBold', 11, 13, undefined],
  ['textData', 'Figtree_700Bold', 15, 20, undefined],
])('%s is pinned', (name, family, size, lineHeight, letterSpacing) => {
  expect(typeRoles[name]).toEqual(expect.objectContaining({ fontFamily: family, fontSize: size, lineHeight }));
  expect(typeRoles[name].letterSpacing).toBe(letterSpacing);
});
```
Keep the existing "every role uses a weight-specific face, never sets fontWeight, size ≥ 11, lineHeight ≥ size" test; it now covers the new roles. Also add one `test.each` row per remaining role in the table so the whole table is pinned.

- [ ] **Step 2: Run to verify it fails.** `jest __tests__/typography.test.js`. Expected: FAIL (`typography` still exported, roles missing).

- [ ] **Step 3: Implement.**
  - `typography.js`: delete the `typography` export and its `colors` import; add `textSemi`; add the roles.
  - `App.js`: import `Figtree_600SemiBold` and add it to `useFonts`.
  - `BrandButton.js`: label style `...typeRoles.textButtonL` (the full rewrite is Task 9).
  - `LoadingScreen.js` and `HandleOpenError.js`: titles `displaySheetTitle`, bodies `textParagraph`, captions `textCaption`, colours from tokens; their raw `fontSize` goes; button labels sentence case ("Share error logs", "Try again" and so on); `HandleOpenError`'s share button becomes `BrandButton variant="secondary"` (it renders `BrandButton` already; Task 9 adds the variant, so pass `variant="secondary"` now, and it is ignored until Task 9). Copy otherwise unchanged.

- [ ] **Step 4: Run to verify it passes.** `jest __tests__/typography.test.js __tests__/BrandButton.test.js __tests__/DatabaseBootstrapGate.test.js __tests__/App.plan5.test.js`, plus any test importing `LoadingScreen` or `HandleOpenError` (`grep -rln "LoadingScreen\|HandleOpenError" __tests__`). Expected: PASS. `grep -rn "typography'" src App.js | grep -v typeRoles` shows no importer of the removed export.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/constants/typography.js App.js src/components/common/BrandButton.js src/components/bootstrap/LoadingScreen.js src/components/bootstrap/HandleOpenError.js __tests__/typography.test.js <any updated bootstrap test>
git commit -m "feat(type): Bold Red type roles, Figtree 600, retire legacy typography"
```

---

### Task 3: Paper theme, navigation theme, root status bar, `ErrorBoundary`

**Files:**
- Create: `src/theme/paperTheme.js`, `src/theme/navigationTheme.js`
- Modify: `App.js` (delete the inline `theme`; import `paperTheme`; `<StatusBar style="dark" />`; sweep `ErrorBoundary`), `src/navigation/AppNavigator.js` (`<NavigationContainer theme={navigationTheme}>` only)
- Create: `__tests__/paperTheme.test.js`

**Interfaces:**
- Produces: `export const paperTheme` (an MD3 theme), `export const navigationTheme` (a React Navigation theme).

- [ ] **Step 1: Write the failing test** `__tests__/paperTheme.test.js`:

```js
import { MD3LightTheme } from 'react-native-paper';
import { DefaultTheme } from '@react-navigation/native';
import { paperTheme } from '../src/theme/paperTheme';
import { navigationTheme } from '../src/theme/navigationTheme';
import { colors, tints } from '../src/constants/colors';
import { fontFamilies } from '../src/constants/typography';

const TOKEN_VALUES = new Set([...Object.values(colors), ...Object.values(tints), 'transparent']);
const FACES = new Set(Object.values(fontFamilies));

test('every MD3 colour role is overridden with a token', () => {
  const { elevation: mdElevation, ...mdFlat } = MD3LightTheme.colors;
  const { elevation, ...flat } = paperTheme.colors;
  Object.keys(mdFlat).forEach((key) => {
    // MD3's on-colour roles are already pure white (#FFFFFF = colors.onDark), so "changed"
    // is required only where the MD3 default is not itself a token value.
    const changed = flat[key] !== mdFlat[key] || TOKEN_VALUES.has(mdFlat[key]);
    expect({ key, set: key in flat, changed, token: TOKEN_VALUES.has(flat[key]) })
      .toEqual({ key, set: true, changed: true, token: true });
  });
  expect(elevation.level0).toBe('transparent');
  ['level1', 'level2', 'level3', 'level4', 'level5'].forEach((level) => {
    expect(elevation[level]).toBe(colors.surface);
    expect(elevation[level]).not.toBe(mdElevation[level]);
  });
  expect(flat.success).toBe(colors.success);
});
test('the roles that leaked purple or amber map to the board', () => {
  expect(paperTheme.colors).toEqual(expect.objectContaining({
    primary: colors.primary, onPrimary: colors.onDark,
    primaryContainer: colors.red50, onPrimaryContainer: colors.red700,
    secondary: colors.text, secondaryContainer: colors.text, onSecondaryContainer: colors.onDark,
    tertiary: colors.warningText, onSurfaceVariant: colors.textSecondary,
    outline: tints.control, inverseSurface: colors.text, inverseOnSurface: colors.onDark, inversePrimary: colors.onDark,
    shadow: colors.shadowWarm, scrim: colors.heroDark, backdrop: tints.scrim,
  }));
});
test('every font variant, default included, has a Masi face, fontWeight undefined and board tracking', () => {
  // configureFonts merges each variant over MD3's typescale, so an omitted key keeps
  // MD3's weight ('400') or tracking (e.g. 0.25): both must be set explicitly.
  Object.entries(paperTheme.fonts).forEach(([variant, font]) => {
    expect({ variant, face: FACES.has(font.fontFamily), weight: font.fontWeight, hasWeightKey: 'fontWeight' in font })
      .toEqual({ variant, face: true, weight: undefined, hasWeightKey: true });
  });
  expect(paperTheme.fonts.bodyMedium.letterSpacing).toBe(0);
  expect(paperTheme.fonts.default.letterSpacing).toBe(0);
  expect(paperTheme.fonts.headlineMedium.letterSpacing).toBe(-0.56);
});
test('roundness is 6', () => { expect(paperTheme.roundness).toBe(6); });
test('the navigation theme replaces every DefaultTheme colour and uses Figtree faces', () => {
  Object.keys(DefaultTheme.colors).forEach((key) => {
    expect(navigationTheme.colors[key]).not.toBe(DefaultTheme.colors[key]);
  });
  expect(navigationTheme.colors).toEqual({
    primary: colors.primary, background: colors.background, card: colors.background,
    text: colors.text, border: colors.border, notification: colors.primary,
  });
  expect(navigationTheme.fonts).toEqual({
    regular: { fontFamily: fontFamilies.textMedium, fontWeight: 'normal' },
    medium: { fontFamily: fontFamilies.textSemi, fontWeight: 'normal' },
    bold: { fontFamily: fontFamilies.textBold, fontWeight: 'normal' },
    heavy: { fontFamily: fontFamilies.textHeavy, fontWeight: 'normal' },
  });
});
```
Also add two render spot checks under `<PaperProvider theme={paperTheme}>`: a Paper `Card testID="c"` whose flattened `backgroundColor` is `colors.surface`, and a visible Paper `Snackbar testID="s"` whose wrapper `backgroundColor` is `colors.text` (find the host element by `testID`; if Paper puts the colour on a child, assert on the nearest element that carries `backgroundColor`).

- [ ] **Step 2: Run to verify it fails.** `jest __tests__/paperTheme.test.js`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**
  - `paperTheme.js`: `{ ...MD3LightTheme, roundness: 6, colors: { ...every role per part 1 §3 table... }, fonts: configureFonts({ config: { …16 variants… } }) }`. Variant → role: `displayLarge` `display3XL`, `displayMedium` `display2XL`, `displaySmall` and `headlineLarge` `displayXL`, `headlineMedium` `displayTitle`, `headlineSmall` `displaySheetTitle`, `titleLarge` `displayM`, `titleMedium` `textRowTitle`, `titleSmall` `textSmallStrong`, `labelLarge` `textButton`, `labelMedium` `textMetaStrong`, `labelSmall` `textMicroStrong`, `bodyLarge` `textBodyL`, `bodyMedium` `textBody`, `bodySmall` `textCaption`. Each entry is `{ ...typeRoles.X, letterSpacing: typeRoles.X.letterSpacing ?? 0, fontWeight: undefined }`, and `default: { fontFamily: fontFamilies.textMedium, letterSpacing: 0, fontWeight: undefined }` (without the explicit `default` weight, every variant-less Paper `Text` would keep MD3's `'400'` and fall back to the system font on Android). The colour table from part 1 §3 (with `surfaceVariant: colors.background`, `surfaceDisabled: colors.border`, `onSurfaceDisabled: colors.disabled`, `outlineVariant: colors.border`, `error`/`onError`/`errorContainer`/`onErrorContainer` = `error`/`onDark`/`errorBg`/`error`, `tertiaryContainer`/`onTertiaryContainer` = `warningBg`/`warningText`, `onTertiary`/`onSecondary` = `onDark`, `background`/`onBackground`, `surface`/`onSurface`), `elevation: { level0: 'transparent', level1…level5: colors.surface }`, `success: colors.success`. No literal colour.
  - `navigationTheme.js`: `{ dark: false, colors: {…as tested}, fonts: {…as tested} }`.
  - `App.js`: `<PaperProvider theme={paperTheme}>`; root `<StatusBar style="dark" />`. `ErrorBoundary`: the "!" glyph uses `typeRoles.display2XL` + `colors.primary`, the title `displaySheetTitle` + `colors.text`, the message `textParagraph` + `colors.textSecondary`; the button label becomes "Try again". No raw size, weight or hex left in `App.js`.
  - `AppNavigator.js`: pass `theme={navigationTheme}`.

- [ ] **Step 4: Run to verify it passes.** `jest __tests__/paperTheme.test.js __tests__/App.plan5.test.js __tests__/AppNavigator.headers.test.js __tests__/MainTabNavigator.test.js`, plus any test asserting "Try Again" in the boundary (`grep -rln "Try Again" __tests__`). Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/theme/paperTheme.js src/theme/navigationTheme.js App.js src/navigation/AppNavigator.js __tests__/paperTheme.test.js <updated tests>
git commit -m "feat(theme): map every MD3 and navigation colour and font to Bold Red tokens"
```

---

### Task 4: The design-system guard (with a shrinking `PENDING_SWEEP`)

**Files:**
- Create: `__tests__/designSystemGuard.test.js`

**Interfaces:**
- Produces: `PENDING_SWEEP` (an array of repo-relative paths, temporary; each later task deletes its lines; Task 31 deletes the mechanism) and `BOARD_RATCHET` (an object `{ path: { rawType, paperImports } }`, permanent in this PR; later PRs delete their own lines).

- [ ] **Step 1: Write the guard.** It is an algorithm, so the code is given:

```js
global.__MASI_NO_DEFAULT_HANDLE__ = true;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const walk = (dir, acc = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (!rel(full).startsWith('src/assessment-questions')) walk(full, acc); }
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
};
const FILES = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'App.js')].map(rel);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (f) => strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const TYPOGRAPHY = 'src/constants/typography.js';
const NAV_THEME = 'src/theme/navigationTheme.js';
const PAPER_THEME = 'src/theme/paperTheme.js';
const RATCHETED_PAPER = ['TextInput', 'Searchbar', 'SegmentedButtons', 'Card', 'Chip', 'FAB', 'Banner', 'Menu', 'Button', 'HelperText'];

// Files the sweep has not reached yet. Every task that sweeps a file deletes its line.
// Task 31 deletes this list and every reference to it.
const PENDING_SWEEP = [ /* filled in Step 2 */ ];

// The 10 board files keep their raw type sizes and Paper inputs until their own PR.
// A count may fall but never rise; a line whose file is clean must be deleted.
const BOARD_RATCHET = {
  'src/screens/auth/LoginScreen.js': { rawType: 0, paperImports: ['TextInput', 'Button'] },
  'src/screens/auth/ForgotPasswordScreen.js': { rawType: 0, paperImports: ['TextInput', 'Button'] },
  'src/screens/main/ChildrenListScreen.js': { rawType: 2, paperImports: ['Searchbar', 'Button', 'Card', 'Banner'] },
  'src/screens/children/ClassDetailScreen.js': { rawType: 5, paperImports: ['Card', 'FAB', 'Button'] },
  'src/screens/sessions/SessionFormScreen.js': { rawType: 0, paperImports: ['Button'] },
  'src/screens/sessions/LiteracySessionForm.js': { rawType: 0, paperImports: ['TextInput', 'Button', 'Card', 'Menu'] },
  'src/screens/sessions/SessionCompleteScreen.js': { rawType: 2, paperImports: ['Button'] },
  'src/screens/main/ProfileScreen.js': { rawType: 2, paperImports: ['TextInput', 'Button', 'Card', 'SegmentedButtons'] },
  'src/components/profile/SignOutSheets.js': { rawType: 5, paperImports: [] },
  'src/components/children/ChildSelector.js': { rawType: 0, paperImports: ['Searchbar'] },
};

const rawTypeCount = (s) => (s.match(/\b(fontSize|lineHeight|letterSpacing)\s*:\s*-?\d/g) || []).length;
const paperImports = (s) => [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native-paper['"]/g)]
  .flatMap((m) => m[1].split(',').map((t) => t.trim().split(/\s+as\s+/)[0]).filter(Boolean));
const hexLiterals = (s) => s.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [];

const violations = (f) => {
  const s = source(f);
  const v = [];
  if (f !== TYPOGRAPHY) {
    const weights = s.match(/\bfontWeight\s*:\s*[^,}\n]+/g) || [];
    const allowed = f === NAV_THEME ? /fontWeight\s*:\s*'normal'/ : f === PAPER_THEME ? /fontWeight\s*:\s*undefined/ : null;
    weights.filter((w) => !(allowed && allowed.test(w))).forEach((w) => v.push(`fontWeight: ${w}`));
    if (/fontFamily\s*:\s*['"`]/.test(s)) v.push('string-literal fontFamily');
  }
  const ratchet = BOARD_RATCHET[f];
  if (f !== TYPOGRAPHY && rawTypeCount(s) > (ratchet ? ratchet.rawType : 0)) v.push(`raw type values: ${rawTypeCount(s)}`);
  if (!f.startsWith('src/constants/') && f !== 'src/utils/scoreBands.js' && hexLiterals(s).length) v.push(`colour literals: ${hexLiterals(s).join(' ')}`);
  const imports = paperImports(s);
  if (imports.includes('Snackbar')) v.push('Snackbar import');
  imports.filter((i) => RATCHETED_PAPER.includes(i) && !(ratchet && ratchet.paperImports.includes(i)))
    .forEach((i) => v.push(`Paper ${i} import`));
  return v;
};

describe('design-system guard', () => {
  test.each(FILES.filter((f) => !PENDING_SWEEP.includes(f)))('%s follows the token rules', (f) => {
    expect(violations(f)).toEqual([]);
  });
  test.each(PENDING_SWEEP)('%s is still pending (delete its PENDING_SWEEP line once swept)', (f) => {
    expect(FILES).toContain(f);
    expect(violations(f).length).toBeGreaterThan(0);
  });
  test.each(Object.keys(BOARD_RATCHET))('%s ratchet line is still needed', (f) => {
    expect(FILES).toContain(f);
    const s = source(f);
    const stillUsed = rawTypeCount(s) > 0 || paperImports(s).some((i) => BOARD_RATCHET[f].paperImports.includes(i));
    expect(stillUsed).toBe(true);
  });
  test('the theme exceptions hold', () => {
    const nav = source(NAV_THEME);
    expect(nav.match(/fontFamily\s*:\s*fontFamilies\.\w+/g)).toHaveLength(4);
    // Every fontWeight in the Paper theme must be exactly `undefined` (Codex plan review F1:
    // a negative lookahead after `\s*` backtracks and matches `fontWeight: undefined`).
    const weights = [...source(PAPER_THEME).matchAll(/fontWeight\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every((w) => w === 'undefined')).toBe(true);
  });
  test('the paper-theme weight rule accepts undefined and rejects real weights (fixtures)', () => {
    const check = (src) => [...src.matchAll(/fontWeight\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim()).every((w) => w === 'undefined');
    expect(check('{ fontWeight: undefined, a: 1 }')).toBe(true);
    expect(check('{ fontWeight:   undefined }')).toBe(true);
    expect(check("{ fontWeight: '400' }")).toBe(false);
    expect(check('{ fontWeight: "bold" }')).toBe(false);
  });
});
```

- [ ] **Step 2: Fill `PENDING_SWEEP`.** Temporarily log every file with violations (`FILES.filter((f) => violations(f).length)`), paste that exact list, then remove the log. Cross-check: after Tasks 1–3 it must be exactly these 60 files (if it differs, find out why before going on):
  `src/components/assessment/{AssessmentDetailGrid,AssessmentInstructions,AssessmentTimer,EndAssessmentButton,LastAttemptedBottomSheet,LetterMasteryPanel,LetterTile}.js`; `src/components/children/{ChildSelector,GroupPickerBottomSheet}.js`; `src/components/common/{BottomSheet,BrandButton,NoActiveProgrammeNotice,SelectSheet,SyncIndicator,SyncStatusBanner}.js`; `src/components/dashboard/{RankedBarRow,StatBar}.js`; `src/components/forms/ChipSelector.js`; `src/components/home/{HomeClockRow,SegmentedSessionGauge,WeekStrip}.js`; `src/components/navigation/LockedBottomTabBar.js`; `src/components/profile/SignOutSheets.js`; `src/components/session/{LetterGrid,LetterTrackerBottomSheet}.js`; `src/components/sessions/{ClockInBeforeSessionSheet,SessionsTodayGauge,SessionsTodayRing}.js`; `src/navigation/HeaderBackButton.js`; `src/screens/assessments/{AssessmentChildSelectScreen,AssessmentDetailScreen,AssessmentHistoryScreen,AssessmentResultsScreen,ChildResultsScreen,LetterAssessmentScreen,LetterTrackerScreen,SequentialAssessmentScreen}.js`; `src/screens/auth/{ForgotPasswordScreen,LoginScreen}.js`; `src/screens/children/{AddChildScreen,ClassDetailScreen,CreateClassScreen,EditChildScreen,EditClassScreen}.js`; `src/screens/insights/{AssessmentRankingScreen,LetterMasteryRankingScreen,SessionCountRankingScreen}.js`; `src/screens/main/{AssessmentsScreen,ChildrenListScreen,HomeScreen,InsightsScreen,ProfileScreen,SessionsScreen,SyncStatusScreen,TimeEntriesListScreen,TimeTrackingScreen}.js`; `src/screens/onboarding/{ChildOnboardingScreen,ClassOnboardingScreen}.js`; `src/screens/sessions/{LiteracySessionForm,SessionHistoryScreen}.js`.
  Also confirm each `BOARD_RATCHET` `rawType` equals `rawTypeCount` of that file today (expected values as written). If one differs, use the measured value and note it for the build log.

- [ ] **Step 3: Run it.** `jest __tests__/designSystemGuard.test.js`. Expected: PASS (every non-pending file clean; every pending file still has a violation; every ratchet line needed).

- [ ] **Step 4: Commit (orchestrator).**
```bash
git add __tests__/designSystemGuard.test.js
git commit -m "test(design): fail-closed design-system guard with board ratchet and sweep list"
```

From here on every task runs `jest __tests__/designSystemGuard.test.js` and deletes the `PENDING_SWEEP` lines of the files it finishes.

---

### Task 5: The motion contract

**Files:**
- Create: `src/constants/motion.js`, `src/utils/deviceTier.js`, `src/context/MotionContext.js`
- Modify: `App.js` (wrap the tree in `MotionProvider`, inside `SafeAreaProvider`), `src/components/common/SyncIndicator.js` (`HeroSyncIndicator` only)
- Create: `__tests__/deviceTier.test.js`, `__tests__/MotionContext.test.js`
- Modify: `__tests__/SyncIndicator.hero.test.js`

**Interfaces:**
- Produces:
  - `export const duration = { fade: 150, quick: 200, base: 250, sweep: 300 }`; `export const easing = { enter: Easing.bezier(0.2, 0.8, 0.2, 1), sweep: Easing.out(Easing.cubic) }`.
  - `export const TIER_HIGH = 'high', TIER_LOW = 'low', TIER_STATIC = 'static'`; `export function classifyTier({ platform, deviceYearClass, totalMemory, reduceMotion = false } = {}): 'high'|'low'|'static'`; `export function motionLevelForTier(tier): 'full'|'calm'|'still'`.
  - `export function MotionProvider({ value, children })`; `export function useMotion(): { tier, reduceMotion, motionLevel }`; `export const DEFAULT_MOTION = { tier: 'high', reduceMotion: false, motionLevel: 'full' }` (returned when there is no provider, so component tests need no wrapper).

`classifyTier` is ported from `~/Development/zazi-izandi-app/src/utils/deviceTier.js` without the letter fields. The rules, in order (GiB = 1024³ bytes; `expo-device` reports RAM below nominal, so a "3 GB" phone reads under 3 GiB):
1. `reduceMotion` → `static`.
2. `platform === 'ios'` → `high`.
3. `totalMemory` known (a number > 0) and `< 1.5 GiB` → `static`.
4. `deviceYearClass` known (a number > 0) and `< 2019` → `low`.
5. `totalMemory` known and `< 3 GiB` → `low`.
6. Neither signal known → `low`.
7. Otherwise `high`.

- [ ] **Step 1: Write the failing tests.**

`__tests__/deviceTier.test.js`:
```js
import { classifyTier, motionLevelForTier } from '../src/utils/deviceTier';
const GIB = 1024 ** 3;
test.each([
  [{ platform: 'android', totalMemory: 2.9 * GIB, deviceYearClass: 2021, reduceMotion: true }, 'static'],
  [{ platform: 'ios', totalMemory: 1 * GIB }, 'high'],
  [{ platform: 'android', totalMemory: 1.49 * GIB, deviceYearClass: 2022 }, 'static'],
  [{ platform: 'android', totalMemory: 1.5 * GIB, deviceYearClass: 2022 }, 'low'],
  [{ platform: 'android', totalMemory: 6 * GIB, deviceYearClass: 2018 }, 'low'],
  [{ platform: 'android', totalMemory: 3 * GIB - 1, deviceYearClass: 2022 }, 'low'],
  [{ platform: 'android', totalMemory: 3 * GIB, deviceYearClass: 2022 }, 'high'],
  [{ platform: 'android' }, 'low'],
  [{ platform: 'android', deviceYearClass: 2022 }, 'high'],
  [{ platform: 'android', totalMemory: 4 * GIB, deviceYearClass: null }, 'high'],
])('classifyTier(%o) is %s', (signals, tier) => {
  expect(classifyTier(signals)).toBe(tier);
});
test('levels map static→still, low→calm, high→full', () => {
  expect(['static', 'low', 'high'].map(motionLevelForTier)).toEqual(['still', 'calm', 'full']);
});
```

`__tests__/MotionContext.test.js` (mock `expo-device` with `{ totalMemory: 6 * 1024 ** 3, deviceYearClass: 2022 }`, set `Platform.OS = 'android'` with `jest.replaceProperty`, spy `AccessibilityInfo.isReduceMotionEnabled` resolving `false` and `AccessibilityInfo.addEventListener` capturing the `reduceMotionChanged` handler):
- `renders full, then still when reduceMotionChanged fires true, and full again when it fires false` (a probe component renders `useMotion().motionLevel`).
- `an explicit value overrides detection`: `<MotionProvider value={{ tier: 'low', reduceMotion: false, motionLevel: 'calm' }}>` renders `calm` and never calls `isReduceMotionEnabled`.
- `without a provider useMotion returns DEFAULT_MOTION`.
- `logs the device tier once on mount`: `console.log` is called once with `'[motion] device tier'` and an object containing `{ platform: 'android', totalMemory: 6 * 1024 ** 3, deviceYearClass: 2022, tier: 'high' }`.

`__tests__/SyncIndicator.hero.test.js`: add `syncing under MotionProvider value still does not rotate`: render the hero variant in the syncing state inside `<MotionProvider value={{ tier: 'static', reduceMotion: true, motionLevel: 'still' }}>`; the wrapper around the glyph has no `transform`. The existing rows stay green.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/deviceTier.test.js __tests__/MotionContext.test.js __tests__/SyncIndicator.hero.test.js`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.** `MotionProvider` (no `value`): `reduceMotion` from `AccessibilityInfo.isReduceMotionEnabled()` at mount (a rejection counts as `false`), kept current by `AccessibilityInfo.addEventListener('reduceMotionChanged', …)` and removed on unmount; `tier = classifyTier({ platform: Platform.OS, deviceYearClass: Device.deviceYearClass, totalMemory: Device.totalMemory, reduceMotion })`; `motionLevel = motionLevelForTier(tier)`; memoised value; one `console.log('[motion] device tier', { platform, totalMemory, deviceYearClass, tier })` on mount, so Profile → Export Logs shows each phone's reading. `HeroSyncIndicator` drops its own `isReduceMotionEnabled` call and reads `useMotion().reduceMotion`. `App.js`: `<SafeAreaProvider><MotionProvider>…</MotionProvider></SafeAreaProvider>`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/HomeScreen.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/constants/motion.js src/utils/deviceTier.js src/context/MotionContext.js App.js src/components/common/SyncIndicator.js __tests__/deviceTier.test.js __tests__/MotionContext.test.js __tests__/SyncIndicator.hero.test.js
git commit -m "feat(motion): one reduced-motion and device-tier contract, ported from Zazi"
```

---

### Task 6: The toast system (provider, actor scope, host, keyboard)

**Files:**
- Create: `src/hooks/useKeyboardHeight.js`, `src/context/ToastContext.js`, `src/components/common/Toast.js`, `test-support/renderWithProviders.js`
- Modify: `App.js` (`ToastProvider` around `PaperProvider`; `ToastActorScope` in `AppRoot`)
- Create: `__tests__/Toast.test.js`, `__tests__/ToastActorScope.test.js`, `__tests__/useKeyboardHeight.test.js`

**Interfaces:**
- Produces:
  - `useKeyboardHeight(): number` (0 when hidden). iOS listens to `keyboardWillShow`/`keyboardWillHide`, Android to `keyboardDidShow`/`keyboardDidHide`; height is `event.endCoordinates.height`.
  - `ToastProvider({ children })`: renders `<View testID="toast-root" style={{ flex: 1 }}>{children}<ToastHost /></View>`. Mount order in `App.js`: `ErrorBoundary > SafeAreaProvider > MotionProvider > ToastProvider > PaperProvider > …`. The host is **not** a Paper `Portal`.
  - `useToast(): { show({ message, tone, duration = 3000 }), hide() }`, stable identity. `tone` is `'neutral' | 'success' | 'error'`; a missing or unknown tone logs `console.error('Toast tone must be neutral, success or error')` and falls back to `neutral`. A new `show` replaces the visible toast (no queue). Throws `Error('useToast must be used within a ToastProvider')` outside a provider.
  - `useToastObstruction(height: number, active = true): void`: registers a bottom obstruction (tab bar, later `StickyActionFooter`) while `active && height > 0`; unregisters on change and unmount. A **no-op outside a provider** (layout only, so navigator tests need no wrapper).
  - `ToastActorScope({ handle, children })`: inside it, `useToast()` returns a publisher bound to `handle`: each `show` is dropped silently unless `handle.isCurrent()`, and is tagged `actorKey = \`${handle.userId}:${handle.epoch}\``. On mount (layout effect) it sets the host's current actor key; on unmount it resets it to `null` only if the key is still its own. Outside any scope, `useToast()` publishes with `actorKey = null`.
  - Host rules: `show` is dropped when the current key is non-null and the message's key differs; whenever the current key changes, the host clears any message whose key differs from the new key, including the one on screen. A message published before its scope's layout effect ran (current key still `null`) is kept.
  - `ToastHost` (default export of `Toast.js`): always renders a container `<View testID="toast-host" pointerEvents="box-none" style={StyleSheet.absoluteFill}>`; while a message exists it holds the card (`testID="toast"`): position absolute, `left: 24`, `right: 24`, `bottom = 8 + Math.max(insets.bottom, 8, maxObstruction, keyboardHeight)`. Anatomy: `minHeight: 56`, `borderRadius: borderRadius.lg`, `backgroundColor: colors.text`, `shadows.toast`, padding 8/4/8/16, gap 12. Status disc 24 (radius 12): success = `colors.success` fill + white `checkmark` 14; error = `colors.errorBg` fill + `colors.error` `alert` 14; neutral = none. Message `typeRoles.textBodySemi`, `colors.onDark`, `flex: 1`, wraps. Dismiss: `Pressable`, `minHeight: 44`, `paddingHorizontal: 12`, role button, label "Dismiss message", text "Dismiss" in `typeRoles.textLink` `colors.onDark` with `textDecorationLine: 'underline'`. Error: `accessibilityRole="alert"`, `accessibilityLiveRegion="assertive"`; neutral/success: `accessibilityLiveRegion="polite"` plus `AccessibilityInfo.announceForAccessibility(message)` on iOS when the message appears. Motion: in over `duration.quick` with `easing.enter` (translateY 16→0, opacity 0→1); out with opacity over `duration.fade`; at `still`, opacity only. All `useNativeDriver: true`. Auto-hide after `duration` ms.
  - `renderWithProviders(ui, { motion = DEFAULT_MOTION, insets = { top: 0, bottom: 0, left: 0, right: 0 }, ...options } = {})` and `AllProviders` (for `renderHook`'s `wrapper`): `SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets }} > MotionProvider value={motion} > ToastProvider > PaperProvider theme={paperTheme}`.

- [ ] **Step 1: Write the failing tests.**

`__tests__/Toast.test.js` (render through `renderWithProviders`; a `Publisher` test component calls `useToast()` and exposes buttons that call `show`):
- `show renders the message and auto-hides after its duration` (fake timers; `show({ message: 'Saved', tone: 'success', duration: 3000 })`; visible; `act(() => jest.advanceTimersByTime(3000))` plus the fade; gone).
- `Dismiss hides it` (press "Dismiss message").
- `a second show replaces the first` (only the second message is in the tree).
- `error tone is an assertive alert`: `getByRole('alert')` contains the message; its `accessibilityLiveRegion` is `'assertive'`.
- `a missing tone logs an error and renders neutral` (no disc, `console.error` called once).
- `the offset includes a registered obstruction`: a component calling `useToastObstruction(90)`; `StyleSheet.flatten(getByTestId('toast').props.style).bottom === 98`; after it unmounts, `bottom === 16` (insets 0 → `8 + max(0, 8, 0, 0)`).
- `the toast sits 8 above the keyboard`: emit `keyboardDidShow` with `endCoordinates.height: 300` (Android) through the `Keyboard` listener; `bottom === 308`; `keyboardDidHide` → 16.
- `the host renders after the whole Paper subtree, so it draws above an open sheet`: render a visible `BottomSheet` (title "Sheet") and a publisher; show a toast. In the host-only tree (`screen.toJSON()`), find the node whose `props.testID` is `'toast-root'` (recursive search); assert its last child has `props.testID === 'toast-host'` and its first child's subtree contains the text "Sheet". Then press "Dismiss message" while the sheet stays visible; the toast is gone and "Sheet" remains.
- `a toast shown before navigation survives the screen change`: a real `NavigationContainer` + native stack with screens `Record` and `Home`; `Record` calls `show({ message: 'Session saved', tone: 'success' })` then `navigation.replace('Home')`; after `findByText('Home screen')`, "Session saved" is still visible.
- `useToast outside a provider throws`; `useToastObstruction outside a provider does nothing`.

`__tests__/ToastActorScope.test.js` (fake handles: `const makeHandle = (userId, epoch) => { let current = true; return { userId, epoch, isCurrent: () => current, retire: () => { current = false; } }; }`; a `Holder` component inside a scope stores its `useToast()` in a ref so the test can call it later):
- `a clock-out result held across sign-out publishes nothing on Login`: render `ToastProvider > [ToastActorScope handle=A > Holder]`; rerender without the scope (signed out) and with a `LoginProbe`; `A.retire()`; call the held `show({ message: 'Clocked out. 8.00 hours worked.', tone: 'success' })`; `queryByText` is null.
- `the same across an account switch`: replace scope A with scope B (`key` changes, handle B current); the held A publisher's `show` renders nothing; B's publisher renders its message.
- `a toast on screen at sign-out is cleared`: A shows "Clocked in at 08:00"; unmount scope A; the message is gone.
- `a signed-out toast is unscoped`: outside any scope, `show({ message: 'Your access is paused. Please contact your supervisor.', tone: 'error' })` renders.
- `a message published before the scope registered is kept`: a child of the scope publishes in its own mount effect; the message is visible after mount.

`__tests__/useKeyboardHeight.test.js`: iOS uses the `Will` events, Android the `Did` events (`jest.replaceProperty(Platform, 'OS', …)`), height updates and resets to 0; listeners are removed on unmount.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/Toast.test.js __tests__/ToastActorScope.test.js __tests__/useKeyboardHeight.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the three modules and the helper to the interfaces above. `ToastActorScope` requires a `ToastProvider` (it throws like `useToast`). `App.js`: `ToastProvider` wraps `PaperProvider`; in `AppRoot` the signed-in branch becomes `<SignedInEAProvider key={…} handle={handle}><ToastActorScope handle={handle}><OfflineProvider>…</OfflineProvider></ToastActorScope></SignedInEAProvider>`. No screen uses the toast yet. Tests that render `AppRoot` without `App` (`App.plan5.test.js`, `signedInTree.test.js`, `task5ActionsBinding.test.js`, `contextRenderIsolation.test.js`; re-check with `grep -rln "AppRoot\|TimeTrackingProvider" __tests__`) wrap it in `ToastProvider` (or `AllProviders`) in this task; Task 7 makes `TimeTrackingProvider` need it too.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/App.plan5.test.js __tests__/contextRenderIsolation.test.js __tests__/useTimeTracking.plan5.test.js __tests__/BottomSheet.test.js __tests__/designSystemGuard.test.js`, and `integration __tests__/signedInTree.test.js __tests__/task5ActionsBinding.test.js __tests__/integration/accountSwitch.integration.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/hooks/useKeyboardHeight.js src/context/ToastContext.js src/components/common/Toast.js test-support/renderWithProviders.js App.js __tests__/Toast.test.js __tests__/ToastActorScope.test.js __tests__/useKeyboardHeight.test.js
git commit -m "feat(toast): actor-scoped root toast drawn above every Paper portal"
```

---

### Task 7: Toast migration, time tracking (context, Home, Time tracking)

**Files:**
- Modify: `src/context/TimeTrackingContext.js`, `src/screens/main/HomeScreen.js` (Snackbar only), `src/screens/main/TimeTrackingScreen.js` (Snackbar only)
- Modify: `__tests__/useTimeTracking.integration.test.js`, `__tests__/locationUnavailableClock.integration.test.js`, `__tests__/HomeScreen.test.js`, `__tests__/TimeTrackingScreen.test.js`, `__tests__/sessionLaunchGuard.test.js` (mock fields only)

**Interfaces:**
- Consumes: `useToast` (Task 6), `renderWithProviders`/`AllProviders` (Task 6).
- Produces: `useTimeTracking()` no longer returns `snackbarMessage`, `snackbarVisible` or `setSnackbarVisible`.

Tones (copy unchanged): **success** "Clocked in at {time}" and "Clocked out. {n} hours worked."; **error** "Failed to clock in. Please try again." and "Failed to clock out. Please try again."; **neutral** everything else (auto clock-out, "…without location…", "Return from Settings…", "Already clocked in…", "You must clock in first…", "You are not clocked in."). Duration 3000.

- [ ] **Step 1: Write the failing tests.**
  - In both integration files, the `wrapper` becomes `({ children }) => <AllProviders><TimeTrackingProvider>{children}</TimeTrackingProvider></AllProviders>`, and every `result.current.snackbarMessage` assertion becomes `await waitFor(() => expect(screen.getByText('<same string>')).toBeTruthy())` (import `screen`). The auto clock-out case also asserts the toast has no `alert` role (neutral).
  - In `useTimeTracking.integration.test.js`, the existing auto clock-out test is the spec's "auto clock-out toast while Home is mounted" case: the provider publishes it with no screen-level host, so it shows wherever the EA is. Assert it is visible within `AllProviders` with no screen rendered.
  - `__tests__/HomeScreen.test.js` and `__tests__/TimeTrackingScreen.test.js` mock `useTimeTracking`: remove the `snackbar*` fields from their mocked values (also in `sessionLaunchGuard.test.js`), and add one test each: `renders no screen-local Snackbar` (`UNSAFE_queryByType(Snackbar)` from `react-native-paper` is null; a test file may import Paper's `Snackbar`, the guard scans only `src/` and `App.js`).

- [ ] **Step 2: Run to verify they fail.** `integration __tests__/useTimeTracking.integration.test.js __tests__/locationUnavailableClock.integration.test.js`; `jest __tests__/HomeScreen.test.js __tests__/TimeTrackingScreen.test.js`. Expected: FAIL (messages are still state, not toasts).

- [ ] **Step 3: Implement.** `TimeTrackingContext`: delete the `snackbar*` state; `const toast = useToast()`; `showSnackbar` becomes `notify(message, tone)` calling `toast.show({ message, tone })`, with the tones above; drop the three fields from the returned value and the memo deps. Delete the `<Snackbar>` blocks and imports from `HomeScreen` and `TimeTrackingScreen`. Remove `src/screens/main/HomeScreen.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same commands plus `jest __tests__/designSystemGuard.test.js __tests__/sessionLaunchGuard.test.js __tests__/useTimeTracking.plan5.test.js __tests__/contextRenderIsolation.test.js __tests__/App.plan5.test.js` and `integration __tests__/signedInTree.test.js __tests__/task5ActionsBinding.test.js`. Any of these that renders `TimeTrackingProvider` without a `ToastProvider` gets the `AllProviders` wrapper. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/context/TimeTrackingContext.js src/screens/main/HomeScreen.js src/screens/main/TimeTrackingScreen.js __tests__/useTimeTracking.integration.test.js __tests__/locationUnavailableClock.integration.test.js __tests__/HomeScreen.test.js __tests__/TimeTrackingScreen.test.js __tests__/sessionLaunchGuard.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(toast): time-tracking messages publish through the root toast"
```

---

### Task 8: `describeAuthError` and the auth screens' toasts

**Files:**
- Create: `src/utils/authErrorCopy.js`
- Modify: `src/screens/auth/LoginScreen.js`, `src/screens/auth/ForgotPasswordScreen.js` (Snackbar → toast; `fontWeight` → faces; nothing else)
- Create: `__tests__/authErrorCopy.test.js`, `__tests__/LoginScreen.test.js`

**Interfaces:**
- Produces: `describeAuthError(error, action: 'sign_in' | 'reset'): string`.

Mapping (overview §1.1 and Login part "Error copy"; first match wins):

| Condition | `sign_in` | `reset` |
|---|---|---|
| `error.code === 'user_banned'`, or `error.message` matches `/user is banned/i` (older SDK shapes) | "Your access is paused. Please contact your supervisor." | (falls through to the reset fallback) |
| `error.code === 'invalid_credentials'` | "Invalid login credentials" | (fallback) |
| `isAuthRetryableFetchError(error)` (from `@supabase/supabase-js`) and `status === 0` | "Couldn’t reach Masi. Check your internet connection and try again." | same |
| `isAuthRetryableFetchError(error)` and `status >= 500` | "Masi isn’t responding right now. Please try again in a few minutes." | same |
| `error.code === 'over_request_rate_limit'` | "Too many attempts. Please wait a few minutes and try again." | same |
| `error.code === 'over_email_send_rate_limit'` | (fallback) | "Too many reset emails were requested. Please wait a while and try again." |
| anything else, including `null`/`undefined` | "Couldn’t sign in. Please try again." | "Couldn’t send the reset link. Please try again." |

`error.message` is never returned.

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/authErrorCopy.test.js`: one `test.each` row per table cell, building errors with the SDK's own classes (`new AuthApiError('User is banned', 400, 'user_banned')`, `new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')`, `new AuthRetryableFetchError('Network request failed', 0)`, `new AuthRetryableFetchError('Bad gateway', 502)`, `new AuthApiError('x', 429, 'over_request_rate_limit')`, `new AuthApiError('x', 429, 'over_email_send_rate_limit')`), plus `{ message: 'User is banned' }` (no code), `new Error('Something raw')` (never echoed), and `undefined`.
  - `__tests__/LoginScreen.test.js` (render with `renderWithProviders`; mock `useAuth` with a `signIn` jest fn):
    - `a banned EA sees the supervisor copy and never the raw message`: `signIn` resolves `{ error: { code: 'user_banned', message: 'User is banned' } }`; after pressing Sign in with a valid email and password, the toast shows "Your access is paused. Please contact your supervisor."; `queryByText('User is banned')` is null; the toast's role is `alert`.
    - `an unknown error shows the fallback, not its message`: `{ error: { message: 'boom' } }` → "Couldn’t sign in. Please try again."
    - `empty fields still show the existing validation copy as a toast`: "Please enter both email and password".

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/authErrorCopy.test.js __tests__/LoginScreen.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** `LoginScreen`: drop the `error` state and the Snackbar; validation failures call `toast.show({ message, tone: 'error', duration: 4000 })` with today's strings; a `signIn` error calls it with `describeAuthError(error, 'sign_in')`. `ForgotPasswordScreen`: the same with `describeAuthError(resetError, 'reset')` for a failed send, today's validation string for a bad email, duration 4000; its success path is unchanged. Swap the two `fontWeight: 'bold'` styles to `fontFamily: fontFamilies.textBold`. Both screens stay in `BOARD_RATCHET`; remove both from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/designSystemGuard.test.js __tests__/domainTextInputAudit.test.js __tests__/AuthContext.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/utils/authErrorCopy.js src/screens/auth/LoginScreen.js src/screens/auth/ForgotPasswordScreen.js __tests__/authErrorCopy.test.js __tests__/LoginScreen.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(auth): Masi copy for sign-in and reset errors, suspended EAs see supervisor wording"
```

---

### Task 9: `BrandButton` (the one button) and `IconCircleButton`

**Files:**
- Modify: `src/components/common/BrandButton.js` (rewrite)
- Create: `src/components/common/IconCircleButton.js`
- Modify: `__tests__/BrandButton.test.js`; Create: `__tests__/IconCircleButton.test.js`

**Interfaces:**
- Produces:
  - `BrandButton({ label, onPress, variant = 'primary', size = 'lg', surface = 'canvas', tone = 'accent', icon, loading = false, loadingLabel, disabled = false, accessibilityLabel, style, testID })`. `variant`: `'primary' | 'secondary' | 'tertiary' | 'destructive' | 'destructiveQuiet' | 'warning' | 'success'` (`success` is a **plan addition** for Sequential assessment's "Correct", which part 1 §9 fills with `successText`). `size`: `'lg' | 'md' | 'sm'` (`sm` only for `tertiary`). `surface`: `'canvas' | 'red'`. `tone` (tertiary only): `'accent' | 'ink' | 'onRed'`.
  - `IconCircleButton({ icon, onPress, accessibilityLabel, surface = 'canvas', disabled = false, testID })`.

`BrandButton` resolved spec (overview §1.1, part 1 §4):
- A `Pressable`, `hitSlop={8}`, role button, `accessibilityLabel` = `accessibilityLabel ?? (loading ? loadingLabel ?? label : label)`, `accessibilityState={{ disabled: disabled || loading, busy: loading }}`. Presses are ignored while disabled or loading.
- `lg`: `minHeight: 56`, `borderRadius: borderRadius.pill`, `alignSelf: 'stretch'` (full width by default), `paddingHorizontal: 24`, label `typeRoles.textButtonL`. `md`: `minHeight: 44`, `paddingHorizontal: 20` (18 for `secondary`, `destructiveQuiet`, `warning`), label `typeRoles.textButton`. Labels wrap; heights are minimums.
- Fills and labels (canvas): `primary` `colors.primary` fill, `colors.onDark` label, `shadows.primaryButton`; pressed `colors.primaryDark`, no shadow; disabled `colors.border` fill, `colors.disabled` label, no shadow. `secondary` `colors.surface` fill, 1.5 `tints.control` border, `colors.text` label; pressed `colors.background` fill. `destructive` `colors.error` fill, `colors.onDark` label. `destructiveQuiet` `colors.surface` fill, 1.5 `tints.control` border, `colors.error` label; pressed `colors.background`. `warning` `colors.warningBg` fill, 1.5 `tints.warningControl` border, `colors.warningText` label in `typeRoles.textButtonM`, leading `warning-outline` 18 in `colors.warning` (the D8 sheet only). `success` `colors.successText` fill, `colors.onDark` label (5.72:1). `destructive`, `warning` and `success` have no darker token, so pressed is the scale only.
- On red (`surface="red"`): `primary` `colors.surface` fill, `colors.primary` label, `shadows.onRedButton`; pressed `colors.red50` fill + `colors.red700` label; disabled `tints.onRedDisabled` fill + `colors.red700` label. `secondary` transparent, 1.5 `tints.onRedOutline` border, `colors.onDark` label; pressed `tints.onRedTile` fill.
- `tertiary`: no fill, `minHeight: 44`, `paddingHorizontal: 2`, `alignSelf: 'flex-start'`. `tone="accent"`: `colors.primary` `textButton` (`size="sm"` → `textLink`), pressed `colors.primaryDark`. `tone="ink"`: `colors.text` `textButtonM`, `alignSelf: 'stretch'`, centred. `tone="onRed"`: `colors.onDark` `textButton`, `textDecorationLine: 'underline'`.
- Pressed on any variant also applies `transform: [{ scale: 0.98 }]` unless `useMotion().reduceMotion`.
- `icon` sits 8 before the label: 20dp at `lg`, 18dp at `md`/`sm`, in the label colour (except `warning`).
- Loading keeps the fill (never dims) and shows an `ActivityIndicator size={18}` (`colors.onDark` on `primary`-canvas and `destructive`; otherwise the label colour) 8 before `loadingLabel ?? label`.
- `style` is applied last (existing callers pass `style`).

`IconCircleButton`: `width/height 44`, radius 22, 22dp Ionicons glyph; canvas = `colors.surface` fill + 1.5 `tints.control` border + `colors.text` glyph; red = `colors.red700` fill + `colors.onDark` glyph; disabled = `tints.rule` border + `colors.disabled` glyph, presses ignored. Role button; `accessibilityLabel` is required (`console.error` when missing).

- [ ] **Step 1: Write the failing tests.** In `__tests__/BrandButton.test.js` keep the "renders a solid accessible primary CTA" test (it now asserts `minHeight` ≥ 56 and `backgroundColor === colors.primary`); replace "shows loading state without label text" with `loading keeps the fill and shows the loading label, and ignores presses` (`loadingLabel="Saving…"` visible, `busy: true`, `onPress` not called, fill still `colors.primary`). Add `test.each` rows for each variant × surface (canvas: primary, secondary, tertiary accent/ink/onRed, destructive, destructiveQuiet, warning, success; red: primary, secondary) asserting the flattened fill/border and the label colour from the spec above; `md never sets a fixed height` (`height` undefined, `minHeight` 44); `pressed applies scale 0.98 unless reduceMotion` (render with `MotionProvider value={{ …, reduceMotion: true, motionLevel: 'still' }}` → no transform); `disabled exposes disabled and ignores presses`. `IconCircleButton.test.js`: canvas and red fills, the 44 size, the required label, disabled ignores presses.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/BrandButton.test.js __tests__/IconCircleButton.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** both components. Remove `src/components/common/BrandButton.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/designSystemGuard.test.js __tests__/DatabaseBootstrapGate.test.js __tests__/LoginScreen.test.js __tests__/App.plan5.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/BrandButton.js src/components/common/IconCircleButton.js __tests__/BrandButton.test.js __tests__/IconCircleButton.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(ui): one BrandButton with every board variant, plus IconCircleButton"
```

---

### Task 10: `InlineNote`, `TextField`, `SelectField`, `SearchField`

**Files:**
- Create: `src/components/common/InlineNote.js`, `TextField.js`, `SelectField.js`, `SearchField.js`
- Create: `__tests__/InlineNote.test.js`, `__tests__/TextField.test.js`, `__tests__/SelectField.test.js`, `__tests__/SearchField.test.js`

**Interfaces:**
- Produces:
  - `InlineNote({ tone = 'error', size = 'sm', live = 'polite', children })`.
  - `TextField({ label, value, onChangeText, icon, placeholder, error, disabled = false, secureTextEntry, onToggleSecure, multiline = false, surface = 'canvas', inputRef, accessibilityLabel, ...textInputProps })`.
  - `SelectField({ label, value, placeholder, icon, error, onPress, accessibilityLabel, disabled = false })`.
  - `SearchField({ value, onChangeText, placeholder, accessibilityLabel, autoFocus })`.

Specs (overview §1.1 wins over part 1 §4):
- `InlineNote`: row, `alignItems: 'flex-start'`. `sm`: radius 9, padding 8/12, gap 8, glyph 16. `md`: radius 14, padding 12/14, gap 10, glyph 18. Text `typeRoles.textNote`, `flex: 1`, wraps. Error: `colors.errorBg` fill, `colors.error` text, glyph `warning-outline` in `colors.error`, `accessibilityRole="alert"`, `accessibilityLiveRegion={live}`, and on iOS `AccessibilityInfo.announceForAccessibility(text)` when it mounts and when its text changes (not on other re-renders). Warning: `colors.warningBg` fill, `colors.warningText` text, glyph `warning` in `colors.warning`, no live region.
- `TextField`: a wrapper (`position: 'relative'`) holding an absolute halo sibling (inset −4, radius 18, `tints.pressed` fill, shown only while focused) and the box: `minHeight: 60`, radius 14, `borderWidth: 2` at all times (nothing shifts), `paddingHorizontal: 16` (`paddingRight: 4` with a trailing button). Rest border `colors.fieldEdge`; focused `colors.text`; error `colors.error` (no halo); disabled `colors.border` fill + transparent border + `colors.disabled` glyph and value. Optional leading Ionicons `icon` 22 `colors.textSecondary`, gap 12. Inside: label `typeRoles.textLabel` `colors.textSecondary` (`colors.error` on error), 2 above the value; value `typeRoles.textInput` `colors.text`, or `typeRoles.textMasked` while `secureTextEntry && value`; placeholder `colors.placeholder`. Tapping anywhere on the box focuses the input. The input's `accessibilityLabel` is `accessibilityLabel ?? label`, or `${label}, error: ${error}` when `error`. `error` renders `<InlineNote tone="error">` 8 below. `onToggleSecure` adds a 44×44 trailing button with `eye-outline`/`eye-off-outline` 22 `colors.textSecondary`, labelled "Show password" while `secureTextEntry` and "Hide password" otherwise. `multiline`: `minHeight: 112`, `paddingVertical: 12`, value `minHeight: 66`, `textAlignVertical: 'top'`. `disabled` sets `editable={false}`. It does **not** spread `NO_TEXT_SUGGESTIONS`; domain fields pass it. `surface="red"` is accepted but renders the canvas look until the Login PR.
- `SelectField`: the `TextField` box (rest edge `colors.fieldEdge`, 2dp) as a `Pressable`, role button, label `accessibilityLabel ?? \`${label}, ${value || placeholder}\``; caps label over the value (`textInput` ink) or the placeholder (`textInput` `colors.placeholder`); trailing `chevron-down` 20 `colors.textSecondary`; pressed `colors.border` fill; `error` as `TextField`.
- `SearchField`: `minHeight: 48`, radius 14, `colors.surface`, 1.5 `colors.fieldEdge` border (focused: 2 `colors.text` plus the halo), `paddingLeft: 16`, leading `search-outline` 20 (`colors.textSecondary`, `colors.text` when focused), gap 10, value `typeRoles.textSearch` ink, placeholder `colors.placeholder`. `accessibilityLabel ?? placeholder` on the input. With text, a 44×44 trailing "Clear search" button: a 22dp `colors.border` disc with a 14dp `colors.text` `close`; pressing it calls `onChangeText('')` and keeps focus. Spreads `NO_TEXT_SUGGESTIONS`.

- [ ] **Step 1: Write the failing tests** (part 1 §11):
  - `InlineNote`: error is `alert` with `polite` by default and `assertive` when `live="assertive"`; iOS announces once on mount and again only when the text changes (`announceForAccessibility` call count 1 → rerender same text → 1 → new text → 2); warning has no role; `md` radius 14.
  - `TextField`: the label is the accessible name; pressing the box focuses the input (`inputRef.current.focus` spy, or `isFocused()`); an `error` renders an `alert` note and the name becomes "Name, error: Required"; the secure toggle label switches "Show password" → "Hide password" when the parent flips `secureTextEntry`; disabled is `editable={false}`; the border width is 2 at rest, focused and in error; it does not set `autoCorrect={false}` unless passed.
  - `SelectField`: role button, combined label with value and with placeholder, press calls `onPress`.
  - `SearchField`: clear appears only with text and empties it; `autoCorrect` is `false` (spreads `NO_TEXT_SUGGESTIONS`).

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/InlineNote.test.js __tests__/TextField.test.js __tests__/SelectField.test.js __tests__/SearchField.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the four components.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/InlineNote.js src/components/common/TextField.js src/components/common/SelectField.js src/components/common/SearchField.js __tests__/InlineNote.test.js __tests__/TextField.test.js __tests__/SelectField.test.js __tests__/SearchField.test.js
git commit -m "feat(ui): InlineNote, TextField, SelectField and SearchField primitives"
```

---

### Task 11: `ToggleChip`, `ChipSelector`, `SegmentedControl`, `StatusBadge`

**Files:**
- Create: `src/components/common/ToggleChip.js`, `SegmentedControl.js`, `StatusBadge.js`
- Modify: `src/components/forms/ChipSelector.js`
- Create: `__tests__/ToggleChip.test.js`, `__tests__/SegmentedControl.test.js`, `__tests__/StatusBadge.test.js`

**Interfaces:**
- Produces: `ToggleChip({ label, selected, onPress, testID })`; `SegmentedControl({ options: Array<{ value, label }>, value, onChange, role = 'radio', accessibilityLabel })`; `StatusBadge({ label, tone })` with `tone` in `'warning' | 'success' | 'successStrong' | 'error' | 'neutral'`. `ChipSelector`'s props are unchanged.

Specs:
- `ToggleChip`: `minHeight: 36`, pill. Selected: `colors.text` fill, leading `checkmark` 16 `colors.onDark`, label `typeRoles.textLink` `colors.onDark`, padding 0/14/0/10, gap 6. Unselected: `colors.surface`, 1.5 `tints.control` border, `textLink` `colors.text`, padding 0/16. `accessibilityRole="checkbox"`, `accessibilityState={{ checked: selected }}`.
- `ChipSelector`: renders one `ToggleChip` per option, keeping its row layout, `onChange(option.value)` and the per-option `testID`.
- `SegmentedControl`: container `minHeight: 44`, pill, `colors.surface`, 1.5 `tints.control` border; each segment `flex: 1`, full height, a `Pressable`. Selected: an ink thumb inset 4.5 (margin) with `borderRadius.pill`, label `typeRoles.textButton` `colors.onDark`. Unselected: label `typeRoles.textBodyStrong` `colors.text`. `role="radio"` → container `accessibilityRole="radiogroup"`, segments `radio` + `checked`; `role="tab"` → `tablist`, segments `tab` + `selected`. Container `accessibilityLabel`. Labels wrap.
- `StatusBadge`: `minHeight: 22`, pill, `paddingHorizontal: 8`, centred, `typeRoles.textBadge`. Tones: warning `warningBg`/`warningText`; success `successBg`/`successText`; successStrong `successText` fill + `onDark`; error `errorBg`/`error`; neutral `border`/`text`. It grows with text.

- [ ] **Step 1: Write the failing tests:** `ToggleChip` checkbox role, `checked` state, selected fill `colors.text`; `SegmentedControl` radio and tab roles, the selected state per role, a press calls `onChange(value)`, the selected label colour `colors.onDark`; `StatusBadge` per-tone fill and text colour, `minHeight` 22 with no fixed `height`. Update the existing tests that select chips through `ChipSelector` (`grep -rln "ChipSelector\|accessibilityState.*selected" __tests__/AddChildScreen.test.js __tests__/EditChildScreen.test.js`) to the `checked` state.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/ToggleChip.test.js __tests__/SegmentedControl.test.js __tests__/StatusBadge.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `src/components/forms/ChipSelector.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/AddChildScreen.test.js __tests__/EditChildScreen.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/ToggleChip.js src/components/common/SegmentedControl.js src/components/common/StatusBadge.js src/components/forms/ChipSelector.js __tests__/ToggleChip.test.js __tests__/SegmentedControl.test.js __tests__/StatusBadge.test.js __tests__/designSystemGuard.test.js <updated child form tests>
git commit -m "feat(ui): ToggleChip, SegmentedControl and StatusBadge; ChipSelector renders ink chips"
```

---

### Task 12: `IconTile`, `SurfaceCard`, `EmptyState`, `NoActiveProgrammeNotice`

**Files:**
- Create: `src/components/common/IconTile.js`, `SurfaceCard.js`, `EmptyState.js`
- Modify: `src/components/common/NoActiveProgrammeNotice.js`
- Create: `__tests__/IconTile.test.js`, `__tests__/EmptyState.test.js`; Modify: `__tests__/NoActiveProgrammeNotice.test.js`

**Interfaces:**
- Produces: `IconTile({ icon, tone = 'canvas', iconSize })`; `SurfaceCard({ children, style, testID })`; `EmptyState({ title, body, footnote, action })` where `action` is `{ label, onPress }`.

Specs:
- `IconTile`: 40×40, radius 14, decorative (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`). `canvas`: `colors.background` fill, `colors.text` glyph 20. `red`: `colors.red50` fill, `colors.red700` glyph 22. `warning`: `colors.warningBg` fill, `colors.warningText` glyph 22. `iconSize` overrides the glyph size (Home's canvas tile is 22; **plan addition** so Home stays pixel-identical in Task 17).
- `SurfaceCard`: `colors.surface`, 1dp `tints.rule` border, radius 18, padding 16, no shadow.
- `EmptyState`: bare on canvas, left-aligned. Title `typeRoles.displaySheetTitle` `colors.text`, `accessibilityRole="header"`; body 8 below, `typeRoles.textParagraph` `colors.textSecondary`; optional footnote 12 below the body, `typeRoles.textCaption` `colors.textSecondary`; optional `BrandButton size="md"` 16 below. No icon or illustration.
- `NoActiveProgrammeNotice`: renders `EmptyState` with title "No active programme" and today's body copy verbatim (including `{action}`), inside a view with padding 24. The 48dp icon and the white card go.

- [ ] **Step 1: Write the failing tests:** `IconTile` per-tone fill and glyph size, and `iconSize` override; `EmptyState` title is a header, body and optional footnote and action render, action press fires; `NoActiveProgrammeNotice` keeps its title and exact body copy and has no `school-outline` icon (the Ionicons mock records names).

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/IconTile.test.js __tests__/EmptyState.test.js __tests__/NoActiveProgrammeNotice.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `src/components/common/NoActiveProgrammeNotice.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/designSystemGuard.test.js` and every test that renders `AssessmentsScreen` (`grep -rln "AssessmentsScreen" __tests__`). Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/IconTile.js src/components/common/SurfaceCard.js src/components/common/EmptyState.js src/components/common/NoActiveProgrammeNotice.js __tests__/IconTile.test.js __tests__/EmptyState.test.js __tests__/NoActiveProgrammeNotice.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(ui): IconTile, SurfaceCard and type-led EmptyState"
```

---

### Task 13: `ListGroup`, `ListRow`, `SectionHeader`, `StatBar`

**Files:**
- Create: `src/components/common/ListGroup.js`, `src/components/common/ListRow.js`
- Modify: `src/components/common/SectionHeader.js`, `src/components/dashboard/StatBar.js`
- Modify (prop rename only): the six `SectionHeader` callers, `subtitle=` → `hint=` (`AddChildScreen`, `EditChildScreen`, `CreateClassScreen`, `EditClassScreen`, `AssessmentsScreen`, `InsightsScreen`)
- Create: `__tests__/ListRow.test.js`, `__tests__/StatBar.test.js`; Modify: `__tests__/SectionHeader.test.js`

**Interfaces:**
- Produces:
  - `ListGroup({ children, style })`: `colors.surface`, 1dp `tints.rule` border, radius 18, `overflow: 'hidden'`, no shadow. It passes `showDivider={index < count - 1}` to each valid child element (`React.Children` + `cloneElement`), so there is no divider after the last row.
  - `ListRow({ title, subtitle, lead, trailing, onPress, variant = 'action', busy = false, expanded, disabled = false, showDivider = false, accessibilityLabel, accessibilityRole })`. `trailing`: `'chevron'` (`chevron-forward`), `'external'` (`open-outline`), `'share'` (`share-outline`), `'send'` (`send-outline`), `'disclosure'` (`chevron-down`, or `chevron-up` in `colors.text` when `expanded`), or a React node; glyphs 20 `colors.textSecondary`.
  - `SectionHeader({ title, hint, action, style })`, where `action` is a `BrandButton` props object rendered as `variant="tertiary"`.
  - `StatBar({ items })`, where each item is `{ label, value, color?, onPress?, accessibilityLabel? }`.

Specs:
- `ListRow` `action`: `minHeight: 64`, padding 10/16, gap 12; optional `lead` node (an `IconTile` or avatar, 40); title `typeRoles.textRowTitle` ink, wraps; subtitle `typeRoles.textCaption` Muted, 2 below; trailing as above. Pressed: `tints.pressed` fill (no scale). One `Pressable` whose role is `accessibilityRole ?? 'button'` and whose label is `accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')`. `busy`: a 20dp `ActivityIndicator` (`colors.textSecondary`) replaces the trailing glyph, and the row is disabled with `accessibilityState={{ busy: true, disabled: true }}`. `expanded` adds `accessibilityState.expanded`.
- `readOnly` (**decision:** `title` is the caps label, `subtitle` is the value): label `typeRoles.textLabel` Muted over the value `textRowTitle` ink (2 below, wraps); not pressable; one accessible element labelled "{title}, {subtitle}"; no trailing glyph.
- `nested` (Profile's support panel): `minHeight: 56`, padding 8 vertical, 68 left, 16 right, gap 12; lead is a bare 20dp ink icon in a 24-wide column; title `typeRoles.textBodyStrong`.
- Divider: an absolute 1dp `colors.border` line at the bottom, starting at 68 when there is a `lead` (`action`), 16 without, 104 for `nested`; rendered only when `showDivider`.
- `SectionHeader`: a row (`minHeight: 20`) with the title `typeRoles.textSectionLabel` `colors.textSecondary`, `accessibilityRole="header"`, `flex: 1`, and the optional `action` button with `marginVertical: -12` so its 44 target does not grow the row; the optional `hint` 4 below in `typeRoles.textCaption` Muted. `marginBottom: 12`.
- `StatBar` (Children §Stat bar): a row of `flex: 1` columns, `marginBottom: 16`; columns after the first get `paddingLeft: 16`, `borderLeftWidth: 1`, `borderLeftColor: tints.rule`; each column `minHeight: 56`, top-aligned, gap 2. Numeral `typeRoles.displayTitle` + `fontVariant: ['tabular-nums']` in `item.color ?? (item.onPress ? colors.primary : colors.text)`; label `typeRoles.textLabel` in `item.onPress ? colors.primary : colors.textSecondary`, `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.85}`. Both cap at `maxFontSizeMultiplier={1.2}`. A tappable column is a `Pressable` (role button, label `item.accessibilityLabel ?? \`View ${label}: ${value}\``) with an 18dp `chevron-forward` in `colors.primary` 2 after the numeral. No pills, no shadow.

- [ ] **Step 1: Write the failing tests:** `ListRow` combined label, role default and override, pressed fill, `busy` (spinner, disabled, presses ignored), `disclosure` glyph flips with `expanded` and exposes `expanded`, `readOnly` is one element "Email, ea@masi.org" and is not a button, divider only when `showDivider` with left 68/16/104; `ListGroup` gives the last row no divider (render three rows, assert two dividers by `testID="list-row-divider"`); `SectionHeader` header role, `hint`, an `action` button that fires, `textSectionLabel` style; `StatBar` the numeral colour rule, the chevron only on tappable items, the default label "View Unassessed: 3", the 1dp `tints.rule` divider from the second column on.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/ListRow.test.js __tests__/StatBar.test.js __tests__/SectionHeader.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement**, and rename `subtitle` → `hint` at the six callers. Remove `src/components/dashboard/StatBar.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/designSystemGuard.test.js __tests__/InsightsScreen.test.js __tests__/SessionCountRankingScreen.test.js __tests__/ChildrenListScreenRefresh.test.js __tests__/AddChildScreen.test.js __tests__/EditChildScreen.test.js __tests__/CreateClassScreen.test.js __tests__/EditClassScreen.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/ListGroup.js src/components/common/ListRow.js src/components/common/SectionHeader.js src/components/dashboard/StatBar.js src/screens/children/AddChildScreen.js src/screens/children/EditChildScreen.js src/screens/children/CreateClassScreen.js src/screens/children/EditClassScreen.js src/screens/main/AssessmentsScreen.js src/screens/main/InsightsScreen.js __tests__/ListRow.test.js __tests__/StatBar.test.js __tests__/SectionHeader.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(ui): grouped list rows, section label and the bare stat bar"
```

---

### Task 14: `BottomSheet`, `SelectSheet`, and the D8 sheet

**Files:**
- Modify: `src/components/common/BottomSheet.js`, `src/components/common/SelectSheet.js`, `src/components/sessions/ClockInBeforeSessionSheet.js`
- Modify: `__tests__/BottomSheet.test.js`, `__tests__/SelectSheet.test.js`, `__tests__/ClockInBeforeSessionSheet.test.js`

**Interfaces:**
- Consumes: `useMotion`, `duration`, `easing` (Task 5); `BrandButton`, `InlineNote`, `SearchField` (Tasks 9–10).
- Produces: unchanged props for all three components.

Specs:
- `BottomSheet` look: top radius `borderRadius.xl` (22); grabber 36×4 `tints.control`, 8 from the top; title `typeRoles.displaySheetTitle` `colors.text`, `accessibilityRole="header"`, 20 below the grabber; subtitle `typeRoles.textParagraph` Muted 6 below the title; scrim `tints.scrim`; panel `shadows.sheet`. Bottom padding stays `max(insets.bottom, 24)`; side padding, footer rule, Portal, hardware back and keyboard handling unchanged (C11 is Task 35).
- `BottomSheet` motion: on open, the scrim fades in over `duration.quick` and the panel rises from its measured height (`onLayout`; before the first layout use the window height) to 0 over `duration.base` with `easing.enter`. At `motionLevel === 'still'`, both fade over `duration.fade` with no translation. On `visible=false` it plays the reverse, then unmounts; during the exit the overlay has `pointerEvents="none"`, `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`, and the hardware-back handler is already removed. Reopening during the exit animates back in from the current values and is interactive at once. All `useNativeDriver: true`; animations stop on unmount.
- `SelectSheet`: options are flat rows, `minHeight: 56`, `paddingHorizontal: 0`, 1dp `colors.border` divider between rows (none after the last), label `typeRoles.textInput` ink; selected: `typeRoles.textOptionSelected` plus a trailing Ionicons `checkmark` 22 `colors.text`. **No red.** Each option keeps role button and `accessibilityState={{ selected }}`. The search becomes `<SearchField placeholder="Search" accessibilityLabel="Search options" …/>`. Footer: confirm `BrandButton variant="primary"` (lg), then cancel `BrandButton variant="tertiary" tone="ink"`, stacked with gap 8. The description line stays `typeRoles.textCaption` Muted.
- `ClockInBeforeSessionSheet` (D8, copy verbatim): title and subtitle from `BottomSheet`; the body starts 24 below the subtitle with gap 12: `BrandButton variant="primary"` "Clock in now" → `<InlineNote tone="warning" size="md">{SESSION_CLOCK_WARNING_COST}</InlineNote>` → `BrandButton variant="warning"` "Record without clocking in" → `BrandButton variant="tertiary" tone="ink"` "Cancel" (calls `onDismiss`).

- [ ] **Step 1: Write the failing tests.**
  - `BottomSheet.test.js` (render through `renderWithProviders`): `the title is a header in the sheet face` (`typeRoles.displaySheetTitle` family); `the scrim uses tints.scrim`; `at full the panel rises with a translate`; `at still it fades without a translate` (`MotionProvider` value `still`; the panel's flattened style has no `transform` with `translateY`); `on close the content is hidden from screen readers and ignores touches until it unmounts` (fake timers: rerender `visible={false}`; `queryByText(title)` is null by default and found with `{ includeHiddenElements: true }`; the overlay has `pointerEvents="none"`; after `jest.advanceTimersByTime(250)` it is gone even with hidden elements included); `reopening during the exit is interactive` (close, advance 100ms, reopen, then advance **past the original exit deadline** (another 300ms): the sheet is still mounted, `getByText(title)` is found without hidden elements, and the backdrop press calls `onDismiss`. This catches a stale exit-completion callback unmounting the reopened sheet; Codex plan review); `hardware back is not handled during the exit`. Keep every existing test green, **except** the obsolete diagnostic assertion at `__tests__/BottomSheet.test.js:112-118` that the panel has no `onLayout`: replace it with a behavioural test (`the measured panel height drives the rise`: fire the panel's `onLayout` with `{ nativeEvent: { layout: { height: 300 } } }` at `full`, and assert the opening translate starts from 300). Keep that test's other intent: the panel has no diagnostic side effects (no console output, no state outside the animation). (Codex plan review F3.)
  - `SelectSheet.test.js`: `the selected row is ink with a checkmark and no red` (no style in the row tree uses `colors.primary`; the selected label uses `textOptionSelected`); `the last row has no divider`; the existing search tests keep using "Search options".
  - `ClockInBeforeSessionSheet.test.js`: keep the copy assertions; add `Cancel dismisses`, `the warning note is a warning InlineNote` (warningBg fill), and `Record without clocking in uses the warning variant` (warningBg fill, `tints.warningControl` border).

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/BottomSheet.test.js __tests__/SelectSheet.test.js __tests__/ClockInBeforeSessionSheet.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove the three files from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus every test that opens a sheet (`grep -rln "BottomSheet\|SelectSheet\|ClockInBeforeSessionSheet\|GroupPicker\|LetterTracker\|LastAttempted\|SignOut" __tests__ | xargs` — run them all) and `jest __tests__/designSystemGuard.test.js`. Expected: PASS. If a test fails only because it queried a closing sheet's content with hidden elements included, fix the query, not the component.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/BottomSheet.js src/components/common/SelectSheet.js src/components/sessions/ClockInBeforeSessionSheet.js __tests__/BottomSheet.test.js __tests__/SelectSheet.test.js __tests__/ClockInBeforeSessionSheet.test.js __tests__/designSystemGuard.test.js <updated sheet tests>
git commit -m "feat(ui): Bold Red sheets with the rise animation, ink picker rows and the D8 sheet"
```

---

### Task 15: Delete the dead files (C14) and keep the launch-guard coverage

**Files:**
- Delete: `src/screens/main/SessionsScreen.js`, `src/components/sessions/SessionsTodayGauge.js`, `src/components/common/ProfileGearButton.js`
- Delete: `__tests__/sessionLaunchGuard.test.js`, `__tests__/SessionsTodayGauge.test.js`, `__tests__/profileGearA11y.test.js`
- Create: `__tests__/recordLaunchGuard.test.js` (the clock-in launch tests, ported through the tab bar)

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing imports them.** `grep -rn "SessionsScreen\|SessionsTodayGauge\|ProfileGearButton" src App.js __tests__ test-support` lists only the files being deleted.

- [ ] **Step 2: Port the guard tests first (they must pass before and after the deletion).** Create `__tests__/recordLaunchGuard.test.js` (a new file, because `LockedBottomTabBar.test.js` mocks the hook module-wide) using the **real** `useSessionLaunchGuard` (do not mock it; mock `../src/services/activeProgrammeGate` to resolve `{ hasActiveProgramme: true }` and `../src/utils/timeEntryStatus` as `sessionLaunchGuardProgramme.test.js` does), rendering `LockedBottomTabBar` with a `navigation` mock inside `renderWithProviders`:
  - `recording while clocked out shows the D8 sheet and keeps the explicit continue path` (press "Record a session"; "You are not clocked in." appears; `navigate` not called with `'SessionForm'`; press "Record without clocking in" → `navigate('SessionForm')`).
  - `the D8 sheet can send the EA to clock in` ("Clock in now" → `navigate('TimeTracking')`).
  - `an EA who is clocked in goes straight to the form` (status `CLOCKED_IN` → `navigate('SessionForm')`, no sheet).
  Run `jest __tests__/recordLaunchGuard.test.js`: PASS.

- [ ] **Step 3: Delete** the six files. Remove `src/screens/main/SessionsScreen.js` and `src/components/sessions/SessionsTodayGauge.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run.** `jest __tests__/recordLaunchGuard.test.js __tests__/LockedBottomTabBar.test.js __tests__/sessionLaunchGuardProgramme.test.js __tests__/designSystemGuard.test.js __tests__/MainTabNavigator.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add -A src/screens/main/SessionsScreen.js src/components/sessions/SessionsTodayGauge.js src/components/common/ProfileGearButton.js __tests__/sessionLaunchGuard.test.js __tests__/SessionsTodayGauge.test.js __tests__/profileGearA11y.test.js __tests__/recordLaunchGuard.test.js __tests__/designSystemGuard.test.js
git commit -m "chore: delete the unrouted Sessions screen and two orphaned components; guard tests move to the tab bar"
```

---

### Task 16: Tab bar

**Files:**
- Modify: `src/components/navigation/LockedBottomTabBar.js`, `src/components/navigation/BottomTabIcon.js`
- Modify: `__tests__/LockedBottomTabBar.test.js`, `__tests__/BottomTabIcon.test.js`

**Interfaces:**
- Consumes: `useToastObstruction` (Task 6).
- Produces: `export const FAB_OVERHANG = 24` from `LockedBottomTabBar.js` (the red disc's top edge above the destination row). `BottomTabIcon({ routeName, focused, color, size })` unchanged; `getTabIconName` unchanged.

Spec (part 1 §5.1, board `red-flow-02`):
- Bar: `colors.surface`, 1dp `colors.border` top, `shadows.nav`, `flexDirection: 'row'`, `alignItems: 'flex-start'`, `paddingHorizontal: 4`, `paddingBottom: Math.max(insets.bottom, spacing.sm)` (today's floor, so 3-button phones keep a gap). Destination row height 56.
- Destination: `flex: 1`, `minHeight: 56`, `paddingTop: 6`, gap 3, centred. Icon 24 inside a 56×30 pill (radius 15): focused pill `colors.red50` with `colors.tabActive` glyph; unfocused transparent with `colors.tabInactive`. **No dot** (`tab-active-indicator` is gone). Label `typeRoles.textNavActive` `colors.tabActive` / `typeRoles.textNavInactive` `colors.tabInactive`, `maxFontSizeMultiplier={1.3}`.
- Record: the slot is `flex: 1`, height 56. The `Pressable` ("Record a session") is absolute at `top: -(FAB_OVERHANG + 5)`, centred, containing a 70×70 ring (`colors.surface`, radius 35, `shadows.fab`) around a 60×60 `colors.primary` disc (radius 30) with a white `add` 28, then the label "Record" (`typeRoles.textNavRecord`, `colors.text`, `marginTop: -2`, so its top sits 39 below the row top), `maxFontSizeMultiplier={1.3}`.
- Unchanged: the five-slot order, roles, `selected`, labels "{label} tab" and "Record a session", `tabPress`/`tabLongPress`, the launch guard and its D8 sheet.
- Toast: measure the bar with `onLayout` and call `useToastObstruction(barHeight + FAB_OVERHANG + 5, isFocused)`, where `isFocused` reads `useContext(NavigationContext)` (from `@react-navigation/native`): with no navigation object, focused; otherwise `navigation.isFocused()` kept current by its `focus`/`blur` listeners. (The tab bar's `NavigationContext` is the `MainTabs` screen in the root stack, so pushing Profile blurs it.)

- [ ] **Step 1: Write the failing tests:** `BottomTabIcon.test.js` replaces the dot test with `the focused destination shows the red50 pill and no dot` (`queryByTestId('tab-active-indicator')` null; the pill `backgroundColor` is `colors.red50` focused and `'transparent'` unfocused). `LockedBottomTabBar.test.js`: `the Record disc is 60 red600 inside a 70 white ring`; `labels use the nav roles and cap at 1.3`; `FAB_OVERHANG is 24`; `the bar registers its height plus the ring overhang with the toast host` (render inside `renderWithProviders`, fire `layout` on the bar with height 90, then show a toast: its `bottom` is `8 + 90 + 29 = 127`); `recordLaunchGuard.test.js` stays green.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/LockedBottomTabBar.test.js __tests__/BottomTabIcon.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `src/components/navigation/LockedBottomTabBar.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/recordLaunchGuard.test.js __tests__/MainTabNavigator.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/navigation/LockedBottomTabBar.js src/components/navigation/BottomTabIcon.js __tests__/LockedBottomTabBar.test.js __tests__/BottomTabIcon.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(nav): Bold Red tab bar with the active pill, 60dp Record ring and toast clearance"
```

---

### Task 17: Home reconciliation (zero visual change except the 4dp overhang)

**Files:**
- Create: `src/components/common/FocusAwareStatusBar.js`
- Modify: `src/screens/main/HomeScreen.js`, `src/components/home/AttentionArea.js`, `src/components/home/HomeClockRow.js`, `src/components/home/WeekStrip.js`, `src/components/home/SegmentedSessionGauge.js`
- Create: `__tests__/FocusAwareStatusBar.test.js`, `__tests__/homeTypeRoles.test.js`; Modify: `__tests__/AttentionArea.test.js`

**Interfaces:**
- Consumes: `FAB_OVERHANG` (Task 16), `IconTile` (Task 12), `displayCount`, `textBodyLStrong`, `textOptionSelected` (Task 2), `tints` (Task 1).
- Produces: `FocusAwareStatusBar({ style })`: renders `expo-status-bar`'s `<StatusBar style={style} />` only while `useIsFocused()` is true.

Each change keeps the rendered values identical:
- `HomeScreen`: delete the local `FAB_OVERHANG = 28` and import the exported one (content bottom padding becomes 24 + 16 = 40, the one approved 4dp change); `{isFocused ? <StatusBar style="light" /> : null}` → `<FocusAwareStatusBar style="light" />`.
- `AttentionArea`: `CARD_BORDER` → `tints.rule`; the pressed `colors.text + '0F'` → `tints.pressed`; the tile → `<IconTile icon={…} tone={warning ? 'warning' : 'canvas'} iconSize={22} />`. Check `IconTile` warning glyph colour is `colors.warningText` and the canvas glyph `colors.text` (as today).
- `HomeClockRow`: `elapsed` → `...typeRoles.displayCount` (no `lineHeight` override); `statusStrong` → `...typeRoles.textOptionSelected` (identical Figtree 800 17/22).
- `WeekStrip`: `count` → `...typeRoles.displayCount`.
- `SegmentedSessionGauge`: `suffix` → `...typeRoles.textBodyLStrong`.

- [ ] **Step 1: Write the failing tests:** `FocusAwareStatusBar.test.js` (mock `@react-navigation/native` `useIsFocused` true/false; the mocked `StatusBar` is called with `{ style: 'light' }` only when focused). `AttentionArea.test.js`: add `the card border is tints.rule and the tile is a 40dp IconTile with a 22dp glyph`. `__tests__/homeTypeRoles.test.js`, a style-equivalence test: `StyleSheet.flatten` of the old literal values equals the new role spreads (e.g. `expect({ ...typeRoles.displayCount }).toEqual({ ...typeRoles.displayM, lineHeight: 24 })`; `textOptionSelected` equals `{ ...typeRoles.textButton, fontSize: 17, lineHeight: 22 }`; `textBodyLStrong` equals `{ ...typeRoles.textBodyStrong, fontSize: 17, lineHeight: 22 }`).

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/FocusAwareStatusBar.test.js __tests__/AttentionArea.test.js __tests__/homeTypeRoles.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `HomeClockRow.js`, `WeekStrip.js` and `SegmentedSessionGauge.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/HomeScreen.test.js __tests__/HomeClockRow.test.js __tests__/WeekStrip.test.js __tests__/SegmentedSessionGauge.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/FocusAwareStatusBar.js src/screens/main/HomeScreen.js src/components/home/AttentionArea.js src/components/home/HomeClockRow.js src/components/home/WeekStrip.js src/components/home/SegmentedSessionGauge.js __tests__/FocusAwareStatusBar.test.js __tests__/AttentionArea.test.js __tests__/homeTypeRoles.test.js __tests__/designSystemGuard.test.js
git commit -m "refactor(home): adopt the shared tile, status bar, overhang and type roles with no visual change"
```

---

### Task 18: Header sync pill (`SyncIndicator` default) and curly apostrophes (C18)

**Files:**
- Modify: `src/components/common/SyncIndicator.js` (default variant; the hero badge text style), `src/utils/syncStatusPresenter.js` (two strings)
- Modify: `__tests__/syncIndicator.test.js`, `__tests__/syncStatusPresenter.test.js`, `__tests__/SyncIndicator.hero.test.js`, `__tests__/syncStatusBanner.test.js`

**Interfaces:**
- Produces: `SyncIndicator({ onPress, variant = 'default' })`. The unused `showLabel` and `dark` props are removed (no caller; their test goes). `hero` behaviour unchanged.

Spec (Children §Header sync pill, overview §1.1 / W5):
- A `Pressable` with a 44 hit area (`minHeight: 44`, centred) holding the pill: `minHeight: 32`, radius 16, `colors.surface`, 1dp `tints.rule` border, row, gap 6, glyph 18. Text `typeRoles.textPill` `colors.text`, `maxFontSizeMultiplier={1.2}`; counts above 99 read "99+". Role button; label `Open sync status, ${view.accessibilityLabel}` (unchanged). No Paper `Badge`.

| State | Pill | Content |
|---|---|---|
| `synced` | `minWidth: 36`, padding 0 | `cloud-done-outline` `colors.success` |
| `waiting` | padding 0/12/0/9 | `cloud-upload-outline` `colors.textSecondary` + "{n} waiting" |
| `offline` | padding 0/12/0/9 | `cloud-offline-outline` `colors.textSecondary` + "{n} waiting" |
| `syncing` | `minWidth: 36` | an 18dp arc: a view with radius 9, 2dp border in `tints.spinnerTrack` and a `colors.textSecondary` top border, rotating 360° per 1000ms linear (`useNativeDriver`), static when `useMotion().reduceMotion` |
| `needs_attention` | padding 0/6/0/9, `colors.warningBg` fill, `tints.warningEdge` border | `warning-outline` `colors.warning` + "{n}" in `colors.warningText` + `chevron-forward` 14 `colors.warningText` |

- Hero badge text: `...typeRoles.textBadge` (identical to today's `textButton` 12/16), keeping `colors.red700` and the attention colour.
- `syncStatusPresenter.js`: the two "when you're online" strings use the curly ’ ("when you’re online").

- [ ] **Step 1: Write the failing tests:** in `syncIndicator.test.js`, one test per state row asserting the glyph name and colour (via the recorded Ionicons props), the visible words ("3 waiting", "2"), the label, and for `needs_attention` the warningBg fill and the trailing chevron; `syncing under reduceMotion has no rotation transform`; `120 waiting shows 99+`. Update the apostrophe in every test that asserts the offline copy (`syncStatusPresenter.test.js:80-81`, `syncIndicator.test.js:52`, `SyncIndicator.hero.test.js:18`, `syncStatusBanner.test.js:44`). Delete the `showLabel dark` test.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/syncIndicator.test.js __tests__/syncStatusPresenter.test.js __tests__/SyncIndicator.hero.test.js __tests__/syncStatusBanner.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `src/components/common/SyncIndicator.js` from `PENDING_SWEEP`.

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/HomeScreen.test.js __tests__/syncStatusScreen.test.js __tests__/TimeEntriesListScreen.syncVoice.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/SyncIndicator.js src/utils/syncStatusPresenter.js __tests__/syncIndicator.test.js __tests__/syncStatusPresenter.test.js __tests__/SyncIndicator.hero.test.js __tests__/syncStatusBanner.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(nav): canvas header sync pill; curly apostrophes in sync copy"
```

---

### Task 19: `ScreenHeader`, the hairline, navigator wiring and titles

**Files:**
- Create: `src/components/common/ScreenHeader.js`
- Modify: `src/navigation/AppNavigator.js`
- Delete: `src/navigation/HeaderBackButton.js`
- Modify: `__tests__/AppNavigator.headers.test.js` (rewrite); Create: `__tests__/ScreenHeader.test.js`

**Interfaces:**
- Consumes: `IconCircleButton` (Task 9), `SyncIndicator` (Task 18).
- Produces:
  - `ScreenHeader(props)` (default export): the navigators' `header` render prop. Reads `navigation`, `route`, `options`, `back` (native stack only). Options read: `title` (or a string `headerTitle`), `headerRight` (a function, called with `{ canGoBack: Boolean(back), tintColor: colors.text }`), `headerLeftIcon` (`'back'` default, `'close'`, `'none'`), `headerBackVisible`, `headerScrolled`.
  - `export function useHeaderHairline(navigation?)`: returns an `onScroll` handler. It calls `const contextNavigation = useContext(NavigationContext)` **unconditionally** (hooks must run on every render), then uses `navigation ?? contextNavigation`; with no navigation object (screen tests) the handler does nothing. It calls `navigation.setOptions({ headerScrolled })` only when `contentOffset.y > 0` flips, never every frame.

Spec (overview §1.1, C1–C3):
- Container `colors.background`, `paddingTop: insets.top + 9`, `paddingHorizontal: 24`, `paddingBottom: 6`. Content row `minHeight: 44`, `flexDirection: 'row'`, `alignItems: 'flex-start'`, gap 12. Total height at one-line titles is inset + 59.
- Left: `IconCircleButton` canvas. `back` and `headerLeftIcon === 'back'` and `headerBackVisible !== false` → `chevron-back`, label "Back"; `headerLeftIcon === 'close'` → `close`, label "Close" (shown even without `back`). Both call `navigation.goBack()`. `'none'` → nothing. No `back` → nothing (tab roots, stack roots).
- Title: `typeRoles.displayTitle` `colors.text`, `paddingTop: 6`, `flex: 1`, left-aligned, **no `numberOfLines`**, `maxFontSizeMultiplier={1.3}`, `accessibilityRole="header"`.
- Right: `options.headerRight?.(…)`.
- Hairline: an absolute 1dp `tints.rule` line at the bottom (`testID="screen-header-hairline"`), rendered only when `options.headerScrolled`. It does not change the header height.

Navigator changes (`AppNavigator.js`):
- `AuthNavigator`, `MainNavigator`, `ChildrenStackNavigator`: `screenOptions` = `{ header: (props) => <ScreenHeader {...props} />, contentStyle: { backgroundColor: colors.background } }` (drop `headerTitleAlign`, the custom `headerLeft` and every `headerBackTitle`). Auth keeps `headerShown: false` by default with `ForgotPassword` `headerShown: true`.
- `Tab.Navigator`: `screenOptions` adds `header: (props) => <ScreenHeader {...props} />` and `sceneStyle: { backgroundColor: colors.background }`; `headerRight` renders `<SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />` with no margin wrapper. The same in `ChildrenList`'s options.
- `headerShown: false` stays only on `MainTabs`, Home, the Children tab (its stack draws headers), Login, `LetterAssessment`, `SequentialAssessment` and `AssessmentResults`. `SessionComplete` keeps a header with `headerLeftIcon: 'none'` (replacing `headerLeft: () => null`) and `gestureEnabled: false`; its own PR removes it. `ChildOnboarding` keeps `headerBackVisible: false` and `gestureEnabled: false`.
- Titles (C1, C19; exact strings): Login stack: `ForgotPassword` "Reset password". Main stack: `Profile` "Profile", `TimeTracking` "Time tracking", `TimeEntriesList` "Work history", `ClassOnboarding` "Set up your class", `CreateClass` "Create class", `ChildOnboarding` "Add your children", `EditClass` "Edit class", `AddChild` "Add child", `EditChild` "Edit child", `SessionForm` "New session" with `headerLeftIcon: 'close'`, `SessionComplete` "Session saved", `SessionHistory` "Session history", `AssessmentChildSelect` "Select child", `AssessmentHistory` "Assessment history", `LetterTracker` "Letter tracker", `AssessmentDetail` "Assessment detail", `LetterMasteryRanking` "Letter mastery", `AssessmentRanking` "Assessment scores", `SessionCountRanking` "Session count", `SyncStatus` "Sync status". Children stack: `ChildrenList` "Children", `ClassDetail` "Class details" (interim; the Children PR sets the class name), `ChildResults` "Child results". Tabs: `Children` tab title "Children" (labels unchanged), "Insights", "Assessments".

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/ScreenHeader.test.js` (render `ScreenHeader` directly with a mock `navigation` `{ goBack: jest.fn(), setOptions: jest.fn() }` inside `renderWithProviders` with insets top 47): `the title is a left-aligned header that wraps` (`getByRole('header')` has text, `numberOfLines` undefined, `maxFontSizeMultiplier` 1.3); `paddingTop is inset + 9`; `with back it shows a Back circle that goes back`; `headerLeftIcon close shows Close and goes back`; `headerLeftIcon none and headerBackVisible false show no button`; `without back there is no button`; `headerRight renders`; `the hairline shows only when headerScrolled`. And `useHeaderHairline` (render a probe with a mock navigation): scroll events at y 0 → 10 → 20 → 0 → 0 call `setOptions` exactly twice, with `{ headerScrolled: true }` then `{ headerScrolled: false }`; with no navigation the handler is a no-op and does not throw.
  - `__tests__/AppNavigator.headers.test.js` (rewrite; keep the native-stack and bottom-tabs mocks, but make `Screen` record `{ name, options }` for every screen and `Navigator` record `screenOptions` per navigator): for every stack screen whose merged options do not set `headerShown: false`, `test.each` renders `merged.header({ navigation, route: { name }, options: merged, back: { title: 'Prev' } })` and asserts the header role carries the exact title from the list above and that "Back" calls `goBack` (except `SessionForm` → "Close", `ChildOnboarding` and `SessionComplete` → no button). `the tab roots show the sync pill, which opens SyncStatus` (render the tab `headerRight` and press it). `contentStyle and sceneStyle are the canvas`. `the auth stack has no back title or centred title left`.

- [ ] **Step 2: Run to verify they fail.** `jest __tests__/ScreenHeader.test.js __tests__/AppNavigator.headers.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Delete `HeaderBackButton.js` and remove it from `PENDING_SWEEP`. Swap `ClassDetailScreen`'s header-right Paper `Button` for `<BrandButton variant="tertiary" label="Manage classes" onPress={() => navigation.popToTop()} />` (same handler; it is header chrome). Update any test asserting an old title (`grep -rln "My Children\|My Profile\|Class Details\|New Session\|Session History\|Work History\|Time Tracking\|Sync Status" __tests__`).

- [ ] **Step 4: Run to verify they pass.** Same command plus `jest __tests__/MainTabNavigator.test.js __tests__/ClassDetailScreen.test.js __tests__/ChildrenListScreenRefresh.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit (orchestrator).**
```bash
git add src/components/common/ScreenHeader.js src/navigation/AppNavigator.js src/screens/children/ClassDetailScreen.js __tests__/ScreenHeader.test.js __tests__/AppNavigator.headers.test.js __tests__/designSystemGuard.test.js <updated title tests>
git rm src/navigation/HeaderBackButton.js
git commit -m "feat(nav): one navigator-rendered canvas header with sentence-case titles and a scroll hairline"
```

---

### Task 20: Sweep, time tracking (Time tracking, Work history)

**Files:** Modify `src/screens/main/TimeTrackingScreen.js`, `src/screens/main/TimeEntriesListScreen.js`; tests `__tests__/TimeTrackingScreen.test.js`, `__tests__/TimeEntriesListScreen.plan5.test.js`, `__tests__/TimeEntriesListScreen.syncVoice.test.js`.

Apply the **Sweep recipe** (Global Constraints) and part 1 §9:
- `TimeTrackingScreen`: 4 cards → `SurfaceCard`; "Clock In" → `BrandButton variant="primary"` label "Clock in"; "Clock Out" (today `buttonColor={colors.emphasis}`) → `variant="secondary"` label "Clock out"; the work-history link → `secondary`; spinner `colors.primary`; the monospace time → `typeRoles.textData`; the `colors.emphasis` fill at `:240` keeps `emphasis` only if it is a fill (it is a status dot: keep).
- `TimeEntriesListScreen`: entry card → `SurfaceCard`; "Today" chip → `StatusBadge tone="neutral"`; "Unsynced" chip → `StatusBadge tone="warning"`; date section headers → `SectionHeader`; both Snackbars → `useToast()` (tones by message: failures `error`, confirmations `success`, otherwise `neutral`; duration 3000); monospace → `textData`.

- [ ] **Step 1:** Write failing assertions: `TimeTrackingScreen` "Clock out" is a `secondary` button (surface fill, no red fill); the labels read "Clock in"/"Clock out"; `TimeEntriesListScreen` shows "Unsynced" as a warning `StatusBadge` (warningBg fill) and its two former Snackbar messages appear as toasts (render through `renderWithProviders`).
- [ ] **Step 2:** `jest __tests__/TimeTrackingScreen.test.js __tests__/TimeEntriesListScreen.plan5.test.js __tests__/TimeEntriesListScreen.syncVoice.test.js` → FAIL.
- [ ] **Step 3:** Implement; remove both files from `PENDING_SWEEP`.
- [ ] **Step 4:** Same command plus `jest __tests__/designSystemGuard.test.js` → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git add` the two screens, their three tests and the guard; `git commit -m "style(time): time tracking and work history on the shared look"`.

---

### Task 21: Sweep, Insights (hub, three rankings, ranked bars)

**Files:** Modify `src/screens/main/InsightsScreen.js`, `src/screens/insights/SessionCountRankingScreen.js`, `LetterMasteryRankingScreen.js`, `AssessmentRankingScreen.js`, `src/components/dashboard/RankedBarRow.js`; tests `__tests__/InsightsScreen.test.js`, `__tests__/SessionCountRankingScreen.test.js` (and any test rendering the other two rankings).

Apply the Sweep recipe and part 1 §9:
- `InsightsScreen` (tab root; its header and sync pill come from the navigator): delete the in-content `SectionHeader` (the title duplicates the header); keep "Review learner progress and participation." as a `typeRoles.textParagraph` Muted line; the four cards become one `ListGroup` of `ListRow`s, each with `lead={<IconTile icon={…} />}` (canvas tile, ink glyph, not red), `subtitle` = the description, `trailing="chevron"`, `accessibilityLabel` unchanged ("Open {label}"). **Decision:** the row titles sentence-case with the screens they open ("Letter mastery", "Assessment scores", "Session count", "Session history"), so the accessibility labels become "Open Letter mastery" and so on; update `InsightsScreen.test.js` accordingly.
- Rankings: `StatBar` is already restyled. `AssessmentRankingScreen`'s `SegmentedButtons` → `SegmentedControl role="radio"` with the same options and value. `RankedBarRow` and `LetterMasteryRankingScreen` import the yellow band from `src/utils/scoreBands.js` instead of `'#FFBB00'` (export it from there if it is not exported; same value). Text numerals passed as `StatBar` `color: colors.emphasis` (`AssessmentRankingScreen.js:157`, `LetterMasteryRankingScreen.js:90`, `SessionCountRankingScreen.js:82`) become `colors.primary` (C13); bar colours and the legend swatch keep `emphasis`.

- [ ] **Step 1:** Failing assertions: Insights rows are buttons inside a `ListGroup` with ink glyph tiles (`IconTile` canvas fill), no element with the "Insights" header text in content; `AssessmentRankingScreen` exposes a `radiogroup` whose press changes the range as before; `RankedBarRow` uses the shared yellow constant (import equality).
- [ ] **Step 2:** run the listed tests → FAIL. **Step 3:** implement; remove the five files from `PENDING_SWEEP`. **Step 4:** same plus `jest __tests__/designSystemGuard.test.js __tests__/scoreBands.test.js` → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(insights): Insights hub as grouped rows; rankings on the shared look"`.

---

### Task 22: Sweep, Assessments hub, child select, histories

**Files:** Modify `src/screens/main/AssessmentsScreen.js`, `src/screens/assessments/AssessmentChildSelectScreen.js`, `src/screens/assessments/AssessmentHistoryScreen.js`, `src/screens/sessions/SessionHistoryScreen.js`; tests `__tests__/AssessmentChildSelectScreen.languagePicker.test.js`, `__tests__/AssessmentHistoryScreen.plan5.test.js`, `__tests__/SessionHistoryScreen.plan5.test.js`, `__tests__/assessmentEntryRouting.test.js`, `__tests__/domainTextInputAudit.test.js`.

Apply the Sweep recipe and part 1 §9:
- `AssessmentsScreen` (tab root): delete the duplicate `SectionHeader` title, keep its hint as a `textParagraph` Muted line; cards → `SurfaceCard`; their three buttons → `primary` / `primary` / `secondary` at `size="md"`, labels sentence case; `NoActiveProgrammeNotice` is already `EmptyState`.
- `AssessmentChildSelectScreen`: `Searchbar` → `SearchField` (placeholder "Search children..." unchanged, which also becomes the accessible name); the language picker already uses the restyled `SelectSheet`. Update `domainTextInputAudit.test.js`: the `AssessmentChildSelectScreen` assertion becomes "renders `<SearchField` with `placeholder=\"Search children...\"`", and a new assertion checks that `src/components/common/SearchField.js` spreads `{...NO_TEXT_SUGGESTIONS}`.
- `AssessmentHistoryScreen`, `SessionHistoryScreen`: cards → a `ListGroup` of rows; the time column uses `typeRoles.textData`; a standalone Paper `IconButton` becomes `IconCircleButton` with the same glyph and label; Snackbars → toasts (copy and timing unchanged); `AssessmentHistoryScreen.js:93`'s `colors.emphasis` text → `colors.primary` (C13).

- [ ] **Step 1:** Failing assertions: the child search is a `SearchField` with "Clear search" after typing; the history screens' former Snackbar messages show as toasts; the history rows sit inside a `ListGroup`; the audit test's new assertions.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove the four files from `PENDING_SWEEP`. **Step 4:** same plus the guard → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(assess): Assessments hub, child select and histories on the shared look"`.

---

### Task 23: Sweep, assessment capture

**Files:** Modify `src/screens/assessments/LetterAssessmentScreen.js`, `SequentialAssessmentScreen.js`, `src/components/assessment/AssessmentInstructions.js`, `EndAssessmentButton.js`, `AssessmentTimer.js`, `LetterTile.js`, `LastAttemptedBottomSheet.js`; tests `__tests__/LetterAssessmentScreen.*.test.js`, `__tests__/SequentialAssessmentScreen.*.test.js`, `__tests__/sequentialAssessmentScreen.test.js`, `__tests__/AssessmentInstructions.test.js`, `__tests__/EndAssessmentButton.test.js`, `__tests__/LetterTile.test.js`, `__tests__/LastAttemptedBottomSheet.test.js`, `__tests__/CaptureHeader.test.js`, `__tests__/CountdownTimer.test.js`.

Apply the Sweep recipe and part 1 §9 (capture screens have no header; their render-count tests must stay green):
- Buttons → `BrandButton`. `AssessmentInstructions`: "Start Assessment" → `primary` "Start assessment"; "Cancel" → `secondary`. `LetterAssessmentScreen` "Finish" → `primary`. `SequentialAssessmentScreen`: "Correct" (today `buttonColor` `success`, white text 3.16:1, fails) → `BrandButton variant="success"` (Task 9); "Incorrect" → `variant="destructive"`; both `lg`, labels unchanged. "Back" → `secondary`.
- `EndAssessmentButton`: → `BrandButton variant="tertiary" size="sm"` "End assessment" (red600 text passes; today red500 `emphasis` fails); the `Alert` copy and handler are unchanged (`EndAssessmentButton.test.js` presses the new label).
- `AssessmentTimer.js:10` text colour `emphasis` → `primary` (C13). `LetterTile` white text → `colors.onDark`. `LastAttemptedBottomSheet` inner button → `BrandButton`, white text → `colors.onDark`. `CaptureHeader`, `CountdownTimer`, `EgraLetterGrid`: tokens and type only (they may already be clean).

- [ ] **Step 1:** Failing assertions: Sequential "Correct" has `colors.successText` fill, "Incorrect" `colors.error`; "End assessment" opens the same `Alert`; "Start assessment" label; the timer's urgent colour is `colors.primary`; render-count tests unchanged.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove the seven files from `PENDING_SWEEP`. **Step 4:** same plus `jest __tests__/designSystemGuard.test.js __tests__/screenTimerAudit.test.js` → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(assess): capture screens on the shared look; Correct passes contrast"`.

---

### Task 24: Sweep, results, detail, child results, letter tracker

**Files:** Modify `src/screens/assessments/AssessmentResultsScreen.js`, `AssessmentDetailScreen.js`, `ChildResultsScreen.js`, `LetterTrackerScreen.js`, `src/components/assessment/AssessmentDetailGrid.js`, `LetterMasteryPanel.js`; tests `__tests__/AssessmentResultsScreen.test.js`, `__tests__/ChildResultsScreen.test.js`, `__tests__/LetterTrackerScreen.plan5.test.js`, `__tests__/LetterMasteryPanel.test.js`, `__tests__/egraLetterGridReadOnly.test.js`.

Apply the Sweep recipe and part 1 §9:
- Local `StatCard`s → `SurfaceCard` with the value in `typeRoles.displayTitle` (+ tabular) and the label `textLabel`. Score-band colours unchanged (data). Buttons → `secondary` "Try again" + `primary` "Done" (results); `ChildResultsScreen` card → `SurfaceCard`, buttons `secondary` + `primary`.
- C13: "Keep practicing!" text colour (`AssessmentResultsScreen.js:14`, `AssessmentDetailScreen.js:14`) and `ChildResultsScreen.js:28` → `colors.primary`; the `StatCard` `accentColor={colors.emphasis}` stays `emphasis` only where it colours a bar or fill, and becomes `primary` where it colours the numeral text. `AssessmentDetailGrid` legend dot and incorrect fill keep `emphasis` (fills); its white text → `colors.onDark`.
- `LetterTrackerScreen`, `LetterMasteryPanel`: tokens and type only; `letterStateColors` is not changed here (the Record PR owns C15).

- [ ] **Step 1:** Failing assertions: "Keep practicing!" renders in `colors.primary`; "Try again" is `secondary`; no raw hex remains (the guard).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove the six files from `PENDING_SWEEP`. **Step 4:** same plus the guard → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(assess): results, detail and mastery on the shared look; red text passes contrast"`.

---

### Task 25: Sweep, Add child and Edit child

**Files:** Modify `src/screens/children/AddChildScreen.js`, `src/screens/children/EditChildScreen.js`; tests `__tests__/AddChildScreen.test.js`, `__tests__/EditChildScreen.test.js`, `__tests__/domainTextInputAudit.test.js` (only if it covers these).

Apply the Sweep recipe and part 1 §9:
- Delete the duplicate `SectionHeader` titles ("Add New Child", "Edit Child"); the header title comes from the navigator.
- Form card → `SurfaceCard`. Each `TextInput` + `HelperText` → `TextField` (same `label`, `value`, handlers, keyboard props, and the same `NO_TEXT_SUGGESTIONS` spread where the field has it today; the `HelperText` message becomes `error`). Picker inputs → `SelectField` + the existing `SelectSheet`. `ChipSelector` is already ink chips.
- "Add Child" → `primary lg` "Add child"; "Save Changes" → `primary lg` "Save changes"; "Delete Child" → `destructiveQuiet lg` "Delete child".
- `EditChildScreen`'s `primary`-bordered option boxes → ink selection (2dp `colors.text` border and `textOptionSelected` label when selected, `tints.control` 1.5 otherwise); the group picker sheet is unchanged here (Task 28).
- Snackbars → toasts (copy and duration unchanged). These forms have **no** save-success notification today: a successful save only navigates (`AddChildScreen.js:70-73`, `EditChildScreen.js:120-123`). Do not add one. The existing error toasts become `error`. Edit child's existing "Class updated" class-reassignment message becomes `success`. (Codex plan review F4.)

- [ ] **Step 1:** Failing assertions: a required-field error renders an `alert` note and the field's name becomes "First Name *, error: {message}" (use the screen's existing validation copy); the save/delete buttons by their new labels keep their existing handlers; a successful save navigates exactly as today and shows **no** toast; a save failure shows the existing error copy as an `error` toast; Edit child's class reassignment shows the existing "Class updated" message as a `success` toast; the duplicate title text is gone.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove both files from `PENDING_SWEEP`. **Step 4:** same plus `jest __tests__/designSystemGuard.test.js __tests__/domainTextInputAudit.test.js __tests__/GroupPickerBottomSheet.test.js` → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(children): child forms on TextField, SelectField and the root toast"`.

---

### Task 26: Sweep, Create class and Edit class

**Files:** Modify `src/screens/children/CreateClassScreen.js`, `src/screens/children/EditClassScreen.js`; tests `__tests__/CreateClassScreen.test.js`, `__tests__/CreateClassScreen.selectSheet.test.js`, `__tests__/EditClassScreen.test.js`.

Apply the Sweep recipe and part 1 §9: delete the duplicate titles ("Create New Class", "Edit Class"); card → `SurfaceCard`; "Class Name *" and "Teacher *" → `TextField` (the `errors.*` message becomes `error`); "School *", "Grade *", "Home Language *" (today read-only `TextInput`s with a `TextInput.Icon` that open a `SelectSheet`) → `SelectField` with the same `onPress`, value and `error`; "Create Class" → `primary lg` "Create class"; "Save Changes" → "Save changes"; "Delete Class" → `destructiveQuiet lg` "Delete class"; Snackbars → toasts.

- [ ] **Step 1:** Failing assertions: the School field is a button named "School *, {school name}" that opens the existing search sheet; a missing class name shows the existing error copy as an `alert` note; a successful create navigates exactly as today (`CreateClassScreen.js:77-86`) and shows **no** toast (none exists today); a save failure shows the existing error copy as an `error` toast; the old Paper `TextInput` is gone. (Codex plan review F4.)
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove both files from `PENDING_SWEEP`. **Step 4:** same plus the guard → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(classes): class forms on TextField, SelectField and the root toast"`.

---

### Task 27: Sweep, onboarding and Sync status

**Files:** Modify `src/screens/onboarding/ClassOnboardingScreen.js`, `src/screens/onboarding/ChildOnboardingScreen.js`, `src/screens/main/SyncStatusScreen.js`; tests `__tests__/ClassOnboardingScreen.test.js`, `__tests__/ChildOnboardingScreen.test.js`, `__tests__/syncStatusScreen.test.js`.

Apply the Sweep recipe and part 1 §9: onboarding cards → `SurfaceCard`, buttons `primary`/`secondary` with sentence-case labels ("Check again", "Retry backend check", "Finish setup"); `ChildOnboarding` keeps no back button and no gesture (navigator, Task 19) and its `beforeRemove` guard unchanged. `SyncStatusScreen`: the 5 cards and the failed-item cards → `SurfaceCard`; "Sync now" and "Apply" → `primary size="md"`; "Retry" → `secondary size="md"`; the summary icon keeps `describeSyncState` colours; its Snackbar → toast.

- [ ] **Step 1:** Failing assertions: the Sync status action toasts appear through the root host; "Retry" is `secondary`; onboarding labels in sentence case keep their handlers.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove the three files from `PENDING_SWEEP`. **Step 4:** same plus the guard → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style: onboarding and Sync status on the shared look"`.

---

### Task 28: Sweep, remaining shared sheets and grids

**Files:** Modify `src/components/children/GroupPickerBottomSheet.js`, `src/components/session/LetterTrackerBottomSheet.js`, `src/components/session/LetterGrid.js`, `src/components/common/SyncStatusBanner.js`; tests `__tests__/GroupPickerBottomSheet.test.js`, `__tests__/LetterTrackerBottomSheet*.test.js`, `__tests__/syncStatusBanner.test.js`.

Sheets inherit the `BottomSheet` restyle. Inner buttons → `BrandButton`; Paper `IconButton`s keep their glyphs; group colour swatches stay data (`groupColors.js`); `fontWeight` → faces; raw sizes → roles; `LetterGrid` white text → `colors.onDark`; `SyncStatusBanner.js:16` `'#FFFFFF'` → `colors.onDark` (the component is unused and the Children PR replaces it; this is the one change it needs to pass the guard).

- [ ] **Step 1:** run the listed tests and the guard; record which assertions need updating (labels only). **Step 2:** implement; remove the four files from `PENDING_SWEEP`. **Step 3:** run → PASS.
- [ ] **Step 4: Commit (orchestrator).** `git commit -m "style: group picker, letter tracker sheet and grids on the shared look"`.

---

### Task 29: Board files, mechanical pass A (Children, Class detail, child selector)

**Files:** Modify `src/screens/main/ChildrenListScreen.js`, `src/screens/children/ClassDetailScreen.js`, `src/components/children/ChildSelector.js`; tests `__tests__/ChildrenListScreenRefresh.test.js`, `__tests__/ClassDetailScreen.test.js`, `__tests__/ChildSelector.renderCount.test.js`.

Board files get only the mechanical pass (part 1 §9 "Board screens"): `fontWeight` → faces (Global Constraints mapping); raw hex → tokens (`ClassDetailScreen.js:296` `shadowColor: '#000'` → `colors.shadowWarm`); `ClassDetailScreen`'s `FAB` gets `color={colors.onDark}` (white on red600, the interim fix). Raw sizes and Paper inputs stay (they are in `BOARD_RATCHET`); no layout change. `ChildrenListScreen.js:304`'s `colors.emphasis` is left for the Children PR (it rewrites that stat).

- [ ] **Step 1:** Failing assertion in `ClassDetailScreen.test.js`: the FAB's `color` prop is `colors.onDark`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; remove the three files from `PENDING_SWEEP` (their ratchet lines stay). **Step 4:** same plus the guard → PASS; the ratchet counts are unchanged.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style(children): weight-to-face pass on the Children board files; white Class detail FAB"`.

---

### Task 30: Board files, mechanical pass B (Record, Session complete, Profile, sign-out)

**Files:** Modify `src/screens/sessions/LiteracySessionForm.js`, `src/screens/sessions/SessionCompleteScreen.js` (no change expected), `src/components/sessions/SessionsTodayRing.js`, `src/screens/main/ProfileScreen.js`, `src/components/profile/SignOutSheets.js`; tests `__tests__/LiteracySessionForm.test.js`, `__tests__/LiteracySessionForm.submit.test.js` (integration), `__tests__/SessionsTodayRing.test.js`, `__tests__/SessionCompleteScreen.test.js`, `__tests__/ProfileScreen.releaseMetadata.test.js`, `__tests__/profileCaptureModeToggle.test.js`, `__tests__/signOutFlow.test.js` (must stay byte-identical), `__tests__/task5AuthRaces.test.js` (integration).

**`task5AuthRaces.test.js`:** `ProfileScreen` now calls `useToast()`, which throws outside a `ToastProvider`, and that file's `Tree` renders Profile with none. Wrap its `Tree` as `App.js` does: `ToastProvider` **above** the keyed `SignedInEAProvider`, with `ToastActorScope handle={handle}` inside it, so a stale toast after sign-out or an account switch is caught by the actor scope rather than hidden by an unmount. Change nothing else in that file; the whole file must stay green.

- `LiteracySessionForm`: `fontWeight` → faces; `'#FFFFFF'` (`:767`) → `colors.onDark`; its Snackbar (the save failure) → `toast.show({ message, tone: 'error' })`, copy and duration unchanged (the Record PR moves it inline).
- `SessionsTodayRing` (not a board file; deleted by the Session complete PR): full sweep (roles for its raw sizes, faces), so it leaves `PENDING_SWEEP` with zero violations.
- `ProfileScreen`: `fontWeight` → face; its Snackbar → toasts, **forwarding the existing classification**: `showMessage(message, type)` already passes an authoritative `type` (`ProfileScreen.js:194-224` password validation and incorrect current password, `:103-105` and `:239` export/server errors), so `type === 'error'` → `tone: 'error'`, `type === 'success'` → `success`, anything else → `neutral`. Never classify by message text. Duration 4000. (Codex plan review F2.) C13: the Sign out `textColor={colors.emphasis}` (`:485`) → `colors.primary`; the `:570` `borderColor: colors.emphasis` stays (a border). No layout change.
- `SignOutSheets`: `fontWeight` → faces only. `useSignOutFlow` and `signOutFlow.test.js` are untouched (S4).

- [ ] **Step 1:** Failing assertions: a failed session save shows the existing message as an error toast (`LiteracySessionForm.submit.test.js` already drives a save failure: assert `getByRole('alert')` text instead of the Snackbar); Profile's messages keep their tone: a missing password field, a too-short password, a mismatch and an incorrect current password each show an `error` toast; an export error whose wording does not start with "Failed" still shows `error`; export success shows `success`.
- [ ] **Step 2:** `jest` the unit files and `integration __tests__/LiteracySessionForm.submit.test.js` → FAIL. **Step 3:** implement; remove `LiteracySessionForm.js`, `SessionsTodayRing.js`, `ProfileScreen.js`, `SignOutSheets.js` from `PENDING_SWEEP`. **Step 4:** same plus the guard and `git diff --exit-code -- __tests__/signOutFlow.test.js src/hooks/useSignOutFlow.js` → PASS and no diff.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "style: weight-to-face pass on Record, Profile and sign-out; their toasts move to the root host"`.

---

### Task 31: Close the guard

**Files:** Modify `__tests__/designSystemGuard.test.js`.

- [ ] **Step 1:** Confirm `PENDING_SWEEP` is empty. If not, finish those files (they belong to an earlier task; do not exempt them).
- [ ] **Step 2:** Delete `PENDING_SWEEP`, its `test.each`, and the filter in the main `test.each` (every file is now checked). Confirm `grep -rn "react-native-paper" src App.js | grep -c Snackbar` is 0.
- [ ] **Step 3:** `jest __tests__/designSystemGuard.test.js __tests__/paperTheme.test.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/typography.test.js __tests__/noLegacyHues.test.js __tests__/domainTextInputAudit.test.js` → PASS. Sanity-check that the guard is live: temporarily add `fontWeight: '700'` to `src/components/common/SurfaceCard.js` and `'#123456'` to `IconTile.js`, run the guard (FAIL naming both), then revert.
- [ ] **Step 4: Commit (orchestrator).** `git commit -m "test(design): the sweep is complete; every file is under the guard"`.

---

### Task 32: Standing docs

**Files:** Modify `documentation/design-system.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`.

- [ ] **Step 1: `design-system.md`:** the new `primary`/`primaryDark`/`placeholder`/`successText`/`fieldEdge`/`shadowWarm`, the `tints` table, the full role table (marking the plan-addition roles and why), the Paper and navigation theme mapping, every primitive with its props (names from this plan), the toast (actor scoping and why the host is a sibling of the Paper tree, not a portal), the motion contract (tiers, levels, what each level plays), the header (navigator-rendered, `useHeaderHairline`), and the guard (rules, the two theme exceptions, `BOARD_RATCHET` and how a board PR deletes its line). Remove the "Typography has almost no adoption" open-work note.
- [ ] **Step 2: `ROADMAP.md` §5:** tick and annotate (date, branch) "Add a `deviceTier`/reduced-motion contract…", "Roll typography tokens out…", "Replace the 14 screen-local Snackbar hosts…" (note: `ToastProvider`, not `SnackbarContext`) and "Suspended sign-in copy". Narrow "Bold Red for the rest of the app" to the remaining per-screen PRs (Children, Record, Session complete, Profile, Login), and note C11's outcome once Task 34 runs.
- [ ] **Step 3: `build-log.md`:** append Verification Register rows (dated) for the baseline counts (Task 1 Step 0), each focused gate that found something, the final full suites (Task 33), and a Decision Register entry listing this plan's decisions (below). Record any dead end.
- [ ] **Step 4:** `git diff --check` clean. **Commit (orchestrator):** `git commit -m "docs: Bold Red shared look in the design system, roadmap and build log"`.

Decisions to record (made by this plan where the spec was silent):
1. Seven roles beyond the spec table (`displayCount`, `textBodyLStrong`, `textSearch`, `textMasked`, `textMetaStrong`, `textNavRecord`, `textMicroStrong`), so the guard needs no raw-size allowlist and Home stays pixel-identical.
2. The guard also ratchets Paper `Button` and `HelperText` imports (part 1 §9 swaps them everywhere).
3. `useToastObstruction` and `useMotion` are safe without a provider; `useToast` throws.
4. `ListRow variant="readOnly"` reads `title` as the caps label and `subtitle` as the value; `expanded` added for the disclosure row.
5. `IconTile` takes `iconSize` (Home's canvas tile glyph is 22, the spec default 20).
6. `BrandButton` gains `variant="success"` for Sequential "Correct" (part 1 §9 asks for a `successText` fill; no listed variant had one).
7. `ClassDetail` keeps the interim title "Class details" until the Children PR sets the class name; `SessionComplete` keeps its header until its PR.
8. Insights row titles sentence-case with the screens they open.
9. Tab bar bottom padding keeps today's `max(inset, 8)` floor.
10. Home's hero gear is not moved to `IconCircleButton` (optional adoption; no gain, some risk).
11. `paperTheme.test.js` cannot require every MD3 role to differ from its default (part 1 §10): MD3's on-colours are already `#FFFFFF`, which is `colors.onDark`. It requires a token value everywhere and a change wherever the MD3 default is not itself a token.
12. Paper `fonts` set `letterSpacing` (role value or 0) and `fontWeight: undefined` on every variant and on `default`, because `configureFonts` merges over MD3's typescale.
13. `useHeaderHairline(navigation?)` falls back to `NavigationContext` and is a no-op without one, so screens can call `useHeaderHairline()` and screen tests need no container.
14. Every toast uses `tone` from a fixed table per host; where the spec says "tone per message", failures are `error`, confirmations `success`, everything else `neutral`.

---

### Task 33: Full verification

- [ ] **Step 1:** `jest` (whole unit suite) → PASS; record suites/tests and compare with the Task 1 baseline (new suites added, three deleted in Task 15).
- [ ] **Step 2:** `integration` (whole manifest) → PASS; record counts.
- [ ] **Step 3:** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:types` → PASS (WelaPLUS untouched).
- [ ] **Step 4:** Guards: `jest __tests__/designSystemGuard.test.js __tests__/paperTheme.test.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/typography.test.js` → PASS. `git diff origin/main --stat -- src/assessment-questions supabase documentation/rls-sync-contract-map.md src/db` shows no change.
- [ ] **Step 5:** Add the counts to the build log rows from Task 32 and commit with the orchestrator: `git commit -m "docs(build-log): shared-look verification"`.

---

### Task 34: Device gate on the EAS preview build (manual, Jim)

This is a manual gate. The orchestrator builds the EAS preview for this branch (cloud build; see the `expo-deployment` skill) and Jim runs the checks on an iPhone and on Android (the A03s at 360dp, plus a 411dp phone), against `RedSystemSheet` and the flow boards. Record every row's result in the build log.

1. **No purple anywhere:** a toast with Dismiss (Login wrong password; the suspended test EA via `npm run ea:suspend`), a focused input, selected chips, the Insights segmented control, the Class detail FAB (white plus on red600), the search bars, the session form's menu, any card, the Reset password back button.
2. **Fonts:** Figtree and Bricolage on every screen of the flow, including Paper text (`bodySmall` captions, button labels); no system-font fallback on Android where a weight used to be set.
3. **Tab bar:** five slots; the 60dp Record disc and its white ring are not clipped; tapping the top edge of the ring opens Record (Android hit-testing outside the bar's bounds); the active pill; label sizes; the bottom inset on a gesture-nav phone and a 3-button phone.
4. **Headers:** left-aligned titles; the 44 Back circle; "Close" on New session; a long class name wraps to two lines (Class detail shows "Class details" until the Children PR, so test with a long title elsewhere, e.g. at font scale 1.3 on "Assessment history"); the hairline appears on scroll; no grey flash on push and pop; iOS swipe-back and Android hardware back.
5. **Status bar:** dark icons on every canvas screen, light on Home, correct after leaving Home for Profile and after a sheet.
6. **Toast:** above the tab bar and the Record ring on Home (clock in), above the home indicator on Profile, above the keyboard on Add child, and with a sheet: toast then sheet, sheet then toast, and a toast replaced while a sheet stays open; Dismiss is tappable in all three. A toast fired just before sign-out does not appear on Login.
7. **Sheets:** the rise animation, the scrim colour, the title face; Android back dismisses; open and dismiss quickly twice: the sheet reopens interactive.
8. **Motion:** with iOS Reduce Motion and Android "Remove animations" on, sheets fade without sliding and the sync pill's arc is still. Export logs on each test phone and record the `[motion] device tier` line (`totalMemory`, `deviceYearClass`, tier) in the build log.
9. **Large text** at 1.3 and the largest system size at 360dp: buttons, fields, notes, toast and header titles wrap and grow; nothing truncates or clips; 44dp targets stay separate.
10. **Every no-board screen** in part 1 §9, once, at 360×640: only colour, type, radius, header and button style changed.
11. **Home row:** pixel-identical to build 14 except the content's bottom padding, which is 4dp shorter (`FAB_OVERHANG` 28 → 24).
12. **C11 repro (A03s):** Children → Create class → School → type in the search field. Record whether the search field and the first results sit above the keyboard. If they are covered, run Task 35 in this PR and repeat this row; if not, record "did not reproduce; the Profile PR verifies with the password sheet".

13. **Screen readers (added after branch review round 1):** with VoiceOver on, a failed session save (airplane mode does not fail a save, so use the suspended EA's sign-in error) is spoken; Insights → Assessment scores: Letters and Words are each focusable, announce selected/not selected, and double-tap switches mode. With TalkBack on Android, the same error is spoken once, not twice. On a 3-button-nav Android phone, focus Add child → First name and fire a toast (submit with a blank name): the whole toast, including Dismiss, sits above the keyboard.

- [ ] Jim signs off each row (or files the failures as fixes in this PR before merge).

---

### Task 35 (conditional): `BottomSheet` Android keyboard fix (C11)

Run only if Task 34 row 12 shows the field under the keyboard.

**Files:** Modify `src/components/common/BottomSheet.js`, `__tests__/BottomSheet.test.js`.

Spec (overview C11, Profile part "Keyboard and small phones", W10): `KeyboardAvoidingView` uses `behavior="padding"` on both platforms; when keyboard-avoiding, the wrapper fills the overlay (`flex: 1`, `justifyContent: 'flex-end'`, `paddingTop: insets.top + 8`) so the panel's `maxHeight` resolves against the space left above the keyboard; the default `maxHeight` stays `'80%'`; flexbox anchoring stays (no absolute bottom positioning); sheets passing `keyboardAvoiding={false}` are unchanged.

- [ ] **Step 1:** Failing test: `on Android a keyboard-avoiding sheet uses padding behaviour` (`jest.replaceProperty(Platform, 'OS', 'android')`; the `KeyboardAvoidingView` has `behavior="padding"` and the wrapper style `flex: 1`); `keyboardAvoiding={false}` renders no `KeyboardAvoidingView` (existing test).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `jest __tests__/BottomSheet.test.js __tests__/SelectSheet.test.js __tests__/CreateClassScreen.selectSheet.test.js` → PASS.
- [ ] **Step 5: Commit (orchestrator).** `git commit -m "fix(sheet): keyboard-avoiding sheets lift above the Android keyboard under edge-to-edge"`.
- [ ] **Step 6:** New preview build; repeat Task 34 row 12 plus a **no double lift** row on iPhone (School search, the sheet sits directly on the keyboard with no gap) and on the A03s.
