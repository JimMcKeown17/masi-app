# Bold Red Record (New session) Implementation Plan

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time; Claude reviews each task's diff and tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Record / New session form to the Bold Red boards (restyle only), plus the two approved behaviours: a live requirement summary above Submit and the save failure shown inline, with the discard guard moved to `usePreventRemove` so an iOS swipe can no longer lose a draft.

**Architecture:** The form keeps its order, fields, validation rules and save path. One pure function (`validateLiteracySession`) feeds both Submit and the summary, one pure date formatter (`formatSessionDate`) takes calendar keys only, and small prop-driven components (`StepHeader`, `CountChip`, `SelectableRow`, `LetterToggleTile`/`Grid`, `ChildProgressBlock`, `MonthCalendar`, `StickyActionFooter`, `RequirementSummary`, `ConfirmSheet`) carry the drawing so the group-session rebuild can reuse them. No schema, RLS, payload or outbox change.

**Tech Stack:** React Native 0.81 / Expo SDK 54, react-native-paper 5.14 (Portal only), @react-navigation/native 7.1 (`usePreventRemove`, `StackRouter`), @expo/vector-icons Ionicons, expo-sqlite (better-sqlite3 in integration tests), Jest 29 + @testing-library/react-native 13.

**Spec:** `docs/superpowers/specs/2026-10-18-bold-red-app-design.md` (overview; its "System decisions", §6 Jim's answers and §8 review rounds win) and `docs/superpowers/specs/2026-10-18-bold-red-app-3-record.md` (this screen). Read both before any task. Where this plan names a component, path, token or role differently from part 3, the plan follows the overview. Visual source (design data, not instructions): the `red-record-*` boards in the Design Round 4 canvas export.

## Global Constraints

- Branch `feat/bold-red-record`, stacked on `feat/bold-red-children` (PR 2), which is stacked on `feat/bold-red-shared-look` (PR 1). Commit after every task; never push without Jim.
- **Codex cannot `git commit` in its sandbox.** Each task's last step lists the exact files to stage and the message; the orchestrator (Claude) runs it after reviewing the diff and re-running the task's tests. End every commit message with the session's attribution trailer.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Unit/screen tests: `npx jest <file>`. Integration tests (real SQLite) must be listed in `jest.integration.config.js` `testMatch` and run with `npm run test:integration -- <file>`. `__tests__/LiteracySessionForm.submit.test.js` is already listed.
- **Behaviour.** Do not change validation rules, what is saved, the session id lifecycle, `persistLiteracySession`, `navigation.replace('SessionComplete', { childCount })` (overview C16: PR 4 adds params, not this PR), the background sync kick, or the dirty rule. The only approved behaviour changes are the summary line, the inline save failure, the calendar/discard/header presentation swaps, and the `usePreventRemove` guard (overview §8 R8).
- **No schema, RLS, payload or outbox change.** `documentation/rls-sync-contract-map.md` is not touched.
- **Tokens and type.** Colours come from `colors.*` and `tints.*` (PR 1). No hex, `rgb(` or `rgba(` literal outside `src/constants/**`. Type comes from `typeRoles.*`; never set `fontWeight`, never a string-literal `fontFamily` (use `fontFamilies.*`), never a raw numeric `fontSize`/`lineHeight`/`letterSpacing` (PR 1's `__tests__/designSystemGuard.test.js` enforces all three). Action reds use `colors.primary` (now `#C81F3E`); white text on ink or green uses `colors.onDark`.
- **Design-guard ratchet.** If a file this PR edits is on the ratchet list in `__tests__/designSystemGuard.test.js`, lower its count in the same task; delete its line when it reaches zero (the guard fails on a stale line). Expected Record entries: `LiteracySessionForm.js`, `ChildSelector.js`, `LetterTrackerBottomSheet.js`, `SessionFormScreen.js`. All must be gone by Task 13.
- **Copy is verbatim from the spec.** Curly apostrophe (`’`) and the single ellipsis character (`…`) in user-visible strings. Sentence case.
- **Letters render lowercase** on the focus grid, the tracker sheet and `LetterMasteryPanel` (Jim, overview §6 Q3). Accessibility labels keep each surface's existing letter case: focus grid capitals ("M, selected"), tracker and panel lowercase ("m, not mastered"), as the part-3 tables specify.
- 44dp is a minimum, never a fixed height, except the roster row, which is a fixed `rosterRowHeight` so `getItemLayout` stays exact.
- Shared primitives from PR 1/2 are used as shipped. **Never build a screen-local copy.** If a primitive's shipped API differs from what this plan assumes, adapt the call site; if the plan needs a prop the primitive lacks, add it as an additive, default-off prop in the primitive's own file with a test, and say so in the commit body.
- Dependencies: none. Stay on npm and `package-lock.json`.
- TDD per task: failing test first for behaviour; pure restyles assert structure, tokens and accessibility through the screen with @testing-library/react-native, never snapshots. Keep the whole unit suite green after every task.
- Standing docs ship in this branch (Task 13), per `AGENTS.md`.

## Review Focus

1. **iOS swipe-back or Android back on a dirty form.** The form must stay, with every value intact, behind the discard sheet; "Keep editing" keeps it, "Discard" leaves, and a successful submit is never blocked. Pinned in Task 3 with the real `StackRouter` and `usePreventRemove`; the native swipe itself is a device row in Task 14.
2. **A phone whose timezone is east of Johannesburg** (Auckland). The field, calendar selection and stored `session_date` must name the same day. Pinned in Task 8 (`TZ=Pacific/Auckland` screen test) and Task 2 (formatter never reads the device zone).
3. **Largest system font (1.3).** Roster rows stay uniform at 74 so `getItemLayout` and scrolling stay exact; step labels and the summary wrap; tile letters cap at 1.2. Pinned in Task 5 (`rosterRowHeight` at 1.3 through the screen) and Task 6 (tile `maxFontSizeMultiplier`).
4. **Saving fails twice, or fails then the EA clears a field.** The note returns and is announced on each failure; a validation failure after a save failure shows only the inline step errors; the retry writes the original session id exactly once. Pinned in Task 11 (real SQLite).
5. **Jumping from the summary when the roster is filtered or empty.** The letters/level offsets must use the visible row count, or the measured empty-row height when no row matches. Pinned in Task 12 (`stepScrollOffset` cases and a screen test with a no-match search).

---

### Before Task 1: preflight (orchestrator, no commit)

- [ ] **Step 1: Create the worktree and install.** Branch `feat/bold-red-record` from `feat/bold-red-children`. If the worktree has no `node_modules`, run `npm ci` in it.
- [ ] **Step 2: Confirm the base suite is green.** Run `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`. Expected: PASS. Record the counts for the build log.
- [ ] **Step 3: Confirm the consumed primitives exist** and note their exact exports and props (adapt this plan's call sites to them):

| From | Path | Used as |
|---|---|---|
| PR 1 | `src/components/common/BrandButton.js` | `variant` `primary` / `destructiveQuiet` / `tertiary` with `tone="ink"`, `size`, `loading`, `loadingLabel` |
| PR 1 | `src/components/common/IconCircleButton.js` | calendar month arrows |
| PR 1 | `src/components/common/ScreenHeader.js` (`useHeaderHairline`) | navigator header, `headerLeftIcon: 'close'` |
| PR 1 | `src/components/common/SelectField.js`, `TextField.js`, `SearchField.js` | date, level, comments, search |
| PR 1 | `src/components/common/InlineNote.js` | step errors, save failure |
| PR 1 | `src/components/common/SegmentedControl.js` | Children / Groups, `role="tab"` |
| PR 1 | `src/components/common/ListRow.js`, `IconTile.js`, `StatusBadge.js` (tone `successStrong`) | rows, group tile, "+n new" |
| PR 1 | `src/components/common/BottomSheet.js`, `SelectSheet.js` (restyled; `subtitle`, `cancelLabel`, `footer`) | every sheet |
| PR 1 | `src/context/MotionContext.js` (`MotionProvider`, `useMotion`) | press scale, tests pin a level |
| PR 1 | `src/context/ToastContext.js` (`useToastObstruction`) | footer height |
| PR 1 | `src/hooks/useKeyboardHeight.js` | footer hides with the keyboard |
| PR 1 | `src/constants/colors.js` (`tints`, `shadows.primaryButton`, `successText` `#2B7524`), `src/constants/typography.js` | roles below |
| PR 2 | `src/components/common/Avatar.js`, `src/utils/initials.js` (`getInitials(first, last)`) | roster and progress rows |

  Roles this plan uses (overview §2.2; all built by PR 1): `displayTitle`, `displaySheetTitle`, `displayHeading`, `textRowTitle`, `textBodySemi`, `textParagraph`, `textInput`, `textButtonL`, `textButtonM`, `textLink`, `textSmallStrong`, `textNote`, `textChip`, `textBadge`, `textSectionLabel`, `textLetter`, `textDay`, `textLabel`, `textCaption`, `textBody`, `textBodyStrong`; faces `fontFamilies.textHeavy`, `fontFamilies.textMedium`. If any is missing, stop and raise it: PR 1 owns them.

---

### Task 1: `validateLiteracySession`, the one source of the three rules

**Files:**
- Create: `src/utils/literacySessionValidation.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (`handleSubmit`, today `:492-501`)
- Test: `__tests__/literacySessionValidation.test.js`

**Interfaces:**
- Produces: `validateLiteracySession({ selectedChildren, selectedLetters, sessionReadingLevel }) => { children?: string, letters?: string, readingLevel?: string }`. Body exactly as part 3 "Approved behaviour 1" (the three rules from `LiteracySessionForm.js:495-497`, same messages). Task 12 and the form's `handleSubmit` both call it.

- [ ] **Step 1: Write the failing tests** (spec test 1)

```js
import { validateLiteracySession } from '../src/utils/literacySessionValidation';

const valid = { selectedChildren: [{ id: 'c1' }], selectedLetters: ['m'], sessionReadingLevel: 'Word Reading' };

test('a complete form has no errors', () => {
  expect(validateLiteracySession(valid)).toEqual({});
});
test.each([
  ['children', { selectedChildren: [] }, 'Select at least one child'],
  ['letters', { selectedLetters: [] }, 'Select at least one letter'],
  ['readingLevel', { sessionReadingLevel: null }, 'Select a reading level'],
])('each rule alone: %s', (key, override, message) => {
  expect(validateLiteracySession({ ...valid, ...override })).toEqual({ [key]: message });
});
test('all three missing', () => {
  expect(validateLiteracySession({ selectedChildren: [], selectedLetters: [], sessionReadingLevel: '' })).toEqual({
    children: 'Select at least one child',
    letters: 'Select at least one letter',
    readingLevel: 'Select a reading level',
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/literacySessionValidation.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** the function, then make `handleSubmit` call it in place of the inline `errors` block. Nothing else in `handleSubmit` changes.
- [ ] **Step 4: Run** the new test plus `__tests__/LiteracySessionForm.test.js` and `npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/utils/literacySessionValidation.js src/screens/sessions/LiteracySessionForm.js __tests__/literacySessionValidation.test.js
git commit -m "refactor(record): extract validateLiteracySession as the single source of the three rules"
```

---

### Task 2: `formatSessionDate`, keys only

**Files:**
- Create: `src/utils/sessionDateFormat.js`
- Test: `__tests__/sessionDateFormat.test.js`

**Interfaces:**
- Produces (overview §4 S6):
  - `formatSessionDate(dateKey: 'YYYY-MM-DD', style: 'field' | 'fieldToday' | 'pill' | 'spoken' | 'calendarLabel') => string`. Throws `TypeError('formatSessionDate expects a YYYY-MM-DD key')` for a `Date`, a non-matching string, or an impossible day (`2026-02-30`), and `RangeError` for an unknown style. Fixed English arrays, no `Intl`, no device timezone: weekday from `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`.
  - `parseDateKey(key) => { year, monthIndex, day }` (same validation) and `dateKeyFromParts(year, monthIndex, day) => 'YYYY-MM-DD'` (zero-padded). Task 8's `MonthCalendar` uses both.
  - Exported arrays `MONTH_NAMES` (full) and `WEEKDAY_SHORT` (`Su`…`Sa`) for the calendar.
- Formats (day of month never zero-padded; middle dot is U+00B7 with a space each side):

| Style | `2026-10-15` |
|---|---|
| `field` | `Thu 15 Oct 2026` |
| `fieldToday` | `Today · Thu 15 Oct` |
| `calendarLabel` | `Thu 15 October 2026` |
| `pill` | `Thu 15 Oct` |
| `spoken` | `Thursday 15 October` |

- [ ] **Step 1: Write the failing tests**

```js
import { formatSessionDate, parseDateKey, dateKeyFromParts } from '../src/utils/sessionDateFormat';

test.each([
  ['field', 'Mon 12 Oct 2026', '2026-10-12'],
  ['fieldToday', 'Today · Thu 15 Oct', '2026-10-15'],
  ['calendarLabel', 'Thu 15 October 2026', '2026-10-15'],
  ['pill', 'Tue 13 Oct', '2026-10-13'],
  ['spoken', 'Tuesday 13 October', '2026-10-13'],
  ['field', 'Fri 1 Jan 2027', '2027-01-01'],
])('%s → %s', (style, expected, key) => {
  expect(formatSessionDate(key, style)).toBe(expected);
});

test('never reads the device timezone', () => {
  const original = process.env.TZ;
  try {
    for (const tz of ['Pacific/Auckland', 'America/New_York', 'Africa/Johannesburg']) {
      process.env.TZ = tz;
      expect(formatSessionDate('2026-10-18', 'field')).toBe('Sun 18 Oct 2026');
    }
  } finally {
    process.env.TZ = original;
  }
});

test.each([[new Date(2026, 9, 18)], ['2026-10-18T00:00:00Z'], ['18/10/2026'], ['2026-02-30'], [null]])(
  'rejects %p', (input) => {
    expect(() => formatSessionDate(input, 'field')).toThrow(TypeError);
  },
);
test('rejects an unknown style', () => {
  expect(() => formatSessionDate('2026-10-18', 'long')).toThrow(RangeError);
});
test('key helpers round-trip and zero-pad', () => {
  expect(dateKeyFromParts(2026, 0, 5)).toBe('2026-01-05');
  expect(parseDateKey('2026-12-31')).toEqual({ year: 2026, monthIndex: 11, day: 31 });
});
```

- [ ] **Step 2: Run to verify it fails.** `… npx jest __tests__/sessionDateFormat.test.js` → FAIL.
- [ ] **Step 3: Implement** the module.
- [ ] **Step 4: Run to verify it passes.** Same command → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionDateFormat.js __tests__/sessionDateFormat.test.js
git commit -m "feat(record): formatSessionDate — one session date format, calendar keys only"
```

---

### Task 3: Discard guard on `usePreventRemove`, `ConfirmSheet`, and a real-router test stack

Every later task renders the form through the test stack built here, because `usePreventRemove` needs a real navigator.

**Files:**
- Create: `src/components/common/ConfirmSheet.js`
- Create: `test-support/renderInTestStack.js`
- Modify: `src/components/common/BottomSheet.js` (one additive prop)
- Modify: `src/screens/sessions/LiteracySessionForm.js` (guard, `:399-433`; success path, `:535-544`)
- Test: `__tests__/ConfirmSheet.test.js` (new), `__tests__/LiteracySessionForm.test.js`, `__tests__/LiteracySessionForm.submit.test.js`, `__tests__/ChildSelector.renderCount.test.js`

**Interfaces:**
- Produces:
  - `BottomSheet` gains `panelRole?: string` (default undefined). When set, the sheet panel `View` gets `role={panelRole}` and `accessibilityViewIsModal`. No visual change.
  - `ConfirmSheet({ visible, title, titleAccessory?, body, confirmLabel, confirmVariant = 'destructiveQuiet', cancelLabel, onConfirm, onCancel, dismissLabel? })` (overview §1.2). Renders `BottomSheet` with `title`, `panelRole="alertdialog"`, `scrollable={false}`, `keyboardAvoiding={false}`; `onDismiss = onCancel` (scrim and Android back cancel). Body `typeRoles.textParagraph` `colors.textSecondary`. Then, 24 below the body, a 12-gap stack: `BrandButton variant={confirmVariant} size="lg" label={confirmLabel}` and `BrandButton variant="tertiary" tone="ink" label={cancelLabel}`. `titleAccessory` renders after the title row (Profile passes a Sensitive badge); if the restyled `BottomSheet` has no slot for it, render it as the first child of the body. `dismissLabel` defaults to `Dismiss ${title}`.
  - `renderInTestStack({ routes, initialIndex = routes.length - 1, motion = { motionLevel: 'full', reduceMotion: false, tier: 'high' } }) => RTL render result + { navigationRef, routeNames: () => string[] }`. `routes` is `[{ name, component, params? }]`.
  - In the form: `preventLeave` (state-derived boolean), `discardVisible`, `storedActionRef`, `allowLeave` state, `pendingCompletionRef`.

- [ ] **Step 1: Write the test stack** (load-bearing; write it as given)

```js
// test-support/renderInTestStack.js
// A minimal stack navigator on the real StackRouter and useNavigationBuilder, so screens
// get real usePreventRemove / beforeRemove / replace semantics without react-native-screens.
// It renders only the focused route. Native-only behaviour (iOS swipe → preventNativeDismiss)
// is a device check, not covered here.
import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import {
  NavigationContainer,
  StackRouter,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
} from '@react-navigation/native';
import { MotionProvider } from '../src/context/MotionContext';

function TestStackNavigator({ id, initialRouteName, children, screenOptions }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    id, initialRouteName, children, screenOptions,
  });
  return <NavigationContent>{descriptors[state.routes[state.index].key].render()}</NavigationContent>;
}
const createTestStack = createNavigatorFactory(TestStackNavigator);

export function renderInTestStack({ routes, initialIndex = routes.length - 1, motion = { motionLevel: 'full', reduceMotion: false, tier: 'high' } }) {
  const Stack = createTestStack();
  const navigationRef = createNavigationContainerRef();
  // Every route is registered as a screen; only routes[0..initialIndex] start on the stack.
  const initialState = {
    index: initialIndex,
    routes: routes.slice(0, initialIndex + 1).map(({ name, params }) => ({ name, params })),
  };
  const screen = render(
    <PaperProvider settings={{ icon: () => null }}>
      <MotionProvider value={motion}>
        <NavigationContainer ref={navigationRef} initialState={initialState}>
          <Stack.Navigator>
            {routes.map(({ name, component }) => <Stack.Screen key={name} name={name} component={component} />)}
          </Stack.Navigator>
        </NavigationContainer>
      </MotionProvider>
    </PaperProvider>,
  );
  return { ...screen, navigationRef, routeNames: () => navigationRef.getRootState().routes.map((r) => r.name) };
}
```

  If PR 1's `MotionProvider` takes its override under a different prop, match it. If `MotionProvider` needs no wrapper in tests (a safe default context), keep the wrapper anyway so tests pin the level (overview §4 S5).

- [ ] **Step 2: Move every form-rendering test onto the stack** (no assertion changes yet). In `LiteracySessionForm.test.js`, `LiteracySessionForm.submit.test.js` and `ChildSelector.renderCount.test.js`, replace the hand-built `navigation` object and `render(...)` with:

```js
const mockCompleteMounted = jest.fn();
function HomeStub() { return null; }
function SessionCompleteStub({ route }) {
  React.useEffect(() => { mockCompleteMounted(route.params); }, []);
  return null;
}
const renderForm = () => renderInTestStack({
  routes: [
    { name: 'Home', component: HomeStub },
    { name: 'SessionForm', component: LiteracySessionForm },
    { name: 'SessionComplete', component: SessionCompleteStub },
  ],
  initialIndex: 1,
});
```

  Translate the old assertions: `navigation.replace` called once with `('SessionComplete', { childCount: 1 })` → `mockCompleteMounted` called once with `{ childCount: 1 }` and `routeNames()` equal `['Home', 'SessionComplete']`; "not called" → `mockCompleteMounted` not called and `routeNames()` equal `['Home', 'SessionForm']`. The submit test keeps its `SignedInEAContext.Provider`; nest the stack inside it (add an optional `wrapper` component param to `renderInTestStack` that wraps the `PaperProvider`). With `initialIndex: 1`, `SessionComplete` is registered but not on the stack until the form replaces itself.

- [ ] **Step 3: Rewrite the leave-guard tests** in `LiteracySessionForm.test.js` (spec test 8; replaces the `Alert.alert` spies). Keep `COMMENTS_PLACEHOLDER` as a constant at the top of the file (`'Add session notes...'` now; Task 9 changes it).

```js
describe('unsaved-changes leave guard', () => {
  const goBack = (screen) => act(() => { screen.navigationRef.goBack(); });
  const dirty = (screen) => fireEvent.changeText(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER), 'worked on m sounds');

  test('a dirty form refuses removal and shows the discard sheet with the verbatim copy', () => {
    const screen = renderForm();
    dirty(screen);
    goBack(screen);
    expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    expect(screen.getByText('Discard this session?')).toBeTruthy();
    expect(screen.getByText('Your session details have not been saved. Leaving now will discard them.')).toBeTruthy();
    expect(screen.getByText('Discard')).toBeTruthy();
    expect(screen.getByText('Keep editing')).toBeTruthy();
  });

  test('"Keep editing" hides the sheet, keeps every value, and the guard stays armed', () => {
    const screen = renderForm();
    dirty(screen);
    goBack(screen);
    fireEvent.press(screen.getByText('Keep editing'));
    expect(screen.queryByText('Discard this session?')).toBeNull();
    expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
    goBack(screen);
    expect(screen.getByText('Discard this session?')).toBeTruthy();
    expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
  });

  test('"Discard" dispatches the stored action and leaves without a second prompt', () => {
    const screen = renderForm();
    dirty(screen);
    goBack(screen);
    fireEvent.press(screen.getByText('Discard'));
    expect(screen.routeNames()).toEqual(['Home']);
  });

  test('Android back with the sheet open keeps editing', () => {
    const backSpy = jest.spyOn(BackHandler, 'addEventListener');
    const screen = renderForm();
    dirty(screen);
    goBack(screen);
    const handlers = backSpy.mock.calls.filter(([event]) => event === 'hardwareBackPress');
    act(() => { handlers[handlers.length - 1][1](); });
    expect(screen.queryByText('Discard this session?')).toBeNull();
    expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    backSpy.mockRestore();
  });

  test('choosing a session reading level alone makes the form dirty', () => { /* pick level, goBack, sheet shows */ });
  test('a clean form leaves without the sheet', () => { /* goBack → ['Home'], no sheet */ });
  test('a successful submit leaves without the sheet', async () => {
    /* submitValidForm, await mockCompleteMounted({ childCount: 1 }), routeNames ['Home','SessionComplete'], no sheet */
  });
});
```

- [ ] **Step 4: Write the `ConfirmSheet` tests** (`__tests__/ConfirmSheet.test.js`): renders title, body, confirm and cancel labels; confirm press calls `onConfirm` once; cancel press, the labelled scrim and the last `hardwareBackPress` handler each call `onCancel`; the panel node has `role="alertdialog"` and `accessibilityViewIsModal={true}` (find it with `UNSAFE_getByProps({ role: 'alertdialog' })`); `titleAccessory` renders; `visible={false}` renders nothing.
- [ ] **Step 5: Run to verify they fail.** `… npx jest __tests__/ConfirmSheet.test.js __tests__/LiteracySessionForm.test.js` → FAIL (no `ConfirmSheet`; guard still uses `Alert`).
- [ ] **Step 6: Implement.**
  - `BottomSheet`: the `panelRole` prop.
  - `ConfirmSheet` as in Interfaces.
  - The form: delete the `beforeRemove` effect, `Alert` import, `allowLeaveRef`, `isDirtyRef` and `initialSessionDateRef`'s ref-only use. Compute `isDirty` from state with today's exact rule (the seven conditions at `:406-413`), then:

```js
const [allowLeave, setAllowLeave] = useState(false);
const preventLeave = isDirty && !allowLeave;
const storedActionRef = useRef(null);
const [discardVisible, setDiscardVisible] = useState(false);
usePreventRemove(preventLeave, ({ data }) => {
  storedActionRef.current = data.action;
  setDiscardVisible(true);
});
```

    "Discard": `const action = storedActionRef.current; storedActionRef.current = null; setDiscardVisible(false); navigation.dispatch(action);`. "Keep editing" / `onCancel`: hide and clear the ref.
  - Success path (overview §8 R8): after `persistLiteracySession` resolves, set `pendingCompletionRef.current = { childCount: selectedChildIds.length }` and `setAllowLeave(true)`. A `useEffect` keyed on `[allowLeave]`, **declared after the `usePreventRemove` call** so the guard's own effect releases first, takes the ref, clears it, then runs today's three calls in today's order: `navigation.replace('SessionComplete', params)`, `triggerBackgroundSync?.()`, and the `Promise.resolve().then(() => refreshSyncStatus()).catch(...)` with the same console message. A failed save never sets `allowLeave`, so the form stays guarded.
  - Render `<ConfirmSheet visible={discardVisible} title="Discard this session?" body="Your session details have not been saved. Leaving now will discard them." confirmLabel="Discard" confirmVariant="destructiveQuiet" cancelLabel="Keep editing" dismissLabel="Dismiss discard confirmation" onConfirm={…} onCancel={…} />`.
- [ ] **Step 7: Run** `… npx jest __tests__/ConfirmSheet.test.js __tests__/LiteracySessionForm.test.js __tests__/ChildSelector.renderCount.test.js __tests__/BottomSheet.test.js` and `… npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js`. Expected: PASS, including the unchanged "a failed save … retry" test (the form stays on `SessionForm` after the failure).
- [ ] **Step 8: Commit**

```bash
git add src/components/common/ConfirmSheet.js src/components/common/BottomSheet.js src/screens/sessions/LiteracySessionForm.js test-support/renderInTestStack.js __tests__/ConfirmSheet.test.js __tests__/LiteracySessionForm.test.js __tests__/LiteracySessionForm.submit.test.js __tests__/ChildSelector.renderCount.test.js
git commit -m "fix(record): discard guard on usePreventRemove with a ConfirmSheet, so a dirty form survives an iOS swipe"
```

---

### Task 4: Form primitives — `StepHeader`, `CountChip`, `SelectableRow`

Prop-driven, no literacy knowledge (they serve the group-session rebuild too).

**Files:**
- Create: `src/components/forms/StepHeader.js`, `src/components/forms/CountChip.js`, `src/components/forms/SelectableRow.js`
- Modify (only if needed): `src/components/common/ListRow.js` (additive pass-through props)
- Test: `__tests__/formPrimitives.test.js`

**Interfaces:**
- Produces:
  - `StepHeader` = `React.forwardRef(({ step, label, status = 'todo', right, onLayout }, ref))`. `status`: `'todo' | 'done' | 'error'`. Outer `View` takes `ref` and `onLayout`, `accessible`, `accessibilityRole="header"`, `accessibilityLabel` = `Step ${step}: ${label}` + (`done` → `, complete`; `error` → `, needs attention`). Row: disc 20×20 radius 10, gap 10, label `textSectionLabel` (uppercase via `textTransform`, flex 1, wraps), optional `right` node at the end (a string renders as `textCaption` `textSecondary`). Disc: todo = 1.5 ring `textSecondary` + numeral (`textBadge`, `colors.text`); done = `colors.text` fill + Ionicons `checkmark` 12 `colors.onDark`; error = 1.5 ring `colors.error` + numeral `colors.error`, label `colors.error`. Min height 20; `alignItems: 'flex-start'` so the disc stays top-aligned when the label wraps.
  - `CountChip({ label, active })`: height 32 minimum, `borderRadius.pill`, padding 0/12, `textChip` with `fontVariant: ['tabular-nums']`. Active: `colors.text` fill, `colors.onDark` text, no icon. Inactive: `colors.surface`, 1.5 `tints.rule` border, `textSecondary`. Not interactive (`accessible={false}`).
  - `SelectableRow` = `React.memo(({ variant, title, subtitle, lead, selected, onPress, position, height, accessibilityLabel }))`. `variant`: `'checkbox' | 'radio'`; `position`: `'first' | 'middle' | 'last' | 'only'`; `height`: exact row height (Task 5 passes `rosterRowHeight`). Composes `ListRow` with `lead`, `title` (one line, ellipsis), `subtitle`, `trailing` = a 44×44 slot (6dp into the right padding) holding a 32 circle: checkbox selected = `colors.text` fill + `checkmark` 18 `colors.onDark`; checkbox unselected = 2px `textSecondary` ring; radio selected = 2px `colors.text` ring + 18 `colors.text` dot; radio unselected = 2px `textSecondary` ring. Grouped-card edges are drawn **inside** the fixed height: 1px `tints.rule` sides always; `first` adds the top edge and top radii 18; `last` adds the bottom edge and bottom radii 18; `only` all four. Inset divider: 1px `colors.border`, from x 68 to the right edge, absolutely positioned at the bottom, absent on `last`/`only`. Background `colors.surface`; pressed `tints.pressed`. `accessibilityRole` = `variant`, `accessibilityState={{ checked: selected }}`.
  - If `ListRow` cannot take a fixed `style` height, `accessibilityState`, and a one-line title, add `style`, `accessibilityState` and `titleNumberOfLines` as additive pass-through props on `ListRow` (default undefined, no visual change), with a `ListRow` test.

- [ ] **Step 1: Write the failing tests** in `__tests__/formPrimitives.test.js`:
  - `StepHeader` labels: `{ step: 4, label: 'Session reading level' }` → "Step 4: Session reading level"; `status="done"` → "…, complete"; `status="error"` → "…, needs attention"; role header; `right="Optional"` renders the text; the forwarded ref receives the outer view (`ref.current` is truthy after render); `onLayout` is called when the outer view fires `layout`.
  - `CountChip`: renders "2 selected"; active style `backgroundColor === colors.text`; inactive `backgroundColor === colors.surface` (use `StyleSheet.flatten` on the chip view found by `UNSAFE_getByProps({ testID: 'count-chip' })`; give the chip that `testID`).
  - `SelectableRow`: checkbox role and `{ checked: true }` state when selected; radio role; pressing calls `onPress` once; the row's flattened style has `height` equal to the `height` prop for every `position`; `position="middle"` has `borderTopWidth` 0 and `borderBottomWidth` 0; `position="last"` renders no divider (`queryByTestId('row-divider')` null); `position="first"` renders it.
- [ ] **Step 2: Run to verify it fails.** `… npx jest __tests__/formPrimitives.test.js` → FAIL.
- [ ] **Step 3: Implement** the three components (and the `ListRow` pass-throughs if needed).
- [ ] **Step 4: Run to verify it passes** (plus `__tests__/ListRow.test.js` if `ListRow` changed). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/forms/StepHeader.js src/components/forms/CountChip.js src/components/forms/SelectableRow.js __tests__/formPrimitives.test.js
# plus src/components/common/ListRow.js __tests__/ListRow.test.js if changed
git commit -m "feat(forms): StepHeader, CountChip and SelectableRow for Bold Red forms"
```

---

### Task 5: Step 2 — `ChildSelector` on the Bold Red roster

**Files:**
- Create: `src/utils/sessionFormLayout.js` (`rosterRowHeight` now; Task 12 adds `stepScrollOffset`)
- Modify: `src/components/children/ChildSelector.js`
- Test: `__tests__/sessionFormLayout.test.js` (new), `__tests__/LiteracySessionForm.test.js`, `__tests__/ChildSelector.renderCount.test.js`, `__tests__/domainTextInputAudit.test.js`

**Interfaces:**
- Consumes: `StepHeader`, `CountChip`, `SelectableRow` (Task 4); PR 1 `SegmentedControl`, `SearchField`, `InlineNote`, `IconTile`; PR 2 `Avatar`, `getInitials`.
- Produces:
  - `rosterRowHeight(fontScale: number) => number` = `Math.max(64, Math.ceil(20 + 2 + (22 + 18) * fontScale))` (64 at 1.0, 74 at 1.3).
  - `ChildSelector` keeps every existing prop and adds: `listRef` (forwarded to the `FlatList`), `childrenStepRef` (forwarded to the step-2 `StepHeader`), `onScroll` (passed to the `FlatList` with `scrollEventThrottle={16}`), and `onMetrics(metrics)`, called whenever one changes, with `{ headerHeight, childrenSectionY, bodyHeight }`: `headerHeight` from the list-header wrapper's `onLayout`; `childrenSectionY` = the step-2 section's `onLayout` y inside that wrapper; `bodyHeight` = `data.length * rowHeight`, or the empty row's measured height when `data` is empty. Task 12 consumes `onMetrics`; until then the form does not pass it.

- [ ] **Step 1: Write the failing tests.**
  - `sessionFormLayout.test.js`: `rosterRowHeight(1)` → 64, `(1.3)` → 74, `(0.85)` → 64, `(2)` → 102.
  - In `LiteracySessionForm.test.js`, update the scaffold and group tests to the new copy and roles (spec test 11):
    - step header "Step 2: Select children" (role header); count chip "0 selected", then "1 selected" after a tap;
    - tabs: `getByRole('tab', { name: 'Children' })` has `accessibilityState.selected === true`, Groups `false` (replaces "Show children"/"Show groups");
    - child row: `getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' })` with `checked: false`, then `checked: true` after a press; a child with no class reads "…, No class";
    - groups: after pressing the Groups tab, `getByRole('radio', { name: 'Group 4, 2 children' })`; the hint "Choosing a group replaces your selection." shows only in Groups mode; the placeholder is "Search groups…"; pressing the group selects both children (chip "2 selected", radio `checked: true`); pressing it again clears the selection (chip "0 selected");
    - after Submit with no child: the note "Select at least one child" renders as an alert **above** the segmented control (assert the note's index in the header precedes the tab's, e.g. by `screen.toJSON()` order or by checking it is a child of the step-2 section, before the `SegmentedControl`), and the step header reads "Step 2: Select children, needs attention";
    - empty states: a no-match search shows "No children match your search"; Groups with no groups shows "No groups available".
  - Row height at 1.3: mock `react-native/Libraries/Utilities/useWindowDimensions` (default export) to return `{ width: 390, height: 844, scale: 3, fontScale: 1.3 }`, render the form, and assert `UNSAFE_getByType(FlatList).props.getItemLayout(null, 2)` equals `{ length: 74, offset: 148, index: 2 }`. (If that module path is wrong for RN 0.81, mock `useWindowDimensions` on the `react-native` export with `jest.spyOn`.)
  - `ChildSelector.renderCount.test.js`: instrument `SelectableRow` instead of Paper `List.Item`:

```js
jest.mock('../src/components/forms/SelectableRow', () => {
  const React = require('react');
  const Actual = jest.requireActual('../src/components/forms/SelectableRow').default;
  const spy = jest.fn();
  const Instrumented = React.memo((props) => { spy(props.title); return <Actual {...props} />; });
  return { __esModule: true, default: Instrumented, selectableRowRenderSpy: spy };
});
```

    and keep its three tests (one toggle re-renders exactly one row; typing a comment re-renders none; the focused comment input stays mounted inside the `FlatList`). Match `SelectableRow`'s actual export style.
  - `domainTextInputAudit.test.js`: replace the `ChildSelector` `<Searchbar …>` assertions with `/<SearchField[\s\S]*placeholder=\{searchPlaceholder\}/` and the exact line `searchPlaceholder={selectionMode === 'groups' ? 'Search groups…' : 'Search children…'}`, and assert `src/components/common/SearchField.js` contains `{...NO_TEXT_SUGGESTIONS}` (PR 1 may already).
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/sessionFormLayout.test.js __tests__/LiteracySessionForm.test.js __tests__/ChildSelector.renderCount.test.js __tests__/domainTextInputAudit.test.js` → FAIL.
- [ ] **Step 3: Implement** (part 3 "Step 2" and "Vertical rhythm"):
  - List header after `formHeader`: a section `View` (its `onLayout` gives `childrenSectionY`) holding: `StepHeader step={2} label="Select children"` (status `error` when `selectionError`, else `done` when `selectedChildren.length > 0`, else `todo`; `right={<CountChip label={`${n} selected`} active={n > 0} />}`; header row min height 32); 12; `InlineNote tone="error"` with `selectionError` then 24 (only when set); `SegmentedControl role="tab" accessibilityLabel="Show"` with options Children / Groups bound to `selectionMode` and `handleSelectionModeChange` (use PR 1's option shape); Groups mode: 8, hint "Choosing a group replaces your selection." (`textCaption` `textSecondary`), 12; Children mode: 12; `SearchField` with `placeholder={searchPlaceholder}` and `accessibilityLabel={searchPlaceholder}`; 22 below.
  - Rows: `SelectableRow` with `height={rowHeight}` where `rowHeight = rosterRowHeight(useWindowDimensions().fontScale)`, `position` from `index` and `data.length`. Child: `variant="checkbox"`, `lead={<Avatar label={getInitials(first, last)} size={40} />}`, title "{first} {last}", subtitle class name or "No class", label "{first} {last}, {class}". Group: `variant="radio"`, `lead={<IconTile icon="people-outline" tone="red" />}`, subtitle "{n} child"/"{n} children", label "{name}, {n} child|children". Selection rules unchanged. Keep memoised rows, ref-based `onToggle`, windowing constants and `extraData`. The `onToggle`/`onSelect` callbacks and `rowHeight` must stay referentially stable across a toggle so only the changed row re-renders.
  - `getItemLayout` uses `rowHeight`. Delete `ROSTER_ROW_HEIGHT`, `SelectionPill`, `PAPER_CARD_RADIUS`, `cardTop`/`cardBottom`, the Paper `List`/`Searchbar` imports and `ChildSelectorFooter`'s error slot (the footer now renders `formFooter` only).
  - Empty states: one `View` drawn like an `only` row (white, 1px `tints.rule` border, radius 18, padding 20/16) with today's four strings in `textCaption` `textSecondary`, left-aligned; its `onLayout` height feeds `bodyHeight`.
  - The roster's group container role is **not** set (a `FlatList` cannot wrap only its rows); each row carries `radio` + `checked`. Note this in the commit body.
- [ ] **Step 4: Run to verify they pass.** Same command → PASS. Then the full unit suite: `… npx jest` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionFormLayout.js src/components/children/ChildSelector.js __tests__/sessionFormLayout.test.js __tests__/LiteracySessionForm.test.js __tests__/ChildSelector.renderCount.test.js __tests__/domainTextInputAudit.test.js
# plus __tests__/designSystemGuard.test.js if a ratchet line changed
git commit -m "feat(record): Bold Red roster — step header, count chip, tabs, search, checkbox and radio rows"
```

---

### Task 6: Step 3 — `LetterToggleTile` and `LetterToggleGrid`

**Files:**
- Create: `src/components/sessions/LetterToggleTile.js`, `src/components/sessions/LetterToggleGrid.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (letters section)
- Delete: `src/components/session/LetterGrid.js` (its only importer is the form)
- Test: `__tests__/LetterToggleGrid.test.js` (new), `__tests__/LiteracySessionForm.test.js`

**Interfaces:**
- Produces:
  - `letterTileSize(contentWidth: number) => number` = `Math.min(56, Math.floor((contentWidth - 5 * 8) / 6))` (exported from `LetterToggleGrid.js`): 50 at 342, 45 at 312, 53 at 363.
  - `LetterToggleTile` = `React.memo(({ letter, tone, size, onPress, disabled, accessibilityLabel, accessibilityState }))`. `tone`: `'rest' | 'selected' | 'taught' | 'taughtNew' | 'locked'`. Radius 14 (`borderRadius.md`), 1.5 border, `size`×`size`. Colours: `rest` = `letterStateColors.default`; `selected` = `colors.text` fill and border, `colors.onDark` letter; `taught` and `taughtNew` = `letterStateColors.taught`; `locked` = `letterStateColors.assessment`. Marks: `taughtNew` an 8 `colors.onDark` dot, top-right inset 6/6; `locked` Ionicons `lock-closed-outline` 12 `colors.successText`, top-right inset 5/5. Letter: `letter.toLowerCase()`, `typeRoles.textLetter`, `maxFontSizeMultiplier={1.2}`. Pressed: `colors.border` fill (for `rest`/`selected`) and scale 0.96 via `Animated.timing` (90ms in, 140ms out, `useNativeDriver: true`; use `src/constants/motion.js` names if PR 1 defines these durations); no scale when `useMotion().reduceMotion`. `accessibilityRole="button"`.
  - `LetterToggleGrid({ letters, tileFor, onPressLetter })`. `tileFor(letter) => { tone, disabled, accessibilityLabel, accessibilityState }`. Six columns, gap 8, row-major, `flexWrap`. It measures its own width with `onLayout`; before the first layout it uses `useWindowDimensions().width - 48`. Tile size `letterTileSize(width)`.
  - Until Task 7, `letterStateColors` keeps today's shape; `LetterToggleTile` reads `bg`/`text`/`border` from it (Task 7 changes the values, not the reads).

- [ ] **Step 1: Write the failing tests.**
  - `LetterToggleGrid.test.js`: `letterTileSize` at 342/312/363/304 → 50/45/53/44; the grid renders 26 tiles for `LETTER_ORDER` in row-major order (first six visible texts `a e i o u m`); every tile text is lowercase; after `fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 312, height: 0, x: 0, y: 0 } } })` a tile's flattened style has `width` 45; each letter `Text` has `maxFontSizeMultiplier` 1.2; pressing a tile calls `onPressLetter('m')`; a `disabled` tile ignores presses; under `motion={{ motionLevel: 'still', reduceMotion: true, tier: 'static' }}` a `pressIn` does not call `Animated.timing` (spy), and under `full` it does.
  - `LiteracySessionForm.test.js`: "Step 3: Letters focused on" header with right text "Tap to select" (the helper "Tap letters to select" is gone); `getByLabelText('M, not selected')` has `accessibilityState.selected === false` and contains the text "m"; after a press `getByLabelText('M, selected')` has `selected: true` and its flattened background is `colors.text`; after a failed Submit the note "Select at least one letter" sits between the step-3 header and the grid and the header reads "…, needs attention"; the step turns "…, complete" once a letter is chosen.
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/LetterToggleGrid.test.js __tests__/LiteracySessionForm.test.js` → FAIL.
- [ ] **Step 3: Implement** the tile and grid, then replace the letters `Card` in `FormFooter` with a section `View`: `StepHeader step={3} label="Letters focused on" right="Tap to select"` (status from `validationErrors.letters` / `selectedLetters.length`), 12, optional `InlineNote` + 24, `LetterToggleGrid letters={LETTER_ORDER}` with `tileFor` returning `tone: selected ? 'selected' : 'rest'`, label `${letter.toUpperCase()}, ${selected ? 'selected' : 'not selected'}`, state `{ selected }`. `onPressLetter = handleToggleLetter`. Delete `LetterGrid.js`.
- [ ] **Step 4: Run to verify they pass**, plus `ChildSelector.renderCount.test.js` and `npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js` (they press `'A, not selected'`, which still exists). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/LetterToggleTile.js src/components/sessions/LetterToggleGrid.js src/screens/sessions/LiteracySessionForm.js __tests__/LetterToggleGrid.test.js __tests__/LiteracySessionForm.test.js
git rm src/components/session/LetterGrid.js
git commit -m "feat(record): six-column lowercase letter tiles (LetterToggleGrid) for letters focused on"
```

---

### Task 7: One mastery colour scheme — `letterStateColors`, the tracker sheet and `LetterMasteryPanel` (overview C15)

**Files:**
- Modify: `src/constants/letterStateColors.js`
- Modify: `src/components/session/LetterTrackerBottomSheet.js`
- Modify: `src/components/assessment/LetterMasteryPanel.js`
- Test: `__tests__/letterStateColors.test.js`, `__tests__/LetterTrackerBottomSheet.test.js`, `__tests__/LetterTrackerBottomSheet.plan5.test.js`, `__tests__/LetterMasteryPanel.test.js`, `__tests__/LetterTrackerScreen.plan5.test.js` and `__tests__/ChildResultsScreen.test.js` (run; edit only if a label they assert changes)

**Interfaces:**
- Consumes: `LetterToggleGrid`, `LetterToggleTile` tones (Task 6).
- Produces: `letterStateColors` keeps its three keys with new values:

```js
export const letterStateColors = {
  taught: { bg: colors.successText, border: colors.successText, text: colors.onDark },
  assessment: { bg: colors.successBg, border: colors.successBorder, text: colors.successText },
  default: { bg: colors.surface, border: tints.control, text: colors.text },
};
```

- Tracker tile table (part 3 "Letter tracker sheet"; labels lowercase as today):

| State | `tone` | Label | `accessibilityState` |
|---|---|---|---|
| assessment-mastered | `locked` | "{l}, mastered from assessment, locked" | `{ disabled: true }` |
| `pendingChanges[l] === true` | `taughtNew` | "{l}, taught, added this session" | `{ selected: true }` |
| stored taught, not pending-removed | `taught` | "{l}, taught by coach" | `{ selected: true }` |
| otherwise | `rest` | "{l}, not mastered" | `{ selected: false }` |

- [ ] **Step 1: Write the failing tests.**
  - `letterStateColors.test.js`: pin the three objects above with `toEqual`; add the contrast pair `colors.onDark` on `colors.successText` ≥ 4.5 (reuse PR 1's ratio helper from `__tests__/contrast.test.js` if it exports one; otherwise compute inline with the WCAG formula, full precision).
  - `LetterTrackerBottomSheet.test.js` (spec test 13), with `getLetterMastery` resolving taught `a` and `s`, `pendingChanges={{ e: true, s: false }}`: title "Letter tracker"; subtitle text "Amahle Dlamini · 2/26 letters" (`countMastered` counts `a` and the pending `e`; `s` is pending removal), with "2/26" in a nested `Text` whose style uses `fontFamilies.textHeavy`; labels "a, taught by coach", "e, taught, added this session", "s, not mastered"; legend texts "Taught", "New this session", "Not yet", "Assessment (locked)"; a "Done" button calls `onDismiss`; while `getLetterMastery` is pending the legend is absent and an `ActivityIndicator` with `color === colors.text` renders; tile texts are lowercase. Keep the existing backdrop test.
  - `LetterTrackerBottomSheet.plan5.test.js`: the expected label becomes `${firstEgraLetter}, mastered from assessment, locked`.
  - `LetterMasteryPanel.test.js`: existing tests unchanged (labels "a, not mastered" / "a, taught by coach" stay); add: tile texts are lowercase; a taught tile's flattened background is `colors.successText`; an assessment-mastered letter's label is "{l}, mastered from assessment, locked" and it ignores presses; the legend reads "Taught", "Not yet", "Assessment (locked)".
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/letterStateColors.test.js __tests__/LetterTrackerBottomSheet.test.js __tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/LetterMasteryPanel.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - `letterStateColors.js` as above (import `tints` from `./colors`).
  - Tracker sheet: `title="Letter tracker"`; `subtitle` = a node `<>{childName} · <Text style={strong}>{n}/26</Text> letters</>` with `strong` = `{ fontFamily: fontFamilies.textHeavy, color: colors.text }` (if PR 1's `BottomSheet` only accepts a string subtitle, render this line as the first child of `headerExtras` instead and pass no `subtitle`). Legend (hidden while loading): 14 below the subtitle, two columns (`flexWrap`, each item `flexBasis: '45%'`, row gap 8, column gap 16), 16×16 radius 5 swatches: Taught (`successText` fill), New this session (`successText` fill + 6 `onDark` centred dot), Not yet (`surface` + 1.5 `tints.control`), Assessment (locked) (`successBg` + 1.5 `successBorder`); text `textCaption` `textSecondary`. Grid: `LetterToggleGrid letters={pedagogicalOrder}` with `tileFor` from the table; `onPressLetter = handleCellTap` (unchanged logic). Loading spinner `colors.text`. `footer={<BrandButton variant="primary" size="lg" label="Done" onPress={onDismiss} />}`. Delete `GRID_COLUMNS`, the local tile maths and the old styles.
  - Panel: render the grid through `LetterToggleGrid` (it self-measures; drop `panelWidth`, `GRID_COLUMNS`, `tileSize`), tones `locked` / `taught` / `rest`, `disabled` when locked or `updatingLetter`, labels as today plus ", locked" on the assessment state. Legend: the three items above (no "New this session"; the panel saves immediately). Spinner `colors.text`. Keep the meta row and mutation error as they are, apart from token fixes the guard requires.
- [ ] **Step 4: Run to verify they pass**, plus `… npx jest __tests__/LetterTrackerScreen.plan5.test.js __tests__/ChildResultsScreen.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/constants/letterStateColors.js src/components/session/LetterTrackerBottomSheet.js src/components/assessment/LetterMasteryPanel.js __tests__/letterStateColors.test.js __tests__/LetterTrackerBottomSheet.test.js __tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/LetterMasteryPanel.test.js
git commit -m "feat(letters): one green mastery scheme with a locked glyph on the tracker sheet and LetterMasteryPanel"
```

---

### Task 8: Step 1 — date field, `MonthCalendar` and the calendar sheet

**Files:**
- Create: `src/components/common/MonthCalendar.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (date state, `FormHeader`, delete `InlineCalendar` and the date helpers)
- Test: `__tests__/MonthCalendar.test.js` (new), `__tests__/LiteracySessionForm.test.js`

