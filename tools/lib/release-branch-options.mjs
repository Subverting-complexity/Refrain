/**
 * Command line parsing for `tools/release-branch.mjs`.
 *
 * Separate from the tool itself so everything here can be a pure function of
 * its arguments and unit-tested without running git. An unrecognised
 * argument is an error rather than a shrug: a misspelled `--keep-days` that
 * was quietly ignored would prune to the default of thirty days while its
 * author believed it had been told ninety, and the branches would already be
 * gone by the time anyone noticed.
 */

import { LANES, OUTCOMES, parsePlatformSelection, PLATFORMS } from './release-branch.mjs';
import { LISTING_SELECTORS } from './release-listing.mjs';

/** Thrown for a command line this module cannot make sense of. */
export class UsageError extends Error {}

/**
 * What one subcommand accepts.
 *
 * @typedef {object} CommandSpec
 * @property {string} summary
 * @property {string[]} values options that take an argument
 * @property {string[]} flags options that do not
 * @property {string[]} required options that must be present
 */

/**
 * Every subcommand and what it accepts.
 *
 * Names are camelCase here and kebab-case on the command line; `--eas-build-id`
 * and `easBuildId` are the same option, converted rather than listed twice.
 *
 * `start` takes `--platforms` (the set this release covers) while `finish`
 * takes `--platform` (the one reporting). They are deliberately different
 * words: the run state has to know the whole set up front, or a release that
 * stops after the first platform leaves state nobody will ever clear.
 *
 * @type {Record<string, CommandSpec>}
 */
export const COMMANDS = {
  start: {
    summary: 'Cut and push the one release branch for a release about to start.',
    values: ['platforms', 'lane', 'profile', 'remote'],
    flags: ['allowDirty'],
    required: ['platforms'],
  },
  finish: {
    summary: "Tag one platform's outcome on the release branch.",
    values: [
      'platform',
      'outcome',
      'exitCode',
      'duration',
      'listing',
      'submitProfile',
      'easBuildId',
      'easBuildUrl',
      'notes',
      'remote',
      'keepDays',
    ],
    flags: ['submitted', 'noPrune'],
    required: ['platform', 'outcome'],
  },
  stop: {
    summary: 'Close a release that ended early, leaving unattempted platforms untagged.',
    values: ['notes', 'remote', 'keepDays'],
    flags: ['noPrune'],
    required: [],
  },
  prune: {
    summary: 'Remove failed and unfinished release branches past their keep window.',
    values: ['remote', 'keepDays'],
    flags: ['dryRun'],
    required: [],
  },
  'listing-check': {
    summary: "Decide whether one platform's store listing needs pushing (exit 20 = skip).",
    values: ['platform', 'lane', 'listing', 'remote'],
    flags: [],
    required: ['platform'],
  },
  'listing-preflight': {
    summary: 'Check the listing toolchain and credentials before the first build.',
    values: ['platforms', 'lane', 'listing'],
    flags: [],
    required: ['platforms'],
  },
  help: { summary: 'Show this text.', values: [], flags: [], required: [] },
};

/**
 * The outcomes a run may report about itself.
 *
 * `unfinished` is deliberately excluded: it is what the pruner concludes about
 * a run that never came back to report anything, so a run reporting it about
 * itself is a contradiction. See `release-branch.mjs`.
 */
const REPORTABLE_OUTCOMES = OUTCOMES.filter((outcome) => outcome !== 'unfinished');

/** Argument forms that ask for the usage text instead of naming a command. */
const HELP_SPELLINGS = new Set(['-h', '--help', '-?', 'help']);

/** @param {string} name */
function toCamelCase(name) {
  return name.replace(/-([a-z])/g, (_, letter) => String(letter).toUpperCase());
}

