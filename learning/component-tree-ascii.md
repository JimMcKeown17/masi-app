# Masi App - Component Tree (ASCII)

A visual reference of every component in the app and how they connect, rendered in ASCII art.

---

## Provider Hierarchy

The app wraps all screens in a layered set of context providers:

```
index.js
└── App.js
    └── SafeAreaProvider
        └── PaperProvider (theme)
            └── OfflineProvider
                └── AuthProvider
                    └── ChildrenProvider
                        ├── AppNavigator
                        └── StatusBar
```

---

## Full Navigation & Component Tree

```
AppNavigator
│
├─── [user NOT authenticated]
│    │
│    └── AuthNavigator (Stack)
│        │
│        ├── LoginScreen
│        │   ├── Logo image
│        │   ├── TextInput (email)
│        │   ├── TextInput (password)
│        │   ├── Button ("Sign In")
│        │   └── Link → ForgotPasswordScreen
│        │
│        └── ForgotPasswordScreen
│            ├── TextInput (email)
│            ├── Button ("Reset Password")
│            └── Link → LoginScreen
│
│
└─── [user IS authenticated]
     │
     └── MainNavigator (Stack)
         │
         ├── MainTabNavigator (Bottom Tabs)
         │   │
         │   │   ┌─────────────────────────────────────────┐
         │   │   │  Tab Bar Header (all tabs)               │
         │   │   │  └── SyncIndicator (right side)          │
         │   │   │      └── navigates → SyncStatusScreen    │
         │   │   └─────────────────────────────────────────┘
         │   │
         │   ├── Tab: "Home" (icon: home)
         │   │   └── HomeScreen
         │   │       ├── Welcome header (user name)
         │   │       ├── Quick start card
         │   │       ├── Link → ProfileScreen
         │   │       └── Button ("Sign Out")
         │   │
         │   ├── Tab: "Time" (icon: time)
         │   │   └── TimeTrackingScreen
         │   │       ├── Status card (signed in / out)
         │   │       ├── Button ("Sign In" / "Sign Out")
         │   │       ├── Elapsed time display
         │   │       ├── Location coordinates display
         │   │       └── Link → TimeEntriesListScreen
         │   │
         │   ├── Tab: "Children" (icon: people)
         │   │   └── ChildrenListScreen
         │   │       ├── Searchbar
         │   │       ├── Sync status banner
         │   │       ├── FlatList (children)
         │   │       ├── FAB → AddChildScreen
         │   │       └── Button → GroupManagementScreen
         │   │
         │   └── Tab: "Sessions" (icon: document-text)
         │       └── SessionsScreen
         │           ├── Button ("Record New Session")
         │           │   └── navigates → SessionFormScreen
         │           └── Button ("View History")
         │               └── navigates → SessionHistoryScreen
         │
         │
         ├── ProfileScreen (stack)
         │   ├── Profile info card
         │   ├── Debug export section
         │   ├── Password change form
         │   └── Terms link
         │
         ├── TimeEntriesListScreen (stack)
         │   ├── SectionList (grouped by date)
         │   ├── Pull-to-refresh
         │   └── Sync status badges per entry
         │
         ├── AddChildScreen (stack)
         │   ├── TextInput (first name)
         │   ├── TextInput (last name)
         │   ├── TextInput (teacher)
         │   ├── TextInput (class)
         │   ├── TextInput (age)
         │   ├── TextInput (school)
         │   └── Button ("Add Child")
         │
         ├── EditChildScreen (stack)
         │   ├── Same form fields as AddChildScreen
         │   ├── Group memberships display
         │   ├── Button ("Save Changes")
         │   └── Button ("Delete Child")
         │
         ├── GroupManagementScreen (stack)
         │   ├── TextInput + Button (create new group)
         │   └── Expandable list (groups)
         │       ├── Group header (name, count)
         │       ├── Children list within group
         │       ├── Rename action
         │       ├── Delete action
         │       └── Button → AddChildToGroupScreen
         │
         ├── AddChildToGroupScreen (stack)
         │   ├── Searchbar
         │   ├── Checkbox list (available children)
         │   └── Button ("Add Selected")
         │
         ├── SessionFormScreen (stack)
         │   │
         │   ├── [job_title === 'Literacy Coach']
         │   │   └── LiteracySessionForm
         │   │       ├── InlineCalendar (date picker)
         │   │       ├── ChildSelector ◄── shared component
         │   │       │   ├── Searchbar
         │   │       │   ├── "Select by Group" menu
         │   │       │   ├── Children list (checkmarks)
         │   │       │   └── Selected children chips
         │   │       ├── LetterGrid ◄── shared component
         │   │       │   └── Grid of letter tiles (A-Z)
         │   │       ├── Dropdown (session reading level)
         │   │       ├── Dropdowns (per-child reading levels)
         │   │       ├── TextInput (comments)
         │   │       └── Button ("Submit Session")
         │   │
         │   ├── [job_title === 'Numeracy Coach']
         │   │   └── (Coming soon)
         │   │
         │   ├── [job_title === 'ZZ Coach']
         │   │   └── (Coming soon)
         │   │
         │   └── [job_title === 'Yeboneer']
         │       └── (Coming soon)
         │
         ├── SessionHistoryScreen (stack)
         │   ├── FlatList (last 30 days of sessions)
         │   └── Sync status badges per session
         │
         └── SyncStatusScreen (stack)
             ├── Network status badge
             ├── Last synced timestamp
             ├── Unsynced items breakdown
             ├── Button ("Sync Now")
             └── Failed items list with retry
```

---

## Shared / Reusable Components

