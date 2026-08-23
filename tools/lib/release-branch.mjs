/**
 * Naming and retention rules for release branches and their outcome tags.
 *
 * Everything here is a pure function of its arguments — no git, no clock, no
 * filesystem — so the rules that decide what gets deleted can be unit-tested
 * directly (see `tools/__tests__/releaseBranch.test.ts`).
 * `tools/release-branch.mjs` keeps the side effects.
 *
 * ## The shape of the record
 *
 * Each store deploy cuts a branch at the commit it is about to build, named
 * for the platform and the moment it started:
 *
 *     release/ios/2026-08-13-1432
 *
 * The branch carries no outcome, because the outcome is not known when the
 * branch is created and a name that has to change later is a name that has to
 * be deleted and re-pushed on the remote. Instead the run finishes by writing
 * an annotated tag at the same commit, and the tag carries the outcome both in
 * its name and, in more detail than a name can hold, in its message:
 *
 *     release/ios/2026-08-13-1432-success
 *     release/ios/2026-08-13-1432-failed
 *     release/ios/2026-08-13-1432-unfinished
 *
 * A tag is written once, when the answer is already known, so nothing is ever
 * renamed. That leaves one state a name cannot express and which is worth
 * having: a release branch with no tag beside it is a run that never reached
 * its own ending. The machine slept, the window was closed, the power went.
 * `unfinished` is what {@link selectPrunable} calls that, and it is applied by
 * the pruner rather than by the run, because by definition the run was not
 * there to apply it.
 *
 * ## Why the tag outlives the branch
 *
 * Two platforms attempting a release most working days would otherwise leave
 * a branch list nobody reads. So failed and unfinished branches are pruned
 * after a month while their tags are kept for good. Nothing is lost by that:
 * a tag pins the same commit the branch pointed at, and holds the profile,
 * the duration, the exit code and the EAS build link besides. Successful
 * branches are never pruned, because those are the ones you may still need to
 * cut a hotfix from.
 */

/** The platforms that ship to a store. Anything else is a development build. */
export const PLATFORMS = /** @type {const} */ (['ios', 'android']);

/** The first path segment of every release branch and tag. */
export const REF_PREFIX = 'release';

/**
 * The outcomes a tag can record.
 *
 * `unfinished` is not something a run reports about itself — see the module
 * comment. It exists so that every attempt ends up with exactly one tag,
 * which is what makes deleting the branch lossless.
 */
export const OUTCOMES = /** @type {const} */ (['success', 'failed', 'unfinished']);

/** How long a failed or unfinished branch is kept before pruning. */
export const DEFAULT_KEEP_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const STAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/;
const BRANCH_PATTERN = new RegExp(
  `^${REF_PREFIX}/(${PLATFORMS.join('|')})/(\\d{4}-\\d{2}-\\d{2}-\\d{4})$`,
);
const TAG_PATTERN = new RegExp(
  `^${REF_PREFIX}/(${PLATFORMS.join('|')})/(\\d{4}-\\d{2}-\\d{2}-\\d{4})-(${OUTCOMES.join('|')})$`,
);

/**
 * A release branch or tag, taken apart.
 *
 * @typedef {object} ReleaseRef
 * @property {'ios' | 'android'} platform
 * @property {string} stamp the `YYYY-MM-DD-HHmm` the run started
 * @property {'success' | 'failed' | 'unfinished'} [outcome] tags only
 */

/** Thrown for an argument this module cannot make a name out of. */
export class ReleaseNameError extends Error {}

/** @param {number} value */
function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * The `YYYY-MM-DD-HHmm` half of a release name, in local time.
 *
 * Local rather than UTC because the person reading the branch list is trying
 * to remember which attempt was theirs, and they remember the afternoon they
 * were sitting in, not the offset from Greenwich.
 *
 * @param {Date} date
 */
export function formatStamp(date) {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return stamp;
}

/**
 * The moment a stamp names, or `null` if it is not a stamp at all.
 *
 * Read back in local time, matching {@link formatStamp}. The bounds check
 * matters: `new Date(2026, 12, 40)` rolls happily into the following year
 * rather than failing, so a malformed stamp would otherwise parse into a
 * plausible date and be pruned against the wrong month.
 *
 * @param {string} stamp
 * @returns {Date | null}
 */
export function parseStamp(stamp) {
  const match = STAMP_PATTERN.exec(stamp);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute);
  const roundTripped =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;

  return roundTripped ? date : null;
}

