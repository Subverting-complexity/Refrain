# Refrain — `tools/`

PowerShell orchestration scripts for local dev, quality gates, and store builds.
All scripts are designed to be runnable both from a developer machine and from
CI. They set `$env:CI`-aware branches where relevant (auto-fix locally, strict
check in CI).

## Layout

```
tools/
  *.cmd        ← double-click these to run (Command Prompt launchers)
  ps/          ← the actual PowerShell scripts
    *.ps1
    steps/     ← internal phase scripts invoked by QualityGate.ps1
```

Each `.cmd` launcher sets the working directory to the repo root and runs its
matching `.ps1` with `-ExecutionPolicy Bypass`, so you don't need to change any
machine-wide PowerShell policy. **Double-click a `.cmd` in Explorer to run it**,
or call it from a terminal to pass arguments (`tools\Deploy.cmd -Platform ios`).

## Scripts

Every entry below has a clickable `tools\<name>.cmd` launcher and the underlying
`tools\ps\<name>.ps1`.

| Script          | Purpose                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QualityGate`   | Single entry point that runs every static check in sequence (health → assets → typecheck → lint → format → SDK dependency check → tests + coverage). Pass `-Install` for `npm ci` first, `-SkipTests` to skip Jest.                                                                           |
| `Deploy`        | The single store-release entry point. Double-clicked it opens a menu; given arguments it runs that release directly. Cloud build and submit via EAS for `-Platform both` (default), `ios` or `android`, on the `store` or `fast` lane, plus the store listing push. No Mac needed. See below. |
| `LaunchAndroid` | Local build + install + Metro bundler against a USB-connected Android device via `expo run:android`. Nothing to do with the stores.                                                                                                                                                           |
| `LaunchWeb`     | Dev-time web preview (`expo start --web`). UI smoke test only — native audio behaves differently in a browser. See the note below.                                                                                                                                                            |

## `Deploy` — the one release entry point

`Deploy.ps1` ships either platform or both. Shared setup runs exactly once per
release however many platforms are selected: `.env` loading, prerequisite
checks, the version bump, and the release branch. Only build, submit and the
listing push repeat per platform.

| Parameter           | Values                                     | Default      |
| ------------------- | ------------------------------------------ | ------------ |
| `-Platform`         | `both`, `ios`, `android`                   | `both`       |
| `-Lane`             | `store` (public release), `fast` (testers) | `store`      |
| `-Listing`          | `auto`, `on`, `off`                        | `auto`       |
| `-Profile`          | `production`, `development`, `preview`     | `production` |
| `-Patch` / `-Major` | store lane only, the bump level            | minor        |
| `-NoSubmit`         | build only: no store submit, no listing    | off          |
| `-ListingOnly`      | push the listing and nothing else          | off          |

### The menu

`Deploy.cmd` with no arguments opens `ps/DeployMenu.ps1`, which asks what to run
and for which store, prints the equivalent command, and asks for a `y` before
running anything. It returns to the menu afterwards, so one session can ship
Android, then iOS, then push a listing.

A store release asks one more question, the version bump, and shows what each
level would do to the current version rather than only naming the rule:

```
   1) Minor (default)
      1.3.0 -> 1.4.0
   2) Patch
      1.3.0 -> 1.3.1
   3) Major
      1.3.0 -> 2.0.0
```

The menu exists because the defaults are wrong for a double-click. Typed, a bare
`Deploy.cmd` meaning "public release of both stores" is a reasonable shorthand.
Double-clicked, it is the most consequential thing in the repo happening because
somebody opened a folder. Arguments still bypass the menu entirely, so scripts
and CI are unaffected.

Three things it offers:

- **Store release** - the public release: version bump, build, submit, listing.
  Asks for the bump level, defaulting to minor.
- **Test build** - the `fast` lane: internal testers, no bump, no public listing.
- **Store listing only** - `-ListingOnly`, below.

### `-ListingOnly`

Pushes the store listing (copy, screenshots, privacy declarations) through
fastlane and does nothing else: no build, no submit, no version bump, no release
branch. It is the mode for a listing that needs correcting when the binary does
not, where a full release would spend a version and a cloud build on a corrected
sentence.

Store lane and production profile only. It refuses `-Lane fast`, `-Listing off`,
`-NoSubmit`, `-Patch` and `-Major` rather than accepting them and doing nothing,
and it defaults `-Listing` to `on`, because `auto` can decide that a run whose
only job is the listing has no listing to push.

It writes no outcome tag, so a later `-Listing auto` cannot see that it happened
and may push the same content again. A repeat push is idempotent; a skipped one
would not be, so that is the safe direction.

With both platforms selected they build **sequentially, iOS first**, each as
its own single-platform EAS invocation, and a failure stops the release. The
reasoning for all three of those is in
[`docs/RELEASING.md`](../docs/RELEASING.md).

A non-production `-Profile` is not a release: it carries no version bump, no
release branch, no submit and no listing push.

## Release tooling (`tools/ps/ReleaseBranch.ps1`, `tools/ps/VersionBump.ps1`)

`Deploy.ps1` dot-sources these two internal helpers (no `.cmd` launcher of
their own — they only make sense as part of a store deploy) for the work a
store release does around the build itself:

- **Version bump** — `VersionBump.ps1` calls `tools/version-bump.mjs`, which
  bumps `expo.version` in `app.json` and `version` in `package.json` together
  (minor by default; `-Patch` / `-Major` override it), commits that on the
  release branch, and lands it on `main` **through a pull request merged
  immediately**. It needs the GitHub CLI. If the bump is already on `main` it
  is a no-op, which is what lets a retry rebuild the failed platform at the
  same version.
- **Release record** — `ReleaseBranch.ps1` calls `tools/release-branch.mjs`,
  which cuts and pushes one `release/<timestamp>` branch before the first
  build, writes a `-<platform>-success` / `-<platform>-failed` tag as each
  platform finishes, and closes the release afterwards. Every attempt —
  including one that never finishes — leaves a record in git.
- **Store listing** — the same tool decides whether a platform's listing
  changed since the last store release that actually left the store carrying
  it, and checks fastlane's toolchain and credentials **before the first
  build**, so a missing App Store Connect key costs seconds rather than a
  paid-for build that shipped without its listing.

All of it is Node (`tools/version-bump.mjs`, `tools/release-branch.mjs`, and
the pure logic under `tools/lib/`) rather than PowerShell, so the rules can be
unit-tested — see `tools/__tests__/`. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the full scheme, including
what each step refuses to do.

## Phase steps (`tools/ps/steps/`)

`QualityGate` dispatches to focused scripts in `tools/ps/steps/` so each phase is
easy to re-run in isolation. These are internal helpers (no `.cmd` launcher) —
they expect to be invoked by `QualityGate.ps1`:

- `CheckHealth.ps1` — verifies Node/npm/git and `package.json` sanity
- `VerifyAssets.ps1` — confirms the PNG files referenced by `app.json` exist (icon, splash, favicon, and the three Android adaptive-icon layers)
- `RunStaticAnalysis.ps1` — `tsc --noEmit`
- `ValidateQuality.ps1` — ESLint (auto-fix locally, strict in CI)
- `VerifyFormatting.ps1` — Prettier (rewrite locally, check in CI)
- `TestBuild.ps1` — `expo install --check` (the SDK dependency-alignment gate `eas build` runs internally)
- `ExecuteTests.ps1` — Jest + coverage (thresholds enforced in both local and CI modes)

## Typical flow

```powershell
# First-time install and full gate
.\tools\QualityGate.cmd -Install

