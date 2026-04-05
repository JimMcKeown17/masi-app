# Zazi Izandi — Fork Plan

**Status:** Draft — iterating before execution
**Created:** 2026-04-02
**Last Updated:** 2026-04-04

## Context

Masi is a field worker app for Masinyusane's literacy coaches. **Zazi Izandi** is a separate programme that needs its own branded app with the same core features (time tracking, sessions, EGRA assessments, letter tracker, dashboard) but with open registration and a simplified role model. The target is tens of thousands of Education Assistants across South Africa.

This plan covers forking the Masi codebase into a standalone Zazi Izandi app.

---

## Key Architectural Decisions

### Why a clean fork (not shared codebase)?
- Masi and Zazi Izandi will diverge over time (different auth, different roles, different scale)
- A shared codebase adds configuration complexity that isn't justified yet
- If features need to be backported later, cherry-picking is straightforward

### Why the current client architecture scales fine
- "Tens of thousands of users" means many users, not many children per user
- Each EA still manages ~20-100 children → per-device data stays small
- Offline sync per user: <100 records → ~2 min sync (acceptable)
- The **backend** needs to scale (Supabase Pro + connection pooling), not the client

### What fundamentally changes

| Area | Masi | Zazi Izandi |
|------|------|-------------|
| Auth | Admin-created, email/password only | Self-signup, Google + email/password |
| Onboarding | None (profile pre-exists) | Name + school picker on first login |
| Job titles | 4 roles (enum), gates session form | Single role: "Education Assistant" |
| Supabase | Existing project | New project (separate DB, auth, keys) |
| Branding | Masinyusane blue/red/yellow | Zazi Izandi palette (TBD) |
| Bundle ID | org.masinyusane.masi | org.zaziizandi.app (or similar) |
| Scale | ~50 users | Tens of thousands |

---

## Phase 0: Fork & Repository Setup

- [ ] Create new GitHub repo (`zazi-izandi-app`)
- [ ] Clone Masi, remove `.git`, init fresh, push to new remote
- [ ] `npm install && npx expo start` — verify it runs
- [ ] Run `eas init` to get a new EAS project ID
- [ ] Update `package.json` name to `zazi-izandi-app`

**Verification:** App runs identically to Masi in Expo Go.

---

## Phase 1: Rebrand

Replace all Masi/Masinyusane identity. App should look like "Zazi Izandi" with placeholder colors.

### 1a. Config files

**`app.json`:**
- `name` → "Zazi Izandi"
- `slug` → "zazi-izandi-app"
- `scheme` → "zazi-izandi" (deep links, OAuth redirects)
- `icon` → new placeholder asset path
- `bundleIdentifier` (iOS) → "org.zaziizandi.app"
- `package` (Android) → "org.zaziizandi.app"
- `infoPlist` location strings → replace "Masi" with "Zazi Izandi"
- `extra` → clear old Supabase URL/key (replaced in Phase 3)
- `eas.projectId` + `updates.url` → new EAS values

**`eas.json`:** Update `ascAppId`, `appleId`, `serviceAccountKeyPath` as needed.

### 1b. Source code text replacements

| File | What to change |
|------|----------------|
| `src/constants/colors.js` | Comment: "Masinyusane" → "Zazi Izandi" |
| `src/context/AuthContext.js` | `'masi-app://reset-password'` → `'zazi-izandi://reset-password'` |
| `src/screens/auth/LoginScreen.js` | Logo asset path, any "Masi" text |
| `src/screens/main/ProfileScreen.js` | Support text, terms/privacy URLs |
| `src/utils/debugExport.js` | Export filenames: `masi-` → `zazi-izandi-` |
| `App.js` | Comment: "Masinyusane brand colors" |
| `src/constants/literacyConstants.js` | Comment: "Masi paper tracker" |

### 1c. Colors (placeholder until brand provided)

