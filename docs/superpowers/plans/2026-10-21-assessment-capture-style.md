# Assessment Capture Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo Codex builds each task through the Codex plugin (`--model gpt-6.1-sol --effort high`) and Claude reviews the diff and tests before the next task starts.

**Goal:** Give all 11 assessment Questions one clean, spaced, coloured look built from shared package primitives, with letter and word tests paged by whole card rows, Andika for test content, and a dev-only gallery for device checks.

**Architecture:** New presentation primitives live in `src/assessment-questions/ui/` and read only `theme/tokens.ts` and a small font theme in `theme/`. Every Question and shared screen is rebuilt on those primitives; a ratcheting guard test stops any file outside `ui/` and `theme/` from styling text, colour, borders or tappables itself. Paging is a pure function over card rows; nothing about marking, timing, scoring or saved results changes.

**Tech Stack:** React Native 0.8x / Expo SDK 54, TypeScript (package), JavaScript (host), `react-native-svg` 15.12.1 (already installed), `react-native-safe-area-context` 5.x (already installed), new `@expo-google-fonts/andika` 0.4.1, Jest (`jest-expo`) with React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-assessment-capture-style-design.md` (approved 2026-10-21). Mockups: `design/mockups-2026-10-assessment-capture/`. Read both before Task 1.

## Global Constraints

- Work only in the worktree `/Users/jimmckeown/Development/masi-app/.claude/worktrees/assessment-style`, branch `design/assessment-capture-style`. Base and diff against `origin/main`, never local `main` (stale).
- Node 20 for every jest and tsc run: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- npm only. The one new dependency is `@expo-google-fonts/andika@0.4.1`, installed with `--save-exact`. Published 2025-09-11; licence MIT + OFL-1.1.
- Import only the Regular face: `import { Andika_400Regular } from '@expo-google-fonts/andika/400Regular'` (647 KB). Never import the package root, which bundles four faces.
- The package (`src/assessment-questions/`) never imports `expo-*`, `@expo-google-fonts/*` or host code, and has no `context/` path segment (boundary test).
- Colour literals only in `src/assessment-questions/theme/tokens.ts` (rawHexGuard).
- Never set `fontWeight` or `fontStyle` with a custom `fontFamily`. Weight is chosen by family name. Only `theme/typography.ts` may set `fontWeight`, and only for the no-provider system-font fallback.
- Red means "incorrect". The only other red is the destructive End control (`tokens.color.primary`, `#C81F3E`). Selection, current item, primary buttons and page dots are ink `#221A1B`.
- Frozen, behaviour unchanged: `progress/stepByStep.ts`, `progress/clock.ts`, `progress/applyProgress.ts`, the stop rule and its copy, every Question's `Result` (byte-identical for the same taps), timing refs and phase transitions, the `Countdown` tick and its memo isolation.
- Copy is unchanged unless a task names the change. Pinned strings: `Start`, `I've finished reading`, `Correct`, `Incorrect`, `Back`, `Skip question`, `End test` (step-by-step), `End` (Q6, Q8), `End the test?`, `Cancel`, `Finish`, `Yes, finish`, `` `${n} items unmarked — finish anyway?` ``, `` `${n} dimensions unscored — finish anyway?` ``, `Save result`, `Undo last mark`, the stop title, `Last item attempted`, `Tap the last item the child attempted.`, `Reached the end`, `Nothing attempted`, `Confirm`, `Why are you skipping this question?`, the skip reasons, `Re-read story`, `Close`, `View full rubric`, `Rubric descriptions coming soon`, `` `Total: ${n} / ${max}` ``.
- Accessibility labels are unchanged: step-by-step tiles `"<prompt>, current|correct|incorrect|not reached"`; toggle tiles `"<text>, idle|correct"`; Q9 `"<word> letter N <l>, idle|correct"`; Q5 `"<alt> → <letter>, idle|correct"`; last-attempted cells `"<label>, item N"`; chips `"<label> score N[, selected]"`.
- Icons render in their own `Svg` beside the label `Text`, never inside it, so `getByText('Correct')` keeps matching.
- Tiles and React keys use **position**, never `item_key` alone (Q6 EN and Q8 passages repeat keys).
- Bottom sheets and overlays, never native alert dialogs.
- Commits: conventional prefix, scope `assessment` (or `host`/`docs`), **no co-author trailer** (spec §10).
- Run the Codex adversarial review (`--model gpt-6-astra`) after each task's diff; engage each finding before moving on.

## Review Focus

1. **A stop or the end of the card on the last tile of a page.** The cursor has already moved past that tile, so the page must stay put under the stop card and on completion. Test owned by Task 7.
2. **The Q6 timer running out on page 3.** The last-attempted sheet opens, there is no Cancel, and if Cancel is offered after an End it returns to the same page with its marks. Test owned by Task 9.
3. **Words that repeat on one page** (`there how there how` in Q6 EN, passage words in Q8). Each tile toggles on its own, and React keys never collide. Test owned by Tasks 5 and 9.
4. **Fonts that fail to load.** The host must not pass family names it never registered, or Android silently uses Roboto and iOS logs warnings. With `fontError`, the package gets no families and uses its system-font fallback. Test owned by Task 1.
5. **Large OS text and long isiXhosa words** (`ibhulukhwe` at 1.2×). Item text caps scaling and shrinks to fit, and page capacity never changes. A prop-level test is owned by Task 5; the real render is checked at the Task 17 device gate.

---

### Task 1: Worktree install, Andika, and the package font theme

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@expo-google-fonts/andika` 0.4.1, exact)
- Modify: `App.js:33-35,135-141` (load Andika Regular; mount the package font theme around `AppRoot`)
- Modify: `src/constants/typography.js:4-11` (add `content: 'Andika_400Regular'`)
- Create: `src/constants/assessmentFonts.js` (host → package font map)
- Create: `src/assessment-questions/theme/AssessmentTheme.tsx`
- Create: `src/assessment-questions/theme/typography.ts`
- Modify: `src/assessment-questions/theme/tokens.ts`
- Modify: `src/assessment-questions/boundary/findForbiddenImports.ts` (forbid `^@expo-google-fonts\/`)
- Test: `src/assessment-questions/theme/__tests__/typography.test.tsx`, `src/assessment-questions/__tests__/boundary.test.ts`, `__tests__/typography.test.js`, `__tests__/App.plan5.test.js`, new `__tests__/assessmentTokensParity.test.js`

**Interfaces:**
- Produces:
  - `export interface AssessmentFonts { content?: string; text?: string; textSemi?: string; textBold?: string }`
  - `export function AssessmentThemeProvider(props: { fonts: AssessmentFonts; children: React.ReactNode }): React.JSX.Element`
  - `export function useAssessmentFonts(): AssessmentFonts`, which returns `{}` with no provider.
  - `export type TextRole = 'content' | 'body' | 'caption' | 'label' | 'heading' | 'timer'`
  - `export function textStyle(role: TextRole, fonts: AssessmentFonts): TextStyle`. It returns family and size together. Size comes from `tokens.font`; `content` has no size, and the caller sets it.
  - Tokens: `color.warning '#B26A00'`; `color.primary '#C81F3E'`; `primaryPressed` removed and every use moved to `primary`; `radius.tile 10`; `font` gains `tileLetter 30`, `tileWord 21`, `promptCard 28`, `label 17`, `story 18`.
  - Host: `export const assessmentFonts = { content: fontFamilies.content, text: fontFamilies.textMedium, textSemi: fontFamilies.textSemi, textBold: fontFamilies.textBold }` in `src/constants/assessmentFonts.js`.
  - Package `index.ts` exports `AssessmentThemeProvider` and `type AssessmentFonts`.

- [ ] **Step 1: Install dependencies in the worktree.** Run `cd <worktree> && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm ci`, then `npm install --save-exact @expo-google-fonts/andika@0.4.1`. Expected: `node_modules/@expo-google-fonts/andika/400Regular/index.js` exports `Andika_400Regular`, and `git diff package.json` shows exactly one added line. From now on, tests resolve the worktree's own `node_modules`.

- [ ] **Step 2: Baseline.** Run `npx jest src/assessment-questions` and `npm run test:types`. Expected: 43 suites / 477 tests pass, and tsc exits 0. Record both in the task's commit body.

- [ ] **Step 3: Write the failing tests.**

```tsx
// theme/__tests__/typography.test.tsx
const FULL = { content: 'Andika_400Regular', text: 'Figtree_500Medium', textSemi: 'Figtree_600SemiBold', textBold: 'Figtree_700Bold' };
test.each(['content','body','caption','label','heading','timer'] as const)('%s uses a family and never a weight when fonts are provided', (role) => {
  const s = textStyle(role, FULL);
  expect(typeof s.fontFamily).toBe('string');
  expect(s.fontWeight).toBeUndefined();
  expect(s.fontStyle).toBeUndefined();
});
test('content maps to the content family', () => expect(textStyle('content', FULL).fontFamily).toBe('Andika_400Regular'));
test('timer uses tabular figures', () => expect(textStyle('timer', FULL).fontVariant).toEqual(['tabular-nums']));
test('without fonts every role falls back to the system face', () => {
  for (const role of ['content','body','caption','label','heading','timer'] as const) expect(textStyle(role, {}).fontFamily).toBeUndefined();
  expect(textStyle('heading', {}).fontWeight).toBe('700');
});
test('useAssessmentFonts is empty without a provider and returns the provider value inside one', () => { /* renderHook both ways */ });
```

Also add these tests:
- `boundary.test.ts`: `findForbiddenImports("import { X } from '@expo-google-fonts/andika/400Regular'")` returns that specifier.
- `__tests__/assessmentTokensParity.test.js`: the package colours equal the host colours they copy. The pairs are ink↔`colors.text`, muted↔`textSecondary`, line↔`border`, canvas↔`background`, surface↔`surface`, primary↔`primary`, error↔`error`, errorSoft↔`errorBg`, warning↔`warning`, markedSoft↔`successBg` and notReached↔`disabled`. Also assert `tokens.color.marked === '#2E7D27'`; it is package-only, as the AA green.
- `__tests__/App.plan5.test.js`: when `useFonts` returns `[false, new Error('x')]` and then settles, the `AssessmentThemeProvider` receives `fonts={{}}`. When it returns `[true, null]`, the provider receives `assessmentFonts`. Mock the package provider to capture its props.

- [ ] **Step 4: Run the tests and see them fail.** Run `npx jest src/assessment-questions/theme src/assessment-questions/__tests__/boundary.test.ts __tests__/assessmentTokensParity.test.js __tests__/App.plan5.test.js __tests__/typography.test.js`. Expected: FAIL. The modules are missing, `primary` is `#E72D4D`, and the boundary does not catch the font import.

