# Masi App - Learning Journey
### Building a World-Class Offline-First Mobile Application

---

## Introduction

This document chronicles the architectural decisions, engineering patterns, and design philosophy behind building the Masi Field Staff App. Whether you're a junior developer learning mobile development or an experienced engineer interested in offline-first architecture, this guide walks through every critical decision and explains the "why" behind the "how."

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

## Key Takeaways for Developers

1. **Offline-first is a mindset**: Write to local storage first, sync is secondary
2. **Database schema is a contract**: Use constraints and foreign keys to enforce integrity
3. **Context is enough for most apps**: Don't over-engineer state management
4. **Separate forms are cleaner than conditionals**: Even if they share some code
5. **Battery matters**: Balance accuracy needs with power consumption
6. **Security in layers**: RLS + app logic + validation = defense in depth
7. **UX drives architecture**: The group selection feature shaped our database design
8. **Decouple persistence from triggers**: `retryFailedItem` clears state; the caller triggers sync. Keeps the dependency graph acyclic.

---

**Last Updated**: 2026-02-04
**Document Status**: Living document - updated as we build