**Interfaces:**
- Consumes: `formatSessionDate`, `parseDateKey`, `dateKeyFromParts`, `MONTH_NAMES`, `WEEKDAY_SHORT` (Task 2); PR 1 `IconCircleButton`, `SelectField`, `BottomSheet`, `BrandButton`.
- Produces:
  - `MonthCalendar({ selectedKey, todayKey, onSelect })`. Keys only. View month starts at `selectedKey`'s month (the sheet unmounts it on close, so it reopens there). Month row: `IconCircleButton icon="chevron-back" accessibilityLabel="Previous month"`, title `${MONTH_NAMES[m]} ${y}` in `displayHeading` (`accessibilityRole="header"`), `IconCircleButton icon="chevron-forward" accessibilityLabel="Next month" disabled={!canGoNext}` where `canGoNext` is true only while the view month is before `todayKey`'s month. Weekday row `WEEKDAY_SHORT` in `textLabel` `textSecondary`. Day grid: 7 equal flex columns, no column gap, 4 row gap; each cell centres a 44×44 circle. Day number `textDay`, `maxFontSizeMultiplier={1.2}`: normal `colors.text`; selected `colors.text` disc, `colors.onDark`, `fontFamilies.textHeavy`; today (not selected) 1.5 `colors.text` ring, `fontFamilies.textHeavy`; future (`key > todayKey`) `colors.disabled`, `fontFamilies.textMedium`, disabled. Day label `formatSessionDate(key, 'calendarLabel')` + (future ? ', unavailable' : ''); `accessibilityRole="button"`, `accessibilityState={{ selected, disabled: future }}`. Tapping a non-future day calls `onSelect(key)`. Days-in-month and first weekday come from UTC dates built from the parts (never the device zone).
  - The form holds `sessionDateKey` (string) instead of a `Date`: initial `toLocalDateString(new Date())`; saved as `session_date: sessionDateKey` (the same string `formatDateForStorage(getProgrammeCalendarDate())` produced); dirty when it differs from the initial key. `getProgrammeCalendarDate`, `formatDateForStorage`, `formatDateForDisplay`, `getDaysInMonth`, `getFirstDayOfMonth`, `MONTH_NAMES`, `DAY_HEADERS`, `InlineCalendar`, `calStyles` and the Paper `Menu`/`IconButton` imports are deleted.