- [ ] **Step 5: Implement.**
  - **`tokens.ts`:** make the values above; rewrite the header to say the values copy the host palette and are checked by `assessmentTokensParity.test.js`; replace every `primaryPressed` use with `primary`.
  - **`AssessmentTheme.tsx`:** a plain React context. The file name avoids a `context/` segment.
  - **`typography.ts`:**
    - role → family: `content`→content; `body`/`caption`→text; `label`→textSemi; `heading`/`timer`→textBold.
    - sizes and line heights: body 16/24, caption 13/18, label 17/22, heading 20/26, timer 20.
    - no-provider weights: content 400, body 400, caption 400, label 600, heading 700, timer 700.
  - **`App.js`:** add `Andika_400Regular` to `useFonts`, and wrap `AppRoot` in `<AssessmentThemeProvider fonts={fontsLoaded && !fontError ? assessmentFonts : {}}>`.
  - **`typography.js`:** add `fontFamilies.content`. `__tests__/typography.test.js` then requires it to be in `useFonts`, and it is.

- [ ] **Step 6: Run the tests and see them pass.** Run the same command plus `npx jest src/assessment-questions` and `npm run test:types`. Expected: all PASS.

- [ ] **Step 7: Commit.** `git commit -m "feat(assessment): Andika content face, package font theme, token housekeeping"`

---

### Task 2: Font and style guards (ratcheted)

**Files:**
- Create: `src/assessment-questions/__tests__/styleGuard.test.ts`
- Modify: `documentation/design-system.md` (the guard rules list at `:842-864`: add the two package guards)

