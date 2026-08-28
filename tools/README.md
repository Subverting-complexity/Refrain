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
or call it from a terminal to pass arguments (`tools\BuildAndDeployiOS.cmd -Profile preview`).

## Scripts

Every entry below has a clickable `tools\<name>.cmd` launcher and the underlying
`tools\ps\<name>.ps1`.

| Script                       | Purpose                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QualityGate`                | Single entry point that runs every static check in sequence (health → assets → typecheck → lint → format → SDK dependency check → tests + coverage). Pass `-Install` for `npm ci` first, `-SkipTests` to skip Jest. |
| `BuildAndDeployAndroid`      | Local build + install + Metro bundler against a USB-connected Android device via `expo run:android`.                                                                                                                |
| `BuildAndDeployAndroidStore` | Cloud AAB build + Play Store submission via EAS.                                                                                                                                                                    |
| `BuildAndDeployiOS`          | Cloud iOS build via EAS. Use `-Profile development` for a dev-client IPA, `-Profile preview` for an internal IPA, or the default `-Profile production` for TestFlight. No Mac needed.                               |
| `LaunchWeb`                  | Dev-time web preview (`expo start --web`). UI smoke test only — native audio behaves differently in a browser. See the note below.                                                                                  |

## Release tooling (`tools/ps/ReleaseBranch.ps1`, `tools/ps/VersionBump.ps1`)

`BuildAndDeployiOS` and `BuildAndDeployAndroidStore` dot-source these two
internal helpers (no `.cmd` launcher of their own — they only make sense as
part of a store deploy) for two things every production run does before it
builds:

- **Version bump** — `VersionBump.ps1` calls `tools/version-bump.mjs`, which
  bumps `expo.version` in `app.json` and `version` in `package.json` together
  (minor by default; `-Patch` / `-Major` on the deploy script override it), on
  a throwaway branch that gets fast-forward merged into `main` and pushed. If
  `HEAD` is already a commit this tool wrote, it's a no-op — that's what keeps
  a same-sitting iOS-then-Android release from bumping twice.
- **Release branch + outcome tag** — `ReleaseBranch.ps1` calls
  `tools/release-branch.mjs`, which cuts and pushes a `release/<platform>/<timestamp>`
  branch before the build and writes a `-success` / `-failed` outcome tag
  after it, so every release attempt — including one that never finishes —
  leaves a record in git.

Both are Node tools (`tools/version-bump.mjs`, `tools/release-branch.mjs`,
and the pure logic under `tools/lib/`) rather than PowerShell, so their rules
can be unit-tested — see `tools/__tests__/`. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the full scheme, including
how to skip either step and what each one refuses to do.

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
.\tools\BuildAndDeployiOS.cmd -Profile development

# Daily loop on a physical Android device
.\tools\BuildAndDeployAndroid.cmd

# Ship an iOS TestFlight build (production profile + auto-submit)
.\tools\BuildAndDeployiOS.cmd
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
`.env` instead (see `.env.example`). The deploy scripts load `.env` before EAS
runs, so the prompt never falls back to its cached username.

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
clip — use `BuildAndDeployiOS.cmd -Profile development` or
`BuildAndDeployAndroid.cmd` on a real device.

```powershell
# Launch web preview on port 8081 (opens browser once Metro is ready)
.\tools\LaunchWeb.cmd

# Launch on an alternate port
.\tools\LaunchWeb.cmd -Port 8088

# Launch without opening a browser
.\tools\LaunchWeb.cmd -NoOpen
```

## Build log

`BuildAndDeployiOS.ps1` and `BuildAndDeployAndroidStore.ps1` append to
`tools/ps/ios-build-log.json` and `tools/ps/android-build-log.json`. Both files
are gitignored. They power the "X builds this month" summary that warns as you
approach the Expo free-tier cap (30 builds/month).
