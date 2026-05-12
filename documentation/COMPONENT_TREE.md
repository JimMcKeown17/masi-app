# Masi App - Component Tree Reference

> **Quick Reference**: Visual guide to component hierarchy, props flow, and data dependencies

## 📊 Architecture Overview

```
App.js (Root)
├── 🔌 Providers (Context)
│   ├── OfflineProvider (network state, sync queue)
│   ├── AuthProvider (user, session, profile)
│   └── ChildrenProvider (children, groups CRUD)
│
└── 🧭 Navigation
    ├── Auth Flow (if not logged in)
    │   ├── LoginScreen
    │   └── ForgotPasswordScreen
    │
    └── Main Flow (if logged in)
        ├── 📱 Bottom Tabs (4 tabs)
        │   ├── Home → HomeScreen
        │   ├── Time → TimeTrackingScreen
        │   ├── Children → ChildrenListScreen
        │   └── Sessions → SessionsScreen
        │
        └── 📋 Modal Screens
            ├── ProfileScreen
            ├── AddChildScreen
            ├── EditChildScreen
            ├── GroupManagementScreen
            ├── SessionFormScreen
            ├── LiteracySessionForm
            └── SyncStatusScreen
```

---

## 🎯 Context Providers (Global State)

### OfflineProvider
**Location**: `src/context/OfflineContext.js`

**Provides**:
```javascript
{
  isOnline: boolean,           // Network connectivity status
  isSyncing: boolean,          // Active sync in progress
  unsyncedCount: number,       // Total items pending sync
  syncStatus: {                // Breakdown by data type
    children: { unsynced: 0 },
    sessions: { unsynced: 0 },
    timeEntries: { unsynced: 0 }
  },
  syncNow: () => Promise,      // Manual sync trigger
  refreshSyncStatus: () => Promise  // Update counts
}
```

**Used by**: All screens that write data (TimeTracking, AddChild, SessionForm)

---

### AuthProvider
**Location**: `src/context/AuthContext.js`

**Provides**:
```javascript
{
  user: {                      // Supabase auth user
    id: string,
    email: string
  },
  profile: {                   // Database user profile
    id: string,
    first_name: string,
    last_name: string,
    job_title: string,         // Used for session form routing
    assigned_school: string
  },
  session: object,             // Supabase session
  loading: boolean,            // Profile loading state
  signIn: (email, password) => Promise,
  signOut: () => Promise,
  resetPassword: (email) => Promise,
  updatePassword: (newPassword) => Promise,
  refreshProfile: () => Promise
}
```

**Used by**: All authenticated screens (Home, Time, Profile, Sessions)

---

### ChildrenProvider
**Location**: `src/context/ChildrenContext.js`

**Provides**:
```javascript
{
  children: Array,             // All children records
  groups: Array,               // All group records
  childrenGroups: Array,       // Junction table (many-to-many)
  loading: boolean,

  // CRUD operations
  loadChildren: () => Promise,
  addChild: (data) => Promise,
  updateChild: (id, updates) => Promise,
  deleteChild: (id) => Promise,

  // Group operations
  loadGroups: () => Promise,
  addGroup: (data) => Promise,
  updateGroup: (id, updates) => Promise,
  deleteGroup: (id) => Promise,

  // Relationship operations
  addChildToGroup: (childId, groupId) => Promise,
  removeChildFromGroup: (childId, groupId) => Promise,

  // Helpers
  getChildrenInGroup: (groupId) => Array,
  getGroupsForChild: (childId) => Array
}
```

**Used by**: ChildrenListScreen, ChildSelector, SessionForms, Group Management

---

## 🧩 Reusable Components

### SyncIndicator
**Location**: `src/components/common/SyncIndicator.js`

**Props**:
```javascript
{
  onPress: () => void          // Callback when tapped
}
```

**Behavior**:
- Shows in app header
- ✅ Green checkmark = online & synced
- ☁️ Yellow cloud = offline or unsynced items (with badge count)
- 🔄 Blue spinner = currently syncing
- Tapping navigates to SyncStatusScreen

**Uses**: `useOffline()` context

---