/** @param {string} name */
function toKebabCase(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Reads a whole number, refusing the silent `NaN` that `Number` would hand
 * back for `--keep-days soon`.
 *
 * @param {string} option
 * @param {string} raw
 */
function readInteger(option, raw) {
  if (!/^-?\d+$/.test(raw)) {
    throw new UsageError(`--${toKebabCase(option)} needs a whole number, not '${raw}'.`);
  }
  return Number(raw);
}

/**
 * The options a release-branch invocation names.
 *
 * @typedef {object} ReleaseOptions
 * @property {string} command
 * @property {string} [platform] the one platform reporting an outcome
 * @property {('ios' | 'android')[]} [platforms] the set a release covers
 * @property {string} [lane]
 * @property {string} [listing]
 * @property {string} [profile]
 * @property {string} [submitProfile]
 * @property {string} [outcome]
 * @property {string} [remote]
 * @property {string} [duration]
 * @property {string} [easBuildId]
 * @property {string} [easBuildUrl]
 * @property {string} [notes]
 * @property {number} [exitCode]
 * @property {number} [keepDays]
 * @property {boolean} allowDirty
 * @property {boolean} submitted
 * @property {boolean} noPrune
 * @property {boolean} dryRun
 */

/**
 * Turns an argument list into the options a run reads from.
 *
 * The values are gathered into a map first and assembled into the options
 * object afterwards, rather than assigned key by key as they are read. That is
 * not ceremony: assigning through a computed key would put every option's type
 * beyond the type checker's reach, and `--exit-code` arriving as the string
 * `'0'` where a number was expected is exactly the kind of thing this project
 * checks `.mjs` files to catch.
 *
 * @param {string[]} argv
 * @returns {ReleaseOptions}
 * @throws {UsageError} for an unknown command, an unknown or repeated option,
 *   a missing value, or a missing required option
 */
export function parseArgs(argv) {
  const [rawCommand = 'help', ...rest] = argv;

  if (HELP_SPELLINGS.has(rawCommand)) return blank('help');

  const spec = COMMANDS[rawCommand];
  if (!spec) {
    throw new UsageError(
      `Unknown command '${rawCommand}'. Expected ${Object.keys(COMMANDS).join(', ')}.`,
    );
  }

  const { values, flags } = readTokens(spec, rest, rawCommand);

  for (const required of spec.required) {
    if (!values.has(required) && !flags.has(required)) {
      throw new UsageError(`'${rawCommand}' needs --${toKebabCase(required)}.`);
    }
  }

  const options = blank(rawCommand);
  options.platform = values.get('platform');
  options.lane = values.get('lane');
  options.listing = values.get('listing');
  options.profile = values.get('profile');
  options.submitProfile = values.get('submitProfile');
  options.outcome = values.get('outcome');
  options.remote = values.get('remote');
  options.duration = values.get('duration');
  options.easBuildId = values.get('easBuildId');
  options.easBuildUrl = values.get('easBuildUrl');
  options.notes = values.get('notes');

  options.exitCode = readOptionalInteger(values, 'exitCode');
  options.keepDays = readOptionalInteger(values, 'keepDays');

  options.allowDirty = flags.has('allowDirty');
  options.submitted = flags.has('submitted');
  options.noPrune = flags.has('noPrune');
  options.dryRun = flags.has('dryRun');

  const platforms = values.get('platforms');
  if (platforms !== undefined) {
    try {
      options.platforms = parsePlatformSelection(platforms);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }

  assertValues(options);
  return options;
}

/**
 * Splits an argument list into the options that carry a value and the
 * switches that do not, refusing anything the command does not accept.
 *
 * @param {CommandSpec} spec
 * @param {string[]} rest arguments after the command
 * @param {string} command for the error messages
 * @returns {{ values: Map<string, string>, flags: Set<string> }}
 * @throws {UsageError}
 */
function readTokens(spec, rest, command) {
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {Set<string>} */
  const flags = new Set();

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (!arg.startsWith('--')) throw new UsageError(`Unexpected argument '${arg}'.`);

    const name = toCamelCase(arg.slice(2));
    const takesValue = spec.values.includes(name);

    if (!takesValue && !spec.flags.includes(name)) {
      throw new UsageError(`Unknown option '${arg}' for '${command}'.`);
    }
    if (values.has(name) || flags.has(name)) {
      throw new UsageError(`Option '${arg}' was given twice.`);
    }

    if (!takesValue) {
      flags.add(name);
      continue;
    }

    const value = rest[index + 1];
    // A value that itself looks like an option is nearly always a forgotten
    // argument rather than a deliberate one, and swallowing it would leave the
    // next option silently unset.
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`Option '${arg}' needs a value.`);
    }
    values.set(name, value);
    index += 1;
  }

  return { values, flags };
}

