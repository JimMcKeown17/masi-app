# EGRA Letter Sound Assessment — Complete Implementation Specification

## 1. High-Level Purpose

The Child Assessment component implements the **EGRA (Early Grade Reading Assessment) Letter Sound subtest**, a standardized 60-second timed assessment where a child reads letter sounds aloud from a grid, and an assessor (teacher/educator) marks each letter as correct or incorrect by tapping the screen. The system records which letters were correctly identified, calculates accuracy, and persists the results to Firebase Firestore.

**Who uses it:** Teachers, reading coaches, and literacy assessors working with early-grade learners.

**Where it fits:** The assessment is the core feature of the app. The typical flow is: Login → Dashboard → Students list → Select student → Run assessment → View results → Return to dashboard. The assessment page is a protected route accessible only to authenticated users.

---

## 2. Entry Points and File Map

### Primary Files

| File | Role |
|------|------|
| `client/src/pages/assessment.tsx` | **Container page.** Manages top-level state (selected student, attempt number, language selection), Firebase auth, saving results via mutation, and orchestrates all child components. Route: `/assessment`. |
| `client/src/components/assessment/letter-assessment.tsx` | **Core assessment engine.** Manages the full lifecycle: instruction screen → active assessment → time's-up popup → results screen. Handles letter click logic, scoring calculations, and produces the `AssessmentResults` object. |
| `client/src/components/assessment/assessment-info.tsx` | **Student info card.** Displays the student's name, grade, and ID at the top of the assessment page. |
| `client/src/components/assessment/language-selector.tsx` | **Language picker.** Dropdown to switch between English and isiXhosa letter sets. Shows Firebase/fallback status. |
| `client/src/components/assessment/results-screen.tsx` | **Results display.** Post-assessment summary showing total letters, correct count, incorrect count, accuracy percentage, and completion time. |
| `client/src/components/ui/letter-grid.tsx` | **Interactive letter grid.** Renders paginated letter tiles (5 columns × 4 rows = 20 per page), handles tap-to-toggle, pagination (Previous/Next/Finish), and visual state of each tile. Contains the `LetterTile` sub-component. |
| `client/src/components/ui/timer.tsx` | **Countdown timer.** 60-second precision timer using `requestAnimationFrame`. Supports pause/resume. Color-coded urgency indicators. |
| `client/src/lib/letterData.ts` | **Static letter data.** Contains hardcoded English (60 letters, 3 pages) and isiXhosa (60 letters, 1 page with 5×12 grid) letter arrays. Provides helper functions `getLettersByPage`, `getXhosaLettersByPage`, `getTotalPages`. |
| `client/src/firebase/db.ts` | **Firebase CRUD.** Contains `FirebaseAssessment` and `FirebaseStudent` interfaces, `addAssessment` function that persists results to Firestore with legacy data format conversion. |
| `client/src/firebase/letterSetModel.ts` | **Letter set model.** `FirebaseLetterSet` interface and functions to fetch dynamic letter sets from Firebase (`getLetterSet`, `getLetterSetsByLanguage`). |
| `client/src/firebase/config.ts` | **Firebase initialization.** Initializes Firebase app, auth, Firestore (with `persistentLocalCache` + `persistentMultipleTabManager` for offline support), and storage. |
| `client/src/firebase/auth.ts` | **Auth functions.** `signIn`, `signUp`, `signInWithGoogle`, `signInAnonymously`, `signOut`, `onAuthChange`, `getCurrentUser`. |
| `client/src/contexts/LanguageContext.tsx` | **Global language state.** React Context providing `language` and `setLanguage`. Initializes from classroom settings on mount. |
| `client/src/pages/students.tsx` | **Student list/entry point.** Contains the "Assess" button per student. `handleStartAssessment` serializes selected student to `localStorage` and navigates to `/assessment`. |
| `shared/schema.ts` | **SQL schema (Drizzle).** Defines `assessments`, `students`, `users`, `classes` tables. Used as a secondary/legacy schema; the app primarily uses Firebase interfaces. |

### How Files Connect

```
students.tsx
  ↓ (localStorage.setItem("selectedStudent"), navigate("/assessment"))
assessment.tsx
  ├── AssessmentInfo (assessment-info.tsx)
  ├── LanguageSelector (language-selector.tsx)
  └── LetterAssessment (letter-assessment.tsx)
        ├── Timer (timer.tsx)
        ├── LetterGrid (letter-grid.tsx)
        │     └── LetterTile (inline in letter-grid.tsx)
        └── ResultsScreen (results-screen.tsx)

Data layer:
  letterData.ts ← fallback static data
  letterSetModel.ts ← Firebase letter sets (primary)
  db.ts ← addAssessment() persists results
  config.ts ← Firebase initialization
  LanguageContext.tsx ← global language preference
```

---

## 3. UI Structure

### Screen 1: Student Info Card (`AssessmentInfo`)
- **Layout:** Container with horizontal padding (`px-4 py-4`), single `Card` component.
- **Content:** Student's full name as a bold heading (`text-lg font-bold`), grade and ID below in gray text (`text-sm text-gray-500`).
- **Format:** `"FirstName LastName"` heading, `"Grade: {grade} | ID: {id}"` subtext.

### Screen 2: Language Selector (`LanguageSelector`)
- **Layout:** Container (`px-4 py-2`), single `Card`.
- **Content:** Label "Letter Set Language:" with a `Select` dropdown (width `180px`) offering "English" and "isiXhosa" options.
- **Status indicator:** To the right, shows either:
  - Green badge: "Using Firebase letter set" (green border, green bg)
  - Amber badge: "Using local fallback letter set" with `AlertCircle` icon and a "Retry Firebase" button (amber styling)

