# Publishing Refrain

Everything the stores let you automate lives in this folder. Binaries are built
and submitted by **EAS** (`eas build` / `eas submit`, see `eas.json`); fastlane
here pushes the **store listing** — text, keywords, screenshots, and the
privacy declarations — which EAS does not manage.

```
fastlane/
  Appfile                     app + team ids
  Fastfile                    ios/android `listing` lanes
  Gemfile                     pins fastlane
  privacy_details.json        Apple privacy label (DATA_NOT_COLLECTED)
  creative/render.py          regenerates all screenshots + feature graphic + Play icon
  screenshots/en-US/          iOS screenshots: iPhone 6.9" (1320×2868)
                              and iPad 12.9" (2048×2732) — both uploaded by deliver
  screenshots-ipad13/en-US/   iPad 13" (2064×2752) — NOT uploaded, see below
  metadata/
    en-US/…                   iOS listing text + review info
    copyright.txt, *category  iOS app-level fields
    android/
      en-US/…                 Play listing text + changelog
      en-US/images/…          Play phone screenshots (1290×2796), feature graphic
                              (1024×500) and the 512×512 listing icon
      data_safety.csv         Play Data Safety answers (no data collected)
```

## iPad screenshots

`ios.supportsTablet` is true in `app.json`, so the listing is iPad compatible
and App Store Connect wants an iPad screenshot set alongside the iPhone one.
Apple's current size for that is 13-inch, 2064×2752.