**Interfaces:**
- Produces two exported-for-test rule functions and two ratchet sets inside the test file:
  - `fontViolations(code: string): string[]`. It matches the style keys `fontWeight`, `fontFamily` and `fontStyle`. It applies to every package `.ts/.tsx` file outside `__tests__/` and `theme/`.
  - `styleViolations(code: string): string[]`. It matches the style keys `fontSize`, `lineHeight`, `color`, `backgroundColor`, `borderColor`, `borderWidth` and `borderRadius` (regex `\b(fontSize|lineHeight|color|backgroundColor|borderColor|borderWidth|borderRadius)\s*:`). It also matches any import of `Text`, `Pressable`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback` or `Modal` from `'react-native'`. It applies to every package file outside `__tests__/`, `theme/` and `ui/`.
  - `FONT_RATCHET: ReadonlySet<string>` and `STYLE_RATCHET: ReadonlySet<string>` hold the package-relative paths that violate today. Later tasks delete entries. Task 14 asserts both sets are empty.

- [ ] **Step 1: Write the tests.**

```ts
test('fontViolations finds weight, family and style keys', () => {
  expect(fontViolations("const s = { fontWeight: '600' }")).toEqual(['fontWeight']);
  expect(fontViolations("x = tokens.font.body")).toEqual([]);
});
test('styleViolations finds raw text/colour/border keys and forbidden RN imports', () => {
  expect(styleViolations("import { View, Text } from 'react-native'")).toEqual(['import Text']);
  expect(styleViolations("{ backgroundColor: tokens.color.surface }")).toEqual(['backgroundColor']);
  expect(styleViolations("tokens.color.ink")).toEqual([]);
  expect(styleViolations("{ gap: tokens.space.sm, flexDirection: 'row' }")).toEqual([]);
});
test('no file outside the font ratchet sets a font weight, family or style', ...);   // lists offenders as relpath:key
test('no file outside the style ratchet styles text, colour, borders or tappables itself', ...);
test('every ratchet entry still violates (the ratchet only shrinks)', ...);
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx jest src/assessment-questions/__tests__/styleGuard.test.ts`. Expected: the two scan tests FAIL and list today's offenders.

- [ ] **Step 3: Fill both ratchet sets** with exactly the offenders the failing run printed. Expect the Countdown, StopCard, LastAttemptedSheet, MissingItemSet, SequentialCapture, SkipReasonPicker and all 11 `questions/*/index.tsx`. Then add the design-system.md guard bullets.

- [ ] **Step 4: Run the test again.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "test(assessment): ratcheted font and style guards for the Question package"`

---

### Task 3: Core primitives — text, icons, buttons, bars, sheets, intro, action bar

**Files:**
- Create in `src/assessment-questions/ui/`: `Text.tsx`, `Icon.tsx`, `Button.tsx`, `BottomBar.tsx`, `ConfirmSheet.tsx`, `FullScreenSheet.tsx`, `QuestionIntro.tsx`, `ActionBar.tsx`, `index.ts`
- Test: `src/assessment-questions/ui/__tests__/{Text,Button,BottomBar,ConfirmSheet,FullScreenSheet,QuestionIntro,ActionBar}.test.tsx`

**Interfaces:**
- Consumes `textStyle`, `useAssessmentFonts` and `tokens` (Task 1).
- Produces, all exported from `ui/index.ts`:
  - **`UiText`** — `UiText(props: TextProps & { role?: Exclude<TextRole,'content'>; tone?: Tone; align?: 'left'|'center' })`.
    - `Tone = 'ink'|'muted'|'onInk'|'danger'|'marked'|'warning'|'notReached'`.
    - `role` defaults to `'body'`, `tone` to `'ink'`.
  - **`ContentText`** — `ContentText(props: TextProps & { size: 'tileLetter'|'tileWord'|'promptCard'|'markingWord'|'story'; tone?: Tone; fit?: boolean })`.
    - With `fit`, it sets `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.6}` and `maxFontSizeMultiplier={1.2}`.
    - It always sets `maxFontSizeMultiplier={1.2}`.
  - **`Icon`** — `export type IconName = 'check'|'cross'|'back'|'chevronLeft'|'chevronRight'`; `Icon(props: { name: IconName; size?: number; tone?: Tone })`. Inline `react-native-svg` paths with `accessible={false}`.
  - **`PrimaryButton`** — `PrimaryButton(props: { label: string; onPress: () => void; icon?: IconName; tone?: 'ink'|'marked'|'error'; disabled?: boolean; testID?: string; accessibilityLabel?: string; flex?: boolean })`.
    - Pill shape, `minHeight 52`, fill by `tone` (default `ink`) and `onInk` label.
    - `accessibilityRole="button"`, `accessibilityState={{disabled}}`.
  - **`SecondaryButton`** — same props without `tone`. Outlined: 1.5 px ink border, ink label, surface fill.
  - **`TextLink`** — `TextLink(props: { label: string; onPress: () => void; tone?: 'ink'|'danger'; testID?: string; disabled?: boolean })`. `accessibilityRole="button"`, `minHeight 44`, label in `UiText role="label"`.
  - **`IconButton`** — `IconButton(props: { icon: IconName; accessibilityLabel: string; onPress: () => void; disabled?: boolean; testID?: string })`. 44×44, circular, line border.
  - **`useBottomInset(): number`** — reads `SafeAreaInsetsContext` (`null` → bottom 0). Returns `Platform.OS === 'android' ? Math.max(b + 11, 16) : Math.max(b, 16)`.
  - **`BottomBar`** — `BottomBar(props: { children; testID?: string })`. White panel with a 1 px `line` top border, `paddingTop 11`, `paddingHorizontal 16`, `paddingBottom useBottomInset()`, `gap 10`.
  - **`ConfirmSheet`** — `ConfirmSheet(props: { testID: string; title: string; confirmLabel: string; onConfirm: () => void; cancelLabel?: string; onCancel?: () => void; confirmTone?: 'ink'|'danger'; children?: React.ReactNode })`.
    - The root is the absolute-fill overlay `{justifyContent:'flex-end', backgroundColor: tokens.color.scrim}` with `accessibilityViewIsModal`, and the `testID` sits on that root.
    - The panel has radius `card` on the top corners, padding `xl`, and the bottom inset.
    - The title is `UiText role="heading" accessibilityRole="header"`.
    - Panel order: title, confirm `PrimaryButton`, cancel `SecondaryButton` (only when `cancelLabel`), then `children` (for example the stop card's `Undo last mark` link).
  - **`FullScreenSheet`** — `FullScreenSheet(props: { visible: boolean; title?: string; onClose: () => void; children })`. Wraps RN `Modal` (`animationType="slide"`), so it renders nothing when hidden. Closes with a `SecondaryButton` labelled `Close` in a `BottomBar`.
  - **`QuestionIntro`** — `QuestionIntro(props: { testID?: string; instructions?: string; startLabel?: string; onStart: () => void; children?: React.ReactNode })`. `startLabel` defaults to `'Start'`; `children` holds extra intro content such as the story.
    - Layout: `canvas` background; a white instruction card (radius `card`, padding `lg`, `UiText` body); then children in a `ScrollView`; then a `BottomBar` with a full-width `PrimaryButton`.
  - **`ActionBar`** comes in two layouts:
    - **Decision:** `DecisionBar(props: { testIDPrefix: string; onCorrect; onIncorrect; onBack; backDisabled: boolean; onEnd; endLabel?: string; onSkip?: () => void })`.
      - `View testID={`${p}-decisions`}` holds `PrimaryButton tone="marked" icon="check" label="Correct" flex` and `PrimaryButton tone="error" icon="cross" label="Incorrect" flex` side by side, with gap 12.
      - Then a full-width `SecondaryButton icon="back" label="Back"`.
      - Then `View testID={`${p}-navigation`}`, centred, holding `TextLink label="Skip question"` (ink, only when `onSkip`) and `TextLink tone="danger" label={endLabel ?? 'End test'} testID={`${p}-end`}`.
    - **Toggle:** `ToggleBar(props: { primary: { label: string; onPress: () => void }; onSkip?: () => void })`. A full-width `PrimaryButton` (ink), then a centred `TextLink label="Skip question"` when `onSkip`.

- [ ] **Step 1: Write the failing tests.** These are the key assertions; each test file follows the same pattern.

```tsx
// Button.test.tsx
test('PrimaryButton is a pill button with its label as separate text and its icon beside it', () => {
  const { getByRole, getByText } = render(<PrimaryButton label="Correct" icon="check" tone="marked" onPress={jest.fn()} />);
  const btn = getByRole('button', { name: 'Correct' });
  expect(btn).toHaveStyle({ minHeight: 52, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.marked });
  expect(getByText('Correct')).toBeTruthy();
});
test('disabled buttons report disabled and do not fire', ...);
// BottomBar.test.tsx
test.each([['ios',0,16],['ios',34,34],['android',0,16],['android',48,59]])('%s inset %s pads %s', (os, inset, pad) => { /* jest.replaceProperty(Platform,'OS',os); wrap in SafeAreaInsetsContext.Provider value={{top:0,left:0,right:0,bottom:inset}} */ });
test('no safe-area provider pads 16', ...);
// ConfirmSheet.test.tsx
test('the testID is on the scrim overlay and the title is a header', () => { expect(getByTestId('end-confirmation')).toHaveStyle({ justifyContent: 'flex-end', backgroundColor: tokens.color.scrim }); expect(getByRole('header', { name: 'End the test?' })).toBeTruthy(); });
// FullScreenSheet.test.tsx
test('hidden sheet renders nothing; visible sheet shows a single Close', ...);
// ActionBar.test.tsx
test('decision layout: Correct/Incorrect side by side, Back full width below, End centred last', () => {
  // letter-decisions has flexDirection row; Back is not inside letter-decisions; letter-navigation has justifyContent center; 'End test' is in letter-navigation
});
test('Skip question appears only when onSkip is given', ...);
// Text.test.tsx
test('ContentText uses the content family, never a weight, and caps OS scaling at 1.2', ...);
test('ContentText fit shrinks to one line', () => { /* numberOfLines 1, adjustsFontSizeToFit true, minimumFontScale 0.6 */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx jest src/assessment-questions/ui`. Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement the primitives** to the signatures above. Use only `tokens`, `textStyle` and `useAssessmentFonts`. Every tappable is a `Pressable` with a pressed opacity of 0.85.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx jest src/assessment-questions/ui src/assessment-questions/__tests__/styleGuard.test.ts`, then `npm run test:types`. Expected: PASS. `ui/` is exempt from the style guard but not from the font guard, and it passes because it uses `textStyle`.

- [ ] **Step 5: Commit** with `git commit -m "feat(assessment): shared capture primitives — text, buttons, bars, sheets, intro, action bars"`.

---

### Task 4: `paginate` and the page indicator

**Files:**
- Create: `src/assessment-questions/ui/paginate.ts`
- Create: `src/assessment-questions/ui/PageIndicator.tsx`
- Test: `src/assessment-questions/ui/__tests__/paginate.test.ts`, `ui/__tests__/PageIndicator.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface PageLayout { columns: number; capacity: number; breakAtCardRow: boolean }
export const LETTER_PAGE_LAYOUT: PageLayout = { columns: 5, capacity: 20, breakAtCardRow: true };
export const WORD_PAGE_LAYOUT: PageLayout   = { columns: 2, capacity: 10, breakAtCardRow: false };
export interface DisplayRow { positions: number[]; startsCardRow: boolean }   // startsCardRow drives the divider
export interface Page { index: number; firstCardRow: number; lastCardRow: number; positions: number[]; displayRows: DisplayRow[] } // card rows 0-based
export function paginate(rows: ReadonlyArray<ReadonlyArray<number>>, layout: PageLayout): Page[];
export function pageIndexOf(pages: ReadonlyArray<Page>, position: number): number;          // -1 if absent
export function pageLabel(page: Page, pageCount: number): string;                           // "Card rows 1–2 · page 1 of 3" / "Card row 3 · page 3 of 5"
export function rowsFromLengths(lengths: ReadonlyArray<number>): number[][];               // [3,2] → [[0,1,2],[3,4]]
export function PageIndicator(props: { pages: ReadonlyArray<Page>; current: number; onPrevious?: () => void; onNext?: () => void }): React.JSX.Element | null;
```

**The `paginate` algorithm.** Use greedy packing of whole card rows.

- Start a new page when adding the next card row would push it past `capacity`.
- A card row longer than `capacity` first flushes the open page. Then it is split, in order, into chunks of `capacity`. Each chunk is its own page, and `firstCardRow === lastCardRow` on each of those pages.
- **Display rows with `breakAtCardRow`:** split each card row's positions on the page into chunks of `columns`. Mark the first chunk of each card row with `startsCardRow: true`, except the first chunk on the page.
- **Display rows without `breakAtCardRow`:** split the page's positions into continuous chunks of `columns`, all with `startsCardRow: false`.
- An empty `rows` gives `[]`. Empty card rows are skipped.

**`PageIndicator` rendering:**

- It returns `null` when `pages.length <= 1`.
- Otherwise it renders:
  - the label (`UiText role="caption" tone="muted"`, with the card-row part in `ink`);
  - one 8 dp dot per page (`ink` when current, otherwise the `line` colour);
  - when given, `IconButton`s for previous and next, labelled `Previous page` and `Next page`, and disabled at either end.

- [ ] **Step 1: Write the failing tests.** They use every shipped shape (spec §8):

```ts
const lengths = (r: number[][]) => r.map((x) => x.length);
test('Grid A 6×10 → 3 pages of 2 card rows, 4 display rows of 5, divider before card row 2', () => {
  const pages = paginate(rowsFromLengths([10,10,10,10,10,10]), LETTER_PAGE_LAYOUT);
  expect(pages.map((p) => [p.firstCardRow, p.lastCardRow])).toEqual([[0,1],[2,3],[4,5]]);
  expect(pages[0].displayRows.map((d) => [d.positions.length, d.startsCardRow])).toEqual([[5,false],[5,false],[5,true],[5,false]]);
});
test('2026.1 letters 5×12 → 5 pages, one card row each, display rows 5,5,2', ...);
test('isiZulu 11×10 → 6 pages', ...);
test('fixture letters 12,12,1 → 2 pages: [row 1], [rows 2–3]', ...);
test('word_reading 10×5 → 5 pages of 2 card rows, continuous display rows of 2', () => { /* page 0 displayRows lengths [2,2,2,2,2], positions 0..9, all startsCardRow false */ });
test('wela_plus_read_words 7,7,7,7,7,5 → 6 pages of one card row', ...);
test('one 30-item card row → 3 pages each labelled Card row 1', () => {
  const pages = paginate([Array.from({ length: 30 }, (_, i) => i)], WORD_PAGE_LAYOUT);
  expect(pages.map((p) => pageLabel(p, pages.length))).toEqual(['Card row 1 · page 1 of 3','Card row 1 · page 2 of 3','Card row 1 · page 3 of 3']);
});
test('labels use an en dash and 1-based rows', () => expect(pageLabel(paginate(rowsFromLengths([10,10,10,10,10,10]), LETTER_PAGE_LAYOUT)[0], 3)).toBe('Card rows 1–2 · page 1 of 3'));
test('every position appears exactly once and in reading order', ...); // property over all shapes above
test('pageIndexOf finds the page for a position and -1 otherwise', ...);
test('Afrikaans shapes (Grid A, 10×5) page the same as their en/xh twins', ...); // reuse the shapes; af sets are not on main
// PageIndicator.test.tsx
test('hidden for a single page; shows label, N dots and disabled Previous on page 1', ...);
```

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/ui/__tests__/paginate.test.ts src/assessment-questions/ui/__tests__/PageIndicator.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `paginate.ts` and `PageIndicator.tsx` as specified.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit.** Run `git commit -m "feat(assessment): paginate whole card rows into pages, with the page indicator"`.

---

### Task 5: `MarkTile`, `PagedGrid` and `TileGroups`

**Files:**
- Create: `src/assessment-questions/ui/MarkTile.tsx`
- Create: `src/assessment-questions/ui/PagedGrid.tsx`
- Create: `src/assessment-questions/ui/TileGroups.tsx`
- Test: `ui/__tests__/MarkTile.test.tsx`, `ui/__tests__/PagedGrid.test.tsx`, `ui/__tests__/TileGroups.test.tsx`

**Interfaces:**
- Consumes `ContentText`, `UiText`, `Page`, `DisplayRow`, `tokens`.
- Produces:

```ts
export type TileState = 'idle' | 'current' | 'correct' | 'incorrect' | 'notReached';
export type TileVariant = 'letter' | 'word' | 'pill' | 'promptCard' | 'picture';
export function MarkTile(props: {
  variant: TileVariant; state: TileState; text: string;
  gloss?: string;                       // promptCard: second line (Figtree caption, muted; onInk when correct)
  caption?: string;                     // picture: the picture name above the letter
  accessibilityLabel: string;           // caller supplies the exact pinned label
  onPress?: () => void;                 // present → accessibilityRole="button"; absent → role "text"
  testID?: string; width?: number;      // PagedGrid passes the computed tile width
}): React.JSX.Element;
export function PagedGrid(props: {
  page: Page; testID?: string; groupTestID?: (cardRow: number) => string;   // letters: one group View per card row on the page
  renderTile: (position: number, width: number) => React.ReactNode;
  layout: PageLayout;
}): React.JSX.Element;
export function TileGroups<T>(props: {
  groups: ReadonlyArray<{ key: string; testID?: string; heading?: string; items: ReadonlyArray<T> }>;
  card?: boolean;                        // white rounded group card (sentences, CVC words)
  renderTile: (item: T) => React.ReactNode; testID?: string;
}): React.JSX.Element;                   // a vertical ScrollView; each group wraps tiles with gap 8
```

**Tile looks (spec §3.1).** Every tile has radius `tile` (10).
- `idle` and `notReached` tiles share the same look: `surface` fill with a 1 px `line` border. The only difference is the text colour: idle uses `ink`, notReached uses `notReached`.
- `current` is a `surface` tile with a 3 px `ink` border. Its `accessibilityState.selected` is true.
- `correct` is a solid `marked` fill and border with `onInk` text.
- `incorrect` is a solid `error` fill and border with `onInk` text.

**Sizes.**
- `letter`: height 60, `ContentText size="tileLetter" fit`.
- `word`: height 58, `tileWord fit`.
- `pill`: wrapped words, `markingWord`, min height 48, horizontal padding 14, radius `tile`.
- `promptCard`: full width, min height 72, `promptCard` text, padding `lg`.
- `picture`: min height 88, with the caption (Figtree caption, up to 2 lines) above the letter (`ContentText tileWord`).

**`PagedGrid` layout.**
- It measures its width with `onLayout`.
- Tile width is `(width - gap*(columns-1)) / columns`, with a gap of 10.
- It renders each `DisplayRow` as a row.
- Before a row with `startsCardRow` it draws a 1 px dashed `line` divider.
- It centres the whole block vertically in the space available, and never scrolls.
- With `groupTestID`, the display rows of each card row sit inside `View testID={groupTestID(cardRow)}`.

- [ ] **Step 1: Write the failing tests.**

```tsx
test.each([
  ['current', { borderWidth: 3, borderColor: tokens.color.ink, backgroundColor: tokens.color.surface }],
  ['correct', { backgroundColor: tokens.color.marked, borderColor: tokens.color.marked }],
  ['incorrect', { backgroundColor: tokens.color.error, borderColor: tokens.color.error }],
  ['idle', { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 }],
])('%s tile look', (state, style) => { expect(getByLabelText('a, x')).toHaveStyle({ ...style, borderRadius: tokens.radius.tile }); });
test('a tile with onPress is a button; without, it is text', ...);
test('word tiles shrink long words to fit instead of truncating', () => { /* ibhulukhwe: numberOfLines 1, adjustsFontSizeToFit, maxFontSizeMultiplier 1.2, no ellipsizeMode */ });
test('PagedGrid renders only the page positions, in display rows, with a divider before a new card row', ...);
test('PagedGrid with duplicate words renders distinct keyed tiles', () => { /* positions 0..3 = there how there how → 4 tiles, no React key warning (spy console.error) */ });
test('TileGroups renders a heading per group and wraps tiles', ...);
```

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/ui/__tests__/MarkTile.test.tsx src/assessment-questions/ui/__tests__/PagedGrid.test.tsx src/assessment-questions/ui/__tests__/TileGroups.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `MarkTile.tsx`, `PagedGrid.tsx` and `TileGroups.tsx` to the interfaces above.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): MarkTile, paged grid and grouped tile layouts"`

---

### Task 6: The timer bar (Countdown)

**Files:**
- Modify: `src/assessment-questions/progress/Countdown.tsx`
- Test: `src/assessment-questions/progress/__tests__/Countdown.test.tsx` (update on purpose), `progress/__tests__/SequentialCapture.renderCount.test.tsx` (text literal only: `'0:59'` → `'59s'`)
- Modify: `__tests__/styleGuard.test.ts` (drop `progress/Countdown.tsx` from both ratchets)

**Interfaces:**
- Produces `Countdown = React.memo(function Countdown(props: { getRemainingMs: () => number; durationMs: number }))`. This is the spec's `ProgressTimer`.
  - It renders a row: a rounded bar (height 12, radius 6, track `line`), then the label `` `${seconds}s` `` (`UiText role="timer"`, min width 44, right-aligned).
  - The fill width is `remaining/durationMs` as a percentage.
  - The fill and label are `marked` while more than 10 s remain, and `warning` at 10 s or less.
  - The accessibility label `` `Time left, ${seconds} seconds` `` is unchanged.
  - It keeps its own 250 ms interval.

- [ ] **Step 1: Update the tests first.**
  - `'1:00'` becomes `'60s'` and `'0:50'` becomes `'50s'`.
  - The urgent test becomes `'uses the warning colour at ten seconds or less'`. It expects the label colour `tokens.color.warning`, and expects the fill (`testID="countdown-fill"`) to have `backgroundColor: tokens.color.warning` and `width: '16.666…%'`, within 0.1 of 10/60.
  - Add a new test, `'is marked green above ten seconds'`.
  - In `renderCount.test`, change only `'0:59'` to `'59s'`. If SequentialCapture's props change in Task 7, update that test's props then.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/progress/__tests__/Countdown.test.tsx src/assessment-questions/progress/__tests__/SequentialCapture.renderCount.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement it.** Add the `durationMs` prop and pass `durationSec * 1000` at the one call site (`SequentialCapture.tsx:181`). Then remove `Countdown.tsx` from the ratchets.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command, then `npx jest src/assessment-questions`. Expected: PASS, apart from the LetterSounds and ReadWords presentation tests that still pin `'1:00'`. Update those `'m:ss'` literals now (text only), so that the full suite is green.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): timer bar with seconds label; amber for the last ten seconds"`

