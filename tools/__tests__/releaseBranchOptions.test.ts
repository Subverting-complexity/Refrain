/**
 * The command line of `tools/release-branch.mjs`.
 *
 * The reason to test a parser this small is `prune --keep-days`. A
 * misspelling that were quietly ignored would prune to the default of thirty
 * days while its author believed it had been told ninety, and the branches
 * would be gone before anyone noticed the flag had never been read. So every
 * case below is really the same case: an argument this tool does not
 * understand has to stop it, not be dropped.
 *
 * `--platforms` on `start` and `--platform` on `finish` are the second reason.
 * They are one letter apart and mean different things, and swapping them would
 * open a release covering a platform set of one and leave the other platform
 * with no open run to tag.
 */

import {
  parseArgs,
  UsageError,
  usage,
} from '../lib/release-branch-options.mjs';

describe('the command', () => {
  it('defaults to help when nothing is asked for', () => {
    expect(parseArgs([]).command).toBe('help');
  });

  it('reads the usual spellings of help', () => {
    for (const spelling of ['-h', '--help', '-?', 'help']) {
      expect(parseArgs([spelling]).command).toBe('help');
    }
  });

  it('refuses a command it does not have', () => {
    expect(() => parseArgs(['deploy'])).toThrow(UsageError);
    expect(() => parseArgs(['deploy'])).toThrow(/start, finish, stop, prune/);
  });
});

describe('start', () => {
  it('reads the platform set, the lane and the profile', () => {
    const options = parseArgs([
      'start',
      '--platforms',
      'both',
      '--lane',
      'store',
      '--profile',
      'production',
    ]);
    expect(options).toMatchObject({
      command: 'start',
      platforms: ['ios', 'android'],
      lane: 'store',
      profile: 'production',
      allowDirty: false,
    });
  });

  it('reads a single-platform release as a first-class choice', () => {
    expect(parseArgs(['start', '--platforms', 'android']).platforms).toEqual([
      'android',
    ]);
  });

  it('needs a platform set, because it cannot guess one', () => {
    // Guessing "both" would leave a single-platform release with an open run
    // that never clears, and the next release would find one already in flight.
    expect(() => parseArgs(['start'])).toThrow(/needs --platforms/);
  });

  it('refuses a platform that does not ship to a store', () => {
    expect(() => parseArgs(['start', '--platforms', 'web'])).toThrow(
      UsageError,
    );
    expect(() => parseArgs(['start', '--platforms', 'web'])).toThrow(
      /Unknown platform/,
    );
  });

  it('refuses a lane it has no submit configuration for', () => {
    expect(() =>
      parseArgs(['start', '--platforms', 'ios', '--lane', 'beta']),
    ).toThrow(/Unknown lane 'beta'/);
  });

  it('reads --allow-dirty as the switch it is', () => {
    expect(
      parseArgs(['start', '--platforms', 'ios', '--allow-dirty']).allowDirty,
    ).toBe(true);
  });

  it('refuses an option that belongs to another command', () => {
    // `--outcome` is meaningful, just not here, and a start that accepted it
    // would silently ignore it.
    expect(() =>
      parseArgs(['start', '--platforms', 'ios', '--outcome', 'success']),
    ).toThrow(/Unknown option '--outcome' for 'start'/);
  });

  it('refuses the singular --platform, which means something else', () => {
    expect(() => parseArgs(['start', '--platform', 'ios'])).toThrow(
      /Unknown option '--platform' for 'start'/,
    );
  });
});

describe('finish', () => {
  const base = ['finish', '--platform', 'android', '--outcome', 'failed'];

  it('reads everything a finished platform has to say', () => {
    const options = parseArgs([
      ...base,
      '--exit-code',
      '1',
      '--duration',
      '00:12:41',
      '--listing',
      'failed: fastlane exited 1',
      '--submit-profile',
      'internal',
      '--eas-build-id',
      'a1b2c3d4',
      '--eas-build-url',
      'https://expo.dev/builds/a1b2c3d4',
      '--notes',
      'Provisioning profile was out of date',
      '--submitted',
    ]);

    expect(options).toMatchObject({
      command: 'finish',
      platform: 'android',
      outcome: 'failed',
      exitCode: 1,
      duration: '00:12:41',
      listing: 'failed: fastlane exited 1',
      submitProfile: 'internal',
      easBuildId: 'a1b2c3d4',
      easBuildUrl: 'https://expo.dev/builds/a1b2c3d4',
      notes: 'Provisioning profile was out of date',
      submitted: true,
    });
  });

  it('converts a kebab-case option to the name the tool reads', () => {
    expect(parseArgs([...base, '--eas-build-id', 'x']).easBuildId).toBe('x');
    expect(parseArgs([...base, '--submit-profile', 'x']).submitProfile).toBe(
      'x',
    );
  });

  it('needs an outcome', () => {
    expect(() => parseArgs(['finish', '--platform', 'ios'])).toThrow(
      /needs --outcome/,
    );
  });

  it('refuses "unfinished", which is the pruner\'s word and not a run\'s', () => {
    // A run reporting that it never finished is a contradiction: it was there
    // to report. See tools/lib/release-branch.mjs.
    expect(() =>
      parseArgs(['finish', '--platform', 'ios', '--outcome', 'unfinished']),
    ).toThrow(/Expected success or failed/);
  });

  it('reads an exit code as a number rather than as text', () => {
    expect(parseArgs([...base, '--exit-code', '0']).exitCode).toBe(0);
  });

  it('refuses an exit code that is not a number', () => {
    expect(() => parseArgs([...base, '--exit-code', 'boom'])).toThrow(
      /whole number/,
    );
  });
});

