# Masi App - Learning Journey
### Building a World-Class Offline-First Mobile Application

---

## Introduction

This document chronicles the architectural decisions, engineering patterns, and design philosophy behind building the Masi Field Staff App. Whether you're a junior developer learning mobile development or an experienced engineer interested in offline-first architecture, this guide walks through every critical decision and explains the "why" behind the "how."

---

## 2026 SQLite Clean-Slate Architecture

The early chapters describe the original AsyncStorage design. That was the right first version for a smaller field app, but Masi now needs relational local data: children belong to classes, groups, programmes, academic years, and assignment relationships, and those relationships must survive offline writes and mid-year changes. The app therefore moved domain data and sync metadata to SQLite; the cutover completed on 2026-05-26.

The new rule is: domain writes go to SQLite first, then a `sync_outbox` row is enqueued in the same transaction. The outbox is the only push source. This matters because multi-step work such as "create child plus assignment plus programme enrollment plus class membership" either all lands locally or all rolls back. It also means retry metadata, terminal failures, and pending work are durable across app restarts.

AsyncStorage is no longer the app database. It remains only where it is a good fit: Supabase auth session persistence and the small logger buffer used by Profile -> Export Logs. The cached user profile and support diagnostics now live in SQLite/local state.

The schema is also more explicit than the first version:
- `programmes` and `staff_programme_assignments` model what work an EA is currently doing.
- `child_programme_enrollments` lets one child receive support in multiple programmes at once.
- `academic_years`, `assessment_windows`, and `child_class_memberships` preserve reporting history over time.
- `class_ea_assignments`, `group_ea_assignments`, `grouping_versions`, and `class_grouping_state` support admin-precreated classes, EA handover, and regrouping without destroying history.

Support export changed with the storage model. "Export Database" now exports a SQLite diagnostic bundle: schema version, migrations, table counts, sync state, and failed or terminal outbox rows. That is more useful for field support than a raw key-value dump because it shows whether the app has pending work, which rows are stuck, and which local schema is installed. It is still sensitive: failed outbox payloads can include child names and session or assessment details, so the export warning remains mandatory.

The Plan 6 emulator pass tested the refactor where SQLite bugs are most likely to hide: write while offline, kill the app, reopen with pending outbox rows, reconnect, and confirm the server has the rows. That pass created an offline assessment and session, reopened with six pending rows, then synced all six successfully. The final RLS/sync hardening pass then fixed physical-device preview failures around Supabase upsert visibility and immutable assignment retries. As of 2026-05-26, the SQLite backend is the forward path for new work. Future UI changes should be tested against this backend, and broad field rollout should still include practical device smoke checks such as low-end Android and GPS clock-in/out.

---

## 2026-07-14: Observability Is a Three-Layer Reliability System

A crash SDK is necessary, but it is not the same thing as an operational monitoring system. Sentry
can automatically see native crashes, JavaScript exceptions, React render failures, app hangs, and
failed network requests. It cannot infer that a durable outbox row has exhausted its retry budget,
that a sync preflight returned an error as ordinary data, or that a pull reconcile circuit breaker
correctly refused a suspicious mass removal. Those are domain states, not crashes.

Masi therefore uses three complementary layers:

1. **Automatic failure capture.** Sentry starts before the React application module loads. It wraps
   the root, registers React Navigation, captures native and JavaScript failures, and retains
   error-triggered replay, screenshots, and view hierarchy. A failure before the first screen is
   still a production failure, so initialization timing is part of the reliability contract.
2. **Explicit domain-health reporting.** The sync boundary translates returned failure states into
   structured issues. Skipped no-session passes, preflight errors, retriable records, terminal
   outbox rows, and reconcile breakers each carry counts, representative records, online state,
   last attempt, and last success. Fifteen-minute rate limiting and stable fingerprints preserve
   signal without turning a 30-second status poll into an alert storm.
3. **Durable local forensics.** AsyncStorage retains one field-support week and up to 2,000 capped
   entries. The log starts intercepting console output synchronously, then hydrates prior entries
   before the first write so startup failures cannot overwrite the previous launch. This layer is
   still useful when the device has no connectivity, Sentry credentials are absent, or event
   delivery itself is the failing system.

Runtime identity also has two independent versions. `expo-application` identifies the native binary
actually installed, including the store build number. `expo-updates` identifies the JavaScript bundle
currently running on top of that binary. Support needs both because two devices can have the same
binary but different OTA updates, or the same app version label but different remotely incremented
native builds. Events and exports also include device/OS, backend project, and SQLite schema so a
report answers "what exact system failed?" before an engineer asks the EA for screenshots.

Source maps complete the chain. A DSN makes events arrive, but it does not make minified production
stacks readable. EAS Build uploads source maps automatically when the Sentry plugin and sensitive
auth token are configured. EAS Update requires uploading the matching `dist/` maps after every OTA
publish. A release with events but without matching maps is observability only in name.

The Profile verification action intentionally captures a handled `Error` rather than crashing the
app or sending a stackless message. This checks transport, tags, and source-map symbolication while
leaving the EA's session intact.

---

## 2026-07-14: Onboarding Is a Durable State Machine

The first version of the child step could have disabled Finish Setup while the roster was empty and
looked correct in a screen test. That would not have made the rule true. Android hardware back can
remove a route even when its header button is hidden, and force-quitting destroys React Navigation
state entirely. After the class had been saved, the next launch would see one available class and
conclude that onboarding was complete.

The durable model separates three facts:

1. The class and its EA assignment are synced domain state.
2. The child rows are synced domain state.
3. "This user still owes the first-child step for this locally created class" is device-local
   workflow state.

The third fact belongs in SQLite `local_state`, keyed by user, rather than in React state or on the
server. `classOnboardingRepository.start` writes that marker inside the same transaction used to
create the class, its assignment, and their outbox rows. Either the whole onboarding aggregate is
durable or none of it is. A launch reads the marker and both Home and My Children route back to the
same child step. Finishing after at least one child removes the marker before navigation exits. If
that local write fails, the EA stays in setup and the already saved class and children remain safe.

This is the difference between a screen condition and a workflow invariant. A screen condition is
true only while one component is mounted. A workflow invariant can be reconstructed after process
death from durable facts. For offline-first apps, any multi-screen rule that matters after a restart
needs the second form.

The ten-child threshold is intentionally not another invariant. It is a recommendation: counts one
through nine show a warning and require explicit confirmation, while ten removes the warning. Keeping
the mandatory minimum and the recommended target as separate states lets the app encourage a usable
roster without blocking small legitimate classes.

---

## Chapter 1: Foundation - Understanding the Problem Space

### The Challenge
We're building a mobile app for nonprofit field staff who work in environments with unreliable or no internet connectivity. They may be offline for days at a time while still needing to:
- Track their work hours with location data
- Manage information about children they work with
- Record detailed educational session notes
- Have all this data sync automatically when they return to connectivity

This creates a unique set of constraints that drive our entire architecture.

### Critical Requirements That Shape Everything
1. **Offline-first**: The app must work perfectly without internet
2. **Data integrity**: No data loss, even with complex sync scenarios
3. **Simplicity**: Field staff need intuitive UI, not complex tech
4. **Reliability**: A crash or bug in the field is unacceptable

---

## Chapter 2: Technology Stack - Why These Choices?

### React Native + Expo
**Decision**: Use React Native with Expo framework
**Why?**
- **Cross-platform**: Single codebase for iOS and Android reduces development time by ~50%
- **JavaScript**: Widely known language, easier to find developers and maintain
- **Expo**: Provides managed workflow, handles native modules (like geolocation) without ejecting to native code
- **Fast iteration**: Hot reload lets us see changes instantly during development
- **Large ecosystem**: Thousands of packages and community support

**Trade-off**:
- Slightly larger app size vs native
- Some performance overhead vs native
- But for our use case (forms, data sync, simple UI), these trade-offs are negligible

### Supabase (PostgreSQL + Auth)
**Decision**: Use Supabase as backend instead of Firebase, AWS Amplify, or custom backend
**Why?**
- **PostgreSQL**: Mature, relational database with JSONB support for flexible session data
- **Row Level Security (RLS)**: Database-level security ensures staff only see their data
- **Built-in auth**: Email/password and invitation system included
- **Generous free tier**: Perfect for nonprofit budget constraints
- **SQL**: Standard queries, no vendor-specific syntax to learn
- **Real-time subscriptions**: Future feature potential (though not needed for offline-first)

