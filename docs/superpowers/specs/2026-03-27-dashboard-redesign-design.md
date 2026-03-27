# Dashboard Redesign — Design Spec

## Context

The current home screen shows a gradient header, a clock in/out card, and a sessions card with a "Record a Session" button. It's functional but uninspiring — no stats, no performance visibility, no sense of progress. The other tabs (Children, Sessions, Assessments) are similarly bare: either just navigation buttons or flat lists with no summary context.

**Goal:** Transform the app into a data-rich coaching tool where every tab gives the coach immediate visibility into their work and their children's progress.

## Scope

### 1. Home Screen Redesign

Replace the current home screen with a card-based dashboard:

**Gradient Header** (keep existing pattern):
- Welcome message with user's first name
- Role + school subtitle
- **New:** Three inline stats: `days worked this month`, `sessions this month`, `# children`

**Clock Card** (compact version of existing):
- Same functionality — shows clock-in state, elapsed time, Clock In/Out button
- More compact layout: single row with label left, button right

**Sessions This Week Card**:
- Five day-of-week squares (Mon–Fri) showing session count per day
- Future days show `—` in light gray
- Total sessions count in header right
- "Record Session" button below the squares

**Assessment Coverage Card**:
- Progress bar showing `% of children assessed`
- Label: "X of Y children assessed"
- Large percentage number right-aligned

**Performance Insight Buttons** (3 icon cards in a row):
- **Letter Mastery** — opens `LetterMasteryRankingScreen`
- **Assessment Scores** — opens `AssessmentRankingScreen`
- **Session Count** — opens `SessionCountRankingScreen`
- Each shows an icon, label, and subtitle

### 2. Three New Drill-Down Ranking Screens

Each screen shows all children ranked best-to-worst with horizontal bar charts.

#### LetterMasteryRankingScreen
- **Metric:** `(assessment_mastered + coach_taught) / 26` letters per child
- **Data sources:** `storage.getAssessments()` + `storage.getLetterMastery()` + `computeAssessmentMastery()`
- **Display:** Rank number, child name, horizontal bar, `X/26` label
- **Summary row:** Avg mastery %, count above 70%, count below 40%
- **Bar colors:** Green (70%+), Yellow (40–69%), Red (under 40%)
- **Color key** at bottom

#### AssessmentRankingScreen
- **Metric:** Most recent EGRA accuracy per child (`correct_letters.length / last_letter_attempted.index + 1`)
- **Data source:** `storage.getAssessments()`, most recent per child
- **Display:** Rank, name, bar, `X%` accuracy
- **Summary row:** Avg accuracy, count above 70%, count below 40%
- **Children with no assessment:** Listed at bottom as "Not yet assessed"

#### SessionCountRankingScreen
- **Metric:** Total sessions per child (all time)
- **Data source:** `storage.getSessions()`, count per `child_id` from `activities.children_ids` array
- **Display:** Rank, name, bar (relative to max), `X sessions` label
- **Summary row:** Total sessions, avg per child, most/least sessions
- **Children with 0 sessions:** Listed at bottom

#### Shared Ranking Screen Patterns
- Back navigation to home
- Title + subtitle description
- Summary stat row (3 stats in a card)
- FlatList of ranked rows with:
  - Left color border (green/yellow/red by threshold)
  - Rank number → Child name → Horizontal bar (View-based, percentage width) → Value label
- Color key footer

### 3. Tab Stat Bars

Small summary stat cards at the top of each existing tab screen. Three stat pills in a row, same visual pattern across all tabs.

#### Children Tab Stats
- **# Children** — total children count
- **# Classes** — total classes count
- **# Unassessed** — children with no EGRA assessment (red color)

#### Sessions Tab Stats
- **This Week** — session count this week
- **This Month** — session count this month
- **Avg/Child** — sessions per child this month
- **Callout row:** "X children not seen this week" (red text, with "View →" link)

