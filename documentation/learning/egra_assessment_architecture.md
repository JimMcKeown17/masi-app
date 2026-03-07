# EGRA Letter Assessment — Architecture & Engineering

How the EGRA Letter Sound Assessment feature was wired into the existing Masi app architecture. Covers the data layer, component design, navigation integration, state management patterns, and the specific engineering problems we solved.

---

## 1. Data Layer: Storage + Sync Integration

### The pattern we followed

Every data domain in this app follows the same three-step integration:

1. **Add a storage key** in `storage.js` (`STORAGE_KEYS` object)
2. **Add CRUD methods** on the `storage` object (get, save, getUnsynced)
3. **Register in `offlineSync.js`** (`SYNC_TABLES` config)

That's it. The sync engine (`syncAll`) already iterates over `Object.entries(SYNC_TABLES)`, so adding a new entry automatically picks it up — no changes needed in `OfflineContext.js` or the sync loop itself.

```javascript
// offlineSync.js — the only addition needed
ASSESSMENTS: {
  key: 'ASSESSMENTS',
  table: 'assessments',
  getRecords: () => storage.getUnsyncedRecords('ASSESSMENTS'),
},
```

### Why this works cleanly

The sync engine uses a table-config pattern — each entry declares its storage key, Supabase table name, and a function to retrieve unsynced records. The `syncTable` function then handles retry logic, exponential backoff, error tracking, and marking records as synced. None of that logic knows or cares about assessments specifically. It's the same machinery that syncs time entries, sessions, children, and groups.

There are two other touch points in `storage.js` that are easy to forget:
- **`getAllUnsyncedCount()`** — the tables array drives the badge count shown in the `SyncIndicator`. If you don't add your new key here, the unsynced count will be wrong.
- **`clearDomainData()`** — called on logout. If you don't add your key to `domainKeys`, assessment data would persist after sign-out.

### Schema decisions worth noting

```sql
child_id UUID NOT NULL,  -- no FK
```

We intentionally skip the foreign key on `child_id`. The app's documented cascade failure (CLAUDE.md) shows that when a `children` record hasn't synced yet, any table with an FK pointing to it will fail with error `23503`. Since assessments and children sync independently, the FK would create an ordering dependency we can't guarantee offline.

`user_id` is the single ownership column. Unlike the `children` table (which has both `created_by` for RLS and `staff_children` for many-to-many access), assessments are simple: the assessor owns the record, period. One column, one RLS check.

`date_assessed` is `TEXT` not `DATE` or `TIMESTAMPTZ` — matching the `sessions.session_date` pattern. This avoids the timezone day-shift bug where a session recorded at 11pm local time gets stored as the next day in UTC.

---

## 2. Component Architecture: Why a Separate Grid

### Index-based vs character-based tracking

The existing `LetterGrid.js` (used in literacy session forms) tracks selection by **character value**:

```javascript
// Existing LetterGrid — character-based
const isSelected = selectedLetters.includes(letter);
onToggleLetter(letter);  // toggles 'a' on/off
```

