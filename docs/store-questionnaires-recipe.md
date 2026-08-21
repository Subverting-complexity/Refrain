# Recipe: store questionnaire answer sheet

A portable spec for building the kind of document this repo has at
[../fastlane/QUESTIONNAIRES.md](../fastlane/QUESTIONNAIRES.md), in any mobile
app project.

This file is deliberately project-agnostic — nothing in it is specific to
Refrain. Hand it to an agent working in another repo, or follow it yourself.
Note that the pattern is repo-local: no installed skill or plugin produces this
document, so each project needs it built from scratch.

The discovery pass in Step 1 is where the value is. An answer sheet written from
what someone believes the app does, rather than from the dependency list and the
manifest, is worse than no document at all, because it will be trusted.

---

## TASK: build a store questionnaire answer sheet for this project

Create `fastlane/QUESTIONNAIRES.md` (or `docs/store/QUESTIONNAIRES.md` if the
repo has no fastlane directory): a prepared, evidence-backed answer for every
questionnaire App Store Connect and Google Play Console ask before a release.

The goal is that whoever sits in front of the consoles — human or agent — never
guesses, and every answer can be traced back to something in this codebase.

### Step 1 — discovery pass (do this before writing a word)

Gather ground truth from the repo itself. Never accept a claim you have not
checked. Depending on the stack, look at:

- **Identity**: app manifest / `app.json` / `Info.plist` / `build.gradle` /
  `pubspec.yaml` / fastlane `Appfile` — bundle ID and package name, team ID,
  store app IDs, marketing version, where the build number comes from, publisher
  and copyright, store categories.
- **Dependencies**: the lockfile and manifest. Specifically hunt for analytics,
  crash reporting, attribution, ads, auth/identity, payments/IAP, push, and
  anything with a vendor SDK. Their presence or absence is the single most
  load-bearing fact in the whole document.
- **Network**: every outbound call — `fetch`, HTTP clients, WebSocket, WebView,
  in-app browser, remote config, OTA update channels. Note which platform
  targets each one ships on; a call that only exists on a web build that is not
  submitted to a store is a different answer from one in the shipped binary, but
  you must say so explicitly.
- **Storage**: where user content and settings live. On-device sandbox, local
  database, keychain, or a remote backend. "Never leaves the device" is a claim
  you must be able to point at import/persistence code to support.
- **Permissions and capabilities**: iOS entitlements, background modes, usage
  descriptions, app groups, document types; Android manifest permissions,
  foreground service types, intent filters. Note what is _absent_ too — a missing
  media or advertising-ID permission is itself an answer.
- **Monetisation and user-to-user surfaces**: IAP, subscriptions, ads, sharing
  between users, comments, profiles, chat, UGC. Each of these flips answers in
  both stores.
- **Existing automation**: which of these answers a fastlane lane or CI job
  already pushes, and which are console-only.

### Step 2 — document structure (six sections, this order)

#### §0 How to use this document

State the rules of engagement up front:

1. Answers derive from code, not assumption. §1 is the evidence base; anything
   not covered gets answered from §1 and then added to the document.
2. Console wording drifts. Apple and Google reword and reorder these forms.
   Match on meaning, not on exact string. A question on screen with no
   counterpart here means stop and re-check §1 before answering.
3. Never invent a fact about data handling. Whatever the app's privacy claim is,
   both stores will hold the project to it.
4. Humans keep credentials and the final click. Sign-in, 2FA, tax and banking
   forms, accepting agreements, and pressing Submit stay with the account holder.
   An agent fills fields and reports what it filled.
5. Blockers first — §4 before starting anything.

#### §1 Ground truth

The evidence base every later answer cites.

- **1.1 Identity** — table of the facts from discovery, with a "Sources:" line
  linking the files they came from.
- **1.2 What the app does** — a plain description, plus an explicit list of what
  it does _not_ do, so no store copy or answer over-claims.
- **1.3 Data handling** — a `Claim | Status | Evidence` table. One row per
  privacy-relevant claim (accounts, analytics, network, where user content
  lives, mic/camera/location/contacts/photos, IAP, UGC sharing, third-party
  content, advertising identifier). Evidence cites a file, dependency, or config
  key — never "verified" on its own.
- **1.4 Permissions and capabilities** — a
  `Platform | Permission | Why it exists | Questionnaire impact` table. The
  impact column is what makes this useful: it links each permission to the
  section it forces, and marks the ones review will actually test.
- **1.5 Canonical URLs** — marketing, privacy policy, terms, support, support
  email, and where the privacy policy source text lives in the repo.

#### §2 Apple — App Store Connect

One subsection per questionnaire: App Privacy (nutrition label), Age Rating,
Export Compliance, Content Rights, App Review Information, Version Information
and availability, EU Digital Services Act trader status. Add IDFA and Kids
Category if they apply.

#### §3 Google Play — App content and store settings

One subsection per item: Privacy policy, App access, Ads, Content rating (IARC),
Target audience and content, Data safety, Advertising ID, Foreground service
permissions, remaining App content declarations, photo/video permissions, Store
settings, account-level prerequisites.

#### §4 Blockers

Everything that must be true before submission, each with the file to edit or
the artefact to produce. Typical members: placeholder contact details in
metadata, website pages that must be live, demo videos or justification text a
declaration requires, account-level verification the developer must complete.

#### §5 Post-fill verification

A checkbox list of what the consoles should show once filled — phrased as what
to look at, not what you did.

#### §6 What invalidates this document

The code changes that void the answers: adding an analytics or crash SDK, ads,
accounts or cloud sync, any network call, IAP, sharing content between users, a
WebView or in-app browser, or microphone recording. Say which sections each one
forces a redo of.

### Step 3 — authoring rules

- Every §2 and §3 answer must be derivable from §1. If one isn't, §1 is
  incomplete — go back and extend it rather than answering inline.
- Give the answer **and** the reason. The reason is what survives a console
  rewording; the answer alone doesn't.
- Where one answer collapses a whole branch of the form (e.g. a top-level "no"
  that dismisses every per-type page), say so explicitly and say not to fill the
  dismissed pages individually.
- Where automation already pushes an answer, name the lane or job, and say what
  to do if the push fails and someone fills it by hand instead.
- Mark sections that need human input or an external artefact in the heading
  itself, e.g. `### 3.8 Foreground service permissions — **needs preparation**`.
- Cross-reference by section number (`§3.8`, `§4.2`) so the reader can follow a
  permission through to the declaration it forces.
- Use tables for anything with a fixed shape (question/answer, field/value).
  Prose only for the reasoning around them.

### Step 4 — make it discoverable

Add a pointer row to the repo's agent instructions file (`CLAUDE.md`,
`AGENTS.md`, or equivalent) describing when to read it: _"Prepared answers for
every App Store Connect and Play Console questionnaire, with the code evidence
behind each. Read before filling anything in a store console."_ If the repo has a
publishing/release doc, link the answer sheet from it too, in the section that
explains what is console-only.
