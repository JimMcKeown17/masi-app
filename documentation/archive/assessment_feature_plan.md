# EGRA Letter Sound Assessment — Mobile App Implementation Plan

## Context

The Masi PWA has a working EGRA (Early Grade Reading Assessment) Letter Sound subtest — a 60-second timed assessment where children read letter sounds from a grid while an assessor marks correct/incorrect by tapping. We are recreating this feature in the React Native mobile app, adapting it to the mobile architecture (Supabase + AsyncStorage offline-first, React Native Paper, React Navigation).

**User decisions:**
- Entry flow: Assessments tab hub (add 4th tab back to bottom nav)
- Letter sets: Hardcoded constants for v1 (user will provide exact letter data); remote-config deferred
- DB: Full stack — Supabase migration + offline sync + UI
- Languages: English + isiXhosa
- Attempt numbering: Per current run only (starts at 1 each time, increments on "Try Again")

---

## Step 1: EGRA Letter Constants

**Create:** `src/constants/egraConstants.js`

Following the pattern of `src/constants/literacyConstants.js`. Letter data sourced from `documentation/egra_letter_sets.md`.

**Important rendering notes:**
- English letters include **digraphs** (`ch`, `sh`, `th`, `wh`, `oo`, `ee`) — tiles must handle multi-character values
- English uses **mixed case** (`I`, `a`, `E`, `p`) — display as-is, do NOT force uppercase (unlike existing `LetterGrid.js`)
- isiXhosa is all lowercase single characters

```javascript
export const ENGLISH_LETTER_SET = {
  id: 'english_60',
  language: 'English',
  letters: [
    'I','a','m','E','p','n','L','s','o','e',
    'Y','i','K','N','d','H','f','U','h','v',
    'Z','b','G','r','J','T','c','F','q','W',
    'w','D','x','A','j','B','g','P','Q','y',
    'z','C','O','t','S','V','l','k','M','R',
    'X','u','X','d','ch','sh','th','wh','oo','ee',
  ],
  lettersPerPage: 20,
  columns: 5,
};

export const ISIXHOSA_LETTER_SET = {
  id: 'isixhosa_60',
  language: 'isiXhosa',
  letters: [
    'l','a','m','e','s','n','l','s','m','e',
    'y','i','k','n','d','h','f','u','h','v',
    'f','y','c','i','t','k','d','z','f','d',
    't','z','o','j','p','r','c','w','p','o',
    'w','a','e','x','q','l','g','o','u','z',
    'x','r','v','b','j','b','q','u','r','g',
  ],
  lettersPerPage: 20,
  columns: 5,
};

export const LETTER_SETS = { english: ENGLISH_LETTER_SET, isixhosa: ISIXHOSA_LETTER_SET };
export const ASSESSMENT_DURATION = 60; // seconds
```

---

## Step 2: Supabase Migration

**Create:** `supabase-migrations/05_add_assessments_table.sql`

```sql
CREATE TABLE assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  child_id UUID NOT NULL,  -- no FK to avoid offline sync cascade issues (see CLAUDE.md)
  assessment_type TEXT NOT NULL DEFAULT 'letter_egra',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  letter_set_id TEXT NOT NULL,
  letter_language TEXT NOT NULL,
  completion_time INTEGER NOT NULL,       -- seconds elapsed
  letters_attempted INTEGER NOT NULL,
  correct_responses INTEGER NOT NULL,
  accuracy INTEGER NOT NULL,              -- 0-100
  correct_letters JSONB NOT NULL DEFAULT '[]',
  incorrect_letters JSONB NOT NULL DEFAULT '[]',
  last_letter_attempted JSONB,            -- {index, letter}
  date_assessed TEXT NOT NULL,            -- YYYY-MM-DD string to avoid timezone day-shift
  device_info JSONB DEFAULT '{}',
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: user_id is the single source of ownership truth
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own ON assessments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY insert_own ON assessments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY update_own ON assessments FOR UPDATE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_child_id ON assessments(child_id);
CREATE INDEX idx_assessments_synced ON assessments(synced);
```

**Key decisions:**
- **No FK on `child_id`** — avoids the documented cascade sync failure (CLAUDE.md) where unsynced children block assessment sync.
- **No `created_by` column** — `user_id` is the single ownership field. RLS policies only check `user_id`. Avoids redundant columns and confusion (unlike `children` table which needs `created_by` because multiple staff can access a child).
- **`date_assessed` is TEXT `YYYY-MM-DD`** — not `DATE` or `TIMESTAMPTZ`. Avoids timezone day-shift bugs. Same approach as `sessions.session_date`.

---

## Step 3: Offline Sync Integration

### Modify: `src/utils/storage.js`
- Add `ASSESSMENTS: '@assessments'` to `STORAGE_KEYS`
- Add `getAssessments()`, `saveAssessment(assessment)`, `getUnsyncedAssessments()` methods (follow `getSessions`/`saveSession` pattern)
- Add `'ASSESSMENTS'` to the `tables` array in `getAllUnsyncedCount()` (line ~223)
- Add `STORAGE_KEYS.ASSESSMENTS` to `domainKeys` in `clearDomainData()` (line ~258)

