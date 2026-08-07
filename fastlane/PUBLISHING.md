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

| Area | Automated here | You do once in the console |
| --- | --- | --- |
| Listing text, keywords, notes | ✅ deliver / supply | — |
| Screenshots + feature graphic | ✅ deliver / supply | — |
| Privacy label (Apple) | ✅ `privacy_details.json` | (first time) fill once, then `refresh_privacy_template` |
| Data Safety (Google) | ⚠️ answers in `data_safety.csv` | Export CSV for exact headers → import, or answer 3 questions in UI |
| Build upload + submit | ✅ EAS (`eas submit`) | — |
| Pricing & availability | ❌ | App Store Connect / Play Console |
| Bank, tax, agreements | ❌ | one-time account setup |
| Content rating (IARC) / age rating | ❌ | Play Console questionnaire; Apple age rating in ASC |

## Before you run anything — fill these in

1. **URLs** (currently placeholders): edit
   `metadata/en-US/marketing_url.txt`, `support_url.txt`, `privacy_url.txt`, and
   the Play privacy-policy field. Host `docs/privacy-policy.md` somewhere public
   (GitHub Pages works) and use that URL for `privacy_url.txt`.
2. **Review phone number**: `metadata/en-US/review_information/phone_number.txt`
   is a placeholder — set a real number Apple review can reach.
3. **Categories**: `metadata/primary_category.txt` = `MZGenre.Music`,
   secondary `MZGenre.Education`. Adjust if you prefer.

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

Edit captions or palette in `creative/render.py`, then:

```bash
cd fastlane/creative && python render.py full B    # B = chosen device treatment
```

Sizes are verified programmatically on write (a 1px miss is an Apple rejection).

## Feature check (keep copy honest)

Refrain has: A/B loop, waveform, saved segments, snippet preview, precise skip
(1–30s), count-in timer, bookmarks, volume, local library. It does **not** have
tempo/speed or pitch change — don't add those claims to the copy or captions.
