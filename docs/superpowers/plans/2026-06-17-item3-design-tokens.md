# Item 3 — Design-Token System (Red-Dominant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> task-by-task. In THIS project the implementer is **Codex** (via `/codex:rescue`), reviewed by a Claude
> spec reviewer + a Claude code-quality reviewer + Codex `/codex:adversarial-review` (two-LLM cross-review).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Masi's flat blue palette with a red-dominant design-token system on a light "Zazi" canvas:
a 50–900 red ramp (from `#E72D4D`), warm neutrals, typography tokens, a hoisted letter-state palette, a
flat (no-gradient) brand CTA, an accessibility sweep, and a fail-closed colour-guard test — with **zero
orange and zero gradients**.

**Architecture:** One token source (`src/constants/colors.js` + new `src/constants/typography.js`) that every
surface inherits from. Legacy export names are **preserved and remapped** (call sites compile; only values
change — the fork's migration trick). A `noLegacyHues` Jest scanner makes the system permanent by failing on
any stray colour literal in `src/` + `App.js`.

**Tech Stack:** React Native / Expo, Jest (+ React Native Testing Library for component tests), pure-JS
constants. Run Jest with the Node-20 prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` (repo
convention; the worktree-scoped jest config already lives on `main`). Use focused test paths
(`npx jest <file>`) — never a bare full run during a task.

**Branch:** `ui/design-tokens` (already created off `main`).

**Locked design decisions (Jim signed off 2026-06-17):** red-dominant; light warm canvas `#F8F5F4` + white
cards; brand red `#E72D4D` (red500) with `#C81F3E` (red600) for AA-safe small-text fills & pressed;
differentiated error red `#B3261E`; success green `#3FA535` unchanged; **yellow retired from chrome**; deep
amber `#B26A00` reserved for genuine warnings only; **NO gradients** (solid fills); optional dark hero band
`#1C1517` on Home (built in Item 7, token defined here).

---

## File Structure

**Modify:**
- `src/constants/colors.js` — replace blue values with the red ramp + warm neutrals; preserve every existing
  export key (remap values); add ramp + success-trio + hero + ring tokens. *Deep module; public shape unchanged.*
- `src/screens/main/HomeScreen.js` — delete `const GRADIENT` (line 25) + its 3 `LinearGradient` usages → flat CTA.
- `src/screens/auth/LoginScreen.js` — delete the `['#0984E3','#E72D4D']` `LinearGradient` (line ~87) → flat CTA.
- `App.js` — `primaryContainer:'#E3E9F5'` (line ~99) → a red-derived light container.
- `src/components/session/LetterTrackerBottomSheet.js` (line ~21) + `src/screens/assessments/LetterTrackerScreen.js`
  (line ~18) — delete the two byte-identical local `CELL_COLORS` → import the hoisted constant.
- `src/navigation/AppNavigator.js` (line ~104) — Profile gear gets `accessibilityRole`/`Label`/`hitSlop`.
- ~18 touchable files — accessibility sweep (Task 5).

**Create:**
- `src/constants/typography.js` — type-scale tokens.
- `src/constants/letterStateColors.js` — the single source of truth for the letter-tracker cell palette.
- `src/components/common/BrandButton.js` — flat (solid) primary CTA, no gradient.
- `__tests__/colors.test.js` — pins the token file (fail-closed).
- `__tests__/typography.test.js` — pins the type scale.
- `__tests__/letterStateColors.test.js` — pins the hoisted palette.
- `__tests__/BrandButton.test.js` — render + a11y + onPress.
- `__tests__/profileGearA11y.test.js` — the Profile gear has a label/role (a11y proof).
- `__tests__/noLegacyHues.test.js` — fail-closed colour-literal scanner (capstone).

---

## Authoritative token reference (Task 1 implements this exactly)

```javascript
// src/constants/colors.js — target `colors` export (every key from the old file is preserved)
const RED = {
  50:'#FDECEF', 100:'#FBD5DC', 200:'#F4A9B6', 300:'#EE7D90', 400:'#EC5470',
  500:'#E72D4D', 600:'#C81F3E', 700:'#A4182F', 800:'#7C1223', 900:'#530B17',
};
const INK='#221A1B', MUTED='#76696B', LINE='#ECE5E4', CANVAS='#F8F5F4';
const ERROR='#B3261E', ERROR_BG='#FCEAE8', WARNING='#B26A00';
const SUCCESS='#3FA535', SUCCESS_BG='#E7F3E5', SUCCESS_TEXT='#2E7D27', SUCCESS_BORDER='#CDE8C9';

export const colors = {
  // red ramp (preferred new names)
  red50:RED[50], red100:RED[100], red200:RED[200], red300:RED[300], red400:RED[400],
  red500:RED[500], red600:RED[600], red700:RED[700], red800:RED[800], red900:RED[900],

  // legacy/brand names remapped to red (blue + yellow retired)
  primary: RED[500],        // brand red (headers, primary)
  primaryLight: RED[400],
  primaryDark: RED[600],    // AA-safe small-text fill / pressed
  emphasis: RED[500],
  accent: RED[500],         // was yellow #FFDD00 → brand red
  success: SUCCESS,

  // semantic
  error: ERROR,             // differentiated from brand red
  errorBg: ERROR_BG,
  warning: WARNING,         // deep amber — genuine warnings only (not chrome)
  info: MUTED,              // was blue → muted (no blue chrome)
  successBg: SUCCESS_BG,
  successText: SUCCESS_TEXT,
  successBorder: SUCCESS_BORDER,

  // neutrals (warm)
  background: CANVAS,
  surface: '#FFFFFF',
  cardBackground: '#FFFFFF',
  text: INK,
  textSecondary: MUTED,
  border: LINE,
  disabled: '#B3A8A8',
  placeholder: '#B3A8A8',

  // component-specific
  tabActive: RED[600],
  tabInactive: MUTED,

  // dark hero band (Item 7 consumes; token defined here)
  heroDark: '#1C1517',
  onDark: '#FFFFFF',
  onDarkMuted: '#C9BFC0',

  // session-ring stage tokens (Item 7 consumes; neutral → brand red → success)
  ringNeutral: '#9AA3AB',
  ringStart: '#8A939C',
};

export const spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:48 };       // unchanged
export const borderRadius = { sm:9, md:14, lg:18, xl:22 };                 // Zazi radii (was 8/12/16/20)
export const shadows = {
  card:     { shadowColor:'#3A2424', shadowOffset:{width:0,height:4},  shadowOpacity:0.06, shadowRadius:10, elevation:2 },
  elevated: { shadowColor:'#3A2424', shadowOffset:{width:0,height:6},  shadowOpacity:0.10, shadowRadius:14, elevation:4 },
};
```

```javascript
// src/constants/typography.js — target export (from fork redesign spec §2.2; informational floor = 12px)
import { colors } from './colors';
export const typography = {
  screenTitle:  { fontSize:26, fontWeight:'800', letterSpacing:-0.5, color:colors.text },
  cardTitle:    { fontSize:16, fontWeight:'800', color:colors.text },
  body:         { fontSize:14, fontWeight:'600', color:colors.text },
  caption:      { fontSize:12, fontWeight:'500', color:colors.textSecondary },
  statValue:    { fontSize:26, fontWeight:'800', color:colors.text },
  sectionLabel: { fontSize:12, fontWeight:'800', letterSpacing:0.5, textTransform:'uppercase', color:colors.textSecondary },
};
```

---

## Task 1: Token foundation — `colors.js` + pinning test

**Files:** Modify `src/constants/colors.js` · Create `__tests__/colors.test.js`

- [ ] **Step 1 — failing test.** Create `__tests__/colors.test.js` pinning the new system (adapted from the
  fork's `colors.test.js`). Assert: the red ramp values; legacy remaps (`primary===red500`, `primaryDark===red600`,
  `accent===red500`, `tabActive===red600`); **no legacy values survive** (`FORBIDDEN=['#294A99','#FFDD00','#E72D4D'?]`
  — note `#E72D4D` is now legitimately `primary`, so forbid only the retired blue `#294A99` and yellow `#FFDD00`);
  `error===#B3261E` and `error!==primary` (brand≠error); warm neutrals (`background===#F8F5F4`,`text===#221A1B`);
  the success trio; `borderRadius` Zazi values; a fail-closed `APPROVED` set covering every value in `colors`.
- [ ] **Step 2 — run red:** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest colors.test --silent` → FAIL.
- [ ] **Step 3 — implement** `src/constants/colors.js` exactly per the Authoritative token reference above.
- [ ] **Step 4 — run green:** same command → PASS.
- [ ] **Step 5 — commit:** `git add src/constants/colors.js __tests__/colors.test.js && git commit -m "feat(tokens): red-dominant colour system on warm canvas (Item 3 Task 1)"`

## Task 2: Typography tokens

**Files:** Create `src/constants/typography.js` + `__tests__/typography.test.js`

- [ ] **Step 1 — failing test:** assert `typography.screenTitle.fontSize===26`/`fontWeight==='800'`,
  `body.fontSize===14`, `sectionLabel.textTransform==='uppercase'`, and that **every** `fontSize` is `>= 12`
  (the informational floor).
- [ ] **Step 2 — run red** (`npx jest typography.test`) → FAIL.
- [ ] **Step 3 — implement** `src/constants/typography.js` per the reference above.
- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — commit:** `feat(tokens): typography scale with 12px informational floor (Item 3 Task 2)`

## Task 3: Hoist the letter-state palette (consolidate two copies)

**Files:** Create `src/constants/letterStateColors.js` + test · Modify `LetterTrackerBottomSheet.js`,
`LetterTrackerScreen.js`

- [ ] **Step 1 — failing test** (`__tests__/letterStateColors.test.js`): import `letterStateColors`; assert
  `assessment.bg===colors.primary` (red, replacing the stray `#FB8C00`), `taught.bg===colors.success`,
  `default.bg===colors.surface`. *(Note for reviewers: red for the "assessment" cell is the on-brand choice;
  flag at device-pass if it reads as negative in the tracker grid — a neutral slate is the fallback.)*
- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement** `src/constants/letterStateColors.js` exporting `letterStateColors`
  (`{assessment:{bg:colors.primary,text:'#FFFFFF'}, taught:{bg:colors.success,text:'#FFFFFF'},
  default:{bg:colors.surface,text:colors.text,border:colors.border}}`). Replace the local `CELL_COLORS` in
  **both** consumer files with `import { letterStateColors } from '...'` and a `const CELL_COLORS = letterStateColors;`
  shim (minimal churn). Delete the stray `#FB8C00`.
- [ ] **Step 4 — run green** + run any existing LetterTracker tests → PASS.
- [ ] **Step 5 — commit:** `refactor(tokens): hoist letter-state palette to one source, drop stray orange (Item 3 Task 3)`

## Task 4: Flat brand CTA + kill the gradients

**Files:** Create `src/components/common/BrandButton.js` + `__tests__/BrandButton.test.js` · Modify
`HomeScreen.js`, `LoginScreen.js`, `App.js`

- [ ] **Step 1 — failing test:** render `<BrandButton label="Record Session" onPress={fn} />`; assert the label
  renders, `accessibilityRole==='button'` and `accessibilityLabel` present, pressing calls `fn`, and the style
  uses a **solid** `colors.primary` fill (no `LinearGradient`/`colors` array prop).
- [ ] **Step 2 — run red** (`npx jest BrandButton.test`) → FAIL.
- [ ] **Step 3 — implement** `BrandButton` (solid `colors.primary` background, `colors.primaryDark` pressed via
  `Pressable` state, white bold label `typography.cardTitle`, `borderRadius.md`, `accessibilityRole="button"`,
  `accessibilityLabel={label}`, `hitSlop`). Then: in `HomeScreen.js` delete `const GRADIENT` + replace the 3
  `LinearGradient` usages with `BrandButton`/solid views; in `LoginScreen.js` replace the `LinearGradient` CTA
  with `BrandButton`; in `App.js` set `primaryContainer: colors.red50`. Remove now-unused `LinearGradient` imports.
- [ ] **Step 4 — run green** (`npx jest BrandButton.test`) → PASS.
- [ ] **Step 5 — commit:** `feat(ui): flat BrandButton; remove gradient CTAs (Item 3 Task 4)`

## Task 5: Accessibility sweep (Profile gear + touchables)

**Files:** Modify `AppNavigator.js` + the ~18 touchable files · Create `__tests__/profileGearA11y.test.js`

- [ ] **Step 1 — failing test:** render the navigator header (or the gear component in isolation) and assert a
  node with `accessibilityRole==='button'` and `accessibilityLabel==='Profile'` exists.
- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement:** Profile gear gets `accessibilityRole="button"`, `accessibilityLabel="Profile"`,
  `hitSlop={{top:12,bottom:12,left:12,right:12}}`. Then sweep every raw `TouchableOpacity`/`Pressable`/
  `TouchableWithoutFeedback` across the 18 files (enumerate with
  `rg -l "TouchableOpacity|Pressable|TouchableWithoutFeedback" -g '*.js' src/`): add `accessibilityRole` +
  a meaningful `accessibilityLabel` to each (icon-only ones also get `hitSlop`).
- [ ] **Step 4 — run green** + a focused render test of HomeScreen if present → PASS.
- [ ] **Step 5 — commit:** `a11y: label all raw touchables; Profile gear role/label/hitSlop (Item 3 Task 5)`

## Task 6: Fail-closed colour guard (capstone) — port `noLegacyHues`, enumerate & port offenders

**Files:** Create `__tests__/noLegacyHues.test.js` · Modify whatever offenders it reveals (~96 literals / 22 files)

- [ ] **Step 1 — port the scanner** from the fork's `__tests__/noLegacyHues.test.js` (same `fs`/`path` walk of
  `src/**/*.js` + `App.js`, excluding `constants/colors.js`; same `LITERAL_PATTERN`). Swap `ALLOWED` to the Masi
  red-brand set: ramp `#fdecef #fbd5dc #f4a9b6 #ee7d90 #ec5470 #e72d4d #c81f3e #a4182f #7c1223 #530b17`; warm
  neutrals `#221a1b #76696b #ece5e4 #f8f5f4 #b3a8a8 #1c1517 #c9bfc0 #3a2424 #9aa3ab #8a939c`; greens
  `#3fa535 #e7f3e5 #2e7d27 #cde8c9`; errors `#b3261e #fceae8`; amber `#b26a00`; pure `#fff/#ffffff/#000/#000000`;
  plus the white/black/red500-rgba regex allowances (port the fork's neutral-rgba regex; add a red500 rgba one).
- [ ] **Step 2 — run red** (`npx jest noLegacyHues.test`) → FAIL with the full offender list.
- [ ] **Step 3 — port offenders:** for each offending file, replace the hard-coded literal with the nearest
  token (`colors.*`). This absorbs the stray `#E8F0FE` tints (`RankedBarRow.js:71`, `HomeScreen.js`) and any
  residue from Tasks 1–5. If a literal is genuinely new-and-needed, add it to `ALLOWED` **with a one-line
  comment justifying it** (per the fork's discipline) — do not relax the regex.
- [ ] **Step 4 — run green** (`npx jest noLegacyHues.test`) → PASS (offenders === []).
- [ ] **Step 5 — commit:** `test(tokens): fail-closed noLegacyHues guard; port all stray colour literals (Item 3 Task 6)`

---

## Self-Review (controller ran before dispatch)

- **Spec coverage:** ramp+neutrals (T1), typography (T2), semantic-palette hoist (T3), flat CTA + gradient
  removal (T4), a11y sweep (T5), fail-closed guard (T6) — every Item-3 sub-area from the guide maps to a task.
  Score-band & group-badge palettes are **intentionally excluded** (don't exist in Masi yet; the go-live PRD
  marks assessment colour thresholds an open question).
- **Placeholder scan:** token values are concrete; the only deliberately-open call is the "assessment" letter
  cell colour (flagged in T3 for device-pass review).
- **Type consistency:** every legacy `colors.*` key from the old file is preserved (remapped), so no import
  breaks; `borderRadius.md` (14) feeds `BrandButton`; `typography.cardTitle` feeds `BrandButton`.
- **Ordering:** guard (T6) is last so it sweeps residue from T1–T5; it may iterate across multiple Codex passes.