describe('stop', () => {
  it('needs nothing, because it is called whether or not a release is open', () => {
    expect(parseArgs(['stop'])).toMatchObject({
      command: 'stop',
      noPrune: false,
    });
  });

  it('takes a remote and a keep window for the prune it runs', () => {
    expect(
      parseArgs(['stop', '--remote', 'upstream', '--keep-days', '90']),
    ).toMatchObject({ remote: 'upstream', keepDays: 90 });
  });
});

describe('prune', () => {
  it('takes a keep window and a dry run', () => {
    expect(
      parseArgs(['prune', '--keep-days', '90', '--dry-run']),
    ).toMatchObject({
      command: 'prune',
      keepDays: 90,
      dryRun: true,
    });
  });

  it('needs nothing at all', () => {
    expect(parseArgs(['prune']).keepDays).toBeUndefined();
  });

  it('refuses a negative keep window', () => {
    // Every branch would be past a negative window, including today's.
    expect(() => parseArgs(['prune', '--keep-days', '-1'])).toThrow(
      /cannot be negative/,
    );
  });

  it('refuses a misspelled keep window rather than falling back to the default', () => {
    expect(() => parseArgs(['prune', '--keepdays', '90'])).toThrow(
      /Unknown option/,
    );
  });
});

describe('the listing commands', () => {
  it('reads the selector and the lane a check is run under', () => {
    expect(
      parseArgs([
        'listing-check',
        '--platform',
        'ios',
        '--lane',
        'fast',
        '--listing',
        'on',
      ]),
    ).toMatchObject({ platform: 'ios', lane: 'fast', listing: 'on' });
  });

  it('refuses a selector it has no rule for', () => {
    expect(() =>
      parseArgs(['listing-check', '--platform', 'ios', '--listing', 'maybe']),
    ).toThrow(/Unknown listing selector 'maybe'/);
  });

  it('lets finish record any listing result, because that is free text', () => {
    // Same option name, two jobs: a selector on the listing commands, and
    // "what happened to the listing" on finish, which ends up in a tag message.
    expect(
      parseArgs([
        'finish',
        '--platform',
        'ios',
        '--outcome',
        'success',
        '--listing',
        'failed: fastlane exited 1',
      ]).listing,
    ).toBe('failed: fastlane exited 1');
  });

  it('needs a platform set for the preflight, so it knows which keys to want', () => {
    expect(() => parseArgs(['listing-preflight'])).toThrow(/needs --platforms/);
    expect(
      parseArgs(['listing-preflight', '--platforms', 'both']).platforms,
    ).toEqual(['ios', 'android']);
  });
});

describe('option values', () => {
  it('refuses an option given twice, rather than picking one', () => {
    expect(() =>
      parseArgs(['start', '--platforms', 'ios', '--platforms', 'android']),
    ).toThrow(/given twice/);
  });

  it('refuses an option with no value', () => {
    expect(() => parseArgs(['start', '--platforms'])).toThrow(/needs a value/);
  });

  it('refuses to swallow the next option as a value', () => {
    // `--profile --allow-dirty` is a forgotten argument, not a profile called
    // "--allow-dirty", and taking it would leave the switch silently off.
    expect(() =>
      parseArgs(['start', '--platforms', 'ios', '--profile', '--allow-dirty']),
    ).toThrow(/needs a value/);
  });

  it('refuses a bare word where an option was expected', () => {
    expect(() => parseArgs(['prune', '90'])).toThrow(
      /Unexpected argument '90'/,
    );
  });

  it('keeps a value that contains spaces intact', () => {
    const notes = 'App Group missing from the widget profile';
    expect(
      parseArgs([
        'finish',
        '--platform',
        'ios',
        '--outcome',
        'failed',
        '--notes',
        notes,
      ]).notes,
    ).toBe(notes);
  });
});

describe('usage', () => {
  it('names every command it accepts', () => {
    const text = usage();
    for (const command of [
      'start',
      'finish',
      'stop',
      'prune',
      'listing-check',
      'listing-preflight',
      'help',
    ]) {
      expect(text).toContain(command);
    }
  });
});
