# Store questionnaire answer sheet — Refrain

Every questionnaire App Store Connect and Google Play Console ask before a
first release, with the answer for Refrain and the reason behind it.

**Audience:** an agent or operator filling these in against the live consoles.
**Companion docs:** [PUBLISHING.md](PUBLISHING.md) (what fastlane automates),
[../docs/RELEASING.md](../docs/RELEASING.md) (builds, EAS, versioning).

---

## 0. How to use this document

1. **Answers are derived from code, not assumed.** Section 1 is the evidence
   base. If a console question is not covered here, answer it from Section 1
   rather than guessing, and add it to this document afterwards.
2. **Console wording drifts.** Apple and Google reword and reorder these forms
   regularly. Match on _meaning_, not on exact string. Where a question here
   has no counterpart on screen, skip it; where a question on screen has no
   counterpart here, stop and check Section 1 before answering.
3. **Never invent a fact about data handling.** "No data collected" is the
   single claim both stores will hold Refrain to. It is true today
   (Section 1.3). If any future build adds analytics, crash reporting, ads, an
   account system, or a network call, every privacy answer in this document is
   void and must be redone.
4. **Humans keep the credentials and the final click.** Signing in, 2FA, tax
   and banking forms, accepting agreements, and pressing _Submit for Review_ /
   _Send for review_ stay with the account holder. An agent fills fields and
   reports what it filled.
5. **Blockers first.** Section 4 lists the things that must be true before any
   of this can be submitted. Read it before starting.

---

## 1. Ground truth — what Refrain actually is

### 1.1 Identity

| Field                    | Value                                          |
| ------------------------ | ---------------------------------------------- |
| App name (iOS)           | Refrain: Audio Looper                          |
| App title (Play)         | Refrain: A/B Loop Player                       |
| Bundle ID / package      | `com.subvertingcomplexity.refrain`             |
| Apple Team ID            | `JTUZQBUGVY` — SUBVERTING COMPLEXITY (PTY) LTD |
| App Store Connect app ID | `6780801245`                                   |
| Apple ID (account)       | Not recorded here — public repo; see `.env`    |
| SKU                      | `Refrain`                                      |
| Marketing version        | `1.0.0` (`expo.version` in `app.json`)         |
| Build number             | managed remotely by EAS, auto-incremented      |
| Publisher / copyright    | 2026 Subverting Complexity                     |
| iOS categories           | Primary Music, secondary Education             |
| Play category            | Music & Audio                                  |

Sources: [app.json](../app.json), [eas.json](../eas.json), [Appfile](Appfile),
[metadata/](metadata/).

### 1.2 What the app does

A local audio loop player for practice and rehearsal. The user imports an audio
file already on their device (MP3, WAV, AAC, M4A), sets A and B markers on a
waveform, and loops that section. It also has saved segments, snippet preview,
precise skip, a count-in timer, bookmarks, volume control, and a local library
with folders.

It does **not** have tempo/speed change or pitch shift. Do not let any store
copy or questionnaire answer imply otherwise.

### 1.3 Data handling — the basis of every privacy answer

