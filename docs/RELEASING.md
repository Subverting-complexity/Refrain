# Releasing

How Refrain's store builds are authenticated, versioned, and submitted,
and how to recover from the failures that have actually happened.

## Authenticating with EAS

This repo does **not** use your global `eas login` session. The project
lives under the `subvertingcomplexity` Expo account, which your personal
or work login may not belong to. Instead, a repo-scoped robot token is
read from a gitignored `.env`:

```
EXPO_TOKEN=<token for the Refrain robot user>
```

See `.env.example` for how to create one. When `EXPO_TOKEN` is set, the
EAS CLI uses it and ignores whatever `eas login` session is active, so
other repos keep using your normal account.

**Loading it depends on your shell.**

`.envrc` auto-loads `.env` through [direnv](https://direnv.net) — but
direnv only hooks bash/zsh. In **PowerShell it does nothing**, so EAS
silently falls back to your `eas login` session and fails with a
confusing authorization error (see Troubleshooting).

bash / zsh (one-time):

```bash
cp .env.example .env   # paste the token in
direnv allow
```

PowerShell (per session):

```powershell
$env:EXPO_TOKEN = ((Get-Content .env | Where-Object { $_ -like 'EXPO_TOKEN=*' } | Select-Object -First 1) -split '=', 2)[1].Trim()
```

Always confirm before running anything else:

```bash
eas whoami
```

Expect `Refrain (robot) (authenticated using EXPO_TOKEN)` and
`subvertingcomplexity` in the account list. If it prints a human
username, the token is not loaded.

The robot's role on the account is **Developer**. That is sufficient for
`build:version:set`, `build`, and `submit` (verified 2026-07-20) — you do
not need Admin for a normal release.

## Version management

- `expo.version` in `app.json` is the user-facing marketing version
  (`1.0.0`). Bump it by hand for each release.
- The **build number** (iOS `CFBundleVersion` / Android `versionCode`)
  is managed **remotely by EAS** (`cli.appVersionSource: "remote"` in
  `eas.json`) and auto-incremented per production build
  (`build.production.autoIncrement: true`). It is _not_ stored in this
  repo — `app.json` intentionally has no `ios.buildNumber`.

Read the current remote value at any time:

```bash
eas build:version:get --platform ios
```

## Normal release flow

```bash
# 1. Confirm auth (see above) — eas whoami must show the robot.
# 2. Build. autoIncrement bumps the remote counter automatically.
eas build --platform ios --profile production

# 3. Submit the build you just made.
eas submit --platform ios --profile production
```

During `eas build`, EAS offers to log in to your **Apple** account to
manage credentials. This is a separate identity from your Expo login.

⚠️ The prompt may prefill the wrong Apple ID (e.g. a work account). The
correct one is pinned in `eas.json` under `submit.production.ios`:

- Apple ID: `adrienne.bosch7@icloud.com`
- Team: `JTUZQBUGVY` (SUBVERTING COMPLEXITY (PTY) LTD)
- ASC App ID: `6780801245`

Clear the prefilled value and enter the Apple ID above. Entering a work
account will fail — it has no access to this app.

Export compliance needs no action: `ITSAppUsesNonExemptEncryption` is
already set to `false` in `app.json`, so Apple skips the encryption
questionnaire.

After a successful submit, Apple still has to process the binary before
it appears in TestFlight — typically 5–15 minutes.

## Troubleshooting

### "Entity not authorized: AppEntity[…] action = READ"

```
Original error message: Entity not authorized: AppEntity[70c678d1-…]
(viewer = RegularUserViewerContext[…], action = READ, ruleIndex = -1)
```

Despite the wording, this is almost always **the token not being loaded**,
not a real permissions problem. EAS fell back to your `eas login` session,
and that user has no access to `subvertingcomplexity`.

Fix: load `EXPO_TOKEN` for your shell (see Authenticating) and re-run
`eas whoami` to confirm you are the robot. Logging out and back in with a
different personal account is _not_ necessary and defeats the point of
the token setup.

### iOS submission fails: "bundle version must be higher than …"

```
The provided entity includes an attribute with a value that has already
been used. The bundle version must be higher than the previously
uploaded version: '8'.
```

Cause: EAS's remote build-number counter is **behind App Store Connect**.
This happens when builds were uploaded outside the EAS counter (via
Xcode/Transporter, or before remote versioning was enabled), so App Store
Connect has already seen a higher `CFBundleVersion` than the one EAS
stamped on the build.

Fix — set the remote counter above the last uploaded bundle version, then
rebuild and resubmit:

```bash
eas build:version:set --platform ios
# Enter a number higher than the one in Apple's error message.

eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Resubmitting the _existing_ `.ipa` cannot work: the build number is baked
into the archive at build time, so a rebuild is required after raising
the counter.

**Worked example (2026-07-20).** Submission failed because EAS's counter
was at `3` while App Store Connect had already seen `8`.
`build:version:set` to `9`, then `eas build` auto-incremented it to `10`,
and the submission succeeded.
