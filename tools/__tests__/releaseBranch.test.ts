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
 */

import {
  assertPlatform,
  availableBranchName,
  branchNameFor,
  buildTagMessage,
  DEFAULT_KEEP_DAYS,
  formatStamp,
  parseBranchName,
  parseStamp,
  parseTagName,
  ReleaseNameError,
  selectPrunable,
  tagNameFor,
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
  it('names the platform and the minute the run started', () => {
    expect(branchNameFor('ios', AUGUST)).toBe('release/ios/2026-08-13-1432');
    expect(branchNameFor('android', AUGUST)).toBe(
      'release/android/2026-08-13-1432',
    );
  });

  it('refuses a platform that does not ship to a store', () => {
    expect(() => branchNameFor('web', AUGUST)).toThrow(ReleaseNameError);
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

describe('tagNameFor', () => {
  it('adds the outcome to the branch the run used', () => {
    expect(tagNameFor('release/ios/2026-08-13-1432', 'success')).toBe(
      'release/ios/2026-08-13-1432-success',
    );
  });

  it('accepts the three outcomes and nothing else', () => {
    const branch = 'release/android/2026-08-13-1432';
    expect(tagNameFor(branch, 'failed')).toMatch(/-failed$/);
    expect(tagNameFor(branch, 'unfinished')).toMatch(/-unfinished$/);
    expect(() => tagNameFor(branch, 'cancelled')).toThrow(ReleaseNameError);
  });

  it('refuses to tag something that is not a release branch', () => {
    // Guards against tagging a tag, which would produce
    // `release/ios/...-success-failed` and confuse every later prune.
    expect(() =>
      tagNameFor('release/ios/2026-08-13-1432-success', 'failed'),
    ).toThrow(ReleaseNameError);
    expect(() => tagNameFor('main', 'success')).toThrow(ReleaseNameError);
  });
});

describe('parseBranchName', () => {
  it('takes a release branch apart', () => {
    expect(parseBranchName('release/ios/2026-08-13-1432')).toEqual({
      platform: 'ios',
      stamp: '2026-08-13-1432',
    });
  });

  it('does not accept a tag as a branch', () => {
    // The anchored pattern is the only thing keeping the pruner from
    // considering a tag for deletion.
    expect(parseBranchName('release/ios/2026-08-13-1432-success')).toBeNull();
  });

  it('does not accept anything else in the repository', () => {
    expect(parseBranchName('main')).toBeNull();
    expect(parseBranchName('feature/797/notification-icon')).toBeNull();
    expect(parseBranchName('release/web/2026-08-13-1432')).toBeNull();
    expect(parseBranchName('release/ios/2026-08-13-1432/hotfix')).toBeNull();
    expect(parseBranchName('releases/ios/2026-08-13-1432')).toBeNull();
  });

  it('rejects a well-shaped name whose date is impossible', () => {
    expect(parseBranchName('release/ios/2026-02-30-1432')).toBeNull();
  });
});

describe('parseTagName', () => {
  it('reports the outcome alongside the run it belongs to', () => {
    expect(parseTagName('release/android/2026-08-13-1432-failed')).toEqual({
      platform: 'android',
      stamp: '2026-08-13-1432',
      outcome: 'failed',
    });
  });

  it('does not accept a branch as a tag', () => {
    expect(parseTagName('release/ios/2026-08-13-1432')).toBeNull();
  });

  it('does not accept an outcome it has no rule for', () => {
    expect(parseTagName('release/ios/2026-08-13-1432-partial')).toBeNull();
  });
});

describe('availableBranchName', () => {
  it('uses the current minute when nothing has claimed it', () => {
    expect(availableBranchName('ios', AUGUST, [])).toBe(
      'release/ios/2026-08-13-1432',
    );
  });

  it('walks forward a minute when two runs start together', () => {
    expect(
      availableBranchName('ios', AUGUST, ['release/ios/2026-08-13-1432']),
    ).toBe('release/ios/2026-08-13-1433');
  });

  it('keeps walking past a run of taken minutes', () => {
    const taken = [
      'release/ios/2026-08-13-1432',
      'release/ios/2026-08-13-1433',
      'release/ios/2026-08-13-1434',
    ];
    expect(availableBranchName('ios', AUGUST, taken)).toBe(
      'release/ios/2026-08-13-1435',
    );
  });

  it('is not blocked by the other platform holding the same minute', () => {
    expect(
      availableBranchName('ios', AUGUST, ['release/android/2026-08-13-1432']),
    ).toBe('release/ios/2026-08-13-1432');
  });

  it('rolls the hour and the day rather than producing an impossible time', () => {
    const lateAtNight = new Date(2026, 7, 13, 23, 59);
    expect(
      availableBranchName('ios', lateAtNight, ['release/ios/2026-08-13-2359']),
    ).toBe('release/ios/2026-08-14-0000');
  });

  it('gives up rather than looping forever when every minute is taken', () => {
    const taken = Array.from({ length: 5 }, (_, minute) =>
      branchNameFor('ios', new Date(2026, 7, 13, 14, 32 + minute)),
    );
    expect(() => availableBranchName('ios', AUGUST, taken, 3)).toThrow(
      ReleaseNameError,
    );
  });
});

describe('buildTagMessage', () => {
  const details = {
    branch: 'release/ios/2026-08-13-1432',
    platform: 'ios' as const,
    outcome: 'success' as const,
    commit: '8a9e2e2f1c4b9d0e7a3f5c2b1d8e6f4a9c7b3d2e',
    profile: 'production',
    startedAt: '2026-08-13 14:32:07',
    duration: '00:12:41',
    exitCode: 0,
    submitted: true,
    easBuildId: 'a1b2c3d4',
  };

  it('opens with a line that says what happened', () => {
    expect(buildTagMessage(details).split('\n')[0]).toBe(
      'Released: ios release/ios/2026-08-13-1432',
    );
  });

  it('gives each fact its own greppable line', () => {
    const message = buildTagMessage(details);
    expect(message).toContain(
      'Commit: 8a9e2e2f1c4b9d0e7a3f5c2b1d8e6f4a9c7b3d2e',
    );
    expect(message).toContain('Duration: 00:12:41');
    expect(message).toContain('Exit code: 0');
    expect(message).toContain('Submitted: yes');
    expect(message).toContain('EAS build: a1b2c3d4');
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

describe('selectPrunable', () => {
  const old = formatStamp(daysBefore(DEFAULT_KEEP_DAYS + 1));
  const recent = formatStamp(daysBefore(2));

  it('keeps a successful release however old it is', () => {
    // These are the commits a hotfix would branch from.
    const plan = selectPrunable({
      branches: [`release/ios/${old}`],
      tags: [`release/ios/${old}-success`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([]);
    expect(plan.unfinished).toEqual([]);
    expect(plan.kept).toEqual([`release/ios/${old}`]);
  });

  it('keeps a recent failure, because it is still being looked into', () => {
    const plan = selectPrunable({
      branches: [`release/ios/${recent}`],
      tags: [`release/ios/${recent}-failed`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([]);
    expect(plan.kept).toEqual([`release/ios/${recent}`]);
  });

  it('prunes a failure past the keep window', () => {
    const plan = selectPrunable({
      branches: [`release/android/${old}`],
      tags: [`release/android/${old}-failed`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([`release/android/${old}`]);
    expect(plan.kept).toEqual([]);
  });

  it('reports an old branch with no tag as unfinished, not as failed', () => {
    // The two are handled differently: an unfinished branch has to be tagged
    // before it can be deleted without orphaning its commit.
    const plan = selectPrunable({
      branches: [`release/ios/${old}`],
      tags: [],
      now: AUGUST,
    });
    expect(plan.unfinished).toEqual([`release/ios/${old}`]);
    expect(plan.failed).toEqual([]);
  });

  it('still prunes a branch already tagged unfinished by an earlier run', () => {
    // A prune whose deletion failed must not leave the branch behind forever.
    const plan = selectPrunable({
      branches: [`release/ios/${old}`],
      tags: [`release/ios/${old}-unfinished`],
      now: AUGUST,
    });
    expect(plan.failed).toEqual([`release/ios/${old}`]);
  });

  it('respects a keep window given to it', () => {
    const branches = [`release/ios/${old}`];
    const tags = [`release/ios/${old}-failed`];
    expect(
      selectPrunable({ branches, tags, now: AUGUST, keepDays: 90 }).kept,
    ).toEqual(branches);
    expect(
      selectPrunable({ branches, tags, now: AUGUST, keepDays: 0 }).failed,
    ).toEqual(branches);
  });

  it('leaves alone every branch it does not recognise', () => {
    // The one irreversible thing here is deleting a branch, so anything
    // unparseable is ignored rather than guessed at.
    const plan = selectPrunable({
      branches: [
        'main',
        'feature/797/notification-icon',
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
      branches: [`release/ios/${old}-failed`],
      tags: [`release/ios/${old}-failed`],
      now: AUGUST,
      keepDays: 0,
    });
    expect(plan).toEqual({ failed: [], unfinished: [], kept: [] });
  });

  it('matches a tag to its own run and not to the other platform', () => {
    // Same minute, two platforms: iOS succeeded and Android did not. Reading
    // the stamp alone would keep both.
    const plan = selectPrunable({
      branches: [`release/ios/${old}`, `release/android/${old}`],
      tags: [`release/ios/${old}-success`, `release/android/${old}-failed`],
      now: AUGUST,
    });
    expect(plan.kept).toEqual([`release/ios/${old}`]);
    expect(plan.failed).toEqual([`release/android/${old}`]);
  });

  it('keeps a run that both failed and succeeded, on the strength of the success', () => {
    // A retry that reused the branch. Success wins: the commit shipped.
    const plan = selectPrunable({
      branches: [`release/ios/${old}`],
      tags: [`release/ios/${old}-failed`, `release/ios/${old}-success`],
      now: AUGUST,
    });
    expect(plan.kept).toEqual([`release/ios/${old}`]);
    expect(plan.failed).toEqual([]);
  });
});
