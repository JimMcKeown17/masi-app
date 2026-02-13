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
  4. Assessments (placeholder — "Coming soon")

**Tab changes from original design:**
- Time Tracking tab removed — sign in/out promoted to Home screen as the primary daily action
- Assessments tab added as placeholder for the next major feature phase
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

## Future Enhancements (Post-MVP)
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
- App version/build info in debug section

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

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Status**: Ready to begin Phase 0
