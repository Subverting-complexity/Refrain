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
  (`1.0.0`), mirrored in `package.json`'s `version`. Running
  `tools\BuildAndDeployiOS.cmd` or `tools\BuildAndDeployAndroidStore.cmd`
  bumps it **automatically** — a minor bump by default — before the build
  starts. See [Automatic version bump](#automatic-version-bump) below.
- The **build number** (iOS `CFBundleVersion` / Android `versionCode`)
  is managed **remotely by EAS** (`cli.appVersionSource: "remote"` in
  `eas.json`) and auto-incremented per production build
  (`build.production.autoIncrement: true`). It is _not_ stored in this
  repo — `app.json` intentionally has no `ios.buildNumber` — and the
  version-bump tooling below does not touch it either, for the same reason.

Read the current remote value at any time:

```bash
eas build:version:get --platform ios
```

## Normal release flow

The deploy scripts are the normal path, not the raw `eas` CLI: they bump the
version, record the release branch and outcome tag (see below), and only then
build and submit.

```powershell
.\tools\BuildAndDeployiOS.cmd
.\tools\BuildAndDeployAndroidStore.cmd
```

Calling `eas build` / `eas submit` directly still works, but skips both the
version bump and the release-branch/tag bookkeeping — use it only for a
build that deliberately should not carry either, and bump `app.json` /
`package.json` by hand first if it needs a new version:

```bash
# 1. Confirm auth (see above) — eas whoami must show the robot.
# 2. Build. autoIncrement bumps the remote build-number counter automatically.
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

## Automatic version bump

Every production run of `BuildAndDeployiOS.cmd` / `BuildAndDeployAndroidStore.cmd`
bumps `expo.version` in `app.json` and `version` in `package.json` together,
before the release branch is cut and before the build starts:

1. Reads the current version from `app.json`.
2. Computes the next one — **minor by default**, e.g. `1.2.3` → `1.3.0`.
3. Commits it on a throwaway `version-bump/<next>` branch cut from `main`,
   fast-forward merges that branch into `main`, deletes the throwaway branch,
   and pushes `main`.

```powershell
.\tools\BuildAndDeployiOS.cmd              # minor bump (default)
.\tools\BuildAndDeployiOS.cmd -Patch       # patch bump instead
.\tools\BuildAndDeployiOS.cmd -Major       # major bump instead
```

**Shipping both platforms at the same version:** the bump runs once per
platform script, so running both in a sitting calls it twice — but the
second call is a no-op, not a second bump. Before doing anything, the tool
checks whether `HEAD`'s own commit is already a bump it wrote; if so, it logs
that and stops, because nothing has landed on `main` since and there is
nothing new to release. Run the platforms in either order, back to back, and
only the first one actually bumps:

```powershell
.\tools\BuildAndDeployiOS.cmd
.\tools\BuildAndDeployAndroidStore.cmd     # sees its own prior commit, skips
```

This is verified end to end (two runs in a row, real git operations, in a
throwaway repo) in
`tools/__tests__/versionBump.integration.test.ts`.

The bump refuses rather than guessing when:

- **Not on `main`.** It only ever commits to the base branch; check it out
  first.
- **The working tree is dirty.** Unlike the release-branch tracking below,
  there is no `-AllowDirty` escape hatch here — this commits to `main`
  automatically, so it will not risk sweeping unrelated changes in with it.
  Commit or stash first.
- **`main` is behind or has diverged from `origin/main`.** Pull first.

The logic lives in `tools/version-bump.mjs` (side effects: reading and
writing the two files, the git branch/merge/push, the already-bumped check)
and `tools/lib/version-bump.mjs` (the pure semver arithmetic and the
bump-commit pattern, unit-tested in `tools/__tests__/versionBump.test.ts`).
`tools/ps/VersionBump.ps1` is the one call site the deploy scripts use.

## Release branches and outcome tags

Every attempt to put a build in front of a store also leaves a record in
git, independent of whether it succeeds. A deploy cuts a branch at the
commit it is about to build (after the version bump above, so the branch
carries the bumped version), named for the platform and the minute the run
began, and pushes it immediately — before the build starts, so a run that
never comes back still left a record of having been attempted:

```
release/ios/2026-08-13-1432
release/android/2026-08-13-1432
```

When the run finishes, an annotated tag is written at the same commit and
pushed, naming the outcome:

```
release/ios/2026-08-13-1432-success
release/android/2026-08-13-1432-failed
```

The tag's message holds what a name cannot: the profile, the full commit,
the duration, the exit code, whether the build was handed to the store, and
the EAS build id when the tool could discover one.

```bash
git tag -n20 -l 'release/*'
```

A successful branch is kept for good — it may still be needed to cut a
hotfix from. A failed or unfinished branch is pruned automatically 30 days
after the fact; its tag is kept regardless, so nothing about the attempt is
actually lost. Pruning runs at the end of every `finish`, or by itself:

```bash
node tools/release-branch.mjs prune --dry-run
```

A deploy refuses to start from a dirty working tree, for the same reason
the version bump does: a branch cut from one names a commit that is not
what gets built. `-AllowDirty` on the deploy script overrides this and
says so in the tag's notes — the version bump above has no equivalent
override.

The logic lives in `tools/lib/release-branch.mjs` (naming and retention
rules, unit-tested in `tools/__tests__/releaseBranch.test.ts`),
`tools/lib/release-branch-prune.mjs` (the deletion rule, tested in
`tools/__tests__/releaseBranchPrune.test.ts`), and `tools/release-branch.mjs`
(the git side effects). `tools/ps/ReleaseBranch.ps1` is the three call sites
the deploy scripts use.

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
