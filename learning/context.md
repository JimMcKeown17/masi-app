# React Context Architecture: Why We Have Three Contexts

## The Problem: Global State in React

React passes data through props (parent → child). For deeply nested components, this becomes painful:

```javascript
// ❌ Prop drilling - passing user through 5 levels
<App user={user}>
  <MainScreen user={user}>
    <TabNavigator user={user}>
      <ChildrenScreen user={user}>
        <ChildCard user={user}>
          {user.name}  // Finally used here
        </ChildCard>
      </ChildrenScreen>
    </TabNavigator>
  </MainScreen>
</App>
```

**Problems**:
- Every component needs `user` prop (even if they don't use it)
- Adding new prop requires updating every component in chain
- Refactoring is fragile (move a component, break the prop chain)

**Solution**: React Context (global state accessible anywhere)

```javascript
// ✅ Context - skip the intermediate components
<App>
  <AuthProvider>  {/* user available to all children */}
    <MainScreen>
      <TabNavigator>
        <ChildrenScreen>
          <ChildCard>
            {useAuth().user.name}  {/* Direct access */}
          </ChildCard>
        </ChildrenScreen>
      </TabNavigator>
    </MainScreen>
  </AuthProvider>
</App>
```

But don't put everything in one giant context. We separate concerns into **three specialized contexts**.

---

## Context 1: AuthContext (User Session & Profile)

**File**: `src/context/AuthContext.js`

**Responsibility**: Authentication state and user profile

### What It Manages
```javascript
const [user, setUser] = useState(null);           // Supabase auth user
const [profile, setProfile] = useState(null);     // Users table profile
const [session, setSession] = useState(null);     // Auth session token
const [loading, setLoading] = useState(true);     // Initial auth check
```

### Why Separate from Other Contexts?

**1. Authentication is foundational**
- Every other context needs `user.id` to query their data
- If auth context changes, everything needs to re-fetch
- Must be the outermost provider (wrap everything else)

**2. Auth state has unique lifecycle**
```javascript
useEffect(() => {
  // Listen for auth changes (login/logout)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      }
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

This listener runs once on mount and persists for app lifetime. If bundled with other contexts, we'd have lifecycle issues.

**3. Auth methods are global utilities**
```javascript
const signIn = async (email, password) => { /* ... */ };
const signOut = async () => { /* ... */ };
const resetPassword = async (email) => { /* ... */ };
```

These don't belong in "children" or "offline" contexts - they're app-wide primitives.

### Provider Hierarchy Position
```javascript
<OfflineProvider>          // Outer (network state)
  <AuthProvider>           // Middle (who's logged in)
    <ChildrenProvider>     // Inner (user-specific data)
```

**Why this order?**
- `OfflineProvider` needs no auth (just checks `navigator.onLine`)
- `AuthProvider` uses offline context to handle auth failures gracefully
- `ChildrenProvider` depends on `user.id` from AuthContext

### Usage Pattern
```javascript
const { user, profile, loading, signOut } = useAuth();

if (loading) return <LoadingSpinner />;
if (!user) return <LoginScreen />;

return <Text>Welcome {profile?.first_name}</Text>;
```

---

## Context 2: OfflineContext (Network State & Sync Management)

**File**: `src/context/OfflineContext.js`

**Responsibility**: Network connectivity and offline sync orchestration

### What It Manages
```javascript
const [isOnline, setIsOnline] = useState(true);
const [syncStatus, setSyncStatus] = useState({
  isSyncing: false,
  lastSyncTime: null,
  unsyncedCount: 0,
  failedItems: [],
});
```

### Why Separate from AuthContext?

**1. Different update frequency**
- Auth state: Changes on login/logout (rare)
- Network state: Changes every time WiFi toggles (frequent)

If bundled together, every network change would re-render all auth consumers (expensive).

**2. Network state is independent of auth**
```javascript
// Network listener doesn't need to know about user
useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);  // No dependencies on user/auth
```

**3. Sync orchestration is cross-cutting**
```javascript
const refreshSyncStatus = async () => {
  if (!isOnline) return;  // Don't sync if offline

  setIsSyncing(true);
  const results = await syncAll();  // Syncs ALL tables (time, children, groups, etc.)
  setSyncStatus({
    isSyncing: false,
    lastSyncTime: new Date().toISOString(),
    unsyncedCount: results.totalFailed,
  });
};
```

This function coordinates sync across multiple domains (time tracking, children, sessions). Doesn't belong in any one feature context.

### Why Not in ChildrenContext?

Children context would call `refreshSyncStatus()`, but:
- Time tracking also needs to sync (same function)
- Sessions will need to sync (same function)
- If sync logic lives in ChildrenContext, how does TimeContext access it? Circular dependency!

**Solution**: Hoist sync orchestration to a separate context that everyone can use.

### Usage Pattern
```javascript
const { isOnline, syncStatus, refreshSyncStatus } = useOffline();

