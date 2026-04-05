# Masi App - Claude Context

## Project Overview
A React Native mobile application for Masi, a nonprofit, to manage their field staff's work with children, track time, record educational sessions, and children's assessments.

## Documentation Structure
Always consult these key documentation files:
- **PRD.md**: Complete product requirements, tech stack, database schema, feature specifications, and development progress
- **LEARNING.md**: Educational documentation of architectural decisions (**update regularly as you build**)
- **DATABASE_SCHEMA_GUIDE.md**: Detailed database schema reference and design rationale

## Quick Reference

### Navigation
Bottom tabs: Home → My Children → Sessions → Assessments
- Profile accessed via gear icon (⚙️) in Home tab header
- Sign In / Sign Out lives on Home screen (not a dedicated tab)
- Assessments tab contains EGRA Letter Sound Assessment feature
See PRD.md for complete app structure.

## Deployment Status — Multiple App Versions in the Wild

The app launched in early March 2026 and is in its **first two weeks of field testing**. Multiple versions are simultaneously deployed across iOS and Android devices. Users do not update immediately.

**Rule: prefer backwards-compatible changes wherever possible.**

For database schema changes specifically:
- **Safe:** Adding nullable columns, adding new tables, relaxing constraints
- **Risky:** Dropping or renaming columns, tightening constraints, changing column types
- **Pattern:** Add the new column first → deploy the app → drop the old column only after all users have updated

When dropping a column that an older app version still writes, sync will fail with `PGRST204` for every affected record, cascading into FK failures on dependent tables. See migration 07 for an example of the compatibility fix this required.

## Key Implementation Patterns

### Offline Sync Strategy
All writes save locally first (`synced: false`) → background sync upserts to Supabase when online → last-write-wins conflict resolution. See PRD.md and `src/services/offlineSync.js` for full details.

## Known Issues & Testing Watchlist

### Offline Sync — Upsert + RLS Gotcha
PostgreSQL upserts require **SELECT visibility through RLS** to check the unique index — even when no conflict exists. Junction-table-based SELECT policies block upserts if the junction record hasn't synced yet. Fix: add a permissive SELECT policy on a direct column (e.g., `created_by = auth.uid()`). See migration `05_fix_children_select_rls_for_upsert.sql`.

### EAS Builds — Environment Variables Not in `.env.local`
`process.env.EXPO_PUBLIC_*` variables from `.env.local` are NOT available in EAS cloud builds. Public values (Supabase URL, anon key) must also be set in `app.json → extra` with a fallback in the client:
```javascript
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```

### Debugging Tools Available
- **Profile → Export Logs**: captures all `console.log/error/warn` output to a shareable text file
- **Profile → Export Database**: exports full AsyncStorage as JSON (includes sync queue, retry counts, failed items)

---

## Documentation Guidelines

### IMPORTANT: Track Progress and Document Decisions

- **PRD.md → Development Progress**: Add a `- [ ]` checklist when starting multi-step work. Check off items as you go.
- **LEARNING.md** (`documentation/`): After significant architectural decisions or tricky bug fixes, add a narrative section explaining the "why" — written like teaching a junior developer.
- **Always branch** off to a new git branch for features or bug fixes.