| Claim                                          | Status | Evidence                                                                                                                                                                                                   |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No user accounts, no sign-up, no login         | True   | No auth dependency in [package.json](../package.json); no login route in `app/`                                                                                                                            |
| No analytics, ads, attribution, or crash SDK   | True   | Dependency list is Expo/React Native core only — no Firebase, Sentry, AdMob, Facebook SDK                                                                                                                  |
| No network requests in the shipped apps        | True   | The only `fetch` calls are `src/services/fileImport.web.ts` and `src/services/waveformAnalyzer.web.ts`, both reading local `blob:` object URLs on the **web** target, which is not shipped to either store |
| Imported audio never leaves the device         | True   | `importFromFile` copies the picked file into the app sandbox at `Paths.document/tracks` ([fileImport.ts](../src/services/fileImport.ts))                                                                   |
| Loops, segments, bookmarks, settings are local | True   | `expo-sqlite` via [database.ts](../src/services/database.ts) and the `*Store.ts` services                                                                                                                  |
| No microphone / recording                      | True   | `expo-audio` plugin configured `microphonePermission: false`, `recordAudioAndroid: false` ([app.json](../app.json))                                                                                        |
| No location, contacts, camera, photos          | True   | No such permission or usage-description anywhere in `app.json`                                                                                                                                             |
| No in-app purchases or subscriptions           | True   | No IAP/billing dependency; free app                                                                                                                                                                        |
| No user-generated content shared with others   | True   | No sharing-out, comments, profiles, or social surface — only _sharing in_ via the share extension                                                                                                          |
| No third-party content bundled or fetched      | True   | The user supplies their own audio; the app cannot search, browse, or download                                                                                                                              |
| No advertising identifier (IDFA / AD_ID)       | True   | No ads or attribution SDK to request one                                                                                                                                                                   |

### 1.4 Permissions and capabilities, and why each exists

| Platform | Permission / capability                                       | Why                                                           | Questionnaire impact                                          |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| iOS      | `UIBackgroundModes: audio`                                    | Loop keeps playing when backgrounded / screen off             | Review will verify the behaviour; call it out in review notes |
| iOS      | App Group `group.com.subvertingcomplexity.refrain`            | Hands a shared audio file from the share extension to the app | None                                                          |
| iOS      | `CFBundleDocumentTypes` + `LSSupportsOpeningDocumentsInPlace` | "Open in Refrain" from Files and other apps                   | None                                                          |
| iOS      | `ITSAppUsesNonExemptEncryption: false`                        | No custom crypto                                              | Skips the export-compliance prompt (§2.3)                     |
| Android  | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`    | Background loop playback                                      | **Requires the Play foreground-service declaration (§3.8)**   |
| Android  | `WAKE_LOCK`                                                   | Keeps playback alive with the screen off                      | None                                                          |
| Android  | `MODIFY_AUDIO_SETTINGS`                                       | Volume / audio routing for playback                           | None                                                          |
| Android  | Intent filters for audio MIME types                           | Open and share-to from other apps                             | None                                                          |

Note what is **absent** on Android: no `READ_MEDIA_AUDIO`, no
`READ_EXTERNAL_STORAGE`, no `AD_ID`. File import goes through the system
document picker, so no media-permission declaration is owed (§3.10).

### 1.5 Canonical URLs

| Purpose             | URL                                                |
| ------------------- | -------------------------------------------------- |
| Marketing / product | `https://subvertingcomplexity.com/refrain/`        |
| Privacy policy      | `https://subvertingcomplexity.com/refrain/privacy` |
| Terms of use        | `https://subvertingcomplexity.com/refrain/terms`   |
| Support             | `https://subvertingcomplexity.com/refrain/support` |
| Support email       | `support@subvertingcomplexity.com`                 |

[../docs/privacy-policy.md](../docs/privacy-policy.md) is an early draft, not
the text currently served at that URL. See 4.2.

---

## 2. Apple — App Store Connect

### 2.1 App Privacy (the "nutrition label")

**Answer: "Data Not Collected" — the entire questionnaire resolves on the first
screen.**

| Question                                                        | Answer |
| --------------------------------------------------------------- | ------ |
| Do you or your third-party partners collect data from this app? | **No** |

Selecting _No_ dismisses every per-data-type page (Contact Info, Health,
Financial, Location, Sensitive Info, Contacts, User Content, Browsing History,
Search History, Identifiers, Usage Data, Diagnostics, Purchases, Other Data).
Do not answer them individually.

Apple defines "collect" as transmitting data off the device. Audio the user
imports is copied inside the app's own sandbox and never transmitted, so it is
**not** collected. Same for loops, bookmarks, and settings.

