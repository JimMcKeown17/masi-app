# Chapter 2: Technology Stack - Why These Choices?

## React Native + Expo

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

## Supabase (PostgreSQL + Auth)

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

## AsyncStorage (Offline Storage)

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

## React Native Paper (Material Design)

**Decision**: Use React Native Paper for UI components instead of building custom or using other libraries

**Why?**
- **Consistent design**: Material Design is familiar to users
- **Accessibility**: Built-in support for screen readers, touch targets
- **Themeable**: Easy to customize colors while maintaining consistency
- **Well-maintained**: Active community, regular updates
- **Complete**: Forms, buttons, cards, dialogs all included

**Philosophy**: Don't reinvent the wheel for UI. Focus innovation on offline sync logic.

## React Navigation (Bottom Tabs)

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

**Last Updated**: 2026-01-27
