# Preset Numbered Groups

## Problem

Field testers (~20 users, two weeks into rollout) have reported that group naming is confusing. The current flow requires every user to invent a name from scratch the first time they create a group, which produces:

1. **Wide variance in naming conventions** — "Lions", "Red Team", "Advanced", "Group A", "High 1" — making group data hard to compare across teachers.
2. **Blank-slate paralysis** — a new user opening the picker sees a single "+ Create New Group" button and has to stop, think, and commit to a naming scheme before they can do the thing they actually wanted (assign a child).
3. **No structure for educators who don't need custom names** — many teachers just want "the first reading group" and "the second reading group" without inventing identities.

We want to preserve existing users' data (they chose their names deliberately) while removing the friction and inconsistency for everyone from here on.

## Goals

- Users with zero groups can assign a child to "Group 1", "Group 2", "Group 3", or "Group 4" in a single tap — no typing, no decision-making.
- Creating a 5th+ group is a single tap with no text input; the name is computed as "Group N" where N = max existing + 1.
- The format "Group N" is enforced in the updated client UI — no text input paths remain for free-text names or renames. (Older deployed versions continue to allow free-text names until users update; see §Rollout Notes below.)
- Existing users with free-text group names keep those names unchanged. No migration, no silent rename.

## Non-Goals

- Renaming existing free-text groups (explicitly rejected to preserve tester trust mid-study).
- Schema or migration changes.
- Bulk group creation, reorder, or color customisation.
- Capping the maximum number of groups.
- Reusing deleted group numbers to "fill gaps" — numbering is monotonic.

---

## Rollout Notes

Per `CLAUDE.md`, multiple app versions are simultaneously deployed across iOS and Android. Users update on their own schedule, not ours. This has two implications for this feature:

1. **Format drift will persist temporarily.** Users on older app versions still have access to free-text create and rename flows until they update. Any group names they create during that window remain free-text and are preserved (per §8 "leave alone" policy). The "format impossible to deviate from" property is a guarantee about the *updated client*, not the deployment as a whole.

2. **Sort order stabilises per-user as they update.** A user running the updated client sees numbered groups sorted numerically; a user on the old client continues to see alphabetic sort. Groups are per-staff (RLS enforces `staff_id = auth.uid()`), so users do not see each other's groups and the per-user inconsistency never surfaces cross-user confusion.

No server-side gating or coordinated release is needed. Release notes should encourage testers to update at their convenience.

---

## Design Decisions

### 1. Format: "Group N"

Group names follow the literal pattern `Group ` + integer starting at 1 (e.g., "Group 1", "Group 2", … "Group 12"). Plain numerals ("1", "2") were considered but rejected as visually ambiguous on chips that sit next to a child's age.

**The regex `^Group (\d+)$` is strictly case-sensitive and whitespace-exact.** Near-miss names — `"group 3"` (lowercase), `"Group  3"` (double space), `"Group 3 "` (trailing space) — are treated as legacy free-text and do **not** participate in numeric sorting or next-number computation. This is deliberate: the whole point of the feature is to prevent near-miss drift from polluting the clean numbered system.

Duplicate-name guards in the create paths remain case-insensitive and whitespace-normalised (matching the current `handleSelectGroup` behavior), so a user cannot end up with both "Group 3" and "group 3" — if a near-miss legacy name exists, the numbered create aborts with an "already exists" alert. This is a narrow edge case (limited to testers who entered lowercase/mis-spaced variants before the update) but it prevents silent duplicate creation.

### 2. Virtual placeholders for users with zero groups

A user opening the picker for the first time (i.e., when `groups.length === 0` for that staff member) sees four "virtual" rows — Group 1 through Group 4 — rendered identically to real groups but with no underlying database record. Tapping a virtual row creates that group as a real record *and* assigns the current child in one atomic user action.

Virtual rows disappear as soon as the user has at least one real group — including legacy free-text groups. From that point on, new groups are created via the "+ Add Group N" button (§4) instead of virtual placeholders. If a user later deletes all their groups, virtuals reappear — the rule is purely a function of current state, not first-launch timing.

**Rationale:** virtuals exist to solve blank-slate paralysis. Once a user has any groups at all, they're past that problem — showing four extra virtual rows next to their familiar "Lions" and "Tigers" would add noise, not reduce confusion.

### 3. Rename removed

The pencil (rename) icon on each group row is removed entirely. Rename is the only path by which free-text names can re-enter the system for users who have only ever used the new UI; removing it makes format drift impossible.

Users who want to "renumber" (e.g., change Group 3 to Group 7) can delete and re-add. This is a rare case and the cost is acceptable.

### 4. One-tap "+ Add Group N" button

Replaces the current free-text "+ Create New Group" input. The button label is dynamic — e.g., "+ Add Group 5" when max existing number is 4. Tapping it:

1. Creates a group with name `Group ${nextNumber}` via the existing `addGroup` in `ChildrenContext`.
2. Assigns the current child to the new group via `addChildToGroup`.
3. Dismisses the sheet.

No dialog, no text input, no confirmation. If the user taps by mistake, the existing trash-icon delete flow lets them remove it.