**This one is already automated.** [privacy_details.json](privacy_details.json)
holds `DATA_NOT_COLLECTED` and `fastlane ios listing` pushes it via
`upload_app_privacy_details_to_app_store`. Fill it in the console only if the
API push fails or Apple demands a manual pass first — and if you do fill it by
hand, run `fastlane ios refresh_privacy_template` afterwards to capture the
exact enum JSON back into the repo.

**Privacy Policy URL:** `https://subvertingcomplexity.com/refrain/privacy`
(required). **Privacy Choices URL:** leave blank — nothing to opt out of.

### 2.2 Age Rating

Apple's questionnaire covers content frequency, then app capabilities. Every
content answer for Refrain is **None**, and every capability answer is **No**.
Expected result: **4+**.

Content frequency — answer **None** for all:

- Cartoon or Fantasy Violence
- Realistic Violence / Prolonged Graphic or Sadistic Realistic Violence
- Sexual Content or Nudity / Graphic Sexual Content or Nudity
- Profanity or Crude Humor
- Alcohol, Tobacco, or Drug Use or References
- Mature or Suggestive Themes
- Horror or Fear Themes
- Medical or Treatment Information
- Simulated Gambling / Contests
- Violent or Sexual References involving real people

Capabilities and distribution — answer **No** to all:

| Question                                                     | Answer | Why                                                                                                                                                                 |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unrestricted web access (a browser or arbitrary web content) | **No** | No WebView, no browsing surface                                                                                                                                     |
| User-generated content, or user-to-user communication        | **No** | §1.3 — nothing is shared with other users                                                                                                                           |
| Does the app contain messaging or chat?                      | **No** | None                                                                                                                                                                |
| Does the app show advertisements?                            | **No** | No ad SDK                                                                                                                                                           |
| In-app purchases                                             | **No** | Free, no IAP                                                                                                                                                        |
| Gambling / real-money gaming / contests                      | **No** | None                                                                                                                                                                |
| Does the app include parental controls or in-app age gating? | **No** | Nothing to gate                                                                                                                                                     |
| Made for Kids / Kids Category                                | **No** | **Deliberate.** The app is age-appropriate for all ages, but opting into the Kids Category triggers Apple's stricter Kids rules. There is no reason to take that on |

If the console presents a question not on this list, answer it from §1.2–§1.4
and add it here.

### 2.3 Export compliance

`ITSAppUsesNonExemptEncryption: false` is already set in
[app.json](../app.json), so Apple should skip this entirely. If it is asked
anyway:

| Question                                                  | Answer                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| Does your app use encryption?                             | **No** (nothing beyond what the OS provides) |
| Does your app qualify for any of the exemptions provided? | N/A — not reached                            |

No French encryption declaration is triggered by a _No_.

### 2.4 Content rights

| Question                                                       | Answer |
| -------------------------------------------------------------- | ------ |
| Does your app contain, display, or access third-party content? | **No** |

The user supplies their own audio from their own device. The app has no
catalogue, no search, and no download path. Worth stating plainly in the review
notes (§2.5) — loop and player apps sometimes draw a copyright question from
reviewers, and the answer is that Refrain cannot obtain content on its own.

### 2.5 App Review Information

Already in the repo under
[metadata/en-US/review_information/](metadata/en-US/review_information/) and
pushed by `fastlane ios listing`:

| Field             | Value                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| First / last name | Adrienne / Bosch                                                                     |
| Email             | `support@subvertingcomplexity.com`                                                   |
| Phone             | `+27713280153`                                                                       |
| Sign-in required  | **No** — leave demo account fields empty                                             |
| Notes             | See `notes.txt` — explains that no login is needed and how to exercise every feature |
| Attachment        | Not needed                                                                           |

Consider adding one line to the notes covering background audio, since
`UIBackgroundModes: audio` is declared and reviewers check that a declared
capability is genuinely used: _"Playback and looping continue when the app is
backgrounded or the screen is locked."_

### 2.6 Version information and availability

