# Bold Red Log in and Reset password Implementation Plan (PR 6)

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time; Claude reviews each task's diff and tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Log in on the Bold Red field (lockup, charcoal arc and learner art, red bottom panel, white boxed fields, inline errors, offline caption, keyboard and compact layouts) with "Forgot password?" hidden, and restyle the still-registered Reset password screen, so the last un-redesigned screens match their boards.

**Architecture:** Two pure functions own the geometry (`computeHeroArtLayout` for the art's scale, offset and hide rule; `computeLoginLayout` for rest / keyboard / compact-keyboard), so the screen only measures and renders. Small presentational components live in `src/components/auth/` (`BrandLockup`, `LoginHeroArt`). The shared `TextField` (built in PR 1) gains its `surface="red"` tone and a form-placed error mode. A read-only `useNetworkOffline` hook gives the signed-out screen a definitely-offline signal without `OfflineContext`. Errors become screen-local state rendered inline through PR 1's `describeAuthError` and `InlineNote`. No schema, RLS, payload, outbox or `AuthContext` change.

**Tech Stack:** React Native 0.81.5 / Expo SDK 54, react-native-svg 15.12.1, `@expo-google-fonts/bricolage-grotesque` 0.4.1 (already installed), `@react-native-community/netinfo` 11.4.1 (already installed), React Navigation 7 native stack, Jest 29.7 + @testing-library/react-native 13.3.3.

**Spec:** `docs/superpowers/specs/2026-10-18-bold-red-app-6-login.md` (layout, states, copy, tests, device checks), read together with the overview `docs/superpowers/specs/2026-10-18-bold-red-app-design.md`. The overview's "System decisions" (§1–§5), Jim's answers (§6, 2026-10-19) and the review rounds (§8) **override part 6** wherever they disagree. The name map below applies those overrides; the builder never uses a part-6 name that this map replaces. Boards (design data): the `red-login-*` files of the Design Round 4 canvas.

## Global Constraints

- Branch `feat/bold-red-login`, created from `feat/bold-red-profile` (PR 5) after PRs 1–5 are on it. Commit after every task; never push without Jim.
- **Who does what:** Codex implements each task through the codex companion. Claude reviews the task's diff, runs its tests, then the orchestrator commits. Codex usually cannot `git commit` in its sandbox, so each task ends with the exact files to stage and the commit message; the orchestrator runs it. Codex never runs `git stash`, `checkout` or `commit`.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Unit/screen tests: `npx jest <file>`. Integration tests (real SQLite) are listed in `jest.integration.config.js` `testMatch` and run with `npm run test:integration -- <file>`. This PR adds no integration test. Full suites at the end: `npx jest` and `npm run test:integration`.
- TDD per task: the failing test first for behaviour. For restyles, assert structure, tokens and accessibility through the rendered screen with `@testing-library/react-native` (`StyleSheet.flatten(node.props.style)`), never snapshots.
- **No behaviour change the spec does not approve.** Validation rules stay as they are: Login `!email || !password`, then `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; Reset `!email || !email.includes('@')`. `AuthContext`, `supabaseClient`, schema, RLS, outbox and `rls-sync-contract-map.md` are not touched.
- **No new package.** Stay on npm. `BricolageGrotesque_700Bold` comes from the installed `@expo-google-fonts/bricolage-grotesque@0.4.1`. The WebP learner art renders with React Native `Image` (Metro and jest-expo already treat `webp` as an asset).
- Design tokens only: `colors.*`, `tints.*`, `typeRoles.*`, `fontFamilies.*`, `spacing`, `borderRadius`, `shadows`. PR 1's `__tests__/designSystemGuard.test.js` forbids hex / `rgb(` / `rgba(` outside `src/constants/**`, `fontWeight` anywhere outside `typography.js`, string-literal `fontFamily`, Paper `Snackbar`, and Paper `TextInput` outside its ratchet list. It also forbids raw numeric `fontSize` / `lineHeight` / `letterSpacing` outside `typography.js` except for ratchet-listed files. **This PR deletes the `LoginScreen.js` and `ForgotPasswordScreen.js` ratchet lines** (Tasks 6 and 8). The test fails if a listed file reaches zero but is still listed.
- Auth screens never spread `NO_TEXT_SUGGESTIONS` (`__tests__/domainTextInputAudit.test.js`).
- Copy is verbatim from part 6 "Copy changes" and the error tables. Use curly apostrophes (`’`) and the single ellipsis character (`…`) in user-visible strings.
- Touch targets in the spec are minimums (`minHeight`), never fixed heights. Text wraps and never truncates.
- **"Forgot password?" is hidden (Jim, overview §6 answer 4).** Log in renders no link to Reset. The `ForgotPassword` route stays registered in `AuthNavigator` and the Reset screen is fully restyled, so it is ready when recovery is fixed. The GitHub issue "Password recovery: deep link + set-new-password screen" is filed by the orchestrator (Task 9 Step 1), not by Codex.
- Standing docs ship in this branch (Task 9): `documentation/design-system.md`, `documentation/build-log.md` (append rows), `documentation/ROADMAP.md` §5, and `PRD.md` §6.1. `CONTEXT.md` gets no change (no domain term changes).

### Name map (overview wins over part 6)

| Part 6 says | Build this (overview) |
|---|---|
| `PillButton` tone `onRed` "Sign in" | `BrandButton variant="primary" surface="red" size="lg" loadingLabel="Signing in…"` |
| `PillButton` primary "Send reset link" / sent "Back to sign in" | `BrandButton variant="primary"` (canvas), `loadingLabel="Sending…"` for Send |
| `TextLinkButton` ink tertiary "Back to sign in" (Reset form) | `BrandButton variant="tertiary" tone="ink"` |
| `TextLinkButton` onRed "Forgot password?" | **not rendered** (hidden) |
| `ErrorNote` | `InlineNote tone="error"` (`size="sm"`, `textNote` = Figtree **600** 13/18) |
| `TextField` tone `onRed` / `onCanvas` | `TextField surface="red"` / `surface="canvas"` |
| `displayHero` 38/42 | `typeRoles.display2XL` |
| `displayL` 28/32 ("Reset password", "Check your email") | `typeRoles.displayTitle` |
| `displayTitle` 24/28 (compact keyboard heading) | `typeRoles.displaySheetTitle` |
| `textLead` 15/22 | `typeRoles.textParagraph` |
| `textCaptionStrong` 700 | `typeRoles.textNote` (600, via `InlineNote`) |
| `colors.surface + '52'` / `+ 'B8'` / `colors.text + '33'` etc. | `tints.onRedHalo` / `tints.onRedKeyline` / `tints.control` etc. |
| In-screen `ScreenHeader` on Reset, `headerShown: false` | **Navigator-rendered** `ScreenHeader` (overview C1): `ForgotPassword` keeps `headerShown: true`, `title: 'Reset password'`; the sent state sets `title: ''` |
| Header top `max(insets.top + 9, 34)` | `insets.top + 9` (owned by `ScreenHeader`, C2) |
| `<StatusBar style="light" />` inline | `FocusAwareStatusBar style="light"` (Login only; Reset is a canvas screen and keeps the root dark style) |
| `describeAuthError` "new" | **Already shipped in PR 1** (`src/utils/authErrorCopy.js`, full table, both actions). This PR only moves its output inline. |
| `useKeyboardHeight` "new" | **Already shipped in PR 1** (`src/hooks/useKeyboardHeight.js`). |
| Lockup "preferred route: one image" | Typeset (overview §6 answer 1): mark image + "MASI" (`fontFamilies.display`) + "NYUSANE" (`fontFamilies.displayBold`, new). |

## Review Focus

1. **The keyboard opens on a short phone while an error note or the offline caption is showing.** The panel is taller, so the compact-keyboard decision must use the panel height measured *with* the note, and the focused field must stay visible. Pinned in Task 7 (`computeLoginLayout` case "a note pushes a 360x780 phone into compact"; screen test "compact uses the height measured with the note").
2. **Connectivity drops while a sign-in is in flight.** The caption appears while the button stays busy; the failed request then shows the connection note; reconnecting hides the caption but leaves the note until the next edit or tap. Pinned in Task 6 ("offline mid-request").
3. **The Password return key ("go") during a request, or with empty fields.** It takes exactly the Sign in path: validation first, never a second `signIn` while one is pending. Pinned in Task 6 ("go while pending does not sign in twice"; "go with empty fields validates").
4. **A successful sign-in unmounts Login** (`AppRoot` swaps the tree). The NetInfo subscription is released, and the success path sets no state. Pinned in Task 5 (unsubscribe on unmount) and Task 6 ("success leaves the button busy and unmounts cleanly").
5. **Large text on a short phone, and a panel that grows.** A lone head never peeks over the panel (hide rule), and the art never moves when an error or the offline caption grows the panel (anchor rule). Pinned in Task 3 (geometry cases) and Task 7 (screen keeps the art's position when the note appears).

---

### Task 1: Preflight — confirm the inherited contract (Claude/orchestrator, no production code)

PRs 1–5 build the primitives this PR consumes. This plan names them as the overview §1 defines them. Before Codex starts, confirm they exist under those names on the base branch.

**Files:** none changed.

- [ ] **Step 1: Create the branch** from the tip of `feat/bold-red-profile` (orchestrator): `git switch -c feat/bold-red-login feat/bold-red-profile` in the build worktree.

- [ ] **Step 2: Baseline the suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS. Record the suite and test counts for the build log.

- [ ] **Step 3: Confirm each inherited name** and record the actual export form (default vs named) and prop names in the task notes handed to Codex:

| Expect | Check |
|---|---|
| `src/components/common/BrandButton.js`: props `label, onPress, variant ('primary'\|'tertiary'…), size, surface ('canvas'\|'red'), tone ('accent'\|'ink'\|'onRed'), loading, loadingLabel, disabled, accessibilityLabel`; loading exposes `accessibilityState.busy` and ignores presses | `rg -n "surface|tone|loadingLabel" src/components/common/BrandButton.js` |
| `src/components/common/TextField.js`: props `label, value, onChangeText, icon, placeholder, error, disabled, secureTextEntry, onToggleSecure, surface, inputRef, …TextInput props`; how an `error` reaches accessibility (part 1 §11: accessible name "{label}, error: {message}"; part 6: `accessibilityHint`) | read the file and `__tests__/TextField.test.js` |
| `src/components/common/InlineNote.js`: `tone, size, children`; role `alert`, polite live region, iOS announce on appear | read |
| `src/components/common/FocusAwareStatusBar.js`: `style` prop | read |
| `src/components/common/ScreenHeader.js` wired as the Auth stack's `header`; an empty `title` renders **no** element with `accessibilityRole="header"` (Children's ClassDetail loading state relies on this) | read; note whether empty-title is handled |
| `src/hooks/useKeyboardHeight.js` → number | read export form |
| `src/utils/authErrorCopy.js` `describeAuthError(error, action)` with the full part-6 table for `'sign_in'` and `'reset'` | read + `__tests__/authErrorCopy.test.js` |
| `MotionProvider` (`src/context/MotionContext.js`) and the shared screen-test render helper PR 1 added (part 1 §11 "one shared `renderWithProviders` helper") | `rg -n "renderWithProviders" test-support __tests__ | head` |
| `typeRoles.display2XL`, `displayTitle`, `displaySheetTitle`, `textParagraph`, `textInput`, `textButtonL`, `textButtonM`, `textCaption`, `textLabel`; `tints.onRedHalo`, `tints.onRedKeyline`, `tints.control`, `tints.rule`; `shadows.onRedButton`, `shadows.primaryButton` | `rg -n "display2XL|onRedKeyline|onRedButton" src/constants` |
| Ratchet lines for `src/screens/auth/LoginScreen.js` and `src/screens/auth/ForgotPasswordScreen.js` in `__tests__/designSystemGuard.test.js` | `rg -n "screens/auth" __tests__/designSystemGuard.test.js` |
| What PR 1 left in `LoginScreen.js` / `ForgotPasswordScreen.js` (expected: toast + `describeAuthError`, Paper `TextInput`, maybe a `FocusAwareStatusBar`) | read both |

- [ ] **Step 4: Decide.** If a name differs only in spelling, use the shipped name everywhere this plan uses the overview name, and record the mapping in the build-log row (Task 9). If a primitive is **missing** or behaves differently in a way a task depends on (for example `BrandButton` has no `surface="red"` primary, or `describeAuthError` lacks the reset rows), stop and ask the orchestrator; do not build a parallel component.

No commit.

---

### Task 2: Bricolage 700 face and the lockup's logo type

**Files:**
- Modify: `src/constants/typography.js`
- Modify: `App.js` (the `useFonts` call, `App.js:158-163` today)
- Test: `__tests__/typography.test.js`

**Interfaces:**
- Produces: `fontFamilies.displayBold = 'BricolageGrotesque_700Bold'`.
- Produces: `export const logoType = { wordmark, wordmarkSub }` in `typography.js`. These are **logo styles, not type roles**: they live outside `typeRoles`, so the role rules (Bricolage ≥ 18, `lineHeight ≥ fontSize`) do not apply to them, and they stay inside `typography.js` so the raw-size guard needs no exception.
  - `wordmark`: `{ fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 24, letterSpacing: 0.26 }` ("MASI", board 26/24, .01em).
  - `wordmarkSub`: `{ fontFamily: fontFamilies.displayBold, fontSize: 12, lineHeight: 15, letterSpacing: 1.56 }` ("NYUSANE", board 12/15, .13em).

- [ ] **Step 1: Write the failing tests** (append to `__tests__/typography.test.js`)

```js
import fs from 'fs';
import path from 'path';
import { logoType } from '../src/constants/typography';

describe('Login lockup type', () => {
  test('Bricolage 700 is a loaded face', () => {
    expect(fontFamilies.displayBold).toBe('BricolageGrotesque_700Bold');
  });

  test('every fontFamilies face is loaded by App.js useFonts', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
    const useFontsBlock = app.slice(app.indexOf('useFonts({'), app.indexOf('});', app.indexOf('useFonts({')));
    for (const face of Object.values(fontFamilies)) {
      expect({ face, loaded: useFontsBlock.includes(face) }).toEqual({ face, loaded: true });
    }
  });

  test('the wordmark styles match the board and are not type roles', () => {
    expect(logoType.wordmark).toEqual({
      fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 24, letterSpacing: 0.26,
    });
    expect(logoType.wordmarkSub).toEqual({
      fontFamily: fontFamilies.displayBold, fontSize: 12, lineHeight: 15, letterSpacing: 1.56,
    });
    expect(Object.values(typeRoles)).not.toContain(logoType.wordmark);
    expect(typeRoles.wordmark).toBeUndefined();
  });
});
```

If PR 1's `typography.test.js` pins the exact `fontFamilies` key set, add `displayBold` to that pin in the same step (an exact addition, nothing loosened).

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/typography.test.js`
Expected: FAIL (`displayBold` undefined, `logoType` undefined).

- [ ] **Step 3: Implement.** Add `displayBold` to `fontFamilies` and the `logoType` export with a one-line comment ("logo styles, not reading text: the lockup is the brand mark"). In `App.js`, import `BricolageGrotesque_700Bold` beside `BricolageGrotesque_800ExtraBold` and add it to `useFonts`.

- [ ] **Step 4: Run to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/typography.test.js __tests__/designSystemGuard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (orchestrator)**

```bash
git add src/constants/typography.js App.js __tests__/typography.test.js
git commit -m "feat(login): load Bricolage 700 and add the lockup's logo type"
```

---

### Task 3: `BrandLockup`, `LoginHeroArt` and the hero-art geometry

**Files:**
- Create: `src/components/auth/loginHeroGeometry.js`
- Create: `src/components/auth/LoginHeroArt.js`
- Create: `src/components/auth/BrandLockup.js`
- Test: `__tests__/loginHeroGeometry.test.js`, `__tests__/LoginBrand.test.js`

**Interfaces:**
- Consumes: `logoType` (Task 2); `colors.heroDark`, `colors.onDark`, `tints.onRedKeyline`; assets `assets/login/learner-artwork.webp` (+ `@2x`, `@3x`) and `assets/brand/masi-mark-white.png` (+ `@2x`, `@3x`), required by their base names so Metro picks the density.
- Produces: `computeHeroArtLayout({ windowWidth, windowHeight, anchorPanelTop, panelTop }) => { scale, offsetX, offsetY, visible }`
  - `scale = clamp(0.74 + (windowHeight - 640) * 0.26 / 204, 0.74, 1)`
  - `offsetX = windowWidth - 390 * scale` (right-anchored)
  - `offsetY = max(-43.8 * (1 - scale), anchorPanelTop - 446 * scale)`
  - `visible = panelTop - (offsetY + 110 * scale) >= 120` (at least 120dp of the learner shows above the panel)
  - `anchorPanelTop` is the panel top measured at rest with no note and no offline caption (the screen supplies it, Task 7); `panelTop` is the current panel top. Using the anchor for `offsetY` is what keeps the art still when the panel grows ("the crop never changes").
- Produces: `<LoginHeroArt windowWidth windowHeight scale offsetX offsetY />` (default export). Root `View` `testID="login-hero-art"`, `StyleSheet.absoluteFill`, `pointerEvents="none"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`. Inside: an `Svg` the size of the window with one `G transform={\`translate(${offsetX} ${offsetY}) scale(${scale})\`}` holding two `Circle`s at centre (486, 412), no fill: r 400 stroke `colors.heroDark` width 54; r 436 stroke `tints.onRedKeyline` width 2. Above it, the learner `Image` (`testID="login-hero-learner"`, `accessible={false}`, `resizeMode="contain"`) absolutely at `left: offsetX + 74 * scale, top: offsetY + 110 * scale, width: 296 * scale, height: 430 * scale`. No alt text (decorative, overview §8 builder gap 3).
- Produces: `<BrandLockup style />` (default export). One `View` with `accessible`, `accessibilityRole="image"`, `accessibilityLabel="Masinyusane"`, `testID="brand-lockup"`; row, `gap: 10`, `alignItems: 'center'`. Mark `Image` 48x41 (`accessible={false}`). Two stacked `Text`s in `colors.onDark` with `maxFontSizeMultiplier={1}`: "MASI" (`logoType.wordmark`) and "NYUSANE" (`logoType.wordmarkSub`, `marginTop: 2`).

- [ ] **Step 1: Write the failing geometry tests** (`__tests__/loginHeroGeometry.test.js`)

```js
import { computeHeroArtLayout } from '../src/components/auth/loginHeroGeometry';

const layout = (windowWidth, windowHeight, anchorPanelTop, panelTop = anchorPanelTop) =>
  computeHeroArtLayout({ windowWidth, windowHeight, anchorPanelTop, panelTop });

test('390x844 reproduces red-login-final', () => {
  const r = layout(390, 844, 446);
  expect(r.scale).toBe(1);
  expect(r.offsetX).toBe(0);
  expect(r.offsetY).toBeCloseTo(0, 5);
  expect(r.visible).toBe(true);
});

test('360x640 reproduces red-login-s-compact', () => {
  const r = layout(360, 640, 260);
  expect(r.scale).toBeCloseTo(0.74, 5);
  expect(r.offsetX).toBeCloseTo(71.4, 5);
  expect(r.offsetY).toBeCloseTo(-11.388, 3);
  expect(r.visible).toBe(true);
});

test('a tall phone keeps the learner tucked behind the panel', () => {
  const r = layout(430, 932, 520);
  expect(r.scale).toBe(1);
  expect(r.offsetX).toBe(40);
  expect(r.offsetY).toBeCloseTo(74, 5);
  // learner bottom (offsetY + 540) sits 94dp behind the panel top
  expect(r.offsetY + 540 * r.scale - 520).toBeCloseTo(94, 5);
});

test('scale clamps to [0.74, 1]', () => {
  expect(layout(360, 560, 200).scale).toBeCloseTo(0.74, 5);
  expect(layout(430, 1000, 600).scale).toBe(1);
});

test('a growing panel does not move the art (offset follows the anchor)', () => {
  const rest = layout(390, 844, 446, 446);
  const withNote = layout(390, 844, 446, 380);
  expect(withNote.offsetY).toBe(rest.offsetY);
  expect(withNote.scale).toBe(rest.scale);
  expect(withNote.visible).toBe(true);
});

test('large text on a short phone hides a lone head', () => {
  // panel top 150 at 360x640: only ~80dp of the learner would show
  expect(layout(360, 640, 150).visible).toBe(false);
  // boundary: exactly 120dp visible is still shown
  const r = layout(390, 844, 446);
  expect(computeHeroArtLayout({ windowWidth: 390, windowHeight: 844, anchorPanelTop: 446, panelTop: r.offsetY + 110 + 120 }).visible).toBe(true);
});
```

- [ ] **Step 2: Write the failing component tests** (`__tests__/LoginBrand.test.js`)
  - `BrandLockup` renders one element with role `image` and label "Masinyusane"; the texts "MASI" and "NYUSANE" use `logoType.wordmark` / `logoType.wordmarkSub` and `colors.onDark`; both have `maxFontSizeMultiplier` 1; the mark image source is the `masi-mark-white.png` require.
  - `LoginHeroArt` (with `scale 1, offsetX 0, offsetY 0`) has `pointerEvents="none"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`; `queryAllByRole('image')` inside it is empty; the learner image style flattens to `{ position: 'absolute', left: 74, top: 110, width: 296, height: 430 }`; at `scale 0.74, offsetX 71.4, offsetY -11.388` it is `left ≈ 126.16, top ≈ 70.01, width ≈ 219.04, height ≈ 318.2`.
  - Mock `react-native-svg` only if the installed one does not render under jest-expo (Home's `HomeScreen.test.js` shows the pattern in use).

- [ ] **Step 3: Run to verify both fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/loginHeroGeometry.test.js __tests__/LoginBrand.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement** the three files to the Interfaces above. `loginHeroGeometry.js` exports the board constants it uses (`HERO_DESIGN_WIDTH = 390`, `LEARNER = { left: 74, top: 110, width: 296, height: 430 }`) so `LoginHeroArt` reads the same numbers.

- [ ] **Step 5: Run to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/loginHeroGeometry.test.js __tests__/LoginBrand.test.js __tests__/designSystemGuard.test.js`
Expected: PASS (the guard sees no raw hex and no raw font sizes in `src/components/auth/`).

- [ ] **Step 6: Commit (orchestrator)**

```bash
git add src/components/auth/loginHeroGeometry.js src/components/auth/LoginHeroArt.js src/components/auth/BrandLockup.js __tests__/loginHeroGeometry.test.js __tests__/LoginBrand.test.js
git commit -m "feat(login): brand lockup, hero art and its scale/hide geometry"
```

---

### Task 4: `TextField` on red, and form-placed errors

**Files:**
- Modify: `src/components/common/TextField.js` (built in PR 1)
- Test: `__tests__/TextField.test.js` (exists from PR 1; append)

**Interfaces:**
- Consumes: PR 1's `TextField` and its canvas states (unchanged).
- Produces: `surface="red"` states (part 6 "TextField" table, Login column):

| State | Box border (always 2dp) | Halo (absolute sibling at inset −4, radius 18, no layout space) | Icon / label |
|---|---|---|---|
| Rest | `'transparent'` | none | icon `colors.text` with a value or focus, else `colors.textSecondary`; label `colors.textSecondary` |
| Focused | `colors.text` | 4dp `tints.onRedHalo` | as rest |
| Invalid (`error` set) | `colors.error` | 4dp `colors.errorBg` | `colors.error` |
| Disabled (`disabled`) | as its state | as its state | value `opacity: 0.7`; icon, label and trailing eye button `opacity: 0.5`; `editable={false}`; eye button disabled |

- Produces: new prop `errorPlacement = 'field' | 'form'` (default `'field'`). `'field'`: today's behaviour (ring + `InlineNote` 8dp under the box). `'form'`: the ring, the error colours and the error accessibility exactly as `'field'`, but **no** note under the box (the screen draws one form-level note). Login's "both empty" state uses it.
- Produces: `testID` passes to the `TextInput`; the box gets `${testID}-box` and the halo `${testID}-halo` (keep PR 1's names if it already has them, and use those in the tests).
- Unchanged: the label is the accessible name, the error accessibility contract PR 1 shipped (Task 1 Step 3), box tap focuses the input, masked value 20/24 ls 2.8, the secure toggle labels "Show password" / "Hide password", no `NO_TEXT_SUGGESTIONS` by default.

- [ ] **Step 1: Write the failing tests** (append; mock `@expo/vector-icons` so icons are inspectable: `Ionicons: ({ name, color, style }) => { const { Text } = require('react-native'); return <Text testID={\`icon-${name}\`} style={[{ color }, style]}>{name}</Text>; }`)
  - `red rest has a transparent border and no halo`: render `<TextField surface="red" label="Email" icon="mail-outline" value="" onChangeText={jest.fn()} testID="email" />`; `StyleSheet.flatten(getByTestId('email-box').props.style).borderColor === 'transparent'`, `borderWidth === 2`; `queryByTestId('email-halo')` is null; icon colour `colors.textSecondary`.
  - `red focus draws an ink border and the white halo`: `fireEvent(getByTestId('email'), 'focus')` → box `borderColor === colors.text`; halo `backgroundColor` (or `borderColor`, whichever PR 1's canvas halo uses) `=== tints.onRedHalo`; icon `colors.text`.
  - `red error rings in error with the errorBg halo`: `error="Please enter a valid email address"` → box `borderColor === colors.error`, halo colour `colors.errorBg`, icon and label `colors.error`, one `alert` note with that text.
  - `red disabled dims value and chrome but keeps layout`: `disabled secureTextEntry onToggleSecure={jest.fn()} value="secret"` → input `editable === false`; input style `opacity 0.7`; icon, label and the "Show password" button `opacity 0.5`; the eye button has `accessibilityState.disabled === true` and pressing it does not call `onToggleSecure`.
  - `form placement keeps the ring and the accessibility but draws no note`: `error="Please enter both email and password" errorPlacement="form"` → `queryByRole('alert')` is null; box border `colors.error`; the input carries the error text through PR 1's contract (hint or "{label}, error: …").
  - The existing canvas tests stay unchanged and green.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/TextField.test.js`
Expected: FAIL on the new red-surface and `errorPlacement` cases only.

- [ ] **Step 3: Implement** the red states and `errorPlacement` in `TextField.js`. Keep the canvas branch byte-for-byte in behaviour (Profile's password sheet and the PR 1 forms depend on it).

- [ ] **Step 4: Run to verify they pass, plus the consumers**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/TextField.test.js __tests__/ChangePasswordSheet.test.js __tests__/domainTextInputAudit.test.js`
Expected: PASS (use PR 5's actual password-sheet test file name if it differs).

- [ ] **Step 5: Commit (orchestrator)**

```bash
git add src/components/common/TextField.js __tests__/TextField.test.js
git commit -m "feat(text-field): red-field states and form-placed errors for Log in"
```

---

### Task 5: `useNetworkOffline`

**Files:**
- Create: `src/hooks/useNetworkOffline.js`
- Test: `__tests__/useNetworkOffline.test.js`

**Interfaces:**
- Produces: `export function isDefinitelyOffline(state) => boolean` — `state?.isConnected === false || state?.isInternetReachable === false`. `null`/`undefined` fields count as **not** offline.
- Produces: `export function useNetworkOffline() => boolean`. Subscribes once with `NetInfo.addEventListener` (v11 delivers the current state on subscribe), starts `false`, returns `isDefinitelyOffline(latest)`, and calls the returned unsubscribe on unmount. No `NetInfo.fetch`, no provider, no sync. A comment beside the hook records overview S2: signed-in screens keep `useOffline()`, and `OfflineContext` deliberately treats `isConnected: null` as offline while this hook treats unknown as online so nothing flashes at launch.

- [ ] **Step 1: Write the failing tests**

```js
import { act, renderHook } from '@testing-library/react-native';

let mockListener;
const mockUnsubscribe = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener) => { mockListener = listener; return mockUnsubscribe; }),
}));

import NetInfo from '@react-native-community/netinfo';
import { isDefinitelyOffline, useNetworkOffline } from '../src/hooks/useNetworkOffline';

test.each([
  [{ isConnected: false, isInternetReachable: null }, true],
  [{ isConnected: true, isInternetReachable: false }, true],
  [{ isConnected: true, isInternetReachable: true }, false],
  [{ isConnected: null, isInternetReachable: null }, false],
  [{ isConnected: true, isInternetReachable: null }, false],
  [undefined, false],
])('isDefinitelyOffline(%j) is %s', (state, expected) => {
  expect(isDefinitelyOffline(state)).toBe(expected);
});

test('follows NetInfo, starts online, and unsubscribes on unmount', () => {
  const { result, unmount } = renderHook(() => useNetworkOffline());
  expect(result.current).toBe(false);
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);

  act(() => mockListener({ isConnected: false, isInternetReachable: false }));
  expect(result.current).toBe(true);
  act(() => mockListener({ isConnected: true, isInternetReachable: true }));
  expect(result.current).toBe(false);

  unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/useNetworkOffline.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/hooks/useNetworkOffline.js` to the Interfaces above.

- [ ] **Step 4: Run to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/useNetworkOffline.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit (orchestrator)**

```bash
git add src/hooks/useNetworkOffline.js __tests__/useNetworkOffline.test.js
git commit -m "feat(login): useNetworkOffline, a signed-out definitely-offline signal"
```

---

### Task 6: Log in — the red field, the panel, inline errors, offline caption, loading (Forgot hidden)

This task rebuilds `LoginScreen` at its **rest** layout: red field, lockup, bottom-anchored panel. The hero art and the keyboard/compact layouts come in Task 7, so this task's reviewer judges behaviour and the panel only.

**Files:**
- Modify (rewrite): `src/screens/auth/LoginScreen.js`
- Create: `src/screens/auth/loginFormErrors.js`
- Modify: `__tests__/designSystemGuard.test.js` (delete the `LoginScreen.js` ratchet line)
- Test: `__tests__/LoginScreen.test.js` (new; replaces any PR 1 Login toast test, whose suspended-copy assertion moves here inline)

**Interfaces:**
- Consumes: `BrandLockup` (Task 3); `TextField surface="red"`, `errorPlacement` (Task 4); `useNetworkOffline` (Task 5); PR 1's `BrandButton`, `InlineNote`, `FocusAwareStatusBar`, `describeAuthError`; `useAuth().signIn` (unchanged).
- Produces (`loginFormErrors.js`, pure):
  - `validateLoginInput(email, password) => LoginError | null`, where `LoginError = { kind: 'empty', email: boolean, password: boolean } | { kind: 'format' } | { kind: 'server', message: string }`. Order and rules exactly as today: any empty → `empty` (flags mark which are empty); else regex fails → `format`; else `null`.
  - `clearLoginErrorOnEdit(error, field: 'email'|'password', nextValue) => LoginError | null`: `empty` → unflag `field` when `nextValue` is non-empty, and return `null` once no flag remains; `format` → `null` on any Email edit, unchanged on a Password edit; `server` → `null` on any edit.
  - `LOGIN_COPY` constants: `emptyBoth: 'Please enter both email and password'`, `invalidEmail: 'Please enter a valid email address'`, `offline: 'You’re offline. Sign in needs the internet.'`, `footnote: 'This app is for Masinyusane staff only.'`.

**Screen structure (rest, all values dp; part 6 "Login: layout" with the Forgot row removed):**
- Root `View` `flex: 1`, `backgroundColor: colors.red600`; `<FocusAwareStatusBar style="light" />`. `KeyboardAvoidingView behavior="padding" enabled={Platform.OS === 'ios'}` wraps a `ScrollView` (`keyboardShouldPersistTaps="handled"`, `contentContainerStyle={{ flexGrow: 1 }}`, `bounces={false}`).
- Inside the scroll content: `BrandLockup` absolute at `left: 24, top: lockupTop` where **`lockupTop = Math.max(insets.top + 9, 40)`** (reproduces 56 at a 47dp inset and 40 at a 24dp inset; see Decisions), then a spacer `View` (`flexGrow: 1, minHeight: lockupTop + 74`), then the panel.
- Panel `View` `testID="login-panel"`: `backgroundColor: colors.red700`, `borderTopLeftRadius`/`borderTopRightRadius: borderRadius.xl` (22), no shadow, padding top 24, sides 24, bottom `Math.max(insets.bottom, 24)`. Its content column `testID="login-panel-content"`, in order:
  1. Heading "Sign in": `typeRoles.display2XL`, `colors.onDark`, `accessibilityRole="header"`, `maxFontSizeMultiplier={1.2}`.
  2. Offline caption (only when `useNetworkOffline()`): `marginTop: 10`, row, `gap: 8`, `alignItems: 'flex-start'`; `cloud-offline-outline` 18 `colors.onDark`; text `typeRoles.textCaption` `colors.red50`, `flex: 1`; `accessibilityLiveRegion="polite"`. On iOS, `AccessibilityInfo.announceForAccessibility(LOGIN_COPY.offline)` once per false→true transition.
  3. Email `TextField surface="red"`: label "Email", icon `mail-outline`, placeholder "you@masinyusane.org", `keyboardType="email-address"`, `autoCapitalize="none"`, `returnKeyType="next"`, `onSubmitEditing` focuses Password through its `inputRef`, `submitBehavior="submit"` (keeps the keyboard up). `marginTop`: 16 below the offline caption; else 10 when any error note shows; else 16 when `windowHeight < 700`; else 18. Error: `format` → `error={LOGIN_COPY.invalidEmail}` (field note); `empty && email` → `error={LOGIN_COPY.emptyBoth} errorPlacement="form"`.
  4. Password `TextField surface="red"`, `marginTop: 12`: label "Password", icon `lock-closed-outline`, placeholder "Your password", `secureTextEntry={!showPassword}`, `onToggleSecure`, `returnKeyType="go"`, `onSubmitEditing={handleLogin}`. `empty && password` → `error={LOGIN_COPY.emptyBoth} errorPlacement="form"`.
  5. Form-level `InlineNote tone="error"` (`testID="login-form-note"`), `marginTop: 12`: `empty` → `LOGIN_COPY.emptyBoth`; `server` → its `message`.
  6. `BrandButton variant="primary" surface="red" size="lg" label="Sign in" loadingLabel="Signing in…" loading={loading} onPress={handleLogin}`, `marginTop`: 12 after the form note, else 20.
  7. Footnote `LOGIN_COPY.footnote`: `typeRoles.textCaption`, `colors.red50`, centred, `marginTop: 16`. Always shown.
- **No** "Forgot password?" element, no Paper import, no `Snackbar`, no toast call.
- `handleLogin`: return if `loading`; `setError(validateLoginInput(email, password))` and return if non-null; else `setError(null)`, `setLoading(true)`, `const { error } = await signIn(email, password)`; on error → `setError({ kind: 'server', message: describeAuthError(error, 'sign_in') })` and `setLoading(false)`; on success set **no** state (`AppRoot` unmounts the screen, as today).
- Edits call `clearLoginErrorOnEdit` for their field before updating the value.
- While `loading`: both fields `disabled`, the eye button disabled (via `TextField disabled`).

- [ ] **Step 1: Write the failing tests** (`__tests__/LoginScreen.test.js`). Harness:

```js
global.__MASI_NO_DEFAULT_HANDLE__ = true;
const mockSignIn = jest.fn();
const mockStatusBar = jest.fn();
let mockListener;
const mockUnsubscribe = jest.fn();
let mockKeyboardHeight = 0;
let mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener) => { mockListener = listener; return mockUnsubscribe; }),
}));
// Use the export form Task 1 recorded for useKeyboardHeight.
jest.mock('../src/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => mockKeyboardHeight }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => mockWindow,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
  SafeAreaProvider: ({ children }) => children,
}));
// Use the export form Task 1 recorded for FocusAwareStatusBar.
jest.mock('../src/components/common/FocusAwareStatusBar', () => ({
  __esModule: true, default: (props) => { mockStatusBar(props); return null; },
}));
```

Render with the providers `BrandButton`/`InlineNote` need (PR 1's shared helper, or `MotionProvider value={{ motionLevel: 'full', reduceMotion: false, tier: 'high' }}`), passing `navigation={{ navigate: jest.fn() }}`. Query fields with `getByLabelText(/^Email/)` and `getByLabelText(/^Password/)`. Read a field's error through one helper that matches PR 1's contract:

```js
const fieldError = (input) =>
  input.props.accessibilityHint ?? input.props.accessibilityLabel.split(', error: ')[1];
```

Tests (part 6 "Tests" 1–12, 14, 15, adjusted for the hidden link, plus Review Focus 2–4):
  1. `renders the board's content`: header "Sign in"; fields labelled Email and Password with placeholders "you@masinyusane.org" / "Your password"; button "Sign in"; the footnote; `getByLabelText('Masinyusane')`; no "Sign in to continue"; `mockStatusBar` last called with `{ style: 'light' }`.
  2. `Forgot password is hidden`: `queryByText(/forgot password/i)` is null and no element has that label.
  3. `both empty`: press Sign in → form note "Please enter both email and password"; `fieldError(email)` and `fieldError(password)` both equal it; `mockSignIn` not called; no note under either field (`getAllByRole('alert')` has length 1). Type an email → `fieldError(email)` undefined, Password still marked, note still shown. Type a password → note gone, no field marked.
  4. `only password empty`: email "asanda.mbeki@masinyusane.org", press → only Password marked; same note.
  5. `invalid email`: "asanda.mbeki@masinyusane" + password, press → one note "Please enter a valid email address", `fieldError(email)` equals it, Password unmarked; `mockSignIn` not called; editing Password keeps it; editing Email clears it.
  6. `invalid credentials`: `mockSignIn.mockResolvedValue({ data: null, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } })` → note "Invalid login credentials", no field marked; editing Password clears it; press again → the note is gone **before** `mockSignIn`'s second promise resolves (hold it with a deferred).
  7. `suspended EA`: `{ code: 'user_banned', message: 'User is banned', status: 400 }` → "Your access is paused. Please contact your supervisor."; `queryByText(/User is banned/)` null.
  8. `no connection`: `new AuthRetryableFetchError('Network request failed', 0)` (import from `@supabase/supabase-js`) → "Couldn’t reach Masi. Check your internet connection and try again."
  9. `unknown error`: `{ message: 'boom' }` → "Couldn’t sign in. Please try again."; `queryByText('boom')` null.
  10. `while signing in`: deferred `signIn` → button text "Signing in…", `accessibilityState.busy === true`; both inputs `editable === false`; pressing the button again and `fireEvent(password, 'submitEditing')` (Review Focus 3) leave `mockSignIn` at one call.
  11. `go with empty fields validates`: `fireEvent(password, 'submitEditing')` with both empty → the empty note, `mockSignIn` not called.
  12. `success leaves the button busy and unmounts cleanly` (Review Focus 4): resolve `{ data: {}, error: null }`, flush, button still "Signing in…"; `unmount()` → `mockUnsubscribe` called once and no React act/state warning (`jest.spyOn(console, 'error')` not called).
  13. `offline caption`: `act(() => mockListener({ isConnected: false, isInternetReachable: null }))` → "You’re offline. Sign in needs the internet." shown and Sign in still calls `mockSignIn` with valid input; `{ isConnected: true, isInternetReachable: true }` → hidden; `{ isConnected: true, isInternetReachable: false }` → shown; `{ isConnected: null, isInternetReachable: null }` → not shown. With `Platform.OS === 'ios'` (the jest-expo default), `AccessibilityInfo.announceForAccessibility` is called with the caption once per appearance and not on unrelated re-renders.
  14. `offline mid-request` (Review Focus 2): start a deferred sign-in, emit offline → caption shown while the button is busy; resolve it with `{ data: null, error: new AuthRetryableFetchError('Network request failed', 0) }` → connection note **and** caption; emit online → caption hidden, note still shown; edit Email → note gone.
  15. `eye button`: "Show password" → press → "Hide password", Password `secureTextEntry` flips true → false.
  16. `Email submit moves to Password`: clear RN's `MockNativeMethods.focus` (`require('react-native/jest/MockNativeMethods').default.focus`), `fireEvent(email, 'submitEditing')` → called once; `mockSignIn` not called.
  17. `no Snackbar or toast in any state`: after tests 3, 6 and 13's states, `UNSAFE_queryAllByType(require('react-native-paper').Snackbar)` is empty (and, if PR 1's toast host is in the helper, no toast message is rendered).
  18. `panel tokens`: `StyleSheet.flatten(getByTestId('login-panel').props.style)` has `backgroundColor: colors.red700`, top radii 22, `paddingBottom: 34` at a 34 inset; with `mockInsets.bottom = 0` it is 24. Root background `colors.red600`. Heading style matches `typeRoles.display2XL` and `colors.onDark`; footnote matches `typeRoles.textCaption` and `colors.red50`.

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LoginScreen.test.js`
Expected: FAIL (old screen: no heading, Paper inputs, toast).

- [ ] **Step 3: Implement** `loginFormErrors.js` and rewrite `LoginScreen.js` to the structure above. Delete the `src/screens/auth/LoginScreen.js` line from the ratchet list in `__tests__/designSystemGuard.test.js` (the file now has no raw sizes and no Paper inputs).

- [ ] **Step 4: Run to verify it passes, with the guards**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LoginScreen.test.js __tests__/designSystemGuard.test.js __tests__/domainTextInputAudit.test.js __tests__/authErrorCopy.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (orchestrator)**

```bash
git add src/screens/auth/LoginScreen.js src/screens/auth/loginFormErrors.js __tests__/LoginScreen.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(login): Bold Red Log in with inline errors and the offline caption; hide Forgot password"
```

(If PR 1 left a Login toast test in another file, delete or move its assertions in this commit and stage that file too.)

---

### Task 7: Log in — hero art, keyboard and compact layouts

**Files:**
- Create: `src/screens/auth/loginLayout.js`
- Modify: `src/screens/auth/LoginScreen.js`
- Test: `__tests__/loginLayout.test.js`, `__tests__/LoginScreen.test.js` (append a `describe('layout')`)

**Interfaces:**
- Consumes: `computeHeroArtLayout`, `LoginHeroArt` (Task 3); `useKeyboardHeight` (PR 1); Task 6's screen.
- Produces: `computeLoginLayout({ windowHeight, insetsTop, keyboardHeight, standardPanelHeight }) => { mode: 'rest' | 'keyboard' | 'keyboardCompact', lockupTop, showLockup }`
  - `lockupTop = Math.max(insetsTop + 9, 40)`.
  - `keyboardHeight === 0` → `'rest'`, `showLockup: true`.
  - Otherwise `'keyboardCompact'` when `standardPanelHeight` is known and `lockupTop + 74 + standardPanelHeight > windowHeight - keyboardHeight`; else `'keyboard'`. `showLockup` is false only in `'keyboardCompact'`.
  - `standardPanelHeight` = the panel content column's measured height + 24 top padding + 24 bottom padding, measured in `'rest'` or `'keyboard'` mode only (never in compact, whose content is smaller). The screen keeps the latest such measurement in a ref.

**Screen changes:**
- Measure: `onLayout` on `login-panel` → `panelTop` (its `y`); `onLayout` on `login-panel-content` → `standardPanelHeight` (outside compact). `anchorPanelTop` = the latest `panelTop` measured in `'rest'` while no note and no offline caption shows; until one exists, use the current `panelTop`.
- Art: `const art = computeHeroArtLayout({ windowWidth, windowHeight, anchorPanelTop, panelTop })`; render `<LoginHeroArt windowWidth={windowWidth} windowHeight={windowHeight} scale={art.scale} offsetX={art.offsetX} offsetY={art.offsetY} />` behind the scroll view (first child of the root, absolute) only when `mode === 'rest'`, a `panelTop` has been measured (no first-frame flash at the wrong place), and the layout's `visible` is true. Appear/disappear is instant (no animation).
- `'keyboard'`: lockup stays at `lockupTop`; the spacer becomes a fixed `height: lockupTop + 74` (no grow); the panel takes `flexGrow: 1` so it reaches the keyboard's top edge; panel bottom padding 24.
- `'keyboardCompact'`: no lockup; spacer `height: insets.top`; panel `flexGrow: 1`, padding top 16, bottom 24; heading style `typeRoles.displaySheetTitle` (same multiplier cap 1.2); Email `marginTop` 12 (16 when the offline caption shows); footnote `marginTop` 12.
- The `ScrollView` stays the overflow fallback (3-button navigation, large text): content scrolls; the focused field stays visible.

- [ ] **Step 1: Write the failing layout tests** (`__tests__/loginLayout.test.js`)

```js
import { computeLoginLayout } from '../src/screens/auth/loginLayout';

test('rest reproduces both boards’ lockup top', () => {
  expect(computeLoginLayout({ windowHeight: 844, insetsTop: 47, keyboardHeight: 0, standardPanelHeight: 360 }))
    .toEqual({ mode: 'rest', lockupTop: 56, showLockup: true });
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 0, standardPanelHeight: 348 }).lockupTop)
    .toBe(40);
});

test('a 390x844 phone keeps the standard keyboard layout', () => {
  expect(computeLoginLayout({ windowHeight: 844, insetsTop: 47, keyboardHeight: 336, standardPanelHeight: 360 }))
    .toEqual({ mode: 'keyboard', lockupTop: 56, showLockup: true });
});

test('360x640 with a 280 keyboard goes compact and hides the lockup', () => {
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 280, standardPanelHeight: 348 }))
    .toEqual({ mode: 'keyboardCompact', lockupTop: 40, showLockup: false });
});

test('a note pushes a 360x780 phone into compact', () => {
  const base = { windowHeight: 780, insetsTop: 24, keyboardHeight: 300 };
  expect(computeLoginLayout({ ...base, standardPanelHeight: 348 }).mode).toBe('keyboard');
  expect(computeLoginLayout({ ...base, standardPanelHeight: 398 }).mode).toBe('keyboardCompact');
});

test('an unmeasured panel never forces compact', () => {
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 280, standardPanelHeight: null }).mode)
    .toBe('keyboard');
});
```

- [ ] **Step 2: Write the failing screen tests** (append to `__tests__/LoginScreen.test.js`; helper `layoutPanel(y, contentHeight)` fires `layout` on `login-panel` with `{ y, height: contentHeight + 58 }` and on `login-panel-content` with `{ height: contentHeight }`)
  - `art waits for the first panel layout`: before `layoutPanel`, `queryByTestId('login-hero-art')` is null; after `layoutPanel(484, 312)` at 390x844 it renders.
  - `keyboard hides the art and keeps the lockup` (part 6 test 13a): set `mockKeyboardHeight = 336`, rerender → no `login-hero-art`, `getByLabelText('Masinyusane')` present.
  - `compact keyboard hides the lockup and steps the heading down` (13b): `mockWindow = { width: 360, height: 640, … }`, `mockInsets.top = 24`, `layoutPanel(292, 300)`, then `mockKeyboardHeight = 280`, rerender → no lockup, no art; heading style matches `typeRoles.displaySheetTitle`; footnote `marginTop` 12.
  - `compact uses the height measured with the note` (Review Focus 1): at 360x780 (top inset 24) with `layoutPanel(…, 290)` the 300 keyboard keeps the lockup; trigger the empty-fields note and re-measure `layoutPanel(…, 340)`, then open the keyboard → lockup hidden.
  - `the art does not move when the note appears` (Review Focus 5): at 390x844 `layoutPanel(484, 312)`; record `login-hero-learner`'s flattened `top`; press Sign in with empty fields; `layoutPanel(420, 376)` → the learner `top` is unchanged.
  - `large text on a short phone drops the art`: 360x640, `layoutPanel(150, 432)` → no `login-hero-art`.

- [ ] **Step 3: Run to verify both fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/loginLayout.test.js __tests__/LoginScreen.test.js`
Expected: FAIL on the new cases only; Task 6's cases still pass.

- [ ] **Step 4: Implement** `loginLayout.js` and the screen changes above.

- [ ] **Step 5: Run to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/loginLayout.test.js __tests__/LoginScreen.test.js __tests__/loginHeroGeometry.test.js __tests__/designSystemGuard.test.js`
Expected: PASS.

- [ ] **Step 6: Commit (orchestrator)**

```bash
git add src/screens/auth/loginLayout.js src/screens/auth/LoginScreen.js __tests__/loginLayout.test.js __tests__/LoginScreen.test.js
git commit -m "feat(login): hero art, keyboard and compact layouts"
```

---

### Task 8: Reset password restyle and the Auth stack

The screen is unreachable from Log in after Task 6, but it is restyled and tested so recovery can re-enable it with one link.

**Files:**
- Modify (rewrite): `src/screens/auth/ForgotPasswordScreen.js`
- Modify: `src/navigation/AppNavigator.js` (`AuthNavigator`, `:64-77` today: add `export`, set the Reset options)
- Modify: `__tests__/designSystemGuard.test.js` (delete the `ForgotPasswordScreen.js` ratchet line)
- Modify, only if Task 1 found that an empty title still renders a header-role element: `src/components/common/ScreenHeader.js` + its test
- Modify, only if it asserts the old Reset title or `headerBackTitle`: `__tests__/AppNavigator.headers.test.js`
- Test: `__tests__/ForgotPasswordScreen.test.js` (new), `__tests__/AuthNavigator.test.js` (new)

**Interfaces:**
- Consumes: `TextField surface="canvas"`, `InlineNote`, `BrandButton` (`primary`, `tertiary tone="ink"`), `describeAuthError(error, 'reset')`, the navigator-rendered `ScreenHeader`, `useAuth().resetPassword` (unchanged).
- Produces: `export function AuthNavigator()` (named export; `AppNavigator` still renders it). Screens: `Login` (initial) and `ForgotPassword` with `options={{ headerShown: true, title: 'Reset password' }}` (the `header` comes from PR 1's stack `screenOptions`; drop `headerBackTitle`).

**Screen (part 6 "Reset password", with the name map):**
- Form state: `error: { kind: 'format' } | { kind: 'server', message: string } | null`; `loading`; `success`. Validation unchanged (`!email || !email.includes('@')` → `format`).
- `handleReset` (the same shape as Task 6's `handleLogin`): return if `loading`; on a format failure `setError({ kind: 'format' })` and return; else `setError(null)`, `setLoading(true)`, `const { error: resetError } = await resetPassword(email)`; on `resetError` → `setError({ kind: 'server', message: describeAuthError(resetError, 'reset') })` and `setLoading(false)`; on success `setSuccess(true)` and `setLoading(false)`. The mapping happens **here, at response time**, on the original error: `AuthContext.resetPassword` returns it intact (`src/context/AuthContext.js:281–290`), and `describeAuthError` reads its `code`, retryable-fetch identity and `status`, none of which the stored state keeps. State only ever holds the finished copy.
- Form (canvas `colors.background`, `KeyboardAvoidingView behavior="padding" enabled={Platform.OS === 'ios'}` around a `ScrollView keyboardShouldPersistTaps="handled"`, content padding top 10, sides 24):
  - Paragraph "Enter your email address and we’ll send you instructions to reset your password." `typeRoles.textParagraph`, `colors.textSecondary`, `maxWidth: 330`.
  - `TextField surface="canvas"` label "Email", icon `mail-outline`, no placeholder, `autoFocus`, `keyboardType="email-address"`, `autoCapitalize="none"`, `returnKeyType="send"`, `onSubmitEditing={handleReset}`, `marginTop: 20`, `disabled={loading}`; `format` → `error="Please enter a valid email address"`. Editing clears any error.
  - `server` → `InlineNote tone="error"` rendering `error.message` directly, `marginTop: 20`. Never call `describeAuthError` in render: passing it the `{ kind, message }` state object loses `code` and `status`, so rate-limit and connection failures would fall through to the generic reset copy.
  - `BrandButton variant="primary" label="Send reset link" loadingLabel="Sending…"`, `marginTop`: 12 after the server note, else 20. Ignores taps while loading.
  - `BrandButton variant="tertiary" tone="ink" label="Back to sign in"`, `marginTop: 8`, `onPress={() => navigation.goBack()}`, disabled while loading.
- Sent (`success`): `useLayoutEffect` → `navigation.setOptions({ title: '' })` (the header keeps only its Back circle). Body:
  - centred block `flex: 1`, `justifyContent: 'center'`, `paddingBottom: 48`, sides 24: tile 80x80, radius 22 (`borderRadius.xl`), `colors.surface`, 1dp `tints.rule` border, `mail-outline` 40 `colors.text`, decorative (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`).
  - "Check your email" `typeRoles.displayTitle` `colors.text`, `marginTop: 28`, `accessibilityRole="header"`, centred.
  - `marginTop: 12`, centred `typeRoles.textParagraph` `colors.text`: `If an account exists with{'\n'}<Text style={{ fontFamily: fontFamilies.textHeavy }}>{email}</Text>,{'\n'}you will receive a password reset link shortly.`
  - `marginTop: 14`, `typeRoles.textParagraph` `colors.textSecondary`, `maxWidth: 300`, centred, not italic: "Please check your email and follow the instructions to reset your password."
  - Bottom: `BrandButton variant="primary" label="Back to sign in"`, padding sides 24, bottom `Math.max(insets.bottom, 24)`, `onPress={() => navigation.popTo('Login')}` (overview §8 R5).
- No `FocusAwareStatusBar` (canvas screen; the root dark style applies). Remove one if PR 1 added it here. No Paper import, no `Snackbar`, no toast.

- [ ] **Step 1: Write the failing screen tests** (`__tests__/ForgotPasswordScreen.test.js`; mock `useAuth` → `{ resetPassword: mockResetPassword }`, safe-area insets, Ionicons; `navigation = { goBack: jest.fn(), popTo: jest.fn(), setOptions: jest.fn() }`)
  1. `form content`: paragraph text with the curly "we’ll"; field labelled Email; buttons "Send reset link" and "Back to sign in"; paragraph style matches `typeRoles.textParagraph` + `colors.textSecondary`.
  2. `invalid email`: "asanda.mbeki" → press Send → one note "Please enter a valid email address" (the field's own note); `mockResetPassword` not called; editing clears it.
  3. `rate limited`: `mockResetPassword.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } })` → "Too many reset emails were requested. Please wait a while and try again." above the button (the note precedes "Send reset link" in render order); no Snackbar.
  4. `no connection`: `new AuthRetryableFetchError('Network request failed', 0)` → "Couldn’t reach Masi. Check your internet connection and try again." (Tests 3 and 4 are the guard for the response-time mapping: both fail if the screen maps the stored state instead of the original error.)
  5. `pending`: deferred → button "Sending…" with `busy`; the input `editable === false`; a second press leaves one call.
  6. `sent`: resolve `{ error: null }` for "asanda.mbeki@masinyusane.org" → header "Check your email"; `getByText(/If an account exists with\s+asanda\.mbeki@masinyusane\.org,\s+you will receive a password reset link shortly\./)`; the address is a nested `Text` with `fontFamily: fontFamilies.textHeavy`; the note text is not italic; `navigation.setOptions` called with `{ title: '' }`; exactly one element with role header on the screen body; "Back to sign in" calls `navigation.popTo('Login')` (not `navigate`).
  7. `form Back to sign in` calls `navigation.goBack()`.
  8. `a 42-character address renders whole`: "nomvula.dlamini-khumalo@masinyusane.org.za" (42 chars) appears complete in the sent body (wrapping is a device check, D10).

- [ ] **Step 2: Write the failing stack test** (`__tests__/AuthNavigator.test.js`; real `@react-navigation/native-stack`, **not** mocked; mock `../src/screens/auth/LoginScreen` as `() => <Text>Login screen</Text>`; mock `useAuth`, safe-area, Ionicons, observability as `AppNavigator.headers.test.js` does)

```js
test('sent → Back to sign in leaves exactly one Login and Back cannot reopen Reset', async () => {
  mockResetPassword.mockResolvedValue({ error: null });
  const ref = createNavigationContainerRef();
  const screen = render(
    <Providers>{/* PR 1 helper or PaperProvider + MotionProvider */}
      <NavigationContainer ref={ref} initialState={{ index: 1, routes: [{ name: 'Login' }, { name: 'ForgotPassword' }] }}>
        <AuthNavigator />
      </NavigationContainer>
    </Providers>
  );
  expect(ref.getRootState().routeNames).toEqual(['Login', 'ForgotPassword']);
  expect(await screen.findByRole('header', { name: 'Reset password' })).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText(/^Email/), 'asanda.mbeki@masinyusane.org');
  fireEvent.press(screen.getByText('Send reset link'));
  expect(await screen.findByText('Check your email')).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Reset password' })).toBeNull();

  fireEvent.press(screen.getByText('Back to sign in'));
  await waitFor(() => expect(ref.getRootState().routes.map((r) => r.name)).toEqual(['Login']));
  expect(ref.canGoBack()).toBe(false);
  expect(screen.getByText('Login screen')).toBeTruthy();
});

