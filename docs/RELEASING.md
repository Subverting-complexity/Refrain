# Releasing

How Refrain's store builds are versioned and submitted, and how to
recover when a submission is rejected for a duplicate build number.

## Version management

- `expo.version` in `app.json` is the user-facing marketing version
  (`1.0.0`). Bump it by hand for each release.
- The **build number** (iOS `CFBundleVersion` / Android `versionCode`)
  is managed **remotely by EAS** (`cli.appVersionSource: "remote"` in
  `eas.json`) and auto-incremented per production build
  (`build.production.autoIncrement: true`). It is _not_ stored in this
  repo — `app.json` intentionally has no `ios.buildNumber`.

## iOS submission fails with "bundle version must be higher than …"

Symptom (from `eas submit`):

```
The provided entity includes an attribute with a value that has already
been used. The bundle version must be higher than the previously
uploaded version: '8'.
```

Cause: EAS's remote build-number counter is **behind App Store
Connect**. This happens when builds were uploaded outside the EAS
counter (via Xcode/Transporter, or before remote versioning was
enabled), so App Store Connect has already seen a higher
`CFBundleVersion` than the one EAS stamped on the build.

Fix — set the remote counter above the last uploaded bundle version,
then rebuild and resubmit:

```bash
# One-time: raise the counter past App Store Connect's latest (8 → 9+)
eas build:version:set --platform ios
# Enter a build number of 9 (or higher).

# Rebuild so the new number is baked into the .ipa, then submit.
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Note that resubmitting the _existing_ `.ipa` cannot work: the build
number is baked into the archive at build time, so a rebuild is
required after raising the counter.

To inspect the current remote values at any time:

```bash
eas build:version:get --platform ios
```