/**
 * A numeric option's value, or `undefined` if it was not given.
 *
 * @param {Map<string, string>} values
 * @param {string} name
 * @returns {number | undefined}
 */
function readOptionalInteger(values, name) {
  const raw = values.get(name);
  return raw === undefined ? undefined : readInteger(name, raw);
}

/**
 * Rejects values that parse as text but name nothing real.
 *
 * @param {ReleaseOptions} options
 */
function assertValues(options) {
  const platform = options.platform;
  if (platform !== undefined && !PLATFORMS.some((known) => known === platform)) {
    throw new UsageError(`Unknown platform '${platform}'. Expected ${PLATFORMS.join(' or ')}.`);
  }

  const outcome = options.outcome;
  if (outcome !== undefined && !REPORTABLE_OUTCOMES.some((known) => known === outcome)) {
    throw new UsageError(
      `Unknown outcome '${outcome}'. Expected ${REPORTABLE_OUTCOMES.join(' or ')}.`,
    );
  }

  const lane = options.lane;
  if (lane !== undefined && !LANES.some((known) => known === lane)) {
    throw new UsageError(`Unknown lane '${lane}'. Expected ${LANES.join(' or ')}.`);
  }

  // `--listing` means two different things by command, and both are text this
  // parser can check: a selector on `listing-check` / `listing-preflight`, and
  // free-form "what happened to the listing" on `finish`. Only the first is
  // constrained, because the second ends up in a tag message.
  const listing = options.listing;
  if (
    listing !== undefined &&
    options.command !== 'finish' &&
    !LISTING_SELECTORS.some((known) => known === listing)
  ) {
    throw new UsageError(
      `Unknown listing selector '${listing}'. Expected ${LISTING_SELECTORS.join(', ')}.`,
    );
  }

  if (options.keepDays !== undefined && options.keepDays < 0) {
    throw new UsageError('--keep-days cannot be negative.');
  }
}

/**
 * The options object with every switch off, so callers never have to test for
 * `undefined` on a boolean.
 *
 * @param {string} command
 * @returns {ReleaseOptions}
 */
function blank(command) {
  return { command, allowDirty: false, submitted: false, noPrune: false, dryRun: false };
}

/** The text `help` prints, and what a usage error prints after itself. */
export function usage() {
  const lines = [
    'Usage: node tools/release-branch.mjs <command> [options]',
    '',
    ...Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(18)} ${spec.summary}`),
    '',
    '  start              --platforms <both|ios|android> [--lane <store|fast>]',
    '                     [--profile <name>] [--remote <name>] [--allow-dirty]',
    '  finish             --platform <ios|android> --outcome <success|failed>',
    '                     [--exit-code <n>] [--duration <hh:mm:ss>] [--submitted]',
    '                     [--listing <text>] [--submit-profile <name>]',
    '                     [--eas-build-id <id>] [--eas-build-url <url>] [--notes <text>]',
    '                     [--remote <name>] [--keep-days <n>] [--no-prune]',
    '  stop               [--notes <text>] [--remote <name>] [--keep-days <n>] [--no-prune]',
    '  prune              [--keep-days <n>] [--remote <name>] [--dry-run]',
    '  listing-check      --platform <ios|android> [--lane <store|fast>]',
    '                     [--listing <auto|on|off>] [--remote <name>]',
    '  listing-preflight  --platforms <both|ios|android> [--lane <store|fast>]',
    '                     [--listing <auto|on|off>]',
  ];
  return lines.join('\n');
}
