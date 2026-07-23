# Masi App: Deployment Guide

Quick reference for deploying the SQLite pilot to an isolated tester cohort.

---

## Current Release Path: SQLite Pilot Only

Do not use the old `production --submit` workflow while the legacy field cohort
and SQLite pilot coexist. The `production` submit profile has deliberately been
removed from `eas.json`, so the repository cannot automatically send an Android
build to the field cohort's existing Play internal track.

Build the two store artifacts without auto-submission:

```bash
npx eas-cli@latest build -p android --profile pilot
npx eas-cli@latest build -p ios --profile pilot
```

Then distribute each exact artifact:

- Android: download the AAB for that build and manually upload it to a new
  closed Play testing track, such as `SQLite pilot`. Never use the existing
  internal track.
- iOS: submit the exact iOS build ID with the pilot submit profile:

```bash
npx eas-cli@latest submit -p ios --profile pilot --id <IOS_BUILD_ID>
```

Before the iOS upload, confirm the existing field TestFlight group does not
have automatic distribution enabled. After processing, add the build only to a
new SQLite pilot group. Do not use `--latest`: selecting the build by ID avoids
submitting the wrong artifact when preview and pilot builds coexist.

---

## SQLite Pilot (1.3.0): Keep It Away From the Field Cohort

The field cohort still runs the legacy AsyncStorage app, delivered through the
**Play internal testing track** and the **existing TestFlight group**. Depending
on their Play and TestFlight settings, those testers may receive newly released
builds automatically. Until the deliberate cutover, the SQLite build must never
be released into either audience. There is no legacy-data migration: a field
device that updates to the SQLite build loses its unsynced data and switches
backends.

Rules while the pilot and the field cohort coexist:

- **Never** upload the 1.3.0 SQLite build to the Play **internal testing**
  track, and never build or submit the SQLite pilot with `--profile production`.
- Android pilot: build with `--profile pilot` (AAB, preview/SQLite environment),
  then upload **manually** in Play Console to a **new closed testing track**
  (for example, "SQLite pilot") whose tester list contains only pilot testers.
- iOS pilot: build with `--profile pilot` (store-signed), submit the exact build
  ID with `--profile pilot`, then in App Store Connect add the build **only** to
  a new pilot TestFlight group. First confirm the field cohort's existing group
  does not automatically receive new builds.
- OTA isolation: pilot builds are on update channel `preview`
  (`eas update --channel preview --environment preview`). The field cohort's
  channel `production` at runtime 1.1.x/1.2.x is untouched; runtime `1.3.0`
  cannot land on legacy binaries either way.
- Sentry: pilot builds report `environment=preview`, keeping pilot noise out of
  the future production stream.

---

## Do I Need a New Build or Just an OTA Update?

| What changed? | What to do |
|---|---|
| JavaScript only (screens, logic, styles) | `eas update` — instant OTA, no build needed |
| Added/removed/upgraded a native package (`expo-location`, etc.) | Full `eas build` + `eas submit` |
| Changed `app.json` native config (permissions, bundle ID, plugins) | Full `eas build` + `eas submit` |
| Changed `eas.json` build profiles | Full `eas build` + `eas submit` |
| Database/Supabase migrations only (no app code) | No app deploy needed — apply migration in Supabase dashboard |

**Rule of thumb:** If you only touched `.js` files inside `src/` or your top-level component files, an OTA update is enough. If you ran `npx expo install` for a new package, you need a build.

---

## OTA Updates (EAS Update)

OTA (over-the-air) updates let you push JS-only changes in ~30 seconds without a full native build or store submission. This is configured and ready to use.

### How It Works