### Screen 3: Assessment Card (`LetterAssessment`) — Instruction Phase
- **Container:** Card with `p-4` padding.
- **Header:** `"Letter Sound Assessment"` as `text-lg font-bold text-gray-700`.
- **Error banner (conditional):** Red left-bordered banner if letter set failed to load.
- **Loading banner (conditional):** Yellow left-bordered banner while fetching letter set.
- **Instructions block:** Blue left-bordered banner (`bg-blue-50 border-l-4 border-blue-500`) containing:
  - Personalized text: `"Start the letter identification test with {firstName}."`
  - Instruction: `"Tap a letter to mark it green (correct). Tap again to toggle back to neutral (incorrect). Green letters are counted as correct responses."`
  - Letter set description (if loaded from Firebase)
  - "Start Assessment" button (`bg-blue-500`, white text, with ▶ icon)

### Screen 4: Active Assessment
- **Timer row:** Flex container with the Timer on the left and a red "End Assessment" button on the right (`bg-red-600`, bold white text, rounded, shadow).
- **Letter Grid:** Rows of 5 letter tiles each (4 rows per page = 20 letters/page for English). Each tile is a square button.
- **Navigation bar:** Below the grid, three elements:
  - "Previous" button (outline, with `ChevronLeft` icon). Disabled on page 1.
  - Page indicator: Current page number in a blue circle (`bg-[#1E88E5]`) with `/ totalPages` in gray.
  - "Next" button (blue, with `ChevronRight` icon). On the last page, changes to "Finish" with a `Check` icon.

### Screen 5: Time's Up Popup (Modal)
- **Overlay:** Fixed full-screen black overlay (`bg-black/70`, z-50).
- **Dialog:** White card (`max-w-md`) with yellow border (`border-4 border-yellow-400`).
- **Content:** `⏱ Time's Up!` heading in yellow-600, bold.
- **Action:** Single "View Results" button (`bg-yellow-500`, full width, large text).

### Screen 6: Results Screen
- **Container:** Gradient background (`from-[#1E88E5]/10 to-white`), rounded, blue border, shadow.
- **Award icon:** Green circle with `Award` icon from lucide-react.
- **Heading:** `"Assessment Complete!"` in blue.
- **Feedback message:** Dynamic based on accuracy rate (see Section 6).
- **Completion time:** `"Completed in {X} seconds"`.
- **Metrics grid:** 2×2 grid of metric cards:
  - **Total Letters** (blue theme, `text-[#1E88E5]`)
  - **Correct** (green theme, `text-[#2E7D32]`)
  - **Incorrect** (red theme, `text-[#C62828]`)
  - **Accuracy** (color varies by rate, see Section 4)
- Each card has: colored background tint, 2px colored border, hover scale effect (`hover:scale-105`).
- **Action buttons:**
  - "Try Again" (outline, green border, `RefreshCw` icon)
  - "Return to Dashboard" (solid blue, `Home` icon, shadow)

---

## 4. Styling and Visual Design

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#1E88E5` | Buttons, headings, timer (>30s), page indicator, total letters metric |
| Success Green (dark) | `#2E7D32` | Correct letters (tile bg when selected), correct count, award icon, Try Again button |
| Error Red (dark) | `#C62828` | Incorrect count metric, last-attempted highlight during time-up |
| Error Red (medium) | `#D32F2F` | Accuracy <60%, last-attempted border |
| Warning Orange | `#D35400` | Accuracy 40-59% |
| Timer Teal | `teal-500` (Tailwind) | Timer bar at 15-30s |
| Timer Amber | `amber-500` (Tailwind) | Timer bar at 5-15s |
| Timer Red | `red-500` (Tailwind) | Timer bar at <5s |
| Timer Blue | `sky-500` (Tailwind) | Timer bar at >30s |
| Neutral tile | `bg-gray-100` | Unclicked letter tiles |

### Typography
- Assessment heading: `text-lg font-bold text-gray-700`
- Student name: `text-lg font-bold`
- Student metadata: `text-sm text-gray-500`
- Letter tiles: `text-2xl font-bold`
- Timer display: `text-xl font-bold` (normal), `text-2xl` (under 10s)
- Result numbers: `text-3xl font-bold`
- Result labels: `text-slate-600 text-sm`

### Letter Tile Styles
- **Base:** `flex-1 m-1 rounded-lg border-2 border-slate-300 drop-shadow-sm`
- **Hover:** `hover:drop-shadow-md hover:-translate-y-1`
- **Active/pressed:** `active:translate-y-0`
- **Clicked (correct):** `bg-[#2E7D32] text-white`
- **Neutral:** `bg-gray-100`
- **Last attempted (time-up):** `border-4 border-[#D32F2F] shadow-xl animate-pulse scale-110`
- **Transition:** `transition-all duration-200`

### Accuracy Color Classes (results screen)
| Range | Color | Class |
|-------|-------|-------|
| ≥90% | Green | `text-[#2E7D32]` |
| 75-89% | Blue | `text-[#1E88E5]` |
| 60-74% | Red | `text-[#D32F2F]` |
| 40-59% | Orange | `text-[#D35400]` |
| <40% | Dark Red | `text-[#C62828]` |

### Feedback Messages
| Range | Message |
|-------|---------|
| ≥90% | "Excellent work! Amazing accuracy!" |
| 75-89% | "Great job! Very good accuracy!" |
| 60-74% | "Good effort! Keep practicing!" |
| 40-59% | "Nice try! Practice will help improve." |
| <40% | "Keep practicing! You're making progress." |

