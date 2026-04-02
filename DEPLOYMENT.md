# Masi App — Deployment Guide

Quick reference for deploying updates to internal testers on iOS (TestFlight) and Android (Google Play Internal Testing).

---

## TL;DR — Deploy to Testers

### JS-Only Changes (most common)

```bash
# Push an OTA update — ~30 seconds, no build needed
npx eas-cli@latest update --channel production --message "describe what changed"
```

Testers get the update on their next app launch (no restart needed — it applies on the *following* launch).

### Native Changes (new packages, permissions, plugins)

```bash
# 1. Build + submit iOS to TestFlight
npx eas-cli@latest build -p ios --profile production --submit

# 2. Build + submit Android to Play Store internal track
npx eas-cli@latest build -p android --profile production --submit

# Or build both at once, then submit
npx eas-cli@latest build --profile production
npx eas-cli@latest submit -p ios --latest
npx eas-cli@latest submit -p android --latest
```

After submission:
- **iOS**: Testers get a TestFlight notification within ~15 minutes (no review for internal testers)
- **Android**: Testers see the update on internal track within ~1 hour

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
- The `runtimeVersion` uses the `appVersion` policy — OTA updates only apply to builds with a matching `expo.version` (currently `1.1.0`)
- Updates are checked on app launch and applied on the *next* launch (users don't see a loading screen)

### Pushing an OTA Update

```bash
npx eas-cli@latest update --channel production --message "describe what changed"
```

### How Runtime Versions Work

When you bump `expo.version` (e.g., `1.1.0` → `1.2.0`), the runtime version changes too. This means:
- OTA updates pushed for `1.2.0` will NOT apply to builds made at `1.1.0`
- You need a full native build after bumping the marketing version
- This is a safety feature — it prevents OTA updates from reaching builds with incompatible native code

### First Time Setup (already done)

For reference, here's what was configured:
1. Installed `expo-updates` via `npx expo install expo-updates`
2. Added `runtimeVersion` and `updates` URL to `app.json`
3. Added `channel: "production"` to the production profile in `eas.json`
4. **Still needed:** One full native build per platform to bake in the update client (see next section)

> **Important:** The first build after this setup MUST be a full native build (`eas build`). After that, JS-only changes can use `eas update`.

---

## Step-by-Step: Full Build + Submit

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

### iOS — Build and Submit to TestFlight

```bash
# Option A: Build and submit in one command
npx eas-cli@latest build -p ios --profile production --submit

# Option B: Build first, submit after
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --latest
```

The first time you run `--submit` for iOS, EAS will ask for:
- **Apple ID**: Your Apple Developer account email
- **ASC App ID**: Found in App Store Connect → App Information → Apple ID (it's a number like `6741893072`)

These get cached after the first run. To avoid prompts, set environment variables:
```bash
export EXPO_APPLE_ID=your@email.com
export EXPO_APPLE_TEAM_ID=XXXXXXXXXX   # printed during first build
```

Or add to `eas.json` under `submit.production.ios`:
```json
"ios": {
  "appleId": "your@email.com",
  "ascAppId": "YOUR_ASC_APP_ID"
}
```

### Android — Build and Submit to Internal Track

```bash
# Option A: Build and submit in one command
npx eas-cli@latest build -p android --profile production --submit

# Option B: Build first, submit after
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest submit -p android --latest
```

This uses the service account key at `./google-play-service-account.json` and submits to the `internal` track (configured in `eas.json`).

> **Note:** The service account key is in `.gitignore`. If you're building from a new machine, you'll need to copy this file over.

---

## Version Management

### What's automatic

- **Build numbers** (iOS `buildNumber`, Android `versionCode`): Auto-incremented by EAS on each build. Never touch these manually.
- **Version source**: Set to `"remote"` in `eas.json` — EAS tracks the latest build number server-side.

### What you control

- **Marketing version** (`expo.version` in `app.json`): Currently `1.1.0`. Bump this when you want users to see a new version number (e.g., `1.2.0` for a feature release).

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

## Current State (as of March 2026)

| Platform | Last Build | Version | OTA Enabled | Distribution |
|---|---|---|---|---|
| iOS | March 28, 2026 | 1.1.0 | Yes | TestFlight (internal) |
| Android | March 28, 2026 | 1.1.0 | Yes | Play Store (internal track) |

OTA updates are live. JS-only changes can be pushed with `eas update` — no rebuild needed.

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
Run submit separately to see the specific error:
```bash
npx eas-cli@latest submit -p ios --latest
npx eas-cli@latest submit -p android --latest
```

### Environment variables missing in build
Public values (Supabase URL, anon key) must be in `app.json → extra`, not just `.env.local`. EAS cloud builds don't read `.env.local`. See CLAUDE.md "EAS Builds" section.