test('the header Back circle returns to Login', async () => { /* initialState as above; press getByLabelText('Back'); routes become ['Login'] */ });
```

Fallback, only if the real native stack cannot mount under jest-expo (an error from `react-native-screens`): keep test 6's `popTo('Login')` assertion and add a router test with `StackRouter({}).getStateForAction` on the state `[Login, ForgotPassword]`: `StackActions.popTo('Login')` gives `[Login]`, and `CommonActions.navigate('Login')` gives `[Login, ForgotPassword, Login]` (the R5 probe result, which proves why `navigate` is wrong). Record the fallback in the build log.

- [ ] **Step 3: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ForgotPasswordScreen.test.js __tests__/AuthNavigator.test.js`
Expected: FAIL (old screen; `AuthNavigator` not exported).

- [ ] **Step 4: Implement** the screen, the `AuthNavigator` export and options, and (only if Task 1 found it needed) the `ScreenHeader` empty-title fix with a test "an empty title renders no header-role element". Delete the `ForgotPasswordScreen.js` ratchet line.

- [ ] **Step 5: Run to verify they pass, with neighbours**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ForgotPasswordScreen.test.js __tests__/AuthNavigator.test.js __tests__/AppNavigator.headers.test.js __tests__/designSystemGuard.test.js __tests__/domainTextInputAudit.test.js`
Expected: PASS.

- [ ] **Step 6: Commit (orchestrator)**

```bash
git add src/screens/auth/ForgotPasswordScreen.js src/navigation/AppNavigator.js __tests__/ForgotPasswordScreen.test.js __tests__/AuthNavigator.test.js __tests__/designSystemGuard.test.js
# plus src/components/common/ScreenHeader.js, its test, and __tests__/AppNavigator.headers.test.js if Step 4 changed them
git commit -m "feat(login): Bold Red Reset password; Back to sign in pops to Login"
```

---

### Task 9: Recovery issue, standing docs, build log

**Files:**
- Modify: `documentation/design-system.md`
- Modify: `documentation/build-log.md`
- Modify: `documentation/ROADMAP.md` §5
- Modify: `PRD.md` §6.1

- [ ] **Step 1 (manual, orchestrator — not Codex): file the issue.**

```bash
gh issue create --repo JimMcKeown17/masi-app \
  --title "Password recovery: deep link + set-new-password screen" \
  --label needs-triage \
  --body "<body below>"
