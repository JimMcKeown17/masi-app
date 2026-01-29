# Debug & Export System: Supporting Field Staff in Remote Areas

## The Problem We're Solving

Imagine you're a field coach working in a rural area, miles from reliable internet. You've been tracking time and recording sessions all week, and suddenly something goes wrong. Maybe your data isn't syncing. Maybe the app is crashing. Maybe you need to recover important session data.

In a typical app, you'd submit a bug report through some form, wait days for a response, and try to describe what happened from memory. But with field staff working in remote areas with limited connectivity, this traditional approach breaks down:

1. **Connectivity Issues**: Can't reliably submit bug reports online
2. **Technical Barriers**: Field staff aren't developers - asking them to "check the console" isn't realistic
3. **Data Recovery**: If sync fails, there's no easy way to extract their local data
4. **Support Delays**: Without detailed logs, support teams struggle to diagnose issues remotely

We needed a way for field staff to **easily share diagnostic information** using the communication tools they already have (WhatsApp, Email) without requiring technical knowledge or reliable internet.

## Our Solution: Built-In Debug Export

We built two simple features into the ProfileScreen:

1. **Share Logs** - Export a text file of all app activity (console logs, errors, warnings)
2. **Share Database** - Export the entire local database as JSON

Both use the device's native share functionality, so staff can send diagnostics via WhatsApp, Email, or any app they already use.

## Why This Approach?

### 1. Native Share API (Not File System)

We chose React Native's `Share` API instead of writing files to the device's file system. Here's why:

**Share API:**
```javascript
await Share.share({
  message: logsData,
  title: 'Masi App Logs Export',
});
```

**What this does:** Opens the familiar share sheet (the same one used for sharing photos or links)

**Why it's better:**
- ✅ No file system permissions needed
- ✅ Users already know how to use it (share a photo → share logs)
- ✅ Works on both iOS and Android without platform-specific code
- ✅ User chooses where data goes (WhatsApp, Email, etc.)
- ✅ No leftover files cluttering device storage

**Alternative we rejected:** Writing to Documents folder
- ❌ Requires complex file system permissions
- ❌ Users must navigate file system (confusing)
- ❌ Platform-specific code for iOS vs Android
- ❌ Files left on device after sharing

### 2. Rolling Log Buffer (Not Unlimited Storage)

We intercept `console.log`, `console.error`, and `console.warn` to capture all app activity:

```javascript
class Logger {
  async init() {
    const originalLog = console.log;

    console.log = (...args) => {
      this.addLog('LOG', args);
      originalLog(...args);  // Still show in dev console
    };
  }

  async addLog(level, args) {
    const logs = await this.getLogs();
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: args.map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' '),
    };

    logs.push(logEntry);

    if (logs.length > MAX_LOGS) {
      logs.shift(); // Remove oldest
    }

    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }
}
```

**Key decisions:**

1. **Max 1000 entries**: Like a circular buffer - oldest logs are dropped when new ones come in
   - Why? Prevents unlimited storage growth
   - Trade-off: Might lose very old errors, but recent issues (what matters) are always captured

2. **Intercept console methods**: We replace `console.log` but still call the original
   - Why? Captures logs automatically without changing existing code
   - Trade-off: Small performance overhead, but minimal (just string formatting + async write)

3. **Store in AsyncStorage**: Same storage as our offline data
   - Why? Simple, no additional dependencies, already set up
   - Trade-off: Shares storage quota with app data, but 1000 logs ≈ 100KB (negligible)

**Alternative we considered:** Third-party logging service (e.g., Sentry, LogRocket)
- ❌ Requires internet connectivity (defeats purpose for offline app)
- ❌ External dependency and cost
- ❌ Privacy concerns (data leaves device automatically)
- ✅ Our approach: Data only leaves device when user explicitly shares it

### 3. Full Database Export (Not Selective)

When exporting the database, we dump **everything** from AsyncStorage:

```javascript
export const exportDatabase = async () => {
  // Get all keys and values
  const keys = await AsyncStorage.getAllKeys();
  const items = await AsyncStorage.multiGet(keys);

  // Format as object
  const database = items.reduce((acc, [key, value]) => {
    try {
      acc[key] = JSON.parse(value);
    } catch {
      acc[key] = value; // Keep as string if not JSON
    }
    return acc;
  }, {});

  // Add metadata
  const exportData = {
    exported_at: new Date().toISOString(),
    app_version: '1.0.0',
    device_info: {
      platform: Platform.OS,
      version: Platform.Version,
    },
    database,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  await Share.share({ message: jsonString });
};
```

**Why export everything?**
- We don't know what data will help diagnose the issue
- Sync problems might involve any table (time_entries, sessions, children)
- Metadata (timestamps, device info) helps reproduce issues

**Privacy consideration:** We add a **confirmation dialog** for database export:
```javascript
Alert.alert(
  'Export Database',
  'This will export all local data including sensitive information. Only share with Masi support staff.',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Export', style: 'destructive', onPress: async () => { ... } }
  ]
);
```

This ensures users understand they're sharing sensitive data and do so intentionally.

## How It Works: The Full Flow

