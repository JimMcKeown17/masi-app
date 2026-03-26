# Letter Tracker / Letter Progress — Complete Implementation Specification

## 1. High-Level Purpose

The Letter Tracker component provides a **per-letter mastery visualization and manual override system** for educators. It has two distinct surfaces:

1. **Letter Progress Tracker** (`/letter-progress` page): A full-page view showing every student in a list, each with a row of 26 letter cells. Letters are color-coded: **orange** = mastered during a formal timed assessment, **green** = manually marked as taught by the teacher, **gray** = not yet mastered. Teachers can click gray/green cells to toggle manual progress, then batch-save changes to Firebase.

2. **Letter Tracker Dialog** (modal component): A read-only analytics dialog with two tabs — **Student View** (individual per-student mastery grids) and **Class Statistics** (aggregated "Most Mastered" and "Least Mastered" letter rankings across all students). This component is defined but **not currently imported** anywhere in the app — it is unused/orphaned code.

**Who uses it:** Teachers/assessors who want to track which letters each student has learned, both through formal assessments and through classroom instruction.

**Where it fits:** Accessible from the Dashboard via a "View Progress" button on the Letter Progress card. The data source is the `assessments` collection in Firebase — the same data produced by the Letter Sound Assessment feature.

---

## 2. Entry Points and File Map

### Primary Files