#### Assessments Tab Stats
- **% Assessed** — percentage of children with at least one assessment
- **Total** — total assessment count
- **Avg Accuracy** — average of most-recent EGRA accuracy per child

### 4. Dependencies

**No new dependencies.** All visualizations use plain Views — the Sessions This Week card uses simple numbered day squares, and the ranking bars use percentage-width Views. A charting library (e.g., `react-native-gifted-charts`) can be added in a future phase when actual chart features are needed. Avoids unnecessary bundle size and app store scrutiny.

## Data Computation

All stats are computed in-memory from AsyncStorage data. No new database tables or Supabase queries needed.

### New Utility: `src/utils/dashboardStats.js`

Shared functions used across home screen and tab stat bars:

```
getDaysWorkedThisMonth(timeEntries, userId)
getSessionsThisWeek(sessions, userId) → { total, byDay: { Mon: 3, Tue: 4, ... } }
getSessionsThisMonth(sessions, userId)
getSessionsPerChild(sessions, userId) → Map<childId, count>
getChildrenNotSeenThisWeek(sessions, children, userId) → [child, ...]
getAssessmentCoverage(assessments, children) → { assessed: count, total: count, pct: number }
getAvgAssessmentAccuracy(assessments, children) → number
getLetterMasteryPerChild(assessments, letterMastery, children, classes) → [{ child, mastered, total: 26, pct }]
getAssessmentScorePerChild(assessments, children) → [{ child, accuracy, correct, attempted }]
```

### Reuse Existing Code
- `computeAssessmentMastery()` from `src/utils/letterMastery.js` — already computes assessment-mastered letters per child
- `normalizeLanguageKey()` from `src/utils/letterMastery.js` — maps language strings to letter set keys
- `LETTER_SETS`, `PEDAGOGICAL_ORDERS` from `src/constants/egraConstants.js`
- `useTimeTracking` hook — already loaded on HomeScreen
- `useAuth`, `useChildren`, `useClasses`, `useOffline` contexts — already available

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/dashboardStats.js` | Shared stat computation functions |
| `src/screens/insights/LetterMasteryRankingScreen.js` | Ranked letter mastery list |
| `src/screens/insights/AssessmentRankingScreen.js` | Ranked assessment scores list |
| `src/screens/insights/SessionCountRankingScreen.js` | Ranked session count list |
| `src/components/dashboard/StatBar.js` | Reusable 3-pill stat bar component |
| `src/components/dashboard/RankedBarRow.js` | Reusable ranked row with horizontal bar |

## Files to Modify

| File | Changes |
|------|---------|
| `src/screens/main/HomeScreen.js` | Full rewrite — new dashboard layout |
| `src/screens/main/ChildrenListScreen.js` | Add StatBar at top |
| `src/screens/main/SessionsScreen.js` | Add StatBar at top |
| `src/screens/main/AssessmentsScreen.js` | Add StatBar at top |
| `src/navigation/AppNavigator.js` | Register 3 new ranking screens |
| `package.json` | Add react-native-gifted-charts + peer deps |

## Color Thresholds (Ranking Bars)

| Range | Color | Meaning |
|-------|-------|---------|
| 70%+ | `#3FA535` (green) | Strong performance |
| 40–69% | `#FFBB00` (yellow) | Developing |
| Under 40% | `#E72D4D` (red) | Needs attention |

## Verification

1. **Home screen loads** with all stats populated from real data
2. **Stats are accurate**: manually verify days worked, session counts, child counts against AsyncStorage data
3. **Drill-down screens** show all children ranked correctly with accurate bar widths
4. **Tab stat bars** show correct numbers on Children, Sessions, Assessments tabs
5. **Empty states**: screens handle 0 children, 0 sessions, 0 assessments gracefully
6. **Offline**: all stats compute from local AsyncStorage (no network dependency)
7. **Pull-to-refresh**: stats update on screen focus via `useFocusEffect`
8. **Navigation**: all drill-down screens accessible and back navigation works