```

Body: the reset email uses `redirectTo: 'masi-app://reset-password'` (`src/context/AuthContext.js` `resetPassword`), but the app has no `linking` config, `detectSessionInUrl: false` (`src/services/supabaseClient.js`), no code/token exchange, and `updatePassword` has no caller; whether the URL is in `masi-app-sqlite`'s redirect allow-list is unknown. Jim decided (2026-10-19) to hide "Forgot password?" until recovery works end to end. The Bold Red Reset screen is built and tested but unreachable. Done when: deep link handled, a set-new-password screen calls `updatePassword`, the link is restored on Log in (a `BrandButton variant="tertiary" tone="onRed"` "Forgot password?", right-aligned, 44 tall, 4 below Password, disabled while signing in: part 6 "Buttons"), and part 6 device checks D9 and D10 pass. Link the Bold Red spec part 6. Record the issue number for Steps 2–4.

- [ ] **Step 2: `documentation/design-system.md`** (in the primitives section PR 1 wrote; adapt headings to it):
  - `TextField`: the `surface="red"` state table (rest transparent, focus `tints.onRedHalo`, error `errorBg` halo, disabled 0.7 / 0.5) and `errorPlacement` ("`form` keeps the ring and the accessible error but leaves the note to the form; used when one message covers several fields").
  - Error-placement rule: a message about one field sits 8 under that field; a message about the form or the server sits above the primary button; never a toast on a form.
  - Logo type: `logoType.wordmark` / `wordmarkSub` and `fontFamilies.displayBold` exist only for the lockup; they are not reading roles.
  - Signed-out connectivity: `useNetworkOffline` (unknown = online) vs `useOffline()` (signed in; `isConnected: null` = offline), and why they differ.
  - Login hero art: the scale/offset/hide rule lives in `loginHeroGeometry.js`; the art follows the rest panel's anchor and never moves when the panel grows.

- [ ] **Step 3: `documentation/ROADMAP.md` §5:** remove "Log in and reset password" from the "Bold Red for the rest of the app" remaining list (tick the item if this is the last Bold Red PR to merge). Add an open item: "Password recovery dead-ends; 'Forgot password?' is hidden on Log in until a deep link and set-new-password screen exist (#N, Jim 2026-10-19)." Confirm "Suspended sign-in copy" is already ticked by PR 1; if not, tick it now (the copy is inline after this PR).

- [ ] **Step 4: `PRD.md` §6.1:** replace "Email/password sign-in and password reset." with "Email/password sign-in. Password reset is built but hidden from Log in until password recovery works end to end (#N)."

- [ ] **Step 5: `documentation/build-log.md`:** append to the registers, newest at the bottom:
  - Verification Register: one row per task's focused test run (command and pass counts), the Task 10 full-suite counts, and the device-gate result (Task 11).
  - Decision Register: Forgot hidden (Jim, 2026-10-19, issue #N); lockup typeset with Bricolage 700 (`displayBold`) because the supplied logotype is 106x41 px; `lockupTop = max(insets.top + 9, 40)` (part 6's `+10` gives 57, not the board's 56); with the Forgot row gone Sign in sits 20 below Password (12 after a form note), and the art's offset rule moves the art down about 36dp at 844 so the learner stays tucked; art anchored to the rest panel top; keyboard-mode panel bottom padding 24; any Task 1 name mappings.
  - Bug and Gap Register: the recovery dead end (#N); the Reset screen's D10 device check deferred to #N because the route is unreachable in this build.

- [ ] **Step 6: Commit (orchestrator)**

```bash
git add documentation/design-system.md documentation/build-log.md documentation/ROADMAP.md PRD.md
git commit -m "docs(login): design system, roadmap, PRD and build log for Bold Red Log in"
```

---

### Task 10: Final verification and branch review

- [ ] **Step 1: Full suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS. Counts = Task 1 baseline + this PR's new tests, no skipped suites. Record them (Task 9 Step 5).

- [ ] **Step 2: Guards and audits, by name**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/designSystemGuard.test.js __tests__/typography.test.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/paperTheme.test.js __tests__/domainTextInputAudit.test.js __tests__/AuthContext.test.js`
Expected: PASS; the ratchet list no longer names any `src/screens/auth/` file; `colors.test.js` and `contrast.test.js` unchanged by this branch.

