# Chapter 3: Offline-First Architecture - The Core Pattern

## The Fundamental Insight

Most apps are "online-first": they try to hit the server, then fall back to local storage if offline. This creates complexity and failure modes.

**Offline-first inverts this**:
1. Write to local storage immediately
2. Update UI optimistically
3. Sync to server in background
4. Trust local data as source of truth until proven otherwise

## The Sync Pattern We Use: "Last Write Wins"

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

## Sync Triggers: When Does Syncing Happen?

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

## The Sync Queue Architecture

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

**Last Updated**: 2026-01-27
