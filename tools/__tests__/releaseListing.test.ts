/**
 * When a release pushes the store listing, and what it needs in place first.
 *
 * Two rules with different failure modes, which is why both are pure functions
 * kept away from git and the filesystem.
 *
 * The change-detection rule can go wrong quietly: a skip that should have been
 * a push leaves the store page describing the previous version, and nothing on
 * screen says so. The cases below therefore pin down each reason to skip
 * separately, rather than testing that "auto works".
 *
 * The prerequisite rule can only go wrong loudly, but it goes wrong at the
 * worst possible moment. It runs before the first build precisely so a missing
 * App Store Connect key costs seconds rather than a paid-for build that has
 * already shipped without its listing.
 */

import {
  assertListingSelector,
  checkListingPrerequisites,
  decideListingPush,
  listingIsLive,
  LISTING_PATHS,
  ListingError,
} from '../lib/release-listing.mjs';

const PREVIOUS = 'abcdef1234567890abcdef1234567890abcdef12';

type Decision = Parameters<typeof decideListingPush>[0];

function decide(overrides: Partial<Decision> = {}) {
  return decideListingPush({
    platform: 'ios',
    selector: 'auto',
    lane: 'store',
    previousCommit: PREVIOUS,
    changedPaths: [],
    ...overrides,
  });
}

describe('LISTING_PATHS', () => {
  it('keeps the two platforms disjoint, so each is decided on its own', () => {
    // An iOS copy change must not push the Play listing, and the shared
    // fastlane/metadata parent is the easy way to get that wrong.
    const overlap = LISTING_PATHS.ios.filter((path) =>
      LISTING_PATHS.android.some(
        (other) => path.startsWith(other) || other.startsWith(path),
      ),
    );
    expect(overlap).toEqual([]);
  });

  it('names the Apple locale directory rather than the metadata root', () => {
    // `fastlane/metadata` would swallow `fastlane/metadata/android` with it.
    expect(LISTING_PATHS.ios).not.toContain('fastlane/metadata');
    expect(LISTING_PATHS.ios).toContain('fastlane/metadata/en-US');
  });
});

describe('assertListingSelector', () => {
  it('accepts the three selectors and nothing else', () => {
    expect(assertListingSelector('auto')).toBe('auto');
    expect(assertListingSelector('on')).toBe('on');
    expect(assertListingSelector('off')).toBe('off');
    expect(() => assertListingSelector('maybe')).toThrow(ListingError);
  });
});

describe('decideListingPush', () => {
  it('pushes when listing files changed since the last successful release', () => {
    const decision = decide({
      changedPaths: ['fastlane/metadata/en-US/description.txt'],
    });
    expect(decision.push).toBe(true);
    expect(decision.reason).toContain('1 ios listing path(s) changed');
  });

  it("skips when nothing in that platform's listing changed", () => {
    const decision = decide();
    expect(decision.push).toBe(false);
    expect(decision.reason).toContain('no ios listing change since abcdef12');
  });

  it('pushes when there is no previous successful release to compare against', () => {
    // A first release has nothing to diff against, and shipping a binary with
    // no listing at all is the worse of the two mistakes.
    const decision = decide({ previousCommit: null });
    expect(decision.push).toBe(true);
    expect(decision.reason).toContain('no previous successful store release');
  });

  it('decides the two platforms independently', () => {
    // Same run, different answers: the iOS copy changed and the Play listing
    // did not.
    expect(
      decide({ platform: 'ios', changedPaths: ['fastlane/metadata/en-US/x'] })
        .push,
    ).toBe(true);
    expect(decide({ platform: 'android', changedPaths: [] }).push).toBe(false);
  });

  it('pushes regardless when asked to, without looking at the diff', () => {
    expect(decide({ selector: 'on', changedPaths: [] })).toEqual({
      push: true,
      reason: 'pushed: --listing on',
    });
  });

  it('skips when told to, however much changed', () => {
    expect(
      decide({ selector: 'off', changedPaths: ['fastlane/metadata/en-US/x'] })
        .push,
    ).toBe(false);
  });

  it('never touches the public listing on the fast lane', () => {
    // TestFlight carries its own "What to Test" text and the Play internal
    // track does not use the production listing, so pushing public listing
    // copy from a tester build would publish changes nobody asked to publish.
    // `on` is the case that matters: an explicit request still does not do it.
    for (const selector of ['auto', 'on'] as const) {
      const decision = decide({
        lane: 'fast',
        selector,
        previousCommit: null,
        changedPaths: ['fastlane/metadata/en-US/description.txt'],
      });
      expect(decision.push).toBe(false);
      expect(decision.reason).toContain('the fast lane does not touch');
    }
  });

  it('refuses a selector it has no rule for rather than guessing', () => {
    expect(() =>
      decideListingPush({
        platform: 'ios',
        selector: 'maybe' as never,
        lane: 'store',
        previousCommit: null,
        changedPaths: [],
      }),
    ).toThrow(ListingError);
  });
});