**How it fits offline-first**:
- Device stores data locally in AsyncStorage
- Supabase acts as source of truth when syncing
- RLS policies ensure security even with complex sync logic

### AsyncStorage (Offline Storage)
**Decision**: Use AsyncStorage for local data persistence
**Why?**
- **Simple key-value store**: Perfect for our sync queue pattern
- **Async by design**: Non-blocking, won't freeze UI
- **Cross-platform**: Works identically on iOS and Android
- **Reliable**: Battle-tested in production apps

**Pattern we use**:
```javascript
// Store data with sync flag
await AsyncStorage.setItem(`session_${id}`, JSON.stringify({
  ...sessionData,
  synced: false,
  localTimestamp: Date.now()
}));

// Later, retrieve unsynced items
const allKeys = await AsyncStorage.getAllKeys();
const unsyncedSessions = allKeys
  .filter(key => key.startsWith('session_'))
  .map(async key => {
    const data = await AsyncStorage.getItem(key);
    return JSON.parse(data);
  })
  .filter(item => !item.synced);
```

### React Native Paper (Material Design)
**Decision**: Use React Native Paper for UI components instead of building custom or using other libraries
**Why?**
- **Consistent design**: Material Design is familiar to users
- **Accessibility**: Built-in support for screen readers, touch targets
- **Themeable**: Easy to customize colors while maintaining consistency
- **Well-maintained**: Active community, regular updates
- **Complete**: Forms, buttons, cards, dialogs all included

**Philosophy**: Don't reinvent the wheel for UI. Focus innovation on offline sync logic.

### React Navigation (Bottom Tabs)
**Decision**: Bottom tab navigation instead of drawer or stack-only
**Why?**
- **Thumb-friendly**: Easy to reach on phones, even one-handed
- **Always visible**: Users always see where they are
- **Mobile standard**: Familiar pattern from apps like Instagram, Twitter
- **4 main sections**: Home, Time, Children, Sessions - each gets a tab

**Structure**:
```
Bottom Tabs (4 tabs)
├── Home (dashboard + link to profile)
├── Time Tracking (sign in/out)
├── Children (list, search, groups)
└── Sessions (record + history)
```

Profile is accessible from Home instead of being a 5th tab because:
- Used less frequently than core features
- Keeps tab bar uncluttered
- Profile is typically "settings" which users expect in a menu/button

---

## Chapter 3: Offline-First Architecture - The Core Pattern

### The Fundamental Insight
Most apps are "online-first": they try to hit the server, then fall back to local storage if offline. This creates complexity and failure modes.

**Offline-first inverts this**:
1. Write to local storage immediately
2. Update UI optimistically
3. Sync to server in background
4. Trust local data as source of truth until proven otherwise

### The Sync Pattern We Use: "Last Write Wins"

**Decision**: Staff's offline edits always overwrite server data
**Why?**
- **Simplicity**: No conflict resolution UI to confuse users
- **Field staff priority**: Admin can't edit their data anyway (by design)
- **Rare conflicts**: Only one staff member assigned to each child

**How it works**:
```
User adds child offline:
1. Generate UUID locally (not server-generated)
2. Save to AsyncStorage with synced: false
3. Show immediately in UI
4. When online, POST to Supabase
5. If success, mark synced: true
6. If failure, keep trying (with backoff)
```

