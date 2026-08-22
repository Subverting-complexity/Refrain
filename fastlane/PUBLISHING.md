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
  creative/render.py          regenerates all screenshots + feature graphic
  screenshots/en-US/          iOS screenshots (1320×2868)
  metadata/
    en-US/…                   iOS listing text + review info
    copyright.txt, *category  iOS app-level fields
    android/
      en-US/…                 Play listing text + changelog
      en-US/images/…          Play phone screenshots (1290×2796) + feature graphic (1024×500)
      data_safety.csv         Play Data Safety answers (no data collected)
```

## What's automated vs. console-only

| Area                               | Automated here                  | You do once in the console                                         |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Listing text, keywords, notes      | ✅ deliver / supply             | —                                                                  |
| Screenshots + feature graphic      | ✅ deliver / supply             | —                                                                  |
| Privacy label (Apple)              | ✅ `privacy_details.json`       | (first time) fill once, then `refresh_privacy_template`            |
| Data Safety (Google)               | ⚠️ answers in `data_safety.csv` | Export CSV for exact headers → import, or answer 3 questions in UI |
| Build upload + submit              | ✅ EAS (`eas submit`)           | —                                                                  |
| Pricing & availability             | ❌                              | App Store Connect / Play Console                                   |
| Bank, tax, agreements              | ❌                              | one-time account setup                                             |
| Content rating (IARC) / age rating | ❌                              | Play Console questionnaire; Apple age rating in ASC                |

Every console-only questionnaire — Apple's age rating, privacy label, export
compliance and trader status; Play's content rating, target audience, Data
Safety, advertising ID and foreground-service declaration — has a prepared
answer with its rationale in **[QUESTIONNAIRES.md](QUESTIONNAIRES.md)**. Fill
them from there rather than answering ad hoc; that document also lists the
outstanding submission blockers.

## Before you run anything — fill these in

1. **URLs** are set to the real domain in `metadata/en-US/` —
   `marketing_url.txt` (`/refrain/`), `support_url.txt` (`/refrain/support`),
   and `privacy_url.txt` (`/refrain/privacy`). **All three pages must be live
   before you submit.** Publish `docs/privacy-policy.md` at `/refrain/privacy`;
   `precheck` fails on a broken URL, and both stores reject an unreachable
   privacy policy.
2. **Review phone number**: `metadata/en-US/review_information/phone_number.txt`
   is a placeholder — set a real number Apple review can reach.
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
export APPLE_ID="adrienne.bosch7@icloud.com"
```

**Android** — a Google Cloud service-account JSON granted access in Play Console
→ Users and permissions. Point to it (the file is git-ignored):

```bash
export SUPPLY_JSON_KEY="./pc-api-key.json"
```

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
