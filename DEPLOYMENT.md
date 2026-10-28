# Masi App: Deployment Guide

Quick reference for building and distributing the SQLite app.

---

## Current Release Path

**No field cohort runs the app today (Jim, 2026-10-28).** The 1.4.0 pilot builds
(iOS 25, Android 54, from `main` `dffe22c`) are the starting point: every later
TestFlight build and Play download starts from them. Masi's EAs retest the app
from November 2026.

One command builds both store artifacts and submits each one:

```bash
npx eas-cli@26.0.0 build --platform all --profile pilot --auto-submit
```

- **Android:** EAS Submit uploads the AAB to the Play **internal testing** track
  and releases it at once (`releaseStatus: completed` in `eas.json`), so testers
  get it within minutes with no Google review. Internal testing allows up to 100
  testers. It uses the `eas-submit-masi` key stored on EAS (one-time setup
  below); build 54 was the first automatic submission, on 2026-10-28.
- **iOS:** EAS Submit uploads the build to App Store Connect with the API key
  stored on EAS. Once Apple has processed it, the build reaches every TestFlight
  internal group with automatic distribution switched on. Testers outside the App
  Store Connect team are external testers: add the build to their group in App
  Store Connect. The first build of each new version goes through Beta App Review.

To submit a build that already exists, name it by ID. Never use `--latest`: it can
pick a `preview` or `preview-content` build instead of the store build.

```bash
npx eas-cli@26.0.0 submit -p android --profile pilot --id <ANDROID_BUILD_ID>
npx eas-cli@26.0.0 submit -p ios --profile pilot --id <IOS_BUILD_ID>
```

Pin `eas-cli` to a version published at least 24 hours earlier, per the
repository's package-age rule (check with `npm view eas-cli time`); `@latest` can
fetch a version published minutes ago. The 2026-10-28 pilot used 26.0.0.

---

## Release Rules

- Store builds use `--profile pilot` until the field launch. The `production`
  profile is kept for that launch: it has its own update channel and Sentry
  environment, and no submit profile.
- A phone that still has the legacy AsyncStorage app (1.2.x, `masi-app` backend)
  switches backends when it installs the SQLite app; there is no legacy-data
  migration, so anything it had not synced stays behind. Nobody uses the legacy
  app today.
- OTA: store builds are on update channel `preview`
  (`eas update --channel preview --environment preview`). SQLite runtimes
  (`1.3.0` and later) cannot land on legacy binaries, which use channel
  `production` at runtime 1.1.x/1.2.x.