**Trade-off**: If admin updates child data while staff is offline editing, staff changes win. This is acceptable because:
- Admins rarely change data
- Staff data is more current (they're in the field)
- We can add conflict logging later if needed

### Sync Triggers: When Does Syncing Happen?

**Decision**: Sync on app foreground/background, not continuously
**Why?**
- **Battery life**: Constant network checks drain battery
- **Predictable**: Staff knows sync happens when they open/close app
- **Wi-Fi usage**: Staff can wait until on Wi-Fi to open app
- **Simple to implement**: React Native AppState listener

**Implementation pattern**:
```javascript
import { AppState } from 'react-native';

AppState.addEventListener('change', (nextState) => {
  if (nextState === 'active') {
    // App came to foreground - try to sync
    syncQueue.processAll();
  }
  if (nextState === 'background') {
    // App going to background - try to sync
    syncQueue.processAll();
  }
});
```

### The Sync Queue Architecture

**Pattern**: All unsynced operations go in a queue, processed in order

**Why a queue?**
- **Ordered**: Sessions must be created after children they reference
- **Retryable**: Failed syncs can retry without losing place
- **Visible**: Can show user exactly what hasn't synced yet
- **Debuggable**: Can inspect queue state for troubleshooting

**Queue structure** (simplified):
```javascript
{
  'child_uuid_1': { type: 'child', operation: 'create', data: {...}, retries: 0 },
  'session_uuid_2': { type: 'session', operation: 'create', data: {...}, retries: 1 },
  'time_entry_uuid_3': { type: 'time', operation: 'update', data: {...}, retries: 0 }
}
```

**Processing logic**:
1. Check network connectivity
2. If offline, exit early
3. If online, process each queue item:
   - Try to sync
   - If success: remove from queue, mark `synced: true`
   - If failure: increment retries, apply backoff
   - If retries > threshold: mark for manual review

**Retry backoff**:
```
Attempt 1: Immediate
Attempt 2: 5 seconds
Attempt 3: 25 seconds (5^2)
Attempt 4: 125 seconds (5^3)
Attempt 5+: Mark for manual review
```

---

## Chapter 4: Database Design - Schema as Contract

### Core Principle: The Database Enforces Truth

We use PostgreSQL (via Supabase) with careful schema design to ensure data integrity.

### The Users Table
```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  job_title TEXT NOT NULL CHECK (job_title IN ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer')),
  assigned_school TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Key decisions**:
- `id` references `auth.users`: One source of truth for authentication
- `job_title` has CHECK constraint: Database prevents invalid values (no app bug can violate this)
- `NOT NULL` on critical fields: No partial user records
- `updated_at`: Enables sync conflict detection if needed later

### The Children Table (Original)
```sql
CREATE TABLE children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  teacher TEXT,
  class TEXT,
  age INTEGER,
  school TEXT,
  assigned_staff_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Design note**: `teacher`, `class`, `age`, `school` are nullable because staff may not have all info when adding a child in the field.

### The Groups Feature - Schema Evolution

**New requirement**: Staff need to group children (e.g., "Group 2") and select entire groups for sessions.

**Initial thought**: Add `group_name TEXT` column to `children` table.
**Problem**: What if a child is in multiple groups? Or groups change frequently?

**Better design**: Many-to-many relationship via junction table.

```sql
-- Groups table
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);

-- Junction table for many-to-many
CREATE TABLE children_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(child_id, group_id)  -- Prevent duplicate relationships
);
```

**Why this design?**
- **Flexibility**: Child can be in multiple groups
- **Normalization**: Group names stored once, not duplicated per child
- **Cascading deletes**: If group deleted, relationships auto-removed
- **UNIQUE constraint**: Can't accidentally add child to same group twice
- **Staff ownership**: Each group belongs to a staff member (groups aren't shared across staff)

**Sessions table update**:
```sql
ALTER TABLE sessions
ADD COLUMN group_ids UUID[];  -- Array of group IDs used in this session
```

**Why track group IDs in sessions?**
- Historical record: "Session was with Group 2" even if group membership changes later
- Audit trail: Know which groups were active at time of session
- Reporting: "How many sessions did Group 2 have this month?"

---

## Chapter 5: Authentication & Security - Layers of Protection

### Invitation System

**Decision**: Admin sends email invitations, user sets password via link
**Why?**
- **Controlled access**: Only invited users can create accounts
- **Email verification**: Built-in email confirmation
- **Professional**: Better UX than manual account creation

**Flow**:
1. Admin uses Supabase dashboard to send invite
2. User receives email with magic link
3. User clicks link, sets password
4. App auto-creates profile in `users` table (via trigger or manual insert)

### Row Level Security (RLS)

**What is RLS?**
Database-level security that filters queries automatically based on the user making the request.

**Example**:
```sql
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (assigned_staff_id = auth.uid());
```

**What this does**:
- User A queries: `SELECT * FROM children`
- Database automatically adds: `WHERE assigned_staff_id = 'user_a_id'`
- User A only sees their children, can't even write a query to see others

**Why RLS instead of app-level filtering?**
- **Defense in depth**: Even if app has a bug, database enforces security
- **Impossible to bypass**: No SQL injection or API manipulation can circumvent
- **Audit compliance**: Database logs prove data access is controlled

**Our RLS policies**:
- Users see only their own profile
- Users see only children assigned to them
- Users see only their own time entries
- Users see only their own sessions

**Development vs Production**:
- Development: Start with lenient policies for faster iteration
- Production: Lock down with strict policies before launch
- Testing: Use test accounts to verify RLS is working correctly

---

## Chapter 6: Geolocation - Balancing Accuracy and Battery

### The Location Tracking Requirement

Time tracking needs to capture staff location to verify they're at the school.

**Three accuracy levels**:
1. **Low (100-1000m)**: City-level, uses cell towers, minimal battery
2. **Medium (50-100m)**: Neighborhood-level, uses Wi-Fi + GPS, balanced
3. **High (10-50m)**: Precise GPS, drains battery significantly

**Decision**: Medium accuracy (50-100m)

**Why?**
- **Good enough**: Can identify which school in a district
- **Battery conscious**: Staff may be in field all day
- **Faster**: Locks onto location in 2-3 seconds vs 10+ for high accuracy
- **Reliable**: Works even with partial GPS signal

**Implementation with expo-location**:
```javascript
import * as Location from 'expo-location';

const options = {
  accuracy: Location.Accuracy.Balanced,  // Medium accuracy
  timeout: 10000,  // 10 second timeout
  maximumAge: 0     // Don't use cached location
};

const location = await Location.getCurrentPositionAsync(options);
```

### Permission Handling

**Decision**: Require location permission for time tracking, persistent prompts

**Flow**:
1. User taps "Sign In"
2. Check if location permission granted
3. If not granted:
   - Show custom prompt explaining why we need it
   - Request permission
   - If denied, show prompt again (loop until granted)
4. Only proceed with sign-in once permission granted

**Why persistent prompts?**
- Location is **required** for time tracking (not optional)
- Without it, time entry is incomplete/invalid
- Better to block than create bad data

**User-friendly approach**:
- Explain clearly: "We need your location to verify you're at the school"
- Show example: "This helps ensure accurate timesheets"
- Make it easy: Big "Grant Permission" button

---

## Chapter 7: State Management - React Context Pattern

### Why Context API Over Redux/MobX/Zustand?

**Decision**: Use React Context for global state

**Why?**
- **Simpler**: No extra libraries, less boilerplate
- **Sufficient**: Our state isn't that complex
- **React-native**: Context API is built-in, fully supported
- **Learning curve**: Easier for junior developers to understand

**What goes in Context?**
- `AuthContext`: Current user, login status, auth methods
- `OfflineContext`: Sync queue, network status, sync methods
- `ChildrenContext`: Cached children list, CRUD operations
- `GroupsContext`: Groups and child-group relationships

**What doesn't?**
- Local component state (useState)
- Form state (react-hook-form handles it)
- Navigation state (React Navigation handles it)

### AuthContext Example

```javascript
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    checkSession();
  }, []);

  const checkSession = async () => {
    const session = await supabase.auth.getSession();
    if (session) {
      const profile = await fetchUserProfile(session.user.id);
      setUser({ ...session.user, ...profile });
    }
    setLoading(false);
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;

    const profile = await fetchUserProfile(data.user.id);
    setUser({ ...data.user, ...profile });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

**Usage in components**:
```javascript
const HomeScreen = () => {
  const { user, signOut } = useAuth();

  return (
    <View>
      <Text>Welcome, {user.first_name}!</Text>
      <Button onPress={signOut}>Sign Out</Button>
    </View>
  );
};
```

---

## Chapter 8: Form Design - Job-Specific Session Recording

### The Challenge

Four different job titles, each with completely different session forms:
- **Literacy Coach**: Letters, phonics, reading levels
- **Numeracy Coach**: Numbers, operations, math concepts
- **ZZ Coach**: [Specific activities for ZZ program]
- **Yeboneer**: [Youth development activities]

**Design question**: One dynamic form or four separate components?

**Decision**: Four separate form components with a router

**Why?**
- **Maintainability**: Each form is independently updatable
- **Type safety** (even in JS): Clear structure for each session type
- **No conditionals**: Cleaner code than `if (jobTitle === 'Literacy')...` everywhere
- **Specialization**: Each form can have custom validation, layout, components

**Router pattern**:
```javascript
const SessionFormScreen = () => {
  const { user } = useAuth();

  const FormComponent = {
    'Literacy Coach': LiteracySessionForm,
    'Numeracy Coach': NumeracySessionForm,
    'ZZ Coach': ZZCoachSessionForm,
    'Yeboneer': YeboneerSessionForm
  }[user.job_title];

  return <FormComponent />;
};
```

**Base form pattern**:
Each form uses react-hook-form for state management:
```javascript
const LiteracySessionForm = () => {
  const { control, handleSubmit } = useForm();

  const onSubmit = async (data) => {
    // Save to AsyncStorage
    const sessionId = uuid();
    await AsyncStorage.setItem(`session_${sessionId}`, JSON.stringify({
      id: sessionId,
      ...data,
      synced: false,
      job_title: 'Literacy Coach'
    }));

    // Optimistically update UI
    // Queue for sync
  };

  return (
    <Controller
      control={control}
      name="lettersWorkedOn"
      render={({ field }) => (
        <TextInput
          label="Letters Worked On"
          value={field.value}
          onChangeText={field.onChange}
        />
      )}
    />
  );
};
```

---

## Chapter 9: The Group Selection Feature - User Experience Design

### The Requirement

Staff work with groups of children (e.g., "Group 2" has 7 children). When recording a session, they should be able to:
1. Select individual children
2. Select an entire group (automatically selecting all children in that group)

### UX Pattern: Multi-Step Selection

**Flow**:
```
1. Search/filter children and groups
2. Tap to add to "Selected" list
3. Selected items show as removable chips
4. Submit session with selection
```

**Why this pattern?**
- **Clear state**: Always see what's selected
- **Easy to remove**: Tap X on chip to remove
- **Bulk + individual**: Can select Group 2, then remove one child from it
- **Familiar**: Similar to email recipient selection

**Group selection logic**:
```javascript
const selectGroup = (groupId) => {
  // Find all children in this group
  const childrenInGroup = childrenGroupsJunction
    .filter(cg => cg.group_id === groupId)
    .map(cg => cg.child_id);

  // Add to selection (using Set to avoid duplicates)
  setSelectedChildren(prev =>
    [...new Set([...prev, ...childrenInGroup])]
  );

  // Track which groups were used
  setSelectedGroups(prev => [...prev, groupId]);
};
```

**Database storage**:
```javascript
{
  session_id: 'uuid',
  children_ids: ['child_1', 'child_2', 'child_3', ...],
  group_ids: ['group_2'],  // Remember group was used
  ...
}
```

**Why store both children_ids and group_ids?**
- `children_ids`: The actual children in this specific session (even if group changes later)
- `group_ids`: Historical context ("This was a Group 2 session")

---

## Chapter 10: What We've Built So Far

### Current Architecture

**Completed**:
- ✅ Expo + React Native project initialized
- ✅ All core dependencies installed
- ✅ Supabase project created and configured
- ✅ AuthContext with login/logout
- ✅ AppNavigator with auth routing
- ✅ LoginScreen UI
- ✅ HomeScreen placeholder
- ✅ Storage utilities (AsyncStorage wrapper)
- ✅ Supabase client configured
- ✅ Basic theme constants

**File structure** (as built):
```
src/
├── constants/
│   ├── colors.js        # Theme colors
│   └── jobTitles.js     # Job title constants
├── context/
│   └── AuthContext.js   # Authentication state
├── navigation/
│   └── AppNavigator.js  # Root navigator
├── screens/
│   ├── auth/
│   │   └── LoginScreen.js
│   └── main/
│       └── HomeScreen.js
├── services/
│   └── supabaseClient.js
└── utils/
    └── storage.js
```

### What's Next

**Immediate**:
1. Update database schema to add groups tables
2. Create bottom tab navigation (4 tabs: Home, Time, Children, Sessions)
3. Build TimeTrackingScreen with location capture
4. Create OfflineContext for sync queue management

**Then**:
5. Children management (list, add, edit, groups)
6. Literacy Coach session form
7. Session history view
8. Full offline sync implementation

---

## Chapter: Phase 6 — Closing the Offline Sync Loop

### The Problem We Were Solving

By the end of Phase 5, the sync engine was solid: records flowed from AsyncStorage → Supabase with exponential-backoff retries and last-write-wins conflict resolution. But there was a silent cliff edge: once a record hit `MAX_RETRY_ATTEMPTS` (5), it was simply skipped on every subsequent sync cycle with a `console.warn`. The user had no way to know something was stuck, and no way to unstick it.

Two related gaps:
1. **Failed items vanished into the void** — `syncMeta.failedItems` was declared in the schema but never written to.
2. **The sync indicator was a dead end** — tapping it logged to the console. Users had no visibility into sync state beyond a badge count.

### Decision: Two-Layer Approach

We split the work into a persistence layer and a UI layer, deliberately keeping them decoupled.

**Persistence layer** (`storage.js` + one line in `offlineSync.js`):
- `addFailedItem(table, id, reason)` — idempotent write. If the same record fails again on a later sync cycle, we update the existing entry (refreshing `failedAt`) rather than duplicating it. This matters because the sync loop runs on every foreground event; without idempotency we'd accumulate duplicate entries.
- `removeFailedItem(table, id)` — this one does two things atomically: removes the item from `failedItems` AND clears its `retryAttempts` counter. The coupling is intentional — removing from the failed list without resetting the counter would cause the record to immediately hit `MAX_RETRY_ATTEMPTS` again on the next sync pass and re-enter the failed list. Think of it as "reopening the gate."

**UI layer** (`SyncStatusScreen.js`):
- A dedicated screen showing network state, last sync time, per-table unsynced breakdown, and failed items with per-item retry buttons.
- The retry flow is: clear the failed state → refresh context → trigger sync. The `retryFailedItem` function in `offlineSync.js` deliberately does NOT call `syncNow` itself. If it did, it would need to import from `OfflineContext`, creating a circular dependency (OfflineContext already imports from offlineSync). Instead, the screen — which already has access to `useOffline()` — calls `syncNow()` after the retry completes.

### Why the Navigator Wiring Is Simple

`SyncStatus` lives in the `MainNavigator` stack (not inside any tab). The tab navigator's `screenOptions` already receives `({ route, navigation })` — `navigation` is scoped to the parent stack, so `navigation.navigate('SyncStatus')` works from any tab's header without any special setup. This is a React Navigation subtlety worth remembering: tab `screenOptions` callbacks have access to the parent stack's navigation prop.

### Accessibility Note on the Offline Badge

The offline badge uses `#FEF3C7` background with `#B45309` text rather than the brand yellow (`#FFDD00`). Brand yellow on white fails WCAG AA contrast for normal text. Amber (`#B45309`) on the light yellow background achieves ~4.6:1 contrast — just above the 4.5:1 threshold for normal text.

### Testing Tip

To exercise the Failed Items card without waiting for real network failures: temporarily set `MAX_RETRY_ATTEMPTS = 1` in `offlineSync.js` and create a record that will fail to sync (e.g., a time entry with an invalid foreign key). Trigger a sync, observe the Failed Items card appear, tap Retry, and watch it disappear. Restore `MAX_RETRY_ATTEMPTS = 5` before shipping.

---

## Chapter 8: Polish — Feedback Standardisation & Validation Patterns

### Why Standardise on Snackbar?

React Native ships two built-in feedback mechanisms: `Alert.alert()` (modal dialog) and nothing else. React Native Paper gives us `<Snackbar>` — a non-blocking toast that auto-dismisses.

The rule we landed on:

| Mechanism | When to use |
|---|---|
| `<Snackbar>` | Status messages, recoverable errors, confirmations that don't require a decision |
| `Alert.alert()` | **Destructive confirmations only** — "Delete group?", "Remove child?" |

Why does this matter? Modal alerts steal focus. They block interaction. If you sign in and get an alert that says "Signed in at 8:42 AM", you have to tap OK before you can do anything else. That's friction for a message the user didn't need to act on. A snackbar delivers the same information in 3 seconds and disappears on its own.

### The Snackbar Pattern (Copy This Everywhere)

```jsx
// State
const [snackbarMessage, setSnackbarMessage] = useState('');
const [snackbarVisible, setSnackbarVisible] = useState(false);

const showSnackbar = (message) => {
  setSnackbarMessage(message);
  setSnackbarVisible(true);
};

// JSX — Snackbar must be a sibling of ScrollView, not a child,
// because it renders at the bottom of the screen via absolute positioning.
return (
  <View style={{ flex: 1 }}>
    <ScrollView style={styles.container}>
      {/* ... screen content ... */}
    </ScrollView>

    <Snackbar
      visible={snackbarVisible}
      onDismiss={() => setSnackbarVisible(false)}
      duration={3000}
    >
      {snackbarMessage}
    </Snackbar>
  </View>
);
```

The outer `<View style={{ flex: 1 }}>` is load-bearing. Without it, ScrollView takes `flex: 1` from the screen and Snackbar has no room. With it, ScrollView and Snackbar share the vertical space — ScrollView grows, Snackbar sits at the bottom.

### Inline Validation: Show Errors Where the Problem Is

LiteracySessionForm had a pattern where the Submit button was simply disabled when the form was incomplete. That's fine for a power user who understands the form, but for field staff on a phone, "why won't this button work?" is a dead end.

The new pattern:

1. **Validate on submit, not on change.** Don't show errors while the user is still filling in the form — that's annoying. Show them when they tap Submit.
2. **Clear errors as the user fixes them.** Once they select a child, the "Select at least one child" error disappears immediately.
3. **Render errors inline, below the relevant card.** Not in a toast, not in a banner — right where the problem is.

```jsx
// In the setter callback — clear the specific error key:
const handleChildrenChange = (newSelection) => {
  setSelectedChildren(newSelection);
  if (newSelection.length > 0) {
    setValidationErrors((prev) => { const { children, ...rest } = prev; return rest; });
  }
};

// In JSX — render conditionally after the card content:
{validationErrors.children && (
  <Text variant="bodySmall" style={styles.errorText}>{validationErrors.children}</Text>
)}
```

Why destructure-and-spread to remove a key? Because `delete prev.children` would mutate state. React needs a new object reference to trigger a re-render. `{ children, ...rest } = prev; return rest;` is the idiomatic immutable delete.

### RLS Tightening: The Trigger Trick

The children table originally had `WITH CHECK (TRUE)` on INSERT — any authenticated user could insert any row. We needed to restrict it to "only the user who created the row", but there's a chicken-and-egg problem: at INSERT time, the row doesn't exist yet, so you can't check a column that isn't set.

**Solution: BEFORE INSERT trigger.**

```sql
CREATE OR REPLACE FUNCTION set_children_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();  -- overwrite whatever the client sent
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

The trigger fires *before* the row hits the table, so it can rewrite fields. The policy then checks `created_by = auth.uid()` — which is guaranteed to be true because the trigger just set it.

**Why this plays nicely with offline sync**: Our upsert sends all local fields. On INSERT (new record), the trigger fires and sets `created_by` correctly. On UPDATE (conflict on `id`), the trigger does *not* fire — it's `BEFORE INSERT`, not `BEFORE INSERT OR UPDATE`. And `created_by` isn't in the upsert payload, so the existing value persists. Both paths are correct without any special sync logic.

---

## Letter Tracker: Computed vs. Stored Mastery

### The Problem: Stale Assessment Data

The PWA version of the letter tracker stored both assessment-mastered and coach-taught letters in the same record. When a child retook an assessment, the old "mastered" marks would become stale — the child might no longer demonstrate mastery, but the tracker still showed orange. Cleaning up stale records required complex reconciliation logic.

### The Decision: Compute Assessment Mastery On-The-Fly

Instead of persisting assessment mastery to the `letter_mastery` table, we compute it fresh each time the tracker screen loads by reading the child's most recent assessment record. Only coach-taught ("source: taught") records are stored in `letter_mastery`.

**Why this works well:**
- **Always current**: If a child retakes the assessment and does worse on a letter, the tracker immediately reflects it — no cleanup needed.
- **Clean separation**: Assessment data stays in the `assessments` table untouched. Teaching data lives in `letter_mastery`. Neither mutates the other.
- **Simpler sync**: Only "taught" records need offline sync. Assessment mastery is derived from assessment records that already sync independently.

**Trade-off**: Each screen load requires iterating over the 60-letter EGRA set to find matching positions — but with 60 letters and 26 tracker positions, this computation is trivially fast (< 1ms).

### The Mastery Calculation: "All Correct Among Attempted"

The EGRA is a timed 60-second test. Most children don't reach all 60 letters. The letter "a" might appear at positions 1, 33, and 47. If the child only reached position 35:

- Position 1: attempted, check if correct
- Position 33: attempted, check if correct
- Position 47: NOT attempted — **excluded from calculation**

The letter is mastered only if ALL attempted instances were correct. Un-attempted instances are neither correct nor incorrect — they simply have no data. This respects the timed nature of the EGRA without penalizing children for running out of time.

### Soft-Delete Pattern for Offline Sync

The `letter_mastery` table is the first table in our app that needs server-side deletes. When a coach "un-teaches" a letter (taps green → gray), we can't simply delete the local record because it may have already synced to Supabase. The solution:

1. Mark the record `_deleted: true, synced: false` in AsyncStorage
2. During sync, if `_deleted === true`, perform a Supabase DELETE instead of upsert
3. After successful server delete, hard-remove from AsyncStorage

This keeps delete propagation within the existing sync pipeline — no new sync infrastructure needed.

### One Row Per Letter vs. JSONB Document

We chose one row per child per letter (in `letter_mastery`) over a single JSONB document per child. The key reason: **offline sync conflicts**. If two devices edit different letters on the same child simultaneously, individual rows sync independently (each gets its own upsert). A JSONB blob would create last-write-wins conflicts where one device's changes silently overwrite the other's.

---

## Key Takeaways for Developers

1. **Offline-first is a mindset**: Write to local storage first, sync is secondary
2. **Database schema is a contract**: Use constraints and foreign keys to enforce integrity
3. **Context is enough for most apps**: Don't over-engineer state management
4. **Separate forms are cleaner than conditionals**: Even if they share some code
5. **Battery matters**: Balance accuracy needs with power consumption
6. **Security in layers**: RLS + app logic + validation = defense in depth
7. **UX drives architecture**: The group selection feature shaped our database design
8. **Decouple persistence from triggers**: `retryFailedItem` clears state; the caller triggers sync. Keeps the dependency graph acyclic.
9. **Feedback is UX, not an afterthought**: Snackbar vs Alert is not a style choice — it's a decision about how much friction you're adding to the user's workflow.
10. **Validate where the error is, not where the button is**: Inline errors next to the broken field beat a generic "form is incomplete" toast.

---

## 11. The Merge Logic Trap: When Your Data-Loading Query Has Different Visibility Than Your Sync Pipeline

### The Problem

In March 2026, field testers reported children "disappearing" from their devices and persistent sync errors (23503 FK violations) on junction tables. The root cause turned out to be a subtle bug in how we merged server data with local data.

### The Setup

Our `loadChildren()` function fetches children from Supabase using a JOIN:

```javascript
const { data } = await supabase
  .from('children')
  .select('*, staff_children!inner(staff_id)')
  .eq('staff_children.staff_id', user.id);
```

The `!inner` keyword means "only return children that have a matching `staff_children` row." This is correct for normal operation — you only want to see children assigned to you.

The merge logic then replaced local data with server data, preserving only local records marked `synced: false`:

```javascript
const localUnsynced = cached.filter(c => c.synced === false);  // BUG
const unsyncedToKeep = localUnsynced.filter(c => !serverIds.has(c.id));
const merged = [...serverChildren, ...unsyncedToKeep];
```

### The Bug

When a user creates a child offline, two records are created: (1) the child record and (2) a `staff_children` junction record. Both start as `synced: false`.

Here's the deadly sequence:
1. App goes online. Sync starts.
2. Child upsert succeeds → marked `synced: true` locally.
3. `staff_children` upsert **fails** (network error mid-sync).
4. After sync, `loadChildren()` runs and queries the server.
5. Server query uses `staff_children!inner` — since `staff_children` hasn't synced, the child is **not returned**.
6. The child is `synced: true` locally, so it's **not** in `localUnsynced`.
7. The child is in **neither** `serverChildren` **nor** `unsyncedToKeep`.
8. The child is **dropped from AsyncStorage**.

Now `staff_children` and `children_groups` reference a ghost `child_id` that doesn't exist anywhere, producing permanent FK errors.

### The Fix

Replace the filter to keep ALL local records not returned by the server, regardless of sync status:

```javascript
const localToKeep = cached.filter(c => !serverIds.has(c.id));  // FIXED
const merged = [...serverChildren, ...localToKeep];
```

### The Principle

**Your data-loading query and your sync pipeline have different visibility windows.** The server query sees data through RLS and JOIN constraints. The sync pipeline sees raw records. When your merge logic assumes they have the same visibility, you get data loss.

This is a general trap in offline-first architectures: any time you merge "what the server returned" with "what we have locally," you must ask: **is there a scenario where a valid local record is invisible to the server query?** If yes, your merge must preserve it.

### Additional Fixes Made

1. **Composite `onConflict` keys**: Junction tables (`staff_children`, `children_groups`) had unique constraints on composite keys (e.g., `child_id + group_id`), but upserts used `id` as the conflict target. If a record was recreated with a new UUID for the same logical pair, the upsert didn't match → 23505 unique constraint violation.

2. **Terminal error classification**: Not all Supabase errors are worth retrying. FK violations (23503) mean a parent record is missing — retrying won't fix that. Unique violations (23505) mean the data already exists on the server — that's actually success. We added `classifyError()` to handle these immediately instead of burning through 5 retry cycles.

3. **Sync order with dependency gating**: If CHILDREN fails to sync, attempting STAFF_CHILDREN in the same cycle is pointless (FK will fail). An explicit `SYNC_ORDER` array with `JUNCTION_DEPENDENCIES` map now skips dependent tables when their parent fails.

### Key Takeaways

11. **Merge logic must account for visibility gaps**: When server queries use JOINs or RLS, some valid local records may be invisible to the server. Don't drop them.
12. **Not all sync errors are retriable**: FK violations (23503) and unique constraint violations (23505) have specific semantics. 23505 often means "already synced" — treat it as success. 23503 means "fix the parent first" — quarantine, don't retry.
13. **Sync order matters for relational data**: Parent tables must sync before junction tables. If a parent fails, skip its dependents in that cycle.

---

## Chapter: Soft-Delete via `hidden_at` — Filter at Consumer, Not at Server

### The Bug Field Testers Reported

In the first two weeks of the field test, multiple staff reported the same frustrating behavior: they would tap "Delete Child" on a child they'd accidentally created (or who had left their school), the child would disappear from the list, and then later — after a sync, or after closing and reopening the app — the same child would reappear.

Reproducing the bug in code took about ten minutes. `ChildrenContext.deleteChild` only removed the child from local AsyncStorage and React state. The server still had the row. The next pull-down sync re-fetched it and merged it back in. Classic missing-tombstone bug in an offline-first system.

### The Obvious Fix (and Why It Was Wrong)

The first design instinct was: add a `hidden_at TIMESTAMPTZ NULL` column to `children`, set it locally on delete, sync the update to Supabase, and filter out hidden children from the server query in `loadChildren`:

```javascript
// Looks correct, is broken
.is('hidden_at', null)
```

A pre-execution code review caught this before it shipped. The bug it would have introduced is subtle and instructive.

`ChildrenContext.loadChildren()` uses cache-first paint plus server merge: load from AsyncStorage, then if online fetch from Supabase, then merge. The merge keeps every cached child whose id is **not** in the server response — a property we *need*, because RLS and JOIN visibility gaps (Chapter on Children Resurrection) mean some valid local records can be missing from the server query for benign reasons.

If we add a server-side filter that says "don't return hidden children," the merge can no longer distinguish two cases:
1. Server doesn't know about this record (legitimate visibility gap — keep the local copy).
2. Server is intentionally hiding this record (the local stale copy should be dropped).

So if Device A hides Child X (server now has `hidden_at` set), and Device B has a stale cached copy of Child X with `hidden_at = null`, Device B's next sync would:
- Receive a server response that doesn't include Child X (filtered out).
- Treat Device B's stale copy as "valid local record server doesn't know about."
- Keep it in the merged list with `hidden_at = null` indefinitely.

Universal hide breaks. Cross-device propagation silently fails.

### The Correct Architecture

Fetch *all* assigned children — including hidden ones — from the server. Filter only at the consumer boundary inside the React context:

```javascript
const visibleChildren = useMemo(
  () => childrenList.filter(c => !c.hidden_at),
  [childrenList]
);

// Provider exposes both shapes:
//   children: visibleChildren    (active list — for screens, pickers, stats)
//   allChildren: childrenList    (full set — for history name resolution)
```

Now the merge naturally propagates hidden state across devices. Server returns Child X with `hidden_at` set, the local stale copy is overwritten in `localToKeep` (because `serverIds.has(c.id)` is true), and the merged record carries the fresh `hidden_at` value. Universal hide works.

There's a bonus: `allChildren` becomes truly complete, so `AssessmentHistoryScreen` can resolve names for hidden children even on fresh installs (where the local cache has no historical record). With server-side filtering, hidden children would have appeared as "Unknown child" in history — a regression we wouldn't have noticed until a tester complained.

### The Principle

**In offline-first systems, filter at the consumer, not at the producer — when the filter represents *intent* rather than *truth*.**

- *Truth* (e.g., "this row was deleted, here's its tombstone") propagates correctly through any sync mechanism, because both sides agree on what exists.
- *Intent* (e.g., "don't show this to me right now") should be applied at the consumer, because applying it at the producer creates a divergence between "doesn't exist" and "exists but suppressed" that the merge logic can't recover.

Server-side filtering of soft-deleted records is an optimization (smaller responses), not a correctness mechanism. In a system with multiple devices and a merge-based reconciliation, that optimization can break the system's invariants.

### Companion Decision: Two Context Shapes for Two Consumer Needs

The same fix surfaced an architectural decision worth keeping in mind. `useChildren().children` had been one canonical collection used for:
- Active list views (My Children tab, pickers, group selectors).
- Stats and ranking calculations (coverage, denominators).
- Historical name resolution (assessment history).

The first two want hidden children excluded; the third needs them included. By exposing both `children` (filtered) and `allChildren` (full) from the context, each consumer opts into the semantic it needs. Most consumers continue using `children` and inherit the new filtering for free; one consumer (`AssessmentHistoryScreen`) explicitly switches to `allChildren` and renders a small "(removed)" badge so users understand why a child no longer appears in their active list.

The lesson generalizes: when one collection serves semantically different consumers, narrow APIs at each call site are clearer than wide APIs everyone subtly reuses for different purposes.

### Key Takeaways

14. **Server-side filtering of soft-deletes breaks cross-device propagation.** The merge can't tell "doesn't exist" from "intentionally suppressed." Filter at the consumer.
15. **Truth propagates, intent doesn't.** Tombstones (a column the server fills in) are truth. Display preferences ("hide this from me") are intent. Treat them differently in distributed state.
16. **One canonical collection often serves multiple semantic consumers.** When use cases diverge, expose multiple targeted views from the producer rather than forcing a single filter shape on everyone.

---

## Chapter 18: Schema Hardening Without Breaking Field Devices

The schema hardening work fixed a different class of field-testing risk: drift between flexible text fields in the mobile app and the canonical data the organization actually needs. Schools were stored as free text on `users.assigned_school`, job titles were free text on `users.job_title`, and sessions copied that same role name into `sessions.session_type`.

The tempting fix would have been to drop the text columns and replace them with foreign keys immediately. That would be clean on paper and dangerous in the field. The app has multiple installed versions and AsyncStorage can hold old unsynced records for days. If a device posts a key for a column that no longer exists, Supabase returns `PGRST204`; dependent rows then fail behind it.

The safe pattern is two builds:

1. Build A is compatible with both worlds. It reads lookup joins when present, falls back to legacy strings when needed, writes `session_type` plus `session_type_id`, and runs a startup sanitizer that cleans old unsynced records.
2. Build B stops writing the legacy session column after the database has relaxed the `NOT NULL` constraint. It also reruns the session sanitizer at a higher task version so devices that already completed Build A cleanup still strip leftover local `session_type` keys.

Build B bumps `expo.version` because exported database snapshots use that value as part of the release gate. Since this app uses `runtimeVersion.policy = "appVersion"`, that version bump means Build B needs a full native install; a `1.2.0` OTA would not reach existing `1.1.0` runtime builds. Only after every active install proves it is on Build B should the destructive migration drop the old columns.

This work also captures schema drift in migration history. `users.job_title` was originally an enum in the first migration, but production already had it as text. `children.age` was originally stricter than production. Migration 13 records those facts so future agents do not treat an old file as truth.

CHECK constraints are preferred over Postgres enums here because the role and option vocabularies are still evolving. A CHECK can be dropped and recreated in one migration; an enum is harder to change safely. Lookup tables are used where the value is an operational identity (`job_titles`, `schools`), while CHECK constraints are used for small validation sets already owned by app constants (`gender`, `grade`, `home_language`, `assessment_type`).

Key takeaways:

17. **A clean schema is not worth stranding field data.** Add the new shape first, ship compatibility, verify device state, then drop.
18. **Export Database can be a release gate.** The Build A/Build B markers make tester devices prove their state instead of relying on chat confirmations.
19. **Migration files are history, not live truth.** When drift is discovered, capture it with an idempotent migration and document how it happened.

---

## Chapter 19: Reference Id Adoption Must Include the Outbox

The SQLite refactor is clean-slate for field rollout, but Expo Go and tester devices can still carry older local SQLite databases while we iterate. That matters because server-owned reference rows, like schools, job titles, programmes, academic years, and assessment tools, have two identities:

- A stable business key (`schools.name`, `job_titles.code`, `academic_years.label`, etc.).
- A server UUID that domain rows reference.

During testing, the app had local reference rows with the right business key but the wrong id. A later startup pull tried to insert the server row and hit local unique constraints such as `schools.name` and `job_titles.name`. The fix is not to make every tester wipe their device. Reference refresh should adopt the server id for the matching business key and retarget dependent local rows.

The subtle part is the outbox. Updating `classes.school_id` from a stale local id to the server id is not enough if `sync_outbox.payload` still contains the old `school_id`. Retry would keep sending the stale payload, so the server would continue returning a foreign-key error even though the visible local class row looked repaired.

The repository rule is now:

1. When a server-owned reference row collides by business key, adopt the server id.
2. Retarget local FK columns that point to the stale id.
3. Retarget matching JSON payload fields in `sync_outbox`.
4. Clear failed retry metadata for those repaired outbox rows so they are eligible to sync again.

This is startup/reference-refresh work, not a hot path. It is the right kind of defensive code for offline-first apps because it heals a real class of tester-device state without adding ongoing screen-level overhead.

The same physical-device round also caught a child gender enum mismatch. UI labels (`Male`, `Female`) must not be treated as database values. Child persistence now canonicalizes gender before writing SQLite or outbox payloads, and the picker stores canonical enum values while still showing human-readable labels.

The cutover hardening pass tightened that UX one step further: Add/Edit Child now use two explicit chips for `female` and `male` instead of a modal picker. Existing rows with historic values such as `non_binary`, `unknown`, or `NULL` are left untouched. Edit Child renders no selected chip for those rows, saving without a chip preserves the historic value, and choosing a chip intentionally overwrites it with `female` or `male`. That gives field staff the simpler UI the programme wants without a silent data rewrite.

Key takeaways:

20. **Reference-table business keys and UUIDs can drift during iterative testing.** Refresh code should heal drift by adopting the server id rather than requiring manual cache wipes.
21. **Repair the queued payload, not only the row.** In offline-first systems, the outbox is part of the durable state.
22. **UI labels are not schema values.** Persist canonical enum values and derive display labels at the edge.

---

## Chapter 20: RLS Failures Are Often Local Payload Bugs

The group creation bug looked at first like a backend policy problem. Supabase returned `new row violates row-level security policy` for `groups` and `child_group_memberships`, which is easy to read as "the policy is too strict." In this case the policy was doing the right thing.

The new clean-slate backend requires mobile-created group rows to identify the authenticated owner with `created_by = auth.uid()`. It also expects relationship rows that make the user's access path explicit: a mobile-created group needs a matching `group_ea_assignments` row, and child group memberships need both `created_by` and the active grouping version. The mobile producer was setting `staff_id`, but the server policy does not trust that as the ownership column. The durable outbox therefore kept retrying payloads that could never pass RLS.

The fix has three layers:

1. Producers write server-required ownership fields at creation time.
2. Creating a group also creates and queues the matching active `group_ea_assignments` row.
3. Sync startup repairs older failed `groups` and `child_group_memberships` outbox payloads so tester devices can retry without a manual database wipe.

Weakening RLS would have made the immediate error disappear while preserving a worse data bug: mobile-created groups could sync without the relationship rows needed for later visibility. For every table protected by assignment-based RLS, the mobile write path must create the same relationship evidence that the read path depends on.

The same testing round also showed a `database is locked` error while adding a child to a group. That is a separate SQLite concurrency symptom from the RLS payload failure. The current branch already serializes database work through the repository queue and configures WAL plus `busy_timeout`; do not conflate those lock protections with the ownership repair. If the lock reappears on a fresh build, debug it as a SQLite queue/reentrancy issue, not as a Supabase policy issue.

Key takeaways:

23. **RLS errors are useful diagnostics, not only backend problems.** First check whether the mobile payload includes the columns the policy intentionally requires.
24. **Producer rows must match read-path relationships.** If a local read uses `group_ea_assignments`, group creation needs to produce that relationship too.
25. **Repair stale outbox payloads during cutover testing.** A visible row can look fixed while the queued JSON still retries the old broken shape.

---

## Chapter 21: RLS Policies and Sync Ordering Are One Contract

The follow-up RLS audit found a different problem from the group payload bug. Some policies were individually reasonable, but the combined system still had gaps:

- The app archived `child_ea_assignments`, but the database had no UPDATE policy for that legitimate archive flow.
- Assignment update policies could become dangerous if they ever allowed identity changes, so the database now has triggers that make `child_id`, `user_id`, `class_id`, `group_id`, `programme_id`, and creator/timestamp identity columns immutable after insert.
- Class edit/delete UI works on assigned classes, so the class UPDATE/DELETE policies now use the same `current_user_can_write_for_class(id)` helper as the rest of the assignment model.
- Assessment, assessment item, and letter mastery SELECT policies now use `current_user_can_read_child(...)`, which keeps read behavior aligned across direct child assignment, class assignment, group assignment, and created-by ownership.
- Authenticated table grants now match intent more closely. RLS controls rows, but table grants still matter; `TRUNCATE` is not protected by RLS, so non-DML table privileges were revoked from app roles.

The sync lesson is just as important. Insert order and archive order are not the same thing. On insert, parents and assignment rows often need to sync before relationship detail rows. On archive, access-granting assignment rows should usually sync last, because child/group/class relationship cleanup may still need that active assignment to pass RLS.

The outbox now keeps the original insert order for normal writes, but archive rows use an operation-aware order:

1. Archive the parent object.
2. End dependent relationship rows.
3. End the assignment row that grants the user access.

It also treats each skipped dependency record as blocking evidence for the rest of the cycle, so an access-ending row does not run after required cleanup for the same child, class, or group was skipped. Unrelated subjects continue syncing.

Key takeaways:

26. **A policy can be correct and still fail as part of a workflow.** Audit the whole mobile write sequence, not only each table in isolation.
27. **RLS update policies need identity guards.** If a row represents access, allow lifecycle updates without allowing reassignment by UPDATE.
28. **Archive ordering protects authority.** End membership/detail rows before ending the assignment that authorizes those updates.
29. **Least privilege includes table grants.** RLS is row-level; it does not make broad table privileges clean by default.

---

## Chapter 22: Upsert Visibility Is Part of the RLS Contract

The iPhone preview build exposed a regression in the final RLS cleanup. A plain `INSERT` into `children` with `created_by = auth.uid()` was allowed, but the app does not send a plain insert. The offline sync engine uses Supabase/PostgREST upsert so retries are durable. PostgreSQL checks SELECT visibility during upsert, and the direct `children_select_created_by` policy had been removed.

That made a first-time child insert fail with `new row violates row-level security policy`, even though the insert policy itself was correct. The assignment-based read helper could not prove visibility for a child row that did not exist yet, and the dependent `child_ea_assignments`, programme enrollment, class membership, and group membership rows then failed behind it.

The clean fix is not to weaken write policy. Creator-owned parent rows that are upserted by mobile need direct SELECT fallback policies:

- `children_select_created_by`
- `classes_select_created_by`
- `groups_select_created_by`

The same preview found a second retry-contract issue. Assignment rows now have triggers that correctly block identity changes after insert. Retrying a `group_ea_assignments` insert through update-capable upsert can therefore fail if the row already exists and the retry payload differs in immutable timestamp or identity fields. For immutable assignment tables, an outbox `insert` retry should be insert-or-ignore by id, while archive/update operations remain real updates.

Key takeaways:

30. **Upsert requires read policy, not only write policy.** If mobile uses upsert, keep SELECT visibility for the row shape being written.
31. **Creator SELECT on parent rows is a sync requirement.** It is not only a convenience read policy when parent rows sync before their junction rows.
32. **Immutable identity rows need insert-or-ignore retry semantics.** Do not let an outbox `insert` retry turn into an identity-changing update.

---

## Chapter 23: Read Work Should Scale With Screens, Not Rows

The Sprint 3 bottleneck was not SQLite itself. It was repository shape. Session and assessment reads loaded parent rows, then issued one child-table query per parent. That makes latency proportional to history size even when the screen needs only a recent window or a few totals.

The durable pattern is to keep deep behavior behind additive repository options:

1. Filter by programme, EA, and local date in SQL before hydration.
2. Load related rows in one `IN (...)` query and assemble the result in memory.
3. Use grouped counts when the screen needs totals rather than full domain objects.
4. Preserve existing output order and summary override rules so faster reads do not quietly change behavior.

Query-count tests are the architectural boundary. Result assertions prove correctness for one fixture, while statement budgets prove the cost does not grow back into N+1 behavior as history expands.

The write-side lesson is similar but not identical. Assessment items and attendees still require one domain write plus one outbox write per row because enqueue-per-row semantics are part of the offline contract. The safe optimization was to remove repeated owner-resolution reads by carrying already-known ownership into the enqueue call. This cuts latency without changing transactions, payloads, ordering, or retry identity.

Key takeaways:

33. **Bound first, hydrate second.** A repository should discard irrelevant rows before loading related data.
34. **Aggregate screens should use aggregate contracts.** Do not construct hundreds of objects to display three numbers.
35. **Performance invariants need statement budgets.** Data equality alone does not catch an N+1 regression.
36. **Known transaction context is reusable evidence.** Passing a resolved owner avoids redundant reads while preserving the same outbox stamp.

**Last Updated**: 2026-07-13
**Document Status**: Living document - updated as we build

### Sprint 3 addendum: why local dates are pinned to Africa/Johannesburg

`utils/localDate.js` fixes business-day attribution to SAST rather than the device timezone. This was a deliberate orchestrator decision, not a test convenience: Masi operates in one country, head office reads day totals in SAST, and low-end field devices sometimes carry wrong timezone settings, so device-local attribution is LESS reliable than programme-timezone attribution. A side benefit is determinism: date tests now assert hardcoded SAST expectations on any machine, including CI. The one seam to remember: capture-time date stamps (`session_date`, `date_assessed`) are still device-local calendar dates. On a correctly-set South African device the two are identical; a device set to another timezone would stamp capture dates in its own calendar while displays attribute by SAST. If Masi ever operates outside SAST, LOCAL_TIME_ZONE becomes a programme-level setting.

### Sprint 4B addendum: let SQLite be the one roster truth

It is tempting to treat a pull as three lists that need clever merging: the old React state, the new server rows, and the local SQLite rows. That looks flexible, but it creates two authorities. React can temporarily show a row that SQLite has ended, or hide a row without persisting why it disappeared. After a restart, React is rebuilt from SQLite, so any decision made only in memory is lost.

Sprint 4B uses a simpler mental model: React state is a pure function of SQLite. A context may publish the cached SQLite snapshot before the network finishes so the screen stays responsive. After the pull, repositories persist returned rows and reconcile acknowledged removals in transactions. The context then reads SQLite again and publishes that result. Restarting the app repeats the same read and produces the same state. There is no separate merge policy to remember, test, or keep in sync.

The word "acknowledged" is important. An empty result is safe evidence of removal only when the query asked about one relationship and completed successfully. Consider a child who has both an active `child_ea_assignments` row and an active `child_programme_enrollments` row. The old children query returned the intersection of those relationships. If Head Office ended only the enrollment, the child disappeared from the intersection. Inferring from that absence would also end the EA assignment, even though the server still says the assignment is active. That false update would survive offline and could be pushed into later reasoning as if it were fact.

The fix is relationship-specific acknowledged scopes. The assignment query decides assignment removals. The enrollment query decides enrollment removals within the active Programme and acknowledged assigned-child set. The children intersection still decides which children should be visible, but it decides neither relationship's lifecycle. In the worked example, the enrollment ends, My Children becomes empty, and the active assignment row remains intact for another Programme or a later re-enrollment.

The same rule explains groups. A group missing from an EA-scoped query means the assignment ended; it does not mean the shared group entity was archived. The assignment is ended locally, the group and membership rows stay intact, and assignment-scoped repository reads stop publishing them. If the assignment returns, the same rows become visible again.

The broader lesson is that a query result carries the semantics of its predicate. Never infer which relationship changed from an intersection. Persist the server fact inside the scope that actually acknowledged it, then let every screen derive from the durable local model.

### Design foundation addendum: primitives and stable leaf props

A shared UI primitive should own invariant mechanics and chrome while callers keep domain behavior. `BottomSheet` now owns the backdrop, hardware dismissal, safe-area padding, handle, header, and scroll shell. Each picker or tracker still owns its selection and cancel semantics. This makes visual changes consistent without flattening meaningful behavior differences.

Large interactive collections need the same two-part recipe that already protects `LetterTile`. First, the virtualized list must be the only vertical scroller so native windowing can limit mounted work. Second, each row must be a memoized leaf with scalar props and a permanently stable callback. `ChildSelectorRow` receives only ids, strings, a boolean, and `onToggle`; the callback reads current selection data from refs, while `extraData` tells the list when scalar selection state changed. This separates event identity from current state, so selecting one child updates one row and typing comments updates none. Jest proves the render cascade is gone, while physical-device testing remains the proof for native windowing.

One Paper dialog deliberately remains. `ClockInBeforeSessionDialog` is a three-way decision, not a picker. Consistency means using the same component for the same interaction semantics, not forcing every overlay into the same shape.

### Session integrity addendum: current state and historical snapshots are different facts

A reading level looked like one field, but it represents two different facts over time. `children.reading_level` answers, "What level should the EA see when working with this child now?" The session's `activities.child_reading_levels` answers, "What level did the EA record for this child during this completed session?" Keeping both is not accidental duplication. It is a small temporal model: the child row holds mutable current state, while the session JSON holds an immutable event snapshot. Updating the child must never rewrite old sessions, and opening a new session must not search history to reconstruct current state.

The write path also needs two boundaries. First, the submitted attendee ids are authoritative. UI state can retain a value briefly after a child is deselected, so persistence filters reading-level and letter-tracker maps through the final attendee set. Second, durable child updates are change-driven. Pre-filling ten attendees means the form contains ten values, but it does not mean ten child facts changed. Comparing each submitted value with SQLite before writing prevents an outbox row for every unchanged attendee and keeps sync work proportional to actual edits.

The useful mental model is **state plus event**: write the event snapshot for every completed session, update current state only when it changes, and enforce the aggregate boundary in the persistence service rather than trusting transient screen state.

### Reconcile authority addendum: hydration and absence are different permissions

An authenticated SELECT can answer, "Which rows may this EA read?" It cannot always answer, "Which rows no longer exist?" PostgreSQL Row Level Security deliberately hides unauthorized rows without turning that hiding into an error. An empty successful response can therefore mean either that Head Office removed every relationship or that a policy stopped exposing them. Those meanings have opposite consequences, so one response cannot safely carry both.

The reconcile design now separates two permissions. Ordinary RLS queries retain **hydration authority**: their returned content may refresh SQLite, subject to the pending-local guard. A dedicated authenticated RPC holds **absence authority**: a fixed-search-path private function derives the EA from `auth.uid()` and returns a versioned, complete set of active relationship ids. The client checks the version, completeness claim, user, Programme, and every required array before using it. The caller cannot submit another user id to widen the snapshot.

This produces a simple fail-closed rule. If the RPC is missing, malformed, inconsistent, or unavailable, the app may still accept useful row content from ordinary queries, but it ends no relationships and does not mark the pull successful. Existing offline data remains visible. Operational observability records the failure so support can distinguish "the server returned zero classes" from "the app could not obtain safe removal authority."

The old 1,000-row limit still matters, but for a different reason. A complete RPC id set prevents a truncated hydration query from falsely ending rows. It does not prove that every row's content was downloaded. The app may reconcile safely from the complete id set, while withholding the successful-pull timestamp and reporting the incomplete hydration scope. This is a useful general distinction: **safe deletion evidence is not the same as complete replication evidence**.

The broader mental model is capability separation. Give each data path only the authority its evidence supports:

1. Ordinary queries can refresh facts they actually returned.
2. The privileged snapshot can authorize scoped absence, but cannot supply arbitrary caller-selected identities.
3. SQLite repositories apply end-dates only to synced rows and retain the mass-end circuit breaker.
4. React publishes a fresh SQLite read, so the durable local model remains the only screen authority.

### Outbox dependency addendum: a graph edge connects records, not tables

The first dependency gate used table names as a shortcut. If any `children` row failed during a pass, every later `child_ea_assignments`, assessment, mastery, and membership row was skipped. That preserved foreign-key order, but it treated "the children table" as one indivisible aggregate. One network or policy problem for Child A could therefore hold back unrelated work for Child B.

The real graph is more precise. An assignment with `child_id = A` depends on the child row whose id is A. It does not depend on every child row. A session attendee depends on its exact session, child, and optional group. The sync engine now records failed nodes by table and record id, then compares each dependent's FK with that exact node. Fields are resolved from the outbox payload first and SQLite second, because archive payloads often contain only `{ id, ended_at }` or `{ id, unassigned_at }`.

Archive ordering needs an inverse edge. Ending a child EA assignment must wait for programme, class, and group cleanup about the same child, even though those cleanup rows are not parents of the assignment. The same rule applies to class and group assignment endings. Explicit subject maps make those inverse edges testable: child-scoped cleanup compares `child_id`, class-scoped cleanup compares `class_id`, and group-scoped cleanup compares `group_id`.

The important mental model is **failure containment**. Preserve the smallest boundary that makes the operation safe. A failed parent blocks its own descendants; a failed cleanup blocks the matching access-ending row; unrelated subgraphs keep moving. If identity cannot be resolved for a newly added edge, the engine still fails conservatively. Precision improves availability without weakening relational or RLS ordering.

### Failed-batch addendum: bound work, not only data

A queue limit, a payload limit, and a failure-work limit solve different problems. Loading at most 1,000 outbox rows bounds memory and pass duration under normal operation. It does not stop those rows becoming one oversized HTTP request. A 100-row payload cap bounds request size, but it still does not stop ten failed batches from expanding into 1,000 individual retries. The failure path needs its own pass-wide budget.

The sync engine now treats per-record fallback as diagnostic isolation work. It may use up to 25 individual attempts to discover whether a batch failed because of one bad record or a systemic condition. Those attempts run five at a time, preserving the existing `allSettled` guarantee inside each wave. Once the budget is exhausted, more requests have diminishing information value and growing operational cost, so remaining rows return to pending for a later pass.

Unattempted is not the same state as failed. A deferred row receives no retry increment, no backoff, and no error message because the server never evaluated it individually. It still blocks its exact descendants for the rest of the current pass, which preserves ordering. This is a general resilience principle: **make exceptional work finite, preserve semantic state, and expose the deferral explicitly rather than disguising load shedding as an error.**
