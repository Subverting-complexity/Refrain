/**
 * Semver arithmetic for the release version bump.
 *
 * Pure functions only — no git, no filesystem — so the bump rules can be
 * unit-tested directly (see `tools/__tests__/versionBump.test.ts`).
 * `tools/version-bump.mjs` keeps the side effects: reading and writing
 * `app.json` / `package.json`, and the branch-and-merge that lands the bump
 * on `main`.
 *
 * Only `major.minor.patch` is supported. Pre-release and build-metadata
 * suffixes (`1.2.0-beta.1`, `1.2.0+build5`) are refused rather than guessed
 * at, because a store-facing version string has no use for either and a
 * silently dropped suffix would be a worse surprise than an error.
 *
 * `bumpCommitMessage` / `bumpCommitVersion` are the pure half of the rule
 * that keeps a bump from happening twice when both platforms are deployed
 * in one sitting — see `tools/version-bump.mjs` for where that rule is
 * applied, and `tools/__tests__/versionBump.integration.test.ts` for the
 * end-to-end proof that a second run in a row is a no-op.
 */

/** The bump levels this tool accepts, in ascending order of how much they reset. */
export const LEVELS = /** @type {const} */ (['patch', 'minor', 'major']);

/** Thrown for a version string or level this module cannot make sense of. */
export class VersionError extends Error {}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * @typedef {object} Semver
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 */

/**
 * Splits a `major.minor.patch` string into its parts.
 *
 * @param {string} version
 * @returns {Semver}
 * @throws {VersionError} if `version` is not plain `major.minor.patch`
 */
export function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) {
    throw new VersionError(`'${version}' is not a plain major.minor.patch version.`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * @param {Semver} semver
 * @returns {string}
 */
export function formatSemver(semver) {
  return `${semver.major}.${semver.minor}.${semver.patch}`;
}

/**
 * The next version at the given level.
 *
 * Standard semver reset rules: a minor bump zeroes the patch, a major bump
 * zeroes both minor and patch. A patch bump touches only the patch number.
 *
 * @param {string} version current `major.minor.patch`
 * @param {'patch' | 'minor' | 'major'} level
 * @returns {string} the next version
 * @throws {VersionError} for an unparseable version or unknown level
 */
export function bumpVersion(version, level) {
  if (!LEVELS.includes(level)) {
    throw new VersionError(`Unknown bump level '${level}'. Expected ${LEVELS.join(', ')}.`);
  }

  const current = parseSemver(version);
  if (level === 'major') {
    return formatSemver({ major: current.major + 1, minor: 0, patch: 0 });
  }
  if (level === 'minor') {
    return formatSemver({ major: current.major, minor: current.minor + 1, patch: 0 });
  }
  return formatSemver({ major: current.major, minor: current.minor, patch: current.patch + 1 });
}

/** Matches a top-level `"version": "..."` field in a JSON document's raw text. */
const VERSION_FIELD_PATTERN = /"version"\s*:\s*"([^"]*)"/g;

/**
 * Replaces the one `"version"` field in a JSON document's raw text, leaving
 * every other byte — indentation, key order, trailing newline — untouched.
 *
 * A parse-edit-`JSON.stringify` round trip would work too, but this project's
 * `format:check` runs Prettier over `**\/*.json`, and there is no guarantee
 * `JSON.stringify(parsed, null, 2)` reproduces Prettier's own formatting
 * exactly. A surgical text replace can only ever change the one line it
 * targets, so a file that was Prettier-clean before the bump stays
 * Prettier-clean after it.
 *
 * Refuses a file with zero or more than one `"version"` field rather than
 * guessing which one is the release version — `app.json` and `package.json`
 * each have exactly one today, and a second one appearing (a nested
 * dependency block, say) is a shape change this tool should not paper over.
 *
 * @param {string} json raw file text
 * @param {string} next the version to write in
 * @returns {string}
 * @throws {VersionError} if the field is missing or ambiguous
 */
export function replaceVersionField(json, next) {
  const matches = json.match(VERSION_FIELD_PATTERN);
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    throw new VersionError(`Expected exactly one "version" field, found ${count}.`);
  }
  return json.replace(VERSION_FIELD_PATTERN, `"version": "${next}"`);
}

/**
 * Matches exactly what {@link bumpCommitMessage} produces. Kept as one
 * pattern rather than two independent strings, so the writer and the reader
 * of a bump commit's message cannot drift apart.
 */
const BUMP_COMMIT_PATTERN = /^chore\(release\): bump version to (\d+\.\d+\.\d+)$/;

/**
 * The commit message a version bump writes.
 *
 * @param {string} next
 * @returns {string}
 */
export function bumpCommitMessage(next) {
  return `chore(release): bump version to ${next}`;
}

/**
 * Whether a commit subject is one this tool itself wrote, and if so, the
 * version it bumped to.
 *
 * This is what makes a second bump in the same sitting a no-op instead of a
 * second bump: if `HEAD`'s own commit is already a bump this tool wrote,
 * nothing has landed on the base branch since, and there is nothing new to
 * release. Read from the commit that is actually on the branch rather than
 * from a local state file, so the check holds even when the two platform
 * deploys run from different machines, and resets itself the moment a real
 * commit — a merged PR, a hotfix — lands on top of it.
 *
 * @param {string} subject a commit's `%s` (first line only)
 * @returns {string | null} the version it bumped to, or `null` if this is not
 *   a bump commit
 */
export function bumpCommitVersion(subject) {
  const match = BUMP_COMMIT_PATTERN.exec(subject.trim());
  return match ? (match[1] ?? null) : null;
}