### Modify: `src/services/offlineSync.js`
- Add to `SYNC_TABLES` (line ~48):
```javascript
ASSESSMENTS: {
  key: 'ASSESSMENTS',
  table: 'assessments',
  getRecords: () => storage.getUnsyncedRecords('ASSESSMENTS'),
},
```

No changes needed to `OfflineContext.js` — it already iterates all `SYNC_TABLES` via `syncAll()`.

---

## Step 4: Navigation

### Modify: `src/navigation/AppNavigator.js`

**Add 4th tab** to `MainTabNavigator` — reuse existing `src/screens/main/AssessmentsScreen.js` (enhance the placeholder, don't create a new file):
```javascript
<Tab.Screen name="Assessments" component={AssessmentsScreen}
  options={{ title: 'Assessments' }} />
```
Icon: `'clipboard'` / `'clipboard-outline'` (Ionicons)

**Add stack screens** to `MainNavigator`:
- `AssessmentChildSelect` — title "Select Child"
- `LetterAssessment` — `headerShown: false` (full-screen during timed assessment)
- `AssessmentResults` — `headerShown: false` (has own action buttons)
- `AssessmentHistory` — title "Assessment History"

---

## Step 5: Screens

### 5a. Hub Screen
**Modify:** `src/screens/main/AssessmentsScreen.js` (enhance existing placeholder)

Simple hub (mirrors `SessionsScreen.js` pattern):
- Card with "Letter Sound Assessment (EGRA)" button -> navigates to `AssessmentChildSelect`
- "View History" outlined button -> navigates to `AssessmentHistory`

### 5b. Child Selection Screen
**Create:** `src/screens/assessments/AssessmentChildSelectScreen.js`

- Uses `useChildren()` context to get children list
- Searchbar + FlatList of children (single-select)
- On child tap: show language picker dialog (English / isiXhosa)
- On language confirm: navigate to `LetterAssessment` with params `{ child, letterSet }`

### 5c. Letter Assessment Screen (core)
**Create:** `src/screens/assessments/LetterAssessmentScreen.js`

**Three phases:** Instructions -> Active Assessment -> (Time's Up modal if timer expires)

**State:**
- `phase`: 'instructions' | 'active' | 'finished'
- `currentPage` (0-indexed)
- `letterStates`: `{ [globalIndex]: true }` — true = correct (green)
- `timeRemaining`: countdown from 60
- `isPaused`: boolean
- `lastTappedIndex`: tracks highest-index letter tapped (for scoring)
- `attemptNumber`: starts at 1, incremented on "Try Again" (per-run only, resets on fresh launch)

**Timer:** `setInterval` at 1s (matching `useTimeTracking.js` pattern). Guard with `hasFinishedRef` (useRef) to prevent double-save. Also disable all finish controls (End Assessment, Finish button, timer callback) after first completion trigger.

**Letter grid:** Renders `EgraLetterGrid` component (see Step 6). Pages: 3 pages of 20 for 60 letters. Navigation dots + Prev/Next/Finish buttons.

**Scoring — single `computeAssessmentResult` function** called by ALL three finish paths (timer expiry, manual end, finish button):
- `lettersAttempted` = `lastTappedIndex + 1` (position-based, not count-based — key EGRA rule)
- `correctResponses` = count of entries in `letterStates`
- `incorrectLetters` = letters between index 0 and lastTappedIndex that are NOT in letterStates
- `accuracy` = `Math.round((correct / attempted) * 100)` or 0 if none

**Save flow:**
1. Build assessment object with `id: uuid.v4()`, `user_id: user.id`, `synced: false`
2. `date_assessed` stored as `YYYY-MM-DD` string (not ISO datetime)
3. `storage.saveAssessment(assessment)`
4. `refreshSyncStatus()` from `useOffline()`
5. Navigate to `AssessmentResults` with params

**Back-button guard:** Use `navigation.addListener('beforeRemove')` during active phase to show confirmation dialog.

### 5d. Results Screen
**Create:** `src/screens/assessments/AssessmentResultsScreen.js`

- Receives assessment + child via route params
- Score card: Total, Correct, Incorrect, Accuracy (color-coded)
- Feedback message by accuracy range:
  - >= 90%: "Excellent work!"
  - 75-89%: "Great job!"
  - 60-74%: "Good effort!"
  - 40-59%: "Nice try!"
  - < 40%: "Keep practicing!"
- "Try Again" button -> navigate back to `LetterAssessment` with `attemptNumber + 1`
- "Done" button -> reset to Assessments hub

### 5e. History Screen
**Create:** `src/screens/assessments/AssessmentHistoryScreen.js`

Cache-first merge behavior (same pattern as `SessionHistoryScreen.js`):
1. Load from `storage.getAssessments()` immediately (show cached data)
2. If online, fetch from Supabase filtered by `user_id = user.id`
3. Merge: server rows marked `synced: true`, unsynced local rows preserved if not yet on server
4. FlatList sorted by `created_at` descending
5. Each row: child name, date, accuracy%, attempt#

---

## Step 6: Reusable Components

### 6a. EGRA Letter Grid
**Create:** `src/components/assessment/EgraLetterGrid.js`

Separate from existing `src/components/session/LetterGrid.js` because:
- EGRA uses **index-based** tracking (repeated letters are distinct by position)
- Existing LetterGrid uses character-based tracking (one 'a' = all 'a's)
- Different visual states (green for correct vs blue for selected)

**Props:** `letters` (array of 20), `pageOffset`, `letterStates`, `onToggle`, `disabled`

Style: 5 columns, `Pressable` tiles. Default: `colors.surface` + border. Correct: `colors.success` (#3FA535) bg + white text. Follow existing `LetterGrid.js` styling patterns (borderRadius.sm, spacing.sm gap).

**Digraph handling:** Render letter values as-is. For multi-character values like `sh`, `th`, `oo` — use slightly smaller font size if needed, but the standard tile size should accommodate 2-char strings fine. Do NOT call `.toUpperCase()` — display exactly as provided in the letter set.

### 6b. Assessment Timer Bar
**Create:** `src/components/assessment/AssessmentTimer.js`

Horizontal progress bar + time text. Color transitions:
- `> 30s`: `colors.success` (green)
- `10-30s`: `colors.accent` (#FFDD00, yellow)
- `< 10s`: `colors.emphasis` (#E72D4D, red)

---

## Files Summary

### New files (8):
| File | Purpose |
|------|---------|
| `src/constants/egraConstants.js` | Letter set data + config |
| `supabase-migrations/05_add_assessments_table.sql` | DB table |
| `src/screens/assessments/AssessmentChildSelectScreen.js` | Child picker |
| `src/screens/assessments/LetterAssessmentScreen.js` | Core timed EGRA |
| `src/screens/assessments/AssessmentResultsScreen.js` | Score display |
| `src/screens/assessments/AssessmentHistoryScreen.js` | Past assessments |
| `src/components/assessment/EgraLetterGrid.js` | Letter tile grid |
| `src/components/assessment/AssessmentTimer.js` | Timer bar |

### Modified files (4):
| File | Change |
|------|--------|
| `src/screens/main/AssessmentsScreen.js` | Enhance placeholder into hub screen |
| `src/utils/storage.js` | Add ASSESSMENTS key + CRUD + update counts/clear |
| `src/services/offlineSync.js` | Add ASSESSMENTS to SYNC_TABLES |
| `src/navigation/AppNavigator.js` | Add Assessments tab + 4 stack screens |

### Existing files to reuse (patterns only, not modify):
| File | Reuse |
|------|-------|
| `src/constants/literacyConstants.js` | Pattern for egraConstants |
| `src/components/session/LetterGrid.js` | Styling pattern for EgraLetterGrid |
| `src/screens/main/SessionsScreen.js` | Layout pattern for hub screen |
| `src/screens/sessions/SessionHistoryScreen.js` | Cache-first merge pattern for history |
| `src/hooks/useTimeTracking.js` | setInterval timer pattern |
| `src/constants/colors.js` | All colors, spacing, borderRadius |

---

## Implementation Order

1. `egraConstants.js` (no dependencies) — placeholder letters until user provides data
2. `05_add_assessments_table.sql` (independent)
3. `storage.js` + `offlineSync.js` modifications (depends on schema design)
4. `EgraLetterGrid.js` + `AssessmentTimer.js` (depends on constants)
5. `AssessmentsScreen.js` enhancement (hub)
6. `AssessmentChildSelectScreen.js`
7. `LetterAssessmentScreen.js` (depends on steps 3, 4)
8. `AssessmentResultsScreen.js`
9. `AssessmentHistoryScreen.js`
10. `AppNavigator.js` (wire everything up, add tab + stack screens)

---

## Verification

1. **Navigation**: Assessments tab appears in bottom nav, all screen transitions work
2. **Assessment flow**: Select child -> choose language -> see instructions -> start -> tap letters (toggle green) -> timer counts down -> end -> see results -> try again or done
3. **Timer edge cases**: Timer hits 0 (auto-finish), manual "End Assessment", "Finish" on last page — each saves exactly once (no double-save). All finish controls disabled after first trigger.
4. **Single scoring function**: Verify `computeAssessmentResult` is called by all three finish paths (no drift between timer/manual/finish logic)
5. **Back button guard**: Pressing back during active assessment shows confirmation
6. **Scoring**: Verify `lettersAttempted` is position-based (last tapped index + 1), not just count of taps
7. **Offline sync**: Save assessment offline -> go online -> verify record appears in Supabase `assessments` table
8. **RLS**: Verify `user_id` is set before save (single ownership field, no `created_by` needed)
9. **History**: Cache-first merge — show cached immediately, fetch from Supabase if online, merge unsynced local rows with server rows, filter by current user
10. **Date handling**: Verify `date_assessed` is stored as `YYYY-MM-DD` string, not ISO datetime

---

## Resolved

- **Letter data**: Provided in `documentation/egra_letter_sets.md` and incorporated into Step 1 constants above
