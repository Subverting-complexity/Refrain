/**
 * The rules that decide what a release branch is called and which ones get
 * deleted.
 *
 * Pruning is the reason this file exists. Everything else here can be got
 * wrong and put right by running the command again; deleting a branch cannot.
 * So the cases below lean towards the ways `selectPrunable` could delete
 * something it should have kept: a tag it did not recognise, a stamp it read
 * as the wrong month, a name from some other part of the repository that
 * happens to start with the same word.
 *
 * The prune rule has one more thing to get right than it used to. One release
 * branch now carries a tag per platform, so "did this release succeed" is a
 * question about a set of outcomes rather than about one, and the answer has
 * to survive a retry adding a success beside an earlier failure.
 */

import {
  assertLane,
  assertPlatform,
  availableBranchName,
  branchNameFor,
  buildTagMessage,
  DEFAULT_KEEP_DAYS,
  formatStamp,
  parsePlatformSelection,
  parseBranchName,
  parseStamp,
  parseTagMessage,
  parseTagName,
  ReleaseNameError,
  selectPrunable,
  tagNameFor,
  unfinishedTagNameFor,
} from '../lib/release-branch.mjs';

/** 13 August 2026, 14:32 local time. */
const AUGUST = new Date(2026, 7, 13, 14, 32);

/** A date `days` before {@link AUGUST}, for building branches of a given age. */
function daysBefore(days: number): Date {
  const date = new Date(AUGUST.getTime());
  date.setDate(date.getDate() - days);
  return date;
}

