# Bold Red App PR 2: Children Implementation Plan

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time through the codex companion; Claude reviews each task's diff and runs its tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Codex usually cannot `git commit` in its sandbox, so each task ends with the exact files to stage and the commit message, and the orchestrator runs it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build My Children (`ChildrenListScreen`) and Class detail (`ClassDetailScreen`) to the Bold Red boards, with the reusable pieces Record and Profile will take over: `Avatar`, `getInitials`, `AvatarStack`, `GroupChip`, `SyncBanner`, `InlineLoading`, and one six-colour group dot (`getGroupDotColor`).

**Architecture:** Pure functions own every decision a test can pin (initials, monograms, row labels, banner copy, dot colour). Small presentational components in `src/components/common/` and `src/components/children/` own the drawing. The two screens keep all of today's data flow and navigation and only recompose the view: the navigator-rendered `ScreenHeader` from PR 1 stays fixed, and everything else scrolls inside one `FlatList`. No schema, RLS, payload, outbox or context change.

**Tech Stack:** React Native 0.81 / Expo SDK 54, react-native-paper 5.14.5, react-native-svg 15.12.1, `@expo/vector-icons` (Ionicons, MaterialCommunityIcons), Jest 29 + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-10-18-bold-red-app-design.md` (overview: **System decisions, §6 Jim's answers and §8 review rounds win** over the parts) and `docs/superpowers/specs/2026-10-18-bold-red-app-2-children.md` (this screen's layout, states, copy and tests). Read both before any task. Where the part says "`ScreenHeader` rendered by the screen", "`SyncIndicator variant="pill"`", "`TextLinkButton`", "`PrimaryButton`", "`GroupedSurface`", "`Monogram`", "`displayS`" or "Figtree 600 maps to 700", the overview replaces it (see "Name map" below). Visual source: boards `red-children-final`, `red-children-class-detail`, `red-children-s-*` and `red-children-components` on the Design Round 4 canvas.

## Global Constraints

- Branch `feat/bold-red-children`, cut from `feat/bold-red-app` **after PR 1 (`feat/bold-red-shared-look`) has merged into it**. Commit after every task; never push without Jim.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Unit/screen tests: `npx jest <file>`. Integration tests (real SQLite) are listed in `jest.integration.config.js` `testMatch` and run with `npm run test:integration -- <file>`. This PR adds no integration test (no data change); the final task runs both full suites.
- TDD per task: the failing test first for behaviour. Pure restyles are asserted through the screen with `@testing-library/react-native` (roles, labels, text, navigation calls, token values on a `testID`'d node), never snapshots.
- **Never change behaviour the spec does not approve.** The approved list is part 2 "Behaviour changes" items 1–7 plus overview §3 C9 / §8 builder gap 2 (the banner shows and hides on `waitingCount`). Unchanged: onboarding auto-entry, `hasAutoRouted`, `popToTop` for Manage classes, the stats computation, search fields (class name, school name, teacher), pull-to-refresh order, every navigation destination and its params, the group picker's behaviour.
- No schema, RLS, payload or outbox change. `documentation/rls-sync-contract-map.md` is not touched.
- Stay on npm. **No new package.** `react-native-svg` (installed) draws the spinner arc.
- Colours: only `colors.*`, `tints.*` and `GROUP_DOT_COLORS` (categorical data in `src/constants/groupColors.js`). No hex, `rgb(` or `rgba(` outside `src/constants/**` (PR 1's `__tests__/designSystemGuard.test.js` enforces it with no allowlist).
- Type: only `typeRoles` spreads. No raw `fontSize`, `lineHeight`, `letterSpacing` or `fontWeight` in any file this PR touches (the guard enforces it; this PR removes the `ChildrenListScreen.js` and `ClassDetailScreen.js` lines from its ratchet list). Never set `fontWeight` with a custom family.
- Use React Native `Text` with a `typeRoles` spread in new components (Home's pattern), not Paper `Text` variants. No Paper `Searchbar`, `Banner`, `Card`, `List`, `FAB`, `Chip` or `Menu` in the two screens.
- Copy is verbatim from part 2 (quoted in each task). Curly `’`, `“ ”` and the `…` character in all new user-facing strings (overview C18).
- Every 44dp target is a `minHeight`/`minWidth`, never a fixed height. Text wraps when the font is enlarged; only the elements the spec names cap at `maxFontSizeMultiplier={1.2}`.
- Standing docs ship in this branch (Task 9): `documentation/design-system.md`, `documentation/build-log.md`, `documentation/ROADMAP.md` §5. `CONTEXT.md` and `PRD.md` do not change: "My Children" stays the domain term for the delivery roster; only the screen title becomes "Children".

### Name map (part 2 wording → what to build, from the overview)

| Part 2 says | Build / use | Source |
|---|---|---|
| screen renders `ScreenHeader`, `headerShown: false` | navigator-rendered `ScreenHeader`; screens set options (`title`, `headerRight`) and pass `useHeaderHairline()` to their list | overview C1 |
| header geometry `insets.top + 15` / `+ 9` | PR 1's `ScreenHeader` geometry (inset + 9, row 44); not touched here | overview C2 |
| title "one line, ellipsis" | wraps (PR 1) | overview C3 |
| `SyncIndicator variant="pill"` | PR 1's restyled **default** `SyncIndicator` (already the Children header right slot) | overview C8 |
| `TextLinkButton` | `BrandButton variant="tertiary"` (15/20); "Sync now" is `size="sm"` (14/20) | overview §1.1, W4 |
| `PrimaryButton` "Start setup" | `BrandButton variant="primary" size="md" icon="add"` | overview §1.1 |
| `GroupedSurface` | `ListGroup` (+ the FlatList frame helper from Task 3) | overview §1.1 |
| `Monogram` | `Avatar shape="tile" size={40}` | overview §1.2 |
| `childInitials(child)` | `getInitials(first, last)` in `src/utils/initials.js` | overview §1.2 |
| `displayS` | `displaySheetTitle` | overview §2.2 |
| `textBody` at 14/20 | `textSmall` | overview §2.2 |
| Figtree 600 → `textBold` | Figtree 600 roles: `textNote` (13/18), `textBodySemi` (15/20) | overview C4 |
| `textCaption` in `textBold` (13/18 700) | `textChip` | overview §2.2 |
| `SyncBanner` count `totalUnsyncedCount` | `useOffline().waitingCount`, show/hide on it | overview C9, §8 gap 2 |
| six dot colours | `GROUP_DOT_COLORS` + `getGroupDotColor(index)`; the only group colour (Class detail, picker, Edit child) | overview S10 |

### Interfaces consumed from PR 1 (Task 1 verifies each)

| Consumed | Expected shape (overview §1.1, §2) |
|---|---|
| tokens | `colors.primary` = `#C81F3E`; `tints.rule`, `tints.control`, `tints.pressed`, `tints.avatarEdge`, `tints.warningControl`; `borderRadius.pill` = 999 |
| `typeRoles` | `displayTitle`, `displaySheetTitle`, `textRowTitle`, `textParagraph`, `textSmall`, `textBodySemi`, `textChip`, `textNote`, `textSectionLabel`, plus the existing `textBody`, `textBodyStrong`, `textCaption`, `textButton` |
| `BrandButton` | `{ label, onPress, variant, size, icon, accessibilityLabel }`; `tertiary` default 15/20, `size="sm"` 14/20 |
| `IconCircleButton` | `{ icon, onPress, accessibilityLabel }` |
| `ScreenHeader` wiring + `useHeaderHairline()` | Children stack renders the header from options; the hook returns an `onScroll` handler |
| `SearchField` | `{ value, onChangeText, placeholder, accessibilityLabel }`, clear button "Clear search", spreads `NO_TEXT_SUGGESTIONS` |
| `ListGroup`, `ListRow` | Group: `children`. Row: `title, subtitle, lead, trailing='chevron', onPress, accessibilityLabel` |
| `StatusBadge` | `{ label, tone }`, tone `warning` |
| `EmptyState` | `{ title, body, footnote, action }` |
| `SectionHeader` | `{ title, hint, action }` |
| `StatBar` | `items: [{ label, value, onPress?, color? }]`, bare stat bar to part 2 §Stat bar |
| `MotionProvider` / `useMotion()` | `{ tier, reduceMotion, motionLevel }`; tests pin it with `MotionProvider value` |
| `FAB_OVERHANG` | exported by `src/components/navigation/LockedBottomTabBar.js` (24) |

**Gap rule.** If a consumed primitive lacks a prop this plan uses (most likely: a per-item `accessibilityLabel` on `StatBar`, a node `footnote` on `EmptyState`), add it as an **optional, default-preserving** prop in the task that first needs it, with a unit test in that primitive's existing test file, and record it in the Task 9 build-log row. Never build a screen-local copy of a primitive. If a primitive is missing entirely, stop and report to the orchestrator: PR 1 is not complete.

## Review Focus

1. **A background pull while the EA is typing a search.** `ChildrenContext` and `ClassesContext` set `loading` true on every pull, including pull-to-refresh and focus pulls, with cached classes on screen. The stat bar, search field (with its term and focus) and banner must stay; the "Loading…" state is only for an EA with no classes yet. Pinned in Task 6 (`loading: true` with cached classes keeps the same search input and the term).
2. **Messy names.** Lowercase, padded, missing or `null` last names, and blank names. Initials must be uppercase, never contain "undefined", and a blank child gives an empty disc, not a crash. Pinned in Task 2.
3. **Free-text classes and odd grades.** "Sunflowers" in an all-ECD list, "Grade R Blue", a grade outside `GRADES`, a `null` grade. The monogram must be 1–3 characters or empty, and stable under search. Pinned in Task 2 and Task 6.
4. **Counts of exactly 1 and very large counts.** "1 child", "1 group", "1 item waiting to sync", "Syncing 1 item…", "1 unassessed child. Open Assess"; a pull alone (`isSyncing` with `waitingCount` 0) never shows "Syncing 0 items…". Pinned in Task 2 and Task 4.
5. **Groups past the sixth, and free-text groups.** Group index 6 and 7, "Lions": one dot colour per group across Class detail, the picker and Edit child, and the group name always printed beside it. Pinned in Task 2 and Task 8.

---

### Task 1: Branch and preflight (no code)

- [ ] **Step 1: The orchestrator creates the branch**

```bash
git checkout feat/bold-red-app && git pull --ff-only && git checkout -b feat/bold-red-children
```

- [ ] **Step 2: Baseline suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest` then `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: both PASS. Record the suite and test counts for Task 9.

- [ ] **Step 3: Verify every row of "Interfaces consumed from PR 1"**

For each row, open the file and confirm the export and prop names, for example:
`grep -n "export" src/components/common/{BrandButton,IconCircleButton,ScreenHeader,SearchField,ListGroup,ListRow,StatusBadge,EmptyState,SectionHeader}.js src/components/dashboard/StatBar.js src/context/MotionContext.js src/components/navigation/LockedBottomTabBar.js`
and `grep -n "tints\|pill" src/constants/colors.js`. Also read `__tests__/designSystemGuard.test.js` and note the exact ratchet entries for `src/screens/main/ChildrenListScreen.js` and `src/screens/children/ClassDetailScreen.js`, and check whether `src/components/common/SyncStatusBanner.js` still exists.
Expected: every row present. Write the list of gaps (props the Gap rule will add) into the Task 9 notes. A missing primitive stops the plan.

No commit.

---

### Task 2: Pure presentation rules

**Files:**
- Create: `src/utils/initials.js`
- Create: `src/utils/childrenPresentation.js`
- Modify: `src/constants/groupColors.js`, `src/utils/groupHelpers.js`, `src/utils/syncStatusPresenter.js`
- Test: `__tests__/initials.test.js` (new), `__tests__/childrenPresentation.test.js` (new), `__tests__/groupHelpers.test.js`, `__tests__/groupColors.test.js`, `__tests__/syncStatusPresenter.test.js`

**Interfaces:**
- Produces:
  - `getInitials(firstName?: string|null, lastName?: string|null) => string`: first character of each trimmed name, uppercased; one name gives one letter; both blank gives `''`.
  - `classMonogram(cls: { grade, name }, allClasses: Array<{ grade }>) => string` (rules in Step 3).
  - `childMetaLine(child: { age, gender }) => string`: `"Age 7 • Male"`, parts omitted when empty, gender through `getGenderLabel`.
  - `countLabel(n: number, singular: string, plural: string) => string`: `"1 child"`, `"18 children"`.
  - `classRowLabel({ name, schoolName, grade, teacher, language, childCount, groupCount, unsynced }) => string`.
  - `GROUP_DOT_COLORS: string[]` (6 hexes) in `groupColors.js`; `getGroupDotColor(index: number) => string` in `groupHelpers.js`.
  - `describeSyncBanner({ isOnline, isSyncing, waitingCount, needsAttentionCount }) => null | { state: 'waiting'|'offline'|'syncing', message: string, showSyncNow: boolean }` in `syncStatusPresenter.js`.

- [ ] **Step 1: Write the failing tests**

`__tests__/initials.test.js`:

```js
import { getInitials } from '../src/utils/initials';

describe('getInitials', () => {
  test.each([
    ['Amahle', 'Dlamini', 'AD'],
    ['amahle', 'dlamini', 'AD'],
    ['  sipho ', ' ndlovu', 'SN'],
    ['Lwazi', '', 'L'],
    ['Lwazi', null, 'L'],
    ['', 'Booi', 'B'],
    [undefined, undefined, ''],
    ['   ', '  ', ''],
  ])('getInitials(%p, %p) is %p', (first, last, expected) => {
    expect(getInitials(first, last)).toBe(expected);
  });
});
```

`__tests__/childrenPresentation.test.js`:

```js
import { GRADES } from '../src/constants/options';
import {
  classMonogram, childMetaLine, countLabel, classRowLabel,
} from '../src/utils/childrenPresentation';

const mixed = [{ grade: 'Grade 1' }, { grade: 'Grade R' }];

describe('classMonogram', () => {
  test.each([
    ['ECD', 'ECD'], ['Grade R', 'R'], ['Grade 1', '1'], ['Grade 2', '2'], ['Grade 3', '3'],
  ])('grade code for %s is %s in a mixed-grade list', (grade, code) => {
    expect(classMonogram({ grade, name: 'Sunflowers' }, mixed)).toBe(code);
  });

  test('every GRADES value is covered', () => {
    GRADES.forEach((grade) => expect(classMonogram({ grade, name: 'x y z w' }, mixed)).not.toBe(''));
  });

  test('Grade N strips to N', () => {
    expect(classMonogram({ grade: 'Grade N', name: 'Lions' }, mixed)).toBe('N');
  });

  test('uses the name code when every class shares one grade', () => {
    const all = [{ grade: 'Grade 1' }, { grade: 'Grade 1' }];
    expect(classMonogram({ grade: 'Grade 1', name: 'Grade 1A' }, all)).toBe('1A');
    expect(classMonogram({ grade: 'Grade 1', name: '1b' }, all)).toBe('1B');
    expect(classMonogram({ grade: 'Grade 1', name: 'grade 1c' }, all)).toBe('1C');
  });

  test('falls back to the grade code when the stripped name is longer than 3 characters', () => {
    const all = [{ grade: 'ECD' }, { grade: 'ECD' }];
    expect(classMonogram({ grade: 'ECD', name: 'Sunflowers' }, all)).toBe('ECD');
    expect(classMonogram({ grade: 'Grade R', name: 'Grade R Blue' }, [{ grade: 'Grade R' }])).toBe('R');
  });

  test('a single class counts as "every class shares one grade"', () => {
    expect(classMonogram({ grade: 'Grade 1', name: 'Grade 1A' }, [{ grade: 'Grade 1' }])).toBe('1A');
  });

  test('mixed grades always use the grade code', () => {
    expect(classMonogram({ grade: 'Grade 1', name: '1A' }, mixed)).toBe('1');
  });

  test('a grade outside GRADES is capped at 3 characters; a missing grade gives an empty code', () => {
    expect(classMonogram({ grade: 'Pre-school', name: 'Little Stars' }, mixed)).toBe('PRE');
    expect(classMonogram({ grade: null, name: 'Little Stars' }, mixed)).toBe('');
  });
});

describe('childMetaLine', () => {
  test.each([
    [{ age: 7, gender: 'male' }, 'Age 7 • Male'],
    [{ age: 7, gender: 'F' }, 'Age 7 • Female'],
    [{ age: 7, gender: null }, 'Age 7'],
    [{ age: null, gender: 'female' }, 'Female'],
    [{ age: null, gender: null }, ''],
  ])('%p → %p', (child, expected) => expect(childMetaLine(child)).toBe(expected));
});

describe('countLabel', () => {
  test('singular and plural', () => {
    expect(countLabel(1, 'child', 'children')).toBe('1 child');
    expect(countLabel(0, 'child', 'children')).toBe('0 children');
    expect(countLabel(18, 'group', 'groups')).toBe('18 groups');
  });
});

describe('classRowLabel', () => {
  const base = {
    name: 'Grade 1A', schoolName: 'Charles Duna Primary', grade: 'Grade 1', teacher: 'Ms Ndlovu',
    language: 'isiXhosa', childCount: 18, groupCount: 4, unsynced: false,
  };
  test('synced class', () => {
    expect(classRowLabel(base)).toBe(
      'Grade 1A, Charles Duna Primary, Grade 1, Ms Ndlovu, isiXhosa, 18 children, 4 groups. Open class'
    );
  });
  test('singulars and unsynced', () => {
    expect(classRowLabel({ ...base, childCount: 1, groupCount: 1, unsynced: true })).toBe(
      'Grade 1A, Charles Duna Primary, Grade 1, Ms Ndlovu, isiXhosa, 1 child, 1 group, unsynced. Open class'
    );
  });
});
```

Append to `__tests__/groupHelpers.test.js`:

```js
import { getGroupDotColor } from '../src/utils/groupHelpers';
import { GROUP_DOT_COLORS } from '../src/constants/groupColors';

describe('getGroupDotColor', () => {
  test('cycles six colours', () => {
    expect(getGroupDotColor(6)).toBe(getGroupDotColor(0));
    expect(getGroupDotColor(7)).toBe(getGroupDotColor(1));
    expect(new Set([0, 1, 2, 3, 4, 5].map(getGroupDotColor)).size).toBe(6);
  });
  test('never returns the dropped pink or amber', () => {
    for (let i = 0; i < 24; i += 1) {
      expect(['#C62828', '#F57F17']).not.toContain(getGroupDotColor(i));
    }
  });
  test('a negative or non-finite index falls back to the first colour', () => {
    expect(getGroupDotColor(-1)).toBe(GROUP_DOT_COLORS[0]);
    expect(getGroupDotColor(NaN)).toBe(GROUP_DOT_COLORS[0]);
  });
});
```

Append to `__tests__/groupColors.test.js` (fail-closed pin plus the 3:1 graphic contrast from part 2 §Contrast):

```js
import { GROUP_DOT_COLORS } from '../src/constants/groupColors';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratioOnWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

describe('GROUP_DOT_COLORS', () => {
  it('pins the six dot hues in order', () => {
    expect(GROUP_DOT_COLORS).toEqual(['#1565C0', '#2E7D32', '#E65100', '#7B1FA2', '#00695C', '#283593']);
  });
  it('every dot is at least 3:1 on white (graphic)', () => {
    GROUP_DOT_COLORS.forEach((hex) => expect(ratioOnWhite(hex)).toBeGreaterThanOrEqual(3));
  });
});
```

Append to `__tests__/syncStatusPresenter.test.js`:

```js
import { describeSyncBanner } from '../src/utils/syncStatusPresenter';

describe('describeSyncBanner', () => {
  const base = { isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0 };
  test('waiting online', () => {
    expect(describeSyncBanner(base)).toEqual({ state: 'waiting', message: '3 items waiting to sync', showSyncNow: true });
  });
  test('offline', () => {
    expect(describeSyncBanner({ ...base, isOnline: false })).toEqual({
      state: 'offline', message: '3 items will sync when you’re online', showSyncNow: false,
    });
  });
  test('syncing', () => {
    expect(describeSyncBanner({ ...base, isSyncing: true })).toEqual({
      state: 'syncing', message: 'Syncing 3 items…', showSyncNow: false,
    });
  });
  test('singular copy', () => {
    expect(describeSyncBanner({ ...base, waitingCount: 1 }).message).toBe('1 item waiting to sync');
    expect(describeSyncBanner({ ...base, waitingCount: 1, isOnline: false }).message).toBe('1 item will sync when you’re online');
    expect(describeSyncBanner({ ...base, waitingCount: 1, isSyncing: true }).message).toBe('Syncing 1 item…');
  });
  test('hidden when nothing waits, including a pull-only sync pass', () => {
    expect(describeSyncBanner({ ...base, waitingCount: 0 })).toBeNull();
    expect(describeSyncBanner({ ...base, waitingCount: 0, isSyncing: true })).toBeNull();
    expect(describeSyncBanner({})).toBeNull();
  });
  test('hidden whenever items need attention (the header pill carries it)', () => {
    expect(describeSyncBanner({ ...base, needsAttentionCount: 1 })).toBeNull();
    expect(describeSyncBanner({ ...base, needsAttentionCount: 1, isSyncing: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/initials.test.js __tests__/childrenPresentation.test.js __tests__/groupHelpers.test.js __tests__/groupColors.test.js __tests__/syncStatusPresenter.test.js`
Expected: FAIL (modules and exports not defined). The existing tests in the three modified files still pass.

- [ ] **Step 3: Implement**

- `getInitials` in `src/utils/initials.js`: `String(name ?? '').trim()`, take `Array.from(trimmed)[0]` (surrogate-safe), `toUpperCase()`. `classMonogram` does **not** live here.
- `src/utils/childrenPresentation.js`:
  - `gradeCode(grade)` (internal): `String(grade ?? '').trim().replace(/^grade\s+/i, '').toUpperCase()`, then the first 3 characters.
  - `classMonogram(cls, allClasses)`: if `allClasses` is non-empty and every class has the same `gradeCode`, take the name code `String(cls.name ?? '').trim().replace(/^grade\s+/i, '').trim().toUpperCase()`; use it when its length is 1–3, else the grade code. Otherwise the grade code. Callers pass **all** classes, never the filtered list.
  - `childMetaLine`: `child.age ? \`Age ${child.age}\` : ''` and `getGenderLabel(child.gender)` (from `src/constants/options.js`), joined with `' • '`, empty parts dropped.
  - `countLabel`, `classRowLabel`: `[name, schoolName, grade, teacher, language, countLabel(childCount,'child','children'), countLabel(groupCount,'group','groups')]` joined with `', '`, then `', unsynced'` when `unsynced`, then `'. Open class'`. `schoolName` is passed already resolved (caller applies the "Unknown school" fallback).
- `groupColors.js`: `export const GROUP_DOT_COLORS = GROUP_COLORS.filter(({ text }) => text !== '#C62828' && text !== '#F57F17').map(({ text }) => text);` `GROUP_COLORS` stays unchanged (its pin test stays green).
- `groupHelpers.js`: `getGroupDotColor(index)`: a non-finite or negative index returns `GROUP_DOT_COLORS[0]`, else `GROUP_DOT_COLORS[Math.trunc(index) % GROUP_DOT_COLORS.length]`. Leave `getGroupColor` in place until Task 8 removes its last caller.
- `syncStatusPresenter.js`: `describeSyncBanner` returns `null` when `!(waitingCount > 0)` or `needsAttentionCount > 0`; otherwise the state is `isSyncing ? 'syncing' : !isOnline ? 'offline' : 'waiting'`, with the copy pinned above and `showSyncNow` only for `waiting`. Reuse the file's `plural` helper.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/initials.js src/utils/childrenPresentation.js src/constants/groupColors.js src/utils/groupHelpers.js src/utils/syncStatusPresenter.js __tests__/initials.test.js __tests__/childrenPresentation.test.js __tests__/groupHelpers.test.js __tests__/groupColors.test.js __tests__/syncStatusPresenter.test.js
git commit -m "feat(children): initials, monogram, row-label, group-dot and sync-banner rules"
```

---

### Task 3: `Avatar`, `SpinnerArc`, `InlineLoading` and the grouped-row frame

**Files:**
- Modify: `src/constants/typography.js` (three initials roles)
- Create: `src/components/common/Avatar.js`, `src/components/common/SpinnerArc.js`, `src/components/common/InlineLoading.js`
- Modify: `src/components/common/ListGroup.js` (add two exports; the default export is unchanged)
- Test: `__tests__/typography.test.js`, `__tests__/Avatar.test.js` (new), `__tests__/InlineLoading.test.js` (new), `__tests__/ListGroup.test.js` (PR 1's file; create it if PR 1 named it differently, and say so in the commit)

**Interfaces:**
- Consumes: `typeRoles`, `colors`, `tints`, `borderRadius`, `useMotion()` (PR 1).
- Produces:
  - `typeRoles.textInitialsSm` (Figtree 800 `fontFamilies.textHeavy`, 11/14, letterSpacing 0.33), `textInitialsMd` (800, 14/18, 0.42), `textInitialsLg` (800, 22/28, 0.66). These are the overview's "letter spacing 0.03em" at 11, 14 and 22, made into roles because the guard forbids raw sizes in components. Monogram tiles use the existing `textButton` (800 15/20).
  - `Avatar({ label = '', size = 40, shape = 'circle', icon, ring = false, testID })`. `size` is 28, 40 or 64. `shape="tile"` is only used at 40.
  - `SpinnerArc({ size = 22, color = colors.primary, testID = 'spinner-arc' })`.
  - `InlineLoading({ label })`.
  - `listGroupItemFrame(index: number, count: number) => ViewStyle` and `ListGroupDivider({ inset })`, both named exports of `ListGroup.js`. They let a `FlatList` draw rows that look exactly like a `ListGroup`, so long lists stay virtualised. Record's roster reuses them.

- [ ] **Step 1: Write the failing tests**

- `typography.test.js`: pin the three roles exactly (family `fontFamilies.textHeavy`, size, lineHeight, letterSpacing, no `fontWeight`), following the file's existing pin style.
- `Avatar.test.js`, rendered with the `@expo/vector-icons` Proxy mock used in `__tests__/ClassDetailScreen.test.js`:
  - `label="AD"` at 40 renders "AD". The outer node (`testID="avatar"`) has `width: 40`, `height: 40`, `borderRadius: 20` and `backgroundColor: colors.red50`. The text colour is `colors.red700` and the text style equals `typeRoles.textInitialsMd`; the text has `maxFontSizeMultiplier` 1.2.
  - Size 28 uses `textInitialsSm` and radius 14; size 64 uses `textInitialsLg` and radius 32.
  - `shape="tile"`: radius `borderRadius.md` (14), text style `typeRoles.textButton`, `numberOfLines` 1 and `adjustsFontSizeToFit`.
  - `ring`: a wrapper with `backgroundColor: colors.surface`, size `size + 4` and margin −2; the inner disc has `borderWidth: 1` and `borderColor: tints.avatarEdge`.
  - `icon="person-outline"` at 64 renders the icon (Proxy mock records the `name` and `size` 28) and no text.
  - Decorative: `screen.queryByLabelText(/AD/)` is null, and the outer node has `importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden`.
- `InlineLoading.test.js`, rendered inside `<MotionProvider value={{ tier: 'high', reduceMotion: false, motionLevel: 'full' }}>`:
  - `<InlineLoading label="Loading class…" />` renders the text with style `typeRoles.textBodySemi` and colour `colors.text`. Its container has `accessibilityLiveRegion="polite"`, and a `SpinnerArc` of size 22 and colour `colors.primary` is present.
  - `SpinnerArc` under `reduceMotion: true, motionLevel: 'still'` renders the `testID="spinner-arc"` view with no `transform` in its flattened style. Under `full` the transform holds a `rotate`.
- `ListGroup.test.js`:
  - `listGroupItemFrame(0, 1)` has all four borders 1 in `tints.rule`, all four radii `borderRadius.lg`, `overflow: 'hidden'` and `backgroundColor: colors.surface`.
  - `(0, 3)` has a top border and top radii only. `(1, 3)` has side borders only. `(2, 3)` has a bottom border and bottom radii.
  - `<ListGroupDivider inset={68} />` is 1 high, `colors.border`, absolutely positioned at `top: 0`, with `left: 68` and `right: 0`.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/typography.test.js __tests__/Avatar.test.js __tests__/InlineLoading.test.js __tests__/ListGroup.test.js`
Expected: FAIL on the new assertions only.

- [ ] **Step 3: Implement**

- `Avatar`: `View` disc with `red50` fill and RN `Text` in `red700`. Icon glyph sizes are {28: 14, 40: 18, 64: 28} (Ionicons, `red700`); the icon wins over `label`. `ring` wraps the disc in a surface-coloured `View` 4dp larger with margin −2, so the layout footprint stays `size`.
- `SpinnerArc`: an `Animated.View` rotating a `react-native-svg` drawing of the board arc: a full circle at r 9 on a 24 viewBox, stroke `color` at `strokeOpacity` 0.28 and width 2.6, plus the path `M12 3a9 9 0 0 1 9 9` in `color` with a round cap. The rotation is a 1000ms linear native-driver loop while `!useMotion().reduceMotion`. It stops on unmount. The view is decorative (`accessible={false}`). **If PR 1 already ships an equivalent reusable arc spinner** (Task 1 grep), use it here and in Task 5 instead of creating this file.
- `InlineLoading`: row, `alignItems: 'center'`, gap 12, `minHeight: 28`, containing `SpinnerArc size={22}` and the label. The board draws 15/22 at 600; `textBodySemi` (600 15/20) is the overview role. `accessibilityLiveRegion="polite"`.
- `listGroupItemFrame` and `ListGroupDivider` match `ListGroup`'s own border, radius and divider tokens, so a framed list and a `ListGroup` are pixel-identical.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, plus `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/typography.js src/components/common/Avatar.js src/components/common/SpinnerArc.js src/components/common/InlineLoading.js src/components/common/ListGroup.js __tests__/typography.test.js __tests__/Avatar.test.js __tests__/InlineLoading.test.js __tests__/ListGroup.test.js
git commit -m "feat(ui): Avatar, SpinnerArc, InlineLoading and a FlatList frame for grouped rows"
```

---

### Task 4: `AvatarStack`, `GroupChip` and `SyncBanner`

**Files:**
- Create: `src/components/children/AvatarStack.js`, `src/components/children/GroupChip.js`, `src/components/common/SyncBanner.js`
- Delete: `src/components/common/SyncStatusBanner.js`, `__tests__/syncStatusBanner.test.js` (unused today; overview §1.2 renames it)
- Test: `__tests__/AvatarStack.test.js`, `__tests__/GroupChip.test.js`, `__tests__/SyncBanner.test.js` (all new)

**Interfaces:**
- Consumes: `Avatar`, `getInitials` (Tasks 2–3), `describeSyncBanner` (Task 2), `BrandButton`, `useOffline()`.
- Produces:
  - `AvatarStack({ initials: string[] })`: renders at most the first three as `Avatar size={28} ring`, overlapping by 4. It renders `null` for an empty array and is decorative.
  - `GroupDot({ color, size = 8 })`: a named export of `GroupChip.js`, `testID="group-dot"`.
  - `GroupChip({ groupName: string|null, color?: string, onPress, accessibilityLabel })`, the default export. A `null` `groupName` draws the amber assign chip.
  - `SyncBanner({ onSyncNow })`: reads `useOffline()` and renders `null` whenever `describeSyncBanner` does.

- [ ] **Step 1: Write the failing tests**

- `AvatarStack.test.js`:
  - `initials={['OT','ED','BS','ZZ']}` renders exactly "OT", "ED", "BS" (no "ZZ").
  - Every ring wrapper has margin −2 (footprint 28). The second and third wrappers have `marginLeft` −6: the ring's −2 plus the −4 overlap. Later avatars paint over earlier ones, as on the board.
  - `initials={[]}` renders `toJSON() === null`.
  - No element exposes an accessibility label.
- `GroupChip.test.js`:
  - Assigned (`groupName="Group 1" color="#1565C0"`):
    - one button with the given `accessibilityLabel`, `minHeight` 44 and `marginVertical` −8;
    - an inner pill with `minHeight` 28, `borderRadius` 999, `borderWidth` 1.5, `borderColor: tints.control` and `backgroundColor: colors.surface`;
    - `GroupDot` `backgroundColor` "#1565C0" at 8×8;
    - the text "Group 1" with style `typeRoles.textChip` in `colors.text`;
    - a 14dp `chevron-down` in `colors.textSecondary`;
    - press calls `onPress` once.
  - Unassigned (`groupName={null}`):
    - text "Group" in `colors.warningText`;
    - pill `backgroundColor: colors.warningBg`, `borderColor: tints.warningControl`;
    - a 14dp `add` glyph;
    - no `group-dot`;
    - press calls `onPress`.
- `SyncBanner.test.js`. Mock `OfflineContext` as `__tests__/syncStatusBanner.test.js` does today:
  - `{ isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0 }`:
    - "3 items waiting to sync" in `typeRoles.textBodyStrong`;
    - a "Sync now" button whose press calls `onSyncNow` once;
    - the container has `minHeight` 56, `borderRadius` 18, `borderColor: tints.rule`, and **no** `accessibilityRole` or `accessibilityLiveRegion`.
  - Offline: "3 items will sync when you’re online", `queryByRole('button', { name: 'Sync now' })` is null.
  - Syncing: "Syncing 3 items…", no button.
  - `waitingCount: 0` → `toJSON()` null; `needsAttentionCount: 2` → null.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/AvatarStack.test.js __tests__/GroupChip.test.js __tests__/SyncBanner.test.js`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

- `GroupChip`: an outer `Pressable` (`accessibilityRole="button"`, `minHeight: 44`, `marginVertical: -8`, `justifyContent: 'center'`) around the pill. Assigned pill: padding 0 8 0 9, gap 6, `GroupDot`, name, `chevron-down` 14 Muted. Unassigned pill: padding 0 10 0 7, gap 4, Ionicons `add` 14 `warningText`, "Group" in `warningText`. The pill is a `minHeight`, so it grows at large text. The board draws "Group" at 800; `textChip` (700) is the nearest role, and no new role is added for one word.
- `SyncBanner`: a row with `minHeight: 56`, `borderRadius: borderRadius.lg`, 1dp `tints.rule` border, white fill, padding 8 16 8 14, gap 12. It holds an Ionicons `cloud-upload-outline` 22 in `colors.text`, the message (`flex: 1`, wraps) and, when `showSyncNow`, `BrandButton variant="tertiary" size="sm" label="Sync now" onPress={onSyncNow}`. Not a live region (overview S2: only the header pill speaks).

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, then `grep -rn "SyncStatusBanner" src __tests__`. Expected: PASS, and grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/children/AvatarStack.js src/components/children/GroupChip.js src/components/common/SyncBanner.js __tests__/AvatarStack.test.js __tests__/GroupChip.test.js __tests__/SyncBanner.test.js
git rm src/components/common/SyncStatusBanner.js __tests__/syncStatusBanner.test.js
git commit -m "feat(children): AvatarStack, GroupChip and SyncBanner (replaces the unused SyncStatusBanner)"
```

---

### Task 5: Row components

**Files:**
- Create: `src/components/children/ClassRow.js`, `src/components/children/ClassChildRow.js`
- Test: `__tests__/ClassRow.test.js`, `__tests__/ClassChildRow.test.js` (new)

**Interfaces:**
- Consumes: `Avatar`, `AvatarStack`, `GroupChip`, `SpinnerArc`, `StatusBadge`, `getInitials`, `countLabel`, `classRowLabel`.
- Produces (the frame and divider are applied by the screen's `renderItem`, not by the rows):
  - `ClassRow({ monogram, name, schoolName, grade, teacher, language, childCount, groupCount, rosterInitials: string[], unsynced, onPress })`.
  - `ClassChildRow({ child, groupName: string|null, groupColor?: string, onPressResults, onPressGroup, onPressLetterTracker, onPressEdit })`.

- [ ] **Step 1: Write the failing tests**

`ClassRow.test.js`, using the props from `classRowLabel`'s test (18 children, 4 groups, `rosterInitials={['OT','ED','BS']}`, monogram "1A"):
- One button labelled `classRowLabel(...)`; press calls `onPress`.
- It renders "1A", "Charles Duna Primary" (colour `colors.text`, style `textCaption`) and "Grade 1 • Ms Ndlovu • isiXhosa" (colour `colors.textSecondary`).
- The count line reads "18 children" (style `textChip`, ink) followed by " · 4 groups" (`textCaption`, Muted).
- `groupCount={0}` drops the groups part. `childCount={1}` gives "1 child". `childCount={0}` with `rosterInitials={[]}` gives "0 children" and no avatars.
- "Unsynced" (`StatusBadge` warning) renders only when `unsynced`.
- The container style has `minHeight` 64, padding 12/14/12/16, and pressed fill `tints.pressed` (assert the `style` function's pressed result).
- At `fontScale` 1 the name has `numberOfLines` 1; with `useWindowDimensions` mocked to `fontScale: 1.3` it has none.

`ClassChildRow.test.js` (child Amahle Dlamini, age 7, `synced: true`, `groupName="Group 1"`):
- Four separate buttons with the existing labels:
  - "View results for Amahle Dlamini";
  - "Change group for Amahle Dlamini, currently Group 1";
  - "Letter tracker for Amahle Dlamini";
  - "Edit Amahle Dlamini".
  - Each press calls only its own handler.
- The results button holds an `Avatar` with "AD" at 40, the name in `textRowTitle`, and an 18dp `chevron-forward`.
- "Age 7" renders. Age `null` renders no "Age" text and no separator.
- `groupName={null}` gives the "Assign group to Amahle Dlamini" chip.
- "Syncing…" (style `textNote`, Muted) with a 16dp `SpinnerArc` renders only for `synced: false`, and is not a live region.
- The two right-column buttons are `minWidth`/`minHeight` 44, with MaterialCommunityIcons `format-letter-case` 22 and Ionicons `create-outline` 24, both `colors.text`.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ClassRow.test.js __tests__/ClassChildRow.test.js` (wrap renders in `MotionProvider value` for the spinner).
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement to part 2's geometry**

- `ClassRow`: a `Pressable` row, gap 14, `alignItems: 'center'`.
  - `Avatar shape="tile" size={40}` with `alignSelf: 'flex-start'`.
  - A text column (`flex: 1`, `paddingRight: 30`):
    - line 1: the name and the badge, gap 8, `flexWrap: 'wrap'`;
    - school, then meta, each 2 above;
    - the count line 6 above: `AvatarStack`, gap 8, then one RN `Text` with nested spans and `fontVariant: ['tabular-nums']`.
  - A 20dp `chevron-forward` (Muted), absolutely positioned at `right: 14` and vertically centred (`top: 0, bottom: 0, justifyContent: 'center'`).
  - The monogram and avatars are hidden from accessibility.
- `ClassChildRow`: a container `View` (`flexDirection: 'row'`, `alignItems: 'flex-start'`, `minHeight: 72`, padding 6 6 10 16, gap 4), not a touchable.
  - Left column (`flex: 1`):
    - the results `Pressable` (`minHeight: 44`, row, gap 12, pressed `tints.pressed`): `Avatar`, then the name and chevron, gap 2;
    - the meta row (`paddingLeft: 52`, row, gap 8, `flexWrap: 'wrap'`, `alignItems: 'center'`), directly under the results button as the board draws it;
    - the "Syncing…" row (`marginTop: 8`, `paddingLeft: 52`, gap 6).
  - Right column: two 44×44 `Pressable`s, radius 22, pressed `tints.pressed`.
  - The name has `numberOfLines={fontScale > 1 ? undefined : 1}`, as in `ClassRow`.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/children/ClassRow.js src/components/children/ClassChildRow.js __tests__/ClassRow.test.js __tests__/ClassChildRow.test.js
git commit -m "feat(children): class row and class-detail child row with sibling buttons"
```

---

### Task 6: My Children screen

**Files:**
- Modify: `src/screens/main/ChildrenListScreen.js` (full view rewrite; the hooks and effects at lines 25–152 keep their logic)
- Modify: `src/navigation/AppNavigator.js` (`ChildrenList` option `title: 'Children'`; keep PR 1's `headerRight` sync pill)
- Modify: `__tests__/designSystemGuard.test.js` (delete the `src/screens/main/ChildrenListScreen.js` ratchet entry)
- Modify: `__tests__/ChildrenListScreenRefresh.test.js` (copy updates only)
- Test: `__tests__/ChildrenListScreen.test.js` (new), `__tests__/ChildrenStackOptions.test.js` (new)

**Interfaces:**
- Consumes: Tasks 2–5, `StatBar`, `SearchField`, `SyncBanner`, `ListGroup`/`ListRow`, `listGroupItemFrame`, `ListGroupDivider`, `SectionHeader`, `EmptyState`, `InlineLoading`, `BrandButton`, `useHeaderHairline`, `FAB_OVERHANG`.
- Produces: nothing new for later tasks.

**Layout decisions this task fixes:**
- **Loading state** is `(loading || classesLoading) && classes.length === 0`. Both contexts set `loading` on every pull, with cached classes on screen, so applying part 2's condition literally would blank the list, stats and the search field the EA is typing into on every refresh (Review Focus 1). With classes cached, a pull leaves the screen as it is.
- One `FlatList` (`data={filteredClasses}`). `ListHeaderComponent` is a JSX element of a **module-scope** component `ChildrenListHeader`, so it is never remounted and the search input keeps focus. It holds the stat bar, search, banner and the "Classes" label. `ListEmptyComponent` holds the state block. `ListFooterComponent` holds Unassigned and "Add another class".
- `renderItem` wraps each `ClassRow` in `View style={[listGroupItemFrame(index, filteredClasses.length), { marginHorizontal: 24 }]}`, plus `ListGroupDivider inset={70}` when `index > 0`.

- [ ] **Step 1: Write the failing tests**

`__tests__/ChildrenListScreen.test.js`:
- Mocks as in `ChildrenListScreenRefresh.test.js`, plus:
  - `@react-navigation/native` exposing `useNavigation: () => navigation` (for `useHeaderHairline`) and `useFocusEffect: (cb) => require('react').useEffect(() => cb(), [cb])`;
  - `../src/context/SignedInEAContext` returning `repositories.assessments.getAssessments` resolving `[]`;
  - a full `useOffline` value (`isOnline`, `isSyncing`, `waitingCount`, `needsAttentionCount`, `syncNow`, `refreshSyncStatus`).
- Render inside `PaperProvider` and `MotionProvider value`.
- Fixture: two classes in two grades, "Grade 1A" (school-1, 18 children via `getChildrenInClass`, 4 groups through `childrenGroups`, `synced: true`) and "Grade 2B" (`synced: false`, 0 children); one unassigned child `{ first_name: 'Lwazi', last_name: 'Booi', age: 7, gender: 'male' }`.

Tests, each named after the behaviour:
1. `renders the stat bar with accessible counts`:
   - `await findByLabelText('19 children')`, `getByLabelText('2 classes')`;
   - the unassessed button `getByRole('button', { name: '19 unassessed children. Open Assess' })` navigates `('MainTabs', { screen: 'Assessments' })`.
2. `unassessed at zero is plain text, not a button`: with `getAssessments` returning one assessment per child, `queryByRole('button', { name: /unassessed/ })` is null.
3. `class row content and navigation`:
   - the button labelled `classRowLabel` for Grade 1A shows "18 children", " · 4 groups" and the first three children's initials in list order;
   - press navigates `('ClassDetail', { classId: 'class-1' })`;
   - Grade 2B shows "0 children", no avatars and "Unsynced"; Grade 1A has no "Unsynced".
4. `monograms come from all classes, not the filtered list`: the monograms are "1" and "2"; after typing "1A" in the search, Grade 1A's monogram is still "1".
5. `search filters by class name, school and teacher and keeps the same input across re-renders`:
   - `const input = getByLabelText('Search classes')`, `fireEvent.changeText(input, 'Duna')`;
   - the result shows only the class at that school;
   - `expect(getByLabelText('Search classes')).toBe(input)`.
6. `a background pull keeps cached content` (Review Focus 1):
   - after typing "Gr", rerender with `classesLoading: true` and the same classes;
   - the same input instance still has `value` "Gr";
   - no "Loading classes and children…";
   - the stat labels are still present.
7. `no match`:
   - after typing "Grade 3": "No matching classes for “Grade 3”", "Searches class name, school and teacher.", and the header "Classes";
   - "Unassigned children (1)" and "Add another class" still render;
   - pressing "Clear search" brings both class rows back.
8. `loading with no classes`: "Loading classes and children…" renders; no `Search classes` input, no stat labels.
9. `checking`: `classBootstrapStatus: 'checking'`, no classes → "Checking for assigned classes…", and the stat labels render.
10. `no programme`: "Programme setup needed", "Ask Head Office to assign your active programme before creating a class.", "Then pull down to refresh."; no search input.
11. `no classes`:
    - "No classes yet" and "Create your first class to start adding children";
    - `getByRole('button', { name: 'Start setup' })` navigates `'ClassOnboarding'`;
    - no 📚 and no search input.
12. `banner follows the transport state`, with `waitingCount: 3`:
    - online: "3 items waiting to sync", and "Sync now" calls `syncNow` with `{ force: true }`;
    - `isOnline: false`: "3 items will sync when you’re online" and no "Sync now";
    - `isSyncing: true`: "Syncing 3 items…";
    - `waitingCount: 0`: no banner.
13. `banner counts waitingCount, not unsynced rows`: Grade 2B unsynced but `waitingCount: 0` → no banner; `waitingCount: 5` with every row synced → "5 items waiting to sync".
14. `unassigned row`: button "Lwazi Booi, Age 7 • Male. Not in a class. Edit to assign" navigates `('EditChild', { childId })`, with the hint "These children are not in a class yet. Tap to edit and assign them."
15. `Add another class` navigates `'CreateClass'`.
16. `list padding clears the Record button`: `FlatList` `contentContainerStyle` flattens to `paddingBottom: FAB_OVERHANG + 16`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, and the `RefreshControl` has `tintColor` and `colors` set to `colors.primary`.

`__tests__/ChildrenStackOptions.test.js`: mock `@react-navigation/native-stack` with a `Screen` that records `{ name, options }` (pattern: `__tests__/AppNavigator.headers.test.js`). Render `<AppNavigator signedIn />` and assert that `ChildrenList`'s options (resolved with a stub navigation) have `title: 'Children'` and a `headerRight`.

In `ChildrenListScreenRefresh.test.js`, change only `'Loading classes and children...'` → `'Loading classes and children…'` and `'Start Setup'` → `'Start setup'`. Every test stays.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ChildrenListScreen.test.js __tests__/ChildrenStackOptions.test.js __tests__/ChildrenListScreenRefresh.test.js`
Expected: FAIL on the new copy and structure.

- [ ] **Step 3: Implement**

Keep the four `useFocusEffect` blocks, `filteredClasses`, `getGroupCountForClass`, `onRefresh` and `unassignedChildren` exactly. Delete `totalUnsyncedCount` and its two counts: the banner reads `waitingCount` itself.

View, top to bottom, with spacing from part 2:
- `ChildrenListHeader`:
  - the stat bar (`paddingTop: 8`, `paddingHorizontal: 24`), hidden in the loading state and while `tabStats` is null;
  - `SearchField` 16 below (`placeholder="Search classes…"`, `accessibilityLabel="Search classes"`), only when `classes.length > 0`;
  - `SyncBanner onSyncNow={() => syncNow({ force: true })}` 12 below, 24 side margins, hidden in the loading state;
  - `SectionHeader title="Classes"` 18 below, then 10 to the list, only when `filteredClasses.length > 0` or in the no-match state.
- StatBar items:
  - `{ label: 'Children', value, accessibilityLabel: countLabel(n,'child','children') }`;
  - `{ label: 'Classes', value, accessibilityLabel: countLabel(n,'class','classes') }`;
  - `{ label: 'Unassessed', value, onPress, accessibilityLabel }` when `unassessedCount > 0`. The label is `` `${countLabel(n,'unassessed child','unassessed children')}. Open Assess` ``, and `onPress` navigates `('MainTabs', { screen: 'Assessments' })`. At 0 there is no `onPress`.
  - No `color` override (today's `colors.emphasis` goes).
- `ListEmptyComponent`, in today's precedence:
  - loading state → `InlineLoading label="Loading classes and children…"` 16 below the header;
  - no match → a row with a 20dp `search-outline` (Muted), gap 12, the message (`textRowTitle`) and the hint (`textCaption` Muted, 2 above), 12 below the "Classes" label;
  - checking → `InlineLoading label="Checking for assigned classes…"` 16 below the stats;
  - no programme → `EmptyState` 32 below the stats with:
    - `title="Programme setup needed"`;
    - `body="Ask Head Office to assign your active programme before creating a class."`;
    - a footnote row: a 16dp `refresh-outline` and "Then pull down to refresh." in `textNote` Muted, gap 6, 4 above;
  - no classes → `EmptyState` with `title="No classes yet"`, `body="Create your first class to start adding children"` and the action `BrandButton variant="primary" size="md" icon="add" label="Start setup"` → `navigate('ClassOnboarding')`.
  - All states are left-aligned at the 24 gutter and top-aligned (no centring, no `flex: 1` empty container).
- `ListFooterComponent` (not rendered in the loading state):
  - when there are unassigned children: `SectionHeader title={\`Unassigned children (${n})\`} hint="These children are not in a class yet. Tap to edit and assign them."`, 18 below the class rows (28 in the no-match state), then a `ListGroup` 10 below of `ListRow` with:
    - `lead={<Avatar size={40} label={getInitials(first,last)} />}`;
    - `title={\`${first} ${last}\`}`, `subtitle={childMetaLine(child)}`, `trailing="chevron"`;
    - `accessibilityLabel={\`${first} ${last}, ${meta}. Not in a class. Edit to assign\`}` (drop ", ${meta}" when the meta is empty);
    - `onPress` → `navigate('EditChild', { childId })`;
  - then, when `hasClasses`, `BrandButton variant="tertiary" icon="add" label="Add another class"` 6 below, `alignSelf: 'flex-start'`, `marginLeft: 20` (the 24 gutter less 4), → `navigate('CreateClass')`.
- `FlatList`:
  - `onScroll={useHeaderHairline()}`, `scrollEventThrottle={16}`;
  - `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`;
  - `contentContainerStyle={{ paddingBottom: FAB_OVERHANG + 16 }}`;
  - `RefreshControl` with `tintColor={colors.primary} colors={[colors.primary]}` and today's `onRefresh`.
- Class row props per item:
  - `monogram={classMonogram(cls, classes)}`;
  - `rosterInitials={getChildrenInClass(cls.id).slice(0, 3).map(c => getInitials(c.first_name, c.last_name))}`;
  - `schoolName={school?.name || 'Unknown school'}`;
  - `unsynced={!cls.synced}`.

Delete the `ChildrenListScreen.js` ratchet entry in `__tests__/designSystemGuard.test.js`.

- [ ] **Step 4: Run to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ChildrenListScreen.test.js __tests__/ChildrenStackOptions.test.js __tests__/ChildrenListScreenRefresh.test.js __tests__/designSystemGuard.test.js __tests__/AppNavigator.headers.test.js __tests__/MainTabNavigator.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/main/ChildrenListScreen.js src/navigation/AppNavigator.js __tests__/ChildrenListScreen.test.js __tests__/ChildrenStackOptions.test.js __tests__/ChildrenListScreenRefresh.test.js __tests__/designSystemGuard.test.js
# plus any primitive + test the Gap rule touched (for example src/components/dashboard/StatBar.js)
git commit -m "feat(children): Bold Red My Children list"
```

---

### Task 7: Class detail screen

**Files:**
- Modify: `src/screens/children/ClassDetailScreen.js`
- Modify: `src/navigation/AppNavigator.js` (`ClassDetail` options become `{ title: '' }`, so "Class Details" never flashes before `setOptions`)
- Modify: `__tests__/designSystemGuard.test.js` (delete the `ClassDetailScreen.js` ratchet entry)
- Test: `__tests__/ClassDetailScreen.test.js` (update and extend), `__tests__/ChildrenStackOptions.test.js` (one assertion)

**Interfaces:**
- Consumes: `ClassChildRow`, `listGroupItemFrame`, `ListGroupDivider`, `IconCircleButton`, `SectionHeader`, `BrandButton`, `InlineLoading`, `getGroupDotColor`, `useHeaderHairline`, `FAB_OVERHANG`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests** (in `ClassDetailScreen.test.js`; keep all four existing tests and update their copy)

- Add mocks:
  - `@react-navigation/native` with `...jest.requireActual(...)` and `useNavigation: () => navigation`;
  - `navigation.goBack`;
  - a render helper that wraps the screen in `MotionProvider value`.
- `'Loading class...'` → `'Loading class…'`.
- New tests:
  1. `header options carry the class name and Manage classes`:
     - `navigation.setOptions` was last called with `expect.objectContaining({ title: 'Grade R Blue' })`;
     - render that call's `headerRight()`, press "Manage classes", and assert `navigation.popToTop` was called once.
  2. `loading and not-found set an empty title`: `setOptions` was called with `title: ''`. "Class not found." renders.
  3. `class info`: "Masi Primary", "Grade R • Teacher A" and "Language: isiXhosa" render; the "Edit class" button navigates `('EditClass', { classId: 'class-1' })`; there is no Paper `Card` (the UNSAFE type query for Paper `Card` finds nothing).
  4. `Add child replaces the FAB`:
     - `getByRole('button', { name: 'Add child' })` navigates `('AddChild', { classId: 'class-1' })`;
     - the header "Children (1)" renders;
     - no Paper `FAB` is in the tree.
  5. `empty class`: "Children (0)", "No children in this class yet." and "Tap Add child to add a child."
  6. `group chips`:
     - Fixture: eight groups "Group 1"…"Group 8"; child A in "Group 1", child B in "Group 7", child C in none.
     - A's chip label is "Change group for … , currently Group 1".
     - B's `group-dot` `backgroundColor` equals A's (index 6 ≡ index 0).
     - C shows "Assign group to …".
     - Pressing a chip mounts `GroupPickerBottomSheet` (mock it to render a marker with its `childId`).
  7. `four separate controls per row`: the existing "opens child results from the row…" test passes unchanged, and "Letter tracker for Amahle Dlamini" navigates `('LetterTracker', { child, classItem })`.
  8. `Syncing… only for an unsynced child`.
  9. `list padding`: `contentContainerStyle` flattens to `paddingBottom: FAB_OVERHANG + 16`.
- `ChildrenStackOptions.test.js`: `ClassDetail` options `title` is `''`.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ClassDetailScreen.test.js __tests__/ChildrenStackOptions.test.js`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

- Replace today's `useLayoutEffect` with one that depends on `[navigation, classItem?.name]`:

```js
navigation.setOptions({
  title: classItem?.name ?? '',
  headerRight: () => (
    <BrandButton variant="tertiary" label="Manage classes" onPress={() => navigation.popToTop()} />
  ),
});
```

  Move the existing `popToTop` comment with it. Back is drawn by `ScreenHeader` (PR 1), so there is no screen code for it.
- `getChildGroup` is unchanged. The colour is now `getGroupDotColor(groupIndex)`; remove the `getGroupColor` import.
- Loading: `InlineLoading label="Loading class…"`, 16 below the header, padding 0 24. Not found: "Class not found." (`textBody`, Muted), 16 below, padding 0 24.
- One `FlatList` (`data={childrenInClass}`) with:
  - `ListHeaderComponent`:
    - class info, 6 below the header: row, gap 12, padding 0 24;
      - school in `textBodySemi` ink (fallback "Unknown school");
      - `` `${grade} • ${teacher}` `` and `` `Language: ${home_language}` `` in `textSmall` Muted;
      - `IconCircleButton icon="create-outline" accessibilityLabel="Edit class"` → `navigate('EditClass', { classId })`;
    - then, 20 below, `SectionHeader title={\`Children (${n})\`}` with `action={<BrandButton variant="tertiary" icon="add" label="Add child" onPress={() => navigation.navigate('AddChild', { classId })} />}`, then 10 to the list.
  - `renderItem` → a framed `ClassChildRow` with a `ListGroupDivider inset={68}` from index 1, and `marginHorizontal: 24`. Handlers:
    - results → `navigate('ChildResults', { child, classItem })`;
    - group → `openGroupPicker(child)`;
    - letter tracker → `navigate('LetterTracker', { child, classItem })`;
    - edit → `navigate('EditChild', { childId })`.
  - `ListEmptyComponent`: 14 below the section row, padding 0 24, "No children in this class yet." (`textRowTitle`, ink), then "Tap Add child to add a child." (`textCaption`, Muted, 2 above).
  - `onScroll={useHeaderHairline()}` and `contentContainerStyle={{ paddingBottom: FAB_OVERHANG + 16 }}`.
- Delete the `FAB` and every Paper import except what `GroupPickerBottomSheet` needs (none). Delete the `#000` shadow styles.
- Delete the ratchet entry.

- [ ] **Step 4: Run to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ClassDetailScreen.test.js __tests__/ChildrenStackOptions.test.js __tests__/designSystemGuard.test.js __tests__/childrenLanding.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/children/ClassDetailScreen.js src/navigation/AppNavigator.js __tests__/ClassDetailScreen.test.js __tests__/ChildrenStackOptions.test.js __tests__/designSystemGuard.test.js
git commit -m "feat(children): Bold Red Class detail; Add child link replaces the FAB"
```

---

### Task 8: One group colour in the picker and Edit child

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`, `src/screens/children/EditChildScreen.js`, `src/utils/groupHelpers.js` (delete `getGroupColor`)
- Test: `__tests__/GroupPickerBottomSheet.test.js`, `__tests__/EditChildScreen.test.js`, `__tests__/groupHelpers.test.js`

**Interfaces:**
- Consumes: `GroupDot`, `getGroupDotColor`.
- Decision: the group hue appears **only on the dot**. Today the picker's selected row tints its border, name and ✓ in the group colour, and Edit child tints its field border and name. As text, orange `#E65100` on white is 3.79:1 and fails AA. Those uses become ink (`colors.text`), matching the picker-sheet rule (overview §1.1 `SelectSheet`: "selected is ink, no red"). The dot keeps its current size in each place: these screens get the colour source, not a layout change.

- [ ] **Step 1: Write the failing tests**

- `GroupPickerBottomSheet.test.js`:
  - With eight groups, the `group-dot` of "Group 7" has the same `backgroundColor` as "Group 1", and every dot is in `GROUP_DOT_COLORS`.
  - The selected row's name colour is `colors.text`.
  - The zero-group virtual rows' dots are `getGroupDotColor(0..3)`.
- `EditChildScreen.test.js`:
  - Replace the `getGroupColor` mock with `getGroupDotColor: () => '#1565C0'`.
  - Add a test: with the child in a group, the group field shows a `group-dot` with `#1565C0` and the name in `colors.text`.
- `groupHelpers.test.js`: `expect(require('../src/utils/groupHelpers').getGroupColor).toBeUndefined()`.

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/GroupPickerBottomSheet.test.js __tests__/EditChildScreen.test.js __tests__/groupHelpers.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Picker:
  - `getGroupColor(i).text` becomes `getGroupDotColor(i)` through `GroupDot`, at today's dot size (`size={12}`);
  - the selected border, name and ✓ use `colors.text`;
  - nothing else changes (rows, copy, labels, the delete Alert).
- Edit child: in whatever shell PR 1 left the group field:
  - if it is still the custom touchable field, keep the shell and its default rest edge (no hued border), and render `GroupDot color={getGroupDotColor(groupIndex)}` before the name in ink;
  - if PR 1 made it a `SelectField` with no slot for a dot, apply the Gap rule: add an optional `valueLead` node to `SelectField`, rendered 8 before the value, with a test in its file.
- Delete `getGroupColor`, then run `grep -rn "getGroupColor" src __tests__`: it must print nothing.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, plus `__tests__/ClassDetailScreen.test.js __tests__/designSystemGuard.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js src/screens/children/EditChildScreen.js src/utils/groupHelpers.js __tests__/GroupPickerBottomSheet.test.js __tests__/EditChildScreen.test.js __tests__/groupHelpers.test.js
git commit -m "feat(children): one six-colour group dot across Class detail, the picker and Edit child"
```

---

### Task 9: Standing docs

**Files:**
- Modify: `documentation/design-system.md`, `documentation/build-log.md`, `documentation/ROADMAP.md`

- [ ] **Step 1: `design-system.md`**

Add a "Children components (Bold Red PR 2)" subsection listing each new piece with its path and one-line contract:
- `Avatar` (sizes, tile, ring, decorative);
- `getInitials`;
- `AvatarStack`;
- `GroupChip` / `GroupDot`;
- `SyncBanner` (count = `waitingCount`; hidden when synced or needs-attention; not a live region);
- `InlineLoading` / `SpinnerArc` (still under Reduce Motion);
- `listGroupItemFrame` / `ListGroupDivider` (use them when a `ListGroup` must be a virtualised `FlatList`).

Add the three `textInitials*` roles to the role table. Add a "Group colour" rule: `getGroupDotColor` is the only group colour; the hue appears only on the dot and the name is always printed; `GROUP_COLORS[].bg` has no consumer.

- [ ] **Step 2: `ROADMAP.md` §5**

In "Bold Red for the rest of the app", remove "My Children and Class detail" from "Remaining". No other item closes.

- [ ] **Step 3: `build-log.md`**

Append rows to the end of the Verification Register:
- the Task 1 baseline counts;
- each task's focused test command and result;
- the full-suite results from Task 10;
- the Gap-rule additions (or "none");
- the decisions in this plan's "Layout decisions" blocks and Task 8.

Append to the Decision Register:
- the loading-state condition (`… && classes.length === 0`), with its reason;
- the `FlatList` frame helper instead of a `ScrollView`;
- the initials type roles;
- the ink-not-hue rule for group text.

- [ ] **Step 4: Commit**

```bash
git add documentation/design-system.md documentation/ROADMAP.md documentation/build-log.md
git commit -m "docs(children): design system, roadmap and build log for Bold Red Children"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest` then `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: both PASS. The unit suite count is the baseline plus the new files, minus `syncStatusBanner.test.js`.

- [ ] **Step 2: Guards and leftovers**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/designSystemGuard.test.js __tests__/typography.test.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/paperTheme.test.js` and
`grep -nE "react-native-paper|fontSize|fontWeight|#[0-9A-Fa-f]{3,8}\b|My Children'|Class Details|Start Setup|Sync Now|\.\.\.\"" src/screens/main/ChildrenListScreen.js src/screens/children/ClassDetailScreen.js src/components/children/*.js src/components/common/{Avatar,SpinnerArc,InlineLoading,SyncBanner}.js`
Expected: the tests PASS. grep prints nothing (`GroupPickerBottomSheet.js` may still import Paper `IconButton`/`Divider`, which is allowed).

- [ ] **Step 3: Update the build-log rows** with the final counts and commit:

```bash
git add documentation/build-log.md
git commit -m "docs(build-log): Bold Red Children verification"
```

- [ ] **Step 4: The orchestrator runs `/codex:adversarial-review --base feat/bold-red-app`** and handles findings with the spec rounds' likely-and-costly judgement. Then it pushes and opens the PR (base `feat/bold-red-app`).

---

### Task 11: Device gate on the EAS preview build (manual gate for Jim)

Build a cloud EAS preview for iOS and Android (memory "Device-testing the SQLite backend"). Compare against the boards and record results and screenshots in the build log.

- [ ] **List:**
  - normal (two classes and one unassigned child);
  - unsynced (banner and badge);
  - offline (pill and banner copy);
  - the needs-attention pill (and no banner);
  - no match with the keyboard open;
  - loading, no programme, no classes;
  - a pull-to-refresh while a search term is typed (the field, term and stats stay).
- [ ] **Class detail:**
  - normal;
  - an unsynced child ("Syncing…" spinner turns; still under Reduce Motion / "Remove animations");
  - an unassigned child;
  - a free-text group ("Lions") and a group past the sixth (same dot in the picker and Edit child);
  - a long class name (two-line title);
  - no children.
- [ ] **A single-class EA:** still auto-routed into Class detail; "Manage classes" and Back both land on the list with no bounce back.
- [ ] **360×640 and 360×800 Android** (`wm size` / `wm density 320` on the A03s): the first class row is visible without scrolling, the stat labels are complete, and the first two child rows show on Class detail.
- [ ] **Largest system font on both platforms, and 1.3:**
  - no clipped text ("UNASSESSED", sync pill, chips, an "ECD" monogram);
  - the chip, letter tracker and edit buttons are separately tappable;
  - the class-detail title wraps.
- [ ] **Keyboard:** the search keeps focus while typing; the clear button and a class row work with the keyboard open; dragging the list dismisses it.
- [ ] **VoiceOver and TalkBack:**
  - order: header first, then stats, search, banner, rows;
  - each child row reads as four separate controls with their labels;
  - avatars and monograms are skipped;
  - the banner is not announced.
- [ ] **Bottom clearance:** the last row and "Add another class" clear the Record button at rest.
- [ ] **Touch overlap:** the group chip's 44 target and the results button do not steal each other's taps (tap the chip's top edge and the name's bottom edge).
- [ ] **Home row:** Home is pixel-identical to the PR 1 build.
