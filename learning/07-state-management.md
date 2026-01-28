# Chapter 7: State Management - React Context Pattern

## Why Context API Over Redux/MobX/Zustand?

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

## AuthContext Example

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

**Last Updated**: 2026-01-27
