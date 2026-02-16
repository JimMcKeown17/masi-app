# Masi App - Claude Context

## Project Overview
A React Native mobile application for Masi, a nonprofit, to manage their field staff's work with children, track time, and record educational sessions.

## Documentation Structure
Always consult these key documentation files:
- **PRD.md**: Complete product requirements, tech stack, database schema, and feature specifications
- **PROGRESS.md**: Development progress tracker and phase completion status
- **LEARNING.md**: Educational documentation of architectural decisions (**update regularly as you build**)
- **DATABASE_SCHEMA_GUIDE.md**: Detailed database schema reference and design rationale

## Quick Reference

### Tech Stack
React Native (Expo) + JavaScript + Supabase + React Native Paper + AsyncStorage
See PRD.md for complete tech stack details.

### Database Schema
Core tables: `users`, `children`, `groups`, `children_groups`, `time_entries`, `sessions`
See DATABASE_SCHEMA_GUIDE.md for complete schema with explanations.

### Navigation
Bottom tabs: Home → My Children → Sessions → Assessments
- Profile accessed via gear icon (⚙️) in Home tab header
- Sign In / Sign Out lives on Home screen (not a dedicated tab)
- Time tab removed; Assessments tab added as placeholder for future phase
See PRD.md for complete app structure.

## Key Implementation Patterns

### Offline Sync Strategy
```
User Action → AsyncStorage (synced: false) → UI Update → Sync Queue → Supabase → Update synced flag
```
- All writes save locally first with `synced: false`
- Background service processes unsynced items when online
- Retry failed syncs with exponential backoff
- Last-write-wins conflict resolution

See PRD.md for complete sync architecture details.

### Session Form Routing (Job-Title Based)
```javascript
const SessionFormScreen = () => {
  const { user } = useAuth();

  const renderForm = () => {
    switch(user.job_title) {
      case 'Literacy Coach':
        return <LiteracySessionForm />;
      case 'Numeracy Coach':
        return <NumeracySessionForm />;
      case 'ZZ Coach':
        return <ZZCoachSessionForm />;
      case 'Yeboneer':
        return <YeboneerSessionForm />;
      default:
        return <BaseSessionForm />;
    }
  };

  return renderForm();
};
```

### Time Tracking Flow
1. Check AsyncStorage for active time entry (sign_out_time IS NULL)
2. If not signed in: Show "Sign In" button
3. On sign in: Request location → Capture coordinates → Save locally → Update UI
4. If signed in: Show "Sign Out" button + elapsed time
5. On sign out: Capture coordinates → Update entry → Calculate hours

## Known Issues & Testing Watchlist

### Offline Sync — RLS Fields Must Be Set in the App
**Problem found in field testing (Feb 2026):** Child records were failing to sync with Postgres error `42501` ("new row violates row-level security policy").

**Root cause:** The RLS INSERT policy on `children` requires `created_by = auth.uid()`. When the sync sends a record without `created_by` set, Supabase rejects it — even though a trigger exists to auto-set the field. The trigger fires *after* the RLS check, so it never gets the chance to help.

**Fix:** Always set `created_by: user.id` in `ChildrenContext.js` when building the child object locally (line ~76).

**Watch for this pattern** whenever a new RLS policy references a field: ensure the app sets that field explicitly before saving to AsyncStorage, not relying on triggers to fill it in at sync time.

**Cascade effect:** When a `children` record fails to sync, the `staff_children` assignment also fails with error `23503` (FK violation) because the parent row doesn't exist yet. One root cause = two error messages.

### EAS Builds — Environment Variables Not in `.env.local`
`process.env.EXPO_PUBLIC_*` variables from `.env.local` are NOT available in EAS cloud builds. Public values (Supabase URL, anon key) must also be set in `app.json → extra` with a fallback in the client:
```javascript
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```

### Debugging Tools Available
- **Profile → Export Logs**: captures all `console.log/error/warn` output to a shareable text file
- **Profile → Export Database**: exports full AsyncStorage as JSON (includes sync queue, retry counts, failed items)
- Ask testers to share logs via WhatsApp/email when reporting sync issues

---

## Documentation Guidelines

### IMPORTANT: Update LEARNING.md as You Build

**LEARNING.md** is an educational document explaining the "why" behind architectural decisions.

**When to update**:
- After significant architectural decisions
- When implementing complex features (offline sync, geolocation, etc.)
- After solving difficult technical problems
- When choosing between multiple approaches (explain trade-offs)

**What to include**:
- The problem we're addressing
- The decision/pattern we chose and **why**
- What we considered but didn't choose
- Code examples showing the pattern
- Lessons learned for other developers

**Style**: Write narratively, like teaching a junior developer. Use analogies and real-world examples.

**Remember**: LEARNING.md is a teaching tool, not a changelog. Focus on transferable principles.