| Field                                                                           | Answer                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Advertising Identifier (IDFA) — "Does this app use the Advertising Identifier?" | **No**                                                    |
| Version release                                                                 | Manual release (fastlane sets `automatic_release: false`) |
| Price                                                                           | Free (confirm with the account holder)                    |
| Availability                                                                    | All territories unless the account holder says otherwise  |
| Content rights / third-party                                                    | No (§2.4)                                                 |
| Sign-in information                                                             | Not required                                              |

Listing text, subtitle, keywords, promotional text, release notes, categories,
copyright, and screenshots are all in [metadata/](metadata/) and pushed by
fastlane. Do not retype them into the console — edit the files and re-push, or
the two will drift.

### 2.7 EU Digital Services Act — trader status

Apple requires a trader declaration for apps distributed in the EU, and the
details are verified against public records before the app can stay available
there.

| Field                                               | Answer                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Are you a trader?                                   | **Yes** — the account is a registered company, SUBVERTING COMPLEXITY (PTY) LTD |
| Legal entity name, registered address, phone, email | **Needs the account holder** — must match the company registration exactly     |

This is not derivable from the codebase. Flag it to the account holder rather
than guessing; a mismatch here removes the app from EU storefronts.

---

## 3. Google Play — App content and store settings

Play splits these across **App content** (the questionnaires) and **Store
settings** (category and contact details). Every item under App content must be
complete before a production release.

### 3.1 Privacy policy

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| Privacy policy URL | `https://subvertingcomplexity.com/refrain/privacy` |

Must be live and publicly reachable before submission (§4.2).

### 3.2 App access

| Question                            | Answer                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| Is any part of your app restricted? | **All functionality is available without special access** |

No accounts, no login, no gated features. No credentials to supply.

### 3.3 Ads

| Question                   | Answer |
| -------------------------- | ------ |
| Does your app contain ads? | **No** |

Keeps the "Contains ads" badge off the listing.

### 3.4 Content rating (IARC questionnaire)

Google generates ratings for every region from one questionnaire.

| Field         | Answer                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Email address | `support@subvertingcomplexity.com`                                                                                              |
| Category      | **Utility, Productivity, Communication, or Other** — not a Game category, and not Reference/News/Educational. Refrain is a tool |

Then answer **No** to every content question, including: violence, sexuality,
language, controlled substances, gambling and simulated gambling, horror, crude
humour, and discrimination.

Interactive-elements questions, all **No**:

| Question                                                                     | Answer | Why                       |
| ---------------------------------------------------------------------------- | ------ | ------------------------- |
| Do users interact or exchange content with each other?                       | **No** | No social surface         |
| Does the app share the user's location with other users?                     | **No** | No location access at all |
| Does the app allow the purchase of digital goods?                            | **No** | Free, no IAP              |
| Does the app contain user-generated content the developer does not moderate? | **No** | Nothing is published      |
| Is the app a web browser or search engine?                                   | **No** | Neither                   |
| Does the app collect or share personal information?                          | **No** | §1.3                      |

Expected outcome: ESRB **Everyone**, PEGI **3**, USK **0**, and equivalents.

### 3.5 Target audience and content

| Question                                                           | Answer                         |
| ------------------------------------------------------------------ | ------------------------------ |
| Target age groups                                                  | **13–15, 16–17, and 18+ only** |
| Is your app designed for children (Designed for Families)?         | **No**                         |
| Appeal to children — could it unintentionally appeal to under-13s? | **No**                         |

**This is a judgement call worth understanding, not just copying.** The app's
content is fine for any age, but ticking any under-13 age band opts Refrain into
Google's Families policy, which brings extra requirements around ads, SDKs, and
content review with no benefit here. Declaring 13+ is the standard choice for a
general-purpose tool. If the account holder specifically wants under-13
targeting, that decision needs to be made deliberately and this section redone.

### 3.6 Data safety

**Answer: no data collected, no data shared.**

| Question                                                            | Answer                             |
| ------------------------------------------------------------------- | ---------------------------------- |
| Does your app collect or share any of the required user data types? | **No**                             |
| Is all user data encrypted in transit?                              | Not applicable — no data collected |
| Do you provide a way for users to request data deletion?            | Not applicable — no data collected |