### Component Library
- **shadcn/ui** components used: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `Button`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Label`, `Dialog`, `Table`
- **Tailwind CSS** for all utility styling
- **lucide-react** icons: `ChevronLeft`, `ChevronRight`, `Check`, `Clock`, `Play`, `Pause`, `RefreshCw`, `Home`, `Award`, `AlertCircle`

---

## 5. User Flow

### Full End-to-End Journey

1. **Assessor logs in** via email/password, Google, or anonymous auth (handled by `login.tsx`).

2. **Assessor navigates to Students page** (`/students`).

3. **Assessor clicks "Assess" on a student row.** 
   - `handleStartAssessment(student)` is called.
   - Student data is deep-copied with a timestamp, serialized to JSON, and stored in `localStorage` under key `"selectedStudent"`.
   - Navigation: `setLocation("/assessment")`.

4. **Assessment page mounts** (`/assessment`).
   - `useEffect` reads `localStorage.getItem("selectedStudent")`, parses JSON, sets `selectedStudent` state.
   - If no student found and data loaded → redirects to `/students`.
   - Once student loaded → clears `localStorage`, sets initial language from `student.letterLanguage`.
   - Renders: `AssessmentInfo` → `LanguageSelector` → `LetterAssessment`.

5. **Assessor optionally changes language** via `LanguageSelector` dropdown (English/isiXhosa).

6. **Assessor sees instruction screen** in `LetterAssessment`.
   - Shows personalized instructions with student's first name.
   - "Start Assessment" button (disabled if letter set is still loading).

7. **Assessor clicks "Start Assessment".**
   - `startAssessment()` called: resets all state, sets `isAssessmentActive = true`, records `startTime = Date.now()`.
   - Timer begins counting down from 60 seconds.
   - Letter grid appears with first page of letters.

8. **During active assessment:**
   - **Child reads letters aloud.** Assessor taps correct letters → tiles turn green.
   - **Single tap** = mark correct (green). **Second tap** = toggle back to neutral.
   - Each tap updates: `attemptedLetters`, `attemptedLetterIds`, `lastAttemptedLetter`, `incorrectLetters` arrays.
   - Assessor uses Next/Previous buttons to navigate pages.
   - Assessor can pause the timer via the pause button.

9. **Assessment ends** by one of three triggers:
   - **Timer expires (60s):** `onComplete(true, elapsedSeconds)` fires. "Time's Up!" popup appears. Assessor clicks "View Results".
   - **Manual "End Assessment" button:** `endAssessment(false)` called. Goes directly to results.
   - **"Finish" button on last page:** `onComplete(false)` fires. Equivalent to manual end.

10. **Results are calculated and saved:**
    - `AssessmentResults` object is constructed with all metrics.
    - `onSaveResults(results)` callback fires → `assessment.tsx`'s `handleSaveResults` → `saveAssessmentMutation.mutate(results)`.
    - Data is enriched with `deviceInfo`, `screenDimensions`, `syncStatus: "pending"`, timestamps.
    - `addAssessment()` in `db.ts` writes to Firestore `assessments` collection.

11. **Results screen displays:**
    - Total letters attempted, correct count, incorrect count, accuracy rate, completion time.
    - Dynamic feedback message and color-coded accuracy.

12. **Post-assessment options:**
    - **"Try Again":** Increments `attemptNumber`, resets to instruction screen.
    - **"Return to Dashboard":** Navigates to `/` (root).

### Branching / Conditional Paths
- If **no student** is found on mount → redirect to `/students`.
- If **letter set fetch fails** → fallback to local `letterData.ts` data, show amber warning.
- If **Firebase save fails** → destructive toast notification with error message.
- **Cancel/Back:** No explicit cancel — assessor can navigate away at any time via browser/app navigation.

---

## 6. Functionality and Behavior

### Letter Click Logic (`handleLetterClick`)
```
1. Guard: Return if !isAssessmentActive || isPaused.
2. Create letterObj { id, value, position } from clicked Letter.
3. Toggle in attemptedLetterIds[]:
   - If already present → remove (toggle OFF, tile goes neutral).
   - If not present → add (toggle ON, tile goes green).
