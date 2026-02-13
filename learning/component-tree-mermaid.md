# Masi App - Component Tree (Mermaid Diagrams)

Visual component relationship diagrams using [Mermaid](https://mermaid.js.org/) syntax. Render these in any Markdown previewer that supports Mermaid (GitHub, VS Code with extension, etc.).

---

## 1. Provider Wrapping Hierarchy

```mermaid
graph TD
    A["index.js"] --> B["App.js"]
    B --> C["SafeAreaProvider"]
    C --> D["PaperProvider (theme)"]
    D --> E["OfflineProvider"]
    E --> F["AuthProvider"]
    F --> G["ChildrenProvider"]
    G --> H["AppNavigator"]
    G --> I["StatusBar"]

    style A fill:#294A99,color:#fff
    style B fill:#294A99,color:#fff
    style E fill:#FFDD00,color:#333
    style F fill:#E72D4D,color:#fff
    style G fill:#3FA535,color:#fff
    style H fill:#6B7280,color:#fff
```

---

## 2. Full Navigation Tree

```mermaid
graph TD
    NAV["AppNavigator"] --> AUTH_CHECK{Authenticated?}

    AUTH_CHECK -- No --> AUTH_NAV["AuthNavigator (Stack)"]
    AUTH_NAV --> LOGIN["LoginScreen"]
    AUTH_NAV --> FORGOT["ForgotPasswordScreen"]
    LOGIN -. navigates .-> FORGOT
    FORGOT -. navigates .-> LOGIN

    AUTH_CHECK -- Yes --> MAIN_NAV["MainNavigator (Stack)"]
    MAIN_NAV --> TABS["MainTabNavigator (Bottom Tabs)"]
    MAIN_NAV --> PROFILE["ProfileScreen"]
    MAIN_NAV --> TIME_LIST["TimeEntriesListScreen"]
    MAIN_NAV --> ADD_CHILD["AddChildScreen"]
    MAIN_NAV --> EDIT_CHILD["EditChildScreen"]
    MAIN_NAV --> GROUP_MGMT["GroupManagementScreen"]
    MAIN_NAV --> ADD_TO_GRP["AddChildToGroupScreen"]
    MAIN_NAV --> SESS_FORM["SessionFormScreen"]
    MAIN_NAV --> SESS_HIST["SessionHistoryScreen"]
    MAIN_NAV --> SYNC_STATUS["SyncStatusScreen"]

    TABS --> HOME["HomeScreen"]
    TABS --> TIME["TimeTrackingScreen"]
    TABS --> CHILDREN["ChildrenListScreen"]
    TABS --> SESSIONS["SessionsScreen"]

    HOME -. navigates .-> PROFILE
    TIME -. navigates .-> TIME_LIST
    CHILDREN -. navigates .-> ADD_CHILD
    CHILDREN -. navigates .-> EDIT_CHILD
    CHILDREN -. navigates .-> GROUP_MGMT
    GROUP_MGMT -. navigates .-> ADD_TO_GRP
    SESSIONS -. navigates .-> SESS_FORM
    SESSIONS -. navigates .-> SESS_HIST

    style AUTH_CHECK fill:#fff,stroke:#294A99,stroke-width:2px
    style TABS fill:#294A99,color:#fff
    style HOME fill:#3FA535,color:#fff
    style TIME fill:#3FA535,color:#fff
    style CHILDREN fill:#3FA535,color:#fff
    style SESSIONS fill:#3FA535,color:#fff
    style LOGIN fill:#E72D4D,color:#fff
    style FORGOT fill:#E72D4D,color:#fff
```

---

## 3. Session Form Routing (Job-Title Based)

```mermaid
graph TD
    SF["SessionFormScreen"] --> CHECK{profile.job_title}

    CHECK -- "Literacy Coach" --> LF["LiteracySessionForm"]
    CHECK -- "Numeracy Coach" --> NF["NumeracySessionForm (coming soon)"]
    CHECK -- "ZZ Coach" --> ZF["ZZCoachSessionForm (coming soon)"]
    CHECK -- "Yeboneer" --> YF["YeboneerSessionForm (coming soon)"]

    LF --> CAL["InlineCalendar"]
    LF --> CS["ChildSelector"]
    LF --> LG["LetterGrid"]
    LF --> RL["Reading Level Dropdowns"]
    LF --> CMT["Comments Field"]

    CS --> SEARCH["Searchbar"]
    CS --> GRP_MENU["Select by Group Menu"]
    CS --> CHECKLIST["Children Checklist"]
    CS --> CHIPS["Selected Children Chips"]

    LG --> TILES["Letter Tiles (A-Z)"]

    style SF fill:#294A99,color:#fff
    style LF fill:#3FA535,color:#fff
    style NF fill:#6B7280,color:#fff,stroke-dasharray: 5 5
    style ZF fill:#6B7280,color:#fff,stroke-dasharray: 5 5
    style YF fill:#6B7280,color:#fff,stroke-dasharray: 5 5
    style CS fill:#FFDD00,color:#333
    style LG fill:#FFDD00,color:#333
```

---

## 4. Context Provider → Consumer Relationships

```mermaid
graph LR
    subgraph AuthContext
        direction TB
        AC_DATA["user, profile, session"]
        AC_METHODS["signIn, signOut, resetPassword, updatePassword, refreshProfile"]
    end

    subgraph OfflineContext
        direction TB
        OC_DATA["isOnline, isSyncing, unsyncedCount, syncStatus"]
        OC_METHODS["syncNow, refreshSyncStatus"]
    end

    subgraph ChildrenContext
        direction TB
        CC_DATA["children, groups, childrenGroups"]
        CC_METHODS["CRUD ops, group membership ops"]
    end

    AuthContext --> AppNavigator
    AuthContext --> LoginScreen
    AuthContext --> ForgotPasswordScreen
    AuthContext --> HomeScreen
    AuthContext --> ProfileScreen
    AuthContext --> TimeTrackingScreen
    AuthContext --> TimeEntriesListScreen
    AuthContext --> SessionFormScreen
    AuthContext --> LiteracySessionForm
    AuthContext --> SessionHistoryScreen

    OfflineContext --> SyncIndicator
    OfflineContext --> TimeTrackingScreen
    OfflineContext --> TimeEntriesListScreen
    OfflineContext --> ChildrenListScreen
    OfflineContext --> SyncStatusScreen
    OfflineContext --> LiteracySessionForm

    ChildrenContext --> ChildrenListScreen
    ChildrenContext --> AddChildScreen
    ChildrenContext --> EditChildScreen
    ChildrenContext --> GroupManagementScreen
    ChildrenContext --> AddChildToGroupScreen
    ChildrenContext --> ChildSelector

    style AuthContext fill:#E72D4D,color:#fff
    style OfflineContext fill:#FFDD00,color:#333
    style ChildrenContext fill:#3FA535,color:#fff
```

---

## 5. Services & Data Flow

```mermaid
graph TD
    SUPA["supabaseClient (Supabase)"] --> AUTH_CTX["AuthContext"]
    SUPA --> SYNC["offlineSync"]
    SUPA --> CHILD_CTX["ChildrenContext"]

    SYNC --> OFFLINE_CTX["OfflineContext"]
    SYNC --> STORE["storage (AsyncStorage)"]

    CHILD_CTX --> STORE

    STORE --> TIME_SCREEN["TimeTrackingScreen"]
    STORE --> LITERACY["LiteracySessionForm"]
    STORE --> SESS_HIST["SessionHistoryScreen"]
    STORE --> TIME_LIST["TimeEntriesListScreen"]

    LOC["locationService (GPS)"] --> TIME_SCREEN
    LOC --> TIME_LIST

    LOG["logger"] --> DEBUG["debugExport"]
    DEBUG --> PROFILE["ProfileScreen"]
    APP_JS["App.js"] --> LOG

    style SUPA fill:#294A99,color:#fff
    style STORE fill:#FFDD00,color:#333
    style LOC fill:#3FA535,color:#fff
    style LOG fill:#6B7280,color:#fff
    style SYNC fill:#E72D4D,color:#fff
```

---

## 6. Children Management Flow

```mermaid
graph TD
    LIST["ChildrenListScreen"] --> ADD["AddChildScreen"]
    LIST --> EDIT["EditChildScreen"]
    LIST --> GROUPS["GroupManagementScreen"]

    EDIT --> GROUPS
    GROUPS --> ADD_TO["AddChildToGroupScreen"]

    ADD -- "addChild()" --> CC["ChildrenContext"]
    EDIT -- "updateChild() / deleteChild()" --> CC
    GROUPS -- "addGroup() / updateGroup() / deleteGroup()" --> CC
    ADD_TO -- "addChildToGroup()" --> CC

    CC -- "cache-first load" --> STORE["storage (AsyncStorage)"]
    CC -- "sync with server" --> SUPA["supabaseClient"]

    style LIST fill:#294A99,color:#fff
    style CC fill:#3FA535,color:#fff
    style STORE fill:#FFDD00,color:#333
    style SUPA fill:#294A99,color:#fff
```

---

## 7. Time Tracking Flow

```mermaid
graph TD
    TIME["TimeTrackingScreen"] --> CHECK{Active entry exists?}

    CHECK -- No --> SIGN_IN["Show Sign In Button"]
    SIGN_IN --> GET_LOC["Request GPS Location"]
    GET_LOC --> SAVE_LOCAL["Save to AsyncStorage (synced: false)"]
    SAVE_LOCAL --> UPDATE_UI["Show Signed In State + Timer"]

    CHECK -- Yes --> SIGNED_IN["Show Sign Out Button + Elapsed Time"]
    SIGNED_IN --> SIGN_OUT["User taps Sign Out"]
    SIGN_OUT --> GET_LOC2["Capture GPS Location"]
    GET_LOC2 --> UPDATE_ENTRY["Update entry with sign_out_time + coords"]
    UPDATE_ENTRY --> CALC["Calculate total hours"]

    TIME -. "View History" .-> HIST["TimeEntriesListScreen"]

    style TIME fill:#294A99,color:#fff
    style SAVE_LOCAL fill:#FFDD00,color:#333
    style UPDATE_ENTRY fill:#FFDD00,color:#333
    style GET_LOC fill:#3FA535,color:#fff
    style GET_LOC2 fill:#3FA535,color:#fff
```

---

## 8. Offline Sync Pipeline

```mermaid
graph LR
    ACTION["User Action"] --> LOCAL["AsyncStorage (synced: false)"]
    LOCAL --> UI["UI Update (immediate)"]
    LOCAL --> QUEUE["Sync Queue"]
    QUEUE --> ONLINE{Online?}

    ONLINE -- Yes --> SUPA["Supabase"]
    SUPA --> FLAG["Update synced: true"]
    FLAG --> DONE["Complete"]

    ONLINE -- No --> WAIT["Wait for connectivity"]
    WAIT --> ONLINE

    SUPA -- "Failure" --> RETRY["Exponential Backoff Retry"]
    RETRY --> SUPA

    style ACTION fill:#294A99,color:#fff
    style LOCAL fill:#FFDD00,color:#333
    style SUPA fill:#294A99,color:#fff
    style RETRY fill:#E72D4D,color:#fff
```

---

## 9. File Structure Overview

```mermaid
graph TD
    ROOT["masi-app/"] --> SRC["src/"]
    ROOT --> APP["App.js"]
    ROOT --> INDEX["index.js"]

    SRC --> NAV["navigation/"]
    SRC --> SCREENS["screens/"]
    SRC --> COMP["components/"]
    SRC --> CTX["context/"]
    SRC --> SVC["services/"]
    SRC --> UTIL["utils/"]
    SRC --> CONST["constants/"]

    NAV --> APP_NAV["AppNavigator.js"]

    SCREENS --> AUTH_DIR["auth/"]
    SCREENS --> MAIN_DIR["main/"]
    SCREENS --> CHILD_DIR["children/"]
    SCREENS --> SESS_DIR["sessions/"]

    AUTH_DIR --> LOGIN_F["LoginScreen.js"]
    AUTH_DIR --> FORGOT_F["ForgotPasswordScreen.js"]

    MAIN_DIR --> HOME_F["HomeScreen.js"]
    MAIN_DIR --> TIME_F["TimeTrackingScreen.js"]
    MAIN_DIR --> CHILDREN_F["ChildrenListScreen.js"]
    MAIN_DIR --> SESSIONS_F["SessionsScreen.js"]
    MAIN_DIR --> PROFILE_F["ProfileScreen.js"]
    MAIN_DIR --> TIME_LIST_F["TimeEntriesListScreen.js"]
    MAIN_DIR --> SYNC_F["SyncStatusScreen.js"]

    CHILD_DIR --> ADD_F["AddChildScreen.js"]
    CHILD_DIR --> EDIT_F["EditChildScreen.js"]
    CHILD_DIR --> GROUP_F["GroupManagementScreen.js"]
    CHILD_DIR --> ADD_GRP_F["AddChildToGroupScreen.js"]

    SESS_DIR --> FORM_F["SessionFormScreen.js"]
    SESS_DIR --> LIT_F["LiteracySessionForm.js"]
    SESS_DIR --> HIST_F["SessionHistoryScreen.js"]

    COMP --> COMMON_DIR["common/"]
    COMP --> CHILD_COMP["children/"]
    COMP --> SESS_COMP["session/"]

    COMMON_DIR --> SYNC_IND["SyncIndicator.js"]
    CHILD_COMP --> CHILD_SEL["ChildSelector.js"]
    SESS_COMP --> LETTER_G["LetterGrid.js"]

    CTX --> AUTH_CTX_F["AuthContext.js"]
    CTX --> OFFLINE_CTX_F["OfflineContext.js"]
    CTX --> CHILDREN_CTX_F["ChildrenContext.js"]

    SVC --> SUPA_F["supabaseClient.js"]
    SVC --> LOC_F["locationService.js"]
    SVC --> OFFLINE_F["offlineSync.js"]

    UTIL --> STORAGE_F["storage.js"]
    UTIL --> LOGGER_F["logger.js"]
    UTIL --> DEBUG_F["debugExport.js"]

    CONST --> COLORS_F["colors.js"]
    CONST --> JOBS_F["jobTitles.js"]
    CONST --> LIT_CONST_F["literacyConstants.js"]

    style ROOT fill:#294A99,color:#fff
    style SRC fill:#294A99,color:#fff
    style SCREENS fill:#3FA535,color:#fff
    style COMP fill:#FFDD00,color:#333
    style CTX fill:#E72D4D,color:#fff
    style SVC fill:#6B7280,color:#fff
    style UTIL fill:#6B7280,color:#fff
    style CONST fill:#6B7280,color:#fff
```