| File | Role |
|------|------|
| `client/src/pages/letter-progress.tsx` | **Container page.** Route: `/letter-progress`. Fetches students and assessments, provides filtering, renders `StudentLetterGridTracker`. |
| `client/src/components/ui/student-letter-grid-tracker.tsx` | **Core tracker component.** Contains three sub-components: `LetterCell` (individual cell), `StudentLetterGrid` (one student's row), and `StudentLetterGridTracker` (the full list with search, save, and change tracking). Handles manual letter toggling and batch persistence. |
| `client/src/components/ui/letter-tracker-dialog.tsx` | **Analytics dialog (UNUSED).** Read-only modal with Student View (mastery grids) and Class Statistics (most/least mastered tables). Defined but never imported. |
| `client/src/firebase/db.ts` | **Firebase CRUD.** `getAssessmentsByUserId`, `updateAssessment`, `addAssessment` — used for reading assessment data and saving manual overrides. |
| `client/src/firebase/letterSetModel.ts` | **Letter set model.** `getLetterSetsByLanguage` — used when creating a new manual assessment record to find the correct `letterSetId`. |
| `client/src/lib/letterData.ts` | **Static letter data.** `letterDataEnglish`, `letterDataXhosa`, `Letter` type — used by the dialog component for letter lookups. |
| `client/src/contexts/LanguageContext.tsx` | **Global language state.** Provides `language` to determine which letter set to reference. |
| `client/src/pages/dashboard.tsx` | **Entry point.** Contains the "Letter Progress" card with a "View Progress" link to `/letter-progress`. |

### How Files Connect

```
dashboard.tsx
  ↓ (Link to "/letter-progress")
letter-progress.tsx
  ├── Fetches: getStudentsByUserId(), getAssessmentsByUserId()
  ├── Filters students by name
  └── StudentLetterGridTracker (student-letter-grid-tracker.tsx)
        ├── StudentLetterGrid (per-student row)
        │     └── LetterCell (individual letter cell)
        ├── updateAssessment() → Firebase (save existing)
        └── addAssessment() → Firebase (create manual record)

letter-tracker-dialog.tsx (ORPHANED — not imported anywhere)
  ├── LetterMasteryGrid (per-student read-only grid)
  ├── getLetterMasteryStats() → class-level analytics
  └── Fetches own data: getStudentsByUserId(), getAssessmentsByUserId()
```

---

## 3. UI Structure

### Screen 1: Letter Progress Page (`letter-progress.tsx`)

- **Layout:** Wrapped in `<Layout>` component. Container with `px-4 py-6`.
- **Header row:** Flex row (stacks on mobile).
  - **Left:** Back button (`ArrowLeft` icon, ghost variant, links to `/dashboard`) + page title "Letter Progress Tracker" in orange (`text-[#FB8C00]`), `text-2xl font-bold`.
  - **Right:** Filter input with `Filter` icon (lucide-react). Placeholder: "Filter students...". Width: full on mobile, `w-64` on desktop.
- **Loading state:** Centered spinner (orange border, `animate-spin`).
- **Empty state:** White rounded card with "No students found." text and orange "Add Students" button linking to `/students?mode=add`.
- **Data state:** White rounded card (`shadow-md`, `p-4 md:p-6`, `overflow-x-auto`) containing the `StudentLetterGridTracker`.

### Screen 2: Student Letter Grid Tracker (`student-letter-grid-tracker.tsx`)

- **Container:** `max-w-5xl`, centered, `p-4`.
- **Card wrapper:** White, rounded, shadow, overflow hidden.
- **Header section** (`bg-gray-50`, border bottom):
  - **Title row:** Flex (stacks on mobile). "Student Letter Progress" (`text-xl font-semibold`) on left. "Save Changes" button on right.
    - **Save button:** Orange bg (`bg-[#FB8C00]`), white text, `Save` icon. Shows spinner + "Saving..." when active. Disabled when no changes or saving. Displays change count badge: `Save Changes (3)`.
  - **Search input:** Label "Search Students" with `Search` icon. Placeholder: "Search by name...". Full width.
- **Student list:** `ScrollArea` with height `calc(100vh - 16rem)`.
  - Each student is a `StudentLetterGrid` row.
  - Empty search result: Warning emoji, "No students found" heading, suggestion text.
  - No students at all: "No students available" centered text.

### Screen 3: Student Letter Grid Row (`StudentLetterGrid` — inline component)

- **Container:** `py-3`, separated by `border-b border-gray-200`. Has `data-student-id` attribute.
- **Header:** Flex row (stacks on mobile).
  - **Left:** Student name (`text-sm font-semibold text-gray-700`).
  - **Right:** Last assessment date or "No assessment" (`text-xs text-gray-500`).
- **Letter row:** `flex flex-wrap gap-1`. Contains 26 `LetterCell` components in the `alphabetOrder`.

### Screen 4: Letter Cell (`LetterCell` — inline component)

- **Size:** `w-10 h-10` (40×40px).
- **Shape:** `rounded-md`.
- **Text:** `text-sm font-medium`, centered.
- **Cursor:** `cursor-pointer`.
- **States:**
  - **Assessment-mastered (orange):** `bg-[#FB8C00] text-white border border-[#FB8C00]/70`. Click does nothing (locked).
  - **Teacher-taught (green):** `bg-green-500 text-white border border-green-600`. Click toggles off.
  - **Inactive (gray):** `bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200`. Click toggles on (green).
- **Data attributes:** `data-letter`, `data-active`, `data-from-assessment`.
- **Transition:** `transition-colors`.

### Screen 5: Letter Tracker Dialog (`letter-tracker-dialog.tsx`) — UNUSED

- **Trigger:** Button with text "View Letter Tracker". Accepts `buttonClassName` prop.
- **Dialog:** `sm:max-w-4xl`, max height `90vh`. Green border accent (`border-[#43A047]/20`).
- **Header:** `BookOpen` icon + "Letter Mastery Tracker" in green (`text-[#43A047]`). Description: "Track which letters your students have mastered based on their assessments."
- **Tabs:** Two tabs in a `grid-cols-2` tab list.
  - **"Student View" tab:**
    - Search input + Mastery filter dropdown ("All Students", "Has Mastered Letters", "No Mastered Letters").
    - `ScrollArea` (`max-h-[60vh]`) with `LetterMasteryGrid` per student.
    - Each student card: White, rounded, shadow, border. Shows name + letter grid + last assessment date.
    - Letter grid: `grid-cols-5 sm:grid-cols-6 md:grid-cols-13`. Each cell shows letter value (lowercase).
    - **Mastered cells:** `bg-green-100 text-green-700 border border-green-200`.
    - **Not mastered:** `bg-gray-100 text-gray-500 border border-gray-200`.
    - Tooltip on hover: "Mastered" or "Not yet mastered".
  - **"Class Statistics" tab:**
    - Two side-by-side cards (stack on mobile).
    - **"Most Mastered Letters"** card (green title): Table with Letter, Students count, Mastery % badge.
    - **"Least Mastered Letters"** card (red title): Same table format.
    - Badge colors: >70% green, 40-70% yellow, <40% red.
    - Shows top 10 in each list.
- **Footer:** "Data based on most recent assessment for each student" text + "Close" button.

---

## 4. Styling and Visual Design

### Color Palette

| Token | Hex/Class | Usage |
|-------|-----------|-------|
| Primary Orange | `#FB8C00` | Page title, save button, assessment-mastered letter cells, loading spinner, dashboard card |
| Teacher Green | `bg-green-500` / `border-green-600` | Manually taught letter cells (tracker page) |
| Mastered Green (dialog) | `bg-green-100` / `text-green-700` | Mastered cells in the dialog view |
| Analytics Green | `#43A047` | Dialog title, "Most Mastered" heading, dialog loading spinner |
| Analytics Red | `text-red-600` | "Least Mastered" heading |
| Inactive Gray | `bg-gray-100` / `text-gray-500` / `border-gray-200` | Unmastered letter cells |
| Background Gray | `bg-gray-50` | Header section, scroll area background |
| Badge Green | `bg-green-100 text-green-800` | Mastery >70% badge |
| Badge Yellow | `bg-yellow-100 text-yellow-800` | Mastery 40-70% badge |
| Badge Red | `bg-red-100 text-red-800` | Mastery <40% badge |

### Typography

- Page title: `text-2xl font-bold text-[#FB8C00]`
- Section heading: `text-xl font-semibold text-gray-800`
- Student name (tracker): `text-sm font-semibold text-gray-700`
- Student name (dialog): `text-lg font-semibold text-gray-800`
- Letter cell text: `text-sm font-medium`
- Date text: `text-xs text-gray-500`
- Search label: `text-sm font-medium text-gray-700`
- Stats card title: `text-base font-semibold`
- Footer note: `text-xs text-gray-500`

### Alphabet Order

Both the tracker and the dialog use the same pedagogical letter order (vowels first):

```
a, e, i, o, u, b, l, m, k, p, s, h, z, n, d, y, f, w, v, x, g, t, q, r, c, j
```

This is **not** standard alphabetical order — it follows a teaching-priority sequence with vowels first, then common consonants, then less common letters.

### Component Library

- **shadcn/ui:** `Button`, `Input`, `Label`, `ScrollArea`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Badge`, `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`
- **Tailwind CSS** for all utility styling
- **lucide-react** icons: `ArrowLeft`, `Filter`, `Search`, `Save`, `BookOpen`, `AlertCircle`

---

## 5. User Flow

### Full End-to-End Journey (Tracker Page)

1. **Teacher navigates to Dashboard** (`/`).

2. **Teacher clicks "View Progress"** on the Letter Progress card → navigates to `/letter-progress`.

3. **Page loads.** Auth listener fires, then two parallel queries fetch students and assessments via TanStack Query.

4. **Loading state.** Orange spinner displayed while data loads.

5. **Data renders.** Each student appears as a row with:
   - Name and last assessment date.
   - 26 letter cells in pedagogical order.
   - **Orange cells:** Letters the student identified correctly in their most recent formal assessment.
   - **Gray cells:** Letters not yet mastered.

6. **Teacher optionally filters** students using the search input at the top.

7. **Teacher clicks a gray cell** to mark a letter as "taught" → cell turns **green**.
   - If the teacher clicks an **orange cell** → nothing happens (assessment-mastered letters are locked/read-only).
   - If the teacher clicks a **green cell** → it toggles back to **gray** (untaught).

8. **Change tracking:** Each toggle updates `changedStudents` record (maps `studentId` → `Set<letterValue>`). The Save button shows a count badge.

9. **Teacher clicks "Save Changes."**
   - For each changed student:
     - **If the student has a prior assessment:** Updates the most recent assessment's `correctLetters` array via `updateAssessment()`.
     - **If the student has no prior assessment:** Creates a new assessment record via `addAssessment()` with `deviceInfo: "Manual entry"`, `completionTime: 0`, `lettersAttempted: 26`.
   - Active letters are read from the DOM using `data-letter` attributes and CSS class checks.
   - On success: Toast "Changes saved" + clears `changedStudents`.
   - On error: Destructive toast with error message.

10. **Teacher navigates back** via the ArrowLeft button → `/dashboard`.

### Letter Tracker Dialog Flow (UNUSED)

1. User clicks "View Letter Tracker" button (wherever it would be rendered).
2. Dialog opens with "Student View" tab active.
3. User can search students by name and filter by mastery level ("All", "Has Mastered", "No Mastered").
4. Each student shows a responsive grid of 26 letters with mastered (green) and unmastered (gray) states + tooltips.
5. User switches to "Class Statistics" tab.
6. Two tables show the top 10 most and least mastered letters with student counts and percentage badges.
7. User clicks "Close" to dismiss.

---

## 6. Functionality and Behavior

### Letter Cell Toggle Logic (`handleLetterToggle` in `StudentLetterGrid`)

```
1. If letter is in assessmentLetters (orange) → return (no-op, locked).
2. Compute newState = !activeLetters[letter].
3. Update activeLetters: set letter to newState.
4. If newState is true → add to taughtLetters.
5. If newState is false → delete from taughtLetters.
6. Call onToggleLetter(studentId, letter, newState) → bubbles up to tracker.
```

### Assessment Data Extraction (`useEffect` in `StudentLetterGrid`)

```
1. Filter assessments by studentId.
2. Sort by dateAssessed descending (handles both Date and Firebase Timestamp formats).
3. Take the first (most recent) assessment.
4. Extract correctLetters:
   - If letter is a string (legacy format):
     - If contains '-' (e.g. "letter-a") → split and take second part.
     - If single char → use directly.
   - If letter is an object (new format) → use letter.value.
5. Lowercase all letter values.
6. Set both activeLetters and assessmentLetters maps.
```

### Save Logic (`saveChanges` in `StudentLetterGridTracker`)

```
1. Guard: Check currentUser is authenticated.
2. Guard: Check changedStudents has entries.
3. For each changed studentId:
   a. Filter assessments for this student.
   b. Sort by date descending → get most recent.
   c. Query DOM: document.querySelectorAll(`[data-student-id="${studentId}"] [data-letter]`).
   d. For each cell, check if active via CSS classes: bg-[#FB8C00] || bg-green-500 || active.
   e. Build activeLetterObjects[] with format { id: "letter-{value}", value, position: alphabetOrder.indexOf(value) }.
   f. If recentAssessment exists → updateAssessment(assessmentId, { correctLetters: activeLetterObjects }).
   g. If no assessment exists → create new assessment via addAssessment() with:
      - completionTime: 0
      - lettersAttempted: 26 (alphabetOrder.length)
      - correctResponses: activeLetterObjects.length
      - incorrectLetters: []
      - lastLetterAttempted: null
      - deviceInfo: "Manual entry"
      - screenDimensions: "Manual entry"
      - geolocation: "Manual entry"
      - syncStatus: "synced"
      - letterSetId: fetched from getLetterSetsByLanguage(student.letterLanguage)
      - letterLanguage: student.letterLanguage || "english"
4. await Promise.all(promises).
5. Success toast + clear changedStudents.
```

### Class Statistics Calculation (`getLetterMasteryStats` in `LetterTrackerDialog`)

```
1. Get standard letters (a-z only, single chars, ordered by alphabetOrder).
2. Initialize counts to 0 for each letter.
3. For each student × each letter: check isLetterMastered() against most recent assessment's correctLetters.
4. Calculate percentage = round((masteredCount / totalStudents) * 100).
5. Sort descending for mostMastered (top 10), ascending for leastMastered (top 10).
```

### `isLetterMastered` Function (Dialog)

```
1. Filter assessments by studentId.
2. Sort by date descending.
3. Take most recent.
4. Check if letterId is in correctLetters:
   - String format: direct equality check.
   - Object format: check letter.id === letterId.
```

---

## 7. State Management

### Local Component State (`letter-progress.tsx`)

| State Variable | Type | Purpose |
|---|---|---|
| `user` | `User \| null` | Firebase auth user |
| `filterText` | `string` | Student name filter input value |

### Local Component State (`StudentLetterGridTracker`)

| State Variable | Type | Purpose |
|---|---|---|
| `searchTerm` | `string` | Internal search filter (secondary to page-level filter) |
| `changedStudents` | `Record<string, Set<string>>` | Maps studentId → set of changed letter values. Tracks unsaved changes. |
| `isSaving` | `boolean` | Save operation in progress |
| `currentUser` | `User \| null` | Firebase auth user (needed for userId on new records) |

### Local Component State (`StudentLetterGrid` — per student row)

| State Variable | Type | Purpose |
|---|---|---|
| `activeLetters` | `Record<string, boolean>` | Map of letter value → active state (any source) |
| `assessmentLetters` | `Record<string, boolean>` | Map of letter value → true if from formal assessment (orange, locked) |
| `taughtLetters` | `Record<string, boolean>` | Map of letter value → true if manually toggled by teacher (green) |

### Local Component State (`LetterTrackerDialog`)

| State Variable | Type | Purpose |
|---|---|---|
| `user` | `User \| null` | Firebase auth user |
| `searchTerm` | `string` | Student search filter |
| `filterMastery` | `string` | Mastery filter: "all", "some", "none" |

### Context State

| Context | State | Purpose |
|---|---|---|
| `LanguageContext` | `language: 'english' \| 'isixhosa'` | Determines which letter data set to reference |

### Server State (TanStack Query)

| Query Key | Used In | Purpose |
|---|---|---|
| `['students', user?.uid]` | letter-progress.tsx, letter-tracker-dialog.tsx | Fetch all students for current user |
| `['assessments', user?.uid]` | letter-progress.tsx, letter-tracker-dialog.tsx | Fetch all assessments for current user |

### Mutations

| Mutation | Used In | Purpose |
|---|---|---|
| `updateAssessmentMutation` | StudentLetterGridTracker | Update existing assessment's `correctLetters` |
| `createAssessmentMutation` | StudentLetterGridTracker | Create new "Manual entry" assessment |

---

## 8. Data Model

### Alphabet Order Constant

```typescript
const alphabetOrder = [
  'a', 'e', 'i', 'o', 'u', 'b', 'l', 'm', 'k', 'p',
  's', 'h', 'z', 'n', 'd', 'y', 'f', 'w', 'v', 'x',
  'g', 't', 'q', 'r', 'c', 'j'
];
```

### Letter Cell State Model

Each letter cell for a student has three possible states derived from two boolean maps:

| `activeLetters[letter]` | `assessmentLetters[letter]` | Visual State | Clickable |
|---|---|---|---|
| `true` | `true` | Orange (assessment-mastered) | No (locked) |
| `true` | `false` | Green (teacher-taught) | Yes (toggle off) |
| `false` | `false` | Gray (not mastered) | Yes (toggle on) |

### Manual Assessment Record (Created on Save)

```typescript
{
  studentId: string,
  userId: string,
  attemptNumber: 1,
  dateAssessed: new Date(),
  completionTime: 0,
  lettersAttempted: 26,               // alphabetOrder.length
  correctResponses: number,            // count of active letters
  incorrectLetters: [],
  correctLetters: [                    // all active (orange + green) letters
    { id: "letter-a", value: "a", position: 0 },
    { id: "letter-e", value: "e", position: 1 },
    // ...
  ],
  lastLetterAttempted: null,
  letterSetId: string,                 // fetched from Firebase letter sets
  letterLanguage: string,              // from student.letterLanguage or "english"
  deviceInfo: "Manual entry",
  screenDimensions: "Manual entry",
  geolocation: "Manual entry",
  syncStatus: "synced",
  createdAt: new Date(),
  updatedAt: new Date()
}
```

### Letter Stats Object (Dialog Analytics)

```typescript
{
  id: string,          // Letter ID from letterDataEnglish/Xhosa
  value: string,       // Lowercase letter value
  count: number,       // Number of students who mastered this letter
  percentage: number   // round((count / totalStudents) * 100)
}
```

### Example: Assessment Data as Read by Tracker

```json
{
  "id": "abc123",
  "studentId": "student456",
  "userId": "user789",
  "correctLetters": [
    { "id": "1", "value": "o", "position": 1 },
    { "id": "2", "value": "a", "position": 2 },
    { "id": "8", "value": "s", "position": 8 }
  ],
  "dateAssessed": { "seconds": 1709827200, "nanoseconds": 0 },
  "letterLanguage": "english",
  "letterSetId": "english-standard"
}
```

The tracker extracts `correctLetters`, lowercases each `.value`, and marks those positions as orange (assessment-mastered) in the grid.

---

## 9. Validation and Error Handling

### Guards

- **Authentication:** `saveChanges` checks `currentUser` is not null. Shows destructive toast if missing.
- **No changes:** If `changedStudents` is empty, shows "No changes to save" toast and returns early.
- **Missing student:** If a student ID in `changedStudents` doesn't match any student in the list, throws error caught by try/catch.
- **Missing letter set:** If `getLetterSetsByLanguage` returns no results for a student's language, throws error.

### Error Display

- **Mutation errors:** `updateAssessmentMutation.onError` and `createAssessmentMutation.onError` both show destructive toast with `error.message`.
- **Save errors:** Caught in `saveChanges` try/catch, shown as destructive toast.

### Edge Cases

- **Legacy data format:** The `useEffect` in `StudentLetterGrid` handles both string-format (`"a"`, `"letter-a"`) and object-format (`{ id, value, position }`) for `correctLetters`.
- **Firebase Timestamp vs Date:** Date sorting handles both `Date` objects and `{ seconds, nanoseconds }` Firebase timestamps.
- **No assessments for student:** Grid shows all gray cells, date shows "No assessment". Save creates a new assessment record rather than updating.
- **Duplicate letter values:** The tracker uses lowercase letter values as keys in the state maps, so uppercase/lowercase duplicates in assessment data collapse to the same cell.

---

## 10. Backend / API / Persistence

### Read Operations

| Function | Collection | Purpose |
|---|---|---|
| `getStudentsByUserId(userId)` | `students` | Fetch all students for the logged-in teacher |
| `getAssessmentsByUserId(userId)` | `assessments` | Fetch all assessment records for the teacher |

### Write Operations

| Function | Collection | Purpose |
|---|---|---|
| `updateAssessment(id, { correctLetters })` | `assessments` | Update existing assessment's `correctLetters` with combined orange + green letters |
| `addAssessment(assessment)` | `assessments` | Create new "Manual entry" assessment record |

### Write Behavior

- **Update path:** Only the `correctLetters` field is updated. Other fields (completionTime, lettersAttempted, etc.) remain unchanged.
- **Create path:** A full `FirebaseAssessment` object is created with placeholder values (`completionTime: 0`, `deviceInfo: "Manual entry"`).
- **Letter set lookup:** When creating a new record, `getLetterSetsByLanguage` is called to find the appropriate `letterSetId`.

### DOM-Based State Reading (Save)

The save function reads the current visual state **from the DOM** rather than from React state:

```javascript
const letterCells = document.querySelectorAll(`[data-student-id="${studentId}"] [data-letter]`);
letterCells.forEach(cell => {
  const letter = cell.getAttribute('data-letter');
  const isActive = cell.classList.contains('bg-[#FB8C00]') || 
                   cell.classList.contains('bg-green-500') ||
                   cell.classList.contains('active');
  // ...
});
```

This is a **non-standard pattern** — it bypasses React's state management and directly queries CSS classes on DOM elements.

### Offline Behavior

Same as the assessment feature — Firebase Firestore is configured with `persistentLocalCache` so writes go to IndexedDB and sync automatically.

---

## 11. Events and Side Effects

### `useEffect` Hooks

**letter-progress.tsx:**
1. **Auth listener** (`[]`): `onAuthChange` subscription to track current user.

**StudentLetterGridTracker:**
1. **Auth listener** (`[]`): `onAuthChange` subscription for `currentUser` state (needed for `userId` on saves).

**StudentLetterGrid (per student row):**
1. **Assessment data extraction** (`[recentAssessment, student.firstName, student.lastName]`): Processes the most recent assessment's `correctLetters` into `activeLetters` and `assessmentLetters` state maps. Handles both legacy string and modern object formats.

**LetterTrackerDialog:**
1. **Auth listener** (`[]`): `onAuthChange` subscription.

### Computed Values

**letter-progress.tsx:**
- `filteredStudents` — derived from `studentsData.students` filtered by `filterText`.

**StudentLetterGridTracker:**
- `filteredStudents` — derived from `students` prop filtered by `searchTerm`.

**LetterTrackerDialog:**
- `filteredStudents` — derived from students filtered by `searchTerm` and `filterMastery`.
- `mostMasteredLetters` / `leastMasteredLetters` — computed by `getLetterMasteryStats()` on every render (not memoized).

### No `useCallback` or `useMemo`

Neither the tracker nor the dialog components use `useCallback` or `useMemo` for any of their derived computations or handlers. The `getLetterMasteryStats` function in the dialog recalculates on every render.

---

## 12. Navigation / Routing

### Routes

| Route | Page | Protection |
|-------|------|-----------|
| `/letter-progress` | LetterProgressPage | `ProtectedRoute` |

### Entry

- Dashboard (`/`) → "View Progress" button → `Link href="/letter-progress"`.

### Exit

- Back button (`ArrowLeft`) → `Link href="/dashboard"`.
- Empty state "Add Students" button → `Link href="/students?mode=add"`.

### No URL Parameters

The letter progress page does not use any URL parameters or query strings.

---

## 13. Dependencies

| Library | Usage in Letter Tracker |
|---------|------------------------|
| `react` | useState, useEffect for state management and data processing |
| `wouter` | `Link` for back navigation and dashboard entry |
| `@tanstack/react-query` | `useQuery` for fetching students/assessments, `useMutation` for saving changes |
| `firebase` | Firestore CRUD (read assessments, update/create assessment records) |
| `lucide-react` | Icons: `ArrowLeft`, `Filter`, `Search`, `Save`, `BookOpen`, `AlertCircle` |
| `tailwindcss` | All utility styling |
| `shadcn/ui` | `Button`, `Input`, `Label`, `ScrollArea`, `Dialog`, `Tabs`, `Card`, `Table`, `Select`, `Badge`, `Tooltip` |

---

## 14. Recreation Guide

### Must-Have Functionality

1. **Per-student letter grid** showing 26 letters in pedagogical order (vowels first: a, e, i, o, u, b, l, m...).
2. **Three-state letter cells:** assessment-mastered (locked, orange), teacher-taught (togglable, green), unmastered (togglable, gray).
3. **Data extraction from assessments:** Pull `correctLetters` from the most recent assessment per student, handle both legacy string and object formats.
4. **Manual toggle:** Teacher can click gray cells to mark as taught (green), click green cells to unmark. Orange (assessment) cells are read-only.
5. **Batch save:** A single "Save Changes" button that persists all pending changes. Either updates existing assessment records or creates new "Manual entry" records.
6. **Change tracking:** Track which students have unsaved changes. Show count on save button. Disable save when no changes.
7. **Student filtering:** Search by name across the student list.
8. **Last assessment date display** per student.

### Must-Have Styling

1. **Orange (#FB8C00)** for assessment-mastered cells — the dominant brand color for this feature.
2. **Green (green-500)** for teacher-marked cells.
3. **Gray (gray-100)** for unmastered cells with hover darkening.
4. **40×40px cells** (`w-10 h-10`) with rounded corners, centered lowercase letters.
5. **Responsive layout:** Cells wrap on mobile (`flex-wrap`), student info stacks.

### Nice-to-Have Extras

1. **Class Statistics view** (dialog) with Most Mastered / Least Mastered tables and color-coded percentage badges.
2. **Per-student mastery grid** in a dialog with tooltips ("Mastered" / "Not yet mastered").
3. **Mastery filter dropdown** ("All Students", "Has Mastered Letters", "No Mastered Letters").
4. **Responsive grid columns** in the dialog (`grid-cols-5 sm:grid-cols-6 md:grid-cols-13`).

### Implementation Risks / Tricky Parts

1. **DOM-based state reading on save** — The save function reads letter states from CSS class names on DOM elements (`classList.contains('bg-[#FB8C00]')`) rather than React state. This is fragile: if Tailwind purges or renames classes, or if the rendering changes, the save logic breaks. **A rebuild should read directly from React state.**

2. **Assessment mutation side effects** — When a teacher manually saves, it **overwrites** the `correctLetters` field of the most recent formal assessment. This means the original assessment data is modified. A cleaner approach would be to create separate "manual progress" records distinguished from formal assessments.

3. **Duplicate data queries** — Both `letter-progress.tsx` and `StudentLetterGridTracker` listen for auth state independently. The tracker also receives `students` and `assessments` as props from the page, but has its own search filter, creating redundant filtering. The dialog fetches its own data entirely independently.

4. **No cache invalidation after save** — After saving changes, the `changedStudents` state is cleared, but `queryClient.invalidateQueries` is never called. The displayed data may be stale until the user navigates away and back.

5. **`alphabetOrder` is duplicated** — The same 26-letter array is defined identically in both `student-letter-grid-tracker.tsx` and `letter-tracker-dialog.tsx`. Should be extracted to a shared constant.

6. **`getLetterMasteryStats` is not memoized** — Recalculates on every render of the dialog. For large student/assessment datasets this could cause performance issues.

7. **isiXhosa support is incomplete** — The tracker page always shows the 26-letter English pedagogical order regardless of language context. The isiXhosa letter data uses different letter distributions and positions. The dialog component does reference language context and letter data, but the tracker page grid does not adapt to isiXhosa.

---

## 15. Component Inventory

- **`LetterProgressPage`** (`pages/letter-progress.tsx`) — Container page; auth, data fetching, page-level filtering, layout.
- **`StudentLetterGridTracker`** (`components/ui/student-letter-grid-tracker.tsx`) — Main tracker component; search, save button, change tracking, student list rendering.
- **`StudentLetterGrid`** (inline in `student-letter-grid-tracker.tsx`) — Single student's letter row; extracts assessment data, manages per-letter state, handles toggle.
- **`LetterCell`** (inline in `student-letter-grid-tracker.tsx`) — Individual 40×40px letter cell with three visual states and click handler.
- **`LetterTrackerDialog`** (`components/ui/letter-tracker-dialog.tsx`) — **UNUSED.** Read-only analytics modal with Student View and Class Statistics tabs.
- **`LetterMasteryGrid`** (inline in `letter-tracker-dialog.tsx`) — **UNUSED.** Per-student mastery grid with tooltip on each letter.
- **`getLetterMasteryStats`** (function in `letter-tracker-dialog.tsx`) — **UNUSED.** Computes class-wide most/least mastered letter rankings.
- **`isLetterMastered`** (function in `letter-tracker-dialog.tsx`) — **UNUSED.** Checks if a specific letter is mastered by a student.
- **`getStandardLetters`** (function in `letter-tracker-dialog.tsx`) — **UNUSED.** Filters letter data to unique a-z single chars in pedagogical order.

---

## 16. Unknowns / Ambiguities

1. **`LetterTrackerDialog` is orphaned code.** It is fully implemented (504 lines) but never imported or rendered anywhere. It was likely intended for the Dashboard but was replaced by the full-page Letter Progress Tracker or simply never wired up. **Confirmed orphaned — grep shows no imports.**

2. **Assessment data mutation semantics.** When saving manual progress, the tracker **updates the most recent assessment's `correctLetters`**. This means a formal 60-second assessment's original `correctLetters` can be overwritten with teacher-added letters. Whether this is intentional (merge manual + formal) or a bug (should create separate records) is **ambiguous**.

3. **CSS class detection for save.** The save logic checks `cell.classList.contains('bg-[#FB8C00]')` to detect active state. Tailwind CSS class names can be transformed during compilation. Whether this works reliably in production depends on whether Tailwind preserves these exact class names. **High risk if class names are purged or transformed.**

4. **`data-active` attribute is set but never read.** Each `LetterCell` sets `data-active={active ? 'true' : 'false'}` on the DOM element, but the save function reads CSS classes instead of this attribute. The `data-active` attribute appears to be **dead code** or an incomplete refactor.

5. **Double search filter.** The page (`letter-progress.tsx`) has its own filter input that filters students before passing them as props. The tracker component (`StudentLetterGridTracker`) has a second internal search input. Both are rendered, meaning the user sees two search bars. Whether this is intentional or a UI bug is **unclear** — the page filter uses `Filter` icon with "Filter students..." placeholder, while the internal search uses `Search` icon with "Search by name..." placeholder.

6. **Letter position values on save.** When constructing `activeLetterObjects` for save, the `position` is set to `alphabetOrder.indexOf(letter)` (0-based position in the pedagogical order). This differs from formal assessment positions which use the grid position in the timed assessment. **These position values are semantically different but stored in the same field.**

7. **No isiXhosa adaptation in tracker.** The `StudentLetterGridTracker` always renders the 26-letter English `alphabetOrder`. It does not check the `LanguageContext` or adapt to isiXhosa letters. The isiXhosa letter set has different distributions and the alphabet differs. **The tracker is English-only despite the app supporting isiXhosa assessments.**

8. **No visual distinction between "no assessment data" and "zero correct letters."** If a student has an assessment with 0 correct letters, and a student with no assessment at all, both show an entirely gray grid. The only difference is the date text ("No assessment" vs a date). **Ambiguous whether this is intentional.**

---

## A. Architecture Diagram

```
┌────────────────────────────────────────────────────────────┐
│                      Dashboard (/)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Letter Progress Card                                │  │
│  │  "View Progress" → Link to /letter-progress          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│            LetterProgressPage (/letter-progress)           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ← Back    "Letter Progress Tracker"    [Filter...] │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           StudentLetterGridTracker                    │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  "Student Letter Progress"    [Save Changes]   │  │  │
│  │  │  [Search by name...]                           │  │  │
│  │  ├────────────────────────────────────────────────┤  │  │
│  │  │  StudentLetterGrid (Student A)                 │  │  │
│  │  │  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐    │  │  │
│  │  │  │🟠│⬜│⬜│🟠│⬜│⬜│🟢│🟠│⬜│⬜│🟠│⬜│⬜│    │  │  │
│  │  │  │ a│ e│ i│ o│ u│ b│ l│ m│ k│ p│ s│ h│ z│    │  │  │
│  │  │  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘    │  │  │
│  │  │  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐    │  │  │
│  │  │  │⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│⬜│    │  │  │
│  │  │  │ n│ d│ y│ f│ w│ v│ x│ g│ t│ q│ r│ c│ j│    │  │  │
│  │  │  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘    │  │  │
│  │  ├────────────────────────────────────────────────┤  │  │
│  │  │  StudentLetterGrid (Student B)                 │  │  │
│  │  │  [... same structure ...]                      │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                     │
              ┌──────▼──────┐
              │   Firebase   │
              │  Firestore   │
              │ assessments  │
              │  students    │
              │  letterSets  │
              └──────────────┘

🟠 = assessment-mastered (orange, locked)
🟢 = teacher-taught (green, togglable)
⬜ = not mastered (gray, togglable)
```

---

## B. Step-by-Step Rebuild Plan

1. **Define the alphabet order constant** — 26 letters in pedagogical order: vowels first, then consonants by teaching priority.

2. **Build the LetterCell component** — A 40×40px clickable cell with three visual states (orange/locked, green/togglable, gray/togglable). Accept `letter`, `active`, `isFromAssessment`, `onClick` props.

3. **Build the StudentLetterGrid component** — For a single student: extract `correctLetters` from their most recent assessment, initialize `activeLetters` and `assessmentLetters` maps, render 26 `LetterCell` components. Display student name and last assessment date. Handle legacy data formats.

4. **Build the StudentLetterGridTracker component** — The list container: render a `StudentLetterGrid` for each student. Add search filtering, change tracking (`changedStudents` map), and a "Save Changes" button with count badge.

5. **Implement save logic** — Read all active letters per changed student from React state (not DOM). For students with existing assessments, update `correctLetters`. For students without, create a new "Manual entry" assessment record.

6. **Build the LetterProgressPage** — Container page: fetch students and assessments via TanStack Query, render header with back button and filter, pass data to `StudentLetterGridTracker`.

7. **Add route** — Register `/letter-progress` as a protected route.

8. **Add dashboard entry point** — Add a "Letter Progress" card with a "View Progress" link.

9. **(Optional) Build the LetterTrackerDialog** — Analytics modal with Student View (read-only mastery grids) and Class Statistics (most/least mastered rankings).

10. **Test edge cases** — Student with no assessments, student with 0 correct letters, legacy string format data, save with multiple students changed, language context.

---

## C. Copyable Build Spec

```
FEATURE: Letter Progress Tracker

TARGET: A per-student, per-letter mastery visualization and manual override tool for teachers.

CORE BEHAVIOR:
- Teacher sees a list of all students, each with a row of 26 letter cells.
- Letters follow a pedagogical order (vowels first): a, e, i, o, u, b, l, m, k, p, s, h, z, n, d, y, f, w, v, x, g, t, q, r, c, j.
- Letter cells have three states:
  - ORANGE (#FB8C00): Letter identified correctly in the student's most recent formal timed assessment. READ-ONLY (clicking does nothing).
  - GREEN (green-500): Letter manually marked as "taught" by the teacher. TOGGLABLE (click to toggle on/off).
  - GRAY (gray-100): Letter not yet mastered. TOGGLABLE (click to toggle on → green).
- Data source: The `correctLetters` array from the most recent assessment per student determines orange cells. Handles both legacy string format ("a", "letter-a") and modern object format ({ id, value, position }).
- Teacher can toggle gray/green cells, then click "Save Changes" to batch-persist.
- Save behavior:
  - Students WITH existing assessments: update the most recent assessment's correctLetters to include all active (orange + green) letters.
  - Students WITHOUT assessments: create a new assessment record with deviceInfo="Manual entry", completionTime=0, lettersAttempted=26.
- Active letters are saved as objects: { id: "letter-{value}", value: "{value}", position: indexOf(alphabetOrder) }.
- Show unsaved change count on the Save button.
- Student name search/filter.
- Each student row shows name and "Last session: {date}" or "No assessment".

CELL SPEC:
- Size: 40×40px (w-10 h-10), rounded-md, text-sm font-medium, centered.
- Orange state: bg-[#FB8C00] text-white border border-[#FB8C00]/70. Click: no-op.
- Green state: bg-green-500 text-white border border-green-600. Click: toggle off.
- Gray state: bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200. Click: toggle on (green).
- Transition: transition-colors.

PAGE LAYOUT:
- Header: Back button (← arrow) + "Letter Progress Tracker" (orange, text-2xl font-bold) + filter input.
- Body: White card with shadow. Internal header: title + save button + search input.
- Student list: ScrollArea (height: calc(100vh - 16rem)). Each student separated by border-b.
- Empty states: "No students found" with "Add Students" button, or "No students available".
- Loading: Orange spinner.

ANALYTICS DIALOG (OPTIONAL):
- Two tabs: "Student View" (read-only per-student grids with mastered=green, unmastered=gray + tooltips) and "Class Statistics" (two tables: Most Mastered and Least Mastered, each showing top 10 letters with student count and percentage badge).
- Badge colors: >70% green, 40-70% yellow, <40% red.

PERSISTENCE:
- Firebase Firestore. Collection: "assessments".
- Read: getAssessmentsByUserId(userId). Write: updateAssessment(id, { correctLetters }) or addAssessment(fullRecord).
- Offline: Firebase persistentLocalCache enabled.

AUTH:
- Protected route. Firebase Auth required.

TECH STACK:
- React 18, TypeScript, Tailwind CSS, shadcn/ui, wouter, @tanstack/react-query v5, Firebase v9+ modular SDK, lucide-react.

KNOWN ISSUES TO AVOID IN REBUILD:
- Do NOT read state from DOM classes on save — use React state directly.
- Do NOT overwrite formal assessment data with manual changes — create separate "manual" records.
- Extract alphabetOrder to a shared constant (don't duplicate).
- Memoize class statistics calculations.
- Add queryClient.invalidateQueries after saving.
- Adapt grid to isiXhosa letters when language context changes.
```
