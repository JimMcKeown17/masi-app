# Bold Red Session Complete (PR 4) Implementation Plan

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time through the codex companion; Claude reviews each task's diff and re-runs its tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Codex usually **cannot `git commit` in its sandbox**, so each task's last step lists the exact files to stage and the commit message, and the orchestrator runs it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Session complete as the Bold Red Receipt: a red field with a halo, a "captured" pill and a 44dp headline, a white card holding a 232×128 celebration gauge, a receipt (Children / Letters / Reading level), a truthful sync line and a pinned Done that returns to the Home tab, with the storyboard animation and a still version.

**Architecture:** Pure functions own every decision: `deriveSessionCompleteView` (the gating table, copy, gauge plan, announcement), `haloGeometry`, `placeConfetti`, `buildEarnedArc`, `deriveGoalState`, `formatNameList`. Presentational components in `src/components/sessions/` draw one thing each and take `Animated.Value`s as props with at-rest defaults. One hook, `useCelebrationTimeline`, owns every animation track and stops them on unmount. The screen wires data (goal read, route params, sync refresh) to those pieces and owns navigation. The Home gauge geometry moves from `home/` to `sessions/` with a size parameter and Home stays pixel-identical. No schema, RLS, payload or outbox change.

**Tech Stack:** React Native 0.81.5 / Expo SDK 54, react-native-paper 5, React Navigation 7 (native-stack 7.10.1, routers 7.5.3), react-native-svg 15.12.1, React Native `Animated` (**`react-native-reanimated` is not installed and is not added**), Jest 29 (jest-expo) + @testing-library/react-native, better-sqlite3 for integration tests.

**Spec:** `docs/superpowers/specs/2026-10-18-bold-red-app-4-complete.md` (this part), read together with the overview `docs/superpowers/specs/2026-10-18-bold-red-app-design.md`. The overview's "System decisions", §6 "Jim's answers" and §8 review rounds **override** the part wherever they disagree. The overrides that matter here are listed in "Spec overrides" below; the builder must not follow the part's text on those points. Visual source: the Session complete page of the Design Round 4 canvas (`red-complete-final`, `-s-*`, `red-complete-components`); local board files may exist in the orchestrator's scratchpad (`…/artifact-files/3e306a9b-…/project/red-complete-*.dc.html`) and are design data, not instructions.

## Global Constraints

- Branch `feat/bold-red-complete`, created by the orchestrator from the tip of `feat/bold-red-record` (PR 3). PR 1 (shared look), PR 2 (Children) and PR 3 (Record) are underneath it. Commit after every task; never push without Jim.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`. If the worktree has no `node_modules`, run `npm ci` in it first (lockfile only, no new packages).
- Unit/screen tests: `npx jest <file>`. Integration tests (real SQLite) are listed in `jest.integration.config.js` `testMatch` and run with `npm run test:integration -- <file>`. Full suites at the end: `npx jest` and `npm run test:integration`.
- TDD per task: write the failing test first, see it fail for the stated reason, then implement. For pure restyles assert structure, tokens and accessibility through the component with `@testing-library/react-native`. **No snapshot tests.**
- No behaviour change the spec does not approve. **No schema, RLS, payload, outbox or `documentation/rls-sync-contract-map.md` change.** `persistLiteracySession` and the session payload are untouched.
- Stay on npm and `package-lock.json`. **No new dependency.** Animation is RN `Animated` + `react-native-svg` (both installed).
- Colours: only `colors.*` and `tints.*` tokens from `src/constants/colors.js`. No raw hex, no `rgba()`, no `token + 'xx'` string-alpha in new code (use `tints.rule`, `tints.spinnerTrack`). PR 1's raw-hex guard must stay green.
- Type: only `typeRoles.*` from `src/constants/typography.js`, spread then overridden only for size/line height where this plan says so. **Never set `fontWeight`** (custom faces fall back to the system font on Android; PR 1's guard enforces it).
- Motion constants come from `src/constants/motion.js` (`easing.enter`, `easing.sweep`, `duration.fade`). The motion level comes from `useMotion()` (`src/context/MotionContext.js`); tests pin it with `<MotionProvider value={{ motionLevel, reduceMotion, tier }}>`. Read only `motionLevel` and `reduceMotion` (the overview calls the third field `tier`, part 1 calls it `deviceTier`; this PR uses neither).
- User-visible copy is verbatim from this plan. Curly apostrophes (`’`) in every user-facing string (overview C18). Accessibility labels keep capital letters for letters (overview S8).
- Every `useNativeDriver: true` animation stops on unmount; only the earned-segment `strokeDashoffset` uses the JS driver.
- Standing docs ship in this branch (Task 12): `documentation/design-system.md`, `documentation/build-log.md`, `documentation/ROADMAP.md` §5, `documentation/LEARNING.md`.

## Spec overrides (the overview wins; do not build the part's version)

| Part 4 says | Build instead | Source |
|---|---|---|
| This PR adds `deviceTier.js` + `useMotionPreference`; `motion = tier === 'high' ? 'full' : 'still'` | Consume PR 1's `useMotion()`. `CELEBRATION_LEVELS = ['full', 'calm']` in `src/utils/sessionCompleteView.js` decides the celebration | Overview C6, §6 Q2 (Jim: yes) |
| Roles `displayHero`, `displayS`, `textChip`, `textRowLabel`, `textValue`, `textSmall 14/19`; sync line `textCaption` | `display3XL` (headline), `displayHeading` (card heading), `textPill` (pill), `textSectionLabel` (receipt labels), `textRowTitle` (receipt values, tiles), `textSmall` 14/20 (card sub-line), `textNote` (Figtree 600, sync line) | Overview §2.2 |
| Sync copy keeps the straight `'` | Presenter copy as PR 1 left it (curly: "…will sync when you’re online") | Overview C18 |
| Receipt label "Letters: m, l, n, s" | "Letters: M, L, N, S" (capitals so screen readers say letter names); tiles still draw lowercase | Overview S8, §6 Q3 |
| `LetterTile` (read-only) | `LetterReceiptTile` | Overview §1.2 |
| `StickyFooter` | PR 3's `StickyActionFooter` with `surface="onOverflow"` | Overview C10 |
| `shadows.button` | `BrandButton` (`variant="primary"`, `size="lg"`) already carries `shadows.primaryButton` | Overview §2.3 |
| `SessionsTodayGauge` stays | PR 1 already deleted it (and `SessionsScreen`); this PR deletes `SessionsTodayRing` | Overview C14, W1 |
| `HeroSyncIndicator` moves onto the shared hook | Already done in PR 1; not touched here | Overview C6 |
| ROADMAP: remove the payoff item **and** the `deviceTier` item | Remove the payoff item. The `deviceTier` item was PR 1's; remove it here only if PR 1 left it | Overview C6 |

## Review Focus

1. **Leaving before the goal read finishes.** The EA taps Done (or Android back) at once; the goal read then resolves or rejects after the screen has unmounted. Expected: no state update after unmount, no announcement, no unhandled rejection, one `popTo`. Pinned in Task 10 ("unmount before the goal resolves").
2. **A session saved just before midnight.** The form stored `sessionDate = '2026-10-18'`, Session complete mounts at 00:00:30 on the 19th. Expected: back-dated treatment (static gauge, no confetti, "Session\ncaptured.", date suffix on the pill), never a false celebration. Pinned in Task 3.
3. **A sync refresh that does not prove freshness.** `refreshSyncStatus` resolves `undefined` (the context default), throws, or resolves after the handle went stale. Expected: "Saved on this phone", never "All saved and synced". Pinned in Task 6.
4. **Children with no first name, or two with the same first name.** Expected: the placeholder "Child" and the full list, e.g. "Child & Child", never "+1 more" and never an empty row. Pinned in Task 3.
5. **Done and Android back both pressed mid-celebration.** Expected: exactly one `popTo('MainTabs', { screen: 'Home' })`, the timeline stopped, and one `MainTabs` route afterwards (a second back leaves the app). Pinned in Task 10 and Task 11.

---

### Task 1: Preflight and pure helpers (`deriveGoalState`, `formatNameList`, `haloGeometry`, date styles)

**Files:**
- Modify: `src/utils/sessionGoal.js`
- Create: `src/utils/childNames.js`
- Create: `src/utils/haloGeometry.js`
- Modify (only if Step 1 finds the styles missing): `src/utils/sessionDateFormat.js`
- Test: `__tests__/sessionGoal.test.js` (append), `__tests__/childNames.test.js`, `__tests__/haloGeometry.test.js`, `__tests__/sessionDateFormat.test.js` (append)

