/**
 * When a release pushes the store *listing*, and what it needs in place first.
 *
 * EAS builds and submits the binary. The listing — metadata, keywords,
 * screenshots, and the privacy and data-safety declarations — is pushed by
 * fastlane, which is a second toolchain with credentials of its own. This
 * module holds the two rules that decide whether a release run should call it,
 * as pure functions of their arguments, so both can be unit-tested without a
 * repository, a network, or a Ruby installation.
 *
 * `tools/release-branch.mjs` supplies the git diff and the environment;
 * `tools/ps/Deploy.ps1` makes the calls.
 *
 * ## Why the paths are listed here
 *
 * Change detection diffs the platform's listing paths between the commit being
 * released and the commit of the last successful store-lane release for that
 * platform. The two platforms' paths are disjoint, so each is decided
 * independently: an iOS-only copy change should not push the Play listing.
 */

import { PLATFORMS } from './release-branch.mjs';

/**
 * The paths whose contents make up each platform's store listing.
 *
 * Repository-relative, and matched by prefix rather than exactly, so a new
 * locale directory or an extra screenshot is picked up without editing this.
 *
 * `fastlane/metadata/en-US` is Apple's; `fastlane/metadata/android` is
 * Google's, images included. They sit under a shared parent, so the iOS entry
 * names the locale directory rather than `fastlane/metadata`, which would
 * otherwise swallow the Android listing as well.
 *
 * @type {Record<'ios' | 'android', string[]>}
 */
export const LISTING_PATHS = {
  ios: [
    'fastlane/metadata/en-US',
    'fastlane/metadata/copyright.txt',
    'fastlane/metadata/primary_category.txt',
    'fastlane/metadata/secondary_category.txt',
    'fastlane/screenshots',
    'fastlane/screenshots-ipad13',
    'fastlane/privacy_details.json',
  ],
  android: ['fastlane/metadata/android'],
};

/**
 * The environment variables fastlane needs for each platform's listing lane.
 *
 * iOS authenticates with an App Store Connect API key, which is a different
 * credential from the EAS token and from the Apple ID: three separate
 * identities in one release. Android uses a Play service-account JSON.
 *
 * Each entry is a list of variables that would each do, not a list of
 * variables that are all needed. The private key has two spellings because a
 * `.env` file holds one line per value and cannot carry the newlines a PEM
 * block needs: `ASC_KEY_CONTENT` works from a shell that can export a
 * multi-line string, and `ASC_KEY_PATH` points at the `.p8` file instead,
 * which is what a Windows release actually uses.
 *
 * @type {Record<'ios' | 'android', string[][]>}
 */
export const LISTING_CREDENTIALS = {
  ios: [['ASC_KEY_ID'], ['ASC_ISSUER_ID'], ['ASC_KEY_CONTENT', 'ASC_KEY_PATH']],
  android: [['SUPPLY_JSON_KEY']],
};

/**
 * The credentials above that name a file rather than carrying a value.
 *
 * Checked for existence as well as for being set, because a variable pointing
 * at a `.p8` that has since been moved is a missing key that reads as a present
 * one. The whole point of a preflight is that a missing key costs seconds
 * rather than a paid-for build, and only checking that the variable is
 * non-blank gives that check away for exactly the spelling a Windows release
 * uses.
 *
 * @type {Record<'ios' | 'android', string[]>}
 */
export const LISTING_CREDENTIAL_PATHS = {
  ios: ['ASC_KEY_PATH'],
  android: ['SUPPLY_JSON_KEY'],
};

/** What the operator can ask for on a run. */
export const LISTING_SELECTORS = /** @type {const} */ (['auto', 'on', 'off']);

/** Thrown for a listing selector this module does not have a rule for. */
export class ListingError extends Error {}

/**
 * Asserts a listing selector is one this module understands.
 *
 * @param {string} selector
 * @returns {'auto' | 'on' | 'off'}
 */
export function assertListingSelector(selector) {
  const found = LISTING_SELECTORS.find((known) => known === selector);
  if (!found) {
    throw new ListingError(
      `Unknown listing selector '${selector}'. Expected ${LISTING_SELECTORS.join(', ')}.`,
    );
  }
  return found;
}

/**
 * Whether this run should push one platform's store listing, and why.
 *
 * The reason is returned rather than logged, because it is worth having in two
 * places: the console, so the operator can see that `auto` decided to skip,
 * and the outcome tag, so the same question can be answered a month later.
 *
 * @param {object} input
 * @param {'ios' | 'android'} input.platform
 * @param {'auto' | 'on' | 'off'} input.selector
 * @param {'store' | 'fast'} input.lane
 * @param {string | null} input.previousCommit the commit of the last successful
 *   store-lane release for this platform, or `null` if there has never been one
 * @param {readonly string[]} input.changedPaths listing paths that differ
 *   between `previousCommit` and the commit being released
 * @returns {{ push: boolean, reason: string }}
 */
