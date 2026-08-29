# Releasing

How Refrain's store builds are authenticated, versioned, submitted and
recorded, and how to recover from the failures that have actually
happened.

## The one command

```powershell
.\tools\Deploy.cmd
```

That is a public release of both platforms. Everything below is either an
option on that command or an explanation of what it does.

| What you want                        | Command                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| Public release, both stores          | `.\tools\Deploy.cmd`                                    |
| Public release, one store            | `.\tools\Deploy.cmd -Platform ios`                      |
| A build for internal testers         | `.\tools\Deploy.cmd -Lane fast`                         |
| Retry the platform that just failed  | `.\tools\Deploy.cmd -Platform android`                  |
| Push the listing even if unchanged   | `.\tools\Deploy.cmd -Listing on`                        |
| Ship the binary and skip the listing | `.\tools\Deploy.cmd -Listing off`                       |
| A patch or major version instead     | `.\tools\Deploy.cmd -Patch` / `-Major`                  |
| A dev-client build for a device      | `.\tools\Deploy.cmd -Profile development -Platform ios` |

There is one entry point rather than one per platform. Shared setup runs
exactly once per release however many platforms are selected: `.env`
loading, prerequisite checks, the version bump, and the release branch.
Only build, submit and the listing push repeat per platform.

## Lanes

A lane is where the build is headed, named for the outcome rather than
for either store's own vocabulary, because the two platforms do not
implement it the same way.

| Lane              | Android                                   | iOS                                                      |
| ----------------- | ----------------------------------------- | -------------------------------------------------------- |
| `store` (default) | Play `production` track                   | Upload to App Store Connect, then push the store listing |
| `fast`            | Play `internal` track, no review to clear | Upload to App Store Connect and stop                     |

The asymmetry is real and worth knowing. **Android has named tracks**, so
the fast lane is a genuinely different destination: `internal` reaches
testers without the review a production release goes through. **iOS has
no track parameter on submit at all.** Uploading a build makes it
available to TestFlight internal testers once Apple has processed it,
whichever lane you used. What the store lane adds on iOS is the listing
push, and then a separate submit-for-review step (below).

The lane maps to a submit profile in `eas.json` (`production` or
`internal`), passed to EAS as `--auto-submit-with-profile`. The two iOS
submit blocks are identical on purpose: there is nothing lane-dependent
to put in them, and having both means the lane picks a profile rather
than the script special-casing iOS.

**The fast lane does not bump the marketing version**, and does not open
a pull request. EAS increments the native build number remotely on every
build regardless, so consecutive test builds are already
distinguishable. Bumping for every internal build would burn versions on
builds nobody outside the team sees. The trade-off: a test build shows
the last released marketing version with a higher build number, so a
tester cannot tell from the version alone which release cycle it belongs
to.

The fast lane still cuts and pushes a release branch, so the attempt is
recorded like any other, and the lane is written into the outcome tag.

## Sequential builds, and stopping on failure

With both platforms selected, **iOS builds first and Android follows**,
each as its own single-platform EAS invocation.

Sequential rather than one `--platform all` build, because a combined
invocation collapses both results into one exit code that can only
report that _at least one_ platform failed, never which. One invocation
per platform keeps a real per-platform exit code and lets each platform
be tagged as it finishes. The cost is wall-clock: roughly the sum of both
build times rather than the longer of the two.

iOS first because its credential path (certificates, provisioning
profiles, and an Apple sign-in separate from the EAS login) is the more
fragile of the two, so failing there first is the cheaper failure. A
sensible default rather than a rule.

**A failed platform stops the release.** The remaining platform is not
built, which limits what a doomed release spends against the monthly
build quota.

What that does _not_ do is make the release atomic. A submission that
has already succeeded cannot be withdrawn, so if iOS ships and Android
then fails, the stores sit at different versions until the next
successful Android release. Stopping limits the waste; it does not
prevent the divergence.

**Retrying** is a normal invocation with the platform selector set to
the failed platform:

```powershell
.\tools\Deploy.cmd -Platform android
```

The version bump is a no-op on a retry (see below), so the rebuild
carries the same version, and the release branch is reused rather than a
second one being cut at the same commit.

## Authenticating