---

### Task 7: Step-by-step capture on the new look (letter test and word test)

**Files:**
- Modify: `src/assessment-questions/progress/SequentialCapture.tsx`
- Modify: `src/assessment-questions/progress/StopCard.tsx`
- Modify: `src/assessment-questions/questions/LetterSoundsQuestion/index.tsx:30-40` (pass `layout={LETTER_PAGE_LAYOUT}`)
- Modify: `src/assessment-questions/questions/ReadWordsQuestion/index.tsx:95-102` (pass `layout={WORD_PAGE_LAYOUT}`)
- Modify: `src/screens/assessments/StandaloneTestScreen.js:119` (drop `paddingBottom: insets.bottom`; the package bottom bars own it)
- Test: `questions/LetterSoundsQuestion/__tests__/LetterSoundsQuestion.test.tsx` and `questions/ReadWordsQuestion/__tests__/ReadWordsQuestion.stepByStep.test.tsx` (presentation tests rewritten on purpose); `renderCount.test` (add the `layout` prop); `__tests__/StandaloneTestScreen.test.js`
- Modify: `__tests__/styleGuard.test.ts` (drop SequentialCapture and StopCard)

**Interfaces:**
- Consumes `paginate`, `pageIndexOf`, `PageIndicator`, `PagedGrid`, `MarkTile`, `DecisionBar`, `QuestionIntro`, `ConfirmSheet`, `BottomBar`, `Countdown`.
- Produces: `SequentialCapture` gains the required prop `layout: PageLayout`. Everything else about its props stays the same.

