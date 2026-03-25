# Simplified Group Management UX

## Problem

The current group management flow requires 4-5 taps to assign a child to a group:
Edit Child → Manage Groups → expand group → Add Children → select → confirm.

The GroupManagementScreen is **group-centric** (manage groups and their members), but the most common user action is **child-centric** (assign THIS child to a group). Additionally, the many-to-many UX doesn't match the business rule: **a child can only be in one group per user/programme**.

95% of users have one classroom. The current "Create Class" button is equally prominent whether a user has zero or five classes.

## Design Decisions

### Hard Rule: One Group Per User
A child belongs to exactly 0 or 1 group for a given teacher. This transforms group assignment from a many-to-many junction table operation into a simple single-select property.

**Data model note**: The `children_groups` junction table remains (it's needed for the multi-programme case where a child has both a literacy and numeracy coach). But from any single user's perspective, the constraint is enforced in the app: assigning a child to a new group automatically removes them from their previous group (for this user).

### Changes Summary

| Component | Current | Proposed |
|-----------|---------|----------|
| Child card (ClassDetailScreen) | Name + age/gender only | + Group chip (tappable, color-coded) |
| Unassigned child | No indicator | Dashed "+ Assign Group" chip |
| Group assignment | 4-5 taps via GroupManagementScreen | 1 tap → bottom sheet picker |
| GroupManagementScreen | Full standalone screen | **Removed entirely** |
| AddChildToGroupScreen | Bulk checkbox screen | **Removed entirely** |
| Group create/rename/delete | Inside GroupManagementScreen | Inside the bottom sheet picker |
| Edit Child screen | "Group Memberships" + "Manage Groups" btn | Simple group dropdown field |
| Create Class (has classes) | Prominent button | Subtle "+ Add another class" text link |
| Create Class (no classes) | Same prominent button | Empty state with prominent CTA |

---

## Screen Designs

### 1. ClassDetailScreen — Child Cards with Inline Group Chips

Each child card in the class list shows:
- **Left**: Child name, age, gender (as today)
- **Right**: Group chip (tappable)

**Group chip states**:
- **Assigned**: Solid chip with group name, color-coded by group, with ▾ dropdown indicator. E.g., `[Group 1 ▾]` in blue.
- **Unassigned**: Dashed-border chip reading `[+ Assign Group]` in amber/orange. Clearly signals the child needs attention.

Tapping the chip opens the Group Picker Bottom Sheet.

**Tapping the card body** (not the chip) still navigates to EditChildScreen as today.

### 2. Group Picker Bottom Sheet

A modal bottom sheet that appears when tapping a group chip (on the card or in the Edit Child screen). Contains:

1. **Header**: "Assign Group" + child's name
2. **Group list**: All groups for this user, each showing:
   - Group name + child count
   - Current group highlighted with checkmark
   - Edit (✎) and Delete (🗑) icons on all groups (including the selected one — users may want to rename their current group)
   - Delete shows confirmation dialog; if group has children, warns they'll become unassigned
3. **Remove from group**: Option to unassign (only shown if child is currently in a group)
4. **Divider**
5. **"+ Create New Group"**: Dashed border button. Tapping reveals an inline text input within the bottom sheet to name the new group, then auto-selects it for this child.

**Group chip colors**: Groups don't have a color column in the database. Use a fixed palette of 6-8 distinct colors, assigned sequentially by group creation order (index into the palette, wrapping). This keeps it deterministic without schema changes.

**Behavior**:
- Tapping a group immediately assigns the child and closes the sheet
- If the child was in a different group, they're automatically removed from the old one (one group per user rule)
- Edit icon reveals an inline rename input within the bottom sheet
- Delete icon shows confirmation, then deletes the group (moving any children to "unassigned")

### 3. Edit Child Screen

Same as current but with these changes:
- **Remove**: "Group Memberships" card and "Manage Groups" button
- **Add**: Group dropdown field within the edit form (between Gender and Save button)
  - Visually highlighted with a light blue background to make it easy to find
  - Shows current group name with ▾ indicator
  - Tapping opens the same Group Picker Bottom Sheet
  - Helper text: "Tap to change group or create a new one"

### 4. My Children Tab (ChildrenListScreen)

- **When classes exist**: Replace the current prominent "Create Class" button with a subtle `+ Add another class` text link positioned below the class list
- **When NO classes exist**: Show an empty state with icon, explanatory text, and a prominent "Create Class" button as the primary CTA
- **Class cards**: Add group count to the subtitle. E.g., "10 children · 3 groups"

### 5. Removed Screens

- **GroupManagementScreen** (`src/screens/children/GroupManagementScreen.js`) — all functionality moved to the bottom sheet
- **AddChildToGroupScreen** (`src/screens/children/AddChildToGroupScreen.js`) — no longer needed since assignment is one-at-a-time via chips

---

## Data Flow

### Assigning a Child to a Group
```
User taps group chip on child card
  → Bottom sheet opens (shows user's groups from ChildrenContext)
  → User taps a group
  → If child already in a group for this user:
      → removeChildFromGroup(childId, oldGroupId)
  → addChildToGroup(childId, newGroupId)
  → Bottom sheet closes
  → Child card chip updates immediately (optimistic UI)
  → Sync queue picks up the changes
```

### Creating a New Group (from bottom sheet)
```
User taps "+ Create New Group"
  → Inline text input appears (or dialog)
  → User types group name, taps "Create"
  → addGroup({ name, staff_id })
  → New group appears in list, auto-selected for this child
  → addChildToGroup(childId, newGroupId)
```

### One-Group-Per-User Enforcement
The app enforces this rule client-side:
- When assigning to a new group, check `getGroupsForChild(childId)` filtered by current user's groups
- If the child is already in one of the user's groups, remove that membership first
- The junction table `children_groups` still supports multiple entries (for multi-programme), but the UI only shows/manages this user's single assignment

---

## Files to Modify

### Screens
- `src/screens/children/ClassDetailScreen.js` — Add group chips to child cards, add bottom sheet
- `src/screens/children/EditChildScreen.js` — Replace Group Memberships section with dropdown
- `src/screens/main/ChildrenListScreen.js` — De-emphasize Create Class, add group count to cards

### Screens to Remove
- `src/screens/children/GroupManagementScreen.js`
- `src/screens/children/AddChildToGroupScreen.js`

### Navigation
- `src/navigation/AppNavigator.js` — Remove GroupManagement and AddChildToGroup routes

### Context (no changes needed)
- `src/context/ChildrenContext.js` — Existing `addChildToGroup`, `removeChildFromGroup`, `addGroup`, `updateGroup`, `deleteGroup` functions are sufficient. The one-group-per-user enforcement is purely UI logic.

---

## Backwards Compatibility

- **No database schema changes** — the `children_groups` junction table and `groups` table remain as-is
- **No RLS changes** — existing policies still work
- **No sync changes** — same tables, same sync flow
- **Older app versions** unaffected — they still use the old GroupManagementScreen
- The only breaking change is navigation: removing two screens and their routes. Since these are in-app navigations (not deep links), this is safe.

---

## Verification

1. **Group assignment**: Tap chip on unassigned child → bottom sheet → select group → chip updates → child card shows group name
2. **Group change**: Tap chip on assigned child → bottom sheet → select different group → old group membership removed, new one added
3. **Group creation**: Tap chip → bottom sheet → "Create New Group" → type name → group created and auto-assigned
4. **Group rename/delete**: Tap chip → bottom sheet → edit/delete icons → verify rename persists, delete moves children to unassigned
5. **Edit Child screen**: Navigate to Edit Child → group dropdown visible → tapping opens same bottom sheet
6. **Create Class de-emphasis**: With classes: subtle text link. Without classes: prominent empty state CTA.
7. **Offline sync**: Assign group while offline → verify synced: false → go online → verify sync completes
8. **One-group rule**: Assign child to Group A, then Group B → verify child is ONLY in Group B (not both)
