# Masi App - Product Requirements Document

## Project Overview
A React Native mobile application for Masi, a nonprofit organization, to manage field staff's work with children, track time, and record educational sessions. The app is designed to work offline-first, as staff may be without connectivity for days at a time.

---

## Tech Stack

### Core Technologies
- **Framework**: React Native with Expo
- **Language**: JavaScript (no TypeScript)
- **UI Library**: React Native Paper (Material Design)
- **Backend**: Supabase (Authentication + PostgreSQL)
- **Offline Storage**: @react-native-async-storage/async-storage
- **Navigation**: React Navigation (Bottom Tabs)
- **Forms**: React Hook Form
- **Location**: expo-location
- **State Management**: React Context API

---

## Database Schema

### users
```sql
- id (uuid, FK to auth.users)
- first_name (text)
- last_name (text)
- job_title (enum: 'Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer')
- assigned_school (text)
- created_at (timestamp)
- updated_at (timestamp)
```

### children
```sql
- id (uuid)
- first_name (text)
- last_name (text)
- teacher (text)
- class (text)
- age (integer)
- school (text)
- assigned_staff_id (uuid, FK to users) -- DEPRECATED: Use staff_children junction instead
- created_at (timestamp)
- updated_at (timestamp)
```

### staff_children (many-to-many junction)
```sql
- id (uuid)
- staff_id (uuid, FK to users)
- child_id (uuid, FK to children)
- assigned_at (timestamp)
- synced (boolean, default false)
- created_at (timestamp)
```
**Purpose**: Enables many-to-many relationships - one child can have multiple coaches (e.g., both literacy and numeracy coach).

### groups
```sql
- id (uuid)
- name (text) -- e.g., "Group 2", "Advanced Reading Group"
- staff_id (uuid, FK to users)
- created_at (timestamp)
- updated_at (timestamp)
- synced (boolean, default false)
```

### children_groups (junction table for many-to-many)
```sql
- id (uuid)
- child_id (uuid, FK to children)
- group_id (uuid, FK to groups)
- created_at (timestamp)
```

### time_entries
```sql
- id (uuid)
- user_id (uuid, FK to users)
- sign_in_time (timestamp)
- sign_in_lat (decimal)
- sign_in_lon (decimal)
- sign_out_time (timestamp, nullable)
- sign_out_lat (decimal, nullable)
- sign_out_lon (decimal, nullable)
- synced (boolean, default false)
- created_at (timestamp)
```

### sessions
```sql
- id (uuid)
- user_id (uuid, FK to users)
- session_type (text, matches job_title)
- session_date (date)
- children_ids (uuid[], array of child IDs)
- group_ids (uuid[], array of group IDs used, nullable)
- activities (jsonb, flexible structure based on job_title)
- notes (text)
- synced (boolean, default false)
- created_at (timestamp)
- updated_at (timestamp)
```

---

## Core Features & Requirements

### 1. Authentication
**Requirements:**
- Email/password login
- Password reset functionality
- Profile management (name and password editable by user)
- Job title and assigned school: read-only (admin-managed)

**Technical Decisions:**
- Start with lenient RLS policies during development
- Tighten RLS before production deployment
- **User Onboarding (MVP)**: Manual user creation via Supabase dashboard
  - Admin creates user account in Supabase Auth
  - Admin creates profile entry in public.users table
  - Admin communicates credentials to staff
  - Staff logs in and changes password immediately
- **Future Enhancement**: Automated invitation system with email links (post-MVP)

### 1b. Home Screen (Redesigned)
The Home screen is the primary daily-use screen for field coaches.

**Layout (top to bottom):**
1. **Identity header** — blue→red brand gradient, Welcome + role • school
2. **Conditional sync banner** — only shown when needed:
   - Failed items (red): `{n} items failed to sync — needs attention`
   - Offline (gray): `Offline — data will sync when connected`
   - Unsynced (yellow): `{n} items waiting to sync`
   - Taps to SyncStatusScreen
3. **Today card** — Work Status:
   - State A: "Not signed in" + gradient Sign In button
   - State B: "Signed in at {time}", live elapsed timer, red Sign Out button
   - GPS location captured on both sign in and sign out
   - "🕒 View Work History ›" text link → TimeEntriesListScreen
4. **Sessions card** — Record a Session:
   - Shows count of sessions recorded today (`{n} today` badge)
   - Gradient-outline "Record a Session" button → SessionFormScreen

**Shared hook**: `src/hooks/useTimeTracking.js` — encapsulates all sign in/out state, GPS, AsyncStorage, and elapsed timer logic. Used by both HomeScreen and TimeTrackingScreen.

### 2. Time Tracking
**Requirements:**
- Sign in/out with geolocation capture
- View daily/weekly work hours
- Cannot sign in twice without signing out
- Offline-first: saves locally, syncs when online