### ChildSelector
**Location**: `src/components/children/ChildSelector.js`

**Props**:
```javascript
{
  selectedChildren: Array,     // Array of selected child IDs
  onSelectionChange: (Array) => void  // Callback with new selection
}
```

**Features**:
- Search by child name
- Filter by group
- Multi-select with chips
- Shows selected children as removable chips

**Uses**: `useChildren()` context

---

### LetterGrid
**Location**: `src/components/session/LetterGrid.js`

**Props**:
```javascript
{
  selectedLetters: Array,      // Array of selected letters
  onToggleLetter: (letter) => void  // Callback when letter toggled
}
```

**Behavior**:
- 5×5 grid of alphabet letters (Masi letter order)
- Tap to toggle selection
- Selected letters highlighted in brand blue
- Fully controlled component (no internal state)

---

## 📱 Screen Components & Props

### Tab Screens (Always Mounted)

#### HomeScreen
```javascript
Props: { navigation }
Contexts: useAuth()
Data: profile.first_name, profile.last_name, profile.job_title
Actions:
  - Navigate to ProfileScreen
  - signOut()
```

#### TimeTrackingScreen
```javascript
Props: { navigation }
Contexts: useAuth(), useOffline()
Local State:
  - activeEntry: object      // Current time entry if signed in
  - elapsedTime: number      // Seconds since sign in
  - loadingLocation: boolean
Actions:
  - handleSignIn() → Request location → Save to AsyncStorage
  - handleSignOut() → Capture location → Update entry
  - Navigate to TimeEntriesList
Side Effects:
  - Timer updates elapsed time every second
  - Checks AsyncStorage for active entry on mount
```

#### ChildrenListScreen
```javascript
Props: { navigation }
Contexts: useChildren(), useOffline()
Local State:
  - searchTerm: string
  - refreshing: boolean
Data: children (filtered by search)
Actions:
  - loadChildren() (pull to refresh)
  - Navigate to AddChild, EditChild, GroupManagement
  - FAB for adding new child
```

#### SessionsScreen
```javascript
Props: { navigation }
Contexts: (none)
Actions:
  - Navigate to SessionForm
  - Navigate to SessionHistory
```

---

### Modal Screens (Mounted on Demand)

#### SessionFormScreen (Router)
```javascript
Props: { navigation }
Contexts: useAuth()
Logic:
  - If profile.job_title === 'Literacy Coach':
      Render <LiteracySessionForm />
  - Else:
      Show "Coming soon" placeholder
```

#### LiteracySessionForm
```javascript
Props: { navigation }
Contexts: useAuth(), useOffline()
Local State:
  - sessionDate: Date
  - selectedChildren: Array[childId]
  - selectedLetters: Array[letter]
  - sessionReadingLevel: string
  - childReadingLevels: Object { childId: level }
  - comments: string
  - validationErrors: object
Sub-components:
  - <ChildSelector
      selectedChildren={selectedChildren}
      onSelectionChange={setSelectedChildren}
    />
  - <LetterGrid
      selectedLetters={selectedLetters}
      onToggleLetter={handleToggleLetter}
    />
Actions:
  - handleSubmit() → Save to AsyncStorage → refreshSyncStatus()
  - Validation before submit
```

#### AddChildScreen
```javascript
Props: { navigation }
Contexts: useChildren()
Local State: (form fields)
  - firstName, lastName, teacher, className, age, school
  - errors: object
  - loading: boolean
Actions:
  - addChild() from ChildrenContext
  - navigation.goBack() on success
Validation:
  - firstName required
  - lastName required
  - School required
```

#### EditChildScreen
```javascript
Props: { navigation, route }
Route Params: { childId: string }
Contexts: useChildren()
Local State: (same as AddChild)
Actions:
  - Pre-populate form from children.find(c => c.id === childId)
  - updateChild() or deleteChild()
  - navigation.goBack()
```

---

## 🔄 Data Flow Patterns

### Pattern 1: Write Data (Offline-First)
```
User Action (e.g., Add Child)
  ↓
Save to AsyncStorage with { synced: false }
  ↓
Update Context State (children array)
  ↓
Call refreshSyncStatus()
  ↓
OfflineContext detects unsynced items
  ↓
If online → Sync to Supabase
  ↓
Update { synced: true } in AsyncStorage
  ↓
Update UI (SyncIndicator)
```

