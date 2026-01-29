# Time Tracking with Geolocation

## The Problem: Verifying Field Staff Location

Field staff work in rural schools across South Africa. You need to know:
1. Did they actually go to the school? (accountability)
2. How many hours did they work? (payroll)
3. When did they arrive and leave? (attendance)

Without location tracking, you rely on trust and self-reporting. But what if:
- Staff claims to be at School A but is actually at School B
- Staff "forgets" to sign out and claims 12 hours when they worked 6
- Staff signs in from home and drives to school later

**Solution**: Capture GPS coordinates when staff signs in and out.

## Why GPS for Time Tracking?

### Trust, but Verify
GPS isn't about distrust - it's about **documentation**. Just like a receipt proves you bought something, GPS coordinates prove you were somewhere.

Benefits:
- ✅ Accountability (shows actual location vs claimed location)
- ✅ Dispute resolution (staff says "I was there", GPS confirms)
- ✅ Audit trail (for donors, government reporting)
- ✅ Safety (if staff goes missing, you know their last location)

### Real-World Field Staff Scenario
```
8:00 AM - Staff arrives at rural school
          → Taps "Sign In" on phone
          → GPS captures: -25.1234, 28.5678
          → Saves locally: "Signed in at Sunrise Primary School"

4:00 PM - Staff finishes work
          → Taps "Sign Out"
          → GPS captures: -25.1237, 28.5681 (50m from sign-in)
          → Calculates: 8 hours worked

5:00 PM - Staff gets cellular signal
          → App syncs time entry to server
          → Admin sees: "8 hours at Sunrise Primary School"
```

## GPS Accuracy: The Trade-offs

GPS isn't perfect. Accuracy varies based on:
- **Satellites visible** (more satellites = better accuracy)
- **Obstacles** (buildings, trees, indoor/outdoor)
- **Weather** (clouds, rain affect signal)
- **Device quality** (newer phones have better GPS chips)

### Accuracy Levels

| Accuracy | Meters | Use Case | Battery | Time to Fix |
|----------|--------|----------|---------|-------------|
| **Best** | 0-10m | Navigation, precise mapping | High drain | 10-30 seconds |
| **Medium** | 50-100m | School vicinity, general area | Moderate | 2-5 seconds |
| **Low** | 100-500m | City/neighborhood level | Low drain | <1 second |

For field staff time tracking, we use **Medium accuracy (50-100m)**.

### Why Medium Accuracy?

**Sufficient for our needs:**
- We don't need to know which classroom they're in (10m accuracy)
- We just need to confirm they're at the school grounds (100m is plenty)
- Schools are typically 100-500m² - medium accuracy covers this

**Better user experience:**
- Faster GPS fix (2-5 seconds vs 10-30 seconds)
- Lower battery drain (staff work 8 hours, battery matters)
- More reliable indoors (can still get fix inside school building)

**Real-world example:**
```
School coordinates: -25.1234, 28.5678
Sign-in captured:   -25.1237, 28.5681

Distance: ~40 meters (well within 100m threshold)
Result: ✓ Confirmed at school
```

Even if GPS is off by 50-100m, we can still verify they're at the school, not 10km away.

## How GPS Works on Mobile

### The GPS Chip
Your phone has a GPS chip that:
1. **Listens** for signals from GPS satellites orbiting Earth
2. **Calculates** position using triangulation (needs 3+ satellites)
3. **Refines** position over time (more satellites = better accuracy)

It's passive - your phone doesn't "send" anything to satellites, it just receives.

### Location Permissions

On iOS and Android, apps must request permission to access location:

```
┌─────────────────────────────────────┐
│  "Field Staff App" would like to   │
│  access your location               │
│                                      │
│  [ While Using App ]                │
│  [ Always Allow ]                   │
│  [ Don't Allow ]                    │
└─────────────────────────────────────┘
```

**Permission levels:**
- **While Using App**: Only when app is open
- **Always Allow**: Even when app is in background
- **Don't Allow**: No location access