describe('formatStamp', () => {
  it('reads as the local date and time a person would remember', () => {
    expect(formatStamp(AUGUST)).toBe('2026-08-13-1432');
  });

  it('pads every field, so names sort in the order they happened', () => {
    expect(formatStamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05-0907');
  });

  it('round-trips through parseStamp', () => {
    expect(parseStamp(formatStamp(AUGUST))).toEqual(AUGUST);
  });
});

describe('parseStamp', () => {
  it('refuses a date that does not exist rather than rolling it forward', () => {
    // `new Date(2026, 12, 40)` is a valid call and a wrong answer. Without the
    // round-trip check this would parse as February 2027 and be pruned
    // against a month it was never in.
    expect(parseStamp('2026-13-40-1432')).toBeNull();
    expect(parseStamp('2026-02-30-1432')).toBeNull();
  });

  it('refuses a time that does not exist', () => {
    expect(parseStamp('2026-08-13-2599')).toBeNull();
  });

  it('refuses anything that is not a stamp at all', () => {
    expect(parseStamp('')).toBeNull();
    expect(parseStamp('2026-08-13')).toBeNull();
    expect(parseStamp('yesterday')).toBeNull();
  });
});

describe('branchNameFor', () => {
  it('names only the minute the release started', () => {
    // No platform segment: both platforms build from one commit carrying one
    // version, so a per-platform name would be two names for the same commit.
    expect(branchNameFor(AUGUST)).toBe('release/2026-08-13-1432');
  });
});

describe('assertPlatform', () => {
  it('hands back the platform it was given', () => {
    expect(assertPlatform('ios')).toBe('ios');
  });

  it('names what it expected, so the message is actionable', () => {
    expect(() => assertPlatform('IOS')).toThrow(/ios or android/);
  });
});

describe('assertLane', () => {
  it('accepts the two lanes and nothing else', () => {
    expect(assertLane('store')).toBe('store');
    expect(assertLane('fast')).toBe('fast');
    expect(() => assertLane('beta')).toThrow(/store or fast/);
  });
});

describe('parsePlatformSelection', () => {
  it('expands both into the build order', () => {
    expect(parsePlatformSelection('both')).toEqual(['ios', 'android']);
  });

  it('reads a single platform as a first-class choice', () => {
    expect(parsePlatformSelection('android')).toEqual(['android']);
  });

  it('builds iOS first however the list was typed', () => {
    // The fragile credential path fails cheapest when it fails first, and the
    // caller should not be able to reorder that by accident.
    expect(parsePlatformSelection('android,ios')).toEqual(['ios', 'android']);
  });

  it('ignores a platform named twice', () => {
    expect(parsePlatformSelection('ios,ios')).toEqual(['ios']);
  });

  it('refuses a platform that does not ship to a store', () => {
    expect(() => parsePlatformSelection('web')).toThrow(ReleaseNameError);
  });

  it('refuses an empty selection rather than releasing nothing', () => {
    expect(() => parsePlatformSelection('  ')).toThrow(ReleaseNameError);
  });
});

describe('tagNameFor', () => {
  it('adds the platform and the outcome to the release branch', () => {
    expect(tagNameFor('release/2026-08-13-1432', 'ios', 'success')).toBe(
      'release/2026-08-13-1432-ios-success',
    );
  });

  it('accepts the two outcomes a run can report and nothing else', () => {
    const branch = 'release/2026-08-13-1432';
    expect(tagNameFor(branch, 'android', 'failed')).toMatch(/-android-failed$/);
    // `unfinished` is the pruner's word about a run that never reported, so a
    // run naming it about itself is a contradiction.
    expect(() => tagNameFor(branch, 'ios', 'unfinished')).toThrow(
      ReleaseNameError,
    );
    expect(() => tagNameFor(branch, 'ios', 'cancelled')).toThrow(
      ReleaseNameError,
    );
  });

  it('refuses to tag something that is not a release branch', () => {
    // Guards against tagging a tag, which would produce
    // `release/...-ios-success-ios-failed` and confuse every later prune.
    expect(() =>
      tagNameFor('release/2026-08-13-1432-ios-success', 'ios', 'failed'),
    ).toThrow(ReleaseNameError);
    expect(() => tagNameFor('main', 'ios', 'success')).toThrow(
      ReleaseNameError,
    );
  });
});

describe('unfinishedTagNameFor', () => {
  it('names no platform, because no platform reported', () => {
    expect(unfinishedTagNameFor('release/2026-08-13-1432')).toBe(
      'release/2026-08-13-1432-unfinished',
    );
  });

  it('refuses anything that is not a release branch', () => {
    expect(() => unfinishedTagNameFor('main')).toThrow(ReleaseNameError);
  });
});

describe('parseBranchName', () => {
  it('takes a release branch apart', () => {
    expect(parseBranchName('release/2026-08-13-1432')).toEqual({
      stamp: '2026-08-13-1432',
    });
  });

  it('does not accept a tag as a branch', () => {
    // The anchored pattern is the only thing keeping the pruner from
    // considering a tag for deletion.
    expect(parseBranchName('release/2026-08-13-1432-ios-success')).toBeNull();
    expect(parseBranchName('release/2026-08-13-1432-unfinished')).toBeNull();
  });

  it('does not accept the old per-platform branch name', () => {
    // Left over from the scheme this replaced. Refusing it is what stops a
    // prune written for the new names from deciding anything about the old
    // ones, which it has no rule for.
    expect(parseBranchName('release/ios/2026-08-13-1432')).toBeNull();
  });

  it('does not accept anything else in the repository', () => {
    expect(parseBranchName('main')).toBeNull();
    expect(parseBranchName('feature/797/notification-icon')).toBeNull();
    expect(parseBranchName('release/2026-08-13-1432/hotfix')).toBeNull();
    expect(parseBranchName('releases/2026-08-13-1432')).toBeNull();
  });

  it('rejects a well-shaped name whose date is impossible', () => {
    expect(parseBranchName('release/2026-02-30-1432')).toBeNull();
  });
});

describe('parseTagName', () => {
  it('reports the platform and the outcome alongside the release', () => {
    expect(parseTagName('release/2026-08-13-1432-android-failed')).toEqual({
      stamp: '2026-08-13-1432',
      platform: 'android',
      outcome: 'failed',
    });
  });

  it('reads an unfinished tag as belonging to no platform', () => {
    expect(parseTagName('release/2026-08-13-1432-unfinished')).toEqual({
      stamp: '2026-08-13-1432',
      outcome: 'unfinished',
    });
  });

  it('does not accept a branch as a tag', () => {
    expect(parseTagName('release/2026-08-13-1432')).toBeNull();
  });

  it('does not accept an outcome it has no rule for', () => {
    expect(parseTagName('release/2026-08-13-1432-ios-partial')).toBeNull();
    expect(parseTagName('release/2026-08-13-1432-web-success')).toBeNull();
    // A platform on an unfinished tag would claim that platform reported.
    expect(parseTagName('release/2026-08-13-1432-ios-unfinished')).toBeNull();
  });
});

describe('availableBranchName', () => {
  it('uses the current minute when nothing has claimed it', () => {
    expect(availableBranchName(AUGUST, [])).toBe('release/2026-08-13-1432');
  });

  it('walks forward a minute when two releases start together', () => {
    expect(availableBranchName(AUGUST, ['release/2026-08-13-1432'])).toBe(
      'release/2026-08-13-1433',
    );
  });

  it('keeps walking past a run of taken minutes', () => {
    const taken = [
      'release/2026-08-13-1432',
      'release/2026-08-13-1433',
      'release/2026-08-13-1434',
    ];
    expect(availableBranchName(AUGUST, taken)).toBe('release/2026-08-13-1435');
  });

  it('rolls the hour and the day rather than producing an impossible time', () => {
    const lateAtNight = new Date(2026, 7, 13, 23, 59);
    expect(availableBranchName(lateAtNight, ['release/2026-08-13-2359'])).toBe(
      'release/2026-08-14-0000',
    );
  });

  it('gives up rather than looping forever when every minute is taken', () => {
    const taken = Array.from({ length: 5 }, (_, minute) =>
      branchNameFor(new Date(2026, 7, 13, 14, 32 + minute)),
    );
    expect(() => availableBranchName(AUGUST, taken, 3)).toThrow(
      ReleaseNameError,
    );
  });
});

describe('buildTagMessage', () => {
  const details = {
    branch: 'release/2026-08-13-1432',
    platform: 'ios' as const,
    outcome: 'success' as const,
    commit: '8a9e2e2f1c4b9d0e7a3f5c2b1d8e6f4a9c7b3d2e',
    lane: 'store' as const,
    profile: 'production',
    submitProfile: 'production',
    startedAt: '2026-08-13 14:32:07',
    duration: '00:12:41',
    exitCode: 0,
    submitted: true,
    listing: 'pushed',
    easBuildId: 'a1b2c3d4',
  };

  it('opens with a line that says what happened, on which platform', () => {
    expect(buildTagMessage(details).split('\n')[0]).toBe(
      'Released: ios release/2026-08-13-1432',
    );
  });

  it('names no platform on a tag that has none', () => {
    const message = buildTagMessage({
      branch: details.branch,
      outcome: 'unfinished',
      commit: details.commit,
    });
    expect(message.split('\n')[0]).toBe(
      'Release never finished: release/2026-08-13-1432',
    );
    expect(message).not.toContain('Platform:');
  });

  it('gives each fact its own greppable line', () => {
    const message = buildTagMessage(details);
    expect(message).toContain(
      'Commit: 8a9e2e2f1c4b9d0e7a3f5c2b1d8e6f4a9c7b3d2e',
    );
    expect(message).toContain('Lane: store');
    expect(message).toContain('Submit profile: production');
    expect(message).toContain('Duration: 00:12:41');
    expect(message).toContain('Exit code: 0');
    expect(message).toContain('Submitted: yes');
    expect(message).toContain('Listing: pushed');
    expect(message).toContain('EAS build: a1b2c3d4');
  });

  it('records a listing failure without turning the release into one', () => {
    // The binary shipped and cannot be withdrawn. The outcome stays a success
    // and the other half of the story lives on its own line.
    const message = buildTagMessage({
      ...details,
      listing: 'failed: fastlane exited 1',
    });
    expect(message.split('\n')[0]).toContain('Released:');
    expect(message).toContain('Listing: failed: fastlane exited 1');
  });

  it('leaves out what it does not know, rather than printing it blank', () => {
    // A run that could not reach `eas build:list` should say nothing about the
    // build id, not claim it was empty.
    const message = buildTagMessage({
      ...details,
      easBuildId: undefined,
      duration: '',
    });
    expect(message).not.toContain('EAS build:');
    expect(message).not.toContain('Duration:');
  });

  it('distinguishes a failure and an unfinished run in the first line', () => {
    expect(buildTagMessage({ ...details, outcome: 'failed' })).toContain(
      'Release failed:',
    );
    expect(buildTagMessage({ ...details, outcome: 'unfinished' })).toContain(
      'Release never finished:',
    );
  });

  it('says "no" for a build that was not submitted, rather than dropping it', () => {
    // `false` is a fact worth recording; only `undefined` means "not known".
    expect(buildTagMessage({ ...details, submitted: false })).toContain(
      'Submitted: no',
    );
  });
});

describe('parseTagMessage', () => {
  it('reads back what buildTagMessage wrote', () => {
    // The listing change check finds the last successful *store-lane* release,
    // and the lane is only in the message. If these two drift apart, `auto`
    // silently compares against the wrong release.
    const message = buildTagMessage({
      branch: 'release/2026-08-13-1432',
      platform: 'android',
      outcome: 'success',
      commit: 'abc1234',
      lane: 'fast',
    });
    expect(parseTagMessage(message).lane).toBe('fast');
    expect(parseTagMessage(message).platform).toBe('android');
  });

  it('lower-cases the keys, so a caller need not match the capitalisation', () => {
    expect(parseTagMessage('Submit profile: internal')).toEqual({
      'submit profile': 'internal',
    });
  });

  it('ignores lines that are not key: value', () => {
    expect(parseTagMessage('Released: ios release/x\n\nLane: store')).toEqual({
      released: 'ios release/x',
      lane: 'store',
    });
  });

  it('keeps the first value for a key, so free text cannot overwrite a fact', () => {
    // `Notes` is the operator's own words and comes last in the message, so a
    // note that happens to contain "Lane: fast" must not shadow the real lane.
    expect(parseTagMessage('Lane: store\nNotes: x\nLane: fast').lane).toBe(
      'store',
    );
  });
});

describe('selectPrunable', () => {
  const old = formatStamp(daysBefore(DEFAULT_KEEP_DAYS + 1));
  const recent = formatStamp(daysBefore(2));

  it('keeps a release both platforms shipped, however old it is', () => {
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [`release/${old}-ios-success`, `release/${old}-android-success`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([]);
    expect(plan.unfinished).toEqual([]);
    expect(plan.kept).toEqual([`release/${old}`]);
  });

  it('prunes a release where one platform shipped and the other did not', () => {
    // The stores are at different versions. This commit is not one to cut a
    // hotfix from once the window has passed.
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [`release/${old}-ios-success`, `release/${old}-android-failed`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([`release/${old}`]);
    expect(plan.kept).toEqual([]);
  });

  it('prunes a release that stopped at the first failure', () => {
    // iOS failed and Android was never attempted, so Android has no tag. The
    // rule reads the platforms that reported, and the one that did, failed.
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [`release/${old}-ios-failed`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([`release/${old}`]);
  });

  it('keeps a deliberate single-platform release', () => {
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [`release/${old}-ios-success`],
      now: AUGUST,
    });
    expect(plan.kept).toEqual([`release/${old}`]);
  });

  it('keeps a release a retry rescued', () => {
    // The row that matters. Asking whether each platform *reached* a success,
    // rather than whether it ever failed, is what promotes this back to kept
    // with no special handling anywhere.
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [
        `release/${old}-ios-success`,
        `release/${old}-android-failed`,
        `release/${old}-android-success`,
      ],
      now: AUGUST,
    });
    expect(plan.kept).toEqual([`release/${old}`]);
    expect(plan.failed).toEqual([]);
  });

  it('keeps a recent failure, because it is still being looked into', () => {
    const plan = selectPrunable({
      branches: [`release/${recent}`],
      tags: [`release/${recent}-ios-failed`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([]);
    expect(plan.kept).toEqual([`release/${recent}`]);
  });

  it('reports an old branch with no tag as unfinished, not as failed', () => {
    // The two are handled differently: an unfinished branch has to be tagged
    // before it can be deleted without orphaning its commit.
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [],
      now: AUGUST,
    });
    expect(plan.unfinished).toEqual([`release/${old}`]);
    expect(plan.failed).toEqual([]);
  });

  it('still prunes a branch already tagged unfinished by an earlier run', () => {
    // A prune whose deletion failed must not leave the branch behind forever.
    // The unfinished tag says nothing about any platform, so the release is
    // still as unreported as it was and stays in the unfinished bucket.
    const plan = selectPrunable({
      branches: [`release/${old}`],
      tags: [`release/${old}-unfinished`],
      now: AUGUST,
    });
    expect(plan.unfinished).toEqual([`release/${old}`]);
    expect(plan.kept).toEqual([]);
  });

  it('respects a keep window given to it', () => {
    const branches = [`release/${old}`];
    const tags = [`release/${old}-ios-failed`];
    expect(
      selectPrunable({ branches, tags, now: AUGUST, keepDays: 90 }).kept,
    ).toEqual(branches);
    expect(
      selectPrunable({ branches, tags, now: AUGUST, keepDays: 0 }).failed,
    ).toEqual(branches);
  });

  it('leaves alone every branch it does not recognise', () => {
    // The one irreversible thing here is deleting a branch, so anything
    // unparseable is ignored rather than guessed at. The old per-platform
    // names are in this list on purpose: this prune has no rule for them.
    const plan = selectPrunable({
      branches: [
        'main',
        'feature/797/notification-icon',
        'release/ios/2020-01-01-0000',
        'release/web/2020-01-01-0000',
      ],
      tags: [],
      now: AUGUST,
      keepDays: 0,
    });
    expect(plan).toEqual({ failed: [], unfinished: [], kept: [] });
  });

  it('never returns a tag, even one shaped like an old failure', () => {
    const plan = selectPrunable({
      branches: [`release/${old}-ios-failed`],
      tags: [`release/${old}-ios-failed`],
      now: AUGUST,
      keepDays: 0,
    });
    expect(plan).toEqual({ failed: [], unfinished: [], kept: [] });
  });

  it('matches a tag to its own release and not to the one beside it', () => {
    // Two releases a minute apart: the first shipped, the second failed.
    // Reading the tags without their stamps would keep both.
    const older = formatStamp(daysBefore(DEFAULT_KEEP_DAYS + 2));
    const plan = selectPrunable({
      branches: [`release/${older}`, `release/${old}`],
      tags: [`release/${older}-ios-success`, `release/${old}-ios-failed`],
      now: AUGUST,
    });
    expect(plan.kept).toEqual([`release/${older}`]);
    expect(plan.failed).toEqual([`release/${old}`]);
  });
});