This repo does **not** use your global `eas login` session. The project
lives under the `subvertingcomplexity` Expo account, which your personal
or work login may not belong to. `Deploy.ps1` loads a gitignored `.env`
before it runs anything, and that one file carries three separate
identities:

| Variable                                                  | Who it is                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| `EXPO_TOKEN`                                              | The Expo account that owns this project      |
| `EXPO_APPLE_ID`                                           | The Apple Developer account, read by eas-cli |
| `APPLE_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` | fastlane's App Store Connect credentials     |
| `SUPPLY_JSON_KEY`                                         | fastlane's Play service-account JSON path    |

See `.env.example` for what each one is and where to get it.

**None of these are in the repository**, and the Apple ID specifically is
not in `eas.json`: this repository is public and it is a personal
address. eas-cli reads `EXPO_APPLE_ID` directly, before it would
otherwise prompt and prefill from its own cached username
(`~/.app-store/auth/username.json`), which holds whatever Apple ID was
typed last. On a machine where a work Apple account has ever been
entered, that prompt offers the wrong account and a distracted Enter
signs the build with it.

`Deploy.ps1` says which Apple ID it is using, or warns that it is about
to let EAS prompt. If you see that warning, set `EXPO_APPLE_ID` in `.env`
rather than accepting whatever the prompt offers.