**Technical Decisions:**
- **Location accuracy**: Medium (50-100m) - balanced approach
- **Location permissions**: Persistent prompts until granted (required for sign-in)
- **Time display**: Static sign-in time with manual refresh button
- Sign-in blocked if location permission denied
- Store coordinates with medium accuracy settings

**Workflow:**
1. User taps "Sign In"
2. Request location permission (if not granted, show persistent prompt)
3. Capture coordinates with medium accuracy
4. Save to AsyncStorage with `synced: false`
5. Update UI to show "Signed In" state
6. Show sign-in time with refresh button for elapsed time
7. On sign-out: capture coordinates, update entry, calculate hours

### 3. Children Management
**Requirements:**
- View assigned children list
- Add new children (with sync to backend)
- View child details (name, teacher, class, age, school, group)
- Search and filter children
- Must add children to list before using in sessions (no ad-hoc addition during session recording)

**NEW: Group Management**
- **Hybrid approach**: Staff can create groups, admin can override in Supabase
- Staff can assign children to groups
- Quick group selection: selecting "Group 2" automatically selects all children in that group
- Groups sync to Supabase when online
- Groups stored locally when offline

**Technical Decisions:**
- Children must be in assigned list before session recording
- Groups are many-to-many with children (junction table)
- Group creation syncs with offline-first pattern

### 4. Session Recording
**Requirements:**
- Dynamic forms based on user's job title:
  - **Literacy Coach** (first to implement)
  - Numeracy Coach
  - ZZ Coach
  - Yeboneer
- Forms have significantly different structures per job title
- Select multiple children per session
- Group-based selection: select a group to add all children in that group
- Record activities and notes
- Track date of session
- View-only history of past sessions

**Technical Decisions:**
- Separate form components for each job title
- Child selection: Multi-step (search → add to list)
- Can also select by group (adds all children in group)
- Session history: last 30 days, newest first, read-only
- No editing after submission
- Basic client-side validation, Supabase handles comprehensive validation

**Child Selection Workflow:**
1. Search bar to filter children
2. Tap child or group to add to selected list
3. Selected children appear as removable items
4. Submit session with selected children IDs and group IDs (if applicable)

### 5. Offline Functionality & Sync
**Requirements:**
- All operations work offline
- Automatic sync when connection restored
- Visual sync status indicators
- Queue-based sync with retry logic
- Staff may be offline for days at a time

**Technical Decisions:**
- **Sync strategy**: Last-write-wins (staff edit always overwrites server)
- **Sync triggers**: On app foreground/background
- **Conflict resolution**: No conflict UI, always prefer staff's offline changes
- **Sync feedback**:
  - Persistent indicator in header showing unsynced items count
  - Dedicated sync status screen accessible from header
- **Sync failures**: Retry with limit (3-5 attempts), then mark for manual review
- Don't give up on network errors - mark for admin investigation

**Offline Sync Architecture:**
```
User Action → Local AsyncStorage → UI Update → Sync Queue → Supabase → Update synced flag
```

**Sync Queue Logic:**
1. All write operations save to AsyncStorage immediately
2. Mark records with `synced: false` flag
3. On app foreground/background, check network state
4. If online, process sync queue (unsynced items)
5. Retry failed syncs with exponential backoff
6. After retry limit, mark for manual review
7. Update `synced: true` on successful upload

---

## UI/UX Specifications

### Navigation Structure
- **Bottom Tab Navigation** with 4 tabs:
  1. Home
  2. My Children
  3. Sessions
  4. Assessments (EGRA Letter Sound Assessment)

**Tab changes from original design:**
- Time Tracking tab removed — sign in/out promoted to Home screen as the primary daily action
- Assessments tab now contains EGRA Letter Sound Assessment feature (see Phase 8 below)
- Tabs reordered: Home → My Children → Sessions → Assessments

**Profile access**: gear icon (⚙️) in Home tab header → ProfileScreen (stack navigation). Sign Out button lives at the bottom of ProfileScreen. Profile is not a tab — used infrequently, keeping the tab bar clean.

### Theme
- **Light mode only** (for now)
- React Native Paper Material Design
- Clean, simple, mobile-first design
- Large tap targets for field use

### Sync Status Indicator
- Persistent badge/icon in app header
- Shows count of unsynced items
- Tappable to open dedicated sync status screen
- Sync status screen shows:
  - Network state
  - Unsynced items by type (time entries, children, sessions, groups)
  - Last sync attempt time
  - Failed items marked for review

---

## Development Phases

