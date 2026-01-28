# Offline-First Architecture & Sync Management

## The Problem: Field Staff with Unreliable Connectivity

Imagine you're a literacy coach working in a rural school. You arrive at 8am, sign in on your phone, work with children all day, record session data, and sign out at 4pm. But there's a problem: **the school has no internet connection, and you won't have connectivity for another 2 days**.

With a traditional online-only app, you'd be stuck. You couldn't:
- Track your work hours
- Record which children you worked with
- Save session notes and activities
- Update child information

The data would be lost or you'd need to remember everything and enter it later (error-prone and frustrating).

## The Solution: Offline-First Architecture

**Offline-first** means the app works perfectly without internet, then syncs when connectivity returns. The user experience is identical whether online or offline.

### Core Principle
```
User Action → Save Locally First → Update UI Immediately → Sync to Server Later
```

The user never waits for a network request. Everything happens instantly on the device, then syncs in the background when possible.

## How Offline-First Works

### 1. Local Storage as the Source of Truth

Instead of fetching data from the server every time, we:
1. **Store everything locally** using AsyncStorage (React Native's persistent storage)
2. **Read from local storage** to display UI (instant, no loading)
3. **Write to local storage** when user makes changes (instant feedback)
4. **Sync with server** in the background when online

```javascript
// Traditional online-first (BAD for offline users)
const saveTimeEntry = async (entry) => {
  const response = await supabase.from('time_entries').insert(entry); // ❌ Fails offline
  setTimeEntries([...timeEntries, entry]); // Only updates if network succeeds
};

// Offline-first (GOOD for offline users)
const saveTimeEntry = async (entry) => {
  const newEntry = { ...entry, synced: false }; // Mark as unsynced

  // Save locally FIRST (always succeeds, even offline)
  await AsyncStorage.setItem('time_entries', JSON.stringify([...timeEntries, newEntry]));
  setTimeEntries([...timeEntries, newEntry]); // Update UI immediately

  // Try to sync to server (runs in background, retries if fails)
  await syncQueue.add(newEntry);
};
```

### 2. The Sync Flag Pattern

Every record that needs to sync to the server has a `synced` flag:

```javascript
{
  id: '123',
  user_id: 'abc',
  sign_in_time: '2026-01-27T08:00:00Z',
  sign_in_lat: -25.1234,
  sign_in_lon: 28.5678,
  synced: false  // ← This tells us it needs to be uploaded
}
```

- `synced: false` = "This data only exists on the device, needs to upload to server"
- `synced: true` = "This data has been successfully saved to the server"

When the app comes online, we query for all records with `synced: false` and upload them.

### 3. The Sync Queue

The sync queue is a background process that:
1. Detects when the app is online
2. Finds all unsynced records (`synced: false`)
3. Uploads them to the server one by one
4. Marks them as synced (`synced: true`) on success
5. Retries failed uploads with exponential backoff

```javascript
// Conceptual sync queue flow
const processSyncQueue = async () => {
  if (!isOnline) return; // Don't try if offline

  const unsyncedEntries = await getUnsyncedRecords('time_entries');

  for (const entry of unsyncedEntries) {
    try {
      await supabase.from('time_entries').insert(entry);
      await markAsSynced(entry.id); // Update synced flag to true
    } catch (error) {
      await scheduleRetry(entry, error); // Try again later
    }
  }
};
```

### 4. Conflict Resolution: Last-Write-Wins

What if the same record is edited offline on the device AND edited by an admin in the database?

**Our strategy: Last-Write-Wins (Staff Always Wins)**

The field staff's offline changes always overwrite the server's data. Why?
- Field staff are closest to the ground truth (they were there)
- Admin edits are usually corrections based on old info
- Simpler implementation (no complex merge logic)

```javascript
// When syncing, we use upsert (update or insert)
await supabase
  .from('time_entries')
  .upsert(entry, { onConflict: 'id' }); // Overwrites server version if exists
```

**Trade-off**: Admin edits might be overwritten. In production, you'd add warnings or conflict detection, but for MVP, simplicity wins.

## Implementation Architecture

### OfflineContext Structure

The `OfflineContext` provides:
1. **Network state**: `isOnline` (true/false)
2. **Sync status**: `unsyncedCount` (number of records needing sync)
3. **Sync functions**: `syncNow()`, `addToSyncQueue()`
4. **Sync indicators**: Visual feedback for user

```javascript
const OfflineContext = createContext({
  isOnline: true,
  unsyncedCount: 0,
  syncNow: async () => {},
  addToSyncQueue: async (table, record) => {},
  getSyncStatus: () => ({}),
});
```

### Sync Triggers

We sync automatically when:
1. **App foregrounds** - User opens the app
2. **Network reconnects** - User regains connectivity
3. **Manual trigger** - User taps "Sync Now" button

We DON'T sync on every write because:
- Battery drain from constant network checks
- Interrupting user flow
- Potential race conditions

### Retry Strategy: Exponential Backoff

When a sync fails, we don't give up. We retry with increasing delays:

```
Attempt 1: Immediate
Attempt 2: Wait 5 seconds
Attempt 3: Wait 15 seconds
Attempt 4: Wait 45 seconds
Attempt 5: Wait 135 seconds (2.25 minutes)
```

This is called **exponential backoff** - each retry waits 3x longer than the previous.

Why?
- Temporary network glitches resolve quickly (retry soon)
- Longer outages need less frequent retries (save battery)
- Server overload gets time to recover

After 5 attempts, we:
- Keep the record in the queue with a "needs review" flag
- Don't lose the data (critical!)
- Admin can investigate the issue later

### Data Flow Example: Time Entry

Let's trace a complete offline time entry through the system:

```
1. User taps "Sign In" → App is OFFLINE
   ↓
2. Capture GPS coordinates
   ↓
3. Create time entry object:
   {
     id: 'local-uuid-123',
     user_id: 'user-abc',
     sign_in_time: '2026-01-27T08:00:00Z',
     sign_in_lat: -25.1234,
     sign_in_lon: 28.5678,
     synced: false
   }
   ↓
4. Save to AsyncStorage key: 'time_entries'
   ↓
5. Update UI: Show "Signed In" (instant feedback)
   ↓
6. Add to sync queue
   ↓
   ... 2 days pass, user still offline ...
   ↓
7. User drives home, app detects online
   ↓
8. Sync queue wakes up
   ↓
9. Finds unsynced time entry (synced: false)
   ↓
10. Uploads to Supabase: INSERT INTO time_entries
    ↓
11. Success! Update local record: synced = true
    ↓
12. Save updated record back to AsyncStorage
    ↓
13. Update UI: unsyncedCount decreases
```

The user never noticed the sync happening. It just worked.

## Storage Strategy: Per-Table Keys

We store each data type in its own AsyncStorage key:

```javascript
// Storage keys
'time_entries'     → Array of time entry objects
'sessions'         → Array of session objects
'children'         → Array of children objects
'groups'           → Array of group objects
'sync_queue_meta'  → Metadata about sync attempts
```

Why separate keys?
- Easier to query specific data types
- Better performance (don't load all data every time)
- Easier to debug (inspect one table at a time)

## Network State Detection

React Native doesn't have a built-in network detector that's reliable. We use:

```javascript
import NetInfo from '@react-native-community/netinfo';

// Subscribe to network state changes
const unsubscribe = NetInfo.addEventListener(state => {
  setIsOnline(state.isConnected && state.isInternetReachable);
});
```

**Important**: `isConnected` ≠ `isInternetReachable`
- `isConnected`: Device has WiFi/cellular connection
- `isInternetReachable`: Device can actually reach the internet

Both must be true to sync.

## Visual Feedback: Sync Status Indicator

Users need to know:
1. Are they online or offline?
2. Do they have unsynced data?
3. Is syncing happening right now?

We show a persistent indicator:
- **Green checkmark**: All synced, online
- **Yellow cloud**: X items need sync, offline
- **Blue spinner**: Syncing now...
- **Red warning**: Sync failures need attention

Users can tap the indicator to see details:
- Which items are unsynced
- Last successful sync time
- Network status
- Manual "Sync Now" button

## Edge Cases & Considerations

### 1. UUID Collisions
We generate UUIDs locally. What if two devices generate the same ID?

**Solution**: Use `uuid v4` which has astronomical collision odds (1 in 5.3 x 10^36).

### 2. Large Data Sync
What if the user has 1000 unsynced records?

**Solution**:
- Batch uploads (50 at a time)
- Show progress indicator
- Allow user to continue working while syncing

### 3. Schema Changes
What if the database schema changes while user is offline?

**Solution**:
- Include app version in records
- Server validates and migrates old formats
- App shows "Update required" if too old

### 4. Storage Limits
AsyncStorage has size limits (~6MB on some devices).

**Solution**:
- Monitor storage usage
- Warn user if approaching limit
- Compress old data or move to SQLite if needed

### 5. Battery Drain
Constant network checks drain battery.

**Solution**:
- Only check network on app foreground/background transitions
- Don't poll - use event listeners
- Batch syncs instead of per-record

## Why This Matters for Masi

Your field staff work in:
- Rural schools without WiFi
- Areas with poor cellular coverage
- Locations that lose power frequently

An online-only app would be **unusable** for them. They'd have to:
- Wait until they have internet to do anything
- Risk losing data if they forget to sync
- Get frustrated with errors and loading states

With offline-first:
- ✅ Work uninterrupted, always
- ✅ Data never lost
- ✅ Fast, responsive UI
- ✅ Syncs automatically when possible

This architectural decision is the difference between a tool that empowers your staff and one that frustrates them.

## Code Organization

Our implementation will have:

```
/src/context/OfflineContext.js
  - Network state management
  - Sync queue logic
  - Context provider

/src/services/offlineSync.js
  - Sync operations per table
  - Retry logic
  - Batch processing

/src/utils/storage.js
  - AsyncStorage wrappers
  - Helper functions for reading/writing

/src/components/common/SyncIndicator.js
  - Visual feedback component
  - Header badge

/src/screens/main/SyncStatusScreen.js
  - Detailed sync status view
  - Manual sync trigger
```

## Testing Offline Functionality

To test offline sync during development:

1. **iOS Simulator**: Hardware → Network Link Conditioner → 100% Loss
2. **Android Emulator**: Settings → Network → Data Disabled
3. **Physical Device**: Enable Airplane Mode

Then:
1. Sign in while offline
2. Add children while offline
3. Record sessions while offline
4. Check sync indicator shows unsynced count
5. Re-enable network
6. Watch data sync automatically
7. Verify data appears in Supabase dashboard

## Key Takeaways

1. **Save locally first** - Never let network issues block the user
2. **Sync is background** - User never waits for network
3. **Sync flags track state** - `synced: true/false` is simple and effective
4. **Retry with backoff** - Don't give up, but don't spam the network
5. **Visual feedback** - Users need to know what's happening
6. **Last-write-wins** - Simple conflict resolution for MVP
7. **Test offline thoroughly** - This is the critical path for your users

Offline-first is more complex than online-only, but it's essential for real-world reliability in low-connectivity environments. It's what makes your app actually useful for field staff.

---

**Next**: Let's implement the OfflineContext with all these patterns!