// Show offline banner
{!isOnline && <Banner>You're offline</Banner>}

// Show sync status
{syncStatus.unsyncedCount > 0 && (
  <Button onPress={refreshSyncStatus}>
    Sync {syncStatus.unsyncedCount} items
  </Button>
)}
```

---

## Context 3: ChildrenContext (Children & Groups Domain State)

**File**: `src/context/ChildrenContext.js`

**Responsibility**: Children and groups data + operations

### What It Manages
```javascript
const [childrenList, setChildrenList] = useState([]);
const [groups, setGroups] = useState([]);
const [childrenGroups, setChildrenGroups] = useState([]);  // Junction data
const [loading, setLoading] = useState(false);
```

### Why Separate from AuthContext?

**1. Domain-specific state belongs together**
```javascript
// All children operations in one place
const addChild = async (childData) => { /* ... */ };
const updateChild = async (childId, updates) => { /* ... */ };
const deleteChild = async (childId) => { /* ... */ };
const loadChildren = async () => { /* ... */ };

// All group operations
const addGroup = async (groupData) => { /* ... */ };
const addChildToGroup = async (childId, groupId) => { /* ... */ };
```

If these lived in AuthContext, it would become a "god object" (knows too much, does too much).

**2. Feature isolation for testing**
```javascript
// Can test ChildrenContext independently
<ChildrenProvider>
  <ChildrenListScreen />
</ChildrenProvider>
```

No need to mock auth or network state - just test children logic.

**3. Lazy loading of feature data**
```javascript
useEffect(() => {
  if (user?.id) {
    loadChildren();  // Only load when user exists
    loadGroups();
    loadChildrenGroups();
  }
}, [user?.id]);
```

Children data depends on auth, but auth doesn't depend on children data. Unidirectional dependency.

### Why Not Just Local State in ChildrenListScreen?

**Problem**: Multiple screens need children data
- `ChildrenListScreen` (list all children)
- `AddChildScreen` (needs to update the list)
- `EditChildScreen` (needs child details)
- `GroupManagementScreen` (needs children for group assignment)
- `AddChildToGroupScreen` (needs available children)

**Without context**:
```javascript
// ❌ Each screen fetches independently (slow, inconsistent)
const ChildrenListScreen = () => {
  const [children, setChildren] = useState([]);
  useEffect(() => { loadChildren() }, []);
};

const EditChildScreen = () => {
  const [children, setChildren] = useState([]);
  useEffect(() => { loadChildren() }, []);  // Duplicate fetch!
};
```

**With context**:
```javascript
// ✅ Fetch once, share everywhere
const ChildrenListScreen = () => {
  const { children, loading } = useChildren();  // Instant (cached)
};

const EditChildScreen = () => {
  const { children, updateChild } = useChildren();  // Same data
};
```

### Usage Pattern
```javascript
const { children, groups, loading, addChild, addGroup } = useChildren();

// Add child
await addChild({ first_name: 'Alice', last_name: 'Smith' });

// Get children in a group
const groupChildren = getChildrenInGroup(groupId);
```

---

## Future: Why Not SessionsContext (Yet)?

When we implement session recording (Phase 4), we'll create a **fourth context**:

```javascript
<OfflineProvider>
  <AuthProvider>
    <ChildrenProvider>
      <SessionsProvider>  {/* NEW */}
        <AppNavigator />
      </SessionsProvider>
    </ChildrenProvider>
  </AuthProvider>
</OfflineProvider>
```

**Why separate SessionsContext?**
- Sessions are a distinct domain (not children, not auth)
- Sessions have different lifecycle (created less frequently, more complex)
- Sessions depend on children data (will use `useChildren()` internally)
- Keeps ChildrenContext focused (single responsibility)

---

## Context Interaction Patterns

### Pattern 1: Child Context Uses Parent Context
```javascript
// ChildrenContext needs user from AuthContext
export const ChildrenProvider = ({ children }) => {
  const { user } = useAuth();  // Import from parent
  const { isOnline, refreshSyncStatus } = useOffline();

  const addChild = async (childData) => {
    const child = { ...childData, assigned_staff_id: user.id };  // Use auth state
    await storage.saveChild(child);
    await refreshSyncStatus();  // Trigger sync via offline context
  };
};
```

**This works because provider hierarchy**:
```javascript
<AuthProvider>           {/* user available */}
  <ChildrenProvider>     {/* can useAuth() */}
```

### Pattern 2: Sibling Contexts Don't Import Each Other
```javascript
// ❌ DON'T DO THIS - creates circular dependency
// In AuthContext.js
import { useOffline } from './OfflineContext';

// In OfflineContext.js
import { useAuth } from './AuthContext';
```

**Solution**: Move shared logic to a service (not a context)

```javascript
// src/services/offlineSync.js
export const syncAll = async () => {
  // Doesn't depend on contexts, can be called by anyone
};

// AuthContext and OfflineContext can both import this service
```

### Pattern 3: Display-Only Components Consume Multiple Contexts
```javascript
const SyncIndicator = () => {
  const { user } = useAuth();                    // Who's syncing
  const { isOnline, syncStatus } = useOffline(); // Sync state
  const { children } = useChildren();            // What's unsynced

  if (!user || isOnline) return null;

  const unsyncedCount = children.filter(c => !c.synced).length;
  return <Badge>{unsyncedCount}</Badge>;
};
```

Multiple contexts is fine for display components (they don't modify state).

---

## When to Create a New Context

**Create a new context when**:
- Managing a distinct domain (users, children, sessions, etc.)
- Multiple screens need the same data
- Data needs to be refetched together (e.g., children + groups + memberships)
- Operations are cohesive (all about one concept)

**Don't create a new context if**:
- Only one screen needs the data (use local state)
- Data is truly global (use a service or utility function)
- It's just for passing props one level down (pass props directly)

---

## Provider Hierarchy Rules

**Order matters** - dependencies go inside dependents:

```javascript
<PaperProvider>              {/* UI theme (no dependencies) */}
  <OfflineProvider>          {/* Network state (no dependencies) */}
    <AuthProvider>           {/* Depends on offline for graceful failures */}
      <ChildrenProvider>     {/* Depends on auth for user.id */}
        <SessionsProvider>   {/* Depends on children for data */}
          <AppNavigator />   {/* Everything available here */}
        </SessionsProvider>
      </ChildrenProvider>
    </AuthProvider>
  </OfflineProvider>
</PaperProvider>
```

**Why this order is critical**:
- If ChildrenProvider wraps AuthProvider, it can't call `useAuth()` (error: "useAuth must be used within AuthProvider")
- Inner providers can use outer contexts, not vice versa
- Think of it like layers of an onion - each layer can see outward, not inward

---

## Performance Considerations

### Problem: Context Re-renders All Consumers

When context value changes, **every component using that context re-renders**.

```javascript
// ❌ Bad: Every keystroke re-renders entire tree
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');  // Unrelated!

  return (
    <AuthContext.Provider value={{ user, searchTerm, setSearchTerm }}>
      {children}
    </AuthContext.Provider>
  );
};
```

Every time `searchTerm` changes, **all components using `useAuth()` re-render**.

### Solution: Split Contexts by Update Frequency

```javascript
// ✅ Good: Stable auth context
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);  // Changes rarely

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// ✅ Good: Search in local state (only SearchScreen re-renders)
const SearchScreen = () => {
  const [searchTerm, setSearchTerm] = useState('');  // Local state
  return <Searchbar value={searchTerm} onChangeText={setSearchTerm} />;
};
```

**Guideline**: Context for data that needs to be **shared**. Local state for data that's **private to one screen**.

---

## Key Takeaways

1. **AuthContext** = Who's logged in (user, profile, session)
2. **OfflineContext** = Network state and sync orchestration (cross-cutting concern)
3. **ChildrenContext** = Domain-specific data and operations (children, groups)

4. **Context hierarchy** = Dependencies go inside (ChildrenProvider inside AuthProvider)
5. **Context isolation** = Each context manages one concern (separation of responsibilities)
6. **Performance** = Split contexts by update frequency (avoid unnecessary re-renders)
7. **Future contexts** = One per major domain (SessionsContext coming in Phase 4)

This architecture scales well: add new domains without modifying existing contexts, test features in isolation, and maintain clean separation of concerns.