### Phase 0: Project Setup ✓ (Complete)
- [x] Create PRD.md
- [x] Create PROGRESS.md
- [x] Initialize Expo project
- [x] Install core dependencies
- [x] Set up Supabase project
- [x] Configure environment variables
- [x] Set up navigation structure (bottom tabs)
- [x] Create placeholder screens (Home, Time, Children, Sessions)
- [x] Establish brand colors and styling guidelines

### Phase 1: Authentication & Foundation ✓ (Complete)
- [x] Supabase client configuration
- [x] Auth context setup
- [x] Login screen
- [x] Password reset flow
- [x] Profile screen (name & password editable)
- [x] Basic navigation flow (4 bottom tabs)
- [x] Offline storage setup (AsyncStorage)
- [x] OfflineContext for sync management
- [ ] Invitation system (email links) - **DEFERRED to post-MVP** (using manual Supabase creation)

### Phase 2: Time Tracking (First Complete Workflow) ✓ (Ready for Testing)
- [x] Location service setup (expo-location wrapper)
- [x] Location permission handling (request on mount, persistent prompts)
- [x] Configure medium accuracy (50-100m)
- [x] Time tracking screen UI
  - [x] Check for active time entry on load
  - [x] "Sign In" button (when not signed in)
  - [x] "Sign Out" button (when signed in)
  - [x] Display current sign-in time and elapsed duration
  - [x] Real-time elapsed timer (updates every second)
- [x] Sign in functionality
  - [x] Block if location permission denied
  - [x] Capture GPS coordinates (medium accuracy)
  - [x] Save to AsyncStorage with `synced: false`
  - [x] Update UI immediately
- [x] Sign out functionality
  - [x] Capture GPS coordinates
  - [x] Calculate total hours worked
  - [x] Update time entry in AsyncStorage
  - [x] Trigger background sync
- [x] Time entries list view (daily/weekly grouping)
- [ ] Test offline sync with time entries (user testing required)

### Phase 3: Children Management ✓ (Complete)
- [x] Children list screen with search and filter
- [x] Add child form with validation
- [x] Edit child screen with group memberships display
- [x] Delete child functionality
- [x] Local storage for children with offline sync
- [x] Children sync service (with staff_children junction)
- [x] **Group creation UI**
- [x] **Group management screen (create/rename/delete)**
- [x] **Group assignment to children (many-to-many)**
- [x] **Add children to group screen**
- [x] **Many-to-many staff-children relationships**
- [x] **Pull-to-refresh and sync status indicators**

### Phase 4: Session Recording (Literacy Coach) ✓ (Complete)
- [x] Literacy Coach session form design (field requirements gathered from website + field team)
- [x] Session form screen with job title routing
- [x] Child selection component (search + add)
- [x] **Group-based child selection**
- [x] Session data capture (date, children, letters, reading levels, comments → activities JSONB)
- [x] Local storage for sessions (offline-first, synced flag)
- [x] Session sync service (already wired in offlineSync.js)
- [x] Session history screen (last 30 days, newest first)
- [x] **Fixed auto-sync**: refreshSyncStatus now triggers sync when unsynced items detected
- [x] **Fixed uuid**: installed react-native-get-random-values polyfill in App.js entry point

### Phase 5: Additional Session Forms
- [ ] Numeracy Coach form (get field requirements)
- [ ] ZZ Coach form (get field requirements)
- [ ] Yeboneer form (get field requirements)
- [ ] Test all form types

### Phase 6: Offline Sync Refinement ✓ (Complete)
- [x] Queue-based sync system
- [x] Retry logic with exponential backoff
- [x] Last-write-wins implementation
- [x] Sync on app foreground/background
- [x] Persistent header sync indicator
- [x] Dedicated sync status screen (`SyncStatusScreen.js` — network badge, last synced, per-table breakdown, failed items with per-item retry)
- [x] Manual review marking for failed syncs (failed items persisted to `syncMeta.failedItems`; retry clears counter + re-queues)
- [x] Network state detection

### Phase 7: Polish & Production Prep (Partially Complete)
- [x] Error handling across all screens — Snackbar standardised across 6 screens; Alert reserved for destructive confirmations only
- [x] Loading states — ActivityIndicator on SessionHistoryScreen; Create/Save button spinners on GroupManagementScreen
- [x] Form validation (basic client-side) — inline red errors on LiteracySessionForm; email regex guard on LoginScreen
- [x] User feedback (toasts, alerts) — Snackbar pattern applied consistently
- [x] RLS policy tightening — `supabase-migrations/03_tighten_children_rls.sql` (adds `created_by` column, BEFORE INSERT trigger, replaces `WITH CHECK (TRUE)` policy)
- [ ] Security review
- [ ] Testing on Android emulator
- [ ] Testing on iOS simulator
- [ ] Performance optimization
- [ ] Production deployment