- [ ] **Step 3: Scope checks**

Run: `git diff --stat feat/bold-red-profile...HEAD` → only the files named in Tasks 2–9 (plus the conditional `ScreenHeader` / headers-test files).
Run: `git diff feat/bold-red-profile...HEAD -- src/context src/services src/db supabase documentation/rls-sync-contract-map.md package.json package-lock.json` → empty.
Run: `rg -n "react-native-paper|Snackbar|NO_TEXT_SUGGESTIONS|Forgot" src/screens/auth/` → no output (the `ForgotPassword` route name lives in `AppNavigator.js`, not here).

- [ ] **Step 4: Adversarial review.** Run `/codex:adversarial-review --base feat/bold-red-profile`. Engage each finding on the merits; fix confirmed ones under the same TDD rule and re-run Steps 1–3. Per Jim, a redesign should draw few findings; stop when a round brings no material catch, and record the rounds in the build log.

---

### Task 11: Device gate on the EAS preview build (manual gate for Jim)

Build a cloud EAS preview for iOS and Android (the sqlite backend is the default; local iOS builds are fragile). Jim runs these; record each result and screenshots in the build log (Task 9 Step 5). Compare against the `red-login-*` boards, remembering the panel is about 36dp shorter than drawn because "Forgot password?" is hidden.

