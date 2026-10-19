# Bold Red app, part 2: Children

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Children tab: My Children list and Class detail

**Boards (target):** `red-children-final` (= `red-flow-09-children`, byte-identical once the tab bar is
removed), `red-children-class-detail` (= `red-flow-10-class-detail`), states `red-children-s-unsynced`,
`-s-nomatch`, `-s-empty`, `-s-programme`, `-s-loading`, `-s-detail-empty`, and the decisions on
`red-children-components` (row C "roster preview", monogram "= grade", unassigned row A, header sync
A "glyph + count", type-led empty states, dot chip A). `red-children-v-by-school` is a variant and is
not built.

**Code:** `src/screens/main/ChildrenListScreen.js`, `src/screens/children/ClassDetailScreen.js`,
the `ChildrenStackNavigator` in `src/navigation/AppNavigator.js:79-114`,
`src/components/dashboard/StatBar.js`, `src/components/common/SyncIndicator.js`,
`src/components/children/GroupPickerBottomSheet.js`, `src/utils/groupHelpers.js`,
`src/constants/groupColors.js`.

**Scope rule:** look and reusable components only. Every behaviour below is unchanged unless it is
listed under "Behaviour changes". No schema, RLS, payload, or outbox change; every number on these
boards can be computed from data the screens already load (see "Data check").

### Data check: what the boards show vs what the code computes today