describe('checkListingPrerequisites', () => {
  const complete = {
    ASC_KEY_ID: 'ABC123',
    ASC_ISSUER_ID: '1111-2222',
    ASC_KEY_CONTENT: '-----BEGIN PRIVATE KEY-----',
    SUPPLY_JSON_KEY: './pc-api-key.json',
  };

  function check(
    overrides: Partial<Parameters<typeof checkListingPrerequisites>[0]> = {},
  ) {
    return checkListingPrerequisites({
      platforms: ['ios', 'android'],
      env: complete,
      hasBundler: true,
      hasDefaultPlayKey: false,
      fileExists: () => true,
      ...overrides,
    });
  }

  it('passes when the toolchain and every credential are present', () => {
    expect(check()).toEqual({ ok: true, problems: [] });
  });

  it('names the missing App Store Connect key rather than failing vaguely', () => {
    const { ok, problems } = check({
      env: { ...complete, ASC_KEY_ID: undefined },
    });
    expect(ok).toBe(false);
    expect(problems).toEqual([
      'ASC_KEY_ID is not set (needed for the ios listing push).',
    ]);
  });

  it('accepts either spelling of the private key', () => {
    // A .env file cannot carry the newlines a PEM block needs, so the path is
    // the spelling a Windows release actually uses.
    expect(
      check({
        env: {
          ...complete,
          ASC_KEY_CONTENT: undefined,
          ASC_KEY_PATH: './AuthKey_ABC123.p8',
        },
      }).ok,
    ).toBe(true);

    const neither = check({
      env: { ...complete, ASC_KEY_CONTENT: undefined },
    });
    expect(neither.ok).toBe(false);
    expect(neither.problems[0]).toContain('ASC_KEY_CONTENT or ASC_KEY_PATH');
  });

  it('treats a present pc-api-key.json as good as SUPPLY_JSON_KEY', () => {
    // The Android lane falls back to that file when the variable is unset, so
    // demanding the variable would fail a setup that works.
    expect(
      check({
        env: { ...complete, SUPPLY_JSON_KEY: undefined },
        hasDefaultPlayKey: true,
      }).ok,
    ).toBe(true);
    expect(
      check({
        env: { ...complete, SUPPLY_JSON_KEY: undefined },
        hasDefaultPlayKey: false,
      }).ok,
    ).toBe(false);
  });

  it('only asks for the platforms this release covers', () => {
    // An iOS-only release should not be blocked by a missing Play key.
    expect(
      check({
        platforms: ['ios'],
        env: { ASC_KEY_ID: 'A', ASC_ISSUER_ID: 'B', ASC_KEY_PATH: 'k.p8' },
      }).ok,
    ).toBe(true);
  });

  it('says how to install the toolchain, not just that it is missing', () => {
    const { problems } = check({ hasBundler: false });
    expect(problems[0]).toContain('bundle install');
  });

  it('asks for nothing when no platform is selected', () => {
    expect(check({ platforms: [], env: {}, hasBundler: false })).toEqual({
      ok: true,
      problems: [],
    });
  });

  it('treats a blank credential as missing, not as set', () => {
    expect(check({ env: { ...complete, ASC_ISSUER_ID: '   ' } }).ok).toBe(
      false,
    );
  });

  it('refuses a key path that points at nothing', () => {
    // A variable pointing at a .p8 that has since been moved is a missing key
    // that reads as a present one, and this check exists precisely so that
    // costs seconds rather than a paid-for build.
    const { ok, problems } = check({
      platforms: ['ios'],
      env: { ...complete, ASC_KEY_CONTENT: undefined, ASC_KEY_PATH: 'gone.p8' },
      fileExists: () => false,
    });

    expect(ok).toBe(false);
    expect(problems).toEqual([
      "ASC_KEY_PATH points at 'gone.p8', which does not exist (needed for the ios listing push).",
    ]);
  });

  it('refuses a Play service-account path that points at nothing', () => {
    const { ok, problems } = check({
      platforms: ['android'],
      env: { SUPPLY_JSON_KEY: './pc-api-key.json' },
      fileExists: () => false,
    });

    expect(ok).toBe(false);
    expect(problems[0]).toContain('SUPPLY_JSON_KEY points at');
  });

  it('checks the file only for the spelling that names one', () => {
    // ASC_KEY_CONTENT carries the key rather than pointing at it, so a machine
    // using that spelling has no file to find.
    expect(check({ platforms: ['ios'], fileExists: () => false }).ok).toBe(
      true,
    );
  });
});

describe('listingIsLive', () => {
  // The exact sentences Invoke-ListingPush in tools/ps/Deploy.ps1 returns and
  // Deploy.ps1 records in the outcome tag. They are the input to this rule, so
  // a reword on that side that is not made here would be caught by these.
  it('counts a listing fastlane pushed', () => {
    expect(listingIsLive('pushed')).toBe(true);
    expect(listingIsLive('pushed: --listing on')).toBe(true);
  });

  it('counts a listing that was already what the store carried', () => {
    expect(
      listingIsLive(
        'not pushed: unchanged since the last successful store release',
      ),
    ).toBe(true);
  });

  it('does not count a push that failed after the binary shipped', () => {
    // The outcome tag stays a success on purpose -- the build shipped -- so the
    // listing field is the only thing that says the store never caught up.
    expect(listingIsLive('failed: fastlane exited 1')).toBe(false);
    expect(listingIsLive('failed: bundle is not installed')).toBe(false);
  });

  it('does not count a release that was told to skip the listing', () => {
    expect(listingIsLive('not pushed: -Listing off')).toBe(false);
    expect(
      listingIsLive(
        'not pushed: -NoSubmit, so there was no submit for it to follow',
      ),
    ).toBe(false);
    expect(listingIsLive('not attempted')).toBe(false);
  });

  it('does not count a tag written before listing pushes existed', () => {
    // No Listing field at all. Reading that as live would skip a push that has
    // never happened; reading it as not live costs one idempotent push.
    expect(listingIsLive(undefined)).toBe(false);
    expect(listingIsLive('')).toBe(false);
  });
});