The button is hidden while virtual rows are showing (virtuals already cover creation for zero-group users).

### 5. Monotonic numbering

`nextGroupNumber = max(existing numbers conforming to "Group N") + 1`, or 1 if no conforming names exist. **Gaps from deletions are not filled.** If the user has Group 1, 2, 3 and deletes Group 2, the next button reads "+ Add Group 4", not "+ Add Group 2".

Rationale: resurrecting a number the user has already seen and deleted is surprising. Monotonic IDs match user intuition about "new" vs "revived" records.

Legacy non-conforming names are ignored in this calculation.

### 6. Sort order

Numbered groups ("Group N") sort numerically ascending and appear first. Legacy free-text names sort alphabetically after. This solves two problems:

- The "Group 10 before Group 2" lexicographic gotcha that the current `localeCompare` sort would introduce once users exceed 9 groups.
- Mixed-name users see their new numbered groups prioritised at the top of the picker.

### 7. Delete retained, unchanged

The trash-icon delete flow stays as-is, including the existing confirmation dialog and its warning when the group contains children. Users need a recovery path for mis-taps, and the current implementation already handles the "group has kids" case correctly.

### 8. Existing free-text groups: leave alone

Legacy groups created before this change remain in the database unchanged. No migration runs. No in-app rename prompt. The release notes will call out the new convention but will not imply any data mutation.

**Rationale:** 20 field testers in daily contact with the team. Silent data rewrites during feedback collection would erode trust in a way that outweighs the ~15 lines of code needed to handle mixed-name sorting and next-number logic.

### 9. Color palette (unchanged)

The existing 8-color `GROUP_COLORS` palette in `GroupPickerBottomSheet.js:28-37` continues to assign colors by sorted index. A side benefit of numeric-first sorting: Group 1 always renders blue, Group 2 always green, etc., stable across sessions and deletions. Groups 9+ wrap back to blue — acceptable for typical reading-group counts.

---

## Changes Summary

| Component | Current | New |
|-----------|---------|-----|
| Picker for zero-group user | Empty list + "+ Create New Group" button | Four virtual rows (Group 1–4) + "+ Create New Group" removed |
| Picker for user with groups | Real groups + "+ Create New Group" text input | Real groups + "+ Add Group N" single-tap button |
| Group creation path | Free-text input | Single tap, name auto-generated |
| Rename (pencil icon) | Present | Removed |
| Delete (trash icon) | Present with confirmation | Unchanged |
| Sort order | Alphabetic (`localeCompare`) | Numeric for "Group N", alphabetic for legacy |
| Existing free-text groups | — | Preserved, displayed after numbered |
| Database schema | `groups.name` free-text | Unchanged |

---

## Implementation Detail

### New helpers (live in `GroupPickerBottomSheet.js`; exported if needed by `ClassDetailScreen`)

```js
const NUMBERED = /^Group (\d+)$/;

function compareGroups(a, b) {
  const ma = a.name.match(NUMBERED);
  const mb = b.name.match(NUMBERED);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  if (ma) return -1;
  if (mb) return 1;
  return a.name.localeCompare(b.name);
}

function nextGroupNumber(groups) {
  const nums = groups
    .map(g => g.name.match(NUMBERED))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
```

### Picker component (`src/components/children/GroupPickerBottomSheet.js`)

**Remove:**
- State: `renamingGroupId`, `renameValue`, `creating`, `newGroupName`
- Handlers: `handleRenameGroup`, `handleCreateGroup`
- UI: the rename `TextInput` block, the pencil `IconButton` on each group row, the "+ Create New Group" dashed button + its inline create form
- Any imports that become unused (e.g., `Button` if not used elsewhere in the file)

**Add:**
- `renderVirtualRow(n)` — renders a row identical in styling to a real group row (color dot by index, "Group N" label, "0 children" subtitle) with no action icons. Tap handler calls `handleSelectVirtual(n)`.
- `handleSelectVirtual(n)`:
  1. Call `addGroup({ name: 'Group ' + n })`.
  2. On success, call `addChildToGroup(childId, result.group.id)` and any existing "remove from old group" logic.
  3. Call `onGroupChanged?.()` and `handleDismiss()`.
- A new "+ Add Group N" `TouchableOpacity` at the bottom of the sheet, styled similarly to the removed "+ Create New Group" dashed button, with label computed from `nextGroupNumber(groups)`. Tap handler is identical in shape to `handleSelectVirtual` but uses `nextGroupNumber(groups)`.
- Rendering rule: if `groups.length === 0`, render four virtual rows and hide the "+ Add Group N" button. Otherwise render real groups only and show the button.

**Keep:**
- `handleSelectGroup`, `handleRemoveFromGroup`, `handleDeleteGroup` — unchanged.
- Color assignment by sorted index (behaviourally improved, no code change).
- One-group-per-user enforcement (automatic removal from previous group when selecting a new one).

### Sort updates (consumer screens)

Two screens sort groups with `localeCompare` to compute `groupIndex` for `getGroupColor`. Both must be updated to use the exported `compareGroups` so color assignment stays consistent across the app:

- `src/screens/children/ClassDetailScreen.js:45` — inside `getChildGroup`, replace `.sort((a, b) => a.name.localeCompare(b.name))` with `.sort(compareGroups)` and add `compareGroups` to the import on line 13.
- `src/screens/children/EditChildScreen.js:54` — same edit, same pattern, same import shape (the import lives on line 19 here).

The `groupIndex` calculation that feeds `getGroupColor` continues to work unchanged in both files. **Missing either one** produces inconsistent group color assignment between the class-detail view and the edit-child view — the exact bug Codex flagged in its pre-execution review of this plan.

### Context, storage, sync

No changes. `ChildrenContext.addGroup`, `addChildToGroup`, `deleteGroup`, and the underlying AsyncStorage + Supabase sync paths remain untouched.

---

## Files to Modify

### Production source

| File | Change |
|------|--------|
| `src/components/children/GroupPickerBottomSheet.js` | Primary change: remove rename + free-text create, add virtual rows, add "+ Add Group N" button, new helpers. ~60 lines removed, ~40 lines added. |
| `src/screens/children/ClassDetailScreen.js` | Replace sort comparator on line 45 with `compareGroups`; add import on line 13. |
| `src/screens/children/EditChildScreen.js` | Replace sort comparator on line 54 with `compareGroups`; add import on line 19. Same pattern as ClassDetailScreen. |

### Tests (new files in `__tests__/`)

| File | Purpose |
|------|---------|
| `__tests__/groupHelpers.test.js` | Unit tests for `nextGroupNumber` and `compareGroups` (including monotonic-after-delete, double-digit sort, legacy ignored). |
| `__tests__/GroupPickerBottomSheet.test.js` | Minimal render test covering the two core conditional branches: `groups.length === 0` shows 4 virtual rows and hides the "+ Add" button; non-empty `groups` hides virtuals and shows "+ Add Group N" with the correct number. |

No files deleted. No migrations. No context or storage changes.

---

## Backwards Compatibility

- **No database schema changes.** Per `CLAUDE.md`, multiple app versions are deployed simultaneously across field testers. This change is purely additive at the UI layer.
- **Older app versions** continue to read and write groups the same way; they see any "Group N" records created by newer versions as normal group entries and can assign children to them.
- **Newer app versions** reading legacy free-text groups created by any version display them correctly in the picker after the numbered section.
- **Sync queue** is unaffected — the `synced` flag, the junction tables, and the upsert logic all remain identical.

---

## Release Communication

Release-notes line:

> Groups are now named Group 1, Group 2, etc. for consistency across the team. Your existing groups are preserved — any new groups you create will be numbered.

No in-app announcement, no forced walkthrough. Testers will see the changed button label and the absent rename pencil on their next picker open.

---

## Verification

### Unit tests (add to `__tests__/`)

- `nextGroupNumber`:
  - empty array → 1
  - `[Group 1]` → 2
  - `[Group 1, Group 3]` → 4 (monotonic, skips gap at 2)
  - `[Group 1, Group 2, Lions]` → 3 (ignores legacy)
  - `[Lions, Tigers]` → 1
- `compareGroups`:
  - `[Group 2, Group 10, Group 1]` sorts to `[Group 1, Group 2, Group 10]`
  - `[Lions, Group 1, Tigers, Group 2]` sorts to `[Group 1, Group 2, Lions, Tigers]`
  - `[Lions, Tigers]` sorts to `[Lions, Tigers]` (stable alphabetic)

### Manual regression checks

1. **New user, zero groups**: open picker → four virtual rows visible → tap Group 2 → Group 2 becomes real, child assigned, sheet dismisses. Reopen picker → Group 2 shown as real with this child, virtuals gone, "+ Add Group 3" visible.
2. **Legacy tester with free-text groups**: open picker with existing "Lions" and "Tigers" → no virtuals shown → "+ Add Group 1" button visible → tap → Group 1 created, appears *above* Lions/Tigers in sort order.
3. **Monotonic numbering**: create Group 1, 2, 3 → delete Group 2 → "+ Add" button reads "+ Add Group 4" (not Group 2).
4. **Numeric sort past 9**: create 10+ groups → verify Group 10 sorts after Group 9, not between Group 1 and Group 2.
5. **Rename removed**: verify no pencil icon appears on any group row.
6. **Delete retained**: delete a group with children → confirmation appears with child count → confirm → group removed, children unassigned.
7. **Offline creation**: enable airplane mode → tap "+ Add Group N" → group created locally with `synced: false` → reconnect → group syncs successfully. (Regression check against existing sync behavior.)
8. **One-group-per-user rule preserved**: assign child to Group 1 → reopen picker and tap Group 2 → verify child is now in Group 2 only, not both.

---

## Out of Scope / Future Considerations

- **Bulk rename migration**: rejected for trust reasons during field test. Could be revisited post-rollout as an opt-in in-app action if tester feedback requests it.
- **Configurable preset count**: hardcoded at 4. Could be revisited if typical usage clearly clusters at 3 or 5.
- **Group reorder / custom ordering**: not requested; numeric order is sufficient.
- **Color customisation**: 8-color wrap is acceptable for typical counts (≤8 reading groups per class).