### Phase 8: EGRA Letter Sound Assessment ✓ (Complete)
- [x] Assessment child selection screen with search and sort (last assessed date, accuracy)
- [x] EGRA letter grids — English (60 letters, mixed case) and isiXhosa (60 letters with digraphs)
- [x] Timed 60-second assessment with color-coded countdown timer
- [x] Paginated letter grid (20 per page, 5 columns × 4 rows) — tap to mark correct
- [x] "Last Letter Attempted" bottom sheet — assessor confirms where child stopped after timer/manual finish
- [x] Assessment results screen — accuracy ring, feedback message, stat cards (Attempted, Correct, Incorrect), letter-by-letter detail grid
- [x] Assessment history screen — filterable list of past assessments (last 30 days), tappable cards
- [x] Assessment detail screen — standalone view of past assessment with full stats and color-coded letter grid
- [x] Auto-detect language from child's class — skips manual language selection dialog when `class.home_language` maps to an available letter set
- [x] Assessment icon on Class Details child rows — quick access to most recent assessment
- [x] Offline-first storage and sync for assessments (same pattern as other entities)
- [x] Schools and classes data model — `schools`, `classes` tables with `home_language` field; children linked via `class_id`
- [x] Supabase migration for assessments table with RLS policies

---

## App Structure
```
/src
  /components
    /common
      - Button.js
      - Input.js
      - Card.js
      - LoadingSpinner.js
      - SyncIndicator.js (header badge)
      - LocationPermissionPrompt.js
    /session-forms
      - LiteracySessionForm.js (first to implement)
      - NumeracySessionForm.js
      - ZZCoachSessionForm.js
      - YeboneerSessionForm.js
      - BaseSessionForm.js
    /children
      - ChildCard.js
      - ChildSelector.js (multi-step: search → add)
      - GroupSelector.js (NEW)
      - ChildForm.js
      - GroupForm.js (NEW)
      - GroupPickerBottomSheet.js
    /assessment
      - EgraLetterGrid.js (paginated letter tile grid)
      - AssessmentTimer.js (countdown bar)
      - LastAttemptedBottomSheet.js (post-assessment prompt)
      - AssessmentDetailGrid.js (color-coded results grid)
  /screens
    /auth
      - LoginScreen.js
      - ForgotPasswordScreen.js
      - InvitationScreen.js (NEW)
    /main
      - HomeScreen.js
      - TimeTrackingScreen.js
      - ChildrenListScreen.js
      - ChildDetailScreen.js
      - AddChildScreen.js
      - GroupManagementScreen.js (NEW)
      - SessionFormScreen.js
      - SessionHistoryScreen.js
      - ProfileScreen.js
      - SyncStatusScreen.js (NEW)
    /assessments
      - AssessmentChildSelectScreen.js (child picker with auto-language)
      - LetterAssessmentScreen.js (timed EGRA assessment)
      - AssessmentResultsScreen.js (post-assessment results)
      - AssessmentHistoryScreen.js (past assessments list)
      - AssessmentDetailScreen.js (detailed view of past assessment)
    /children
      - ClassDetailScreen.js
      - EditChildScreen.js
      - CreateClassScreen.js
      - EditClassScreen.js
  /services
    - supabaseClient.js
    - offlineSync.js
    - locationService.js (medium accuracy config)
    - authService.js
    - invitationService.js (NEW)
  /context
    - AuthContext.js
    - OfflineContext.js
    - ChildrenContext.js
    - ClassesContext.js
    - GroupsContext.js (NEW)
  /utils
    - storage.js
    - validators.js
    - dateHelpers.js
  /navigation
    - AppNavigator.js
    - AuthNavigator.js
    - MainNavigator.js (bottom tabs)
  /constants
    - colors.js
    - jobTitles.js
    - egraConstants.js (letter sets, duration, helpers)
```

---