| Board element | Source today | Computable? |
|---|---|---|
| Stat "24 Children" | `getChildrenTabStats(...).childrenCount` = visible children (`hidden_at is null`), including unassigned | Yes, unchanged |
| Stat "2 Classes" | `.classCount` = all non-archived classes, including classes with no children | Yes, unchanged |
| Stat "3 Unassessed" | `.unassessedCount` = visible children with no assessment by this EA (`getAssessments({ userId })`) | Yes, unchanged |
| Row "18 children" | `getChildrenInClass(cls.id).length` (delivery-scoped visible children) | Yes, unchanged |
| Row "· 4 groups" | `getGroupCountForClass` (distinct groups with at least one child of the class) | Yes, unchanged |
| Roster avatars (3 initials) | first three of `getChildrenInClass(cls.id)`, which is ordered `first_name, last_name` (`childrenRepository.js:286`) | Yes. Board names are mock data and not in that order; the build uses the real order, which is the order Class detail lists them (the board's stated intent) |
| Class monogram ("1A", "R", "ECD") | `classes.grade` (required, one of `GRADES` in `src/constants/options.js`) and `classes.name` | Yes, new pure function |
| "Unsynced" badge | `cls.synced === false`/falsy, as today | Yes, unchanged |
| Banner "3 items waiting to sync" | `totalUnsyncedCount` = unsynced classes + unsynced children | Yes, unchanged (but see Question 1) |
| Header pill "3 waiting" | `useOffline().waitingCount` via `deriveSyncState` | Yes, unchanged |
| Group dot colour | `getGroupColor(index)` over the EA's `groups` sorted with `compareGroups` | Yes, new six-colour dot cycle (below) |
| Child "Age 7" | `child.age` | Yes, unchanged |
| Unassigned "Age 7 • Male" | `child.age`, `child.gender` | Yes. Today the raw value prints ("male"); the board shows the label ("Male"): use the `GENDER_OPTIONS` label |

Nothing on these boards needs new data.

### Shared pieces this section consumes

Names are proposals for the reconciliation step. "Shared-look PR" means the first delivery PR.

| Component | Origin | Used for |
|---|---|---|
| `ScreenHeader` | **New, shared-look PR.** Canvas header: Bricolage `title` role, optional 44 left icon button, right slot. A 1px `colors.text + '1F'` hairline appears only after content scrolls under it (RedSystemSheet §05) | Both screens |
| `IconCircleButton` | **New, shared-look PR.** 44x44, radius 22, `colors.surface`, 1.5 border `colors.text + '33'`, 22dp ink Ionicons outline glyph | Back, Edit class |
| `SyncIndicator variant="pill"` | **New variant of the existing `SyncIndicator`**, next to Home's `variant="hero"`. Same `deriveSyncState` / `describeSyncState`, no new logic | Children header right slot (and every tab-root header) |
| `StatBar` | **Existing, restyled in the shared-look PR** to the bare stat bar (it is also used by Assessments, Sessions and the three Insights ranking screens, so the restyle reaches them all) | Children stats |
| `SearchField` | **New, shared-look PR**, replaces Paper `Searchbar` here (also used by `AssessmentChildSelectScreen`, `ChildSelector`) | Class search |
| `SyncBanner` | **New, shared-look PR** (RedSystemSheet "Banner · lists with pending items") | Unsynced banner |
| `GroupedSurface` + `ListRow` | **New, shared-look PR.** White, 1px `colors.text + '1F'` border, radius 18, `overflow: hidden`, inset `colors.border` dividers, never after the last row | Class rows, unassigned rows, child rows |
| `Avatar` | **New, shared-look PR** (Home's "who to see next" initials were removed with that section, so nothing in `src/components/home/` is reusable). Round, `colors.red50` fill, `colors.red700` initials, Figtree 800 | Child rows, unassigned rows, roster preview (28 size) |
| `Monogram` | **New, shared-look PR.** 40x40, radius 14 (`borderRadius.md`), `red50` fill, `red700` text, Figtree 800 15 | Class rows |
| `StatusBadge` | **New, shared-look PR.** 22 high pill, `warningBg` / `warningText`, Figtree 800 12/16 | "Unsynced" |
| `TextLinkButton` | **New, shared-look PR.** Tertiary: `red600`, `textButton` (Figtree 800 15/20), optional leading 18dp icon, 44 high | "Add another class", "Add child", "Manage classes", "Sync now" |
| `PrimaryButton` | **New, shared-look PR.** Red 600 pill | "Start setup" |
| `EmptyState` | **New, shared-look PR.** Type-led, left-aligned, no emoji or illustration | No classes / Programme setup / Class has no children |
| `InlineLoading` | **New, shared-look PR.** 22dp spinner arc + one line | Loading, checking |
| `AvatarStack` | **New, this PR**, `src/components/children/`. Up to three 28dp `Avatar`s | Class row roster preview |
| `GroupChip` | **New, this PR**, `src/components/children/`. Dot chip + amber assign chip | Class detail child rows (and see Builder's calls for the picker/Edit child) |
| `classMonogram(cls, allClasses)` and `childInitials(child)` | **New pure functions**, `src/utils/childrenPresentation.js` | Monogram, avatars |

If the shared-look PR does not ship one of these, this PR builds it under `src/components/common/`
with the spec above. It does not build a screen-local copy.

### Type roles

`typeRoles` has `displayXL`, `displayNumeral`, `displayM`, `textBody`, `textBodyStrong`,
`textCaption`, `textLabel`, `textButton`. The boards need four more. They match the RedSystemSheet
role names, so the shared-look PR is their natural home:

| Proposed role | Value | Used for |
|---|---|---|
| `displayTitle` | Bricolage 800, 28/32, letter spacing -0.56 | Screen titles; stat numerals (plus `fontVariant: ['tabular-nums']`) |
| `displayS` | Bricolage 800, 24/28, letter spacing -0.48 | Empty-state titles |
| `textRowTitle` | Figtree 700, 16/22 | Class name, child name, no-match and detail-empty headline |
| `textSectionLabel` | Figtree 800, 12/16, letter spacing 0.96, uppercase | "CLASSES", "UNASSIGNED CHILDREN (1)", "CHILDREN (5)" |

Board text at 14/20 (Class detail meta lines, banner "Sync now") and 15/22 (body) has no role.
Builder's call: 14/20 meta lines use `textBody` at 14/20 as a local size override with the role's
family (`textMeta` if the reconciliation step wants a role). 15/22 body uses `textBody` (15/20).
Board weight 600 appears four times (Class detail school line, "Syncing…", loading line, "Then pull
down to refresh."). Figtree 600 is not loaded, so 600 maps to `fontFamilies.textBold` (700). Never set
`fontWeight` together with a custom family (the Android rule, enforced by `__tests__/typography.test.js`).

### Colour map

Every board hex maps to an existing token. **No new colour token.** Translucent fills are written as
token plus alpha (design-system rule):

| Board value | Token |
|---|---|
| `#F8F5F4` page | `colors.background` |
| `#FFFFFF` surfaces | `colors.surface` |
| `#221A1B` | `colors.text` |
| `#76696B` | `colors.textSecondary` |
| `#ECE5E4` dividers, clear-button disc | `colors.border` |
| `#C81F3E` links, Unassessed, Start setup fill | `colors.red600` (also `primaryDark`) |
| `#FDECEF` / `#A4182F` monogram and avatars | `colors.red50` / `colors.red700` |
| `#FFF8E1` / `#8A4B00` Unsynced badge, assign chip, attention pill | `colors.warningBg` / `colors.warningText` |
| `#B26A00` attention glyph | `colors.warning` |
| `#3FA535` synced glyph | `colors.success` |
| `rgba(34,26,27,.12)` card borders, stat dividers, pill border | `colors.text + '1F'` |
| `rgba(34,26,27,.20)` control borders (search, circle buttons, group chip) | `colors.text + '33'` |
| `rgba(34,26,27,.06)` search focus halo, pressed fill | `colors.text + '0F'` |
| `rgba(164,24,47,.18)` roster avatar border | `colors.red700 + '2E'` |
| `rgba(178,106,0,.38)` assign chip border | `colors.warning + '61'` |
| `rgba(178,106,0,.30)` attention pill border | `colors.warning + '4D'` |
| `0 10 22 rgba(200,31,62,.22)` Start setup shadow | Shared-look PR's primary-button shadow (proposed `shadows.primaryButton`: colour `red600`, offset 0/10, opacity 0.22, radius 11, elevation 4). Not defined here |
| Group dots `#1565C0 #2E7D32 #E65100 #7B1FA2 #00695C #283593` | `GROUP_COLORS[i].text` in `src/constants/groupColors.js`, kept as categorical data, not tokens |

Removed from these screens: Paper `Banner` on `colors.accent`, the `#000` row shadow on Class detail
rows, `elevation: 1` cards, radius 8, `colors.primary` (red500) count text and icons, the amber
`colors.accent` "Syncing…" line, and the FAB.

### Contrast (checked, WCAG 2.1)

| Pair | Ratio | Result |
|---|---|---|
| `textSecondary` on `background` (labels, hint, meta on canvas) | 4.84 | Pass |
| `textSecondary` on `surface` (meta in rows, placeholder) | 5.25 | Pass |
| `red600` on `background` (links, Unassessed) | 5.20 | Pass |
| `red600` on `surface` | 5.64 | Pass |
| white on `red600` (Start setup) | 5.64 | Pass |
| `red700` on `red50` (monogram, avatars, including 11dp roster initials) | 6.70 | Pass |
| `warningText` on `warningBg` (Unsynced, "Group" assign chip, attention pill) | 6.40 | Pass |
| `success` synced glyph on white (graphic, needs 3:1) | 3.16 | Pass |
| Group dots on white (graphic, needs 3:1) | 3.79 (orange) to 10.39 | Pass. The board drops `#C62828` (reads as brand red) and `#F57F17` (2.65:1, fails) |
| Search field and circle-button border `text + '33'` on canvas | 1.40 | **Fails 1.4.11's 3:1 for a component boundary.** Accepted: the field is identified by its white fill, the 5.25:1 magnifier and the placeholder; circle buttons by their 13.7:1+ ink glyph. Same as the system input. Flagged, not changed |
| Assign chip border `warning + '61'` on `warningBg` | 1.60 | Decorative; the chip is identified by its 6.40:1 text and icon. Pass |

### My Children list (`ChildrenListScreen`)

#### Header

- The stack's native header goes: `ChildrenList` gets `headerShown: false` and renders
  `ScreenHeader` itself. Title **"Children"** (was the native title "My Children"; matches the tab
  label). The tab `Screen` option `title: 'My Children'` is unused (`headerShown: false` on the tab)
  and stays.
- Layout: top padding `insets.top + 15`, 24 side padding, 6 bottom; the title row is 32 high.
  Title `displayTitle`, `colors.text`, one line, ellipsis (a one-word title never truncates in
  practice), `accessibilityRole="header"`.
- Right slot: `SyncIndicator variant="pill"`, 44x44 hit area (the 32-high pill has -6 vertical
  margin). Navigates to `SyncStatus`, as today.
- Status bar: dark content (the root setting; only Home switches to light).

#### Header sync pill (`SyncIndicator variant="pill"`), board components §03 A

White pill, height 32, radius 16, 1px `colors.text + '1F'` border, text Figtree 800 14/18
(`textButton` at 14/18) `colors.text`, tabular numbers, gap 6, glyph 18dp.

| State | Glyph (Ionicons outline) | Content | Padding |
|---|---|---|---|
| `synced` | `cloud-done-outline`, `colors.success` | glyph only, pill 36 wide | 0 |
| `waiting` | `cloud-upload-outline`, `textSecondary` | "{n} waiting" | 0 12 0 9 |
| `offline` | `cloud-offline-outline`, `textSecondary` | "{n} waiting" | 0 12 0 9 |
| `syncing` | 18dp spinner arc, `textSecondary` | glyph only, 36 wide | 0 |
| `needs_attention` | `warning-outline`, `colors.warning`; pill fill `warningBg`, border `warning + '4D'` | "{n}" in `warningText`, then a 14dp `chevron-forward` in `warningText` | 0 6 0 9 |

- Counts above 99 show "99+". Pill text caps at `maxFontSizeMultiplier={1.2}` and the pill grows
  with its line height (plain `View` + `Text`, not Paper `Badge`).
- Label: `Open sync status, ${describeSyncState(...).accessibilityLabel}` (today's default variant
  label, unchanged), role button.
- Reduce Motion on: the spinner does not rotate (same `AccessibilityInfo.isReduceMotionEnabled`
  check as the hero variant).
- The existing default variant stays for any other caller until its screen moves to `ScreenHeader`.

#### Stat bar (restyled `StatBar`)

- 8 below the header, 24 side padding. Three equal columns (`flex: 1`), no card. Columns 2 and 3
  have 16 left padding and a 1px `colors.text + '1F'` left border. Each column is at least 56 high,
  top-aligned, gap 2.
- Numeral `displayTitle` + tabular, `colors.text`. Label `textLabel` (11/14, Figtree 800, caps;
  the board's 0.88 tracking vs the role's 1.1 is close enough: builder's call), `textSecondary`.
- **Unassessed > 0:** the column is a button. Numeral and label in `red600`, with an 18dp
  `chevron-forward` in `red600` right after the numeral (gap 2). Tap navigates
  `MainTabs` → `Assessments`, as today. Label "{n} unassessed children. Open Assess" (was
  "View Unassessed: {n}").
- **Unassessed = 0:** plain text in `colors.text` / `textSecondary`, not a button (today it is
  `colors.primary`).
- Other columns: one accessible text element each, "{n} children", "{n} classes".
- Numerals and labels cap at `maxFontSizeMultiplier={1.2}`. "UNASSESSED" is one word and cannot wrap;
  the label also gets `numberOfLines={1}` + `adjustsFontSizeToFit` + `minimumFontScale={0.85}` as a
  safety net for a 360dp phone at 1.2. The device check confirms it is never clipped.
- Hidden while loading (see States). Shown in every other state, including empty and
  no-programme (0 / 0 / 0, Unassessed plain).

#### Search (`SearchField`)

- 16 below the stat bar. Height 48, radius 14, white, 1.5 border `colors.text + '33'`, 16 left
  padding, 20dp `search-outline` `textSecondary`, gap 10. Input text Figtree 500 16/20
  `colors.text`; placeholder **"Search classes…"** (ellipsis character; was "Search classes...") in
  `textSecondary`. Keeps `NO_TEXT_SUGGESTIONS`. Label "Search classes".
- Focused: 2px `colors.text` border, a 4dp `colors.text + '0F'` halo (an outer ring view; RN has no
  spread shadow), magnifier in `colors.text`.
- With text: a 44x44 clear button at the right ("Clear search"): a 22dp `colors.border` disc with a
  14dp ink `close` glyph. Clears the term and keeps focus.
- **Hidden when the EA has no classes** (`classes.length === 0`): loading, checking, empty, and
  no-programme states. Shown, with the term kept, in the no-match state.
- Search behaviour is unchanged: class name, school name, teacher, case-insensitive.

#### Unsynced banner (`SyncBanner`), board `-s-unsynced`

- 12 below the search, 24 side margins. White, radius 18, 1px `colors.text + '1F'` border, min height
  56, padding 8 16 8 14, gap 12, `accessibilityRole` none and `accessibilityLiveRegion` off (not
  announced). 22dp `cloud-upload-outline` ink glyph; text `textBodyStrong` `colors.text`.
- Shown when `totalUnsyncedCount > 0`, as today. Count source unchanged (see Question 1).
- Copy and action by transport state, from the RedSystemSheet banner (state from `useOffline()`;
  only the copy and button visibility change, not the sync logic):
  - online, not syncing: **"{n} item(s) waiting to sync"** + `TextLinkButton` **"Sync now"** (was
    "Sync Now"), 14/20 Figtree 800, 44 hit, calls `syncNow({ force: true })` as today.
  - offline: **"{n} item(s) will sync when you’re online"**, no button (today "Sync Now" shows
    offline and does nothing useful).
  - syncing: **"Syncing {n} item(s)…"**, no button.
- Needs-attention is not shown in this banner: the header pill already carries it in amber.

#### Classes section

- Section label **"CLASSES"** (`textSectionLabel`, `textSecondary`), 18 below the previous block,
  then the `GroupedSurface` 10 below. Shown only when `filteredClasses.length > 0` or in the no-match
  state.
- **Class row** (whole row is one button → `ClassDetail { classId }`, as today). Min height 64,
  padding 12 14 12 16, gap 14, `align-items: center`. Pressed: `colors.text + '0F'` fill.
  1. `Monogram`, aligned to the top.
  2. Text column (`flex: 1`, 30 right padding to clear the chevron):
     - Line 1: class name (`textRowTitle`, `colors.text`) + `StatusBadge` **"Unsynced"** (gap 8)
       when the class is unsynced. One line with ellipsis at normal size; wraps when text is
       enlarged (builder's call, the Home no-truncation rule).
     - Line 2: school name, `textCaption`, **`colors.text`** (not muted), 2 above. Fallback
       "Unknown school", as today.
     - Line 3: "{grade} • {teacher} • {home_language}", `textCaption`, `textSecondary`, 2 above
       (same string as today).
     - Line 4, 6 above: `AvatarStack` (first three children, 28dp, -4 overlap, each with a 1px
       `red700 + '2E'` border and a 2px `colors.surface` ring), gap 8, then **"{n} child(ren)"**
       (`textCaption` in `textBold`, `colors.text`) + **" · {g} group(s)"** (`textCaption`,
       `textSecondary`), tabular. The groups part is hidden at 0; "1 child", "1 group" singular, as
       today. No avatars when the class has no children ("0 children").
  3. 20dp `chevron-forward` `textSecondary`, 14 from the right edge, vertically centred.
  4. Inset divider from x=70 to the right edge, not after the last row.
- Row label: "{name}, {school}, {grade}, {teacher}, {language}, {n} children, {g} groups[,
  unsynced]. Open class". Avatars and monogram are hidden from accessibility.
- **Monogram rule** (`classMonogram`, from the components board "Monogram = grade · chosen"):
  - Grade code: `ECD` → "ECD", `Grade R` → "R", `Grade N` → "N" (strip a leading "Grade ").
  - If every class in the EA's list shares one grade, use the name code instead, so stacked rows do
    not all say "1": the class name with a leading "Grade " (case-insensitive) removed, trimmed and
    uppercased, when that is 1–3 characters ("Grade 1A" → "1A", "1B" → "1B"). Otherwise fall back to
    the grade code ("Sunflowers" in an all-ECD list → "ECD"). The fallback is my call; the board does
    not define a name code for free-text names.
  - Computed over all classes, not the filtered list, so a search does not change monograms.

#### Unassigned children section

- Shown when there are visible children with no `class_id`, as today, in the list footer (also in
  the no-match state).
- 18 below the classes surface (28 in the no-match state). Label **"UNASSIGNED CHILDREN ({n})"** (was
  "Unassigned Children ({n})"; written sentence case, drawn uppercase by the role). Hint **"These
  children are not in a class yet. Tap to edit and assign them."** (unchanged), `textCaption`
  `textSecondary`, 4 above / 10 below.
- `GroupedSurface` of rows. Each row is one button → `EditChild { childId }`, as today. Min height
  64, padding 10 14 10 16, gap 12: 40dp `Avatar` (14dp initials), name (`textRowTitle`), meta
  "Age {age} • {Gender label}" (`textCaption`, `textSecondary`, tabular; parts omitted when empty, as
  today), 20dp `chevron-forward` `textSecondary`. Divider inset from x=68. Replaces the amber
  `account-alert-outline` icon (components board 02 A: the hint carries the meaning).
- Row label: "{first} {last}, {meta}. Not in a class. Edit to assign".

#### Add another class

- `TextLinkButton` with a leading 18dp `add` glyph: **"Add another class"** (was centred "+ Add
  another class", 14, `colors.primary`). Left-aligned at the 24 gutter (-4 margin so the glyph sits
  on the gutter), 6 below the last section, 44 high. Shown when `hasClasses`, as today. Navigates
  `CreateClass`. Label "Add another class" (unchanged).

#### States

| State | Condition (unchanged) | What shows |
|---|---|---|
| Loading | `loading \|\| classesLoading` | Header only, then `InlineLoading` 16 below: 22dp `red600` spinner arc + **"Loading classes and children…"** (was "..."), `textBodyStrong` `colors.text`, left-aligned at the gutter. No stats, search, or banner. Board `-s-loading` |
| Checking | `classBootstrapStatus === 'checking'` | Same layout, **"Checking for assigned classes…"**. Stats show (they have loaded) |
| No programme | `'no_active_programme'` | Stats (0/0/0), no search. `EmptyState` 32 below the stats: **"Programme setup needed"** (`displayS`), **"Ask Head Office to assign your active programme before creating a class."** (`textBody`, `textSecondary`, max width 320), then a new line **"Then pull down to refresh."** (`textCaption` in `textBold`, `textSecondary`, 16dp `refresh-outline` glyph, 4 above). Pull-to-refresh is the existing `RefreshControl`. Board `-s-programme` |
| No classes | everything else with `classes.length === 0` | Stats (0/0/0), no search. `EmptyState`: **"No classes yet"**, **"Create your first class to start adding children"** (unchanged), `PrimaryButton` with a leading `add` glyph **"Start setup"** (was "Start Setup"), 12 above, height 44, padding 0 20 0 16. Navigates `ClassOnboarding`, as today. No 📚 emoji. Board `-s-empty`. (Rarely seen: the screen already auto-enters onboarding on a confirmed-empty bootstrap) |
| No match | `searchTerm && classes.length > 0` and no class matches | Search with the term and clear button. "CLASSES" label, then 12 below: a 20dp `search-outline` `textSecondary` glyph, gap 12, **"No matching classes for “{term}”"** (curly quotes; was straight quotes) in `textRowTitle`, and the new hint **"Searches class name, school and teacher."** (`textCaption`, `textSecondary`, 2 above). Unassigned section and "Add another class" stay. Board `-s-nomatch` |
| Unsynced | `totalUnsyncedCount > 0` | Banner as above; "Unsynced" badges on unsynced classes. Board `-s-unsynced` |
| Offline | `!isOnline` | Header pill offline state; banner offline copy. No other change |

- Empty and loading content is left-aligned at the 24 gutter, top-aligned (no longer centred in the
  page).
- Every title in these states has `accessibilityRole="header"`. The loading line has
  `accessibilityLiveRegion="polite"`.

#### Scrolling, keyboard, small phones, large text

- The header stays fixed. Stat bar, search, banner, and the sections all scroll together: they move
  into the `FlatList` `ListHeaderComponent` (today the stats, search, and banner are fixed above the
  list and take about 250dp of a 640dp screen). The header hairline appears once the list scrolls.
- `ListHeaderComponent` is passed as a stable element (a memoised component, not an inline render
  function that remounts), so the search input keeps focus and the keyboard while the list filters.
  Test this on device.
- `keyboardShouldPersistTaps="handled"` (clear button and rows work with the keyboard open);
  `keyboardDismissMode="on-drag"`.
- Bottom padding of the list content: `FAB_OVERHANG + 16`, so the last row or link clears the Record
  button's ring. Export `FAB_OVERHANG` from `LockedBottomTabBar` instead of the local constant in
  `HomeScreen.js:34` (builder's call).
- 360x640: header, stats, search, the "CLASSES" label, and at least the first class row are visible
  without scrolling at normal text size.
- Large text (1.3 and the largest system size): everything except the capped elements (stat
  numerals and labels, sync pill text, roster initials at `maxFontSizeMultiplier={1.2}`) scales;
  class names and meta lines wrap; nothing is clipped; every control keeps a 44 minimum and stays
  separately tappable.
- Pull-to-refresh: unchanged (`syncNow({ force: true })`, one children pull, one classes pull,
  `refreshSyncStatus({ autoTrigger: false })`). Spinner tint `red600`.

### Class detail (`ClassDetailScreen`)

#### Header

- `ClassDetail` gets `headerShown: false` and renders `ScreenHeader`. The `useLayoutEffect` that sets
  `headerRight` is removed.
- Top padding `insets.top + 9`, 24 sides, 6 bottom, `align-items: flex-start`, gap 12:
  - Left: `IconCircleButton` `chevron-back` (22dp ink), label "Back", calls `navigation.goBack()`
    (today's `HeaderBackButton` chevron + red "Back" text goes).
  - Title: **the class name** (was the fixed "Class Details"), `displayTitle`, `colors.text`, 6 top
    padding so it centres on the 44 buttons, wraps (Android `textBreakStrategy="balanced"`; iOS
    wraps normally), `accessibilityRole="header"`. Long names ("Grade 1 Afternoon") take two lines;
    the side buttons stay top-aligned.
  - Right: `TextLinkButton` **"Manage classes"**, 44 high, padding 0 2, calls
    `navigation.popToTop()`, as today (the comment about not resetting `hasAutoRouted` moves with it).

#### Class info

- 6 below the header, 24 sides, a row with gap 12:
  - Text column: school name (`textBodyStrong` at 15/22, `colors.text`; fallback "Unknown school"),
    "{grade} • {teacher}" (14/20 Figtree 500, `textSecondary`), "Language: {home_language}" (same).
    Copy unchanged.
  - `IconCircleButton` pencil (`create-outline`), label "Edit class", navigates
    `EditClass { classId }`, as today (was a Paper contained-tonal `IconButton`).
- The white header `Card` goes; the info sits bare on the canvas.

#### Children section

- 20 below the info. Row: label **"CHILDREN ({n})"** (`textSectionLabel`; was a `titleMedium`
  "Children ({n})") and, right-aligned, `TextLinkButton` with a leading 18dp `add` glyph **"Add
  child"**, -12 vertical margin so the 44 target does not grow the 20-high row. Navigates
  `AddChild { classId }`.
- **The FAB is removed**; "Add child" replaces it (same destination). Label "Add child".
- `GroupedSurface` 10 below.

#### Child row

The row is no longer one big `TouchableOpacity` with nested touchables. It is a container with
sibling buttons (each its own accessible element):

- Container: min height 72, padding 6 6 10 16, gap 4, `align-items: flex-start`. Divider inset from
  x=68, not after the last row.
- **Results button** (left column, top): min height 44, gap 12: 40dp `Avatar` (14dp initials), name
  (`textRowTitle`, one line with ellipsis at normal size, wraps when enlarged), 18dp
  `chevron-forward` `textSecondary` (gap 2). Navigates `ChildResults { child, classItem }`, label
  "View results for {first} {last}" (unchanged). Pressed: `colors.text + '0F'` fill on the button.
- **Meta line**, 52 left inset (under the name), gap 8: "Age {age}" (`textCaption`, `textSecondary`,
  tabular; omitted when no age, as today, with no " · " separator) and the `GroupChip`.
- **`GroupChip`, assigned** (components board 04 A "dot chip"): a 44-high button (-8 vertical
  margin) around a 28-high pill, radius 999, white, 1.5 border `colors.text + '33'`, padding 0 8 0 9,
  gap 6: an 8dp dot in the group's dot colour, the group name (`textCaption` in `textBold`,
  `colors.text`), a 14dp `chevron-down` `textSecondary`. Replaces today's tinted chip, the "Group:"
  prefix, and the "▾" character. Label "Change group for {first} {last}, currently {group}"
  (unchanged). Opens `GroupPickerBottomSheet`, as today.
- **`GroupChip`, unassigned:** same 44 button around a 28-high pill, `warningBg`, 1.5 border
  `warning + '61'`, padding 0 10 0 7, gap 4: a 14dp `add` glyph and **"Group"** in `warningText`,
  Figtree 800 13/18 (was "+ Group", 11, dashed border). Label "Assign group to {first} {last}"
  (unchanged).
- The 8 gap between the name line and the meta line keeps the chip's 44 target off the results
  button (components board "chip hit area").
- **Unsynced child** (`!item.synced`, as today): a status line 8 below the meta, 52 left inset: a 16dp
  `textSecondary` spinner and **"Syncing…"** (`textCaption` in `textBold`, `textSecondary`; was amber
  `accent` at 11). Not a live region. Reduce Motion on: the spinner is still.
- **Right column** (top-aligned, no gap): two 44x44 icon buttons, ink glyphs (were 30dp `primary`
  Paper `IconButton`s):
  - Letter tracker: MaterialCommunityIcons `format-letter-case` ("Aa"), 22dp, label "Letter tracker
    for {first} {last}" (unchanged), navigates `LetterTracker { child, classItem }`.
  - Edit: `create-outline`, 24dp, label "Edit {first} {last}" (unchanged), navigates
    `EditChild { childId }`.
- **Group dot colour:** a group's colour still comes from its index in the EA's groups sorted with
  `compareGroups`. Dot mode cycles six colours: `GROUP_COLORS` text hues without pink `#C62828` and
  amber `#F57F17`. Add `getGroupDotColor(index)` to `groupHelpers.js`, cycling
  `GROUP_DOT_COLORS = GROUP_COLORS.filter(...)` defined in `groupColors.js`. The colour is never the
  only cue (the name is always printed).

#### States

| State | Condition (unchanged) | What shows |
|---|---|---|
| Loading | `loading` | `ScreenHeader` with back and no title; `InlineLoading` **"Loading class…"** (was "Loading class...") 16 below, left-aligned |
| Not found | no `classItem` | `ScreenHeader` with back and no title; **"Class not found."** (`textBody`, `textSecondary`) 16 below. No board: my call |
| No children | `childrenInClass.length === 0` | Section row "CHILDREN (0)" + "Add child"; 14 below: **"No children in this class yet."** (`textRowTitle`, `colors.text`) and **"Tap Add child to add a child."** (`textCaption`, `textSecondary`, 2 above; was "Tap the + button to add a child."). Left-aligned, no surface. Board `-s-detail-empty` |
| Offline / unsynced | — | "Syncing…" lines on unsynced children; no banner on this screen (none today, none on the board) |

#### Scrolling, small phones, large text

- Header fixed; info, section row, and the list scroll together (`ListHeaderComponent`). Bottom
  padding `FAB_OVERHANG + 16`.
- 360x640: header, info, the section row, and the first two child rows are visible at normal size.
- Large text: the name wraps, the meta line wraps (the chip moves under "Age" if needed), the two
  icon buttons stay 44 and top-aligned, nothing clips. A two-line class title pushes the info down.

### Behaviour changes (complete list)

1. ChildrenList and ClassDetail render their own headers (`headerShown: false`); the title text
   changes ("Children"; the class name).
2. Search is hidden while the EA has no classes; the stat bar is hidden while loading.
3. The sync banner's copy follows the transport state, and its button is hidden offline and while
   syncing.
4. The Class detail FAB becomes the "Add child" link (same navigation).
5. Child row: sibling buttons instead of nested touchables (same destinations and labels).
6. Unassessed at 0 is no longer styled as a stat link (it already was not tappable).
7. New copy: "Then pull down to refresh.", "Searches class name, school and teacher.", "Tap Add child
   to add a child.", offline/syncing banner strings; capitalisation changes as quoted above.

Unchanged: onboarding auto-entry, count-aware auto-route (`hasAutoRouted`), `popToTop` for Manage
classes, the stats computation, search fields, pull-to-refresh order, the unsynced counts, every
navigation destination and its params, the group picker's behaviour.

### Screens reached from here: shared look only

No Bold Red board covers these, so they get the shared look (tokens, type roles, `ScreenHeader`
with a back `IconCircleButton`, the system input, `PrimaryButton` / `TextLinkButton`) and no layout
change:

- `AddChildScreen`, `EditChildScreen`, `CreateClassScreen`, `EditClassScreen` (root stack,
  pushed), `ClassOnboardingScreen`, `ChildOnboardingScreen`, `ChildResultsScreen`,
  `LetterTrackerScreen`.
- `GroupPickerBottomSheet`: the shared bottom-sheet look (top radius 22, 36x4 `text + '33'`
  grabber, `displayS` title, 56 options), and group rows show the same dot as the chip (see
  Builder's calls).
- `EditChildScreen`'s current-group chip switches to `GroupChip` (see Builder's calls).

They are restyled in the shared-look PR or the Children PR, whichever the reconciliation step
chooses. They are not part of this section's device gate beyond "opens and looks consistent".

### Tests

Through the screens with React Native Testing Library, the providers mocked as in
`__tests__/ClassDetailScreen.test.js` and `__tests__/ChildrenListScreenRefresh.test.js`. Keep every
existing test in both files; update the ones that look for "Start Setup", the FAB, or the "+ Group"
text.

**`childrenPresentation` unit tests:** grade codes for every `GRADES` value; name code when all
classes share a grade ("Grade 1A" → "1A", "1b" → "1B"); fallback to the grade code for a name longer
than 3 characters after stripping; mixed grades always use the grade code; initials from first and
last name, a missing last name, lowercase names.

**`groupHelpers`:** `getGroupDotColor` cycles six colours, never returns `#C62828` or `#F57F17`.

**ChildrenListScreen:**
- Renders the heading "Children" and the sync pill with label "Open sync status, …"; tapping it
  navigates to `SyncStatus`.
- Class row: monogram, school, meta line, "18 children · 4 groups"; "1 child" and no groups part at
  0; three initials in list order; no avatars for an empty class; "Unsynced" only for an unsynced
  class; tap navigates `ClassDetail { classId }`.
- Unassessed > 0 is a button labelled "3 unassessed children. Open Assess" that navigates to
  Assessments; at 0 there is no such button.
- Loading: "Loading classes and children…", no stats, no search field.
- Checking: "Checking for assigned classes…".
- No programme: both lines plus "Then pull down to refresh."; no search field.
- No classes: "No classes yet"; "Start setup" navigates `ClassOnboarding`; no search field.
- No match: the curly-quoted message and the hint; the clear button empties the field and the
  classes return; unassigned children and "Add another class" still render.
- Banner: online shows "3 items waiting to sync" and "Sync now" calls `syncNow({ force: true })`;
  offline shows "3 items will sync when you’re online" with no button; syncing shows "Syncing 3
  items…"; hidden at 0.
- Unassigned row shows "Age 7 • Male" for `gender: 'male'` and navigates `EditChild`.
- "Add another class" navigates `CreateClass`.
- Typing in the search does not remount the field (the input keeps focus across a filter
  re-render).

**ClassDetailScreen:**
- The heading is the class name; Back calls `goBack`; "Manage classes" calls `popToTop`; "Edit
  class" navigates `EditClass`.
- "Add child" navigates `AddChild { classId }`; there is no FAB.
- Empty: "No children in this class yet." and "Tap Add child to add a child."
- Assigned chip label "Change group for …, currently Group 1" opens the picker; unassigned "Assign
  group to …" opens it; the dot colour for group index 6 equals the colour for index 0.
- The results button, letter tracker, and edit are separate buttons with their existing labels and
  destinations (the existing "opens child results from the row" test still passes).
- "Syncing…" shows only for an unsynced child.
- Loading and not-found states (existing tests updated for the new copy).

**SyncIndicator pill:** glyph, content, fill, and label for each of the five states; "99+ waiting";
the reduce-motion spinner.

`__tests__/colors.test.js` does not change (no new tokens). `__tests__/typography.test.js` covers the
new roles if they are added here.

### Device checks (Children PR, EAS preview build)

iOS and Android, compared against the boards:

- List: normal (2 classes + 1 unassigned), unsynced (banner + badge), offline (pill + banner copy),
  needs-attention pill, no match with the keyboard open, loading, no programme, no classes.
- Class detail: normal, an unsynced child, an unassigned child, a free-text group ("Lions"), a long
  class name (two-line title), no children.
- A single-class EA: still auto-routed into Class detail; "Manage classes" and Back both land on the
  list with no bounce back.
- 360x640 and 360x800 Android (`wm size` / `wm density 320` on the A03s): first class row visible
  without scrolling; the stat labels complete.
- Largest system font on both platforms and 1.3: no clipped text ("UNASSESSED", sync pill, chips),
  the chip, letter tracker, and edit buttons separately tappable, the class-detail title wraps.
- Keyboard: the search keeps focus while typing; the clear button and a class row work with the
  keyboard open; dragging the list dismisses it.
- VoiceOver and TalkBack: header first, then stats, search, banner, rows; each child row reads as
  four separate controls with the labels above; decorative avatars and monograms are skipped.
- The last row and "Add another class" clear the Record button at rest.

### Out of scope

- Grouping classes by school (`red-children-v-by-school`).
- Searching children (search stays class-only).
- Whole-class visibility for control-group assessment and replacement (CONTEXT.md, Group-centric
  item): not a visual change; `getChildrenInClass` stays delivery-scoped.
- Group editing beyond today's picker.
- "Syncing…" wording for a child that is only waiting or offline (existing copy, kept).
- Redesigning `ChildResultsScreen`, `LetterTrackerScreen`, onboarding, and the add/edit forms beyond
  the shared look.

### Builder's calls

- **Name-code fallback** for free-text class names: use the grade code when the stripped name is
  longer than 3 characters. *(my call)*
- **The group picker and Edit child use the dot chip too**, so a group has one colour across the
  three places that show it (with today's eight-colour tints, groups at index 5 and up would change
  hue between Class detail and the picker). A chip restyle, not a layout change. *(my call)*
- **Figtree 600 → 700**, since 600 is not loaded. *(my call)*
- **Stat label tracking** uses `textLabel` (1.1) rather than the board's 0.88. *(my call)*
- **Header stays fixed; stats, search, and banner scroll with the list.** *(my call)*
- **Banner needs-attention state is not used here**; the header pill carries it. *(my call)*
- **Class detail loading and not-found** keep a back button in the header. *(my call)*
- **Row pressed state:** `colors.text + '0F'` fill (no scale, unlike Home's cards). *(my call)*
- **Class row label** and the **Unassessed label** wording as quoted. *(my call)*
- **Export `FAB_OVERHANG`** from `LockedBottomTabBar` for both tab screens. *(my call)*

### Questions for Jim

1. **The banner and the header pill can show different numbers side by side.** The banner counts
   unsynced classes and children (`totalUnsyncedCount`); the pill counts every waiting outbox item,
   including sessions and time entries. With one session also waiting, the screen says "4 waiting"
   in the header and "3 items waiting to sync" in the banner. Options: (a) keep both counts and make
   the banner's scope explicit ("3 children or classes waiting to sync"); (b) drive the banner from
   the same `waitingCount` as the pill, so the numbers always match; (c) drop the banner, since the
   pill now always shows the count and opens Sync status. My recommendation is (b). It is a
   one-line source change and the "Sync now" action already syncs everything, not only children.