**Behaviour to implement.** Only layout changes:

- **Page derivation.**
  - `pages = useMemo(() => paginate(rows, layout), [rows, layout])`.
  - `focus = state.stopped ? state.cursor - 1 : Math.min(state.cursor, cardItems.length - 1)`.
  - `pageIndex = pageIndexOf(pages, focus)`.
  - The page is never stored; it is always derived.
- **Remove:**
  - `scrollRef`, `rowOffsetsRef`, the `:146-150` effect and the per-row `onLayout`;
  - the `{cursor} / {total}` counter.
- **Active tree, top to bottom:**
  - `Countdown` (when timed), with horizontal padding 16 and top padding 12;
  - `PageIndicator` (no page controls);
  - `PagedGrid testID={`${prefix}-grid`}`. For letters it uses `groupTestID={(r) => `letter-row-${r}`}`.
  - `DecisionBar` inside `BottomBar`. Pass `onSkip` only when `allowSkip`.
- **Tile state:** `index === cursor` → `current`; `decisions[index] === true` → `correct`; `false` → `incorrect`; otherwise `idle`. The accessibility label is unchanged, and `not reached` is used for idle tiles.
- **Intro:** `QuestionIntro testID={`${prefix}-intro`}`.
- **End sheet:** `ConfirmSheet testID="end-confirmation" title="End the test?" confirmLabel="End test" confirmTone="danger" cancelLabel="Cancel"`.
- **`StopCard`:** renders `ConfirmSheet testID="stop-card"`. The title is unchanged, `confirmLabel="Save result"`, and `Undo last mark` is a `TextLink` passed as children.
- **Covered view:** keep the existing hidden-accessibility flags while the stop card or end sheet is up.

- [ ] **Step 1: Rewrite the presentation tests on purpose.** Replace `LetterSoundsQuestion.test.tsx` `:54`, `:67`, `:331`, `:358` and `:369`, and `ReadWordsQuestion.stepByStep.test.tsx` `:103` and `:138`, with the following:

```tsx
test('Grid A shows card rows 1–2 as page 1 of 3, twenty letter tiles in rows of five', () => {
  // start; expect getByText('Card rows 1–2 · page 1 of 3'); getAllByLabelText(/, (current|not reached)$/) length 20;
  // getAllByTestId(/^letter-row-/) length 2; 'l, current' toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink })
});
test('marking the twentieth letter moves to page 2; Back from its first letter returns to page 1 with letter 20 current and unmarked', ...);
test('earlier marks stay visible after Back', () => { /* Correct, Incorrect, Correct, Back → 'l, correct', 'a, incorrect', 'm, current' */ });
test('a stop on the last letter of a page leaves that page showing under the stop card', () => {
  // build a set whose 10th consecutive wrong is position 19 (page 1 last tile); after stop, includeHiddenElements: getByText('Card rows 1–2 · page 1 of 3')
});
test('a stop on the final letter of the card does not blank the grid', ...);   // cursor === total clamp
test('no progress counter; no row auto-scroll', () => { /* queryByText(/^\d+ \/ \d+$/) null; ScrollView.prototype.scrollTo never called */ });
test('decision layout: Correct/Incorrect side by side, full-width Back, End test centred below', ...);
test('Skip question shows beside End test only when allowSkip', ...);
// stepByStep words:
test('word_reading shows card rows 1–2 as page 1 of 5 in two continuous columns', ...);
test('long isiXhosa words shrink to fit their tile', ...);   // xh set, 'ibhulukhwe' tile Text adjustsFontSizeToFit
test('word 20 is current on page 2 after nineteen decisions', ...); // replaces the :70 label check page expectation
```

Keep the behavioural tests listed in the recon (`:40`…`:403`) unchanged. They must pass untouched. In `StandaloneTestScreen.test.js`, add `'the container leaves the bottom inset to the Question'`: the screen root has no `paddingBottom`.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/questions/LetterSoundsQuestion src/assessment-questions/questions/ReadWordsQuestion src/assessment-questions/progress __tests__/StandaloneTestScreen.test.js`. Expected: the new tests FAIL and the old behavioural tests PASS.

- [ ] **Step 3: Implement** the behaviour above. Then remove SequentialCapture and StopCard from both ratchets.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command plus `npx jest src/assessment-questions/__tests__` (readingDuration, clockJump, oneTerminalCallback) and `npm run test:types`. Expected: PASS. The renderCount test must pass with only its props and its `'59s'` literal changed.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): step-by-step letter and word tests on the paged Masi capture look"`

---

### Task 8: Shared screens — skip picker, last-attempted sheet, missing item set

**Files:**
- Modify: `src/assessment-questions/skip/SkipReasonPicker.tsx`
- Modify: `src/assessment-questions/progress/LastAttemptedSheet.tsx`
- Modify: `src/assessment-questions/progress/MissingItemSet.tsx`
- Test: `progress/__tests__/LastAttemptedSheet.test.tsx`, new `skip/__tests__/SkipReasonPicker.test.tsx`
- Modify: `__tests__/styleGuard.test.ts`. Drop these three files from both ratchets.

**Interfaces:**
- Props, copy and behaviour are unchanged for all three.
- `SkipReasonPicker` stays a full-screen swap:
  - The title is a `UiText role="heading"`.
  - Each reason is a full-width `SecondaryButton`.
  - `Cancel` is a `TextLink` in a `BottomBar`.