**Example**: `AddChildScreen.handleSubmit()`
```javascript
await addChild(childData);  // Saves locally with synced: false
await refreshSyncStatus();  // Triggers sync if online
navigation.goBack();        // UI updates immediately
```

---

### Pattern 2: Read Data (Cache-First)
```
Component Mounts
  ↓
Load from AsyncStorage
  ↓
Display cached data
  ↓
Fetch from Supabase (if online)
  ↓
Update cache + state
  ↓
Re-render with fresh data
```

**Example**: `ChildrenProvider.loadChildren()`
```javascript
// 1. Load from cache immediately
const cached = await storage.getChildren();
setChildren(cached);

// 2. Fetch fresh data if online
if (isOnline) {
  const fresh = await supabase.from('children').select();
  await storage.saveChildren(fresh);
  setChildren(fresh);
}
```

---

### Pattern 3: Navigation with Params
```
Source Screen passes params
  ↓
React Navigation
  ↓
Destination Screen receives via route.params
```

**Example**: Edit Child Flow
```javascript
// ChildrenListScreen.js
<List.Item
  onPress={() => navigation.navigate('EditChild', {
    childId: child.id
  })}
/>

// EditChildScreen.js
function EditChildScreen({ route }) {
  const { childId } = route.params;
  const { children } = useChildren();
  const child = children.find(c => c.id === childId);
  // Pre-populate form...
}
```

---

## 🎨 Styling Pattern

All components use centralized constants:

**Colors**: `src/constants/colors.js`
```javascript
colors.primary     // #294A99 (Brand blue)
colors.accent      // #FFDD00 (Yellow)
colors.emphasis    // #E72D4D (Red)
colors.success     // #3FA535 (Green)
colors.background  // #F7F7F7
colors.surface     // #FFFFFF
```

**Spacing**:
```javascript
spacing.xs   // 4px
spacing.sm   // 8px
spacing.md   // 16px
spacing.lg   // 24px
spacing.xl   // 32px
```

**Usage**:
```javascript
import { colors, spacing } from '../constants/colors';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    padding: spacing.md,
  }
});
```

---

## 🚀 Quick Navigation Map

| From Screen | Action | Navigates To | Passes Params |
|-------------|--------|--------------|---------------|
| LoginScreen | Login success | HomeScreen | - |
| HomeScreen | Profile button | ProfileScreen | - |
| TimeTrackingScreen | History button | TimeEntriesList | - |
| ChildrenListScreen | FAB press | AddChild | - |
| ChildrenListScreen | List item press | EditChild | `{ childId }` |
| ChildrenListScreen | Groups button | GroupManagement | - |
| GroupManagement | Add to group | AddChildToGroup | `{ groupId }` |
| SessionsScreen | New session | SessionForm | - |
| SessionsScreen | History button | SessionHistory | - |
| SyncIndicator | Tap indicator | SyncStatus | - |

---

## 🔍 Finding Components

| Component Type | Location |
|----------------|----------|
| Context Providers | `src/context/` |
| Screen Components | `src/screens/` |
| Reusable Components | `src/components/` |
| Navigation Config | `src/navigation/AppNavigator.js` |
| Services | `src/services/` |
| Constants | `src/constants/` |

---

## 💡 Key Architectural Decisions

1. **Context over Props**: Cross-cutting concerns (auth, sync, data) use Context API instead of prop drilling
2. **Offline-First**: All writes to AsyncStorage first, sync happens in background
3. **Cache-First Reads**: Display cached data immediately, fetch fresh when online
4. **Job-Title Routing**: SessionFormScreen routes to different forms based on user's role
5. **Controlled Components**: ChildSelector and LetterGrid are fully controlled (no internal state)
6. **Navigation Params**: Use route.params for passing data between screens (not global state)

---

**Last Updated**: 2026-02-10
**Version**: Phase 7 Complete
# HISTORICAL - predates 2026-05 schema hardening. Field names and schema assumptions may be stale.
