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
- group_name (text, nullable) -- NEW: for grouping children (e.g., "Group 2")
- assigned_staff_id (uuid, FK to users)
- created_at (timestamp)
- updated_at (timestamp)
```

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
  1. Home (includes link to Profile)
  2. Time Tracking
  3. Children
  4. Sessions

**Note**: Profile is accessible via a link/button on the Home screen rather than occupying a dedicated tab. Profile is used less frequently than core features (time tracking, children management, session recording), so keeping it off the main tab bar reduces clutter while maintaining easy access.

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

### Phase 3: Children Management
- [ ] Children list screen
- [ ] Add child form
- [ ] Child detail view
- [ ] Search and filter
- [ ] Local storage for children
- [ ] Children sync service
- [ ] **Group creation UI**
- [ ] **Group assignment to children**
- [ ] **Group selection in lists**

### Phase 4: Session Recording (Literacy Coach)
- [ ] Literacy Coach session form design (get field requirements)
- [ ] Session form screen with job title routing
- [ ] Child selection component (search + add)
- [ ] **Group-based child selection**
- [ ] Session data capture
- [ ] Local storage for sessions
- [ ] Session sync service
- [ ] Session history screen (last 30 days, newest first)

### Phase 5: Additional Session Forms
- [ ] Numeracy Coach form (get field requirements)
- [ ] ZZ Coach form (get field requirements)
- [ ] Yeboneer form (get field requirements)
- [ ] Test all form types

### Phase 6: Offline Sync Refinement
- [ ] Queue-based sync system
- [ ] Retry logic with exponential backoff
- [ ] Last-write-wins implementation
- [ ] Sync on app foreground/background
- [ ] Persistent header sync indicator
- [ ] Dedicated sync status screen
- [ ] Manual review marking for failed syncs
- [ ] Network state detection

### Phase 7: Polish & Production Prep
- [ ] Error handling across all screens
- [ ] Loading states
- [ ] Form validation (basic client-side)
- [ ] User feedback (toasts, alerts)
- [ ] RLS policy tightening
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
**Fields to be defined** - will gather detailed requirements when ready to implement Phase 4.

### Other Forms
Requirements to be gathered as we progress through development phases.

---

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Status**: Ready to begin Phase 0