Because the first answer is **No**, every per-type row (Location, Personal info,
Financial info, Health and fitness, Messages, Photos and videos, **Audio
files**, Files and docs, Calendar, Contacts, App activity, Web browsing, App
info and performance, Device or other IDs) is **Collected = No, Shared = No**.

On audio specifically: files the user imports are read and stored locally only,
which is not "collection" under Google's definition. Same reasoning as §2.1.

The canonical answers also live in
[metadata/android/data_safety.csv](metadata/android/data_safety.csv). If you
import rather than click through, **export the CSV from this console first** —
the schema is versioned per-console and an import overwrites everything.

### 3.7 Advertising ID

| Question                             | Answer |
| ------------------------------------ | ------ |
| Does your app use an advertising ID? | **No** |

Before submitting, confirm nothing pulled the permission in transitively:
inspect the merged manifest of the release AAB and check that
`com.google.android.gms.permission.AD_ID` is absent. Declaring _No_ while the
permission is present is a rejection.

### 3.8 Foreground service permissions — **needs preparation**

Refrain declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, so Play requires a
declaration for it. This is the one Play item that needs work beyond ticking a
box.

| Field                   | Answer                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground service type | **mediaPlayback**                                                                                                                                                         |
| What is the feature?    | Continuous looped playback of an audio file the user imported and started, so practice continues when the app is backgrounded or the screen is locked                     |
| Why is it required?     | Playback must survive backgrounding; without it Android suspends audio when the user leaves the app or locks the screen, which defeats the app's purpose                  |
| Is it user-initiated?   | Yes — playback only ever starts from an explicit user action                                                                                                              |
| Video demonstration     | **Google usually requires a link to a short video showing the feature in use.** It has to be recorded and hosted (an unlisted YouTube link is the normal route). See §4.3 |

### 3.9 Remaining App content declarations

| Declaration                                   | Answer                       |
| --------------------------------------------- | ---------------------------- |
| News app                                      | **No**                       |
| COVID-19 contact tracing or status            | **No**                       |
| Government app                                | **No**                       |
| Financial features                            | **None of these**            |
| Health apps                                   | **No**                       |
| Data deletion (external account deletion URL) | Not applicable — no accounts |

### 3.10 Photo and video permissions

Not applicable. Refrain requests no `READ_MEDIA_*` permission; import goes
through the system document picker (§1.4). If the console shows this
declaration, the answer is that the app does not request broad photo/video
access.

### 3.11 Store settings

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| App category    | Music & Audio                                                |
| Tags            | Choose from Play's fixed list — music tools / audio players  |
| Contact email   | `support@subvertingcomplexity.com`                           |
| Contact website | `https://subvertingcomplexity.com/refrain/`                  |
| Contact phone   | Optional — supply only if the account holder wants it public |

Title, short description, full description, screenshots, feature graphic, and
changelog are in [metadata/android/](metadata/android/) and pushed by
`fastlane android listing`. Edit the files, not the console.

### 3.12 Account-level prerequisites

Not per-app, but they block the first release:

- **Developer account verification** — organisation accounts need verified legal
  name, address, and a **D-U-N-S number**.
- **EU trader status** — same declaration as Apple's (§2.7), with contact
  details published on the listing.
- **Payments profile** — needed even for a free app in some flows.

All three need the account holder. None can be answered from the codebase.

---

## 4. Blockers — resolve before submitting

### 4.1 Neither store listing has been populated yet

Console state as audited on **28 August 2026**. This is a point-in-time
snapshot taken in the consoles, not something the repo can verify, so re-check
it before acting on it.

**Google Play.** All App content declarations are complete: category, contact
email, privacy policy, app access, ads, content rating, target audience, data
safety, government apps, financial features, and health. Developer identity,
website, and Android developer verification are cleared. Outstanding:

- The default store listing has never been created. Every field is empty,
  including title, short description, full description, icon, feature graphic,
  and screenshots. `fastlane android listing` fills all of these from
  [metadata/android/](metadata/android/).
- No app bundle has ever been uploaded, so there are no releases on any track.
  See the first-upload note in [../docs/RELEASING.md](../docs/RELEASING.md).
- Countries and regions are not selected. Console-only, account holder.

**Apple.** Version 1.0 is in Prepare for Submission. App name, categories, age
rating, privacy labels, privacy policy URL, pricing across 175 countries,
content rights, and the license agreement are all done. Outstanding:

- Version metadata is blank: subtitle, promotional text, description,
  keywords, support URL, marketing URL, copyright. `fastlane ios listing`
  fills all of these from [metadata/en-US/](metadata/en-US/).
- Screenshots: 4 images on the iPhone 6.5" set only, nothing on iPad. The repo
  holds 8 iPhone 6.9" and 8 iPad 12.9" images that `deliver` uploads, plus an
  iPad 13" set that still needs the manual upload described in
  [PUBLISHING.md](PUBLISHING.md).
- No build attached, and no builds in the account at all, so TestFlight is
  empty.
- App Review Information has "Sign-in required" ticked with blank credentials.
  Refrain has no accounts, so this is wrong. Pushing the review information
  block with no `demo_user.txt` / `demo_password.txt` present clears it (2.5).

### 4.2 Website pages — verified live 28 Aug 2026

All four URLs return HTTP 200:

| URL                | Role                                                  |
| ------------------ | ----------------------------------------------------- |
| `/refrain/`        | Apple marketing URL, Play contact website             |
| `/refrain/privacy` | Privacy policy. Both stores reject an unreachable one |
| `/refrain/support` | Support page. Apple requires it and checks it         |
| `/refrain/terms`   | Terms of service                                      |

`fastlane ios listing` runs `precheck`, which fails on a broken URL before
uploading anything, so re-check these if the site is redeployed shortly before a
submission.

**Drift worth knowing about.** The website is the published source of truth, not
this repo. The live privacy page is a substantially longer document than
[../docs/privacy-policy.md](../docs/privacy-policy.md), roughly 9,000 characters
of text against 1,500 in the repo, and it is structured around a South African
Information Officer and the Information Regulator. The live terms page has no
counterpart in the repo at all. Do not assume `docs/privacy-policy.md` is the
text being served, and do not publish it over the live page without comparing
them first.

### 4.3 Foreground-service demo video (Android)

§3.8 needs a short screen recording of background playback, hosted at a stable
link. Nothing else in the release depends on it, but the Play release cannot go
out until the declaration is complete.

### 4.4 Trader status and account verification

§2.7 and §3.12 need company registration details from the account holder.

---

## 5. Post-fill verification

- [ ] Apple: App Privacy shows **Data Not Collected**, no per-type rows
- [ ] Apple: age rating resolves to **4+**, Kids Category **not** selected
- [ ] Apple: export compliance not blocking; IDFA answered **No**
- [ ] Apple: review contact phone is a real number
- [ ] Apple: `fastlane ios listing` runs clean, precheck included
- [ ] Play: every **App content** item shows complete
- [ ] Play: content rating issued (expect Everyone / PEGI 3)
- [ ] Play: Data safety shows no collection and no sharing
- [ ] Play: foreground-service declaration accepted
- [ ] Play: release AAB merged manifest has no `AD_ID` permission
- [ ] Both: privacy policy URL loads publicly in a signed-out browser
- [ ] Both: listing text matches [metadata/](metadata/) — no console-only edits

---

## 6. What invalidates this document

Redo the privacy answers (§2.1, §3.6) and re-check the age and content answers
if a future build adds any of: an analytics or crash-reporting SDK, advertising,
user accounts or cloud sync, a network request of any kind, in-app purchases,
sharing content between users, a WebView or in-app browser, or microphone
recording. Each of those changes at least one answer in both stores.