This means tapping one 'a' selects all 'a's — which is correct for the session form (you're marking which letters you taught).

EGRA needs **position-based** tracking. The letter 'a' appears at index 1 and also at index 41 in the isiXhosa set. Each position is scored independently — a child might get the first 'a' correct and the second one wrong. So `EgraLetterGrid` tracks by global index:

```javascript
// EgraLetterGrid — index-based
letterStates = { [globalIndex]: true }
onToggle(globalIndex);  // toggles position 7 on/off
```

The `pageOffset` prop is the key to making pagination work with global indices. Page 2 shows letters 20-39, so tapping the first tile on page 2 calls `onToggle(20)`, not `onToggle(0)`.

```javascript
// EgraLetterGrid renders 20 letters per page
{letters.map((letter, i) => {
  const globalIndex = pageOffset + i;  // local index → global index
  const isCorrect = letterStates[globalIndex] === true;
  // ...
})}
```

### Digraph rendering

English letter sets include digraphs (`ch`, `sh`, `th`, `wh`, `oo`, `ee`). These are multi-character strings that need to fit in the same tile. Rather than special-casing the grid layout, we apply a smaller font size when `letter.length > 1`:

```javascript
letter.length > 1 && styles.tileTextDigraph,  // 16px instead of 20px
```

The grid does **not** call `.toUpperCase()` — unlike the existing `LetterGrid.js`. The English EGRA set uses mixed case (`I`, `a`, `E`, `p`) by design, because letter recognition includes distinguishing case.

### Timer color transitions

`AssessmentTimer` is a pure presentational component. It takes `timeRemaining` and computes everything else — progress width, color thresholds:

```javascript
function getTimerColor(timeRemaining) {
  if (timeRemaining > 30) return colors.success;   // green
  if (timeRemaining >= 10) return colors.accent;    // yellow
  return colors.emphasis;                            // red
}
```

The progress bar width is `(timeRemaining / ASSESSMENT_DURATION) * 100%`. No animation library — just a `View` with a percentage width. This is intentional: the bar updates once per second (on each tick), and a CSS-style width change is smooth enough at that rate without adding `react-native-reanimated` as a dependency.

---

## 3. State Machine: Phase-Based Screen Rendering

`LetterAssessmentScreen` uses a simple phase state machine:

```
'instructions' → 'active' → 'finished'
```

The component renders different UI based on phase. The instructions phase is a full early-return — the active/finished phases share the same grid layout but with controls disabled in the finished state.

```javascript
if (phase === 'instructions') {
  return ( /* instructions UI */ );
}
// else: active or finished — same grid, different interactivity
return ( /* grid + timer + nav buttons */ );
```

This is simpler than having three separate components or using a navigation stack for what is conceptually one screen with different modes.

### Three finish paths, one function

There are exactly three ways an assessment can end:

1. **Timer hits zero** — the `setInterval` callback detects `prev <= 1`
2. **Manual "End Assessment"** — the assessor taps the red text button
3. **"Finish" button** — appears on the last page as a replacement for "Next"

All three call the same `handleFinish()` function. This is critical — if scoring logic were duplicated across three paths, they'd inevitably drift. The `hasFinishedRef` guard prevents double-execution (the timer and a button press could theoretically race).

```javascript
const handleFinish = useCallback(() => {
  if (hasFinishedRef.current) return;  // guard against double-fire
  hasFinishedRef.current = true;
  clearInterval(timerRef.current);
  setPhase('finished');
  saveAssessment();
}, []);
```

---

## 4. The Stale Closure Problem and Ref Mirroring

This is the most important engineering pattern in this feature.

### The problem

`handleFinish` is called from inside `setInterval`'s callback. In React, closures capture state values at the time the effect runs. So when the timer effect fires on mount (phase changes to 'active'), `handleFinish` — and everything it calls — would read the `letterStates`, `lastTappedIndex`, and `timeRemaining` values from that initial render.

After 60 seconds of the user tapping letters, those state values have changed dozens of times. But the timer callback still holds a reference to the original empty `letterStates` object.

### The solution: ref mirroring

We maintain refs that mirror the latest state values, updated on every render:

```javascript
const letterStatesRef = useRef(letterStates);
const lastTappedIndexRef = useRef(lastTappedIndex);
const timeRemainingRef = useRef(timeRemaining);

// Updated every render — refs always have the latest value
letterStatesRef.current = letterStates;
lastTappedIndexRef.current = lastTappedIndex;
timeRemainingRef.current = timeRemaining;
```

Then `saveAssessment` reads from refs instead of state:

```javascript
const saveAssessment = async () => {
  const elapsed = ASSESSMENT_DURATION - timeRemainingRef.current;
  const currentLetterStates = letterStatesRef.current;
  const currentLastTapped = lastTappedIndexRef.current;
  const result = computeAssessmentResult(currentLetterStates, currentLastTapped, letterSet.letters);
  // ...
};
```

### Why not just add dependencies to useCallback?

You might think: "just add `letterStates` and `lastTappedIndex` to `handleFinish`'s dependency array." The problem is that `handleFinish` is referenced inside the timer `useEffect`. If `handleFinish` changes identity on every render (because its deps change), the timer effect would need to re-run, clearing and recreating the interval — which resets the countdown. Refs avoid this entirely because mutating `.current` doesn't trigger re-renders or effect re-runs.

### Where else this pattern appears

The `useTimeTracking` hook uses the same `setInterval` + ref pattern for the elapsed time counter. The timer there reads `activeEntry?.sign_in_time` which doesn't change during the interval, so it doesn't hit the stale closure issue. But the pattern is the same.

---

## 5. Scoring Logic: Position-Based EGRA Rules

EGRA scoring has a specific rule: **letters attempted = position of the last letter the child attempted + 1**, not the total number of taps.

Example: The child reads letters at positions 0, 1, 2, skips 3, reads 4, then stops. `lastTappedIndex` is 4. `lettersAttempted` is 5 (positions 0-4). Position 3 counts as **incorrect** even though the assessor never tapped it — because it falls within the attempted range.

```javascript
const lettersAttempted = lastTappedIndex + 1;

for (let i = 0; i <= lastTappedIndex; i++) {
  if (letterStates[i] === true) {
    correctLetters.push({ index: i, letter: letters[i] });
  } else {
    incorrectLetters.push({ index: i, letter: letters[i] });
  }
}
```

This is why `lastTappedIndex` tracks the **maximum** index ever tapped, not the most recent. The assessor might go back and mark an earlier letter they missed, but the "attempted" boundary only moves forward:

```javascript
setLastTappedIndex((prev) => Math.max(prev, globalIndex));
```

The `computeAssessmentResult` function is defined outside the component — it's a pure function with no dependency on React state, hooks, or refs. This makes it testable in isolation and ensures there's exactly one code path for scoring.

---

## 6. Navigation Wiring

### Tab addition

The Assessments tab was added back as the 4th bottom tab. The `screenOptions` callback in `MainTabNavigator` uses an `if/else if` chain to map route names to Ionicons:

```javascript
} else if (route.name === 'Assessments') {
  iconName = focused ? 'clipboard' : 'clipboard-outline';
}
```

### Stack screens

Four stack screens were added to `MainNavigator`:

| Screen | headerShown | Why |
|--------|-------------|-----|
| `AssessmentChildSelect` | true (default) | Standard back-button navigation |
| `LetterAssessment` | **false** | Full-screen during timed assessment — custom layout with `paddingTop: 60` handles status bar |
| `AssessmentResults` | **false** | Self-contained with its own Done/Try Again buttons |
| `AssessmentHistory` | true | Standard list screen |

### "Try Again" uses `navigation.replace`

When the user taps "Try Again" on the results screen, we use `replace` not `navigate`:

```javascript
navigation.replace('LetterAssessment', {
  child,
  letterSet,
  attemptNumber: attemptNumber + 1,
});
```

`replace` swaps the current screen in the stack instead of pushing a new one. This prevents the back stack from growing with every retry — pressing back from attempt 3 goes to the child select screen, not through attempts 2 and 1.

### Back-button guard

React Navigation's `beforeRemove` listener intercepts both hardware back (Android) and gesture/header back (iOS). We only attach it during the `active` phase — the instructions phase allows normal back navigation, and the finished phase has already saved data so leaving is fine.

```javascript
useEffect(() => {
  if (phase !== 'active') return;
  const unsubscribe = navigation.addListener('beforeRemove', (e) => {
    e.preventDefault();
    // show Alert, only dispatch if confirmed
  });
  return unsubscribe;
}, [navigation, phase]);
```

---

## 7. Offline Sync Path

The assessment save flow:

```
handleFinish()
  → saveAssessment()
    → storage.saveAssessment(assessment)     // AsyncStorage, synced: false
    → refreshSyncStatus()                     // updates badge count
    → navigation.navigate('AssessmentResults')
```

Later, when the device is online, `OfflineContext`'s background sync calls `syncAll()`, which iterates `SYNC_TABLES` and finds the `ASSESSMENTS` entry. The record is upserted to Supabase, and `markAsSynced` flips the local `synced` flag.

### History screen: cache-first merge

`AssessmentHistoryScreen` follows the exact same pattern as `SessionHistoryScreen`:

1. Read from `storage.getAssessments()` → render immediately (offline-fast)
2. If online, `SELECT * FROM assessments WHERE user_id = ?`
3. Server rows get `synced: true`, local unsynced rows not yet on server are preserved
4. Merged array replaces the local cache

```javascript
const serverRecords = data.map((a) => ({ ...a, synced: true }));
const serverIds = new Set(serverRecords.map((a) => a.id));
const localUnsynced = cached.filter((a) => a.synced === false && !serverIds.has(a.id));
const merged = [...serverRecords, ...localUnsynced];
```

This ensures: (1) the user never sees a blank screen while waiting for network, (2) synced data from server is authoritative, (3) unsynced local records are never silently dropped.

---

## 8. File Map

```
src/
├── constants/
│   └── egraConstants.js              # Letter sets, duration config
├── components/
│   └── assessment/
│       ├── EgraLetterGrid.js          # Index-based pressable tile grid
│       └── AssessmentTimer.js         # Progress bar + countdown
├── screens/
│   ├── main/
│   │   └── AssessmentsScreen.js       # Hub (Start + History buttons)
│   └── assessments/
│       ├── AssessmentChildSelectScreen.js   # Child picker + language dialog
│       ├── LetterAssessmentScreen.js        # Core timed assessment
│       ├── AssessmentResultsScreen.js       # Score display + retry
│       └── AssessmentHistoryScreen.js       # Cache-first history list
├── utils/
│   └── storage.js                     # +ASSESSMENTS key, CRUD, count, clear
├── services/
│   └── offlineSync.js                 # +ASSESSMENTS in SYNC_TABLES
└── navigation/
    └── AppNavigator.js                # +Tab + 4 stack screens

supabase-migrations/
└── 05_add_assessments_table.sql       # Table + RLS + indexes
```