`deliver` still rejects 2064×2752 as an invalid screen size. That is an open
fastlane bug, not a problem with the files ([#22030], [#29578]). So the
generator writes two iPad sets:

- **2048×2732** (12.9") into `screenshots/en-US/`. `deliver` accepts this
  size, so it goes up automatically with `fastlane ios listing`.
- **2064×2752** (13") into `screenshots-ipad13/en-US/`, deliberately outside
  the path `deliver` reads so it cannot fail the lane. Upload it by hand in
  App Store Connect if the 12.9" set does not satisfy the iPad slot.

Delete the 12.9" target from `render.py` once `deliver` learns the 13" size.

One caveat worth knowing: the captures in `assets/appstore_images/` are iPhone
captures, so the iPad slides show a phone-proportioned screen on a wider
canvas. That is honest for an app that is iPad _compatible_ rather than
iPad-specific. Replacing them means capturing the app on an iPad and rerunning
the generator, nothing more.

[#22030]: https://github.com/fastlane/fastlane/issues/22030
[#29578]: https://github.com/fastlane/fastlane/issues/29578

## What's automated vs. console-only

| Area                               | Automated here                  | You do once in the console                                         |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Listing text, keywords, notes      | ✅ deliver / supply             | —                                                                  |
| Screenshots + feature graphic      | ✅ deliver / supply             | iPad 13" set, only while the deliver bug above stands              |
| Play listing icon (512×512)        | ✅ supply                       | —                                                                  |
| Privacy label (Apple)              | ✅ `privacy_details.json`       | (first time) fill once, then `refresh_privacy_template`            |
| Data Safety (Google)               | ⚠️ answers in `data_safety.csv` | Export CSV for exact headers → import, or answer 3 questions in UI |
| Build upload + submit              | ✅ EAS (`eas submit`)           | —                                                                  |
| Release go-live gate               | ✅ Apple (`automatic_release`)  | Play: turn on **Managed publishing** (see below)                   |
| Pricing & availability             | ❌                              | App Store Connect / Play Console                                   |
| Bank, tax, agreements              | ❌                              | one-time account setup                                             |
| Content rating (IARC) / age rating | ❌                              | Play Console questionnaire; Apple age rating in ASC                |

Every console-only questionnaire — Apple's age rating, privacy label, export
compliance and trader status; Play's content rating, target audience, Data
Safety, advertising ID and foreground-service declaration — has a prepared
answer with its rationale in **[QUESTIONNAIRES.md](QUESTIONNAIRES.md)**. Fill
them from there rather than answering ad hoc; that document also lists the
outstanding submission blockers.

## Managed publishing and release gating

Both stores are set up so an approved release waits for a person before it goes
live. The two are gated in different places, and only one of them is gated by
this repo.

**Apple is gated in the repo.** [Fastfile](Fastfile) sets
`automatic_release: false`, which selects "Manually release this version". An
approved build sits in Pending Developer Release until you release it.

**Play is gated in the console, not the repo.** The android block in
[../eas.json](../eas.json) submits to `track: "production"` and sets no
`releaseStatus`, so EAS uses its default of `completed`. The only thing that
stops an approved release from rolling out is the **Managed publishing** toggle
in Play Console under Publishing overview. Turn it on before the first
`eas submit --platform android`, and do not read `track: "production"` in
`eas.json` as a mistake: it is deliberate, and it is safe only while that
toggle is on.

Managed publishing gates going live. It does not stop a submission entering
review, so a production-track submission is still reviewed as a production
release. It just waits for your publish click afterwards.

## Before you run anything — fill these in

1. **URLs** are set to the real domain in `metadata/en-US/` —
   `marketing_url.txt` (`/refrain/`), `support_url.txt` (`/refrain/support`),
   and `privacy_url.txt` (`/refrain/privacy`). **All three pages must be live
   before you submit.** Publish `docs/privacy-policy.md` at `/refrain/privacy`;
   `precheck` fails on a broken URL, and both stores reject an unreachable
   privacy policy.
2. **Review contact**: `metadata/en-US/review_information/` carries the real
   App Review contact: Adrienne Bosch, `support@subvertingcomplexity.com`,
   `+27713280153`. Apple uses these to reach you during review, so keep them
   current. Leave `demo_user.txt` and `demo_password.txt` absent; their absence
   is what clears the "Sign-in required" tick in App Store Connect.
3. **Categories**: `metadata/primary_category.txt` = `MZGenre.Music`,
   secondary `MZGenre.Education`. Adjust if you prefer.
4. **App Store name**: the canonical iOS display name is
   `Refrain: Audio Looper` (`metadata/en-US/name.txt`), matching App Store
   Connect. The Play listing title is `Refrain: A/B Loop Player`
   (`metadata/android/en-US/title.txt`) — the two stores intentionally carry
   different titles; don't reconcile them to match each other.

## Credentials (never commit)

**iOS** — App Store Connect → Users and Access → Integrations → App Store
Connect API. Create a key with **App Manager** role, download the `.p8` once.

```bash
export ASC_KEY_ID="XXXXXXXXXX"
export ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export ASC_KEY_CONTENT="$(cat AuthKey_XXXXXXXXXX.p8)"   # raw contents, incl. BEGIN/END
export APPLE_ID="<the Apple Developer account email>"
```

**Android** — a Google Cloud service-account JSON granted access in Play Console
→ Users and permissions. Point to it (the file is git-ignored):

```bash
export SUPPLY_JSON_KEY="./pc-api-key.json"
```

**From `.env` instead of a shell.** The deploy script loads the gitignored
`.env` and hands these to fastlane, which is how a release on Windows gets
them. One difference: a `.env` file holds one `KEY=VALUE` per line and cannot
carry the newlines a PEM block needs, so set **`ASC_KEY_PATH`** to the `.p8`
file's path rather than pasting its contents into `ASC_KEY_CONTENT`. The
Fastfile takes either; `.p8` is gitignored. See `.env.example`.

## Run

```bash
cd fastlane && bundle install          # once

# iOS — push listing (metadata + screenshots + privacy label)
bundle exec fastlane ios listing
# …and submit the current build for review:
bundle exec fastlane ios listing submit:true

# Android — push Play listing (metadata + screenshots + feature graphic)
bundle exec fastlane android listing
```

`ios listing` runs `precheck` first to catch common rejection triggers
(placeholder text, other-platform mentions, broken URLs).

### The release runs these for you

A store-lane release (`tools\Deploy.cmd`) pushes each platform's listing after
that platform's binary submit, and by default only when that platform's listing
files have changed since the last store release that actually left the store
carrying them. A release whose listing push failed, or that ran with
`-Listing off`, is passed over as the comparison point in favour of the one
before it, so a single failure does not leave the store page stuck on the old
copy. `-Listing on` pushes regardless, `-Listing off` skips it.

For a listing change that needs no new binary, there is a third route that does
not involve a build at all:

```powershell
.\tools\Deploy.cmd -ListingOnly -Platform android
```

That runs the same fastlane lane as the commands above, with the credential
preflight and `.env` loading a release gets, but no build, no submit, no version
bump and no release branch. The bare `bundle exec fastlane` commands above are
still the right thing for finishing a push that failed partway, or for anything
that needs a lane argument such as `submit:true`.

Three things the release deliberately does not do:

- **The fast lane never pushes the public listing.** TestFlight carries its own
  "What to Test" text and the Play internal track does not use the production
  listing, so pushing public copy from a tester build would publish changes
  nobody asked to publish.
- **`-NoSubmit` never pushes the listing.** The listing follows the binary
  submit, so a build-only run has nothing for it to follow, and pushing anyway
  would describe a build that never left the machine.
- **`submit:true` is never part of a release run.** Submitting for review needs
  a build Apple has finished processing, which takes 5 to 15 minutes and is
  outside our control. Run it yourself once TestFlight shows the build as
  processed.

See [`../docs/RELEASING.md`](../docs/RELEASING.md) for the whole flow.

## Regenerating screenshots

Slides are data, not code: drop the new raw capture in
`assets/appstore_images/`, then add or edit its entry in
`creative/slides.json` (`id` = filename without extension, `cap_lead` /
`cap_accent` = the two-part caption). No Python changes needed for a normal
swap — only touch `creative/render.py` to change the palette, device frame,
or banner layout. Google Play caps phone screenshots at 8, so keep
`slides.json` at 8 entries or fewer (`render.py` raises if you exceed it).
Then:

```bash
cd fastlane/creative && python render.py full B    # B = chosen device treatment
```

Sizes are verified programmatically on write (a 1px miss is an Apple rejection).

## Feature check (keep copy honest)

Refrain has: A/B loop, waveform, saved segments, snippet preview, precise skip
(1s–5m), count-in timer, bookmarks, volume, local library. It does **not** have
tempo/speed or pitch change; don't add those claims to the copy or captions.

Store copy follows [`docs/ui-writing-style.md`](../docs/ui-writing-style.md):
plain descriptions, no em dashes, no personification.
