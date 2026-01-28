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
Bottom tabs: Home (with profile link) → Time → Children → Sessions
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