# Fast iteration loop (static checks + build only, no tests)
.\tools\QualityGate.cmd -SkipTests

# First device install on iOS (dev client with Metro connection)
.\tools\Deploy.cmd -Profile development -Platform ios

# Daily loop on a physical Android device
.\tools\LaunchAndroid.cmd

# Pick a release from a menu
.\tools\Deploy.cmd

# Ship a public release to both stores without the menu
.\tools\Deploy.cmd -Platform both -Lane store

# Fix a store listing without building anything
.\tools\Deploy.cmd -ListingOnly -Platform android

# Get a build in front of internal testers without a public release
.\tools\Deploy.cmd -Lane fast
```

## First-time EAS setup

The store build scripts require an `eas.json` (committed at the repo root) and a
project connected to Expo. If you haven't connected yet:

```powershell
# Connect the project to Expo (writes extra.eas.projectId into app.json)
npx eas-cli@latest init

# Or build + submit both platforms in one shot
npx eas-cli@latest build --platform all --auto-submit
```

`ios.bundleIdentifier` and `android.package` are set to
`com.subvertingcomplexity.refrain` in `app.json`. Before the first TestFlight /
Play submit, fill in the `submit.production` credentials (`ascAppId`,
`appleTeamId`, and the Play `serviceAccountKeyPath`) in `eas.json`.

The Apple ID is deliberately **not** in `eas.json`, because this repository is
public and it is a personal address. Set `EXPO_APPLE_ID` in the gitignored
`.env` instead (see `.env.example`). `Deploy.ps1` loads `.env` before EAS runs,
so the prompt never falls back to its cached username.

`eas.json` also carries an `internal` submit profile alongside `production`.
That is the fast lane's destination: the Play `internal` track on Android. The
two profiles' iOS blocks are identical because iOS submit has no track
parameter at all — see [`docs/RELEASING.md`](../docs/RELEASING.md).

## Coverage thresholds

`ExecuteTests.ps1` runs Jest with `--coverage` in both local and CI. The
thresholds in `jest.config.js` gate the build:

- `src/services/` (core business logic): **80%** branches/functions/lines/statements
- Project-wide regression floor: **54%** statements, **57%** branches, **44%** functions, **55%** lines

The floor is set just below current measured numbers so coverage can't silently
slip across `src/` and `app/`. Raise it toward 80% as untested screens and
modules gain tests. Type-only files and `src/types/**` are excluded via
`collectCoverageFrom`.

## Web preview

`LaunchWeb` is **UI-only**. It starts Metro in web mode, opens
`http://localhost:8081` in the default browser, and is the cheapest way to click
through screen layouts, theming, and navigation without waiting for an EAS build.

Native-backed subsystems behave differently in a browser than on device:

| Subsystem             | Web behaviour                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `expo-audio` playback | Browser audio engine — timing and format support differ from native; treat as best-effort. |
| `expo-sqlite`         | Browser-backed; persistence semantics differ from a native database.                       |
| `expo-file-system`    | Loop file import paths that depend on native FS are not exercised.                         |

For anything audio-related — loop import, playback, A/B markers against a real
clip — use `Deploy.cmd -Profile development -Platform ios` or
`LaunchAndroid.cmd` on a real device.

```powershell
# Launch web preview on port 8081 (opens browser once Metro is ready)
.\tools\LaunchWeb.cmd

# Launch on an alternate port
.\tools\LaunchWeb.cmd -Port 8088

# Launch without opening a browser
.\tools\LaunchWeb.cmd -NoOpen
```

## Build log

`Deploy.ps1` appends one entry per platform build to
`tools/ps/ios-build-log.json` and `tools/ps/android-build-log.json`. Both files
are gitignored. They power the "X builds this month" summary that warns as you
approach the Expo free-tier cap (30 builds/month), counted across both
platforms because the cap is.