- `LastAttemptedSheet` stays full-screen:
  - The header is `UiText`, plus the helper line.
  - Cells are `MarkTile variant="pill"`:
    - the selected cell is `current` (ink outline, not red);
    - cells after the selected one are `notReached`;
    - the others are `idle`.
  - Cells are grouped by `rowLengths` through `TileGroups`.
  - `Reached the end` and `Nothing attempted` are `SecondaryButton`s.
  - `Cancel` (when given) is a `TextLink`.
  - `Confirm` is a `PrimaryButton`, all inside a `BottomBar`.
- `MissingItemSet` is a centred `UiText` on canvas.

- [ ] **Step 1: Write the failing tests.**
  - `'the selected cell is outlined in ink, never red'`: `toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 3 })`, and no element has `backgroundColor: tokens.color.primary`.
  - `'cells after the selection read as not reached'`.
  - `'SkipReasonPicker lists the five reasons as buttons and Cancel as a link'`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx jest src/assessment-questions/progress/__tests__/LastAttemptedSheet.test.tsx src/assessment-questions/skip`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes, then remove the three files from the ratchets.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command plus `npx jest src/assessment-questions`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): skip picker, last-attempted sheet and missing-card state on the shared look"`

---

### Task 9: ReadWords grid (WelaPLUS Q6): paged, timed, free toggle

**Files:**
- Modify: `src/assessment-questions/questions/ReadWordsQuestion/index.tsx` (grid branch `:104-394`)
- Test: `questions/ReadWordsQuestion/__tests__/ReadWordsQuestion.test.tsx` (`:12` rewritten on purpose), `src/assessment-questions/__tests__/readingDuration.test.tsx` (helper pages through; assertions unchanged)
- Modify: `__tests__/styleGuard.test.ts` (drop ReadWords)

**Interfaces:**
- Consumes `paginate`, `WORD_PAGE_LAYOUT`, `rowsFromLengths`, `PageIndicator` (with page controls), `PagedGrid`, `MarkTile`, `Countdown`, `QuestionIntro`, `ToggleBar`, `LastAttemptedSheet`.
- Produces no new exports. `Result` is unchanged.

**Behaviour:**
- Rows come from `rowsFromLengths(row_lengths ?? [words.length])`.
- `pageIndex` is `useState(0)` in `ReadWordsQuestionContent`, so it survives the `mark-last` round trip.
- The previous and next page controls change `pageIndex`.
- **Timer:** when `durationSec` is set, render `Countdown`.
  - `getRemainingMs = () => { const d = getDeadlineMs(); return d === null ? 0 : d - (stopTimeMsRef.current ?? monotonicNow()); }`, memoised with `useCallback` and empty deps.
  - `durationMs = durationSec * 1000`.
- **Tiles:**
  - each tile is `MarkTile variant="word"`, state `correct` or `idle`, keyed by position;
  - `accessibilityLabel` is `` `${w.word}, ${correct ? 'correct' : 'idle'}` ``.
- **Bottom bar:** `ToggleBar primary={{ label: 'End', onPress: <existing End handler> }} onSkip={…}`.

- [ ] **Step 1: Write the failing tests.**
  - Rewrite `:12` as `'renders pages of whole card rows'`. The 3+3 set gives one page with 6 tiles and no indicator. The 7×6 shipped EN set gives `'Card row 1 · page 1 of 6'`.
  - Add these tests:
    - `'the 60 s timer is visible and counts down'`.
    - `'Next page shows card row 2 and keeps page-1 marks'`.
    - `'timer expiry on page 3 opens the last-attempted sheet without Cancel'`.
    - `'Cancel after End returns to the same page with its marks'`.
    - `'duplicate words on one page toggle independently'`, using the shipped EN page with `there how there how`.
  - In `readingDuration.test.tsx`, change only the tap helper: after each 10 taps, press `getByLabelText('Next page')` when it exists.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/questions/ReadWordsQuestion src/assessment-questions/__tests__/readingDuration.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** the behaviour above, then remove ReadWords from the ratchets.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command plus `npx jest src/assessment-questions`. Expected: PASS. The contract test, clockJump, oneTerminalCallback, itemSetIntegrity (`inja, idle` on page 1) and itemSetResolution all stay green with their assertions unchanged.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): WelaPLUS read-words on paged tiles with a visible timer"`

---

### Task 10: ReadPassage (Q8): paragraphs of word tiles, visible timer

**Files:**
- Modify: `src/assessment-questions/questions/ReadPassageQuestion/index.tsx`
- Test: `questions/ReadPassageQuestion/__tests__/ReadPassageQuestion.test.tsx`
- Modify: `__tests__/styleGuard.test.ts`. Drop ReadPassage.

**Interfaces:**
- `TileGroups` renders one group per paragraph:
  - `testID={`paragraph-${p}`}`, no heading, no card.
  - Tiles are `MarkTile variant="pill"` with `testID={`pill-${w.item_key}`}`, kept as it is (duplicate testIDs on real passages are pre-existing; tests use the fixture). React keys come from position.
- The timer is identical to Task 9's. It is conditional on `durationSec`, because the test at `:6` checks that the passage is untimed by default.
- `ToggleBar` has `primary` End.
- The passage scrolls; the page-never-scrolls rule does not apply here. Spec §3.3 is about paged grids.

- [ ] **Step 1: Write the failing tests.**
  - `'the timer shows only when durationSec is given'`.
  - `'paragraphs render as wrapped word pills'`: `paragraph-0` has `flexWrap: 'wrap'`, and the first pill has `borderRadius: tokens.radius.tile`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx jest src/assessment-questions/questions/ReadPassageQuestion`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes, then remove ReadPassage from the ratchets.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command plus `npx jest src/assessment-questions`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): WelaPLUS passage on word pills with a visible timer"`

---

### Task 11: Grouped toggle Questions — ReadSentences (Q7), WriteCvcs (Q9), WriteSentencesFromDictation (Q10)

**Files:**
- Modify: `src/assessment-questions/questions/{ReadSentencesQuestion,WriteCvcsQuestion,WriteSentencesFromDictationQuestion}/index.tsx`
- Test: each Question's `__tests__/<Q>.test.tsx`
- Modify: `__tests__/styleGuard.test.ts` (drop the three)

**Interfaces:**
- **All three:**
  - The intro is a `QuestionIntro`.
  - Confirm-finish becomes a `ConfirmSheet testID="confirm-finish"` overlaid on the active view, which is hidden from accessibility while the sheet is up. The title is `` `${n} items unmarked — finish anyway?` ``, `confirmLabel="Yes, finish"` and `cancelLabel="Cancel"`.
  - The bottom bar is `ToggleBar primary={{label:'Finish'}} onSkip`. The skip picker is still a full-screen swap.
- **Q7:** `TileGroups card` with one group per sentence, `testID={`sentence-row-${key}`}`. Tiles are `MarkTile variant="pill"`, `testID={`pill-${key}`}`.
- **Q10:** `TileGroups card`. The heading is `` `${i + 1}.` ``. Tiles are pills with `testID={`word-${key}`}`. Keep `prompt-scroll` as the `TileGroups` testID.
- **Q9:** `TileGroups card`. The heading is `` `${i + 1}. ${word}` ``. Tiles are `MarkTile variant="letter"` at a fixed width of 56, with `testID={`letter-${itemKey}`}`. The label format is unchanged. Keep `prompt-scroll`.

- [ ] **Step 1: Write the failing tests.** Add one per Question: `'Finish with unmarked items asks in a bottom sheet over the marked tiles'`. It checks that `confirm-finish` has the scrim overlay style. After Cancel the marks are kept and `queryByText(/items unmarked/)` is null. The existing tests must pass unchanged.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx jest src/assessment-questions/questions/ReadSentencesQuestion src/assessment-questions/questions/WriteCvcsQuestion src/assessment-questions/questions/WriteSentencesFromDictationQuestion`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes, then remove the three Questions from the ratchets.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command plus `npx jest src/assessment-questions`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): sentences, dictation and CVC Questions on grouped tile cards"`

---

### Task 12: Listen Questions (first sound, phoneme blend, story) and removing the child font-size hook

**Files:**
- Modify: `src/assessment-questions/questions/{ListenFirstSoundQuestion,ListenPhonemeBlendQuestion,ListenAndAnswerStoryQuestion}/index.tsx`
- Delete: `src/assessment-questions/hooks/useChildReadingFontSize.tsx`, `hooks/__tests__/useChildReadingFontSize.test.tsx`
- Modify: `LetterWritingFromPicturesQuestion/index.tsx:25,89-91`. Remove only the hook use here; the rest of that file is restyled in Task 13.
- Test: each Question's `__tests__/<Q>.test.tsx`
- Modify: `__tests__/styleGuard.test.ts`. Drop the three Questions.

