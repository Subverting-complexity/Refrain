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

/**
 * The version already sitting on the base branch, whether the bump commit is
 * `HEAD` itself or the branch that `HEAD` merged.
 *
 * The bump now reaches the default branch through a pull request rather than a
 * direct push, and a merge commit leaves `HEAD` reading
 * `Merge pull request #12 from ...`. Reading only `HEAD`'s own subject would
 * therefore stop recognising a bump the moment it landed, and the guard that
 * makes a retry a no-op would bump a second time on the retry.
 *
 * Two subjects rather than a walk back through history on purpose. The two
 * shapes this tool creates are "the bump is `HEAD`" (nothing was merged yet,
 * or the merge fast-forwarded) and "`HEAD` is the merge that landed it", and
 * anything further back is a bump some *earlier* release already used.
 *
 * @param {object} subjects
 * @param {string} subjects.head `HEAD`'s own `%s`
 * @param {string | null} [subjects.merged] the `%s` of `HEAD`'s second parent,
 *   or `null` when `HEAD` is not a merge commit
 * @returns {string | null} the version already bumped to, or `null`
 */
export function landedBumpVersion({ head, merged }) {
  return bumpCommitVersion(head) ?? (merged ? bumpCommitVersion(merged) : null);
}

/**
 * The pull request title for a bump. Same text as the commit subject, so the
 * pull request list reads like the commit history it produces.
 *
 * @param {string} next
 */
export function bumpPullRequestTitle(next) {
  return bumpCommitMessage(next);
}

/**
 * The pull request body for a bump.
 *
 * Says what the branch is for and what is about to happen to it, because this
 * pull request is opened and merged within the same second and the only person
 * who will ever read it is someone looking back at why a merge commit exists
 * on the default branch.
 *
 * @param {object} input
 * @param {string} input.current
 * @param {string} input.next
 * @param {string} input.branch the release branch, which is also the PR source
 */
export function bumpPullRequestBody({ current, next, branch }) {
  return [
    `Automated release version bump, ${current} to ${next}.`,
    '',
    `Opened from \`${branch}\`, which is the release branch for this release: it is`,
    'cut from the bump commit itself, so the branch names exactly what is about to',
    'be built. This pull request is merged immediately by the deploy script, before',
    'any build starts.',
    '',
    'Raised by `tools/version-bump.mjs`.',
  ].join('\n');
}