**`src/constants/colors.js`** — swap hex values only, keep structure:
```
primary: '#2563EB'    // placeholder blue
emphasis: '#DC2626'   // placeholder red
accent: '#F59E0B'     // placeholder amber
success: '#16A34A'    // placeholder green
```

Also update hardcoded gradient arrays in:
- `HomeScreen.js` — `GRADIENT` constant
- `LoginScreen.js` — gradient `colors` prop
- `App.js` — ErrorBoundary hardcoded hex values

**Improvement:** Move gradient to `colors.js` as `export const GRADIENT = [...]` so it's defined once.

### 1d. Assets

- Create placeholder `assets/zazi-izandi-icon.png`
- Update `assets/splash-icon.png`
- Remove `assets/masi-mobile-icon.png` and `assets/masi-app-icons/`

**Verification:** `grep -ri "masi\|masinyusane" src/ app.json eas.json package.json` returns zero results. App builds with new name and colors.

---

## Phase 2: Remove Job Title System

All users are "Education Assistant". No role-based routing.

### Files to change

**`src/constants/jobTitles.js`** — replace with:
```javascript
export const JOB_TITLE = 'Education Assistant';
```

**`src/screens/sessions/SessionFormScreen.js`** — remove `job_title` conditional. Always render `<LiteracySessionForm />`.

**`src/screens/main/HomeScreen.js`** — remove `profile?.job_title` from subtitle. Show only school.

**`src/screens/main/ProfileScreen.js`** — remove Job Title row. Change admin text to "To change your school, contact support."

**Verification:** `grep -r "job_title\|JOB_TITLES" src/` returns zero results (except the constant file). Session form always shows Literacy form.

---

## Phase 3: New Supabase Project + Schema

### 3a. Create Supabase project

1. Create project at supabase.com
2. Note URL + anon key
3. Enable Google OAuth provider (requires Google Cloud OAuth credentials)
4. Enable email/password auth (default)
5. Consider disabling email confirmation for frictionless signup
6. Enable "Auto-link" in Auth settings (links Google + email for same address)
7. **Supabase Pro plan** for connection pooling (PgBouncer) — required for scale

### 3b. Schema — consolidated migration

Create `supabase-migrations/00_zazi_izandi_schema.sql` — same as Masi's final state but with:

**`users` table changes:**
```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  school_id UUID REFERENCES schools(id),
  assigned_school TEXT,  -- denormalized school name for display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- No `job_title` column, no enum type
- Added `school_id` FK for proper relational link
- New RLS policy: `"Users can insert own profile" FOR INSERT WITH CHECK (id = auth.uid())`

**All other tables:** Identical to Masi's final state (children, staff_children, groups, children_groups, time_entries, sessions, classes, assessments, letter_mastery). RLS policies unchanged — already user-scoped.

**Schools table:** Same structure. Pre-populate with Zazi Izandi programme schools. Add `BTREE` index on `name` for search filtering.

### 3c. Update app config

Update `app.json` `extra` block with new Supabase URL + anon key. `supabaseClient.js` needs no code changes.

**Verification:** Connect app to new Supabase. Manually create a test user. Verify RLS isolates data.

---

## Phase 4: Authentication — Registration & Google Sign-In

This is the most complex phase. The current app has zero signup capability.

### 4a. New dependencies

```
npx expo install expo-auth-session expo-web-browser expo-crypto
```

### 4b. AuthContext.js — extend (not rewrite)

Add to existing context:
- `signUp(email, password)` — calls `supabase.auth.signUp()`
- `signInWithGoogle()` — Google OAuth via `expo-auth-session` + `supabase.auth.signInWithIdToken()`
- `createProfile({ firstName, lastName, schoolId, schoolName })` — inserts `users` row
- `needsOnboarding` — derived: `!!user && !profile`

The existing `loadUserProfile` already handles "no profile found" (sets `profile` to null). No change needed.

### 4c. Navigation — three-way routing

**`AppNavigator.js`:**
```
if (!user)    → AuthNavigator (Login, SignUp, ForgotPassword)
if (!profile) → OnboardingNavigator (name + school picker)
if (profile)  → MainNavigator (existing tabs + stacks)
```

### 4d. New screens

**`src/screens/auth/SignUpScreen.js`:**
- Email + password registration form
- "Sign up with Google" button
- "Already have an account? Sign In" link
- On success → navigation automatically shows onboarding (no profile yet)

**`src/screens/auth/OnboardingScreen.js`:**
- First name + last name fields
- School picker (searchable list)
- Submit → `createProfile()` → navigation automatically shows main app
- Requires network (cannot work offline — acceptable since signup itself requires network)
- "Sign Out" option for aborting

**`src/components/auth/SchoolPicker.js`:**
- Fetches schools from Supabase (authenticated — user has session by this point)
- Searchable FlatList with TextInput filter
- Handles loading and empty states

### 4e. LoginScreen.js changes

- Add "Sign up with Google" button
- Add "Don't have an account? Sign Up" link
- Keep existing email/password login

### 4f. Edge cases

| Scenario | Handling |
|----------|----------|
| App closed during onboarding | Next launch: `profile === null` → onboarding shown again |
| Offline during onboarding | Show "Connect to internet to continue" + retry button |
| Same email via Google + email signup | Supabase "Auto-link" merges identities |
| Google user has no password | ProfileScreen hides password change section |

**Verification:**
- Email signup → onboarding → main app
- Google signin → onboarding → main app
- Returning user → straight to main app
- Sign out → back to login
- Offline during onboarding → error message + retry

---

## Phase 5: Profile Screen Updates

- Remove Job Title row
- Change "Assigned School" label to "School"
- Remove "managed by administrators" text
- Hide password change for Google-only users (`user.app_metadata.provider === 'google'`)

---

## Phase 6: Polish & Scale Verification

- [ ] `grep -ri "masi\|masinyusane"` across entire codebase → zero results
- [ ] Full signup → onboarding → features → sync flow works
- [ ] Google sign-in works on both iOS and Android
- [ ] RLS isolation: user A cannot see user B's data
- [ ] School picker works with 500+ schools
- [ ] Supabase Pro plan active with connection pooling
- [ ] Update documentation (CLAUDE.md, README, etc.)

---

## Files Summary

### New files to create

| File | Purpose |
|------|---------|
| `src/screens/auth/SignUpScreen.js` | Email/password registration |
| `src/screens/auth/OnboardingScreen.js` | Name + school picker |
| `src/components/auth/SchoolPicker.js` | Searchable school list |
| `supabase-migrations/00_zazi_izandi_schema.sql` | Consolidated schema |
| `assets/zazi-izandi-icon.png` | Placeholder app icon |

### Files to modify

| File | Phase | Changes |
|------|-------|---------|
| `app.json` | 1, 3 | Name, slug, scheme, bundle IDs, Supabase config |
| `eas.json` | 1 | Submission config |
| `package.json` | 1, 4 | Name, new dependencies |
| `src/constants/colors.js` | 1 | Placeholder brand colors, add GRADIENT export |
| `src/constants/jobTitles.js` | 2 | Simplify to single constant |
| `src/context/AuthContext.js` | 4 | Add signUp, signInWithGoogle, createProfile, needsOnboarding |
| `src/navigation/AppNavigator.js` | 4 | Three-way routing |
| `src/screens/auth/LoginScreen.js` | 1, 4 | Rebrand + Google button + signup link |
| `src/screens/sessions/SessionFormScreen.js` | 2 | Always render LiteracySessionForm |
| `src/screens/main/HomeScreen.js` | 1, 2 | Colors, remove job_title |
| `src/screens/main/ProfileScreen.js` | 1, 2, 5 | Rebrand, remove job_title, hide password for Google users |
| `src/utils/debugExport.js` | 1 | Rename export filenames |
| `App.js` | 1 | Rebrand, update hardcoded colors |

---

## Risk Areas

1. **Google OAuth in Expo** — historically tricky. Use `expo-auth-session` + `signInWithIdToken`. Test early on real devices. Email/password is the reliable fallback.
2. **Onboarding state** — `user && !profile` is clean but touches core auth flow. The three-way navigation split isolates the complexity.
3. **Offline during onboarding** — acceptable limitation since signup itself requires network.
4. **Hardcoded colors** — grep thoroughly. Centralizing GRADIENT in `colors.js` prevents future drift.
5. **Supabase scale** — Pro plan with PgBouncer is essential. Free tier connection limits will fail at thousands of concurrent users.

## Execution Order

Phases 0-2 can be done quickly (fork + rebrand + simplify roles). Phase 3 (Supabase) can run in parallel. Phase 4 (auth) is the most complex and depends on Phase 3. Phase 5-6 are polish.

Recommended: **Do Phases 0-2 first** to get a running Zazi Izandi app ASAP (even if it still uses Masi's Supabase temporarily), then tackle auth and Supabase migration.

---

## Appendix: PowerSync Consideration

### Should Zazi Izandi use PowerSync instead of the hand-rolled sync?

**What PowerSync replaces:**
The current Masi app has three hand-rolled layers for offline sync:
1. `storage.js` — AsyncStorage wrapper (loads ALL records into memory, JSON serialization)
2. `offlineSync.js` — single-threaded upsert loop (1 record/sec, basic retry, no batching)
3. `OfflineContext.js` — sync lifecycle management (30s polling, foreground triggers)

PowerSync replaces **all three** with a single SDK using **SQLite** locally (not AsyncStorage) with automatic sync, conflict resolution, background sync, and batch operations.

### Comparison

| Feature | Current (Hand-rolled) | PowerSync |
|---------|----------------------|-----------|
| Local storage | AsyncStorage (JSON blobs) | SQLite (queryable, indexed) |
| Sync speed | ~1 record/sec (sequential) | Batched, parallel |
| Background sync | None | Expo background task support |
| Conflict resolution | Last-write-wins (basic) | Configurable rules |
| Partial sync | All records per user | Sync rules define what each user gets |
| Query capability | Load all → Array.filter() | SQL queries with WHERE, JOIN, etc. |
| Scale | Works for <100 records | Designed for thousands |
| Dependency | None (custom code) | PowerSync service ($49+/mo) |

### Pricing (as of 2026)

- ~$51/month for 5,000 Daily Active Users (50K installs)
- ~$399/month for 100,000 DAU (1M installs)
- Free self-hosted option available (source-available)

### Recommendation

**For Zazi Izandi: Strongly worth considering.** The timing is ideal:
- Clean fork = no migration burden from existing AsyncStorage
- Scale target (tens of thousands) demands robust sync
- Current sync is the most fragile part of the Masi codebase
- PowerSync + Supabase has first-class integration

**For Masi: Keep the current sync.** It works fine at Masi's scale (~50 users).

### Impact on this plan

If adopting PowerSync, insert a **"Phase 3.5: Replace sync with PowerSync"** between the Supabase setup and auth phases:
- Set up PowerSync project linked to new Supabase
- Define sync rules (what data each user gets)
- Replace `storage.js`, `offlineSync.js`, `OfflineContext.js` with PowerSync SDK
- Update all contexts/screens to use SQLite queries via PowerSync
- **Note:** Requires Expo development builds (no Expo Go) — Masi already uses dev builds

### Decision needed

Adopting PowerSync is a significant commitment — it rewrites the entire data layer. The benefit is a production-grade sync engine. The cost is development time and a service dependency. This decision should be made before starting Phase 3.

### References

- [PowerSync + Supabase Integration Guide](https://docs.powersync.com/integration-guides/supabase)
- [PowerSync React Native & Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo)
- [PowerSync Pricing](https://www.powersync.com/pricing)
- [Background Sync with Expo + PowerSync](https://www.powersync.com/blog/keep-background-apps-fresh-with-expo-background-tasks-and-powersync)
- [PowerSync on Supabase Partners](https://supabase.com/partners/integrations/powersync)