export function decideListingPush({ platform, selector, lane, previousCommit, changedPaths }) {
  assertListingSelector(selector);

  // The fast lane never touches the public listing, whatever the selector
  // says. TestFlight carries its own "What to Test" text and the Play internal
  // track does not use the production listing, so pushing public listing copy
  // from a tester build would publish changes nobody asked to publish.
  if (lane !== 'store') {
    return {
      push: false,
      reason: `not pushed: the ${lane} lane does not touch the public listing`,
    };
  }

  if (selector === 'off') {
    return { push: false, reason: 'not pushed: --listing off' };
  }

  if (selector === 'on') {
    return { push: true, reason: 'pushed: --listing on' };
  }

  if (!previousCommit) {
    return {
      push: true,
      reason: 'pushed: no previous successful store release to compare the listing against',
    };
  }

  if (changedPaths.length === 0) {
    return {
      push: false,
      reason: `not pushed: no ${platform} listing change since ${previousCommit.slice(0, 8)}`,
    };
  }

  return {
    push: true,
    reason: `pushed: ${changedPaths.length} ${platform} listing path(s) changed since ${previousCommit.slice(0, 8)}`,
  };
}

/**
 * The listing results that mean the store page is showing the listing content
 * from that release's commit.
 *
 * These are the exact sentences `Invoke-ListingPush` in `tools/ps/Deploy.ps1`
 * returns, and they end up verbatim in the outcome tag's `Listing:` field. They
 * are read back by `lastStoreRelease` in `tools/release-branch.mjs` to choose
 * what `auto` diffs against, so rewording either of them there without changing
 * this list would quietly turn every later `auto` decision into a push.
 *
 * `pushed` is fastlane having pushed it; `not pushed: unchanged` is the store
 * already carrying it, which leaves it just as live.
 */
const LIVE_LISTING_PREFIXES = ['pushed', 'not pushed: unchanged'];

/**
 * Whether a release left the store listing showing its own commit's content.
 *
 * `auto` diffs the commit being released against the last successful store-lane
 * release, and that comparison is only meaningful if the store actually caught
 * up at that release. It often did not: the listing push can fail after the
 * binary has already shipped (the outcome tag stays a success, deliberately),
 * and `-Listing off` skips it outright. Treating either as the baseline would
 * see no listing change since and skip the push, leaving the store page on the
 * old copy release after release with nothing on screen saying so.
 *
 * Unrecognised text — including a tag written before listing pushes existed,
 * which has no `Listing:` field at all — is read as "not live". That is the
 * fail-safe direction: an unnecessary push is idempotent and harmless, and a
 * skipped one is neither.
 *
 * @param {string | undefined} listing the tag message's `Listing` field
 * @returns {boolean}
 */
export function listingIsLive(listing) {
  const text = (listing ?? '').trim().toLowerCase();
  return LIVE_LISTING_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * What is missing before fastlane could push a listing.
 *
 * Checked once, before the first build, rather than at the point of use. A
 * missing App Store Connect key should fail the run in seconds rather than
 * after a build has already been paid for and shipped, at which point the
 * release is half done and the operator has to decide what to do with it.
 *
 * @param {object} input
 * @param {readonly ('ios' | 'android')[]} input.platforms platforms whose
 *   listing this run intends to push
 * @param {Record<string, string | undefined>} input.env
 * @param {boolean} input.hasBundler whether `bundle` is on PATH
 * @param {boolean} input.hasDefaultPlayKey whether `pc-api-key.json` is present,
 *   which is what the Android lane falls back to when SUPPLY_JSON_KEY is unset
 * @param {(path: string) => boolean} input.fileExists resolves a credential path
 *   the same way fastlane will, which is relative to the repository root
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkListingPrerequisites({
  platforms,
  env,
  hasBundler,
  hasDefaultPlayKey,
  fileExists,
}) {
  /** @type {string[]} */
  const problems = [];
  const wanted = PLATFORMS.filter((platform) => platforms.includes(platform));

  if (wanted.length === 0) return { ok: true, problems };

  if (!hasBundler) {
    problems.push(
      "Ruby's 'bundle' is not on PATH. The listing push needs it: run 'cd fastlane && bundle install'.",
    );
  }

  for (const platform of wanted) {
    for (const spellings of LISTING_CREDENTIALS[platform]) {
      if (spellings.some((name) => (env[name] ?? '').trim() !== '')) continue;
      // The Android lane falls back to ./pc-api-key.json when SUPPLY_JSON_KEY
      // is unset, so an existing file is as good as the variable.
      if (spellings.includes('SUPPLY_JSON_KEY') && hasDefaultPlayKey) continue;
      const named = spellings.join(' or ');
      problems.push(`${named} is not set (needed for the ${platform} listing push).`);
    }

    for (const name of LISTING_CREDENTIAL_PATHS[platform]) {
      const path = (env[name] ?? '').trim();
      if (path === '' || fileExists(path)) continue;
      problems.push(
        `${name} points at '${path}', which does not exist (needed for the ${platform} listing push).`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