/**
 * Asserts a platform is one that ships to a store.
 *
 * @param {string} platform
 * @returns {'ios' | 'android'}
 */
export function assertPlatform(platform) {
  const found = PLATFORMS.find((known) => known === platform);
  if (!found) {
    throw new ReleaseNameError(
      `Unknown platform '${platform}'. Expected ${PLATFORMS.join(' or ')}.`,
    );
  }
  return found;
}

/**
 * The branch name for a run starting now.
 *
 * @param {string} platform
 * @param {Date} date
 */
export function branchNameFor(platform, date) {
  return `${REF_PREFIX}/${assertPlatform(platform)}/${formatStamp(date)}`;
}

/**
 * The tag that records how a run ended.
 *
 * Built from the branch name rather than from the clock, so the tag always
 * lands on the stamp the branch already carries even if the run took long
 * enough to cross into the next minute — which, at ten to twenty minutes a
 * build, it invariably does.
 *
 * @param {string} branch
 * @param {string} outcome
 */
export function tagNameFor(branch, outcome) {
  if (!parseBranchName(branch)) {
    throw new ReleaseNameError(`'${branch}' is not a release branch name.`);
  }
  const found = OUTCOMES.find((known) => known === outcome);
  if (!found) {
    throw new ReleaseNameError(`Unknown outcome '${outcome}'. Expected ${OUTCOMES.join(', ')}.`);
  }
  return `${branch}-${found}`;
}

/**
 * Takes a branch name apart, or returns `null` for anything that is not one.
 *
 * The anchored pattern is what keeps tags out: `release/ios/2026-08-13-1432`
 * matches and `release/ios/2026-08-13-1432-success` does not, so a tag can
 * never be mistaken for a branch to delete.
 *
 * @param {string} name
 * @returns {ReleaseRef | null}
 */
export function parseBranchName(name) {
  const match = BRANCH_PATTERN.exec(name);
  if (!match) return null;
  const platform = /** @type {'ios' | 'android'} */ (match[1]);
  const stamp = match[2] ?? '';
  if (!parseStamp(stamp)) return null;
  return { platform, stamp };
}

/**
 * Takes a tag name apart, or returns `null` for anything that is not one.
 *
 * @param {string} name
 * @returns {ReleaseRef | null}
 */
export function parseTagName(name) {
  const match = TAG_PATTERN.exec(name);
  if (!match) return null;
  const platform = /** @type {'ios' | 'android'} */ (match[1]);
  const outcome = /** @type {'success' | 'failed' | 'unfinished'} */ (match[3]);
  const stamp = match[2] ?? '';
  if (!parseStamp(stamp)) return null;
  return { platform, stamp, outcome };
}

/**
 * The first free branch name at or after `date`.
 *
 * Two runs started in the same minute would otherwise want the same name, and
 * the second would fail on a ref that already exists. Walking the stamp
 * forward a minute at a time keeps names unique, ordered and parseable at the
 * cost of a stamp that can sit a minute or two ahead of the wall clock. That
 * is a better trade than refusing to deploy because you pressed the button
 * twice, and better than a disambiguating suffix, which every pattern in this
 * module would then have to allow for.
 *
 * @param {string} platform
 * @param {Date} date
 * @param {Iterable<string>} taken existing branch names
 * @param {number} [limit] minutes to try before giving up
 */
