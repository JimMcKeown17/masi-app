# Children / Classes / Groups UX + Logic Review

Date: 2026-03-25  
Scope: User flows and screen-to-screen behavior for adding children, assigning/changing groups, and running assessments/sessions.

## Files Reviewed

- `src/navigation/AppNavigator.js`
- `src/screens/main/ChildrenListScreen.js`
- `src/screens/children/ClassDetailScreen.js`
- `src/screens/children/AddChildScreen.js`
- `src/screens/children/EditChildScreen.js`
- `src/components/children/GroupPickerBottomSheet.js`
- `src/context/ChildrenContext.js`
- `src/context/ClassesContext.js`
- `src/context/OfflineContext.js`
- `src/services/offlineSync.js`
- `src/screens/main/SessionsScreen.js`
- `src/screens/sessions/SessionFormScreen.js`
- `src/screens/sessions/LiteracySessionForm.js`
- `src/components/children/ChildSelector.js`
- `src/screens/main/AssessmentsScreen.js`
- `src/screens/assessments/AssessmentChildSelectScreen.js`
- `src/screens/assessments/LetterAssessmentScreen.js`
- `src/screens/assessments/AssessmentHistoryScreen.js`
- `src/screens/sessions/SessionHistoryScreen.js`
- `src/utils/storage.js`

## Critical Findings

### 1) Delete/unassign actions are not synced to Supabase (data can reappear)

**Where**
- `src/services/offlineSync.js`
- `src/context/ChildrenContext.js`
- `src/context/ClassesContext.js`
- `src/utils/storage.js`

**What is happening**
- Sync logic only does upserts for unsynced records.
- Delete flows remove rows from local storage (for child/group/class/membership), but no tombstone or server delete operation exists.
- After a later online fetch, server rows can come back into local state.

**Impact on UX**
- User sees success messages for delete/unassign, but later the child/group/class or membership can reappear.
- This directly breaks the "flawless" add/change workflow expectation and creates trust issues.

---

### 2) Group delete does not persist membership cleanup to storage

**Where**
- `src/context/ChildrenContext.js` in `deleteGroup`

**What is happening**
- Memberships are filtered in React state (`setChildrenGroups`), but the filtered list is not written back to storage.
- App restarts or reload paths can rehydrate old membership records from storage.

**Impact on UX**
- Group/member relationships can look fixed in-session but return later.

---

### 3) Destructive action copy over-promises behavior

**Where**
- `src/screens/children/EditChildScreen.js` delete confirmation text

**What is happening**
- Message says deleting a child "will remove the child from all groups and sessions."
- Actual delete flow does not delete server-side, and does not remove session history records.

**Impact on UX**
- Mismatch between user expectation and real data behavior.

## High Findings

### 4) One-group-per-user rule is only partially enforced

**Where**
- `src/screens/children/EditChildScreen.js`
- `src/screens/children/ClassDetailScreen.js`
- `src/components/children/GroupPickerBottomSheet.js`

**What is happening**
- Current group lookup uses `find(...)`, so if legacy/conflicted data has multiple memberships, one is chosen arbitrarily.
- Reassignment removes one `currentGroupId`, not all memberships for the child under the user.

**Impact on UX**
- Group chip can show inconsistent assignment.
- Child can still effectively remain in multiple groups in edge cases.

---

### 5) Empty/not-found states can appear while data is still loading

**Where**
- `src/screens/main/ChildrenListScreen.js`
- `src/screens/children/ClassDetailScreen.js`

**What is happening**
- Loading flags exist in contexts but these screens mostly render empty/not-found states immediately.
- No dedicated loading UI before first dataset is ready.

**Impact on UX**
- Users may see "No classes yet" or "Class not found" transiently even when data exists.

## Medium Findings (UX + Flow Gaps)

### 6) Children tab search empty state is misleading

**Where**
- `src/screens/main/ChildrenListScreen.js`

**What is happening**
- When a search returns zero matches, the screen still uses "No classes yet" messaging.

**Impact on UX**
- User can think classes are missing instead of just filtered out.

---

### 7) Class assignment can be changed, but not explicitly cleared from Edit Child

**Where**
- `src/screens/children/EditChildScreen.js`

**What is happening**
- Class picker supports selecting another class, but no explicit "No class" option exists.

**Impact on UX**
- Users cannot intentionally unassign one child from class without deleting the class or using workaround flows.

---

### 8) Assessment child selection lacks class/group context

**Where**
- `src/screens/assessments/AssessmentChildSelectScreen.js`

**What is happening**
- Child list only shows name + prior assessment info.
- No class name/group chip in list row.

**Impact on UX**
- Harder to quickly choose the correct child when names are similar, especially across multiple classes.

---

### 9) Session history does not show which children were included

**Where**
- `src/screens/sessions/SessionHistoryScreen.js`

**What is happening**
- History card shows count of children only, not names.

**Impact on UX**
- User cannot verify which children were in a session without extra memory/context.

## Additional Coding/Logic Notes

- `src/components/children/GroupPickerBottomSheet.js`: group assignment/creation paths do not validate `success` from context methods before closing UI, so silent failures are possible.
- `src/screens/assessments/AssessmentChildSelectScreen.js`: attempt count uses repeated filtering inside a loop (`O(n^2)`), which will degrade as assessments grow.

## Flow Evaluation Against Your Main User Scenarios

### Add child
- Works from class detail via FAB to `AddChild`.
- Strong constraint: cannot add a child directly from the main children tab without entering a class flow first.

### Add/change group
- UX improvements are strong (inline chip + bottom sheet in class detail and edit child).
- Current persistence logic is the blocker: group remove/delete/change can revert after reload/sync.

### Assess children
- Functional and straightforward (child -> language -> timed test -> results/history).
- Child selection needs class/group context to reduce selection mistakes.

### Run sessions with different children
- Functional via `ChildSelector` with search + "Select by Group".
- Works for multi-child sessions, but history visibility is limited because selected child names are not displayed.

## Priority Recommendation Order

1. Fix delete/unassign sync model first (server parity + local parity).
2. Fix storage persistence for membership cleanup on group delete.
3. Harden one-group enforcement for existing multi-membership data.
4. Improve loading and empty/search states.
5. Improve child identity context in assessment/session selection and session history.