- [ ] **Step 1: Write the failing tests.**
  - `MonthCalendar.test.js` with `todayKey="2026-10-15"`: opens on the selected month ("October 2026"); "Thu 15 October 2026" exists (today), "Fri 16 October 2026, unavailable" has `disabled: true` and pressing it does not call `onSelect`; "Next month" has `disabled: true`; "Previous month" shows "September 2026", then "Next month" is enabled and returns to October; `selectedKey="2026-01-10"` then "Previous month" shows "December 2025" (year boundary); pressing "Mon 12 October 2026" calls `onSelect('2026-10-12')`; October 2026 starts on a Thursday (the first labelled cell is preceded by four empty cells: assert the grid's first row has 4 non-button cells); the selected day has `selected: true`; under `process.env.TZ = 'Pacific/Auckland'` the same assertions hold (loop the zone in one test).
  - `LiteracySessionForm.test.js` (spec test 10), with fake timers at `2026-10-15T08:00:00Z`: "Step 1: Session date, complete" header; the field's label is "Session date, Today · Thu 15 Oct. Change date"; pressing it opens a sheet titled "Session date"; pressing "Mon 12 October 2026" closes the sheet and the field reads "Mon 12 Oct 2026"; reopening and pressing "Cancel" changes nothing; picking a past day makes the form dirty (goBack shows the discard sheet). Keep "attributes a new session to the South African programme day outside South Africa" (`session_date` `'2026-07-23'`).
  - Auckland (Review Focus 2): `process.env.TZ = 'Pacific/Auckland'`, system time `2026-10-18T10:00:00Z`: the field reads "Today · Sun 18 Oct"; open the calendar, "Sun 18 October 2026" has `selected: true`; press "Fri 16 October 2026"; the field reads "Fri 16 Oct 2026"; reopen and "Fri 16 October 2026" is selected; submit a valid form and `persistLiteracySession` receives `session_date: '2026-10-16'`.
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/MonthCalendar.test.js __tests__/LiteracySessionForm.test.js` → FAIL.
- [ ] **Step 3: Implement.** `FormHeader` becomes a section: `StepHeader step={1} label="Session date" status="done"`, 12, `SelectField label="Day" icon="calendar-outline" value={label} accessibilityLabel={`Session date, ${label}. Change date`} onPress={open}` with `label = sessionDateKey === todayKey ? formatSessionDate(sessionDateKey, 'fieldToday') : formatSessionDate(sessionDateKey, 'field')` and `todayKey = toLocalDateString(new Date())` read at render. The sheet: `BottomSheet visible title="Session date" dismissLabel="Dismiss session date picker" keyboardAvoiding={false} footer={<BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={close} />}` wrapping `MonthCalendar`; `onSelect` sets the key and closes.
- [ ] **Step 4: Run to verify they pass**, plus `… npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/common/MonthCalendar.js src/screens/sessions/LiteracySessionForm.js __tests__/MonthCalendar.test.js __tests__/LiteracySessionForm.test.js
git commit -m "feat(record): session date field and calendar sheet on calendar keys (MonthCalendar)"
```

---

### Task 9: Steps 4–6 — level field and sheets, comments, `ChildProgressBlock`

**Files:**
- Create: `src/components/sessions/ChildProgressBlock.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (`FormFooter` steps 4–6, both `SelectSheet`s)
- Test: `__tests__/ChildProgressBlock.test.js` (new), `__tests__/LiteracySessionForm.test.js`, `__tests__/ChildSelector.renderCount.test.js`, `__tests__/domainTextInputAudit.test.js`, `__tests__/LiteracySessionForm.submit.test.js` (placeholder only, if it uses it)

**Interfaces:**
- Consumes: PR 1 `SelectField`, `TextField`, `StatusBadge`, `InlineNote`; PR 2 `Avatar`, `getInitials`.
- Produces: `ChildProgressBlock({ child, className, readingLevel, trackerChangeCount, onOpenLevel, onOpenTracker })`. White, 1px `tints.rule`, radius 18, `overflow: 'hidden'`. Head row min 64, padding 10/16, gap 12: `Avatar` 40, name "{first} {last}" `textRowTitle` (one line, ellipsis), class `textCaption` `textSecondary` (or "No class"), 1px `colors.border` bottom rule. Two pressable rows (`accessibilityRole="button"`), min height 52, padding 0/12/0/16, gap 12, inset `colors.border` divider from x 16 between them:
  - "Reading level" (`textBodySemi`, flex 1, wraps): value `readingLevel` in `textBodyStrong` `colors.text`, or "Not set" in `textBody` `textSecondary` (value does not wrap); then Ionicons `chevron-down` 20 `textSecondary`. Label "{first} {last}, reading level, {value}". Press → `onOpenLevel(child.id)`.
  - "Letter tracker": value "Update" (`textBodyStrong` `colors.text`) when `trackerChangeCount === 0`, else `<StatusBadge tone="successStrong" label={`+${n} new`} />`; then `chevron-down`. Label "{first} {last}, letter tracker, Update" or "…, {n} new". Press → `onOpenTracker(child)`.

- [ ] **Step 1: Write the failing tests.**
  - `ChildProgressBlock.test.js`: the two row labels for "Not set"/"Update" and for "Word Reading"/"+2 new" (`getByText('+2 new')`); presses call the right callback with the right argument; name and class render; the avatar renders "AD".
  - `LiteracySessionForm.test.js` (spec test 14 and the copy changes):
    - "Step 4: Session reading level"; the field shows label "Focused on today" and placeholder "Select a level"; pressing it opens a sheet titled "Session reading level" with subtitle "What level did you focus on today?" and a "Cancel" action that only dismisses (level stays unset, header still to-do); choosing a level sets it, closes the sheet, clears the error and marks "…, complete"; after a failed Submit the note "Select a reading level" sits between the step-4 header and the field;
    - "Step 5: Comments" with right text "Optional"; the comments input has placeholder "Add session notes…" and accessibility label "Comments, optional"; steps 5 and 6 never read "…, complete" even when filled;
    - step 6 is absent with no child selected; after selecting two children it shows "Step 6: Update child progress", the description "Record each child’s current level and update the letters they have mastered.", one block per child in selection order, and the old copy ("Reading Levels", "Letter Tracker", "Update Child Progress (Optional)") is gone;
    - the existing "sets a reading level for the child whose picker was opened" test now opens the picker by label `getByLabelText('Buhle Moyo, reading level, Not set')`, asserts the sheet title "Reading level", the subtitle "Buhle Moyo", and "Cancel"; the saved `child_reading_levels` is unchanged (`{ 'child-2': READING_LEVELS[1] }`);
    - the pre-fill test still shows `READING_LEVELS[4]` and no "Not set".
  - Change `COMMENTS_PLACEHOLDER` to `'Add session notes…'` in every test file that uses it, including `ChildSelector.renderCount.test.js`.
  - `domainTextInputAudit.test.js`: the comments assertion becomes `/placeholder="Add session notes…"[\s\S]*\{\.\.\.NO_TEXT_SUGGESTIONS\}/` against `LiteracySessionForm.js`.
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/ChildProgressBlock.test.js __tests__/LiteracySessionForm.test.js __tests__/ChildSelector.renderCount.test.js __tests__/domainTextInputAudit.test.js` → FAIL.
- [ ] **Step 3: Implement** (part 3 "Step 4/5/6" and "Sheets"):
  - Step 4 section: `StepHeader step={4} label="Session reading level"` (status from `validationErrors.readingLevel` / `sessionReadingLevel`), 12, optional `InlineNote` + 24, `SelectField label="Focused on today" value={sessionReadingLevel} placeholder="Select a level" error={Boolean(validationErrors.readingLevel)} onPress={open}` with no icon. The field shows the red 2px border and red label but no second note; if PR 1's `SelectField` renders its own note for a string `error`, pass the boolean so it shows the state only (add that boolean form to `SelectField` if it lacks one).
  - Step 5 section: `StepHeader step={5} label="Comments" right="Optional"`, 12, `TextField multiline label="Session notes" placeholder="Add session notes…" accessibilityLabel="Comments, optional" value={comments} onChangeText={setComments} {...NO_TEXT_SUGGESTIONS}`.
  - Step 6 (only when children are selected): `StepHeader step={6} label="Update child progress" right="Optional"`, 2, the description (`textCaption` `textSecondary`), 12, `ChildProgressBlock` per selected child with 12 between, `className` from `classes`.
  - Session level `SelectSheet`: `title="Session reading level"`, `subtitle="What level did you focus on today?"`, `cancelLabel="Cancel"`. Child level `SelectSheet`: `title="Reading level"`, `subtitle` = the opened child's "{first} {last}" (look it up in `selectedChildren`), `cancelLabel="Cancel"`. Selection behaviour unchanged.
  - Section rhythm: 24 between sections. Delete every remaining Paper `Card`, `TextInput`, the divider and their styles from `FormFooter`. Submit stays in the list footer until Task 11.
- [ ] **Step 4: Run to verify they pass**, plus the integration submit test. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/ChildProgressBlock.js src/screens/sessions/LiteracySessionForm.js __tests__/ChildProgressBlock.test.js __tests__/LiteracySessionForm.test.js __tests__/ChildSelector.renderCount.test.js __tests__/domainTextInputAudit.test.js
git commit -m "feat(record): Bold Red level field and sheets, comments, and per-child progress blocks"
```

---

### Task 10: Screen frame — navigator header, hairline, column, `SessionFormScreen` states

**Files:**
- Modify: `src/navigation/AppNavigator.js` (`SessionForm` options, today `:245-251`)
- Modify: `src/screens/sessions/SessionFormScreen.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (outer layout, `onScroll`)
- Test: `__tests__/AppNavigator.headers.test.js` (as PR 1 left it), `__tests__/SessionFormScreen.test.js` (new), `__tests__/LiteracySessionForm.test.js`

**Interfaces:**
- Consumes: PR 1 `ScreenHeader` options (`title`, `headerLeftIcon`, `headerScrolled`) and `useHeaderHairline()` → `onScroll`.
- Produces: `SessionForm` options exactly `{ title: 'New session', headerLeftIcon: 'close' }` (overview C1; replaces part 3's `headerShown: false`). The header's Close calls `navigation.goBack()`, so the `usePreventRemove` guard runs.

- [ ] **Step 1: Write the failing tests.**
  - `AppNavigator.headers.test.js`: the `SessionForm` options equal `{ title: 'New session', headerLeftIcon: 'close' }` (follow the harness PR 1 left in that file for reading route options).
  - `SessionFormScreen.test.js`: with `profile: null`, renders "Loading your profile..." (copy unchanged) and a "Retry" button that calls `refreshProfile`; with a non-literacy job title renders "Session forms for Tutor are coming soon."; neither state renders an in-body "New Session" or "New session" title (the navigator header carries it); with the literacy coach code it renders the form (mock `LiteracySessionForm` to a stub).
  - `LiteracySessionForm.test.js`: scrolling the list (`fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 1 }, contentSize: …, layoutMeasurement: … } })`) sets the route option `headerScrolled` to `true` and back to `false` at `y: 0` (read it through `screen.navigationRef.getCurrentOptions()`); the list's `contentContainerStyle` flattens to `paddingHorizontal: 24, paddingTop: 28, paddingBottom: 34`; the outer view's background is `colors.background`.
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/AppNavigator.headers.test.js __tests__/SessionFormScreen.test.js __tests__/LiteracySessionForm.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - `AppNavigator.js`: the options above (drop `headerBackTitle`).
  - `SessionFormScreen.js`: delete the two in-body titles; centred `textBody` `textSecondary` message; "Retry" as `BrandButton variant="tertiary" label="Retry"`; background `colors.background`.
  - The form: outer `View` `flex: 1`, `colors.background`, a column (the footer joins it in Task 11). `const onScroll = useHeaderHairline();` passed to `ChildSelector`. `contentContainerStyle` padding 24 sides, 28 top, 34 bottom. On iOS pass `automaticallyAdjustKeyboardInsets` to the `FlatList` (through `ChildSelector`, which sets it on its `FlatList`) so a focused Comments field can scroll above the keyboard (part 3 "Keyboard"; Android is decided on device, Task 14).
- [ ] **Step 4: Run to verify they pass**, then the full unit suite. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.js src/screens/sessions/SessionFormScreen.js src/screens/sessions/LiteracySessionForm.js src/components/children/ChildSelector.js __tests__/AppNavigator.headers.test.js __tests__/SessionFormScreen.test.js __tests__/LiteracySessionForm.test.js
git commit -m "feat(record): New session header with Close, scroll hairline and canvas column"
```