**Loading `.env` outside the deploy script depends on your shell.**
`.envrc` auto-loads it through [direnv](https://direnv.net), but direnv
only hooks bash/zsh. In **PowerShell it does nothing**, so a bare
`eas build` falls back to your `eas login` session and fails with a
confusing authorization error (see Troubleshooting).

bash / zsh (one-time):

```bash
cp .env.example .env   # fill in the values
direnv allow
```

PowerShell (per session, if you are not going through `Deploy.cmd`):

```powershell
$env:EXPO_TOKEN = ((Get-Content .env | Where-Object { $_ -like 'EXPO_TOKEN=*' } | Select-Object -First 1) -split '=', 2)[1].Trim()
```

Always confirm before running anything by hand:

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

- `expo.version` in `app.json` is the user-facing marketing version,
  mirrored in `package.json`'s `version`. A store-lane release bumps it
  **automatically** — a minor bump by default — before anything is built.
- The **build number** (iOS `CFBundleVersion` / Android `versionCode`)
  is managed **remotely by EAS** (`cli.appVersionSource: "remote"` in
  `eas.json`) and auto-incremented per production build
  (`build.production.autoIncrement: true`). It is _not_ stored in this
  repo — `app.json` intentionally has no `ios.buildNumber` — and the
  version-bump tooling does not touch it either, for the same reason.

Read the current remote value at any time:

```bash
eas build:version:get --platform ios
```

### The bump lands through a pull request

The bump happens **once per release**, before any build, so both
platforms build from one commit carrying one version. What it does:

1. Reads the current version from `app.json`.
2. Computes the next one — **minor by default**, e.g. `1.2.3` → `1.3.0`.
3. Commits it on the **release branch** (`release/<timestamp>`) cut from
   `main`, and pushes that branch.
4. Opens a pull request from the release branch into `main` and **merges
   it immediately**.
5. Fast-forwards local `main` onto the merge, and pushes the release
   branch back if the merge deleted it.

Four things in that list are deliberate.

**A pull request rather than a direct push.** A direct push works only
while the repository does not require a pull request before merging.
Turn that protection on and the push is rejected, the bump is left as a
local-only commit, and every later run refuses to start because local
and remote `main` have diverged. This flow already complies if that day
comes. Nothing needs enabling for it to work today.

**The release branch is the pull request's source.** Cutting the release
branch from the bump commit is what makes it name exactly what is about
to be built. A separate throwaway bump branch cut from the same commit
would be a second name for the same ref with no distinct job.

**Merged immediately, not armed with `--auto`.** `gh pr merge --auto`
returns as soon as the merge is _armed_, which leaves an asynchronous gap
in which the release could ship a version `main` never received. With no
required reviews and no required checks, an immediate merge either
succeeds or fails on the spot. If a required check is added later, this
call will fail outright rather than wait — a one-flag change to make
deliberately at that point.

**A merge commit, never a squash.** A squash puts a _content twin_ of the
release branch's commit on `main` rather than an ancestor of it, so a
hotfix cut from the release branch would no longer merge back into a
history that recognises it.

This needs the **GitHub CLI** (`gh`) installed and authenticated. The
deploy script checks both before it builds anything.

**The release branch is re-pushed after the merge.** This repository has
GitHub's "automatically delete head branches" turned on, so merging the
pull request deletes the release branch from the remote — the branch
whose whole job is to record what the release was built from. The bump
notices and pushes it back.

If the pull request will not open or will not merge, the bump **rolls
itself back**: it returns to `main`, deletes the local branch, deletes
the remote one, and stops the release before any build starts. A
local-only bump commit left behind is the exact wedged state this design
removes.

### Running twice in a row

A retry after a partial failure must rebuild at the same version, so the
bump checks whether it is already on `main` before doing anything: either
as `HEAD` itself, or as the branch that `HEAD`'s merge commit brought in.
The moment a real commit lands on top, there is something new to release
and the next deploy bumps again.

```powershell
.\tools\Deploy.cmd                    # bumps 1.3.0 -> 1.4.0, iOS ships, Android fails
.\tools\Deploy.cmd -Platform android  # sees the bump already landed, rebuilds at 1.4.0
```

This is verified end to end, against real git with the merge stubbed, in
`tools/__tests__/versionBump.integration.test.ts`.

The bump refuses rather than guessing when:

- **Not on `main`.** It only ever commits to the base branch.
- **The working tree is dirty.** Unlike the release-branch tracking
  below, there is no `-AllowDirty` escape hatch here — this commits to
  `main` automatically, so it will not risk sweeping unrelated changes in
  with it. Commit or stash first.
- **`main` is behind or has diverged from `origin/main`.** Pull first.
- **`gh` is missing or not authenticated.**

The logic lives in `tools/version-bump.mjs` (side effects: the two files,
the git work, the `gh` calls, the rollback) and `tools/lib/version-bump.mjs`
(the pure semver arithmetic, the bump-commit pattern, and the
already-landed check, unit-tested in `tools/__tests__/versionBump.test.ts`).
`tools/ps/VersionBump.ps1` is the one call site.

## Release branches and outcome tags

Every release also leaves a record in git, independent of whether it
succeeds. One release cuts **one branch** at the commit it is about to
build, named for the minute it began, and pushes it before the first
build starts — so a release that never comes back still left evidence it
was attempted:

```
release/2026-08-13-1432
```

One branch, not one per platform: both platforms build from a single
commit carrying a single version, so a platform segment in the branch
name would only ever produce two names for the same commit.

Each platform then writes an annotated tag at that commit as it
finishes, **before the next platform starts**, so a release that dies
during the second build has already recorded the first platform's
result:

```
release/2026-08-13-1432-ios-success
release/2026-08-13-1432-android-failed
```

The outcomes are per-platform because they are genuinely independent: one
commit can ship on one store and fail on the other, and a retry can later
add a success beside an earlier failure. The tag's message holds what a
name cannot: the lane, the profile, the submit profile, the full commit,
the duration, the exit code, whether the build was handed to the store,
**what happened to the store listing**, and the EAS build id.

```bash
git tag -n30 -l 'release/*'
```

**A platform that was never attempted is not tagged.** It did not fail,
so recording it as failed would be untrue, and it produced no build to
link to. A stopped release is legible from what is there: a failure tag
on one platform, no tag on the other.

### Pruning

A branch is kept only if **every platform that recorded an outcome
recorded a success**. Everything else is pruned after 30 days; the tags
are kept for good, so nothing about the attempt is actually lost — a tag
pins the same commit the branch pointed at.

| Tags on the release                                        | Result                 |
| ---------------------------------------------------------- | ---------------------- |
| `ios-success`, `android-success`                           | Keep                   |
| `ios-success`, `android-failed`                            | Prune after the window |
| `ios-failed` (stopped before Android)                      | Prune after the window |
| `ios-success` only (single-platform release)               | Keep                   |
| `ios-success`, `android-failed`, `android-success` (retry) | Keep                   |

The retry row is the one that matters: a successful retry promotes the
branch back to kept without any special handling, because the rule asks
whether each platform _reached_ a success rather than whether it ever
failed.

One accepted ambiguity: a release stopped after iOS succeeded leaves only
an `ios-success` tag, which is indistinguishable from a deliberate
iOS-only release, so it is kept. Pruning decides which commits stay
convenient to reach rather than which survive, so that is harmless.

Pruning runs once at the end of every release, or by itself:

```bash
node tools/release-branch.mjs prune --dry-run
```

A release refuses to start from a dirty working tree, for the same reason
the version bump does: a branch cut from one names a commit that is not
what gets built. `-AllowDirty` overrides this and says so in the tags'
notes.

The logic lives in `tools/lib/release-branch.mjs` (naming and retention,
unit-tested in `tools/__tests__/releaseBranch.test.ts`),
`tools/lib/release-branch-prune.mjs` (the deletion rule, tested in
`tools/__tests__/releaseBranchPrune.test.ts`), and
`tools/release-branch.mjs` (the git side effects, tested end to end in
`tools/__tests__/releaseBranch.integration.test.ts`).
`tools/ps/ReleaseBranch.ps1` is the set of call sites the deploy script
uses.

## Store listing updates

EAS builds and submits the binary. The store **listing** — metadata,
keywords, screenshots, and the privacy and data-safety declarations — is
pushed by fastlane, and a store-lane release pushes it as part of the
same run, after that platform's binary submit.

`-Listing` chooses when:

- **`auto`** (default) pushes a platform's listing only when that
  platform's listing files changed since the last store-lane release
  that actually left the store carrying them. If there has never been
  one, the listing counts as changed.
- **`on`** pushes regardless.
- **`off`** skips it.

The two platforms are decided independently, because their paths are
disjoint: `fastlane/metadata/en-US`, the two category files,
`fastlane/screenshots*` and `fastlane/privacy_details.json` are Apple's;
`fastlane/metadata/android` is Google's. An iOS copy change does not push
the Play listing.

**The fast lane never pushes the public listing**, whatever `-Listing`
says. TestFlight carries its own "What to Test" text and the Play
internal track does not use the production listing, so pushing public
listing copy from a tester build would publish changes nobody asked to
publish.

**`-NoSubmit` does not push it either.** The listing follows the binary
submit, so a run that hands the binary to neither store has nothing for
it to follow. Pushing anyway would publish the new copy, screenshots and
privacy label for a build that never left the machine, and on iOS would
go further still: the listing lane opens the App Store version record for
the new version, so the store would carry a version with no binary behind
it.

**After the binary, not before.** On iOS the review submission is part of
the listing tooling and needs a build attached to the version, so it
cannot run first.

**The comparison passes over a release whose listing never reached the
store.** A listing push can fail after the binary has already shipped,
and the platform's outcome tag stays a success, because the build did
ship. Diffing against that commit would find no listing change since and
skip the push, so the store page would sit on the old copy release after
release with nothing on screen saying so. `auto` therefore only compares
against a release whose tag records the listing as pushed, or as already
matching what the store carried. One that failed, or that ran with
`-Listing off` or `-NoSubmit`, is passed over in favour of the release
before it.

**A listing failure does not turn a shipped build into a failed
release.** The binary has gone to the store and cannot be withdrawn, so
the platform's outcome tag still records the binary outcome and the
listing result goes in the tag's `Listing:` field. The console says so
loudly, because nothing else on screen would suggest anything is wrong.

**Prerequisites are checked before the first build.** The listing push
needs Ruby with the fastlane bundle installed, plus credentials entirely
separate from the EAS token. A missing App Store Connect key fails the
release in seconds rather than after a build has been paid for and
shipped. That includes a credential path pointing at a file that is no
longer there, which is how this goes wrong in practice: `ASC_KEY_PATH`
and `SUPPLY_JSON_KEY` are checked for existence, not just for being set.
Run `cd fastlane && bundle install` once, and see `.env.example` for the
credentials.

### iOS review submission is a separate step

Submitting for review needs a build Apple has finished processing, which
typically takes 5 to 15 minutes after upload and is outside our control.
A release run cannot bound that wait, and folding an unbounded wait into
a script that has already spent 15 minutes building would make the run
time unpredictable and give it a new way to fail that has nothing to do
with the release.

So the release run pushes the listing metadata and stops. Once TestFlight
shows the build as processed:

```bash
cd fastlane
bundle exec fastlane ios listing submit:true
```

`Deploy.ps1` prints this reminder at the end of a successful store-lane
iOS release.

## Building by hand

Calling `eas build` / `eas submit` directly still works, but skips the
version bump, the release record and the listing push. Use it only for a
build that deliberately should carry none of those, and bump `app.json` /
`package.json` by hand first if it needs a new version:

```bash
# 1. Confirm auth (see above) - eas whoami must show the robot.
# 2. Build. autoIncrement bumps the remote build-number counter automatically.
eas build --platform ios --profile production

# 3. Submit the build you just made.
eas submit --platform ios --profile production
```

During `eas build`, EAS offers to log in to your **Apple** account to
manage credentials. This is a separate identity from your Expo login. The
team and app are pinned in `eas.json` under `submit.production.ios`:

- Team: `JTUZQBUGVY` (SUBVERTING COMPLEXITY (PTY) LTD)
- ASC App ID: `6780801245`

The Apple ID is not there, for the reason given under Authenticating. Set
`EXPO_APPLE_ID` in your `.env`, or clear the prefilled value and type it
at the prompt. Entering a work account will fail — it has no access to
this app.

Export compliance needs no action: `ITSAppUsesNonExemptEncryption` is
already set to `false` in `app.json`, so Apple skips the encryption
questionnaire.

After a successful submit, Apple still has to process the binary before
it appears in TestFlight — typically 5-15 minutes.

Neither store rolls a release out on its own. Apple waits because the
fastlane lane sets `automatic_release: false`; Play waits only while
**Managed publishing** is enabled in the console. Both are covered in
[../fastlane/PUBLISHING.md](../fastlane/PUBLISHING.md).

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

### The version bump stopped the release

Read what it printed. It refuses on a dirty tree, on not being on `main`,
on `main` having diverged from `origin/main`, and on `gh` being missing
or unauthenticated. All four are things it will not guess at, and all
four leave the repository exactly as it found it.

If the pull request itself would not merge, the bump has already rolled
back: `main` is where it was, the release branch is gone locally and
remotely, and nothing was built. Fix the cause and re-run.

One trap worth knowing on this machine: `gh auth status` passing does not
guarantee the push will work. Git on Windows takes its credentials from
Credential Manager, which does not follow `gh auth switch`, so `gh` can be
authenticated as one account while git pushes as another that has read
access but not write. The symptom is the bump failing on its `git push`
rather than on anything `gh` did. Check which account Credential Manager
holds for `github.com`.

### First Android upload for a brand-new app is rejected

Reported behaviour rather than something this project has hit yet. For an app
that has never had a bundle on any track, the Play Developer API can reject the
very first upload with a permissions or "app not found" style error even when
the service account is configured correctly.

Fix: upload that first AAB by hand in Play Console. The API works normally
afterwards. Do not work around it by widening the service account's
permissions, and do not retry in a loop.

### `fastlane android listing` fails on changelogs before the first release

[../fastlane/Fastfile](../fastlane/Fastfile) sets `skip_upload_changelogs:
false`. `supply` attaches changelogs to the releases on the target track, so on
an app with no release on any track there is nothing to attach them to and the
lane can error.

Fix: set `skip_upload_changelogs: true` for that one run, push the listing,
then set it back to `false` once a build has landed on the track. In the
meantime `-Listing off` ships the binary without the listing.

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
```

Then re-run `.\tools\Deploy.cmd -Platform ios`. Resubmitting the
_existing_ `.ipa` cannot work: the build number is baked into the archive
at build time, so a rebuild is required after raising the counter.

**Worked example (2026-07-20).** Submission failed because EAS's counter
was at `3` while App Store Connect had already seen `8`.
`build:version:set` to `9`, then `eas build` auto-incremented it to `10`,
and the submission succeeded.

### A release stopped and left state behind

`Deploy.ps1` closes the release unconditionally at the end of every run,
including one that stopped after a failure. If a run was killed outright
(the window closed, the machine slept), `tools/release-state.json` can be
left behind. The next `start` says so and takes over the release; you can
also close it by hand:

```bash
node tools/release-branch.mjs stop
```

The branch that was left open is tagged `-unfinished` by the next prune
past the keep window, so the commit stays pinned either way.