- `expo-updates` is installed and configured in `app.json`
- The production build profile in `eas.json` has `channel: "production"`
- The `runtimeVersion` uses the `appVersion` policy — OTA updates only apply to builds with a matching `expo.version` (currently `1.3.0` on the field-pilot release branch)
- Updates are checked on app launch and applied on the *next* launch (users don't see a loading screen)

### Pushing an OTA Update

```bash
npx eas-cli@latest update --channel production --environment production --message "describe what changed"
npx eas-cli@latest env:exec --environment production 'npm run sentry:sourcemaps'
```

The first command leaves the exported bundle in `dist/`. The second uploads the
matching source maps to Sentry using the sensitive `SENTRY_AUTH_TOKEN` stored in
the production EAS environment. Do not consider the OTA release complete if the
source-map upload fails: events would arrive, but production stack traces could
remain minified and much less actionable.

### How Runtime Versions Work

When you bump `expo.version` (e.g., `1.1.0` → `1.2.0`), the runtime version changes too. This means:
- OTA updates pushed for `1.2.0` will NOT apply to builds made at `1.1.0`
- You need a full native build after bumping the marketing version
- This is a safety feature, but a partial one: it separates *marketing versions*, not native fingerprints. Two binaries built at the same `expo.version` share a runtime even if their native modules differ, so every native dependency/config change MUST come with a version bump or OTA can deliver JS that assumes native code the installed binary lacks. There is also no guard yet for an OTA *rollback* landing an older bundle on a device whose local SQLite schema is newer (`user_version` > the bundle's `CURRENT_SCHEMA_VERSION`); harmless while migrations stay additive, tracked as audit finding #21 in `documentation/codebase-audit-2026-07-12.md`

### First Time Setup (already done)

For reference, here's what was configured:
1. Installed `expo-updates` via `npx expo install expo-updates`
2. Added `runtimeVersion` and `updates` URL to `app.json`
3. Added `channel: "production"` to the production profile in `eas.json`
4. **Still needed:** One full native build per platform to bake in the update client (see next section)

> **Important:** The first build after this setup MUST be a full native build (`eas build`). After that, JS-only changes can use `eas update`.

---

## Sentry Crash and Sync Observability

Sentry is wired into native iOS/Android crashes, JavaScript exceptions, React
render failures, app hangs/watchdog terminations, and failed requests. Masi also
reports domain failures which do not crash: skipped sync passes, sync preflight
errors, retriable records, terminal outbox rows, and pull-reconcile circuit
breakers.

Every event is tagged with the installed app version/build, physical device and
OS, Expo Update identity/channel/runtime, current backend target/project, SQLite
schema version, signed-in user, and current navigation route where available.
The seven-day local diagnostic log remains independent of Sentry and is never
forwarded as cloud breadcrumbs. This preserves detailed, user-controlled support
exports without uploading arbitrary console output from a field device.

The initial field-release privacy posture is deliberately strict: Session Replay,
automatic screenshots, view-hierarchy attachments, and default PII collection are
disabled. Sentry user correlation contains only the internal staff UUID, never an
email address or profile name. Relaxing any of these settings requires a separate
privacy review and physical-device redaction test.

### Required Sentry and EAS setup

Create a Sentry React Native project, then record its organization slug, project
slug, DSN, and organization auth token. In Expo project settings, add these five
variables to both the `preview` and `production` environments:

| Variable | EAS visibility | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | Plain text | Public event-ingestion address bundled into the app |
| `EXPO_PUBLIC_SENTRY_ENVIRONMENT` | Plain text | `preview` or `production`, keeping release-candidate and field events separate |
| `SENTRY_ORG` | Plain text | Sentry organization slug used by the Expo config plugin |
| `SENTRY_PROJECT` | Plain text | Sentry project slug used by the Expo config plugin |
| `SENTRY_AUTH_TOKEN` | Sensitive | Authenticates native and JavaScript source-map uploads |

Do not commit `SENTRY_AUTH_TOKEN` or place it in `.env.local`. Prefer the EAS
dashboard for creating it so the value does not enter shell history. The DSN is
not a secret. `app.config.js` deliberately leaves Sentry disabled when the DSN
is absent and omits the source-map plugin when the organization/project slugs
are absent, so ordinary local development remains usable.

Set alert rules in Sentry for at least:

- every new issue and regression;
- any issue tagged `sync_state=preflight_failed`, `terminal`, or
  `reconcile_breaker`;
- a rising count of `sync_state=retriable_failures`;
- crash-free session degradation and app-hang regressions.

The Sentry SDK is a new native dependency. The first release containing it must
increment the app version/runtime and use a full iOS and Android build. It cannot
be shipped safely as an OTA update to binaries which do not contain the SDK.

### Release verification

1. Confirm the build logs show successful Sentry source-map upload.
2. Install the preview or production binary on a physical device.
3. Open Profile, then choose **Test Crash Reporting** under Debug & Support.
4. Confirm a handled `Masi observability test error` arrives in Sentry with
   `observability_test=true`.
5. Confirm the stack is symbolicated and the event contains app build, device,
   Expo Update, backend, SQLite schema, user, and route context.
6. Create or use a disposable failed sync row and confirm the corresponding
   structured sync issue arrives without crashing the app.
7. Export Logs and Export Database from Profile and confirm the same runtime
   identity appears in the local support package.

For EAS Build, source-map upload is automatic when the token and plugin values
are present. For every EAS Update, run the separate `sentry:sourcemaps` command
shown above against the generated `dist/` directory.

---

## Step-by-Step: Build and Distribute the SQLite Pilot

### Prerequisites (one-time setup)

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account
eas login

# Verify credentials are set up
eas credentials -p ios
eas credentials -p android
```

### iOS: Build and Upload to TestFlight

```bash
npx eas-cli@latest build -p ios --profile pilot
npx eas-cli@latest submit -p ios --profile pilot --id <IOS_BUILD_ID>
```

The pilot submit profile already contains the Apple ID and App Store Connect app
ID. Selecting the exact build ID is mandatory. After App Store Connect finishes
processing the build, add it only to the SQLite pilot TestFlight group.

Apple can automatically add uploaded builds to internal groups that have
automatic distribution enabled. Confirm that the existing field group has that
setting disabled before uploading this pilot build.

### Android: Build and Manually Upload to a Closed Track

```bash
npx eas-cli@latest build -p android --profile pilot
```

Download that build's AAB from EAS. In Play Console, create or select a new
closed testing track dedicated to the SQLite pilot, verify its tester list, and
upload the AAB manually. Do not use EAS Submit for Android during the pilot.

There is intentionally no Android submit profile in `eas.json`. This prevents a
pilot artifact from inheriting the old field cohort's internal-track submission
settings.

---

## Version Management

### What's automatic

- **Build numbers** (iOS `buildNumber`, Android `versionCode`): Auto-incremented by EAS on each build. Never touch these manually.
- **Version source**: Set to `"remote"` in `eas.json` — EAS tracks the latest build number server-side.

### What you control

- **Marketing version** (`expo.version` in `app.config.js`): Currently `1.3.0` on the field-pilot release branch. Bump this when you want users to see a new version number.

```bash
# Check current remote versions
npx eas-cli@latest build:version:get
```

### When to bump the marketing version

- Adding a significant feature (e.g., new tab, new assessment type) → bump minor: `1.1.0` → `1.2.0`
- Bug fixes and small improvements → keep the same version or bump patch: `1.1.0` → `1.1.1`
- Breaking changes or major redesign → bump major: `1.1.0` → `2.0.0`

---

## Monitoring Builds

```bash
# List recent builds
npx eas-cli@latest build:list

# Check a specific build's status
npx eas-cli@latest build:view

# List submissions
npx eas-cli@latest submit:list

# View logs for a failed build
# (use the URL printed by eas build:list)
```

---

## Backwards Compatibility Reminder

Multiple app versions are in the wild. When deploying:

1. **Database changes**: Add nullable columns first → deploy app → drop old columns only after all users update
2. **API changes**: Old app versions will keep calling old endpoints/shapes until users update
3. **TestFlight/Play Store**: Users don't auto-update immediately. Expect 1–2 weeks of mixed versions.

See CLAUDE.md "Deployment Status" section for full details on backwards-compatible migration patterns.

---

## Recovery Recipes

### Un-hiding a soft-deleted child (`hidden_at`)

Children "deleted" by field staff are soft-deleted via `children.hidden_at` — the row stays in Supabase with a timestamp set, and is filtered out of every staff member's list and stats. To restore one to the active list:

1. Identify the child's id via Supabase Studio → Table Editor → `children`. (Or look it up by name from the audit query below.)
2. Run:
   ```sql
   UPDATE children SET hidden_at = NULL WHERE id = '<child-id>';
   ```
3. The next time the affected staff member's app pulls (foreground, login, or pull-to-refresh), the child reappears in their list and stats. No app restart required.

To list all currently hidden children for an audit:

```sql
SELECT c.id, c.first_name, c.last_name, c.hidden_at, sc.staff_id
FROM children c
LEFT JOIN staff_children sc ON sc.child_id = c.id
WHERE c.hidden_at IS NOT NULL
ORDER BY c.hidden_at DESC;
```

### One-time cleanup after the soft-delete OTA

Any child a tester "deleted" on a pre-fix build still exists in Supabase with no tombstone. After the soft-delete OTA ships, those children reappear once on the affected device's next sync — they need to be re-hidden using the now-working flow. This is a one-time cleanup burden for affected staff members; communicate it in the OTA release notes.

---

## Current State (as of July 2026)

| Audience | App | Version | Backend | Distribution |
|---|---|---|---|---|
| Field cohort | Legacy AsyncStorage app | 1.2.x | `masi-app` (legacy) | TestFlight group + Play internal track (do not touch) |
| SQLite pilot cohort | SQLite app (`release/1.3.0-preview`) | 1.3.0 | `masi-app-sqlite` | `pilot` profile → new closed Play track + new TestFlight group |

OTA updates are live per channel: `production` serves the legacy field builds,
`preview` serves the SQLite pilot store builds. Runtime versions (1.2.x vs
1.3.0) prevent cross-delivery even on a mistaken channel.

---

## Troubleshooting

### "No suitable application records found" (iOS)
The app must exist in App Store Connect. Verify bundle ID matches: `org.masinyusane.masi`

### "The bundle version must be higher" (iOS)
Should not happen with `autoIncrement: true`. If it does: `npx eas-cli@latest build:version:set -p ios`

### "App not found" (Android)
The app must exist in Google Play Console with package `org.masinyusane.masi`.

### "Service account lacks permission" (Android)
Check Play Console → Setup → API access → verify the service account has "Release to production" or at minimum "Release to testing tracks" permission.

### Build succeeds but submit fails
For iOS, rerun the pilot submission against the exact build ID to see the
specific error:
```bash
npx eas-cli@latest submit -p ios --profile pilot --id <IOS_BUILD_ID>
```

Android pilot uploads are manual in Play Console. Do not substitute an EAS
Submit command.

### Environment variables missing in build
Public values (Supabase URL and publishable key) are selected through the pilot
profile and exposed through `app.config.js`; `.env.local` is not available to
EAS cloud builds. See AGENTS.md "EAS Builds" section.