```
src/components/
│
├── common/
│   └── SyncIndicator
│       ├── Used by: AppNavigator (tab header, right side)
│       ├── Reads: OfflineContext (isOnline, isSyncing, unsyncedCount)
│       └── Renders: icon badge (green ✓ / yellow ☁ / spinner)
│
├── children/
│   └── ChildSelector
│       ├── Used by: LiteracySessionForm
│       ├── Reads: ChildrenContext (children, groups, getChildrenInGroup)
│       ├── Props: selectedChildren, onSelectionChange
│       └── Renders: search, group menu, checklist, chips
│
└── session/
    └── LetterGrid
        ├── Used by: LiteracySessionForm
        ├── Reads: literacyConstants (LETTER_ORDER)
        ├── Props: selectedLetters, onToggleLetter
        └── Renders: grid of toggleable letter tiles
```

---

## Context Provider → Consumer Map

```
AuthContext ─────────────────────────────────────────────────────────┐
│  Provides: user, profile, session, loading,                       │
│            signIn, signOut, resetPassword, updatePassword,         │
│            refreshProfile                                          │
│                                                                    │
├── AppNavigator (auth state for routing)                            │
├── LoginScreen (signIn)                                             │
├── ForgotPasswordScreen (resetPassword)                             │
├── HomeScreen (profile, signOut)                                    │
├── ProfileScreen (user, profile, updatePassword)                    │
├── TimeTrackingScreen (user, profile)                               │
├── TimeEntriesListScreen (user)                                     │
├── SessionFormScreen (profile → job_title routing)                  │
├── LiteracySessionForm (user)                                       │
└── SessionHistoryScreen (user)                                      │
                                                                     │
OfflineContext ──────────────────────────────────────────────────────┐│
│  Provides: isOnline, isSyncing, unsyncedCount,                    ││
│            syncStatus, syncNow, refreshSyncStatus                 ││
│                                                                    ││
├── SyncIndicator (isOnline, isSyncing, unsyncedCount, syncNow)     ││
├── TimeTrackingScreen (refreshSyncStatus)                           ││
├── TimeEntriesListScreen (syncNow, refreshSyncStatus)               ││
├── ChildrenListScreen (syncStatus, refreshSyncStatus)               ││
├── SyncStatusScreen (all values)                                    ││
└── LiteracySessionForm (refreshSyncStatus)                          ││
                                                                     ││
ChildrenContext ─────────────────────────────────────────────────────┐││
│  Provides: children, groups, childrenGroups, loading,             │││
│            CRUD ops, group membership ops                         │││
│                                                                    │││
├── ChildrenListScreen (children, loading, loadChildren)             │││
├── AddChildScreen (addChild)                                        │││
├── EditChildScreen (children, updateChild, deleteChild,             │││
│                    getGroupsForChild)                               │││
├── GroupManagementScreen (groups, addGroup, updateGroup,            │││
│                          deleteGroup, getChildrenInGroup,           │││
│                          removeChildFromGroup)                      │││
├── AddChildToGroupScreen (children, childrenGroups,                 │││
│                          addChildToGroup)                           │││
└── ChildSelector (children, groups, getChildrenInGroup)             │││
                                                                     │││
─────────────────────────────────────────────────────────────────────┘││
─────────────────────────────────────────────────────────────────────-┘│
──────────────────────────────────────────────────────────────────────-┘
```

---

## Services & Utilities Dependency Map

```
                    ┌──────────────┐
                    │ supabaseClient│
                    │  (Supabase)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
              ▼            ▼                ▼
       ┌────────────┐ ┌──────────┐  ┌──────────────┐
       │ AuthContext │ │offlineSync│  │ChildrenContext│
       └────────────┘ └────┬─────┘  └──────┬───────┘
                           │               │
                           ▼               ▼
                    ┌────────────┐  ┌────────────┐
                    │OfflineCtx  │  │  storage   │
                    └────────────┘  │(AsyncStore)│
                                    └─────┬──────┘
                                          │
                    ┌─────────────┬────────┼──────────┐
                    │             │        │          │
                    ▼             ▼        ▼          ▼
             ┌───────────┐ ┌──────────┐ ┌──────┐ ┌────────┐
             │TimeTracking│ │Literacy  │ │Session│ │TimeList│
             │  Screen    │ │  Form    │ │History│ │ Screen │
             └─────┬──────┘ └──────────┘ └──────┘ └────┬───┘
                   │                                    │
                   ▼                                    ▼
            ┌──────────────┐                    ┌──────────────┐
            │locationService│                   │locationService│
            │  (GPS)        │                   │  (formatting) │
            └──────────────┘                    └──────────────┘


       ┌──────────┐        ┌────────────┐
       │  logger  │◄───────│   App.js   │ (initialized on startup)
       └────┬─────┘        └────────────┘
            │
            ▼
       ┌────────────┐
       │ debugExport │◄──── ProfileScreen
       └────────────┘
```

---

## Constants

```
src/constants/
│
├── colors.js
│   ├── colors: { primary: #294A99, secondary: #E72D4D, ... }
│   ├── spacing: { xs, sm, md, lg, xl }
│   ├── borderRadius: { sm, md, lg, full }
│   └── shadows: { small, medium }
│
├── jobTitles.js
│   ├── JOB_TITLES: { LITERACY_COACH, NUMERACY_COACH, ZZ_COACH, YEBONEER }
│   └── JOB_TITLES_ARRAY: [all titles]
│
└── literacyConstants.js
    ├── LETTER_ORDER: [A, B, C, ..., Z]
    └── READING_LEVELS: [level definitions]
```