4. Mirror toggle in attemptedLetters[] (object format).
5. Always update lastAttemptedLetterId and lastAttemptedLetter to current letter.
6. Determine willBeGreen = !attemptedLetterIds.includes(letter.id).
7. Update incorrectLetterIds[]:
   - If willBeGreen → remove from incorrect (it's now correct).
   - If not willBeGreen → add to incorrect.
8. Mirror in incorrectLetters[] (object format).
```

### Scoring Calculation
- **Letters Attempted** = position of `lastAttemptedLetter` + 1 (from letter set position). Falls back to `letterDataEnglish.findIndex()` for legacy data.
- **Correct Responses** = `attemptedLetters.length` (count of green/toggled-on tiles).
- **Incorrect Letters** = `lettersAttempted - correctResponses`.
- **Accuracy Rate** = `Math.round((correctResponses / lettersAttempted) * 100)`. Returns 0 if no letters attempted or no correct answers. Guards against NaN.
- **Completion Time** = elapsed seconds from `startTime` to assessment end. Calculated via `Date.now() - startTime` or provided by timer's `requestAnimationFrame` tracking.

### Timer Behavior
- Duration: **60 seconds** (hardcoded `duration={60}`).
- Uses `requestAnimationFrame` loop with a `startTimeRef` for precision.
- When paused, recalculates `startTimeRef` to account for paused duration.
- On reaching 0: calls `onComplete(true, elapsedSeconds)`.
- Visual urgency: Color changes at 30s, 15s, 5s thresholds. "Hurry up!" / "Time is running out!" text below 10s.
- Reset: When `isActive` becomes false, resets to full duration.

### Pagination
- English: 60 letters → 3 pages (20 per page, 5 columns × 4 rows).
- isiXhosa: 60 letters → 1 page (12 columns × 5 rows).
- Firebase letter sets: Dynamic, calculated as `Math.ceil(letters.length / 20)`.
- On last page, "Next" button becomes "Finish" and calls `onComplete(false)`.

### Try Again / Retry
- Resets `showResults = false`, `showInstructions = true`.
- Increments `attemptNumber` (passed from parent).
- All letter state arrays are cleared on next `startAssessment()` call.

---

## 7. State Management

### Local Component State (letter-assessment.tsx)
| State Variable | Type | Purpose |
|---|---|---|
| `letterSet` | `FirebaseLetterSet \| null` | Loaded letter set data |
| `isLoadingLetterSet` | `boolean` | Loading state for letter set fetch |
| `letterSetError` | `string \| null` | Error message from letter set fetch |
| `isAssessmentActive` | `boolean` | Whether the assessment timer is running |
| `isPaused` | `boolean` | Whether the timer is paused |
| `showInstructions` | `boolean` | Show instruction panel (initial state) |
| `showResults` | `boolean` | Show results screen |
| `timeRemaining` | `number` | Seconds left (managed by Timer independently) |
| `elapsedTime` | `number` | Total seconds elapsed |
| `startTime` | `number \| null` | `Date.now()` when assessment started |
| `incorrectLetters` | `{id, value, position}[]` | Letters marked incorrect (object format) |
| `lastAttemptedLetter` | `{id, value, position} \| null` | Last tapped letter (object format) |
| `attemptedLetters` | `{id, value, position}[]` | Letters marked correct/green (object format) |
| `assessmentDate` | `Date` | Frozen date for this assessment session |
| `incorrectLetterIds` | `string[]` | Legacy format: IDs of incorrect letters |
| `lastAttemptedLetterId` | `string \| null` | Legacy format: ID of last tapped letter |
| `attemptedLetterIds` | `string[]` | Legacy format: IDs of correct letters |
| `showLastLetterPrompt` | `boolean` | Show Time's Up popup |
| `isTimeUp` | `boolean` | Whether timer reached 0 |

### Local Component State (assessment.tsx)
| State Variable | Type | Purpose |
|---|---|---|
| `user` | `User \| null` | Firebase auth user |
| `selectedStudent` | `FirebaseStudent \| null` | Currently selected student |
| `attemptNumber` | `number` | Current attempt (starts at 1, increments on retry) |
| `selectedLanguage` | `'english' \| 'isixhosa'` | Selected letter set language |
| `firebaseError` | `boolean` | Whether Firebase letter set fetch failed |
| `isRefreshing` | `boolean` | Whether retrying Firebase connection |

### Local Component State (letter-grid.tsx)
| State Variable | Type | Purpose |
|---|---|---|
| `currentPage` | `number` | Current page of the letter grid (starts at 1) |

### Local Component State (timer.tsx)
| State Variable | Type | Purpose |
|---|---|---|
| `timeRemaining` | `number` | Current countdown value |
| `startTimeRef` | `Ref<number>` | requestAnimationFrame start timestamp |
| `animationFrameRef` | `Ref<number>` | requestAnimationFrame ID for cleanup |

### Context State
| Context | State | Purpose |
|---|---|---|
| `LanguageContext` | `language: 'english' \| 'isixhosa'` | Global language preference, initialized from classroom config |

### Server State (TanStack Query)
| Query Key | Purpose |
|---|---|
| `["students", user?.uid]` | Fetch student list for current user |
| `["assessments"]` | Invalidated after save |
| `["allAssessments"]` | Invalidated after save |
| `["studentAssessment", studentId]` | Invalidated after save for specific student |

### Temporary Storage
- `localStorage["selectedStudent"]` — used to pass student data from `/students` → `/assessment`. Cleared after read.

---

## 8. Data Model

### `Letter` (client/src/lib/letterData.ts)
```typescript
type Letter = {
  id: string;       // Unique ID, e.g. "1", "x1"
  value: string;    // The letter character, e.g. "a", "sh"
  page: number;     // Page number (1-based)
  row: number;      // Row within page (1-based)
  position: number; // Column position within row (1-based)
};
```

### `FirebaseLetterSet` (client/src/firebase/letterSetModel.ts)
```typescript
interface FirebaseLetterSet {
  id?: string;
  language: string;           // e.g. "english", "isixhosa"
  version: string;            // e.g. "1.0"
  description: string;        // e.g. "Standard English letter set"
  effectiveDate: any;         // Firebase Timestamp
  letters: {
    id: string;
    value: string;
    position: number;         // Global position (0-based)
  }[];
  createdAt?: any;
  updatedAt?: any;
}
```

### `AssessmentResults` (client/src/components/assessment/letter-assessment.tsx)
```typescript
interface AssessmentResults {
  studentId: string;
  attemptNumber: number;
  completionTime: number;        // Seconds elapsed
  lettersAttempted: number;      // Total letters up to last attempted
  correctResponses: number;      // Count of green (correct) letters
  incorrectLetters: {            // Array of incorrect letter objects
    id: string;
    value: string;
    position: number;
  }[];
  correctLetters: {              // Array of correct letter objects
    id: string;
    value: string;
    position: number;
  }[];
  lastLetterAttempted: {         // Last letter tapped
    id: string;
    value: string;
    position: number;
  } | null;
  dateAssessed: Date;
  letterSetId?: string;          // e.g. "english-standard"
  letterLanguage?: string;       // e.g. "english"
}
```

### `FirebaseAssessment` (client/src/firebase/db.ts) — Persisted Document
```typescript
interface FirebaseAssessment {
  id?: string;
  studentId: string;
  userId: string;
  letterSetId: string;
  letterLanguage: string;
  attemptNumber: number;
  dateAssessed: Date | { seconds: number; nanoseconds: number };
  completionTime: number;
  lettersAttempted: number;
  correctResponses: number;
  incorrectLetters: { id: string; value: string; position: number }[];
  correctLetters: { id: string; value: string; position: number }[];
  lastLetterAttempted: { id: string; value: string; position: number } | null;
  deviceInfo: string;
  screenDimensions: string;
  geolocation: string;
  syncStatus: string;
  createdAt: Date | { seconds: number; nanoseconds: number };
  updatedAt: Date | { seconds: number; nanoseconds: number };
}
```

### `FirebaseStudent` (client/src/firebase/db.ts)
```typescript
interface FirebaseStudent {
  id?: string;
  userId: string;
  firstName: string;
  lastName: string;
  grade?: string;
  studentId?: string;
  classId?: string;
  classroomId?: string;
  letterSetId?: string;
  letterLanguage?: string;
  createdAt?: any;
  updatedAt?: any;
}
```

### Example Persisted Assessment JSON
```json
{
  "studentId": "abc123",
  "userId": "user456",
  "letterSetId": "english-standard",
  "letterLanguage": "english",
  "attemptNumber": 1,
  "dateAssessed": { "seconds": 1709827200, "nanoseconds": 0 },
  "completionTime": 60,
  "lettersAttempted": 35,
  "correctResponses": 28,
  "incorrectLetters": [
    { "id": "5", "value": "p", "position": 5 },
    { "id": "13", "value": "K", "position": 13 }
  ],
  "correctLetters": [
    { "id": "1", "value": "o", "position": 1 },
    { "id": "2", "value": "a", "position": 2 }
  ],
  "lastLetterAttempted": { "id": "35", "value": "j", "position": 35 },
  "deviceInfo": "Mozilla/5.0 ...",
  "screenDimensions": "375x812",
  "geolocation": "",
  "syncStatus": "synced",
  "createdAt": { "seconds": 1709827260, "nanoseconds": 0 },
  "updatedAt": { "seconds": 1709827260, "nanoseconds": 0 }
}
```

---

## 9. Validation and Error Handling

### Required Fields
- `letterSetId` and `letterLanguage` are validated in `addAssessment()` — returns error if missing.
- Student must have a valid `id` — `handleStartAssessment` checks `!student || !student.id`.
- Student must be selected on the assessment page — redirects to `/students` if missing.

### Edge Cases Handled
- **NaN accuracy:** Guarded with explicit checks: if `totalAttempted <= 0` or `attemptedLetters.length === 0`, accuracy returns `0`. Final `isNaN()` guard.
- **Zero correct responses:** Explicitly handled — `correctResponses` can be `0`, logged for verification.
- **Legacy data format:** Both `addAssessment` and all `getAssessment*` functions convert string-based letter arrays to object format `{ id, value, position }` for backward compatibility.
- **Missing letter set:** Falls back to local `letterData.ts` with visual warning.

### Error Display
- **Firebase letter set fetch error:** Red banner with error message + amber fallback indicator in language selector.
- **Firebase save error:** Destructive toast notification via `useToast`.
- **Invalid student for assessment:** Destructive toast + early return.
- **No students found:** Card with "No Students Found" message and "Add a Student" button.

### Network Failures
- Firebase Firestore is configured with `persistentLocalCache` — writes succeed to IndexedDB offline and sync when online.
- `NetworkStatus` component shows toast when going offline/online.
- `syncStatus` field tracks pending vs synced state.

---

## 10. Backend / API / Persistence

### Primary Persistence: Firebase Firestore
- **Collection:** `assessments`
- **Write function:** `addAssessment()` in `client/src/firebase/db.ts`
- **Read functions:** `getAssessmentsByStudentId()`, `getAssessmentsByUserId()`, `getAssessment()`
- **Write payload:** See `FirebaseAssessment` interface in Section 8.
- **Server timestamps:** `createdAt` and `updatedAt` use `serverTimestamp()`.
- **Type converters:** Generic Firestore converter wraps collections for type safety.

### Letter Sets: Firebase Firestore
- **Collection:** `letterSets`
- **Read functions:** `getLetterSet(id)`, `getLetterSetsByLanguage(language)`
- **Fallback search:** If exact ID not found, searches by language pattern (fuzzy match).

### Offline-First Strategy
- **Firestore offline persistence:** Enabled via `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` in `config.ts`.
- **Behavior:** Writes go to local IndexedDB cache first. Firestore SDK handles sync to cloud automatically.
- **`syncStatus` field:** Set to `"pending"` by assessment page, overwritten to `"synced"` in `db.ts` on write (relies on Firestore's internal sync).
- **Service Worker:** `client/public/sw.js` caches static assets and provides offline navigation fallback.

### Secondary Persistence: localStorage
- **Key:** `"selectedStudent"`
- **Usage:** Temporary bridge to pass student data between pages.
- **Lifecycle:** Written on student select, read on assessment mount, cleared after read and on unmount.

### SQL Schema (Legacy/Unused for Assessment)
- Drizzle schema in `shared/schema.ts` defines tables but the app primarily uses Firebase for assessment data.

---

## 11. Events and Side Effects

### `useEffect` Hooks

**letter-assessment.tsx:**
1. **Letter set fetch effect** (`[letterSetId, letterLanguage]`): Fetches `FirebaseLetterSet` from Firestore by ID. On error, creates fallback from local data. Dispatches `CustomEvent('firebase-error')` on failure.
2. **Debug logging effect** (`[showResults, ...]`): Logs results screen values when `showResults` is true.

**assessment.tsx:**
1. **Auth listener** (`[]`): `onAuthChange` subscription to track current user.
2. **Init from localStorage** (`[]`): Reads `"selectedStudent"` from localStorage on mount.
3. **Redirect check** (`[studentsData, selectedStudent, isLoading]`): Redirects to `/students` if no student selected.
4. **Student change logger** (`[selectedStudent]`): Sets initial language from student config, clears localStorage.
5. **Firebase error listener** (`[]`): Listens for `'firebase-error'` CustomEvent from letter assessment.
6. **Cleanup** (`[]`): Removes `"selectedStudent"` from localStorage on unmount.

**timer.tsx:**
1. **Animation frame loop** (`[isActive, isPaused, onComplete, timeRemaining]`): `requestAnimationFrame` countdown. Cancels on cleanup.
2. **Reset effect** (`[isActive, duration]`): Resets timer when deactivated.

### `useCallback` Hooks
- `startAssessment` — no dependencies
- `togglePause` — no dependencies
- `handleLetterClick` — depends on `[isAssessmentActive, isPaused, attemptedLetterIds]`
- `endAssessment` — depends on all scoring-related state
- `handlePrevPage`, `handleNextPage`, `handleLetterClick` (grid) — minimal dependencies

### `useMemo` Hooks (letter-grid.tsx)
- `useLetterSetData` — determines whether to use Firebase or local letter data
- `totalPages` — calculates page count from letter set or local data
- `currentPageLetters` — slices and transforms letter data for current page
- `groupedLetters` — groups letters by row number for rendering

### Custom Events
- `window.dispatchEvent(new CustomEvent('firebase-error', { detail: { error } }))` — fired when letter set fetch fails.
- Listened by `assessment.tsx` to set `firebaseError` state.

---

## 12. Navigation / Routing

### Routes
| Route | Page | Protection |
|-------|------|-----------|
| `/` | Dashboard | `ProtectedRoute` |
| `/assessment` | AssessmentPage | `ProtectedRoute` |
| `/students` | StudentsPage | `ProtectedRoute` |
| `/groups` | Groups | `ProtectedRoute` |
| `/letter-progress` | LetterProgress | `ProtectedRoute` |
| `/login` | Login | Public |

### Router: `wouter`
- `Switch` + `Route` in `App.tsx`
- Navigation via `useLocation` hook → `setLocation(path)`

### Entry Into Assessment
1. `/students` → click "Assess" → `localStorage.setItem("selectedStudent", JSON.stringify(student))` → `setLocation("/assessment")`

### Exit From Assessment
1. **"Return to Dashboard"** → `setLocation("/")` (via `onViewReport` callback)
2. **Browser back** / navigation → standard wouter behavior
3. **"Change Student"** → `setLocation("/students")`

### Deep Links
- No query parameters or URL params used. Student context is passed via localStorage, not URL.

### Post-Submit Navigation
- After saving, the user stays on the results screen. They choose "Try Again" (stays on page) or "Return to Dashboard" (navigates to `/`).

---

## 13. Dependencies

| Library | Version Context | Usage in Assessment |
|---------|----------------|---------------------|
| `react` | 18.x | Component rendering, hooks (useState, useEffect, useCallback, useMemo, useRef, useContext) |
| `wouter` | — | Client-side routing, `useLocation` for navigation |
| `@tanstack/react-query` | v5 | `useQuery` for student data, `useMutation` for saving assessments, `queryClient.invalidateQueries` for cache management |
| `firebase` | v9+ modular | Firestore (persistentLocalCache, addDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp), Auth (onAuthStateChanged) |
| `zod` | — | Form validation schema for student form (not directly in assessment) |
| `react-hook-form` | — | Form handling for student creation (not directly in assessment) |
| `@hookform/resolvers/zod` | — | Zod resolver for react-hook-form |
| `lucide-react` | — | Icons: ChevronLeft, ChevronRight, Check, Clock, Play, Pause, RefreshCw, Home, Award, AlertCircle |
| `tailwindcss` | — | All utility CSS styling |
| `shadcn/ui` (Radix UI) | — | Card, Button, Select, Label, Dialog, Table components |
| `drizzle-orm` | — | SQL schema definition (legacy, not used for Firebase persistence) |
| `drizzle-zod` | — | Insert schema generation (legacy) |

---

## 14. Recreation Guide

### Must-Have Functionality
1. **60-second countdown timer** with precision (`requestAnimationFrame`), pause/resume, and visual urgency indicators.
2. **Interactive letter grid** with tap-to-toggle (neutral ↔ green) behavior, paginated layout (5 columns per row, 20 letters per page).
3. **Scoring engine** that tracks: letters attempted (based on last letter position, not just count of clicks), correct responses (green tiles), incorrect (attempted minus correct), accuracy rate.
4. **Three termination modes:** timer expiration, manual end button, and finish on last page.
5. **Results screen** with all four metrics (total, correct, incorrect, accuracy) and try-again/return-to-dashboard actions.
6. **Data persistence** to a backend (Firestore or equivalent) with the full `AssessmentResults` payload.
7. **Student selection flow** — select student on a list page, pass context to assessment page.
8. **Authentication gate** — assessment is a protected route.
9. **Multi-language letter sets** — at minimum two sets (English and isiXhosa) with the ability to switch.
10. **Offline support** — assessment data should be cached locally and synced when online.

### Must-Have Styling
1. **Two-state letter tiles:** Neutral gray and green (correct). Clear visual distinction.
2. **Color-coded timer:** Blue → teal → amber → red as time decreases.
3. **Results screen:** Gradient card with 2×2 metric grid, award icon, color-coded accuracy.
4. **Mobile-first responsive layout:** Grid navigation, flex-wrap for controls.
5. **Time's Up modal:** Full-screen overlay with yellow-bordered dialog.

### Nice-to-Have Extras
1. Dynamic letter sets from a backend (Firebase `letterSets` collection).
2. Fallback to local hardcoded letter data when backend is unavailable.
3. Legacy data migration (string arrays → object arrays).
4. `deviceInfo` and `screenDimensions` capture on save.
5. `requestAnimationFrame`-based timer (could use `setInterval` as simpler alternative).
6. Firebase `persistentLocalCache` with multi-tab manager.
7. Firebase error event bus (`CustomEvent` dispatch/listen).
8. Animated tile effects (hover lift, pulse on time-up for last letter).

### Implementation Risks / Tricky Parts
1. **Scoring based on "last attempted letter position"** — not just a count of clicked letters. The position in the ordered letter array determines how many letters were "attempted" (everything up to and including that position). This is the most non-obvious business rule.
2. **Dual state tracking** — the codebase maintains both legacy string ID arrays AND new object arrays simultaneously. A fresh implementation should pick one format.
3. **Timer precision** — `requestAnimationFrame` is non-trivial to implement correctly with pause/resume. The `startTimeRef` recalculation on unpause is the critical edge case.
4. **isiXhosa grid layout** — different dimensions (5×12 = 60 letters on 1 page) vs English (5×4 = 20 per page × 3 pages). The grid rendering must handle both.
5. **Results calculation happens in multiple places** — `endAssessment()`, time's-up handler, and inline in JSX for `ResultsScreen` props. This should be consolidated in a rebuild.
6. **localStorage as a data bridge** between routes is fragile. Consider URL params or a shared state store instead.

---

## 15. Component Inventory

- **`AssessmentPage`** (`pages/assessment.tsx`) — Top-level container; auth, student loading, mutation, language selection orchestration.
- **`LetterAssessment`** (`components/assessment/letter-assessment.tsx`) — Core assessment lifecycle engine; instructions, active state, timer integration, scoring, results.
- **`AssessmentInfo`** (`components/assessment/assessment-info.tsx`) — Student name/grade/ID display card.
- **`LanguageSelector`** (`components/assessment/language-selector.tsx`) — Language dropdown with Firebase/fallback status.
- **`ResultsScreen`** (`components/assessment/results-screen.tsx`) — Post-assessment metrics display with try-again and dashboard navigation.
- **`LetterGrid`** (`components/ui/letter-grid.tsx`) — Paginated interactive grid with letter tiles and navigation.
- **`LetterTile`** (inline in `letter-grid.tsx`) — Individual letter button with toggle and visual states.
- **`Timer`** (`components/ui/timer.tsx`) — 60-second countdown with rAF precision, pause, and color urgency.
- **`LanguageProvider`** (`contexts/LanguageContext.tsx`) — Context provider for global language preference.

---

## 16. Unknowns / Ambiguities

1. **isiXhosa grid dimensions:** The local data defines 5 rows × 12 columns (60 letters, all on `page: 1`). But the `LetterGrid` component paginates at 20 letters per page when using Firebase data. Whether isiXhosa should always be 1 page or paginated depends on the letter set source — **ambiguous intent**.

2. **`geolocation` field:** Always set to empty string `""`. May have been intended for future GPS capture but is currently dead/placeholder.

3. **`syncStatus` conflict:** Assessment page sets it to `"pending"`, but `addAssessment` in `db.ts` overwrites it to `"synced"`. The effective value is always `"synced"` — the `"pending"` value is never persisted.

4. **Legacy state arrays (`incorrectLetterIds`, `attemptedLetterIds`, `lastAttemptedLetterId`):** Maintained alongside object-format arrays. This appears to be migration-era code, not actively needed for new assessments that always have letter sets. **Inferred as legacy/technical debt.**

5. **`page` and `position` field semantics differ:** In `letterData.ts`, `position` means column position within a row (1-5). In `FirebaseLetterSet`, `position` means global position (0-based). The letter-assessment component recalculates positions during fallback creation. **Source of potential bugs if not handled carefully.**

6. **Duplicate letters in English data:** `letterDataEnglish` contains repeated values (e.g., multiple "e", "d", "C", "M", "X"). These are intentional for the EGRA standard letter grid — **confirmed by EGRA assessment design** (letters are randomized with repetitions).

7. **`onComplete` double-call risk:** When the timer expires, `endAssessment(true, ...)` is called, which creates results and calls `onSaveResults`. Then when the user clicks "View Results" on the Time's Up popup, another `onSaveResults` is called. **This means two saves can happen for a single assessment.** This appears to be a bug — the Time's Up handler should not re-save if `endAssessment` already saved.

8. **No autosave/draft mechanism:** If the browser crashes or the page is accidentally closed during an active assessment, all in-progress data is lost. There is no periodic save to localStorage or IndexedDB during the assessment.

---

## A. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        App.tsx                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         QueryClientProvider + LanguageProvider   │    │
│  │  ┌───────────────────────────────────────────┐   │    │
│  │  │    ProtectedRoute → /assessment            │   │    │
│  │  │  ┌─────────────────────────────────────┐   │   │    │
│  │  │  │        AssessmentPage                │   │   │    │
│  │  │  │  ┌──────────────────────────────┐    │   │   │    │
│  │  │  │  │     AssessmentInfo            │    │   │   │    │
│  │  │  │  ├──────────────────────────────┤    │   │   │    │
│  │  │  │  │     LanguageSelector          │    │   │   │    │
│  │  │  │  ├──────────────────────────────┤    │   │   │    │
│  │  │  │  │     LetterAssessment          │    │   │   │    │
│  │  │  │  │  ┌────────┐ ┌─────────────┐  │    │   │   │    │
│  │  │  │  │  │ Timer  │ │ LetterGrid  │  │    │   │   │    │
│  │  │  │  │  └────────┘ │┌───────────┐│  │    │   │   │    │
│  │  │  │  │             ││LetterTile ││  │    │   │   │    │
│  │  │  │  │             │└───────────┘│  │    │   │   │    │
│  │  │  │  │             └─────────────┘  │    │   │   │    │
│  │  │  │  │  ┌─────────────────────┐     │    │   │   │    │
│  │  │  │  │  │   ResultsScreen     │     │    │   │   │    │
│  │  │  │  │  └─────────────────────┘     │    │   │   │    │
│  │  │  │  └──────────────────────────────┘    │   │   │    │
│  │  │  └─────────────────────────────────────┘   │   │    │
│  │  └───────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   Firebase    │
                    │  ┌─────────┐  │
                    │  │Firestore│  │
                    │  │ - assessments      │
                    │  │ - students         │
                    │  │ - letterSets       │
                    │  │ - classroomInfo    │
                    │  └─────────┘  │
                    │  ┌─────────┐  │
                    │  │  Auth   │  │
                    │  └─────────┘  │
                    │  ┌──────────────┐ │
                    │  │IndexedDB     │ │
                    │  │(offline cache)│ │
                    │  └──────────────┘ │
                    └───────────────────┘
```

---

## B. Step-by-Step Rebuild Plan

1. **Define the data model** — Create TypeScript interfaces for `Letter`, `LetterSet`, `AssessmentResults`, `Student`, and `PersistedAssessment`.

2. **Create the letter data** — Build English and isiXhosa letter arrays (60 letters each) with id, value, page, row, position. Add helper functions for pagination.

3. **Build the Timer component** — Implement a 60-second countdown using `requestAnimationFrame`. Support pause/resume. Add color-coded urgency styling. Expose `onComplete(timerFinished, elapsedSeconds)` callback.

4. **Build the LetterTile component** — A single button that renders a letter value. Two visual states: neutral (gray) and correct (green). Accept `onClick`, `isAttempted`, `isLastAttempted`, `isTimeUp` props.

5. **Build the LetterGrid component** — Paginate letters (20 per page), group by row, render LetterTile for each. Add Previous/Next/Finish navigation. Pass click events up via `onLetterClick`.

6. **Build the LetterAssessment component** — Manage the assessment lifecycle: instructions → active (Timer + LetterGrid) → Time's Up popup → ResultsScreen. Implement `handleLetterClick` with toggle logic. Implement `endAssessment` with scoring calculations.

7. **Build the ResultsScreen component** — Display 2×2 grid of metrics (total, correct, incorrect, accuracy). Add feedback message. Add Try Again and Return to Dashboard buttons.

8. **Build the AssessmentInfo component** — Simple card displaying student name, grade, ID.

9. **Build the LanguageSelector component** — Dropdown with English/isiXhosa. Show data source status (remote vs local fallback).

10. **Build the AssessmentPage** — Container that loads student from storage/context, initializes language, renders all sub-components, handles save mutation.

11. **Implement persistence** — Connect to backend (Firebase/Supabase/API). Implement `addAssessment()` with the full payload. Enable offline caching.

12. **Implement student selection flow** — On the student list page, add "Assess" button that passes student context and navigates to assessment page.

13. **Add auth protection** — Wrap assessment route in an auth guard.

14. **Test edge cases** — Zero correct, all correct, timer expiration, manual end, page navigation, language switching, offline mode.

---

## C. Copyable Build Spec

```
FEATURE: EGRA Letter Sound Assessment

TARGET: A timed 60-second interactive letter grid assessment for early-grade reading.

CORE BEHAVIOR:
- Assessor selects a student, chooses a language (English or isiXhosa), and starts the assessment.
- A 60-second countdown timer begins.
- Letters are displayed in a paginated grid (5 columns, 4 rows per page, 20 letters per page for English; 12 columns, 5 rows, 1 page for isiXhosa).
- Tapping a letter toggles it green (correct). Tapping again toggles it back to neutral.
- The assessment ends when: timer reaches 0, assessor clicks "End Assessment", or assessor clicks "Finish" on the last page.
- Scoring: lettersAttempted = position of last letter touched + 1. correctResponses = count of green letters. incorrect = attempted - correct. accuracy = round((correct / attempted) * 100).
- Results are saved to a database with: studentId, userId, attemptNumber, completionTime, lettersAttempted, correctResponses, incorrectLetters[], correctLetters[], lastLetterAttempted, letterSetId, letterLanguage, dateAssessed, deviceInfo, screenDimensions, syncStatus, timestamps.
- Results screen shows all metrics with color-coded accuracy and a feedback message.
- Assessor can "Try Again" (increments attempt number, resets) or "Return to Dashboard".

LETTER DATA:
- English: 60 letters across 3 pages. Mix of upper and lowercase, includes "sh" digraph. Letters are intentionally repeated per EGRA standard.
- isiXhosa: 60 lowercase letters on 1 page (5 rows × 12 columns).

TIMER SPEC:
- 60 seconds, requestAnimationFrame-based.
- Color thresholds: >30s blue, 15-30s teal, 5-15s amber, <5s red with pulse animation.
- Pause/resume support.
- Fires onComplete(true, elapsedSeconds) when reaching 0.

LETTER TILE SPEC:
- Two states: neutral (gray-100 bg) and correct (green #2E7D32 bg, white text).
- Hover: lift effect (-translate-y-1). Active: translate-y-0.
- Last attempted letter during time-up: red border, pulse, scale-110.
- Font: text-2xl font-bold.

RESULTS SPEC:
- 2×2 grid: Total Letters (blue), Correct (green), Incorrect (red), Accuracy (color varies).
- Accuracy colors: ≥90% green, 75-89% blue, 60-74% red, 40-59% orange, <40% dark red.
- Feedback messages: ≥90% "Excellent work!", 75-89% "Great job!", 60-74% "Good effort!", 40-59% "Nice try!", <40% "Keep practicing!".
- Actions: "Try Again" (outline, green) and "Return to Dashboard" (solid blue).

PERSISTENCE:
- Firebase Firestore with offline persistence (IndexedDB cache).
- Collection: "assessments".
- Letter sets fetched from "letterSets" collection, with fallback to hardcoded local data.
- Student passed between pages via localStorage (temporary bridge).

AUTH:
- Firebase Auth (email/password, Google, anonymous).
- Assessment route is protected; redirects to login if unauthenticated.

TECH STACK:
- React 18, TypeScript, Tailwind CSS, shadcn/ui, wouter (routing), @tanstack/react-query v5, Firebase v9+ modular SDK, lucide-react (icons).
```