---

### Task 11: `StickyActionFooter`, Submit, saving and the inline save failure

**Files:**
- Create: `src/components/forms/StickyActionFooter.js`
- Modify: `src/screens/sessions/LiteracySessionForm.js` (Submit out of the list; `handleSubmit` catch; delete the Snackbar)
- Test: `__tests__/StickyActionFooter.test.js` (new), `__tests__/LiteracySessionForm.test.js`, `__tests__/LiteracySessionForm.submit.test.js`

**Interfaces:**
- Consumes: PR 1 `useKeyboardHeight`, `useToastObstruction`, `BrandButton`, `InlineNote`.
- Produces: `StickyActionFooter({ children, surface = 'always', hideOnKeyboard = false })`. `surface="always"`: `colors.surface`, 1px `colors.border` top border, padding 11 top / 24 sides / `max(insets.bottom, 16)` bottom, children stacked. Returns `null` while `hideOnKeyboard && keyboardHeight > 0`. While rendered it registers its `onLayout` height with `useToastObstruction` and unregisters on hide/unmount (use PR 1's signature). Only `'always'` is built here; PR 4 adds `'onOverflow'` (unknown values throw in development). Not an overlay: the form renders it as a sibling after the list.
- Form state: `saveError: string | null`.

- [ ] **Step 1: Write the failing tests.**
  - `StickyActionFooter.test.js`: renders children; its flattened style has `borderTopWidth` 1, `borderTopColor` `colors.border`, `paddingBottom` 16 with a zero inset and 34 with a 34 inset (mock `useSafeAreaInsets`); with `hideOnKeyboard`, emitting a keyboard show unmounts the children and a hide restores them (emit `keyboardWillShow`/`keyboardDidShow` with `{ endCoordinates: { height: 300 } }` through `DeviceEventEmitter` inside `act`, then the matching hide events; if PR 1's `useKeyboardHeight` test drives the keyboard differently, copy that approach); it registers a height with the toast obstruction registry (render inside PR 1's `ToastProvider` and assert through its public test seam, or spy on `useToastObstruction` if PR 1 offers no seam).
  - `LiteracySessionForm.test.js`:
    - "Submit session" (was "Submit Session") is a button rendered outside the `FlatList` (`hasAncestorOfType(button, FlatList) === false`); update `submitValidForm` and every other press of the old label in all three form test files;
    - saving (spec test 7): with `persistLiteracySession` pending, the button shows "Saving…" and its `accessibilityState` includes `{ busy: true, disabled: true }`; a second press does not call persistence again;
    - keyboard (spec test 9): emitting a keyboard show removes "Submit session"; hiding restores it;
    - no `Snackbar` is rendered or imported (`expect(source).not.toMatch(/Snackbar/)` on the form source).
  - `LiteracySessionForm.submit.test.js` (spec test 6, real SQLite; Review Focus 4): extend "a failed save rolls back and retry…":
    - after the injected failure, `findByRole('alert')` has the text "Failed to save session. Please try again.", it is outside the `FlatList`, and with `Platform.OS` replaced by `'ios'` (`jest.replaceProperty`) `AccessibilityInfo.announceForAccessibility` was called once with that text (if PR 1's `InlineNote` announces on mount, this is its call; otherwise the form makes it);
    - pressing "Submit session" removes the note at once: assert `queryByRole('alert')` is null synchronously after the `fireEvent.press`, before awaiting the retry;
    - the retry persists exactly one session with the original id, attendees and outbox as today, and `SessionComplete` mounts once;
    - new test "a second failure shows and announces the note again": inject two failures; after the second, the note is present and `announceForAccessibility` has two calls;
    - new test "a validation failure after a save failure shows only the inline errors": inject one failure, then clear the letter (press "A, selected"), press Submit: the save-failure note is gone and "Select at least one letter" shows;
    - the form is still guarded after a failure: `navigationRef.goBack()` shows "Discard this session?".
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/StickyActionFooter.test.js __tests__/LiteracySessionForm.test.js` and `… npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - `StickyActionFooter` as in Interfaces.
  - The form: render `<StickyActionFooter hideOnKeyboard>` after `ChildSelector`, holding (top to bottom) the save-failure `InlineNote tone="error" accessibilityLiveRegion="assertive"` with 8 below it (only when `saveError`), then `BrandButton variant="primary" size="lg" label="Submit session" loading={submitting} loadingLabel="Saving…" onPress={handleSubmit}`. Task 12 adds the summary above them. If PR 1's `BrandButton` reports `disabled: false` while loading, make it report `disabled: disabled || loading` in `BrandButton.js` (with its test) so every loading button is announced as unavailable.
  - `handleSubmit`: after the `submittingRef` guard, `setSaveError(null)` first, then validation as today. In the `catch`: keep `submittingRef.current = false` and the `console.error`, then `setSaveError('Failed to save session. Please try again.')`. Delete `snackbarMessage`, `snackbarVisible`, `showSnackbar`, the `Snackbar` element and import. Editing fields does not clear `saveError`.
- [ ] **Step 4: Run to verify they pass.** Same commands → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/forms/StickyActionFooter.js src/screens/sessions/LiteracySessionForm.js __tests__/StickyActionFooter.test.js __tests__/LiteracySessionForm.test.js __tests__/LiteracySessionForm.submit.test.js __tests__/ChildSelector.renderCount.test.js
# plus src/components/common/BrandButton.js __tests__/BrandButton.test.js if changed
git commit -m "feat(record): sticky Submit footer with Saving state; save failure shown inline instead of a Snackbar"
```

---

### Task 12: `RequirementSummary` and jump-to-step

**Files:**
- Create: `src/components/forms/RequirementSummary.js`
- Modify: `src/utils/sessionFormLayout.js` (add `stepScrollOffset`)
- Modify: `src/screens/sessions/LiteracySessionForm.js` (summary items, step refs, metrics)
- Test: `__tests__/RequirementSummary.test.js` (new), `__tests__/sessionFormLayout.test.js`, `__tests__/LiteracySessionForm.test.js`

**Interfaces:**
- Consumes: `validateLiteracySession` (Task 1); `ChildSelector`'s `listRef`, `childrenStepRef`, `onMetrics` (Task 5); `StepHeader` refs and `onLayout` (Task 4).
- Produces:
  - `RequirementSummary({ items })`, `items = [{ key, step, done, doneText, missingText, onPress }]`. A row: `flexDirection: 'row'`, `flexWrap: 'wrap'`, `justifyContent: 'space-between'`, row gap 12, column gap 8, min height 20. Not a live region. Done item (`accessible`, label "{doneText}, done"): 18 `colors.success` disc with Ionicons `checkmark` 11 `colors.onDark`, 6 gap, `textSmallStrong` `colors.text` with `fontVariant: ['tabular-nums']`. Missing item: `Pressable` `accessibilityRole="button"`, label "{missingText} missing. Go to step {step}", height 44 with `marginVertical: -12`, gap 6: 18 empty disc with a 2px `textSecondary` ring, `textLink` in `colors.primary`, Ionicons `arrow-forward` 14 `colors.primary`. Text never ellipsises.
  - `stepScrollOffset({ step, paddingTop, headerHeight, childrenSectionY, bodyHeight, footerSectionY }) => number`. Step 2: `paddingTop + childrenSectionY`. Steps 3 and 4: `paddingTop + headerHeight + bodyHeight + footerSectionY[step]`. Returns `Math.max(0, value - 12)` (the step header lands 12 below the header hairline).
  - Items built from `validateLiteracySession(state)` in this order: children (step 2; done "1 child"/"{n} children", missing "Children"), letters (step 3; "1 letter"/"{n} letters", "Letters"), reading level (step 4; the level, "Reading level"). An item is missing exactly when its key is in the result.

- [ ] **Step 1: Write the failing tests.**
  - `sessionFormLayout.test.js`: step 2 → `28 + 140 - 12`; step 3 with `headerHeight: 400, bodyHeight: 3 * 64, footerSectionY: { 3: 0, 4: 520 }` → `28 + 400 + 192 - 12`; step 4 → `28 + 400 + 192 + 520 - 12`; an empty roster (`bodyHeight` = the measured empty-row height, e.g. 58) gives `28 + 400 + 58 + 0 - 12`; a negative result clamps to 0.
  - `RequirementSummary.test.js`: done items have label "2 children, done" and no button role; missing items are buttons labelled "Letters missing. Go to step 3" and call `onPress`; no element has `accessibilityLiveRegion` set; a long `doneText` renders whole (no `numberOfLines`).
  - `LiteracySessionForm.test.js` (spec tests 2–4):
    - a fresh form shows three buttons "Children missing. Go to step 2", "Letters missing. Go to step 3", "Reading level missing. Go to step 4";
    - selecting one child then a second shows "1 child, done" then "2 children, done"; same for letters ("1 letter", "2 letters"); picking a level shows "3 Letter Blends, done" for `READING_LEVELS[2]`; a group selection updates the count; Submit is never disabled (its `accessibilityState.disabled` is falsy in every one of these states);
    - **agreement**: `test.each` over all eight combinations of {child selected, letter selected, level chosen}: the set of missing summary keys equals the set of inline error messages shown after pressing Submit (map children → "Select at least one child", letters → "Select at least one letter", readingLevel → "Select a reading level"); for the all-valid combination nothing is missing, no error shows and `SessionComplete` mounts;
    - **jump**: spy on the `FlatList` instance's `scrollToOffset` (`UNSAFE_getByType(FlatList).instance`) and on `AccessibilityInfo.setAccessibilityFocus`; fire `layout` events with known values on the list-header wrapper (`headerHeight` 400), the step-2 section (y 140) and the step-3/4 sections (y 0 / 520), with one child in the roster at 64; pressing "Letters missing. Go to step 3" calls `scrollToOffset({ offset: 28 + 400 + 64 + 0 - 12, animated: true })` and `setAccessibilityFocus` once; no error note appears and no step header turns "needs attention";
    - **filtered roster** (Review Focus 5): type a search with no match, fire the empty row's `layout` (height 58), press "Reading level missing. Go to step 4": the offset uses 58, not a row count.
- [ ] **Step 2: Run to verify they fail.** `… npx jest __tests__/RequirementSummary.test.js __tests__/sessionFormLayout.test.js __tests__/LiteracySessionForm.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - `RequirementSummary` and `stepScrollOffset` as in Interfaces.
  - The form: `listRef`, `childrenStepRef`, `lettersStepRef`, `levelStepRef`; a `layoutRef` (not state, so measuring never re-renders) filled by `ChildSelector`'s `onMetrics` and by the step-3/4 section `onLayout`s (their y inside the list-footer wrapper). `jumpToStep(step)`: `listRef.current?.scrollToOffset({ offset: stepScrollOffset({ step, paddingTop: 28, ...layoutRef.current }), animated: true })`, then `const node = findNodeHandle(ref.current); if (node) AccessibilityInfo.setAccessibilityFocus(node);`. It changes no form state and shows no error.
  - Render `<RequirementSummary items={summaryItems} />` as the first child of the footer, 12 above the save-failure note or the button. `summaryItems` is `useMemo` over the three inputs plus `jumpToStep` (stable via `useCallback`).
  - The roster render-count guarantee must hold: `onMetrics` is held in a ref inside `ChildSelector`, and the summary lives outside the list.
- [ ] **Step 4: Run to verify they pass**, plus `ChildSelector.renderCount.test.js` and the integration submit test. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/forms/RequirementSummary.js src/utils/sessionFormLayout.js src/screens/sessions/LiteracySessionForm.js src/components/children/ChildSelector.js __tests__/RequirementSummary.test.js __tests__/sessionFormLayout.test.js __tests__/LiteracySessionForm.test.js
git commit -m "feat(record): live requirement summary above Submit, with jump-to-step"
```

---

### Task 13: Standing docs and guard close-out

**Files:**
- Modify: `documentation/design-system.md`, `PRD.md` §6.6, `documentation/ROADMAP.md` §5, `documentation/build-log.md`
- Modify: `__tests__/designSystemGuard.test.js` (ratchet lines, only if any Record entry is left)
- `CONTEXT.md`: no change expected (no domain term changes). Confirm with `grep -n "discard\|Session date\|reading level" CONTEXT.md` and change only a term this PR renamed.

- [ ] **Step 1: Ratchet close-out.** Run `… npx jest __tests__/designSystemGuard.test.js`. Every Record file (`LiteracySessionForm.js`, `ChildSelector.js`, `LetterTrackerBottomSheet.js`, `SessionFormScreen.js`) must be absent from the ratchet list and pass the full rules. Fix any remaining raw value in the file, not by listing it.
- [ ] **Step 2: `documentation/design-system.md`.** Add a "Forms (Bold Red, 2026-10)" section: `StepHeader` (to-do / done / error disc; done is derived, never stored), `CountChip`, `SelectableRow` (checkbox/radio; grouped-card edges inside a fixed `rosterRowHeight` so `getItemLayout` stays exact), `RequirementSummary` (one validation function feeds Submit and the summary; not a live region), `StickyActionFooter` (sibling, not overlay; hides with the keyboard; registers with the toast obstruction registry), `ConfirmSheet` (sheets over dialogs; `alertdialog`), `MonthCalendar` and `formatSessionDate` (calendar keys only, never a `Date`; why: S6 / the Auckland case), `LetterToggleTile`/`Grid` (six columns, `min(56, floor((w − 40) / 6))`, lowercase letters, capital accessibility labels on the focus grid), and the mastery scheme (taught `successText`, assessment `successBg` + lock, one constant for the sheet and the panel).
- [ ] **Step 3: `PRD.md` §6.6.** After the "The current Literacy form records" list, add:

```markdown
The form shows a live summary above Submit of what is still missing (children, letters, reading
level); tapping a missing item scrolls to its step. The summary and Submit's validation come from
one function, so they always agree. A failed save stays on the form with an inline note above
Submit; the retry writes the same session id. Leaving a form with unsaved changes (Close, iOS
swipe-back, Android back) asks first in a bottom sheet: Discard or Keep editing.
```

- [ ] **Step 4: `documentation/ROADMAP.md` §5.** In "Bold Red for the rest of the app", remove "Record" from the "Remaining:" list (leave the item open for the PRs after this one). If the Snackbar-hosts item is still open, lower its count by one; if PR 1 closed it, change nothing.
- [ ] **Step 5: `documentation/build-log.md`.** Append Verification Register rows (dated, existing format): what shipped (Tasks 1–12), the decisions in this plan's "Decisions" note below, the test counts from Task 14 Step 1, and the device-gate result once Task 14 runs. Record any primitive API deviation found in the preflight.
- [ ] **Step 6: Commit**

```bash
git add documentation/design-system.md PRD.md documentation/ROADMAP.md documentation/build-log.md
# plus __tests__/designSystemGuard.test.js if changed
git commit -m "docs(record): design system forms, PRD 6.6, roadmap and build log for the Bold Red Record"
```

---

### Task 14: Final verification and device gate (manual gate for Jim)

- [ ] **Step 1: Full suites.** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`. Expected: PASS. Record both counts in the build log.
- [ ] **Step 2: Guards.** Confirm green and record: `__tests__/designSystemGuard.test.js`, `__tests__/colors.test.js`, `__tests__/contrast.test.js`, `__tests__/typography.test.js`, `__tests__/domainTextInputAudit.test.js`, `__tests__/ClockInBeforeSessionSheet.test.js` (spec test 15: copy and labels unchanged), `__tests__/signOutFlow.test.js` (unchanged).
- [ ] **Step 3: Static checks.** `git grep -n "Snackbar\|Alert.alert\|beforeRemove" src/screens/sessions src/components/children/ChildSelector.js` → no hits. `git grep -n "LetterGrid'" src` → no hits. `git diff feat/bold-red-children --stat -- supabase src/db src/services documentation/rls-sync-contract-map.md` → empty (no data-layer change).
- [ ] **Step 4: Branch review.** Run `/codex:adversarial-review --base feat/bold-red-children`; handle findings with the same likely-and-costly judgement as the spec rounds, and log them.
- [ ] **Step 5: EAS preview build** for iOS and Android (cloud builds; the sqlite backend is the default).
- [ ] **Step 6: Device checks — Jim (manual gate).** On a 390-class iPhone, the Galaxy A03s (360dp) and a 360×800 Android:
  - Screenshots against the boards: fresh form, mixed summary (`p-summary`), ready summary (`p-summary-2`), Groups mode, both error frames, saving, every sheet (calendar including a previous month and a past day selected, both level sheets, tracker with taught / new / locked, tracker loading, discard, clock-in).
  - Save failure end to end: open the form, remove the test EA's active programme assignment on `masi-app-sqlite` (dev data, via the `sqlite-staging-sql` skill), foreground so a pull applies it, fill the form, Submit: the inline note appears; restore the assignment, pull, Submit: one session saves.
  - Keyboard: focus Search and Comments on both platforms; the footer hides, the field stays fully visible, the footer returns on dismiss. **If Comments is covered on Android**, add `KeyboardAvoidingView behavior="height"` around the form column on Android only, re-test, and commit that as its own fix with the device result in the message.
  - Discard (overview §8 R8): iOS swipe on a dirty form then "Keep editing" keeps the same form with every value editable; swipe then "Discard" leaves; Close and Android hardware back each show the sheet; Back with the sheet open keeps editing; a successful submit leaves without the sheet.
  - Largest system font (iOS largest non-accessibility size, One UI 1.3): roster rows, step labels, fields, child blocks and the wrapped summary are complete; every target, including wrapped summary links, is tappable on its own.
  - TalkBack and VoiceOver: step headers, checkbox/radio rows, tiles (capital letter names on the focus grid), summary jump focus, error and save-failure announcements.
  - Reduce Motion on: tiles and Submit press without scaling.
  - A03s: roster scroll and tile taps stay smooth with 30+ children.
  - Letter tracker and Child results screens show the new green scheme with locks (C15).
  - Home row: Home is unchanged.
- [ ] **Step 7:** Record results and screenshots in the build log (Task 13 Step 5) and commit `documentation/build-log.md` with `docs(record): device gate for the Bold Red Record`.

---

## Decisions this plan made (for the reviewer)

1. **The form holds the session date as a calendar key** (`sessionDateKey`), not a `Date`. It saves the same string as before; `MonthCalendar` and `formatSessionDate` take keys only (overview S6), so no `Date` round-trip exists to get wrong.
2. **Accessibility-label letter case stays per surface:** capitals on the focus grid (today's, part 3 step 3), lowercase on the tracker and panel (today's, part 3 tracker table, existing tests). Overview S8's "labels keep capitals" is read as "keep what each surface has".
3. **`LetterGrid.js` is deleted** once `LetterToggleGrid` replaces it (no other importer). The overview's folder rule keeps it from moving; it does not require keeping a dead file.
4. **`LetterToggleTile`/`Grid` live in `src/components/sessions/`** (overview §1.2), not `session/` (part 3).
5. **`LetterMasteryPanel` moves to the six-column `LetterToggleGrid`** so all three mastery surfaces share one tile (C15). Its legend has three items (it never has "new this session").
6. **`StickyActionFooter` ships only `surface="always"`;** PR 4 adds `onOverflow` with its own consumer.
7. **The roster has no `radiogroup` container role:** a `FlatList` cannot wrap only its rows; each row carries `radio` + `checked`.
8. **`BottomSheet` gains `panelRole`** (additive) so `ConfirmSheet` can make the whole panel an `alertdialog` with `accessibilityViewIsModal`; Profile's export sheet reuses it.
9. **Form tests run on a real `StackRouter`** through `test-support/renderInTestStack.js`, because `usePreventRemove` needs a navigator and a mock would hide the replace-after-commit ordering that R8 depends on.
10. **iOS `automaticallyAdjustKeyboardInsets` is set up front;** the Android `KeyboardAvoidingView` waits for the device check, as part 3 asks.
