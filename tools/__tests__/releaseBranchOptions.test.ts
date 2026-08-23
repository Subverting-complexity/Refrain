/**
 * The command line of `tools/release-branch.mjs`.
 *
 * The reason to test a parser this small is `prune --keep-days`. A
 * misspelling that were quietly ignored would prune to the default of thirty
 * days while its author believed it had been told ninety, and the branches
 * would be gone before anyone noticed the flag had never been read. So every
 * case below is really the same case: an argument this tool does not
 * understand has to stop it, not be dropped.
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
    expect(() => parseArgs(['deploy'])).toThrow(/start, finish, prune/);
  });
});

describe('start', () => {
  it('reads the platform and the profile', () => {
    const options = parseArgs([
      'start',
      '--platform',
      'ios',
      '--profile',
      'production',
    ]);
    expect(options).toMatchObject({
      command: 'start',
      platform: 'ios',
      profile: 'production',
      allowDirty: false,
    });
  });

  it('needs a platform, because it cannot guess one', () => {
    expect(() => parseArgs(['start'])).toThrow(/needs --platform/);
  });

  it('refuses a platform that does not ship to a store', () => {
    expect(() => parseArgs(['start', '--platform', 'web'])).toThrow(
      /Unknown platform/,
    );
  });

  it('reads --allow-dirty as the switch it is', () => {
    expect(
      parseArgs(['start', '--platform', 'ios', '--allow-dirty']).allowDirty,
    ).toBe(true);
  });

  it('refuses an option that belongs to another command', () => {
    // `--outcome` is meaningful, just not here, and a start that accepted it
    // would silently ignore it.
    expect(() =>
      parseArgs(['start', '--platform', 'ios', '--outcome', 'success']),
    ).toThrow(/Unknown option '--outcome' for 'start'/);
  });
});

describe('finish', () => {
  const base = ['finish', '--platform', 'android', '--outcome', 'failed'];

  it('reads everything a finished run has to say', () => {
    const options = parseArgs([
      ...base,
      '--exit-code',
      '1',
      '--duration',
      '00:12:41',
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
      easBuildId: 'a1b2c3d4',
      easBuildUrl: 'https://expo.dev/builds/a1b2c3d4',
      notes: 'Provisioning profile was out of date',
      submitted: true,
    });
  });

  it('converts a kebab-case option to the name the tool reads', () => {
    expect(parseArgs([...base, '--eas-build-id', 'x']).easBuildId).toBe('x');
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

describe('option values', () => {
  it('refuses an option given twice, rather than picking one', () => {
    expect(() =>
      parseArgs(['start', '--platform', 'ios', '--platform', 'android']),
    ).toThrow(/given twice/);
  });

  it('refuses an option with no value', () => {
    expect(() => parseArgs(['start', '--platform'])).toThrow(/needs a value/);
  });

  it('refuses to swallow the next option as a value', () => {
    // `--profile --allow-dirty` is a forgotten argument, not a profile called
    // "--allow-dirty", and taking it would leave the switch silently off.
    expect(() =>
      parseArgs(['start', '--platform', 'ios', '--profile', '--allow-dirty']),
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
    for (const command of ['start', 'finish', 'prune', 'help']) {
      expect(text).toContain(command);
    }
  });
});