For time tracking, we need **While Using App** because:
- Staff only signs in/out while actively using the app
- Less privacy-invasive than "Always Allow"
- Sufficient for our needs (we don't track movement, just sign-in/out points)

### Persistent Permission Prompts

If a user denies location permission, we **persistently prompt** them because:
- Time tracking is useless without location verification
- We can't let staff sign in without GPS (defeats the purpose)
- We explain why it's required (not optional)

```javascript
// Our approach
const requestLocationPermission = async () => {
  let { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    // Show explanation dialog
    Alert.alert(
      'Location Required',
      'We need your location to verify you are at the school when you sign in/out. This is required for time tracking.',
      [{ text: 'OK', onPress: () => requestLocationPermission() }]  // Ask again
    );
    return false;
  }

  return true;
};
```

This is **not** annoying the user - it's enforcing a business requirement. Without GPS, the time tracking feature doesn't work.

## expo-location API

React Native doesn't have built-in location APIs. We use `expo-location`, which provides a clean API for GPS access.

### Basic Usage

```javascript
import * as Location from 'expo-location';

// 1. Request permission
const { status } = await Location.requestForegroundPermissionsAsync();

// 2. Get current position
const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.Balanced  // Medium accuracy (50-100m)
});

// 3. Extract coordinates
const { latitude, longitude } = location.coords;
// latitude: -25.1234
// longitude: 28.5678
```

### Accuracy Constants

```javascript
Location.Accuracy.Lowest     // ~3km   (city level)
Location.Accuracy.Low        // ~1km   (neighborhood)
Location.Accuracy.Balanced   // ~100m  (✓ WE USE THIS)
Location.Accuracy.High       // ~10m   (street address)
Location.Accuracy.Highest    // ~3m    (precise mapping)
Location.Accuracy.BestForNavigation  // ~3m (turn-by-turn GPS)
```

We use `Location.Accuracy.Balanced` (mapped to "Medium" in our PRD).

### Error Handling

GPS can fail for many reasons:

```javascript
try {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    timeout: 10000,  // Wait max 10 seconds for GPS fix
  });
} catch (error) {
  if (error.code === 'E_LOCATION_SERVICES_DISABLED') {
    // User has GPS turned off in device settings
    Alert.alert('Enable GPS', 'Please turn on Location Services in your device settings');
  } else if (error.code === 'E_LOCATION_TIMEOUT') {
    // Took too long to get GPS fix (poor signal)
    Alert.alert('GPS Timeout', 'Unable to get your location. Are you indoors or in an area with poor GPS signal?');
  } else {
    // Unknown error
    Alert.alert('Location Error', error.message);
  }
}
```

Common failure scenarios:
- User is deep indoors (basement, thick walls)
- User is in a tunnel or parking garage
- GPS is disabled in device settings
- Device doesn't have a GPS chip (rare, but possible on old tablets)

## Time Tracking Workflow

### Sign In Flow

```
User taps "Sign In"
  ↓
Check if already signed in
  ↓ (not signed in)
Check location permission
  ↓ (granted)
Show "Getting location..." spinner
  ↓
Request GPS position (balanced accuracy, 10s timeout)
  ↓ (success)
Create time entry object:
  {
    id: 'uuid-generated-locally',
    user_id: 'user-abc',
    sign_in_time: '2026-01-27T08:00:00Z',
    sign_in_lat: -25.1234,
    sign_in_lon: 28.5678,
    sign_out_time: null,
    sign_out_lat: null,
    sign_out_lon: null,
    synced: false
  }
  ↓
Save to AsyncStorage
  ↓
Update UI: "Signed In at 8:00 AM"
  ↓
Show "Sign Out" button
```

### Sign Out Flow

```
User taps "Sign Out"
  ↓
Check location permission
  ↓ (granted)
Show "Getting location..." spinner
  ↓
Request GPS position (balanced accuracy, 10s timeout)
  ↓ (success)
Load active time entry from AsyncStorage
  ↓
Update time entry:
  {
    ...existingEntry,
    sign_out_time: '2026-01-27T16:00:00Z',
    sign_out_lat: -25.1237,
    sign_out_lon: 28.5681,
    synced: false
  }
  ↓
Calculate hours worked:
  hours = (sign_out_time - sign_in_time) / (1000 * 60 * 60)
  hours = 8.0
  ↓
Save updated entry to AsyncStorage
  ↓
Trigger background sync (if online)
  ↓
Update UI: "Signed Out at 4:00 PM (8 hours)"
  ↓
Show "Sign In" button
```

### State Management

The TimeTrackingScreen needs to track several states:

```javascript
const [isSignedIn, setIsSignedIn] = useState(false);
const [activeEntry, setActiveEntry] = useState(null);
const [loadingLocation, setLoadingLocation] = useState(false);
const [elapsedTime, setElapsedTime] = useState(0);
```

**On mount:**
1. Check AsyncStorage for active time entry (sign_out_time === null)
2. If found, load it and set `isSignedIn = true`
3. Start elapsed time counter (updates every second)

**Elapsed time calculation:**
```javascript
// Current time - sign in time = elapsed milliseconds
const elapsed = Date.now() - new Date(activeEntry.sign_in_time).getTime();

// Convert to hours, minutes, seconds
const hours = Math.floor(elapsed / (1000 * 60 * 60));
const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

// Display: "8h 42m 15s"
```

## Offline Time Tracking

Time tracking **must work offline** because:
- Rural schools often have no cellular signal
- Staff can't wait for network to sign in/out
- Time entries are critical payroll data (can't lose them)

### Offline Storage Pattern

```javascript
// Sign In (offline)
const timeEntry = {
  id: generateUUID(),
  user_id: userId,
  sign_in_time: new Date().toISOString(),
  sign_in_lat: latitude,
  sign_in_lon: longitude,
  sign_out_time: null,
  sign_out_lat: null,
  sign_out_lon: null,
  synced: false  // ← Key flag
};

await storage.saveTimeEntry(timeEntry);
// Saved locally immediately, will sync later

// Sign Out (still offline)
const updatedEntry = {
  ...timeEntry,
  sign_out_time: new Date().toISOString(),
  sign_out_lat: latitude,
  sign_out_lon: longitude,
  synced: false  // Still not synced
};

await storage.updateTimeEntry(timeEntry.id, updatedEntry);

// Later, when online, OfflineContext automatically syncs
// All entries with synced: false get uploaded to Supabase
```

### Sync Queue Priority

Time entries should sync **before** other data because:
- Payroll data is time-sensitive
- Staff expect their hours to be recorded
- Disputes are easier to resolve with fresh data

Our sync order:
1. Time entries (highest priority)
2. Sessions (education data)
3. Children (profile updates)
4. Groups (least urgent)

## UI/UX Considerations

### Loading States

GPS can take 2-10 seconds. Show progress:

```
[ Sign In ]  →  [ Getting location... ⟳ ]  →  [ ✓ Signed In ]
```

Don't leave the user wondering if the button worked.

### Error Messages

Be specific and helpful:

❌ Bad: "Location error"
✅ Good: "Unable to get your location. Please make sure GPS is enabled and you're not indoors."

❌ Bad: "Permission denied"
✅ Good: "Location permission is required to verify you're at the school when signing in. Please enable it in Settings."

### Prevent Accidental Actions

Don't let users:
- Sign in twice without signing out (check for active entry)
- Sign out without signing in (button should be hidden)
- Close app while "getting location" is active (warn them)

### Display Information Clearly

Show staff what they need to know:

```
┌─────────────────────────────────┐
│  Time Tracking                  │
├─────────────────────────────────┤
│                                  │
│  Status: Signed In               │
│  Time: 8:42:15                   │
│  Since: 8:00 AM                  │
│                                  │
│  Location: -25.1234, 28.5678     │
│  (Sunrise Primary School)        │
│                                  │
│  [ Sign Out ]                    │
│                                  │
└─────────────────────────────────┘
```

Clear, at-a-glance information.

## Edge Cases & Real-World Scenarios

### Scenario 1: GPS Fails on Sign In
**Problem**: Staff is indoors, GPS can't get a fix

**Solution**:
1. Show timeout message after 10 seconds
2. Suggest moving outdoors or near a window
3. Allow retry without restarting flow
4. Don't create a partial time entry (all-or-nothing)

### Scenario 2: GPS Fails on Sign Out
**Problem**: Staff worked all day, now GPS won't work to sign out

**Solution Option A** (Strict):
- Don't allow sign out without GPS
- Staff must get GPS working to complete entry
- Ensures data integrity

**Solution Option B** (Lenient):
- Allow sign out with null coordinates
- Mark entry as "incomplete"
- Admin can review and approve later

We'll use **Option A** initially (strict) because:
- If GPS worked for sign in, it should work for sign out
- Staff can move to get signal (they're leaving anyway)
- Maintains data quality

### Scenario 3: Staff Forgets to Sign Out
**Problem**: Staff leaves at 4pm but forgets to tap "Sign Out"

**Solution**: Auto-sign-out after 12 hours
```javascript
// Check active entries older than 12 hours
const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
if (activeEntry && new Date(activeEntry.sign_in_time) < twelveHoursAgo) {
  // Auto sign out with null GPS (admin reviews)
  autoSignOut(activeEntry);
}
```

### Scenario 4: Phone Dies Mid-Shift
**Problem**: Staff signs in, phone battery dies, charges phone, signs out later

**Solution**: Data persists in AsyncStorage
- Sign-in entry is saved immediately
- When phone powers on, active entry is still there
- Staff can sign out normally
- No data loss

### Scenario 5: App Crashes
**Problem**: App crashes while "getting location"

**Solution**:
- Don't create time entry until GPS succeeds
- If app crashes during GPS request, nothing is saved
- When app reopens, no partial data exists
- User can start fresh

## Security & Privacy Considerations

### Data Minimization
We only capture:
- Latitude and longitude (2 numbers)
- Timestamp (when they signed in/out)

We **don't** capture:
- Continuous tracking (not GPS breadcrumbs)
- Home addresses (only sign-in/out at work)
- Movement patterns (no route tracking)

### Transparency
Staff should know:
- Why we're capturing their location (accountability, safety)
- When we're capturing it (only on sign in/out tap)
- Who can see it (admins, for payroll and reporting)
- How it's used (verification, not surveillance)

### Legal Compliance (South Africa)
- POPIA (Protection of Personal Information Act) requires:
  - Consent for location tracking
  - Purpose limitation (only use for stated purpose)
  - Data security (encrypted storage, secure transmission)
  - Right to access (staff can see their own data)

Make sure your employment contracts mention GPS tracking for time verification.

## Testing Time Tracking

### Simulator Testing
iOS Simulator and Android Emulator let you simulate GPS:

**iOS Simulator:**
1. Debug → Location → Custom Location
2. Enter coordinates: -25.1234, 28.5678
3. Test sign in/out with simulated GPS

**Android Emulator:**
1. Extended Controls (three dots) → Location
2. Enter coordinates manually
3. Send location to device

### Real Device Testing
Test in real conditions:
1. **Outdoors**: GPS should work in 2-5 seconds
2. **Indoors near window**: May take 5-10 seconds
3. **Deep indoors**: May timeout (expected)
4. **Offline mode**: Airplane mode, verify local storage works
5. **Sync testing**: Re-enable network, verify upload to Supabase

## Performance Optimization

### Don't Poll GPS
❌ Bad: Update GPS every second while signed in
✅ Good: Get GPS only on sign-in and sign-out taps

Constant GPS polling drains battery. We only need two points: when they arrive and when they leave.

### Cache Last Location
If GPS fails on sign-out, we could use the last-known location from sign-in as a fallback (they're probably still at the school). But this opens the door to abuse, so we don't do it for MVP.

### Background GPS (Future)
For now, we only get GPS when app is open. Future enhancement: background location to verify staff stayed at school (geofencing). But this requires "Always Allow" permission and is more privacy-invasive.

## Key Takeaways

1. **GPS verifies presence** - Not just trust, but documented proof
2. **Medium accuracy (50-100m) is sufficient** - Don't need precise, just "at the school"
3. **Offline-first is critical** - Rural connectivity is unreliable
4. **Two points only** - Sign-in and sign-out, not continuous tracking
5. **Handle failures gracefully** - GPS isn't perfect, but we can work with it
6. **Persistent permission prompts** - Required for the feature to work
7. **Clear feedback** - Loading states, errors, success confirmation

Time tracking with GPS is a powerful accountability tool when done right. It protects both the organization (verifies work) and the staff (proves they were there).

---

**Next**: Let's implement the location service and TimeTrackingScreen!