- Preview content: never set `MASI_PREVIEW_CONTENT` in an EAS environment.
  Pilot and production builds refuse `MASI_PREVIEW_CONTENT=1`. Phones on field
  update channels (`preview` and `production`) ignore it even if an OTA carries
  the setting. Test builds that need candidate words use `--profile preview-content`
  (internal Android APK, with no update channel).
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
- Store builds (`pilot` profile) listen on channel `preview`; the `production` profile's channel `production` is for the field launch
- The `runtimeVersion` uses the `appVersion` policy — OTA updates only apply to builds with a matching `expo.version` (currently `1.4.0` on `main`)
- Updates are checked on app launch and applied on the *next* launch (users don't see a loading screen)

### Pushing an OTA Update

```bash
npx eas-cli@26.0.0 update --channel preview --environment preview --message "describe what changed"
npx eas-cli@26.0.0 env:exec --environment preview 'npm run sentry:sourcemaps'
```

After the field launch, use `production` for both the channel and the environment.
The first command leaves the exported bundle in `dist/`. The second uploads the
matching source maps to Sentry using the sensitive `SENTRY_AUTH_TOKEN` stored in
the same EAS environment. Do not consider the OTA release complete if the
source-map upload fails: events would arrive, but production stack traces could
remain minified and much less actionable.

### How Runtime Versions Work

When you bump `expo.version` (e.g., `1.1.0` → `1.2.0`), the runtime version changes too. This means:
- OTA updates pushed for `1.2.0` will NOT apply to builds made at `1.1.0`
- You need a full native build after bumping the marketing version
- This is a safety feature, but a partial one: it separates *marketing versions*, not native fingerprints. Two binaries built at the same `expo.version` share a runtime even if their native modules differ, so every native dependency/config change MUST come with a version bump or OTA can deliver JS that assumes native code the installed binary lacks. There is also no guard yet for an OTA *rollback* landing an older bundle on a device whose local SQLite schema is newer (`user_version` > the bundle's `CURRENT_SCHEMA_VERSION`); harmless while migrations stay additive, tracked as audit finding #21 in `documentation/archive/codebase-audit-2026-07-12.md`

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

## Step-by-Step: Build and Distribute Store Builds

### One-time setup

- **EAS login:** `npx eas-cli@26.0.0 login` (account `jimmckeown`). Check with
  `npx eas-cli@26.0.0 whoami`.
- **iOS:** the App Store Connect API key is stored on EAS. EAS Submit used it
  without a login prompt on 2026-10-28.
- **Android: Google Play service account `eas-submit-masi`** (Jim; only the Play
  Console owner can grant access). Each app gets its own service account, all in
  the Google Cloud project `masinyusane-play-publishing`, next to Zazi iZandi's
  `eas-submit-zazi`. Do not reuse another app's account: a service account's
  email cannot be renamed, so Masi releases would carry the other app's name in
  Play's records, and revoking it would cut off both apps. That project already
  has the Google Play Android Developer API turned on (Zazi submits through it).
  1. Google Cloud Console, project `masinyusane-play-publishing` → **IAM &
     Admin** → **Service Accounts** → **Create service account**. Name
     `eas-submit-masi`, description `EAS Submit — Masi Android releases`. Skip
     the "Grant this service account access to project" step (permissions are
     granted in Play Console) → **Done**.
  2. Click `eas-submit-masi` → **Keys** → **Add key** → **Create new key** →
     **JSON** → **Create**. The file downloads; Google never shows it again.
  3. Play Console → **Users and permissions** → **Invite new users** →
     `eas-submit-masi@masinyusane-play-publishing.iam.gserviceaccount.com` →
     **App permissions** → **Add app** → Masi. Grant the same set as
     `eas-submit-zazi`: **View app information (read-only)**, **Release apps to
     testing tracks**, **Manage testing tracks and edit tester lists**, and
     **Release to production, exclude devices, and use Play App Signing**. Play
     adds three read-only and policy permissions itself. Nothing account-wide,
     and no admin, financial or store presence permissions. Production is
     granted now so the field launch cannot fail on a permission error. It
     cannot publish by accident: the `pilot` profile pins `internal`, and
     `eas.json` has no production submit profile. Click **Apply**, then
     **Invite user**. These are two separate actions; Apply alone sends no
     invite.
  4. From the `masi-app` folder (EAS finds the app through `app.config.js`;
     anywhere else it fails with "Run this command inside a project
     directory"): `npx eas-cli@26.0.0 credentials -p android` → profile
     `pilot` → **Google Service Account** → **Manage your Google Service Account
     Key for Play Store Submissions** → **Set up a Google Service Account Key for
     Play Store Submissions** → **[Upload a new service account key]** → the
     JSON file.
     EAS keeps keys per Expo account, so it also offers **[Choose an existing
     key]**, which lists Zazi's key; do not pick it. Then delete the downloaded
     JSON file.
  - Never commit a key file, and never add `serviceAccountKeyPath` to `eas.json`
    (`releaseGateConfig.test.js` pins the Android submit profile exactly).
  - Rotation: Cloud Console → `eas-submit-masi` → **Keys** → delete the old key,
    create a new one (step 2), upload it (step 4). The Play permissions stay.
- **Play testers:** Play Console → **Testing** → **Internal testing** →
  **Testers**. Add the testers' Google accounts (up to 100) and send them the
  opt-in link.

### Build and submit both platforms

```bash
npx eas-cli@26.0.0 build --platform all --profile pilot --auto-submit
```

The submit profile `pilot` holds the App Store Connect app ID and Apple ID for
iOS, and `track: internal`, `releaseStatus: completed` for Android. Builds and
submissions can be followed on the EAS dashboard or with `build:list` and
`submit:list` (below). After Apple processes the iOS build, add it to any
external TestFlight group that should have it.

---

## Version Management

### What's automatic

- **Build numbers** (iOS `buildNumber`, Android `versionCode`): Auto-incremented by EAS on each build. Never touch these manually.
- **Version source**: Set to `"remote"` in `eas.json` — EAS tracks the latest build number server-side.

### What you control

- **Marketing version** (`expo.version` in `app.config.js`): Currently `1.4.0` on `main`. Bump this when you want users to see a new version number, and always when native code changes (see below).

```bash
# Check current remote versions
npx eas-cli@26.0.0 build:version:get
```

### When to bump the marketing version

- Adding a significant feature (e.g., new tab, new assessment type) → bump minor: `1.1.0` → `1.2.0`
- Bug fixes and small improvements → keep the same version or bump patch: `1.1.0` → `1.1.1`
- Breaking changes or major redesign → bump major: `1.1.0` → `2.0.0`
- **Any native change** (adding, removing or upgrading a native package, a config plugin, or native config such as icons or permissions) → bump at least minor before the next store build. This one is required, not a judgement call: the version is the OTA runtime boundary, so two binaries with different native code must never share it. Example: 1.4.0 followed the July 1.3.0 pilot after `expo-font`, `expo-splash-screen`, the iOS icon and the Android backup plugin landed.

---

## Monitoring Builds

```bash
# List recent builds
npx eas-cli@26.0.0 build:list

# Check a specific build's status
npx eas-cli@26.0.0 build:view

# List submissions
npx eas-cli@26.0.0 submit:list

# View logs for a failed build
# (use the URL printed by eas build:list)
```

---

## Backwards Compatibility Reminder

From the November 2026 EA retest on, several app versions will be in use at once. When deploying:

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

## Current State (as of 2026-10-28)

| Audience | App | Version | Backend | Distribution |
|---|---|---|---|---|
| No field cohort today (Jim, 2026-10-28) | Legacy AsyncStorage app, unused | 1.2.x | `masi-app` (legacy) | Nothing new is distributed |
| Testers now; Masi's EAs from November 2026 | SQLite app (`main`) | 1.4.0: iOS 25, Android 54 from `dffe22c` (July 2026 pilot: 1.3.0) | `masi-app-sqlite` | `pilot` profile → TestFlight + Play internal testing, submitted by EAS |

OTA updates go per channel: `preview` serves the SQLite store builds, and
`production` served the legacy builds. Runtime versions (1.2.x vs 1.3.0 and
later) prevent cross-delivery even on a mistaken channel.

---

## Troubleshooting

### "No suitable application records found" (iOS)
The app must exist in App Store Connect. Verify bundle ID matches: `org.masinyusane.masi`

### "The bundle version must be higher" (iOS)
Should not happen with `autoIncrement: true`. If it does: `npx eas-cli@26.0.0 build:version:set -p ios`

### "App not found" (Android)
The app must exist in Google Play Console with package `org.masinyusane.masi`.

### "The Google service account cannot submit this app" (Android)
Also shown as a `403` or a `404` on the package name. Check Play Console →
**Users and permissions**: `eas-submit-masi` must be listed as **Active**, with
Masi under App permissions and at least **Release apps to testing tracks**. On
2026-10-28 it was missing from the list because the invite had stopped at
**Apply** (see One-time setup, step 3); once it was invited, the resubmission
succeeded within minutes. If it is listed, a new grant can take up to 24 hours
to reach Google's API: wait and resubmit the same build ID. A failed submission
uploads nothing.

### "Google Service Account Keys cannot be set up in --non-interactive mode" (Android)
No Play key is assigned on EAS to `org.masinyusane.masi`. Do the one-time
Android setup above.

### Build succeeds but submit fails
Rerun the submission against the exact build ID to see the specific error:
```bash
npx eas-cli@26.0.0 submit -p android --profile pilot --id <ANDROID_BUILD_ID>
npx eas-cli@26.0.0 submit -p ios --profile pilot --id <IOS_BUILD_ID>
```

### Environment variables missing in build
Public values (Supabase URL and publishable key) are selected through the pilot
profile and exposed through `app.config.js`; `.env.local` is not available to
EAS cloud builds. See AGENTS.md "EAS Builds" section.