## Environment Variables
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (dev only, remove before production)
```

---

## Design Principles
- **Offline-first**: Every action works offline, syncs later
- **Simple & Clean**: Minimal UI, clear actions, easy navigation
- **Functional Components**: Use hooks, avoid class components
- **Mobile-first**: Touch-friendly, large tap targets
- **Clear Feedback**: Loading states, success/error messages, sync indicators
- **Field-tested**: Designed for low-tech environments and intermittent connectivity

---

## Debug & Support Features (Implemented)

### Overview
Field staff often work in remote areas with limited connectivity. When issues occur, support teams need detailed diagnostic information to help troubleshoot problems.

### Requirements
- Export app logs for debugging
- Export local database for support team analysis
- Terms & Conditions access
- Privacy-conscious user data handling

### Technical Decisions

**Log Capture**: Rolling buffer of last 1000 entries
- Intercepts console.log, console.error, console.warn
- Stores in AsyncStorage with timestamp and severity level
- Automatically rotates to prevent excessive storage use
- Captures all app activity including sync operations, errors, and user actions

**Export Method**: React Native Share API (native share sheet)
- Uses native OS sharing capabilities (WhatsApp, Email, etc.)
- No external dependencies or file system complexity
- Works on both iOS and Android
- User controls where data is sent

**Database Export**: Full AsyncStorage dump with metadata
- Exports all local data in JSON format
- Includes export timestamp, app version, and device info
- Contains sensitive data warning (confirmation dialog required)
- Useful for debugging sync issues and data recovery

**Terms & Conditions**: External URL link
- Configurable URL (no app update needed to change terms)
- Opens in default browser
- App store compliant
- Current URL: https://masinyusane.org/terms

### Use Cases
1. **Field staff reports issue**: Share logs via WhatsApp to support team
2. **Sync debugging**: Export database to analyze unsynced records
3. **Data recovery**: Database export helps recover lost data if sync fails
4. **App store compliance**: Terms link required for Apple/Google app stores
5. **Performance issues**: Logs show timing and error patterns

### Profile Screen Structure
1. **Profile Information** (read-only display)
   - Name, Email, Job Title, Assigned School
   - Removed editable fields to simplify UI

2. **Debug & Support**
   - Share Logs button
   - Share Database button (with sensitive data warning)

3. **Change Password**
   - Existing password change functionality

4. **Legal**
   - Terms & Conditions link

### Privacy & Security
- Database export requires confirmation (contains sensitive data)
- No automatic uploads - user explicitly shares via native OS
- Logs stored locally only (not sent to external services)
- Clear labeling of sensitive data warnings

---

## Improvements Backlog (Field Testing Feedback)

Items discovered during the first weeks of field testing (March 2026). Prioritise these ahead of post-MVP features since they affect active testers.

### Sync UX: "Retry All Failed" Button
**Problem**: When multiple records hit `MAX_RETRY_ATTEMPTS` (5), each one is moved to the Failed Items list and must be retried individually. During the March 2026 schema incident, one tester had 9 permanently-failed records (children, staff_children, children_groups) — each requiring a separate tap. The "Unsynced Items" section shows them as "pending" with no visual distinction from records that are still actively retrying, so the user keeps tapping "Sync Now" expecting progress.

**Proposed fix:**
1. Add a **"Retry All"** button at the top of the Failed Items section that clears retry counters for all failed records and triggers a sync in one tap.
2. Visually distinguish "waiting to sync" items from "permanently failed" items in the Unsynced Items section — e.g., show failed items in red/orange with an error icon instead of the upload icon.
3. Consider surfacing the Failed Items section more prominently (above the Sync Now button, or as a warning banner) so users don't miss it.

**Affected files:** `SyncStatusScreen.js`, `offlineSync.js` (add `retryAllFailed` export)

---

## Future Enhancements (Post-MVP)
- **OTA Updates (expo-updates)**: Install `expo-updates` and configure `runtimeVersion` in `app.json` to enable over-the-air JS bundle updates without full store submissions. Critical for pushing bug fixes quickly to field staff.
- Dark mode
- Streaks and awards system
- Admin portal for user management
- Advanced reporting and analytics
- Photo capture for sessions
- Push notifications
- Multi-language support
- Curriculum progress tracking integration
- Offline map caching for location context
- Clear Logs button in debug section
- ~~App version/build info in debug section~~ (Done - shown on Profile screen)

### Coach Alerts (Post-MVP)
A lightweight flagging system that surfaces important messages to coaches without requiring a dedicated notification infrastructure.

**How it works:**
1. Backend Python scripts (run by Masi staff or scheduled jobs) analyse session data and write flag records to a `coach_alerts` Supabase table.
2. The app pulls new alerts from `coach_alerts` through the existing offline sync loop — no new network layer or WebSocket connection is needed.
3. Alerts are surfaced to the user as in-app messages (e.g. a banner or card on the Home screen) and dismissed once read.

**`coach_alerts` table (indicative schema):**
```sql
- id (uuid)
- user_id (uuid, FK to users)       -- which coach the alert is for
- message (text)                     -- human-readable alert text
- alert_type (text)                  -- category/severity (e.g. 'info', 'warning')
- created_at (timestamp)
- read_at (timestamp, nullable)      -- null until the coach dismisses the alert
```

**Design rationale:**
- Reuses the existing sync queue so no additional background service is required in the app.
- Python scripts decouple alert generation from the mobile app; Masi's data team can add or change alert logic without an app release.
- Read state (`read_at`) is stored on the server so alerts don't reappear if the app is reinstalled or the cache is cleared.

---

## Notes & Constraints
- Staff can work offline for days
- No concurrent editing of same child record (one staff per child assignment)
- Sessions cannot be edited after submission (view-only history)
- Geolocation is approximate (school vicinity is sufficient)
- Priority on stability and offline reliability over features
- Testing with Android emulator + iOS simulator
- Keep Supabase usage efficient (mindful of free tier limits)

---

## Session Form Requirements

### Literacy Coach Form

**Fields recorded per session:**
1. **Session Date** — date picker, defaults to today
2. **Children** — multi-select via search or group selection; stored as `children_ids` array + `group_ids` if selected via group
3. **Letters Focused On** — tap-to-toggle grid displayed in curriculum teaching order (not alphabetical); stored as array in `activities.letters_focused`
4. **Session Reading Level** — single dropdown for the session target (what level the coach focused on); stored in `activities.session_reading_level`
5. **Child Reading Levels** — optional per-child dropdown; each selected child can have their current reading level recorded; stored as map in `activities.child_reading_levels` (keyed by child UUID)
6. **Comments** — optional free-text notes; stored in `activities.comments`

**Reading level options (in progression order):**
- Cannot blend
- 2 Letter Blends
- 3 Letter Blends
- 4 Letter Blends
- Word Reading
- Sentence Reading
- Paragraph Reading

**Letter order:** Matches the paper tracker — read vertically down each column, left to right across columns. Stored in `src/constants/literacyConstants.js`.
- Column 1: a, e, i, o, u, m, l, n, s
- Column 2: d, k, t, f, g, y, w, b, p
- Column 3: c, x, j, h, v, z, q
- Note: `r` is not on the paper tracker and is intentionally excluded.

**Letter Tracker Feature (to be implemented after session form):**
- A per-child mastery grid showing all letters in teaching order
- Staff shade/check a box when a child has mastered each letter
- Children move at their own pace — progress fills in left to right over days/weeks
- Visually similar to the paper tracker sheets used in the field
- Accessible from child detail screen
- Mastery data stored locally with offline sync
- This is a progress-tracking tool, separate from session recording (session form records "letters focused on today"; letter tracker records "has this child mastered this letter")

### Other Forms
Requirements to be gathered as we progress through development phases.

---

**Document Version**: 1.2
**Last Updated**: 2026-04-05
**Status**: Field testing in progress; Phase 8 (EGRA Assessment) complete; Phase 5 (additional session forms) in progress

---

## Development Progress

> Consolidated from PROGRESS.md on 2026-04-05.

### Current Status
**Phase**: Field Testing Bug Fixes — Round 1

---

### In Progress

#### Sync Engine Bug Fixes — Ghost Children & Junction Errors
Branch: `main` (direct fix — field-critical)

Root cause: `loadChildren()` merge logic dropped locally synced children when their `staff_children` junction hadn't synced yet, causing cascading FK errors.

- [x] Fix merge logic in `loadChildren()`, `loadChildrenGroups()`, `loadGroups()` — preserve all local records not in server response
- [x] Apply same fix to `ClassesContext.js`, `TimeEntriesListScreen`, `SessionHistoryScreen`, `AssessmentHistoryScreen`
- [x] Fix `onConflict` keys: `staff_children` → `staff_id,child_id`, `children_groups` → `child_id,group_id`, `classes` → `staff_id,name,school_id`
- [x] Add terminal error classification (`classifyError`): 23505 → mark synced, 23503/42501 → quarantine immediately
- [x] Enforce explicit sync order (`SYNC_ORDER` array) with dependency gating — skip junction tables when parent fails
- [x] One-time orphan repair (`repairOrphanedJunctions`) — re-queues stuck children and junction records on upgrade
- [ ] End-to-end device testing
- [ ] Push update via EAS

#### Field Testing Bug Fixes — Round 1
Branch: `bugfix/field-testing-round-1`

- [x] Bug 1: Last Letter Attempted — prevent selecting before last correct letter (added `minIndex` to bottom sheet)
- [x] Bug 2: Auto-default last letter when child finishes entire test (skip bottom sheet if last letter correct)
- [x] Bug 3: Assessment ranking sorted by total correct count, not percent
- [x] Bug 4: Back button not working — added React-rendered `headerLeft` to all Stack screens
- [x] Feature 5: Tappable rows on ranking screens — AssessmentRanking → AssessmentDetail, LetterMastery → LetterTracker
- [x] Feature 6: "Unassessed" stat pill on Children tab navigates to Assessments tab
- [x] Feature 7: Light red background on Clock card when not clocked in
- [x] Bug 8: Letter Tracker header double-counts mastered letters (Set union dedup)
- [x] Bug 9: Letter mastery sync 23505 duplicate key — changed `onConflict` to composite key + local dedup
- [ ] End-to-end verification on device
- [ ] Merge to main

#### Phase 10: Dashboard Redesign
- [x] Branch setup (`feature/dashboard-redesign`)
- [x] Create directories (`src/screens/insights/`, `src/components/dashboard/`)
- [x] Add `.superpowers/` to `.gitignore`
- [x] Utility layer — `src/utils/dashboardStats.js`
  - [x] `getDaysWorkedThisMonth`, `getWeekSessionCounts`, `getSessionsThisMonth`
  - [x] `getAssessmentCoverage`, `getLetterMasteryRanking`, `getAssessmentRanking`
  - [x] `getSessionCountRanking`, tab stat functions
- [x] Reusable components
  - [x] `StatBar` — 3-pill stat row component
  - [x] `RankedBarRow` — ranked horizontal bar row
- [x] Home screen redesign
  - [x] Gradient header with inline monthly stats
  - [x] Compact clock card
  - [x] Sessions This Week card (day squares)
  - [x] Assessment Coverage progress bar
  - [x] Performance Insight drill-down buttons
- [x] Navigation & ranking screens
  - [x] Register 3 new screens in AppNavigator
  - [x] LetterMasteryRankingScreen
  - [x] AssessmentRankingScreen
  - [x] SessionCountRankingScreen
- [x] Tab stat bars
  - [x] Children tab: # children, # classes, # unassessed
  - [x] Sessions tab: this week, this month, avg/child + not-seen callout
  - [x] Assessments tab: % assessed, total, avg accuracy
- [x] Polish & end-to-end verification
  - [x] Fixed context property naming (`children` not `childrenList`) in all 6 new screens
  - [x] Fixed UTC→local timezone bug in date helpers (critical for UTC+2 South African users)
  - [x] Fixed `created_at` tie-breaker missing in `getAssessmentsTabStats`
  - [x] Fixed `letter_language` comparison to use `normalizeLanguageKey`
  - [x] Fixed null accuracy handling in `getAssessmentRanking`
  - [x] Expo dev server starts cleanly, zero IDE diagnostics

#### Phase 9: Letter Tracker
- [x] Supabase migration — `letter_mastery` table
- [x] Pedagogical letter orders in egraConstants.js
- [x] Mastery calculation utility (letterMastery.js)
- [x] Storage CRUD methods for letter_mastery
- [x] Sync integration with soft-delete support
- [x] LetterTrackerScreen with grid UI
- [x] Navigation route registration
- [x] Entry point icon on ClassDetailScreen
- [x] Documentation updates (egra_letter_sets.md, LEARNING.md)
- [x] Session form integration — LetterTrackerBottomSheet + form restructure
- [ ] End-to-end testing

---

### Completed Phases

#### Phase 0: Project Setup ✓
- Expo project initialized, all core dependencies installed
- Supabase project created with base schema and RLS
- Environment variables configured, navigation structure set up
- Documentation created (PRD, PROGRESS, LEARNING, DATABASE_SCHEMA_GUIDE)

#### Phase 1: Authentication & Foundation ✓
- Supabase client config, AuthContext, LoginScreen, ForgotPasswordScreen
- ProfileScreen with password change, profile refresh
- Offline storage setup (AsyncStorage), OfflineContext

#### Phase 1.5: Profile Improvements & Debug Tools ✓
- Logger utility (rolling 1000-entry buffer), debug export via Share API
- ProfileScreen refactored to 4-section layout (info, debug, password, legal)

#### Phase 2: Time Tracking ✓
- Sign in/out with geolocation (medium accuracy), time entries list
- Daily hours calculation, offline sync with exponential backoff

#### Phase 3: Children & Groups Management ✓
- staff_children many-to-many junction, ChildrenContext with CRUD
- Group management (create/rename/delete), children-groups assignment
- Search, filter, pull-to-refresh, sync indicators

#### Phase 4: Session Recording — Literacy Coach ✓
- LiteracySessionForm (calendar, child selector, letter grid, reading levels)
- SessionHistoryScreen (last 30 days), uuid polyfill fix, auto-sync fix

#### Phase 6: Offline Sync Refinement ✓
- Failed items persistence with retry, SyncStatusScreen
- Per-table unsynced breakdown, manual retry per failed item

#### Phase 7: Polish & Production Prep (Partial) ✓
- Snackbar standardization, loading states, inline form validation
- RLS tightening (created_by trigger), .env.example fix
- **Remaining**: security review, device testing, performance, deployment

#### Phase 8: EGRA Letter Sound Assessment ✓
- Schools/classes data model, assessment table with RLS
- Timed 60-second EGRA grid, last-letter-attempted bottom sheet
- Results screen, history, detail view, auto-language detection
- Assessment icon on class detail rows

---

### Decisions Made

#### Architecture
- **Sync Strategy**: Last-write-wins (staff changes always overwrite server)
- **Sync Triggers**: App foreground/background
- **Navigation**: Bottom tab navigation — Home → My Children → Sessions → Assessments
- **Theme**: Light mode only (initially)
- **Validation**: Basic client-side, comprehensive server-side

#### Features
- **Groups**: Hybrid management (staff can create, admin can override)
- **Child Selection**: Multi-step (search → add to list) + group-based selection
- **Time Tracking**: Medium accuracy location (50-100m), static display with manual refresh
- **Session History**: Last 30 days, newest first, read-only
- **Profile Editing**: Name and password only (job details admin-only)

---

### Recent Activity Log

#### 2026-03-26 (EGRA Assessment v2 — Last Attempted, Detail Grid, Auto-Language)
- "Last Letter Attempted" bottom sheet, assessment detail grid, history cards tappable
- Auto-detect language from class, assessment icon on Class Details
- Branch: `feature/letter-assessment-v2` merged to main

#### 2026-02-13 (Home Redesign & Navigation Restructure)
- Extracted `useTimeTracking` hook, redesigned HomeScreen with gradient header
- Time tab removed, Assessments tab added, gear icon for profile access
- Branches: `redesign/home-tab` and `redesign/assessments-tab` merged to main

#### 2026-02-04 (Phase 7 Polish & Phase 6 Sync Refinement)
- Feedback standardization (Alert → Snackbar), loading states, inline validation
- RLS migration, SyncStatusScreen, failed items persistence
- Phases 6 & 7 (partial) complete

#### 2026-02-03 (Session Recording — Literacy Coach)
- LiteracySessionForm, LetterGrid, ChildSelector, SessionHistoryScreen
- uuid polyfill fix, auto-sync bug fix, test data loaded

#### 2026-01-30 (Children & Groups Management)
- staff_children junction, ChildrenContext, GroupManagementScreen
- Full CRUD with offline-first architecture, Phase 3 complete

---

### Remaining Work
- Phase 5: Additional session forms (Numeracy, ZZ Coach, Yeboneer)
- Phase 7 remaining: security review, Android/iOS device testing, performance, deployment
- Field testing bug fixes: end-to-end verification and merge

---

## Planned Admin Scripts

These scripts are planned but not yet implemented. See the linked plan documents for full details.

### 1. Seed Test Data Script
**Purpose**: Quickly populate a test user account with fake but realistic data (class, children, groups, sessions, assessments, time entries) for testing the app.
**Plan**: [`documentation/seed_data_plan.md`](documentation/seed_data_plan.md)

### 2. Bulk Import Children & Groups
**Purpose**: Import real class lists (children + group assignments) for new users from existing spreadsheets. Most new users already have their children grouped — this script wires up all the relationships (school, class, children, staff_children, groups, children_groups) in one run.
**Plan**: [`documentation/bulk_import_children_plan.md`](documentation/bulk_import_children_plan.md)

### 3. Staff User Creation Automation
**Purpose**: Replace the manual multi-step workflow (Supabase Auth sign-up → copy UUID → Table Editor → insert `public.users` row with first_name/last_name/job_title/assigned_school) with a single command or form. Extend naturally to CSV bulk creation and pre-linking staff to their assigned children.

**Problem today**: Creating one staff member requires ~8 clicks across two Supabase surfaces (Authentication + Table Editor) and manual UUID copy-paste. As the staff roster grows, this becomes the rate-limiter on onboarding.

**Options considered (no plan doc yet):**
1. **Postgres trigger** (`handle_new_user`) on `auth.users` that auto-creates the matching `public.users` row from `raw_user_meta_data` passed at sign-up. Canonical Supabase pattern; one-time setup; benefits every creation path thereafter.
2. **Local Node script** using the service-role key to call `auth.admin.createUser({ email, password, user_metadata })` and insert the profile row (and eventually `staff_children`) in one command. Fast to build; extends linearly to CSV bulk.
3. **Supabase Edge Function + small admin UI** so non-technical admins can create users without touching code. Higher setup cost; right answer when delegation is needed.
4. **Dashboard CSV import** for profile rows only — limited value since it can't create auth records.

**Leaning**: combine **#1 + #2** — add the trigger now (permanent good citizen, works regardless of creation path), plus a Node script for single-command staff creation that scales to CSV bulk and child pre-linking. Promote to **#3** if user creation ever needs to be delegated off Jim's laptop.

**Related**: Should compose with [`documentation/bulk_import_children_plan.md`](documentation/bulk_import_children_plan.md) — the child pre-linking step of this script is exactly the relationship wiring that plan already describes. Consider whether staff creation runs as "step 0" of the bulk import, or as a separate script that the import reuses.

**Security note**: service-role key must remain local/server-side only — never bundled into the mobile app.