### Logger Initialization (App.js)

```javascript
import { logger } from './src/utils/logger';

// Initialize logger at app startup
logger.init();
```

This happens **once** when the app starts, before any screens render. From that moment on, every `console.log()`, `console.error()`, and `console.warn()` anywhere in the app is captured.

### Export Logs Flow

```
User taps "Share Logs"
  → exportLogs() reads from AsyncStorage
  → Formats as plain text with timestamps
  → Opens native share sheet
  → User chooses WhatsApp/Email
  → Support team receives readable log file
```

### Export Database Flow

```
User taps "Share Database"
  → Confirmation dialog appears
  → User confirms understanding (sensitive data)
  → exportDatabase() reads all AsyncStorage keys
  → Formats as JSON with metadata
  → Opens native share sheet
  → User sends to support team
  → Support team can import JSON to analyze state
```

## Real-World Usage Scenario

**Scenario:** A literacy coach reports "My time entries aren't showing up after signing out yesterday."

**Without debug export:**
- Support: "Can you describe what happened?"
- Coach: "Um, I signed in at 8am, worked all day, signed out at 3pm... but now it's not there?"
- Support: "Is there an error message?"
- Coach: "I don't remember..."
- Result: Hard to diagnose, might take days of back-and-forth

**With debug export:**
- Coach taps "Share Logs" → Sends via WhatsApp
- Support team receives logs showing:
  ```
  [2026-01-28T08:05:12Z] LOG: Time tracking - Sign in successful
  [2026-01-28T08:05:13Z] LOG: Saved to AsyncStorage: time_entry_123
  [2026-01-28T15:02:45Z] LOG: Time tracking - Sign out successful
  [2026-01-28T15:02:46Z] ERROR: Sync failed: Network request failed
  [2026-01-28T15:02:47Z] LOG: Marked entry as unsynced
  ```
- Support: "Ah! Sync failed. Your data is safe locally. Let's export your database and manually push it."
- Result: Issue diagnosed in minutes, data recovered

## Lessons Learned

### 1. Simplicity Wins for Non-Technical Users

The share button approach works because it's **familiar**. Field staff share photos on WhatsApp every day. This uses the exact same interface. No new concepts to learn.

### 2. Privacy Through User Control

Rather than automatically uploading logs to a server, we put the user in control:
- They decide **when** to export
- They decide **where** to send it (and to whom)
- They see a warning about sensitive data

This builds trust and complies with privacy best practices.

### 3. Metadata is Critical

Including `exported_at`, `app_version`, and `device_info` in exports seems minor, but it's crucial:
- **exported_at**: Helps correlate with server logs
- **app_version**: Different versions might have different bugs
- **device_info**: iOS vs Android issues, OS version bugs

### 4. Console Interception is Powerful

By intercepting console methods, we get logging "for free" across the entire codebase. Developers just write normal `console.log()` statements, and they're automatically captured for debugging.

**Caution:** This pattern can have performance implications in large apps with very frequent logging. For our use case (field app with moderate logging), it's fine. If you're logging inside a tight loop, consider conditional logging:
```javascript
if (__DEV__) console.log('Debug info');
```

### 5. The 1000-Entry Limit is a Balance

We chose 1000 entries as a balance:
- **Too few** (100): Might not capture enough context for complex issues
- **Too many** (10,000): Wastes storage, huge export files
- **1000**: Captures ~1-2 hours of active usage, reasonable file size

Monitor this in production. If issues appear in logs but were lost due to rotation, increase the limit.

## When to Use This Pattern

✅ **Use this approach when:**
- Your users are non-technical
- You need remote debugging capability
- Users work offline or in low-connectivity areas
- You want privacy-conscious diagnostics
- You need to support data recovery

❌ **Don't use this approach when:**
- You need real-time monitoring (use a backend logging service)
- You have always-online users (traditional bug reporting works)
- You're logging very high-frequency events (performance overhead)
- Users are developers who can check console directly

## Future Enhancements

Ideas for improving this system:
- **Clear Logs button**: Let users manually clear logs to free space
- **Log levels filter**: Export only errors, or only last hour
- **Automatic anonymization**: Strip PII before export
- **App version/build info**: Add more detailed version metadata
- **Storage usage indicator**: Show how much space logs are using

## Code Organization

We separated concerns into focused modules:

```
src/utils/
  ├── logger.js         # Log capture & storage
  └── debugExport.js    # Export & share functionality
```

**Why separate files?**
- `logger.js` has one job: capture and store logs
- `debugExport.js` has one job: format and share data
- Easy to test independently
- Easy to enhance one without affecting the other

## Conclusion

The debug export system is a perfect example of **designing for your users' context**. We could have built a fancy cloud-based logging dashboard, but our users work in remote areas with unreliable internet. We chose a solution that:

1. Works offline (local storage)
2. Leverages existing habits (share buttons)
3. Respects privacy (user-controlled sharing)
4. Requires no technical knowledge (tap a button)
5. Uses familiar tools (WhatsApp, Email)

When building features, always ask: "Who is using this, and what constraints do they face?" The answer will guide you to the right technical solution.
