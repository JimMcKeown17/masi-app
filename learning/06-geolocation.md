# Chapter 6: Geolocation - Balancing Accuracy and Battery

## The Location Tracking Requirement

Time tracking needs to capture staff location to verify they're at the school.

**Three accuracy levels**:
1. **Low (100-1000m)**: City-level, uses cell towers, minimal battery
2. **Medium (50-100m)**: Neighborhood-level, uses Wi-Fi + GPS, balanced
3. **High (10-50m)**: Precise GPS, drains battery significantly

**Decision**: Medium accuracy (50-100m)

**Why?**
- **Good enough**: Can identify which school in a district
- **Battery conscious**: Staff may be in field all day
- **Faster**: Locks onto location in 2-3 seconds vs 10+ for high accuracy
- **Reliable**: Works even with partial GPS signal

**Implementation with expo-location**:
```javascript
import * as Location from 'expo-location';

const options = {
  accuracy: Location.Accuracy.Balanced,  // Medium accuracy
  timeout: 10000,  // 10 second timeout
  maximumAge: 0     // Don't use cached location
};

const location = await Location.getCurrentPositionAsync(options);
```

## Permission Handling

**Decision**: Require location permission for time tracking, persistent prompts

**Flow**:
1. User taps "Sign In"
2. Check if location permission granted
3. If not granted:
   - Show custom prompt explaining why we need it
   - Request permission
   - If denied, show prompt again (loop until granted)
4. Only proceed with sign-in once permission granted

**Why persistent prompts?**
- Location is **required** for time tracking (not optional)
- Without it, time entry is incomplete/invalid
- Better to block than create bad data

**User-friendly approach**:
- Explain clearly: "We need your location to verify you're at the school"
- Show example: "This helps ensure accurate timesheets"
- Make it easy: Big "Grant Permission" button

---

**Last Updated**: 2026-01-27