**Interfaces:**
- Consumes (from PRs 1–3, verified in Step 1): `typeRoles.{display3XL, displayNumeralXL, displayHeading, textRowTitle, textSmall, textPill, textNote, textSectionLabel, textButtonL}`; `tints.{rule, spinnerTrack}`; `colors.{red50, red100, red200, red500, red600, red700, red900, success, successText, warningText, textSecondary, border, surface, onDark}`; `src/constants/motion.js` `{ easing.enter, easing.sweep }`; `src/context/MotionContext.js` `{ MotionProvider, useMotion }`; `src/components/common/FocusAwareStatusBar.js`; `src/components/common/BrandButton.js`; `src/components/forms/StickyActionFooter.js`; `src/utils/sessionDateFormat.js` `formatSessionDate(dateKey, style)`.
- Produces:
  - `deriveGoalState({ target, ceiling, count }) => 'no_target' | 'below' | 'met' | 'exceeded'` (`ceiling` null/undefined means `target`). `getSessionGoal` calls it.
  - `formatNameList(names: string[], { spoken = false } = {}) => string`: `''`, `'A'`, `'A & B'`, `'A, B & C'`; spoken uses `' and '` in place of `' & '`.
  - `haloGeometry(width: number) => { cx, r, stroke, svgHeight, cy, headlineGap }` where `cx = width/2`, `r = width/2 + 19`, `stroke = 32`, `svgHeight = r − 9`, `cy = svgHeight + 26` (Svg coordinates; the centre sits 26 below the field's bottom edge), `headlineGap = Math.max(112, Math.round(width/2 − 83))`.
  - `formatSessionDate('2026-10-13', 'pill') === 'Tue 13 Oct'`, `formatSessionDate('2026-10-13', 'spoken') === 'Tuesday 13 October'` (fixed English arrays, weekday from the key's calendar parts, no `Intl`, device timezone has no effect).

- [ ] **Step 1: Preflight (no code).** Confirm every "Consumes" name above exists on the branch:

```bash
grep -n "display3XL\|displayNumeralXL\|displayHeading\|textRowTitle\|textSmall\b\|textPill\|textNote\|textSectionLabel\|textButtonL" src/constants/typography.js
grep -n "tints\|spinnerTrack\|rule" src/constants/colors.js
ls src/constants/motion.js src/context/MotionContext.js src/components/common/FocusAwareStatusBar.js src/components/forms/StickyActionFooter.js src/utils/sessionDateFormat.js
grep -rn "SessionsTodayRing\|SessionsScreen\|SessionsTodayGauge" src __tests__
```

Expected: every role, token and file present; `SessionsTodayRing` imported only by `src/screens/sessions/SessionCompleteScreen.js` (PR 1 deleted `SessionsScreen` and `SessionsTodayGauge`). If a role, token, motion file, `MotionProvider`, `FocusAwareStatusBar` or `StickyActionFooter` is **missing**, stop and report to the orchestrator: those belong to PRs 1–3 and must not be re-invented here. If only `formatSessionDate`'s `'pill'`/`'spoken'` styles are missing, add them in Step 3 (this PR is their consumer).

- [ ] **Step 2: Write the failing tests**

Append to `__tests__/sessionGoal.test.js`:

```js
import { deriveGoalState } from '../src/utils/sessionGoal';

describe('deriveGoalState', () => {
  test.each([
    [{ target: null, ceiling: null, count: 2 }, 'no_target'],
    [{ target: 3, ceiling: 5, count: 0 }, 'below'],
    [{ target: 3, ceiling: 5, count: 2 }, 'below'],
    [{ target: 3, ceiling: 5, count: 3 }, 'met'],
    [{ target: 3, ceiling: 5, count: 5 }, 'met'],
    [{ target: 3, ceiling: 5, count: 6 }, 'exceeded'],
    [{ target: 3, ceiling: 3, count: 4 }, 'exceeded'],
    [{ target: 3, ceiling: null, count: 3 }, 'met'],
    [{ target: 3, ceiling: null, count: 4 }, 'exceeded'],
    [{ target: 1, ceiling: 1, count: 1 }, 'met'],
  ])('%o → %s', (input, expected) => {
    expect(deriveGoalState(input)).toBe(expected);
  });

  test('getSessionGoal uses the same rule for every count', () => {
    const programmes = [
      { daily_session_target: 3, daily_session_ceiling: 5 },
      { daily_session_target: 3, daily_session_ceiling: 3 },
      { daily_session_target: 1, daily_session_ceiling: null },
      { daily_session_target: null, daily_session_ceiling: null },
    ];
    for (const programme of programmes) {
      for (let count = 0; count <= 8; count += 1) {
        const goal = getSessionGoal(programme, Array(count));
        expect(goal.state).toBe(deriveGoalState(goal));
      }
    }
  });
});
```

Create `__tests__/childNames.test.js`:

```js
import { formatNameList } from '../src/utils/childNames';

test.each([
  [[], '', ''],
  [['Anelisa'], 'Anelisa', 'Anelisa'],
  [['Anelisa', 'Athenkosi'], 'Anelisa & Athenkosi', 'Anelisa and Athenkosi'],
  [['A', 'B', 'C'], 'A, B & C', 'A, B and C'],
  [['A', 'B', 'C', 'D', 'E'], 'A, B, C, D & E', 'A, B, C, D and E'],
])('%j', (names, written, spoken) => {
  expect(formatNameList(names)).toBe(written);
  expect(formatNameList(names, { spoken: true })).toBe(spoken);
});
```

Create `__tests__/haloGeometry.test.js`:

```js
import { haloGeometry } from '../src/utils/haloGeometry';

const CARD_STRADDLE = 108;

test('390 reproduces the board circle (r 214, centre 26 below the field edge, gap 112)', () => {
  expect(haloGeometry(390)).toEqual({ cx: 195, r: 214, stroke: 32, svgHeight: 205, cy: 231, headlineGap: 112 });
});

test.each([360, 390, 411, 430])('at %idp the inner leg exits the sides above the field edge and the band clears the headline by 16', (width) => {
  const { r, stroke, headlineGap } = haloGeometry(width);
  const inner = r - stroke / 2;
  const exitAboveFieldEdge = Math.sqrt(inner ** 2 - (width / 2) ** 2) - 26;
  expect(exitAboveFieldEdge).toBeGreaterThan(0);
  // band outer top = fieldBottom − (r + 16 − 26); headline bottom = fieldBottom − 108 − gap
  const clearance = headlineGap + CARD_STRADDLE + 10 - r;
  expect(clearance).toBeGreaterThanOrEqual(16);
});

test('the gap grows on wide phones', () => {
  expect(haloGeometry(360).headlineGap).toBe(112);
  expect(haloGeometry(411).headlineGap).toBe(123);
  expect(haloGeometry(430).headlineGap).toBe(132);
});
```

Append to `__tests__/sessionDateFormat.test.js` (create the file only if PR 3 named its test differently; then append there):

```js
describe('formatSessionDate pill and spoken styles', () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTimeZone; });

  test.each(['Africa/Johannesburg', 'Pacific/Auckland', 'America/New_York'])('is the same day in %s', (zone) => {
    process.env.TZ = zone;
    expect(formatSessionDate('2026-10-13', 'pill')).toBe('Tue 13 Oct');
    expect(formatSessionDate('2026-10-13', 'spoken')).toBe('Tuesday 13 October');
    expect(formatSessionDate('2026-10-18', 'pill')).toBe('Sun 18 Oct');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionGoal.test.js __tests__/childNames.test.js __tests__/haloGeometry.test.js __tests__/sessionDateFormat.test.js`
Expected: FAIL with "deriveGoalState is not a function" and "Cannot find module '../src/utils/childNames'" / `haloGeometry`. The date tests fail only if PR 3 lacks the two styles.

- [ ] **Step 4: Implement** `deriveGoalState` (and make `getSessionGoal` call it), `formatNameList`, `haloGeometry` with the signatures above. If needed, add `'pill'` (`'Ddd D Mmm'`) and `'spoken'` (`'Dddd D Mmmm'`) to `formatSessionDate`, computing the weekday as `new Date(Date.UTC(y, m − 1, d)).getUTCDay()`.

- [ ] **Step 5: Run tests to verify they pass**

Run: the Step 3 command. Expected: PASS, and the pre-existing `getSessionGoal`/`filterTodaysSessionsForProgramme` tests stay green.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sessionGoal.js src/utils/childNames.js src/utils/haloGeometry.js src/utils/sessionDateFormat.js __tests__/sessionGoal.test.js __tests__/childNames.test.js __tests__/haloGeometry.test.js __tests__/sessionDateFormat.test.js
git commit -m "feat(session-complete): goal state, name list, halo geometry and pill date helpers"
```

---

### Task 2: Move the gauge to `sessions/` with a size parameter (Home pixel-identical)

**Files:**
- Move: `src/components/home/sessionGaugeGeometry.js` → `src/components/sessions/sessionGaugeGeometry.js`
- Move: `src/components/home/SegmentedSessionGauge.js` → `src/components/sessions/SegmentedSessionGauge.js`
- Modify: `src/screens/main/HomeScreen.js` (import path only)
- Test: `__tests__/sessionGaugeGeometry.test.js`, `__tests__/SegmentedSessionGauge.test.js` (import paths + new cases)

**Interfaces:**
- Consumes: `getGaugeColor` (`src/utils/sessionGoalPresentation.js`, unchanged).
- Produces:
  - `GAUGE_SIZES = { home, celebration }`, each `{ width, height, cx, cy, r, stroke, gapDeg: 5, maxSegments: 6 }`, derived by `cx = cy = width/2`, `r = width/2 − stroke/2 − 0.5`, `height = cy + stroke/2 + 1`. `home`: width 176, stroke 16 → `{ width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16 }`. `celebration`: width 232, stroke 22 → `{ width: 232, height: 128, cx: 116, cy: 116, r: 104.5, stroke: 22 }`. The old `GAUGE` export is removed (its only readers are the two moved files).
  - `buildGaugeGeometry(goal, size = GAUGE_SIZES.home) => { arcs: [{ d, color }], startDot: { color }, endDot: { color } }`, rules unchanged, with all points from `size`.
  - `buildEarnedArc({ target, count, state }, size = GAUGE_SIZES.home) => { d, length } | null`: `null` when `state === 'no_target'`, `!target`, `count < 1` or `count > target`. For `target ≤ maxSegments` it is segment `count − 1` (`d` identical to `buildGaugeGeometry(...).arcs[count − 1].d`), `length = r × spanDeg × π/180` with `spanDeg = (180 − gapDeg(target − 1))/target`. For `target > maxSegments` it is the slice from `180 − 180(count − 1)/target` to `180 − 180·count/target`, `length = r × (180/target) × π/180`.
  - `buildSkeletonGeometry(size) => { arcs: [{ d: <full 180→0 arc>, color: colors.border }], startDot: { color: colors.border }, endDot: { color: colors.border } }`.
  - `GaugeArcs({ geometry, size, children })` — named export from `SegmentedSessionGauge.js`: an `Svg` of `size.width × size.height` (`viewBox` the same) drawing every arc as a `Path` (`strokeWidth = size.stroke`, `fill="none"`), the start dot `Circle` at `(cx − r, cy)` and the end dot at `(cx + r, cy)`, both radius `stroke/2`, then `children` (overlay paths) last.
  - `SegmentedSessionGauge({ goal })` (default export) renders `GaugeArcs` with `GAUGE_SIZES.home` plus today's numeral row, styles unchanged.

- [ ] **Step 1: Write the failing tests**

In `__tests__/sessionGaugeGeometry.test.js`, change the import to `import { buildGaugeGeometry, buildEarnedArc, buildSkeletonGeometry, GAUGE_SIZES } from '../src/components/sessions/sessionGaugeGeometry';`. Leave every existing assertion as PR 1 left it (the home paths `'M 8.50 88.00 A 79.5 79.5 0 0 1 44.31 21.58'` etc. are the pixel-identity pin). Append:

```js
describe('gauge sizes', () => {
  test('home is unchanged and celebration scales by the same formulas', () => {
    expect(GAUGE_SIZES.home).toEqual({ width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16, gapDeg: 5, maxSegments: 6 });
    expect(GAUGE_SIZES.celebration).toEqual({ width: 232, height: 128, cx: 116, cy: 116, r: 104.5, stroke: 22, gapDeg: 5, maxSegments: 6 });
  });

  test('celebration segments use the celebration radius', () => {
    const g = buildGaugeGeometry({ target: 3, count: 2, ceiling: 5, state: 'below' }, GAUGE_SIZES.celebration);
    expect(g.arcs[0].d).toBe('M 11.50 116.00 A 104.5 104.5 0 0 1 58.58 28.69');
    expect(g.arcs[2].d).toBe('M 173.42 28.69 A 104.5 104.5 0 0 1 220.50 116.00');
  });
});

describe('buildEarnedArc', () => {
  test('is the segment this session filled, with its arc length', () => {
    const earned = buildEarnedArc({ target: 3, count: 3, state: 'met' }, GAUGE_SIZES.celebration);
    expect(earned.d).toBe('M 173.42 28.69 A 104.5 104.5 0 0 1 220.50 116.00');
    expect(earned.length).toBeCloseTo(103.35, 2);
  });

  test('first session is segment 0', () => {
    expect(buildEarnedArc({ target: 3, count: 1, state: 'below' }, GAUGE_SIZES.celebration).d)
      .toBe('M 11.50 116.00 A 104.5 104.5 0 0 1 58.58 28.69');
  });

  test('targets above 6 use the continuous slice', () => {
    const earned = buildEarnedArc({ target: 8, count: 4, state: 'below' }, GAUGE_SIZES.celebration);
    expect(earned.d).toBe('M 76.01 19.45 A 104.5 104.5 0 0 1 116.00 11.50');
    expect(earned.length).toBeCloseTo(41.04, 2);
  });

  test.each([
    [{ target: null, count: 2, state: 'no_target' }],
    [{ target: 3, count: 0, state: 'below' }],
    [{ target: 3, count: 4, state: 'met' }],
    [{ target: 3, count: 6, state: 'exceeded' }],
  ])('none for %o', (goal) => {
    expect(buildEarnedArc(goal, GAUGE_SIZES.celebration)).toBeNull();
  });
});

test('the skeleton is one continuous border arc with border dots', () => {
  expect(buildSkeletonGeometry(GAUGE_SIZES.celebration)).toEqual({
    arcs: [{ d: 'M 11.50 116.00 A 104.5 104.5 0 0 1 220.50 116.00', color: colors.border }],
    startDot: { color: colors.border },
    endDot: { color: colors.border },
  });
});
```

In `__tests__/SegmentedSessionGauge.test.js`, change the import to `../src/components/sessions/SegmentedSessionGauge` and append:

```js
import { Circle } from 'react-native-svg';

test('Home dots stay at 8.5 and 167.5 with radius 8 (pixel-identical)', () => {
  const screen = render(<SegmentedSessionGauge goal={{ target: 3, count: 2, ceiling: 5, state: 'below' }} />);
  const dots = screen.UNSAFE_getAllByType(Circle).map((c) => [c.props.cx, c.props.cy, c.props.r]);
  expect(dots).toEqual([[8.5, 88, 8], [167.5, 88, 8]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionGaugeGeometry.test.js __tests__/SegmentedSessionGauge.test.js`
Expected: FAIL with "Cannot find module '../src/components/sessions/sessionGaugeGeometry'".

- [ ] **Step 3: Move and generalise.** Move both files (delete the `home/` copies), add `GAUGE_SIZES`, the `size` parameter, `buildEarnedArc`, `buildSkeletonGeometry` and `GaugeArcs` per the Interfaces block. `point`/`arcPath` take the size. Update `HomeScreen.js`'s import to `../../components/sessions/SegmentedSessionGauge`. `SegmentedSessionGauge`'s numeral row and styles do not change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionGaugeGeometry.test.js __tests__/SegmentedSessionGauge.test.js __tests__/HomeScreen.test.js`
Expected: PASS; `HomeScreen.test.js` unchanged and green. Then `grep -rn "components/home/sessionGaugeGeometry\|components/home/SegmentedSessionGauge" src __tests__` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/home src/components/sessions src/screens/main/HomeScreen.js __tests__/sessionGaugeGeometry.test.js __tests__/SegmentedSessionGauge.test.js
git commit -m "refactor(gauge): move gauge geometry to sessions/ with sizes; Home unchanged"
```

---

### Task 3: `sessionCompleteView.js` — the gating table, pill, receipt rows and route params as pure functions

**Files:**
- Create: `src/utils/sessionCompleteView.js`
- Test: `__tests__/sessionCompleteView.test.js`

**Interfaces:**
- Consumes: `deriveGoalState`, `formatNameList`, `formatSessionDate` (Task 1); `getGaugeColor`, `getGoalCopy` (`sessionGoalPresentation.js`); `toLocalDateString` (`src/utils/localDate.js`); `LETTER_ORDER` (`src/constants/literacyConstants.js`).
- Produces (all exported):
  - `CELEBRATION_LEVELS = ['full', 'calm']`
  - `HEADLINES = { captured: 'Session\ncaptured.', reached: 'Daily target\nreached.' }`
  - `buildSessionCompleteParams({ selectedChildren, selectedLetters, sessionReadingLevel, sessionDateKey }) => { childCount, childNames, letters, readingLevel, sessionDate }`: `childCount = selectedChildren.length`; `childNames = selectedChildren.map((c) => c.first_name || 'Child')` (selection order); `letters` = `selectedLetters` sorted by `LETTER_ORDER` index (unknown letters last, stable); `readingLevel = sessionReadingLevel`; `sessionDate = sessionDateKey` (the stored `session_date` string). All values serialisable.
  - `describeCapturedPill(params, { isToday }) => { text, spoken }`:
    - `childCount` a positive number: text `"Saved for 1 child"` / `"Saved for {n} children"`; when `!isToday` and `params.sessionDate` is present, text appends `" · " + formatSessionDate(sessionDate, 'pill')` and spoken is `"{text without suffix}, for " + formatSessionDate(sessionDate, 'spoken')`; otherwise spoken equals text.
    - no `childCount`: text `"Nice work — it’s saved."`, spoken `"Nice work — it’s saved"` (no full stop, so the summary does not end in "..").
  - `buildReceiptRows({ childNames, letters, readingLevel }) => Array<{ key, label, value, accessibilityLabel }>` in the order children, letters, readingLevel; a row exists only when its value is present (non-empty array / non-empty string):
    - `{ key: 'children', label: 'Children', value: formatNameList(childNames), accessibilityLabel: 'Children: ' + formatNameList(childNames, { spoken: true }) }`
    - `{ key: 'letters', label: 'Letters', value: <letters sorted by LETTER_ORDER>, accessibilityLabel: 'Letters: ' + upper-cased letters joined ', ' }`
    - `{ key: 'readingLevel', label: 'Reading level', value: readingLevel, accessibilityLabel: 'Reading level: ' + readingLevel }`
  - `deriveSessionCompleteView({ goal, goalStatus, params, now, motionLevel }) => View` where `goalStatus` is `'loading' | 'ready' | 'failed'` and a `ready` status with `goal == null` is treated as failed:

```ts
type View = {
  isToday: boolean;              // params.sessionDate === toLocalDateString(now); missing date → false
  celebrate: boolean;            // CELEBRATION_LEVELS.includes(motionLevel)
  headline: string;              // HEADLINES.reached iff isToday && goal.state === 'met' (ready); else HEADLINES.captured
  pill: { text: string; spoken: string };
  receipt: ReceiptRow[];
  card: null                                             // failed / null goal: no card, no halo
      | { kind: 'skeleton' }                             // loading
      | { kind: 'goal'; goal; copy: { title; subtitle }; fromCopy: { title; subtitle } | null; showSub: boolean };
  gauge: null | { mode: 'static' | 'animated'; fromGoal: Goal | null; earned: { color: string } | null; flip: boolean };
  confetti: boolean;
  headlineMotion: 'target' | 'other' | 'still';
  announcement: string | null;   // null while loading
};
```

  Rules (the gating table, with `copy = getGoalCopy(goal, true)`):
  - `showSub = !(isToday && goal.state === 'met')`.
  - `gauge.mode = 'static'` when `!celebrate`, `!isToday`, or `goal.count === 0`. Static: `fromGoal = null`, `earned = null`, `flip = false`, `fromCopy = null`.
  - Otherwise `'animated'` with `fromGoal = { ...goal, count: goal.count − 1, state: deriveGoalState({ target, ceiling, count: goal.count − 1 }) }`;
    `earned = (goal.state !== 'no_target' && goal.target && goal.count <= goal.target) ? { color: fromGoal.count === 0 ? getGaugeColor(goal) : getGaugeColor(fromGoal) } : null`;
    `flip = goal.state !== 'no_target' && fromGoal.count > 0 && getGaugeColor(fromGoal) !== getGaugeColor(goal)`;
    `fromCopy = getGoalCopy(fromGoal, true)` with `subtitle: ''` when `fromGoal.count === 0`.
  - `confetti = celebrate && isToday && goal.state === 'met' && goal.count === goal.target`.
  - `headlineMotion = !celebrate ? 'still' : (isToday && goal?.state === 'met' && goal.count === goal.target ? 'target' : 'other')`.
  - `announcement` (once not loading): with a goal card, `` `Session captured. ${pill.spoken}. ${copy.title}. ${copy.subtitle}` ``; without, `` `Session captured. ${pill.spoken}.` ``.

- [ ] **Step 1: Write the failing tests** in `__tests__/sessionCompleteView.test.js`. Use `now = new Date('2026-10-13T10:00:00+02:00')` (today key `'2026-10-13'`) and `params = { childCount: 2, childNames: ['Anelisa', 'Athenkosi'], letters: ['m', 'l', 'n', 's'], readingLevel: '3 Letter Blends', sessionDate: '2026-10-13' }` unless a row says otherwise. Helper: `const goal = (count, target = 3, ceiling = 5) => ({ count, target, ceiling, state: deriveGoalState({ target, ceiling, count }) });` and `const view = (g, over = {}) => deriveSessionCompleteView({ goal: g, goalStatus: 'ready', params, now, motionLevel: 'full', ...over });`.

```js
describe('gating table', () => {
  test.each([
    // name, goal, overrides, expected
    ['exact target today', goal(3), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.red500, flip: true, confetti: true, headlineMotion: 'target' }],
    ['met above target today', goal(4), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['below today (2/3)', goal(2), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.ringStart, flip: true, confetti: false, headlineMotion: 'other' }],
    ['first today (1/3)', goal(1), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.ringStart, flip: false, confetti: false, headlineMotion: 'other' }],
    ['exceeded at ceiling + 1 (6, ceiling 5)', goal(6), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: true, confetti: false, headlineMotion: 'other' }],
    ['exceeded beyond ceiling + 1 (7)', goal(7), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['back-dated met', goal(3), { params: { ...params, sessionDate: '2026-10-12' } }, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['missing sessionDate', goal(3), { params: { ...params, sessionDate: undefined } }, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['no target today', { count: 2, target: null, ceiling: null, state: 'no_target' }, {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['defensive count 0 today', goal(0), {}, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['Yeboneer 1/1 sweeps straight in green', goal(1, 1, 1), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.success, flip: false, confetti: true, headlineMotion: 'target' }],
    ['numeracy 5/5', goal(5, 5, 5), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.red500, flip: true, confetti: true, headlineMotion: 'target' }],
    ['target 7 continuous slice (4/7)', goal(4, 7, 7), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.red500, flip: false, confetti: false, headlineMotion: 'other' }],
  ])('%s', (_name, g, over, expected) => {
    const v = view(g, over);
    expect(v.headline).toBe(expected.headline);
    expect(v.card.showSub).toBe(expected.showSub);
    expect(v.gauge.mode).toBe(expected.mode);
    expect(v.gauge.earned ? v.gauge.earned.color : null).toBe(expected.earned);
    expect(v.gauge.flip).toBe(expected.flip);
    expect(v.confetti).toBe(expected.confetti);
    expect(v.headlineMotion).toBe(expected.headlineMotion);
  });
});
```

(The `earned` colours above assume PR 1 switched `getGaugeColor`'s progressing colour to `colors.red500`; if `sessionGoalPresentation.js` returns another token for "progressing", use `getGaugeColor(goal(2))` in that row instead of a literal.)

Also, as separate tests:
- `'4/7 from layer keeps 3 of 7 and the earned slice exists'`: `view(goal(4, 7, 7)).gauge.fromGoal` equals `{ count: 3, target: 7, ceiling: 7, state: 'below' }`.
- `'5 → 6 drops the suffix'`: `view(goal(6)).gauge.fromGoal.state === 'met'` and `view(goal(6)).card.goal.state === 'exceeded'`.
- `'count − 1 === 0 leaves the old sub-line blank'`: `view(goal(1)).card.fromCopy` equals `{ title: 'No sessions yet today', subtitle: '' }`.
- `'goal null and failed give no card, no gauge, captured headline'`: for `{ goal: null, goalStatus: 'ready' }` and `{ goal: null, goalStatus: 'failed' }`: `card === null`, `gauge === null`, `confetti === false`, `headline === HEADLINES.captured`, `announcement === 'Session captured. Saved for 2 children.'`.
- `'loading shows the skeleton and no announcement'`: `{ goal: null, goalStatus: 'loading' }` → `card` equals `{ kind: 'skeleton' }`, `announcement === null`, `headline === HEADLINES.captured`.
- `'still and calm levels'`: `view(goal(3), { motionLevel: 'still' })` → `celebrate false`, `gauge.mode 'static'`, `confetti false`, `headlineMotion 'still'`, headline still `HEADLINES.reached`; `view(goal(3), { motionLevel: 'calm' })` → `celebrate true`, `confetti true`. `expect(CELEBRATION_LEVELS).toEqual(['full', 'calm'])`.
- **Review Focus 2** `'a session saved before midnight does not celebrate after it'`: `params.sessionDate = '2026-10-18'`, `now = new Date('2026-10-19T00:00:30+02:00')`, `goal(0)` → `isToday false`, `gauge.mode 'static'`, `confetti false`, `headline HEADLINES.captured`, `pill.text === 'Saved for 2 children · Sun 18 Oct'`.
- `'isToday uses the Johannesburg day under Auckland'`: set `process.env.TZ = 'Pacific/Auckland'` (restore after), `now = new Date('2026-10-18T12:00:00.000Z')`, `sessionDate '2026-10-18'` → `isToday true`.
- Announcements (exact strings):
  - `view(goal(3)).announcement === 'Session captured. Saved for 2 children. 3 of 3 sessions today. Daily target reached.'`
  - `view(goal(2)).announcement === 'Session captured. Saved for 2 children. 2 of 3 sessions today. One more pair reaches your target.'`
  - back-dated `view(goal(3), { params: { ...params, sessionDate: '2026-10-13' }, now: new Date('2026-10-14T09:00:00+02:00') }).announcement === 'Session captured. Saved for 2 children, for Tuesday 13 October. 3 of 3 sessions today. Daily target reached.'`
  - fallback pill: `view(goal(2), { params: { ...params, childCount: undefined } }).announcement === 'Session captured. Nice work — it’s saved. 2 of 3 sessions today. One more pair reaches your target.'`
- Pill: `describeCapturedPill({ childCount: 1, sessionDate: '2026-10-13' }, { isToday: true })` → `{ text: 'Saved for 1 child', spoken: 'Saved for 1 child' }`; `describeCapturedPill({ childCount: 2, sessionDate: '2026-10-13' }, { isToday: false })` → `{ text: 'Saved for 2 children · Tue 13 Oct', spoken: 'Saved for 2 children, for Tuesday 13 October' }`; `describeCapturedPill({}, { isToday: true }).text === 'Nice work — it’s saved.'`.
- Receipt: `buildReceiptRows({ childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'], readingLevel: '3 Letter Blends' })` equals the three rows with `value` `'Anelisa & Athenkosi'`, `['m', 'l', 'n', 's']`, `'3 Letter Blends'` and labels `'Children: Anelisa and Athenkosi'`, `'Letters: M, L, N, S'`, `'Reading level: 3 Letter Blends'`; `buildReceiptRows({ childNames: [], letters: undefined, readingLevel: null })` equals `[]`; only-letters input gives one `letters` row.
- **Review Focus 4** `buildSessionCompleteParams`:

```js
test('route params come from what the form already holds', () => {
  expect(buildSessionCompleteParams({
    selectedChildren: [{ id: 'c1', first_name: 'Anelisa' }, { id: 'c2', first_name: '' }, { id: 'c3' }],
    selectedLetters: ['s', 'm', 'n', 'l'],
    sessionReadingLevel: '3 Letter Blends',
    sessionDateKey: '2026-10-13',
  })).toEqual({
    childCount: 3,
    childNames: ['Anelisa', 'Child', 'Child'],
    letters: ['m', 'l', 'n', 's'],
    readingLevel: '3 Letter Blends',
    sessionDate: '2026-10-13',
  });
  expect(buildReceiptRows({ childNames: ['Child', 'Child'] })[0].value).toBe('Child & Child');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionCompleteView.test.js`
Expected: FAIL with "Cannot find module '../src/utils/sessionCompleteView'".

- [ ] **Step 3: Implement** `src/utils/sessionCompleteView.js` with the exports and rules above. Pure: no React, no clock reads (use `now`).

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionCompleteView.js __tests__/sessionCompleteView.test.js
git commit -m "feat(session-complete): pure view model for the gating table, pill, receipt and params"
```

---

### Task 4: The form passes the full route params (overview C16)

**Files:**
- Modify: `src/screens/sessions/LiteracySessionForm.js`
- Test: `__tests__/LiteracySessionForm.test.js` (unit), `__tests__/LiteracySessionForm.submit.test.js` (integration, already in `jest.integration.config.js`)

**Interfaces:**
- Consumes: `buildSessionCompleteParams` (Task 3); the form's existing `selectedChildren`, `selectedLetters`, `sessionReadingLevel` and the `session.session_date` string it builds with `formatDateForStorage(sessionDate)` (PR 3 may have moved that call; use the same key the session payload stores).
- Produces: `navigation.replace('SessionComplete', { childCount, childNames, letters, readingLevel, sessionDate })`. Nothing else in the submit path changes: validation, `persistLiteracySession`, the leave guard, `triggerBackgroundSync` and the form's own `refreshSyncStatus()` stay as PR 3 left them.

- [ ] **Step 1: Write the failing tests**

`__tests__/LiteracySessionForm.test.js`: change every `toHaveBeenCalledWith('SessionComplete', { childCount: 1 })` to the full object. With the file's fixture (child "Amahle Dlamini", letter A, `READING_LEVELS[0]`):

```js
expect(screen.navigation.replace).toHaveBeenCalledWith('SessionComplete', {
  childCount: 1,
  childNames: ['Amahle'],
  letters: ['a'],
  readingLevel: READING_LEVELS[0],
  sessionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
});
```

Add, inside `describe('completion ordering')`:

```js
test('params carry the stored session_date under Auckland (picker day = stored day = pill day)', async () => {
  process.env.TZ = 'Pacific/Auckland';
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-18T12:00:00.000Z')); // 01:00 on the 19th in Auckland, 14:00 on the 18th in Johannesburg
  const screen = renderForm();

  submitValidForm(screen);

  await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledTimes(1));
  const [, params] = screen.navigation.replace.mock.calls[0];
  const [{ session }] = mockPersistLiteracySession.mock.calls[0];
  expect(session.session_date).toBe('2026-10-18');
  expect(params.sessionDate).toBe(session.session_date);
  expect(formatSessionDate(params.sessionDate, 'pill')).toBe('Sun 18 Oct');
});

test('params list letters in teaching order, not tap order', async () => {
  // tap 's' then 'm' then 'a' (labels as PR 3 left them, e.g. 'S, not selected')
  // … then submit; expect params.letters toEqual(['a', 'm', 's'])
});
```

(Write the second test fully with the form's real letter labels; `submitValidForm` already taps "A".)

`__tests__/LiteracySessionForm.submit.test.js`, in `'back-to-back submit presses persist one session and navigate once'`, replace the last assertion with:

```js
expect(screen.navigation.replace).toHaveBeenCalledWith('SessionComplete', {
  childCount: 1,
  childNames: [mockChild.first_name],
  letters: ['a'],
  readingLevel: READING_LEVELS[0],
  sessionDate: sessions[0].session_date,
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LiteracySessionForm.test.js` and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js`
Expected: FAIL, received `{ childCount: 1 }`.

- [ ] **Step 3: Implement.** Find the single `navigation.replace('SessionComplete', …)` (`grep -n "SessionComplete" src/screens/sessions/LiteracySessionForm.js`). Build the params with `buildSessionCompleteParams({ selectedChildren, selectedLetters, sessionReadingLevel, sessionDateKey: session.session_date })` at the moment the `session` object is built. If PR 3 issues the replace in a later effect (after `allowLeave` commits, overview R8), store the params in a ref at submit time and pass the ref's value to that replace. Do not move or reorder any other step.

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 commands. Expected: PASS, including PR 3's discard-guard and save-failure tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/sessions/LiteracySessionForm.js __tests__/LiteracySessionForm.test.js __tests__/LiteracySessionForm.submit.test.js
git commit -m "feat(record): pass names, letters, level and date to Session complete"
```

---

### Task 5: `CapturedPill` and the receipt (`SessionReceipt`, `ReceiptRow`, `LetterReceiptTile`)

**Files:**
- Create: `src/components/sessions/CapturedPill.js`
- Create: `src/components/sessions/SessionReceipt.js` (default `SessionReceipt`, named `ReceiptRow`)
- Create: `src/components/sessions/LetterReceiptTile.js`
- Test: `__tests__/SessionReceipt.test.js`, `__tests__/CapturedPill.test.js`

**Interfaces:**
- Consumes: `buildReceiptRows` row shape (Task 3).
- Produces:
  - `CapturedPill({ text })`: row, centred, `minHeight` 34, `borderRadius` 17, `colors.surface`, padding `0 16 0 7`, gap 8; shadow `shadowColor: colors.red900`, offset `{0, 6}`, opacity 0.18, radius 8, `elevation` 3 (component-local, overview §2.3). Check disc 22×22, radius 11, `colors.success`, holding an `Svg` 14×14 `viewBox="0 0 24 24"` `Path d="m5 12.5 4.5 4.5L19 7.5"` stroke `colors.surface`, width 3, round caps and joins, no fill. Text `typeRoles.textPill`, `colors.text`, centred, wraps, no `numberOfLines`.
  - `SessionReceipt({ rows })`: `null` when `rows` is empty; otherwise a `View` with `marginTop` 20, `marginHorizontal` 24, rendering `ReceiptRow` per row with `isLast` on the final one.
  - `ReceiptRow({ label, value, accessibilityLabel, isLast })`: one `accessible` element (`accessibilityLabel` from the row; children not read separately). Row `flexDirection: 'row'`, `justifyContent: 'space-between'`, gap 16, `minHeight` 52; 1dp bottom border `tints.rule` unless `isLast`. Label: `typeRoles.textSectionLabel`, `colors.textSecondary`, `numberOfLines={1}`, centred vertically by default. Text value (`typeof value === 'string'`): `typeRoles.textRowTitle`, `colors.text`, `flex: 1`, `paddingVertical` 8, `textAlign: 'right'`; when its `onTextLayout` reports `lines.length > 1` it switches to `textAlign: 'left'` and the label gets `marginTop` 11 with the row `alignItems: 'flex-start'`. Letters value (array): a wrapping row (`flexWrap: 'wrap'`, gap 6, `maxWidth` 246, `flex: 1`, `paddingVertical` 8) with `justifyContent: 'flex-end'`, switching to `'flex-start'` when its `onLayout` height exceeds 36 (it wrapped); label `marginTop` 18 and row `alignItems: 'flex-start'` always. Tiles never shrink and never collapse.
  - `LetterReceiptTile({ letter })`: 36×36, `borderRadius.sm` (9), `colors.red50` fill, 1.5 `colors.red100` border, letter centred in `typeRoles.textRowTitle` `colors.red700`, `maxFontSizeMultiplier={1.2}`, drawn exactly as given (lowercase). Not accessible on its own.

- [ ] **Step 1: Write the failing tests**

`__tests__/CapturedPill.test.js`: renders "Saved for 2 children · Tue 13 Oct"; the `Text` has no `numberOfLines`; the outer view's style has `backgroundColor: colors.surface`, `minHeight: 34`, `shadowColor: colors.red900`; the disc has `backgroundColor: colors.success`; the `Path` has `d="m5 12.5 4.5 4.5L19 7.5"` and `stroke={colors.surface}`.

`__tests__/SessionReceipt.test.js` (rows from `buildReceiptRows`):

```js
const rows = buildReceiptRows({ childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'], readingLevel: '3 Letter Blends' });

test('each row is one accessible phrase in order', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const labels = screen.UNSAFE_getAllByProps({ accessible: true }).map((n) => n.props.accessibilityLabel).filter(Boolean);
  expect(labels).toEqual(['Children: Anelisa and Athenkosi', 'Letters: M, L, N, S', 'Reading level: 3 Letter Blends']);
});

test('tiles draw lowercase in teaching order', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  expect(['m', 'l', 'n', 's'].map((l) => screen.getByText(l))).toHaveLength(4);
});

test('dividers under every row but the last', () => {
  // the first two rows' styles include borderBottomWidth 1 and borderBottomColor tints.rule; the last has none
});

test('a wrapped text value turns left-aligned with the label on the first line (font 1.3, Review Focus)', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const value = screen.getByText('Anelisa & Athenkosi');
  expect(StyleSheet.flatten(value.props.style).textAlign).toBe('right');
  fireEvent(value, 'textLayout', { nativeEvent: { lines: [{}, {}] } });
  expect(StyleSheet.flatten(screen.getByText('Anelisa & Athenkosi').props.style).textAlign).toBe('left');
  expect(StyleSheet.flatten(screen.getByText('Children').props.style).marginTop).toBe(11);
});

test('letter tiles start right-aligned and switch to flex-start once they wrap', () => {
  // fire 'layout' with { nativeEvent: { layout: { width: 246, height: 78 } } } on testID 'receipt-letters'
  // and expect its justifyContent to change from 'flex-end' to 'flex-start'
});

test('no rows renders nothing', () => {
  expect(render(<SessionReceipt rows={[]} />).toJSON()).toBeNull();
});
```

(Fill the two commented tests with real assertions; give the letters container `testID="receipt-letters"`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SessionReceipt.test.js __tests__/CapturedPill.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement** the three components per the Interfaces block.

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command. Expected: PASS. Also run PR 1's raw-hex/fontWeight guard test file(s) (`grep -ln "fontWeight\|FORBIDDEN_VALUES\|raw hex" __tests__` to find them). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/CapturedPill.js src/components/sessions/SessionReceipt.js src/components/sessions/LetterReceiptTile.js __tests__/SessionReceipt.test.js __tests__/CapturedPill.test.js
git commit -m "feat(session-complete): captured pill and receipt rows"
```

---

### Task 6: `SyncStatusLine` — truthful from the first frame (overview §8 R1)

**Files:**
- Create: `src/components/sessions/SyncStatusLine.js` (default `SyncStatusLine`, named `describeSyncLine`)
- Test: `__tests__/SyncStatusLine.test.js`

**Interfaces:**
- Consumes: `useOffline()` → `{ isOnline, isSyncing, waitingCount, needsAttentionCount, refreshSyncStatus }`; `useSignedInEA().handle.isCurrent()`; `deriveSyncState`, `describeSyncState` (`src/utils/syncStatusPresenter.js`); `useMotion().reduceMotion`.
- Produces:
  - `describeSyncLine({ phase, state, message }) => null | { glyph, glyphColor, textColor, message }` where `phase` is `'pending' | 'fallback' | 'live'`:
    - `pending` → `null`.
    - `fallback` → `{ glyph: 'cloud-outline', glyphColor: colors.textSecondary, textColor: colors.textSecondary, message: 'Saved on this phone' }`.
    - `live`, by `state`: `waiting` → `cloud-upload-outline`; `offline` → `cloud-offline-outline`; `synced` → `cloud-done-outline` with `glyphColor: colors.successText`; `needs_attention` → `alert-circle-outline` with glyph and text `colors.warningText`; `syncing` → `glyph: 'spinner'`. All other colours `colors.textSecondary`. `message` is the presenter's `message`, verbatim.
  - `SyncStatusLine()`: on mount calls `refreshSyncStatus({ autoTrigger: false })` once. Phase `pending` until it settles; `live` only if the resolved value is a non-null object **and** `handle.isCurrent()` is still true **and** the component is still mounted; any other outcome (`null`, `undefined`, rejection, stale handle) → `fallback`, which stays for the screen's life (decision: once freshness is unproven, never claim it later). In `live` the line follows `useOffline()` on every render. Layout: a `View` with `minHeight` 18 and no `accessibilityLiveRegion`, not pressable, containing a centred `Text` (`typeRoles.textNote`, `textColor`) whose first child is an **inline `View`** 26 wide × 18 tall (the 18dp glyph at its left, so the 8dp gap is inside the box; nested `Text` ignores margins) followed by the message. The glyph is an 18dp `Ionicons`, or for `spinner` an 18dp `Svg` ring: track `Circle` r 7.7 stroke `tints.spinnerTrack` width 2.6, quarter arc in `colors.textSecondary` width 2.6, rotating 1000ms linear on the native driver in an `Animated.loop`, not rotating when `useMotion().reduceMotion`. A message change cross-fades: the previous line is kept absolutely positioned on top while it fades 1 → 0 and the new one fades 0 → 1, 150ms linear, native driver; the previous layer unmounts when done (footer height never changes).

- [ ] **Step 1: Write the failing tests** in `__tests__/SyncStatusLine.test.js`. Mock `../src/context/OfflineContext` (`useOffline: () => mockOffline()`), `../src/context/SignedInEAContext` (`useSignedInEA: () => ({ handle: mockHandle })` with `mockHandle.isCurrent = jest.fn(() => true)`), and `@expo/vector-icons` as `{ Ionicons: (props) => { mockIcon(props); return null; } }`. Wrap renders in `<MotionProvider value={{ motionLevel: 'full', reduceMotion: false, tier: 'high' }}>`.

```js
test('blank until its own refresh resolves, then the presenter line', async () => {
  let resolve;
  mockOffline.mockReturnValue({ isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0, refreshSyncStatus: jest.fn(() => new Promise((r) => { resolve = r; })) });
  const screen = renderLine();
  expect(screen.queryByText(/saved|synced|sync/i)).toBeNull();
  await act(async () => resolve({ waitingCount: 3 }));
  expect(screen.getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(mockOffline().refreshSyncStatus).toHaveBeenCalledWith({ autoTrigger: false });
});

test('a null snapshot with stale zero counters never says synced (R1)', async () => {
  mockOffline.mockReturnValue({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, refreshSyncStatus: jest.fn().mockResolvedValue(null) });
  const screen = renderLine();
  expect(await screen.findByText('Saved on this phone')).toBeTruthy();
  expect(screen.queryByText('All saved and synced')).toBeNull();
});

test.each([
  ['undefined (context default)', () => Promise.resolve(undefined)],
  ['a rejection', () => Promise.reject(new Error('read failed'))],
])('%s falls back (Review Focus 3)', async (_name, refresh) => {
  mockOffline.mockReturnValue({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, refreshSyncStatus: jest.fn(refresh) });
  expect(await renderLine().findByText('Saved on this phone')).toBeTruthy();
});

test('a handle that went stale during the read falls back', async () => {
  mockHandle.isCurrent.mockReturnValue(false);
  // refresh resolves { waitingCount: 0 }; expect 'Saved on this phone'
});

test('live line follows context changes after a fresh snapshot', async () => {
  // resolve { waitingCount: 1 }; then rerender with isSyncing: true → 'Syncing…';
  // then isSyncing false, waitingCount 0 → 'All saved and synced' with mockIcon called with name 'cloud-done-outline', color colors.successText
});

test('needs attention uses the warning text colour', () => {
  expect(describeSyncLine({ phase: 'live', state: 'needs_attention', message: '1 item needs attention' }))
    .toEqual({ glyph: 'alert-circle-outline', glyphColor: colors.warningText, textColor: colors.warningText, message: '1 item needs attention' });
});

test('is not a live region and not pressable', async () => {
  // after resolve: no node has accessibilityLiveRegion; no node has accessibilityRole 'button' or onPress
});
```

(Fill the commented tests with real assertions. The offline copy is whatever PR 1's presenter returns, e.g. "Saved on your phone · 5 will sync when you’re online"; assert it through `describeSyncState('offline', { waitingCount: 5 }).message` rather than a literal.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SyncStatusLine.test.js`
Expected: FAIL with "Cannot find module '../src/components/sessions/SyncStatusLine'".

- [ ] **Step 3: Implement** per the Interfaces block. Guard every async continuation with a mounted ref.

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command. Expected: PASS with no "not wrapped in act" or "state update on an unmounted component" warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/SyncStatusLine.js __tests__/SyncStatusLine.test.js
git commit -m "feat(session-complete): sync line that waits for a fresh snapshot"
```

---

### Task 7: `CelebrationGauge` — skeleton, from/to layers, earned path, numeral and copy

**Files:**
- Create: `src/components/sessions/CelebrationGauge.js`
- Test: `__tests__/CelebrationGauge.test.js`

**Interfaces:**
- Consumes: `GAUGE_SIZES.celebration`, `buildGaugeGeometry`, `buildEarnedArc`, `buildSkeletonGeometry`, `GaugeArcs` (Task 2); `getGaugeAccessibilityLabel` (`sessionGoalPresentation.js`); `view.card` and `view.gauge` shapes (Task 3).
- Produces: `CelebrationGauge({ card, gauge, values = AT_REST, settled = true })` — the **inside** of the white card (the screen draws the card box). `values` is `{ content, earned, flip }` (`Animated.Value`s 0 → 1); `AT_REST` is all three at 1.
  - `card.kind === 'skeleton'`: `GaugeArcs` with `buildSkeletonGeometry(celebration)`, no numeral, then bar 168×18 radius 9 `marginTop` 13 and bar 212×12 radius 6 `marginTop` 13, both `colors.border` (decision: 13, not the part's 12, so the skeleton equals the with-sub card height under `textSmall` 14/20: 18 + 128 + 13 + 18 + 13 + 12 + 16 = 218). Wrapper `testID="gauge-skeleton"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`.
  - `card.kind === 'goal'`:
    - An `accessible` wrapper, `accessibilityRole="image"`, `accessibilityLabel={getGaugeAccessibilityLabel(card.goal)}` (the **final** goal from the first frame), 232×128, holding the stacked layers:
      - **from layer** (only when `gauge.mode === 'animated'`, `gauge.fromGoal` and `!settled`): `Animated.View` absolute fill, opacity `1 − flip`, with `GaugeArcs(buildGaugeGeometry(fromGoal, celebration))` and, when `gauge.earned`, an overlay `AnimatedPath` (`Animated.createAnimatedComponent(Path)`, `testID="gauge-earned"`) with `d`/`length` from `buildEarnedArc(card.goal, celebration)`, stroke `gauge.earned.color`, width 22, `strokeDasharray={[length, length]}`, `strokeDashoffset = earned.interpolate({ inputRange: [0, 1], outputRange: [length + 1, 0] })`. The from layer's dot at the earned segment's far end is drawn in the earned colour once the sweep ends (opacity `earned.interpolate({ inputRange: [0.99, 1], outputRange: [0, 1], extrapolate: 'clamp' })`); when the earned segment is index 0 the start dot takes the earned colour from the start.
      - **to layer**: `GaugeArcs(buildGaugeGeometry(card.goal, celebration))`; opacity `flip` when `gauge.flip`, `flip.interpolate({ inputRange: [0, 0.01], outputRange: [0, 1], extrapolate: 'clamp' })` when animated without flip (an instant swap at the start of the flip track), 1 when static or settled.
      - **numeral row**: absolute, bottom 1, centred, the numeral on the gauge's centre line with the suffix on a zero-width anchor (Home's pattern). To numeral: `typeRoles.displayNumeralXL`, `fontVariant: ['tabular-nums']`, `colors.text` (`colors.textSecondary` at count 0), `maxFontSizeMultiplier={1.2}`, `testID="gauge-numeral-to"`, opacity `flip` and `translateY` `4 → 0` when animated, else static. Suffix: `{ ...typeRoles.textRowTitle, fontSize: 24, lineHeight: 28 }`, `colors.textSecondary`, `maxFontSizeMultiplier={1.2}`; `'/{target}'` with `marginLeft` 1 for `below`/`met`, none for `exceeded`, `' today'` with `marginLeft` 4 for `no_target`. From numeral (animated, `!settled`): `fromGoal.count` with its own suffix, opacity `1 − flip`, `testID="gauge-numeral-from"`.
    - Heading `typeRoles.displayHeading`, `colors.text`, centred, `marginTop` 10, wraps; sub-line (only when `card.showSub`) `typeRoles.textSmall`, `colors.textSecondary`, centred, `marginTop` 2. When animated and `!settled`, `fromCopy` texts are stacked under the new ones with opacity `1 − flip` and are hidden from accessibility; the new ones fade in with `flip` and rise 4. A blank `fromCopy.subtitle` renders nothing.
    - While `content < 1` and `!settled`, the skeleton is drawn as an absolute overlay with opacity `1 − content` (the 150ms skeleton → content cross-fade); the content itself has opacity `content`.

- [ ] **Step 1: Write the failing tests** in `__tests__/CelebrationGauge.test.js`, building `card`/`gauge` with `deriveSessionCompleteView` (Task 3) so the shapes stay in one place:

```js
const viewFor = (goal, over = {}) => deriveSessionCompleteView({
  goal, goalStatus: 'ready', now: new Date('2026-10-13T10:00:00+02:00'), motionLevel: 'full',
  params: { childCount: 2, sessionDate: '2026-10-13' }, ...over,
});

test('skeleton has no numeral and is hidden from accessibility', () => {
  const screen = render(<CelebrationGauge card={{ kind: 'skeleton' }} gauge={null} />);
  expect(screen.getByTestId('gauge-skeleton')).toBeTruthy();
  expect(screen.queryByTestId('gauge-numeral-to')).toBeNull();
});

test('2/3 static: numeral, suffix, heading and sub-line', () => {
  const v = viewFor({ count: 2, target: 3, ceiling: 5, state: 'below' }, { motionLevel: 'still' });
  const screen = render(<CelebrationGauge card={v.card} gauge={v.gauge} />);
  expect(screen.getByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('/3')).toBeTruthy();
  expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
  expect(screen.getByText('One more pair reaches your target.')).toBeTruthy();
  expect(screen.queryByTestId('gauge-earned')).toBeNull();
});

test('3/3 today mid-animation: earned path, both numerals, final accessible label', () => {
  const v = viewFor({ count: 3, target: 3, ceiling: 5, state: 'met' });
  const values = { content: new Animated.Value(1), earned: new Animated.Value(0), flip: new Animated.Value(0) };
  const screen = render(<CelebrationGauge card={v.card} gauge={v.gauge} values={values} settled={false} />);
  expect(screen.getByTestId('gauge-earned')).toBeTruthy();
  expect(screen.getByTestId('gauge-numeral-from')).toHaveTextContent('2');
  expect(screen.getByTestId('gauge-numeral-to')).toHaveTextContent('3');
  expect(screen.getByLabelText('3 of 3 sessions today. Goal met.')).toBeTruthy();
  expect(screen.queryByText('Daily target reached.')).toBeNull(); // showSub false
});

test('settled shows only the final content', () => {
  // same v, settled true → no 'gauge-numeral-from', no 'gauge-earned', '3' present
});

test('suffix rules: exceeded none, no target " today"', () => {
  // exceeded 6/3 → queryByText('/3') null; no_target count 2 → getByText(' today')
});

test('first session never flashes "Record your first session."', () => {
  // v = viewFor(1/3), settled false → queryByText('Record your first session.') null
});
```

(Fill the commented tests with real assertions. `toHaveTextContent` comes from `@testing-library/react-native`'s matchers; if the repo does not extend them, assert via `getByText` within the testID node.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/CelebrationGauge.test.js`
Expected: FAIL with "Cannot find module '../src/components/sessions/CelebrationGauge'".

- [ ] **Step 3: Implement** per the Interfaces block. Only the `strokeDashoffset` binding is JS-driven; everything else is opacity/transform.

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command plus `__tests__/SegmentedSessionGauge.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/CelebrationGauge.js __tests__/CelebrationGauge.test.js
git commit -m "feat(session-complete): celebration gauge with skeleton, layers and earned sweep"
```

---

### Task 8: Confetti and the red hero (`confettiPieces`, `ConfettiBurst`, `SessionCompleteHero`)

**Files:**
- Create: `src/components/sessions/confettiPieces.js`
- Create: `src/components/sessions/ConfettiBurst.js`
- Create: `src/components/sessions/SessionCompleteHero.js`
- Test: `__tests__/confettiPieces.test.js`, `__tests__/SessionCompleteHero.test.js`

**Interfaces:**
- Consumes: `haloGeometry` (Task 1); `CapturedPill` (Task 5); `view.pill`, `view.headline`, `view.card` (Task 3).
- Produces:
  - `CONFETTI_PIECES`: the 22 rows of part 4's table, verbatim, as `{ kind: 'sliver' | 'dot' | 'square', color, dx, dy, rot, ux, uy }`, with `color` resolved to `colors.surface` ("white"), `colors.red100` or `colors.red200`.
  - `CONFETTI_SIZES = { sliver: { w: 3.5, h: 14, radius: 1.5 }, dot: { w: 8, h: 8, radius: 4 }, square: { w: 8, h: 8, radius: 1.2 } }`.
  - `placeConfetti(width) => Array<piece & { x, y, w, h, radius }>`: `x = width/2 + dx × Math.min(1, width/390)` (centre, from the screen's left edge), `y = dy` (centre, relative to the card's top edge, negative is above).
  - `ConfettiBurst({ width, layer, travel, fade })`: `testID="confetti-layer"`, absolute container whose origin is the card's top edge (the hero places it at `bottom: 108`, height 0, `overflow: 'visible'`), `pointerEvents="none"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`, opacity `layer`. Each piece is an `Animated.View` at `left = x − w/2`, `top = y − h/2`, `w × h`, `borderRadius`, `backgroundColor`, with `transform: [{ translateX: travel → −36·ux·(1 − travel) }, { translateY: travel → −36·uy·(1 − travel) }, { rotate: rot + 'deg' }]` and opacity `1 − fade`.
  - `SessionCompleteHero({ width, insetTop, pill, headline, showHalo, confetti = null, pillStyle, headlineStyle, headlineHidden })`: the red field. `View` with `backgroundColor: colors.red600`, `overflow: 'hidden'`, `paddingTop: insetTop + 11`, `paddingHorizontal` 24, `paddingBottom: showHalo ? haloGeometry(width).headlineGap + 108 : 32`. Children in z-order: halo `Svg` (only when `showHalo`; `testID="session-complete-halo"`; absolute, `bottom: 0`, `left: 0`, width `width`, height `svgHeight`; one `Circle cx={cx} cy={cy} r={r}` stroke `colors.red500` width 32, no fill; hidden from accessibility), then `ConfettiBurst` when `confetti` (`{ layer, travel, fade }`), then `Animated.View` (`pillStyle`, `alignSelf: 'center'`) holding `CapturedPill`, then the headline `Animated.Text` (`headlineStyle`) with `marginTop` 16, `typeRoles.display3XL`, `colors.onDark`, `textAlign: 'center'`, `maxFontSizeMultiplier={1.2}`, `accessibilityRole="header"`; while `headlineHidden` it keeps its two-line height at opacity 0 and is hidden from accessibility.

- [ ] **Step 1: Write the failing tests**

`__tests__/confettiPieces.test.js`:

```js
const extents = ({ kind, rot, w, h }) => {
  if (kind === 'dot') return [w / 2, h / 2];
  const c = Math.abs(Math.cos((rot * Math.PI) / 180));
  const s = Math.abs(Math.sin((rot * Math.PI) / 180));
  return [(w / 2) * c + (h / 2) * s, (w / 2) * s + (h / 2) * c];
};

test('22 pieces in white, red100 and red200 only (never green)', () => {
  expect(CONFETTI_PIECES).toHaveLength(22);
  expect(new Set(CONFETTI_PIECES.map((p) => p.color))).toEqual(new Set([colors.surface, colors.red100, colors.red200]));
});

test.each([360, 390])('at rest at %idp nothing touches the frame, the card or the headline', (width) => {
  const { headlineGap } = haloGeometry(width);
  for (const piece of placeConfetti(width)) {
    const [hx, hy] = extents(piece);
    expect(piece.x - hx).toBeGreaterThanOrEqual(12);
    expect(width - (piece.x + hx)).toBeGreaterThanOrEqual(12);
    expect(piece.y + hy).toBeLessThanOrEqual(-12);               // 12 clear above the card
    expect(piece.y - hy).toBeGreaterThanOrEqual(-headlineGap + 8); // 8 clear below the headline
  }
});

test('outer pieces scale in on narrow phones', () => {
  expect(placeConfetti(360)[7].x).toBeCloseTo(180 - 163.1 * (360 / 390), 5);
  expect(placeConfetti(430)[7].x).toBeCloseTo(215 - 163.1, 5);
});
```

`__tests__/SessionCompleteHero.test.js`:
- at width 390, inset 47, `showHalo`: the `Circle` has `cx 195`, `cy 231`, `r 214`, `strokeWidth 32`, `stroke colors.red500`; the halo `Svg` has height 205; the field style has `paddingTop 58` and `paddingBottom 220` (112 + 108), `backgroundColor colors.red600`.
- `showHalo={false}`: no `session-complete-halo`, `paddingBottom 32`.
- headline "Session\ncaptured." found by role `header`; pill text rendered.
- no `confetti` prop → no `confetti-layer`; with `{ layer, travel, fade }` values → `confetti-layer` present with 22 children, hidden from accessibility.
- `headlineHidden` → the headline has opacity 0 and `accessibilityElementsHidden`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/confettiPieces.test.js __tests__/SessionCompleteHero.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement** the three files per the Interfaces block. Copy the 22-row table exactly from part 4 ("Confetti", the C3 table); do not use the scatter drawn on `red-complete-final` (stale, per the spec).

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/confettiPieces.js src/components/sessions/ConfettiBurst.js src/components/sessions/SessionCompleteHero.js __tests__/confettiPieces.test.js __tests__/SessionCompleteHero.test.js
git commit -m "feat(session-complete): red hero with halo, captured pill, headline and three-fan confetti"
```

---

### Task 9: `useCelebrationTimeline` — every track in one place

**Files:**
- Create: `src/components/sessions/celebrationTimeline.js`
- Test: `__tests__/celebrationTimeline.test.js`

**Interfaces:**
- Consumes: `view` (Task 3); `easing.enter`, `easing.sweep` (`src/constants/motion.js`).
- Produces:
  - `TIMELINE` (ms):

```js
export const TIMELINE = {
  cardEnter: { delay: 0, duration: 300 },       // from mount; easing.enter
  pillEnter: { delay: 0, duration: 200 },       // from mount; easing.enter
  content: { delay: 0, duration: 150 },         // from goal settle; linear
  earned: { delay: 250, duration: 300 },        // easing.sweep; JS driver (SVG prop)
  flip: { delay: 650, duration: 150 },          // easing.enter
  confettiLayer: { delay: 700, duration: 0 },
  confettiTravel: { delay: 700, duration: 300 },// easing.sweep
  confettiFade: { delay: 1000, duration: 300 }, // linear
  headlineTarget: { delay: 800, duration: 300 },// easing.enter
  headlineOther: { delay: 100, duration: 300 }, // easing.enter
  still: { delay: 0, duration: 150 },           // linear, opacity only
};
```

  - `useCelebrationTimeline({ view, goalStatus }) => { values, settled }` with `values = { cardEnter, pillEnter, content, earned, flip, confettiLayer, confettiTravel, confettiFade, headline }` (stable `Animated.Value`s) and `settled: boolean`.
    - At mount: when `view.celebrate`, start `cardEnter` and `pillEnter` 0 → 1 (native driver). Otherwise both start at 1 and nothing runs.
    - When `goalStatus` first leaves `'loading'` (once): build one `Animated.parallel` of `Animated.sequence([Animated.delay(t), Animated.timing(...)])` per track:
      - `!view.celebrate` (still): `content` and `headline` 0 → 1 over `TIMELINE.still`; `earned`, `flip` set to 1 immediately.
      - celebrate + `gauge.mode === 'static'` or no gauge: `content` (150 linear), `headline` (`headlineOther`); `earned`, `flip` set to 1.
      - celebrate + animated: `content`; `earned` (only when `view.gauge.earned`; else set to 1); `flip`; `headline` (`headlineTarget` when `view.headlineMotion === 'target'`, else `headlineOther`); and when `view.confetti`: `confettiLayer` 0 → 1 at 700 with duration 0, `confettiTravel`, `confettiFade`.
      - The composite's completion callback sets `settled = true` (only if still mounted).
    - Cleanup stops both composites on unmount; no state update after unmount.
  - The screen derives styles: card `opacity: cardEnter`, `translateY: cardEnter → 24…0`; pill `opacity: pillEnter`, `translateY: pillEnter → −8…0`; headline `opacity: headline`, plus `translateY: headline → 8…0` only when `view.celebrate`.

- [ ] **Step 1: Write the failing tests** in `__tests__/celebrationTimeline.test.js` with `renderHook` from `@testing-library/react-native`, `jest.useFakeTimers()`, and `act(() => { jest.advanceTimersByTime(ms); })`. Build views with `deriveSessionCompleteView` (Task 3). Read values with `value.__getValue()`.

```js
test('3/3 today: flip holds until 650 and is done by 800; settles after 1300', () => {
  const view = viewFor(goal(3), 'full');
  const { result, rerender } = renderHook((props) => useCelebrationTimeline(props), { initialProps: { view, goalStatus: 'loading' } });
  rerender({ view, goalStatus: 'ready' });
  act(() => { jest.advanceTimersByTime(600); });
  expect(result.current.values.flip.__getValue()).toBe(0);
  act(() => { jest.advanceTimersByTime(250); }); // 850
  expect(result.current.values.flip.__getValue()).toBe(1);
  expect(result.current.settled).toBe(false);
  act(() => { jest.advanceTimersByTime(500); }); // 1350
  expect(result.current.settled).toBe(true);
  expect(result.current.values.confettiFade.__getValue()).toBe(1);
});

test('the earned sweep is part-way at 400ms (JS driver)', () => {
  // same setup; at 400ms 0 < earned < 1
});

test('still: one 150ms fade, no rise, settled at 150', () => {
  // viewFor(goal(3), 'still'); cardEnter and pillEnter are 1 at mount;
  // after ready + 160ms: content 1, headline 1, flip 1, earned 1, confettiLayer 0, settled true
});

test('a goal that fails still fades the headline in (headlineOther)', () => {
  // view from { goal: null, goalStatus: 'failed' }; after 99ms headline 0; after 420ms headline 1; settled true
});

test('unmounting at 400ms stops everything without warnings', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  // ready, advance 400, unmount(), advance 2000
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
```

(Fill the commented tests with real assertions. If a native-driven value does not advance under fake timers in this Jest setup, assert the boundary values only — before the delay and after delay + duration — never mid-track for native tracks.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/celebrationTimeline.test.js`
Expected: FAIL with "Cannot find module '../src/components/sessions/celebrationTimeline'".

- [ ] **Step 3: Implement** per the Interfaces block. Nothing loops; the sync spinner is not part of the timeline.

- [ ] **Step 4: Run tests to verify they pass**

Run: the Step 2 command. Expected: PASS, no act warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/celebrationTimeline.js __tests__/celebrationTimeline.test.js
git commit -m "feat(session-complete): one timeline hook for the celebration and the still version"
```

---

### Task 10: Rebuild `SessionCompleteScreen`; delete `SessionsTodayRing`

**Files:**
- Modify (rewrite): `src/screens/sessions/SessionCompleteScreen.js`
- Delete: `src/components/sessions/SessionsTodayRing.js`, `__tests__/SessionsTodayRing.test.js`
- Modify (only if missing): `src/components/forms/StickyActionFooter.js` (add `surface="onOverflow"` + `overflowing` + `style`), `src/components/common/BrandButton.js` (`React.forwardRef` to the `Pressable`)
- Test: `__tests__/SessionCompleteScreen.test.js` (rewrite)

**Interfaces:**
- Consumes: everything from Tasks 3, 5–9; `getSessionsTodayGoal({ handle, userId })` (`src/services/sessionsTodayGoal.js`, unchanged); `useAuth().user.id`; `useSignedInEA().handle`; `useMotion().motionLevel`; `FocusAwareStatusBar`; `BrandButton`; `StickyActionFooter`.
- Produces: the screen, with this contract:
  - **Data.** `goalStatus` starts `'loading'`. `getSessionsTodayGoal` → `'ready'` (`null` counts as failed in the view). A rejection is caught, logged with `console.error('Error loading today’s sessions on Session complete:', error)`, and becomes `'failed'`. Results are dropped if the screen unmounted or `!handle.isCurrent()`. `now` is captured once at mount (`useRef(new Date())`). `view = deriveSessionCompleteView({ goal, goalStatus, params: route.params ?? {}, now, motionLevel })`, and `useCelebrationTimeline({ view, goalStatus })`.
  - **Layout.** Root `View` flex 1, `colors.background`. `<FocusAwareStatusBar style="light" />`. A `ScrollView` (flex 1, `testID="session-complete-scroll"`, `showsVerticalScrollIndicator={false}`, `contentContainerStyle={{ paddingBottom: 24 }}`) containing: Home's `overscrollRed` view (absolute, `top: -1000`, height 1000, `colors.red600`); `SessionCompleteHero` (`width` from `useWindowDimensions`, `insetTop` from `useSafeAreaInsets`, `showHalo = view.card !== null`, `confetti` values only when `view.confetti`, `headlineHidden = goalStatus === 'loading'`); when `view.card`, the card `Animated.View` (`testID="session-complete-card"`, `accessibilityLabel="Today’s sessions"`, `colors.surface`, `borderRadius.xl` (22), `shadows.elevated`, `marginHorizontal` 24, `marginTop` −108, `paddingTop` 18, `paddingHorizontal` 20, `paddingBottom` 16, `alignItems: 'center'`) holding `CelebrationGauge`; then `SessionReceipt rows={view.receipt}`. Below the ScrollView, `StickyActionFooter surface="onOverflow" overflowing={contentHeight > viewportHeight}` (`onLayout` and `onContentSizeChange`), `style={{ paddingTop: 12, paddingHorizontal: 24 }}`, holding `SyncStatusLine` (`marginBottom` 14) and `BrandButton label="Done" variant="primary" size="lg"` (ref'd, live from mount). A fixed `colors.red600` strip of height `insets.top` (absolute, top 0, `pointerEvents="none"`) last, as Home does.
  - **Exit.** `exit()` runs once (an `exitingRef` guard): `navigation.popTo('MainTabs', { screen: 'Home' })`. Done calls it. A focus-scoped `BackHandler` `hardwareBackPress` listener (via `useFocusEffect`) calls it and returns `true`.
  - **Announcement.** Once, the first time `view.announcement` is non-null and the screen is mounted: iOS → `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(doneRef.current))`, then `AccessibilityInfo.announceForAccessibilityWithOptions(view.announcement, { queue: true })`; Android → `AccessibilityInfo.announceForAccessibility(view.announcement)`, then the focus call. No `accessibilityLiveRegion` anywhere on the screen.
  - **StickyActionFooter (if PR 3 lacks it):** `surface="onOverflow"` renders bare (transparent, no top border) unless `overflowing`, then `colors.surface` with a 1dp `colors.border` top edge; `style` merges last; `always` behaviour unchanged. Add a test to PR 3's footer test file for both `onOverflow` states.
  - **BrandButton (if it does not forward refs):** wrap in `React.forwardRef` passing the ref to its `Pressable`; no visual change; add a test that `ref.current` is set.

- [ ] **Step 1: Write the failing tests** — rewrite `__tests__/SessionCompleteScreen.test.js`. Mocks: `@expo/vector-icons`; `../src/context/AuthContext` (`user: { id: 'ea-1' }`); `../src/services/sessionsTodayGoal` (`mockGetSessionsTodayGoal`); `../src/context/SignedInEAContext` (`handle: { isCurrent: () => true }`); `../src/context/OfflineContext` (`isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0, refreshSyncStatus: jest.fn().mockResolvedValue({ waitingCount: 3 })`); `@react-navigation/native` (`useIsFocused: () => true`, `useFocusEffect: (cb) => require('react').useEffect(cb, [cb])`). Render inside `SafeAreaProvider` with `initialMetrics` (inset top 47, bottom 34, frame 390×844), `PaperProvider`, `MotionProvider value={{ motionLevel: 'still', reduceMotion: true, tier: 'static' }}` (unless a test pins `'full'`), and whatever provider PR 3's `StickyActionFooter` tests use for `useToastObstruction`. `navigation = { popTo: jest.fn() }`; `params = { childCount: 2, childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'], readingLevel: '3 Letter Blends', sessionDate: <today's key from toLocalDateString(new Date())> }`.

Tests (each a `test(...)` with these exact assertions):
1. `'pill and receipt'`: `getByText('Saved for 2 children')`; accessible labels include `'Children: Anelisa and Athenkosi'`, `'Letters: M, L, N, S'`, `'Reading level: 3 Letter Blends'`.
2. `'3/3 today reads "Daily target reached." once, as the headline'`: goal `{ target: 3, ceiling: 5, count: 3, state: 'met' }` → `await findByText('Daily target\nreached.')` with role `header`; `queryByText('Daily target reached.')` is null; `getByText('3 of 3 sessions today')`.
3. `'2/3 shows "Session captured." and the sub-line'`: `findByText('Session\ncaptured.')`, `getByText('One more pair reaches your target.')`.
4. `'back-dated: date on the pill, static gauge'`: `sessionDate: '2026-10-13'` with the system time faked to `2026-10-15T10:00:00+02:00` → `getByText('Saved for 2 children · Tue 13 Oct')`; with `motionLevel 'full'`, `queryByTestId('gauge-earned')` is null.
5. `'goal null and goal rejected both drop the card and the halo'`: for `mockResolvedValue(null)` and `mockRejectedValue(new Error('read failed'))` (spy `console.error`): after settle, no `session-complete-card`, no `session-complete-halo`, headline `'Session\ncaptured.'`, `console.error` called once for the rejection.
6. `'Done before the goal resolves pops to the Home tab exactly once on a double tap'`: goal promise never resolves; press "Done" twice → `popTo` called once with `('MainTabs', { screen: 'Home' })`.
7. `'Android back calls the same exit and is consumed'`: spy `BackHandler.addEventListener`, take the `hardwareBackPress` handler, call it → returns `true`, `popTo` once.
8. **Review Focus 5** `'Done then back still exits once'`: press Done, then call the back handler → `popTo` called once.
9. `'announces the summary once and focuses Done (iOS)'`: spy `AccessibilityInfo.announceForAccessibilityWithOptions` and `AccessibilityInfo.setAccessibilityFocus`; goal 3/3 → after settle, announce called once with `('Session captured. Saved for 2 children. 3 of 3 sessions today. Daily target reached.', { queue: true })`; focus called once; a re-render does not announce again.
10. **Review Focus 1** `'unmount before the goal resolves: no update, no announcement'`: hold the goal promise, press Done, `unmount()`, then resolve and also run a rejection variant; spy `console.error` → no React warnings ("unmounted component"/"not wrapped in act"), announce not called, no unhandled rejection.
11. `'never says synced from stale counters while its refresh is pending'`: offline mock with `waitingCount: 0` and a never-resolving `refreshSyncStatus` → `queryByText('All saved and synced')` is null.
12. `'the gauge carries the final label from the first frame (full motion)'`: `motionLevel 'full'`, goal 3/3 → right after the goal resolves, `getByLabelText('3 of 3 sessions today. Goal met.')`.
13. `'full motion: numeral 2 before 650ms, 3 after 800ms; confetti only for the exact target'`: fake timers, `motionLevel 'full'`, goal 3/3: after the goal resolves and 600ms, `gauge-numeral-to` has opacity 0 and `gauge-numeral-from` shows '2'; after 1400ms, no `gauge-numeral-from`, `getByText('3')`; `confetti-layer` exists at 750ms. Repeat with 2/3: `confetti-layer` never exists.
14. `'footer turns sticky only when the content overflows'`: fire `layout` on `session-complete-scroll` with height 500 and `contentSizeChange` (390, 400) → footer bare; then `contentSizeChange` (390, 900) → footer has `backgroundColor: colors.surface` and `borderTopColor: colors.border`.
15. `'light status bar and a red strip behind the inset'`: the `FocusAwareStatusBar` receives `style="light"`; a view with `height: 47` and `backgroundColor: colors.red600` exists.

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SessionCompleteScreen.test.js`
Expected: FAIL (old screen: no pill text "Saved for 2 children", `popTo` never called).

- [ ] **Step 3: Implement** the screen per the Interfaces block; add the `StickyActionFooter`/`BrandButton` changes only if missing. Delete `SessionsTodayRing.js` and its test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SessionCompleteScreen.test.js __tests__/StickyActionFooter.test.js __tests__/BrandButton.test.js`
(Use the footer/button test file names PR 1/PR 3 created.) Expected: PASS. Then `grep -rn "SessionsTodayRing" src __tests__` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src/screens/sessions/SessionCompleteScreen.js src/components/sessions/SessionsTodayRing.js __tests__/SessionsTodayRing.test.js __tests__/SessionCompleteScreen.test.js src/components/forms/StickyActionFooter.js src/components/common/BrandButton.js __tests__/StickyActionFooter.test.js __tests__/BrandButton.test.js
git commit -m "feat(session-complete): Bold Red Receipt screen with celebration, sync line and Done to Home"
```

(Stage only the footer/button files that actually changed.)

---

### Task 11: Route options and the real-navigator integration test

**Files:**
- Modify: `src/navigation/AppNavigator.js` (SessionComplete options; export `MainNavigator`)
- Test: `__tests__/sessionCompleteNavigation.test.js` (new; unit suite — it uses no SQLite)

**Interfaces:**
- Consumes: `SessionCompleteScreen` (Task 10).
- Produces: `export function MainNavigator()` (named export, unchanged body). The `SessionComplete` screen's options are exactly `{ headerShown: false, gestureEnabled: false }` (no title, no `headerLeft`; the navigator's `header` option is not rendered).

- [ ] **Step 1: Write the failing test** in `__tests__/sessionCompleteNavigation.test.js`. Mock every screen module `MainNavigator` imports to a stub (as `MainTabNavigator.test.js` does), except `SessionCompleteScreen`, which stays real with the Task 10 context mocks. Stub `SessionFormScreen` as a component whose "Submit" `Pressable` calls `navigation.replace('SessionComplete', { childCount: 1, childNames: ['Amahle'], letters: ['a'], readingLevel: 'Cannot blend', sessionDate: <today key> })`. Mock `useSessionLaunchGuard` as `MainTabNavigator.test.js` does. Real `NavigationContainer`, real native stack and tabs (a probe on 2026-10-19 confirmed both render under jest-expo and that `popTo` lands on `Home` with one `MainTabs`). `jest.setTimeout(30000)` for the first-run transform.

```js
test('Children tab → New session → replace → Done lands on Home with one MainTabs', async () => {
  const ref = createNavigationContainerRef();
  const screen = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PaperProvider>
        <MotionProvider value={{ motionLevel: 'still', reduceMotion: true, tier: 'static' }}>
          <NavigationContainer ref={ref}><MainNavigator /></NavigationContainer>
        </MotionProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
  await waitFor(() => expect(ref.isReady()).toBe(true));
  act(() => ref.navigate('MainTabs', { screen: 'Children' }));
  act(() => ref.navigate('SessionForm'));
  fireEvent.press(await screen.findByText('Submit'));
  await screen.findByText('Done');

  expect(ref.getRootState().routes.map((r) => r.name)).toEqual(['MainTabs', 'SessionComplete']);
  expect(ref.getCurrentOptions()).toEqual(expect.objectContaining({ headerShown: false, gestureEnabled: false }));

  fireEvent.press(screen.getByText('Done'));
  fireEvent.press(screen.getByText('Done')); // double tap is harmless

  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('Home'));
  expect(ref.getRootState().routes.map((r) => r.name)).toEqual(['MainTabs']); // a second back leaves the app
});

test('a plain navigate would have pushed a second MainTabs (guards the v7 gotcha)', async () => {
  // same tree; from SessionComplete call ref.navigate('MainTabs', { screen: 'Home' }) directly
  // and record whether routes are ['MainTabs', 'MainTabs'] or ['MainTabs']; assert the screen does
  // NOT use this path by checking the Done test above. If navigate does not push here, delete this
  // test and note it in the build log (it only documents the gotcha).
});
```

(Write the second test only if it reproduces the push; otherwise drop it and record the finding.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionCompleteNavigation.test.js`
Expected: FAIL with "MainNavigator is not exported" (then, once exported, on `getCurrentOptions` containing a title / `headerShown` not false, if PR 1 left a header).

- [ ] **Step 3: Implement.** Export `MainNavigator`; set the `SessionComplete` options to `{ headerShown: false, gestureEnabled: false }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionCompleteNavigation.test.js __tests__/AppNavigator.headers.test.js __tests__/MainTabNavigator.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.js __tests__/sessionCompleteNavigation.test.js
git commit -m "feat(navigation): Session complete has no header; real-navigator test for Done to Home"
```

---

### Task 12: Standing docs and the build log

**Files:**
- Modify: `documentation/design-system.md`
- Modify: `documentation/ROADMAP.md` (§5)
- Modify: `documentation/build-log.md` (Verification Register rows; Decision Register rows)
- Modify: `documentation/LEARNING.md` (one section)
- No change: `CONTEXT.md` (no term changes; line 262's "session completion screen" is still true), `PRD.md` (no completion-screen description), `documentation/rls-sync-contract-map.md` (no sync change).

- [ ] **Step 1: `design-system.md`.** Add a "## Session complete" section with: the motion contract as this screen uses it (`CELEBRATION_LEVELS = ['full', 'calm']`, the `TIMELINE` table from Task 9, the still version: one 150ms opacity fade, no sweep, flip, confetti or rise; the sync glyph stops only under OS Reduce Motion); the gauge sizes table (`home` 176/16/79.5/97, `celebration` 232/22/104.5/128, same formulas, `buildEarnedArc`); the receipt row anatomy (min 52, `textSectionLabel` label, `textRowTitle` value, first-line label on wrap, `LetterReceiptTile` 36/9/`red50`/`red100`/`red700`, lowercase tiles with capital accessibility labels); the sync line states table (Task 6) including "Saved on this phone"; the halo formula (`r = W/2 + 19`, centre 26 below the field edge, gap `max(112, round(W/2 − 83))`); the roles used (`display3XL`, `displayNumeralXL`, `displayHeading`, `textPill`, `textSectionLabel`, `textRowTitle`, `textSmall`, `textNote`, `textButtonL`). In "## Open work", update the gauge bullet's path to `src/components/sessions/SegmentedSessionGauge.js` and remove the `SessionsTodayGauge` mention (deleted in PR 1).

- [ ] **Step 2: `ROADMAP.md` §5.** Delete "- [ ] Session completion should return to the Home payoff state instead of a bare `goBack()`." If "- [ ] Add a `deviceTier`/reduced-motion contract before celebratory animation work." is still present, delete it too (PR 1 shipped the contract; this PR is its first celebratory consumer). In the "Bold Red for the rest of the app" item, drop "Session complete" from the remaining list.

- [ ] **Step 3: `build-log.md`.** Append one Verification Register row for this PR (what shipped, Tasks 1–11; the focused RED → GREEN per task; full-suite counts from Task 13; device results from Task 14 once run; the adversarial review rounds and dispositions; anything surprising, e.g. whether the plain-`navigate` probe reproduced the second `MainTabs`). Append Decision Register rows for the decisions in this plan: the fallback sync line is terminal for the screen's life; the skeleton's second bar at 13 (218dp, equal to the with-sub card); the sync glyph in an inline 26×18 `View` (nested `Text` ignores margins); the receipt's capital accessibility letters (overview S8 over part 4); the fallback pill's spoken form without a full stop; `getGoalCopy(goal, true)` in the announcement. Rows go at the end of each register, after PR 3's rows (merge-order gotcha: resolve conflicts by keeping both sides in commit order).

- [ ] **Step 4: `LEARNING.md`.** Add "## A resolved promise is not a fresh snapshot (Session complete, October 2026)": why `refreshSyncStatus` resolving is not proof (it resolves `null` and keeps old counters on a read failure or stale handle), why the line waits for a non-null current-handle snapshot, and the React Navigation 7 lesson that `navigate` to an existing route pushes unless `pop: true`, so the exit uses `popTo`. Teaching tone, short.

- [ ] **Step 5: Commit**

```bash
git add documentation/design-system.md documentation/ROADMAP.md documentation/build-log.md documentation/LEARNING.md
git commit -m "docs(session-complete): design system, roadmap, build log and learning notes"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full unit suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest`
Expected: all suites pass; suite/test counts recorded. The two known teardown warnings ("worker process has failed to exit gracefully") are pre-existing.

- [ ] **Step 2: Full integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: all suites pass, including `LiteracySessionForm.submit.test.js`.

- [ ] **Step 3: Guards and greps**

```bash
grep -rn "#[0-9A-Fa-f]\{3,8\}\b\|rgba(" src/components/sessions src/screens/sessions/SessionCompleteScreen.js src/utils/sessionCompleteView.js src/utils/haloGeometry.js
grep -rn "fontWeight" src/components/sessions src/screens/sessions/SessionCompleteScreen.js
grep -rn "SessionsTodayRing\|components/home/sessionGaugeGeometry\|components/home/SegmentedSessionGauge\|react-native-reanimated" src __tests__ package.json
grep -rn "accessibilityLiveRegion" src/components/sessions src/screens/sessions/SessionCompleteScreen.js
git diff --check feat/bold-red-record...HEAD
git diff --stat feat/bold-red-record...HEAD -- supabase src/db src/services/literacySessionPersistence.js documentation/rls-sync-contract-map.md package.json package-lock.json
```

Expected: every grep empty; `git diff --check` clean; the last command shows **no** changes (no schema, persistence, contract-map or dependency change). PR 1's guard tests (raw hex, `fontWeight`, `colors.test.js`, `contrast.test.js`, `typography.test.js`, `paperTheme.test.js`) pass in Step 1.

- [ ] **Step 4: Record** the counts and grep results in the Task 12 build-log row (amend that row in a follow-up commit: `git add documentation/build-log.md && git commit -m "docs(build-log): PR 4 verification counts"`).

- [ ] **Step 5: Branch review.** Run `/codex:adversarial-review --base feat/bold-red-record` on the branch. Fix accepted findings test-first, one commit each, and log every disposition in the build log.

---

### Task 14: Device gate on the EAS preview build (manual — Jim)

**This is a manual gate for Jim.** Build an EAS preview of `feat/bold-red-complete` (cloud build; plain profiles target `masi-app-sqlite`). Use an iPhone and the Galaxy A03s. Record every row, with screenshots or screen recordings, in the build log. Board comparisons are pixel by pixel against `red-complete-final` and the `-s-*` boards.

- [ ] **1. 3/3 today, full motion (iPhone).** Screen-record at 60fps and frame-step against the storyboard: card/pill entry from mount, sweep 250–550, flip 650–800, confetti 700–1300, headline 800–1100, nothing moving after 1.3s, Done tappable mid-animation.
- [ ] **2. 3/3 today on the A03s (Jim's celebration check, §6 Q2).** The A03s is `calm`, so it plays the celebration. 60fps screen record: no dropped frames in the sweep or the confetti. If it drops frames, report it: the fix is changing `CELEBRATION_LEVELS` to `['full']` (one constant).
- [ ] **3. States vs boards:** 2/3, 1/3, 4/3, 6 (above the ceiling, "/3" fades out), back-dated (pick yesterday on the form while today is already 3/3: date on the pill, static gauge), no-target programme (test EA on 1000 Stories on `masi-app-sqlite`; disposable staging data; " today" after the numeral), offline (A03s: `cmd wifi set-wifi-enabled disabled` + watchdog; airplane mode re-enables Wi-Fi), and overflow (5 children, 8 letters: body scrolls, footer turns white with its top edge).
- [ ] **4. Reduce Motion:** iOS Settings → Accessibility → Motion; Android "Remove animations". Still version: one 150ms fade, no confetti, the sync glyph does not rotate.
- [ ] **5. Small and large:** 360dp (`wm density 320`) at font scale 1.0 and 1.3, and 360×640 (`wm size 720x1280` at density 320): halo legs leave the sides above the field edge with no flat cut; confetti clears the headline and the card; receipt values wrap with the label on the first line; nothing truncates; Done stays pinned.
- [ ] **6. Screen readers:** VoiceOver and TalkBack hear the summary once and in full, focus lands on Done, each receipt row is one phrase ("Letters: M, L, N, S"), confetti and halo are silent.
- [ ] **7. Exit:** Done and Android back both land on the Home tab showing the new count, with no stale-count snap during the pop and no Home animation. Started from the Children tab, it still lands on Home. A second back press leaves the app (no duplicate Home).
- [ ] **8. Sync line live:** waiting → "Syncing…" (about 1s, the debounce) → "All saved and synced", cross-fading, with the footer height steady. Offline: the offline copy, never "synced".
- [ ] **9. Toast over the footer:** trigger a toast while on Session complete (for example clock-out from a notification path, or any toast the build can raise): it sits 8 above the footer and Dismiss works.
- [ ] **10. Home row (every PR):** Home is pixel-identical to PR 3's build (gauge, card, bottom padding); the status bar goes red/light on Complete and stays light on Home with no flash.