export function availableBranchName(platform, date, taken, limit = 60) {
  const existing = new Set(taken);
  const candidate = new Date(date.getTime());

  for (let tries = 0; tries <= limit; tries += 1) {
    const name = branchNameFor(platform, candidate);
    if (!existing.has(name)) return name;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new ReleaseNameError(
    `Every release branch name for the next ${limit} minutes is taken. Prune the old ones first.`,
  );
}

/**
 * What a run did, as the tag message records it.
 *
 * @typedef {object} ReleaseDetails
 * @property {string} branch
 * @property {'ios' | 'android'} platform
 * @property {'success' | 'failed' | 'unfinished'} outcome
 * @property {string} commit the full SHA the build was cut from
 * @property {string} [profile] the EAS build profile
 * @property {string} [startedAt]
 * @property {string} [duration]
 * @property {number} [exitCode]
 * @property {boolean} [submitted] whether it was handed to the store
 * @property {string} [easBuildId]
 * @property {string} [easBuildUrl]
 * @property {string} [notes]
 */

/**
 * The annotated tag's message.
 *
 * Plain `key: value` lines, one per fact, because the two ways anyone will
 * ever read this are `git tag -n99 -l 'release/*'` and `git show <tag>`, and
 * both of those are grep. Blank values are dropped rather than printed empty,
 * so a run that could not discover its EAS build id says nothing about it
 * instead of claiming it was blank.
 *
 * @param {ReleaseDetails} details
 */
export function buildTagMessage(details) {
  const headline = {
    success: 'Released',
    failed: 'Release failed',
    unfinished: 'Release never finished',
  }[details.outcome];

  /** @type {[string, string | number | boolean | undefined][]} */
  const fields = [
    ['Platform', details.platform],
    ['Profile', details.profile],
    ['Branch', details.branch],
    ['Commit', details.commit],
    ['Started', details.startedAt],
    ['Duration', details.duration],
    ['Exit code', details.exitCode],
    ['Submitted', details.submitted === undefined ? undefined : details.submitted ? 'yes' : 'no'],
    ['EAS build', details.easBuildId],
    ['EAS log', details.easBuildUrl],
    ['Notes', details.notes],
  ];

  const body = fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label}: ${value}`);

  return [`${headline}: ${details.platform} ${details.branch}`, '', ...body].join('\n');
}

/**
 * The branches this prune should remove, split by why.
 *
 * @typedef {object} PrunedPlan
 * @property {string[]} failed branches whose tag says the release failed
 * @property {string[]} unfinished branches with no tag at all
 * @property {string[]} kept every release branch this prune leaves alone
 */

/**
 * Decides which release branches have outlived their usefulness.
 *
 * Three rules, in order. A branch with a `success` tag is kept whatever its
 * age, because that is a commit somebody shipped and may need to branch a fix
 * from. A branch younger than `keepDays` is kept, successful or not, because a
 * recent failure is still being looked into. Everything else goes, sorted into
 * the two reasons so the caller can tell the operator which it did and, for
 * the unfinished ones, write the tag that has to exist before the branch can
 * be deleted without losing the commit.
 *
 * A name this module does not recognise is never returned. Deleting branches
 * is the one thing here that cannot be undone by running it again, so anything
 * unparseable is left strictly alone rather than guessed at.
 *
 * @param {{ branches: Iterable<string>, tags: Iterable<string>, now: Date, keepDays?: number }} input
 * @returns {PrunedPlan}
 */
export function selectPrunable({ branches, tags, now, keepDays = DEFAULT_KEEP_DAYS }) {
  const outcomesByRun = indexOutcomesByRun(tags);

  /** @type {PrunedPlan} */
  const plan = { failed: [], unfinished: [], kept: [] };

  for (const branch of branches) {
    const verdict = classifyBranch(branch, outcomesByRun, now, keepDays);
    if (verdict) plan[verdict].push(branch);
  }

  return plan;
}

/**
 * Every outcome tagged against each run, keyed by platform and stamp.
 *
 * A run can carry more than one: a retry that reused the branch leaves both a
 * failure and a success, and the pruner has to see both to decide on the
 * strength of the success.
 *
 * @param {Iterable<string>} tags
 * @returns {Map<string, Set<string>>}
 */
function indexOutcomesByRun(tags) {
  /** @type {Map<string, Set<string>>} */
  const byRun = new Map();

  for (const tag of tags) {
    const parsed = parseTagName(tag);
    if (!parsed || !parsed.outcome) continue;
    const key = `${parsed.platform}/${parsed.stamp}`;
    const seen = byRun.get(key) ?? new Set();
    seen.add(parsed.outcome);
    byRun.set(key, seen);
  }

  return byRun;
}

/**
 * Which list of the plan a branch belongs in, or `null` for a name this module
 * does not recognise and will therefore not touch.
 *
 * @param {string} branch
 * @param {Map<string, Set<string>>} outcomesByRun
 * @param {Date} now
 * @param {number} keepDays
 * @returns {'kept' | 'failed' | 'unfinished' | null}
 */
function classifyBranch(branch, outcomesByRun, now, keepDays) {
  const parsed = parseBranchName(branch);
  if (!parsed) return null;

  const started = parseStamp(parsed.stamp);
  if (!started) return null;

  const outcomes = outcomesByRun.get(`${parsed.platform}/${parsed.stamp}`) ?? new Set();
  if (outcomes.has('success')) return 'kept';

  const ageDays = (now.getTime() - started.getTime()) / MS_PER_DAY;
  if (ageDays < keepDays) return 'kept';

  return outcomes.size === 0 ? 'unfinished' : 'failed';
}