- [ ] **D1 Rest** on a 390-class iPhone and a 360x800 Android against `red-login-final`: arc legs leave through the sides; the learner clears the lockup; none of her bottom edge shows; "MASI" and "NYUSANE" render in Bricolage (not the system font) and no glyph top is clipped by the 24dp line height on Android.
- [ ] **D2 360x640** (budget Android, or `wm size 720x1280` + `wm density 320` on the A03s), rest and keyboard, against `red-login-s-compact`: art at 74%; compact keyboard layout; fields and Sign in visible above a 280dp keyboard with gesture navigation; with 3-button navigation it scrolls and the focused field stays visible.
- [ ] **D3 Tall phone** (≥ 900dp high): the learner stays tucked behind the panel.
- [ ] **D4 Errors:** both empty, bad format, wrong password, and a suspended EA (`npm run ea:suspend` on a `masi-app-sqlite` test account, then `npm run ea:restore`) showing "Your access is paused. Please contact your supervisor." inline.
- [ ] **D5 Android keyboard under edge-to-edge:** no double resize or gap between the panel and the keyboard (KAV is iOS-only); Email "next" moves to Password; "go" signs in.
- [ ] **D6 Airplane mode** (A03s: use `cmd wifi` plus the watchdog): the caption appears within a few seconds; Sign in shows the connection note; reconnecting hides the caption.
- [ ] **D7 Largest system font** (One UI 1.3; iOS largest non-accessibility size) at 360dp: all text complete, every control tappable on its own, the page scrolls, no lone head above the panel.
- [ ] **D8 TalkBack and VoiceOver:** order lockup "Masinyusane", "Sign in", offline caption, Email, its note, Password, Show password, form note, Sign in, footnote; the art is skipped; error notes and the caption are announced once.
- [ ] **D9 (superseded):** Jim's answer replaced the reset-link device check; confirm only that Log in offers no route to Reset.
- [ ] **D10 (deferred to the recovery issue):** the Reset screen at 360x640 with the keyboard, and the sent state with a 42-character address, are checked when recovery re-enables the link.
- [ ] **Sign-out → Log in:** sign out from Profile; Log in appears on the red field with light status-bar icons and no provider error; after signing in, the status bar is light on Home and dark on canvas tabs.
- [ ] **Home row:** Home is unchanged from the previous PR's build.
- [ ] **Gate:** Jim approves, or the failures become fixes on this branch before the PR merges.

---

## Codex plan review (2026-10-19)

Adversarial review of this plan (verdict: needs-attention); the one finding is accepted and checked against the code.

1. **[medium] Reset errors mapped after their classification fields were discarded (Task 8).** The form state stored `{ kind: 'server', message }` while the renderer passed that state to `describeAuthError(error, 'reset')`, which reads the original error's `code`, retryable-fetch identity and `status` (`src/utils/authErrorCopy.js`); `AuthContext.resetPassword` returns the original error intact (`src/context/AuthContext.js:281–290`). Task 8 now spells out `handleReset`: it stores `{ kind: 'server', message: describeAuthError(resetError, 'reset') }` at response time (the same pattern as Task 6's `handleLogin`), and the `InlineNote` renders `error.message` directly. The rate-limit and connection tests (3 and 4) are unchanged and are noted as the guard for this contract.