**Interfaces:**
- **Prompt cards.** Each prompt is a `MarkTile variant="promptCard"` in a vertical `ScrollView testID="prompt-scroll"`, with a gap of 10.
  - Q4 sets `gloss={`(${word})`}`.
  - Q2 sets `gloss={acceptable_answers.join(', ')}`.
  - There is no italic anywhere.
- **Finish flow.** It uses the same `ConfirmSheet` and `ToggleBar` as Task 11.
- **Q2 intro.** It uses `QuestionIntro startLabel="I've finished reading"`. The story renders as `ContentText size="story"` inside `ScrollView testID="intro-story-scroll"`, passed as children.
- **Q2 active view.** It shows a `SecondaryButton label="Re-read story"`. That opens a `FullScreenSheet` containing the story, which closes with `Close`.
- **Removed hook.** `useChildReadingFontSize` and `ChildReadingFontSizeProvider` are removed. Its provider was never mounted, so the scale was always 1.0. This follows WelaPLUS spec §5.3 (`:331`).

- [ ] **Step 1: Write the failing tests.**
  - `'prompt cards are rounded, full width, and solid green when marked'`.
  - `'the phoneme gloss is plain, not italic'`: the gloss `Text` has no `fontStyle`.
  - Existing tests, including Story `:143` (the story is absent from the active tree), must pass unchanged.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/questions/ListenFirstSoundQuestion src/assessment-questions/questions/ListenPhonemeBlendQuestion src/assessment-questions/questions/ListenAndAnswerStoryQuestion`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes, delete the hook and its test, and remove the three Questions from the ratchets.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command plus `npx jest src/assessment-questions` and `npm run test:types`. Expected: PASS, with no remaining import of the deleted hook.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): Listen Questions on prompt cards; remove the unmounted child font-size hook"`

---

### Task 13: LetterWritingFromPictures (Q5): picture tiles, three columns

**Files:**
- Modify: `src/assessment-questions/questions/LetterWritingFromPicturesQuestion/index.tsx`
- Modify: `src/assessment-questions/itemsets/wela_plus_letter_writing.{en,xh}.ts:39-40` (`itemsPerPage: 12, columns: 3`)
- Test: `questions/LetterWritingFromPicturesQuestion/__tests__/LetterWritingFromPicturesQuestion.test.tsx`; `src/assessment-questions/__tests__/itemSetIntegrity.test.tsx:38` (`columns` 6 → 3, on purpose)
- Modify: `__tests__/styleGuard.test.ts` (drop Q5)

**Interfaces:**
- Keep the item-set fields `itemsPerPage` and `columns`. They are display hints, and saved results are unchanged. The validator is unchanged.
- Pages: `paginate([prompts.map((_, i) => i)], { columns, capacity: itemsPerPage, breakAtCardRow: false })`.
- `PageIndicator` with page controls replaces the bare `Prev`/`Next` buttons. **Copy change on purpose:** `Prev`/`Next` become the `Previous page`/`Next page` controls.
- Tiles: `MarkTile variant="picture" caption={alt} text={expected_letter}`, with `testID={`cell-${item_key}`}`. The label is unchanged. If a future content version sets `source`, render a 48×48 `Image` above the caption.
- `ConfirmSheet` and `ToggleBar` as in Task 11.

**Why three columns:** shipped isiXhosa names such as `iroboti (traffic light)` need about 100 dp. At 360 dp, three columns give tiles about 104 dp wide (spec §6: at least 44 dp, the builder chooses). 26 pictures become pages of 12, 12 and 2.

- [ ] **Step 1: Write the failing tests.**
  - Update `:26`, `:42` and `:149` to `getByLabelText('Next page')`/`'Previous page'`.
  - Add `'shipped sets show 12 pictures per page in three columns'`.
  - Add `'long isiXhosa picture names wrap to two lines inside the tile'`: the caption has `numberOfLines 2` and no ellipsis.
  - In itemSetIntegrity, set `columns` to 3 and `itemsPerPage` to 12.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/questions/LetterWritingFromPicturesQuestion src/assessment-questions/__tests__/itemSetIntegrity.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes and the item-set edit, then remove Q5 from the ratchets.

- [ ] **Step 4: Run the tests and see them pass.** Run the same command plus `npx jest src/assessment-questions`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(assessment): letter writing on picture tiles, three columns per page"`

---

### Task 14: StoryWritingRubric (Q11), with the ratchets closed

**Files:**
- Create: `src/assessment-questions/ui/RubricRow.tsx` (it contains `ScoreChip`)
- Modify: `src/assessment-questions/questions/StoryWritingRubricQuestion/index.tsx`
- Modify: `src/assessment-questions/questions/NullQuestion/index.tsx` (only if it is still in a ratchet)
- Test: `ui/__tests__/RubricRow.test.tsx`, `questions/StoryWritingRubricQuestion/__tests__/StoryWritingRubricQuestion.test.tsx` (`:427` updated on purpose), `__tests__/styleGuard.test.ts`

**Interfaces:**
- **`ScoreChip`:** `ScoreChip(props: { score: number; selected: boolean; accessibilityLabel: string; onPress: () => void; testID: string })`.
  - It is 52×52 with radius `tile`.
  - Selected: `ink` fill with `onInk` text.
  - Unselected: `surface` fill, 1 px `line` border, `ink` text.
- **`RubricRow`:** `RubricRow(props: { label: string; chipsTestID: string; viewRubricTestID: string; onViewRubric: () => void; gloss?: string; children: React.ReactNode })`.
  - It is a white card with radius `card`.
  - The label is `UiText role="label"`.
  - It shows a `TextLink label="View full rubric"` (ink).
  - The chips sit in a wrap row with gap 8.
- **The Question:**
  - Running total: `UiText role="heading"` with the text `` `Total: ${n} / ${max}` ``, pinned in the `BottomBar` above `ToggleBar primary Finish`.
  - The rubric modal and the picture modal become `FullScreenSheet`s.
  - The confirm step is `ConfirmSheet`, using the existing copy and `finish('ea_ended')`.
  - Delete the dead `scoredCount` (`:155-158`).

- [ ] **Step 1: Write the failing tests.**
  - `'a selected chip is ink, never red'`.
  - Update `:427` to `{ width: 52, height: 52 }` and gap 8.
  - `'the running total stays visible above Finish'`.
  - In `styleGuard.test.ts`, add `'both ratchets are empty'`: `expect([...FONT_RATCHET]).toEqual([])` and `expect([...STYLE_RATCHET]).toEqual([])`.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx jest src/assessment-questions/ui/__tests__/RubricRow.test.tsx src/assessment-questions/questions/StoryWritingRubricQuestion src/assessment-questions/__tests__/styleGuard.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes. Empty both ratchet sets, and remove any remaining entries by fixing those files.

- [ ] **Step 4: Run the full package and app checks.** Run `npx jest src/assessment-questions`, `npm test` and `npm run test:types`. Expected: everything passes. Record the suite and test counts.

- [ ] **Step 5: Commit.** Run `git commit -m "feat(assessment): rubric chips in ink and the style guard ratchet closed"`.

---

### Task 15: The Question gallery (dev and internal builds only)

**Files:**
- Create: `src/assessment-questions/battery/questionComponents.ts`
- Modify: `src/assessment-questions/index.ts` (export `questionComponentFor`, `NullQuestion`, and the `WELA_PLUS_*` item sets from `itemsets/index.ts`)
- Create: `src/utils/questionGallery.js`
- Create: `src/components/assessments/TestHeader.js` (extracted from `StandaloneTestScreen.js:120-128`)
- Create: `src/screens/dev/QuestionGalleryScreen.js`, `src/screens/dev/QuestionGalleryRunScreen.js`
- Modify: `src/screens/assessments/StandaloneTestScreen.js` (use `TestHeader`)
- Modify: `src/navigation/AppNavigator.js:171-177,266-270` (register both screens only when the gallery is enabled)
- Modify: `src/screens/main/ProfileScreen.js:182-204` (add a nested Support tools row, `Question gallery`, only when enabled)
- Modify: `app.config.js` (`extra.questionGallery: process.env.MASI_QUESTION_GALLERY === '1'`)
- Modify: `eas.json` (`env.MASI_QUESTION_GALLERY: "1"` on `development` and `preview` only)
- Test: `src/assessment-questions/battery/__tests__/questionComponents.test.ts`, `__tests__/questionGallery.test.js`, `__tests__/QuestionGalleryScreen.test.js`, `__tests__/AppNavigator.headers.test.js`, `__tests__/ProfileScreen.layout.test.js`, `__tests__/StandaloneTestScreen.test.js`

**Interfaces:**
- Package:
  - `export interface QuestionEntry { Component: React.ComponentType<any>; extraProps: Record<string, unknown> }`
  - `export function questionComponentFor(questionCode: string): QuestionEntry | null`
  - The codes cover all 11 battery codes in `battery/wela_plus_full.ts`, plus `word_reading` (`ReadWords`, `{ captureMode: 'sequential' }`) and `null_question`. `wela_plus_read_words` maps to `ReadWords` with `{}`, which is grid mode.
- Host:
  - `export function isQuestionGalleryEnabled(): boolean`, which is `__DEV__ || Constants.expoConfig?.extra?.questionGallery === true`.
  - `TestHeader({ title, subtitle, onClose })`
- **`QuestionGalleryScreen` (route `QuestionGallery`, header title `Question gallery`):**
  - A `ListGroup` called **Standalone tests** lists the `STANDALONE_TESTS` entries.
  - A `ListGroup` called **WelaPLUS battery** lists the 11 entries of `WELA_PLUS_FULL_2024_1`, in order. Read that file for its field names: `question_code`, `durationSec`, and the per-language instructions.
  - A **Language** row opens `SelectSheet` with English and isiXhosa.
  - Tapping an entry navigates to `QuestionGalleryRun` with `{ entryKey, languageCode }`.
- **`QuestionGalleryRunScreen` (route `QuestionGalleryRun`, `headerShown: false`):**
  - It shows `TestHeader`.
  - It mounts the entry's Component with:
    - `language`;
    - `itemSet`, which is undefined for battery entries (each Question resolves its own bundled set) or `CURRENT_ITEM_SETS[code][lang]` for standalone entries;
    - `durationSec` and `instructions`;
    - `childName="Gallery child"`;
    - `extraProps`.
  - `onComplete` opens a host `BottomSheet` titled `Result`, showing `stopped_reason`, `total_correct / total_attempted` and `duration_ms`, with the buttons `Run again` (remount via a key) and `Done` (`goBack`).

- [ ] **Step 1: Write the failing tests.**
  - `'every battery and standalone question code maps to a component; unknown codes map to null'`.
  - `'the gallery flag is on in dev, and production and pilot never set it'`. This reads `eas.json` and expects `production.env?.MASI_QUESTION_GALLERY` and `pilot.env?.MASI_QUESTION_GALLERY` to be undefined.
  - `'the gallery lists two standalone tests and eleven WelaPLUS Questions'`.
  - `'running a gallery entry mounts its Question and shows its result'`. Use the real `NullQuestion` entry, which completes at once.
  - `AppNavigator.headers.test.js`: add `QuestionGallery: 'Question gallery'` to `TITLES`, and add `QuestionGalleryRun` to the headerShown:false list.
  - `ProfileScreen.layout.test.js`: `'Support tools shows Question gallery when the gallery is enabled'`.
  - `StandaloneTestScreen.test.js`: the existing header assertions pass unchanged through `TestHeader`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx jest src/assessment-questions/battery __tests__/questionGallery.test.js __tests__/QuestionGalleryScreen.test.js __tests__/AppNavigator.headers.test.js __tests__/ProfileScreen.layout.test.js __tests__/StandaloneTestScreen.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Host files are `.js` and use `typeRoles`, `colors`, `ListGroup`, `ListRow`, `SelectSheet` and `BottomSheet`, as the host design-system guard requires.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, then `npm test` and `npm run test:types`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(host): dev-only Question gallery for device-checking every Question"`

---

### Task 16: Docs in the same branch

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`
  - Add a dated status note under the header that amends `:47` ("row for row"), `:196-199`, the §6.2 Grid row at `:243` and the Marking row at `:244` (no auto-scroll) to the spec §4 paging rule.
  - Record the typeface outcome (Andika).
- Modify: `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`
  - Add a status note to the existing top block. It amends D1 `:38`, the Q1 row `:324`, the Q6 row `:327` (paged and timer visible), the font row `:331` (hook removed), and §9.1 `:593` and `:601-602`.
  - Card rows stay a contract; the phone pages whole card rows; Side A is now Grid A, 6 × 10.
- Modify: `documentation/design-system.md`
  - Add a new `## Assessment capture` section before `## Guard rules…`. It covers package tokens, tile states, paging, the timer, the action area and bottom inset, fonts, the guards and the gallery, with links to `ui/`.
  - Amend `:138`: Figtree carries UI copy; Andika carries test content.
  - Amend `:593`: the package `BottomBar` owns the inset.
- Modify: `CONTEXT.md`: under **Item set** (`:132`), add the **Card row** and **Page** terms in the `**Term**:` / `_Avoid_:` format.
  - A page is a display grouping of whole card rows, never the unit of meaning.
- Modify: `documentation/ROADMAP.md` §8 `:773-780`: mark capture-chrome conformance done for the package, and leave the Battery Run host open.
- Modify: `documentation/LEARNING.md`: add `## A look nobody tested is a look you can lose (assessment capture, 2026-10-21)`.
- Modify: `documentation/build-log.md`
  - Add a session entry at the end (`### 2026-10-21 — Assessment capture style`), with a `| Gate | Command | Result |` table.
  - Add a Decision Register row for each call in spec §12 and for this plan's calls (Q5 three columns, `End` kept on Q6/Q8, Skip as a link, the hook removed, the gallery flag on preview).
  - Add a Verification Register row.
- Modify: `design/mockups-2026-10-assessment-capture/README.md`: note where the build differs from the mockup (`End test`, Skip link).
- Not in this branch; record both as open in the build-log entry:
  - the Plan 3 mockup README on `design/welaplus-plan-3-screens` (Q1 frame superseded; its open question 1 answered by spec §4), updated when that branch is next touched;
  - the note to the content owner that the recreated printed card should use Andika (spec §5), which goes to Jim in the hand-off message.

- [ ] **Step 1: Write the docs.** Every claim must cite `file:line` in the current code. No status ledger goes in the specs; use dated notes only.
- [ ] **Step 2: Check them.** Run `npm test -- __tests__/docs` if docs tests exist (`ls __tests__ | grep -i doc`); otherwise read each changed doc against the code once. Expected: no claim contradicts the code.
- [ ] **Step 3: Commit.** `git commit -m "docs(assessment): capture style — spec amendments, design system, context terms, learning, build log"`

---

### Task 17: Device gate (Claude drives; Jim confirms on the iPhone)

**Files:**
- Modify: `src/assessment-questions/itemsets/contentStatus.ts:7-8` (close the two `typeface` entries)
- Modify: `src/assessment-questions/__tests__/itemSetIntegrity.test.tsx:97-108` (the expected `CONTENT_PENDING` list, on purpose)
- Modify: `documentation/build-log.md` (screenshots and results)

- [ ] **Step 1: Build.** Make an EAS `preview` build for Android and iOS from this branch (`expo-deployment` skill). Install it on the A03s and run `adb shell wm density 320` (360 dp).
- [ ] **Step 2: Check the standalone letter and word tests against the mockups.** On the A03s, check each of the following:
  - tile sizes and gaps;
  - colours;
  - the ink outline on the current tile;
  - earlier marks still visible after Back, with the returned-to tile unmarked and outlined;
  - Back across a page edge;
  - a stop at 10 wrong in a row, including on a page's last tile;
  - End through the sheet;
  - the timer running out, with amber for the last 10 s;
  - Android 3-button navigation not covering the actions;
  - `ibhulukhwe` fitting its tile;
  - one large-text setting.

  Take screenshots of each.
- [ ] **Step 3: Check the gallery.** Open all nine WelaPLUS Questions in English and isiXhosa and screenshot each one.
- [ ] **Step 4: Check the font.** Grid A card rows 1, 3 and 5 must show `I` and `l` as clearly different. If they do, delete the two `typeface` entries and update the itemSetIntegrity expectation. Then run `npx jest src/assessment-questions/__tests__/itemSetIntegrity.test.tsx`. Expected: PASS.
- [ ] **Step 5: iPhone.** Ask Jim to repeat Steps 2–4 on the iPhone build. Log his verdict verbatim.
- [ ] **Step 6: Commit.** Run `git commit -m "docs(assessment): capture style device gate; typeface content closed"`.
