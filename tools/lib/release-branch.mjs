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
 * A release cuts one branch at the commit it is about to build, named for the
 * moment it started:
 *
 *     release/2026-08-13-1432
 *
 * One branch, not one per platform. Both platforms build from a single commit
 * carrying a single version, so a per-platform branch segment would only ever
 * produce two names for the same commit.
 *
 * The branch carries no outcome, because the outcome is not known when the
 * branch is created and a name that has to change later is a name that has to
 * be deleted and re-pushed on the remote. Instead each platform finishes by
 * writing an annotated tag at the same commit, and the tag carries both the
 * platform and the outcome:
 *
 *     release/2026-08-13-1432-ios-success
 *     release/2026-08-13-1432-android-failed
 *
 * Per-platform tags rather than one tag per release, because the outcomes are
 * genuinely independent: one commit can ship on one store and fail on the
 * other, and a retry can later add a success beside an earlier failure.
 *
 * A tag is written once, when the answer is already known, so nothing is ever
 * renamed. That leaves one state a name cannot express and which is worth
 * having: a release branch with no tag at all is a run that never reached its
 * own ending. The machine slept, the window was closed, the power went.
 *
 *     release/2026-08-13-1432-unfinished
 *
 * That one carries no platform, because no platform reported. It is applied by
 * the pruner rather than by the run, because by definition the run was not
 * there to apply it.
 *
 * ## Why the tag outlives the branch
 *
 * A release attempted most working days would otherwise leave a branch list
 * nobody reads. So failed and unfinished branches are pruned after a month
 * while their tags are kept for good. Nothing is lost by that: a tag pins the
 * same commit the branch pointed at, and holds the lane, the profile, the
 * duration, the exit code, the listing result and the EAS build link besides.
 * Successful branches are never pruned, because those are the ones you may
 * still need to cut a hotfix from.
 */

/** The platforms that ship to a store. Anything else is a development build. */
export const PLATFORMS = /** @type {const} */ (['ios', 'android']);

/**
 * Where a release is headed.
 *
 * Named for the outcome the operator wants rather than for either store's own
 * vocabulary, because the two platforms do not implement these the same way:
 * `fast` is the Play `internal` track on Android and a plain TestFlight upload
 * on iOS, which has no track parameter at all. See `docs/RELEASING.md`.
 */
export const LANES = /** @type {const} */ (['store', 'fast']);

/** The first path segment of every release branch and tag. */
export const REF_PREFIX = 'release';

/**
 * The outcomes a tag can record.
 *
 * `unfinished` is not something a run reports about itself — see the module
 * comment. It exists so that every attempt ends up with at least one tag,
 * which is what makes deleting the branch lossless.
 */
export const OUTCOMES = /** @type {const} */ (['success', 'failed', 'unfinished']);

/** How long a failed or unfinished branch is kept before pruning. */
export const DEFAULT_KEEP_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const STAMP = '\\d{4}-\\d{2}-\\d{2}-\\d{4}';
const STAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/;
const BRANCH_PATTERN = new RegExp(`^${REF_PREFIX}/(${STAMP})$`);
const TAG_PATTERN = new RegExp(
  `^${REF_PREFIX}/(${STAMP})-(${PLATFORMS.join('|')})-(success|failed)$`,
);
const UNFINISHED_TAG_PATTERN = new RegExp(`^${REF_PREFIX}/(${STAMP})-unfinished$`);

/**
 * A release branch or tag, taken apart.
 *
 * @typedef {object} ReleaseRef
 * @property {string} stamp the `YYYY-MM-DD-HHmm` the run started
 * @property {'ios' | 'android'} [platform] outcome tags only; an `unfinished`
 *   tag names no platform, because no platform reported
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
 * Asserts a lane is one a release can be sent down.
 *
 * @param {string} lane
 * @returns {'store' | 'fast'}
 */
export function assertLane(lane) {
  const found = LANES.find((known) => known === lane);
  if (!found) {
    throw new ReleaseNameError(`Unknown lane '${lane}'. Expected ${LANES.join(' or ')}.`);
  }
  return found;
}

/**
 * Reads a platform selection, in the order platforms are built.
 *
 * `both` is spelled out rather than left as a bare word the caller has to
 * expand, and iOS comes first: its credential path (certificates, profiles,
 * and an Apple sign-in separate from the EAS login) is the more fragile of
 * the two, so failing there first is the cheaper failure. A sensible default
 * rather than a rule — change the order of {@link PLATFORMS} to change it.
 *
 * @param {string} selection `both`, `ios`, `android`, or a comma-separated list
 * @returns {('ios' | 'android')[]}
 */
export function parsePlatformSelection(selection) {
  const trimmed = selection.trim().toLowerCase();
  if (trimmed === 'both' || trimmed === 'all') return [...PLATFORMS];

  const named = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (named.length === 0) {
    throw new ReleaseNameError(`No platform named. Expected both, ${PLATFORMS.join(' or ')}.`);
  }

  const seen = new Set(named.map((part) => assertPlatform(part)));
  // Ordered by PLATFORMS rather than by the order they were typed, so
  // `--platforms android,ios` still builds iOS first.
  return PLATFORMS.filter((platform) => seen.has(platform));
}

/**
 * The branch name for a release starting now.
 *
 * @param {Date} date
 */
export function branchNameFor(date) {
  return `${REF_PREFIX}/${formatStamp(date)}`;
}

/**
 * The tag that records how one platform's half of a release ended.
 *
 * Built from the branch name rather than from the clock, so the tag always
 * lands on the stamp the branch already carries even if the run took long
 * enough to cross into the next minute — which, at ten to twenty minutes a
 * build, it invariably does.
 *
 * @param {string} branch
 * @param {string} platform
 * @param {string} outcome `success` or `failed`
 */
export function tagNameFor(branch, platform, outcome) {
  assertReleaseBranch(branch);
  if (outcome !== 'success' && outcome !== 'failed') {
    throw new ReleaseNameError(`Unknown outcome '${outcome}'. Expected success or failed.`);
  }
  return `${branch}-${assertPlatform(platform)}-${outcome}`;
}

/**
 * The tag that stands in for a release which never reported anything.
 *
 * No platform segment: nothing reported, so naming a platform would be a claim
 * the record cannot support. See {@link selectPrunable}.
 *
 * @param {string} branch
 */
export function unfinishedTagNameFor(branch) {
  assertReleaseBranch(branch);
  return `${branch}-unfinished`;
}

/** @param {string} branch */
function assertReleaseBranch(branch) {
  if (!parseBranchName(branch)) {
    throw new ReleaseNameError(`'${branch}' is not a release branch name.`);
  }
}

/**
 * Takes a branch name apart, or returns `null` for anything that is not one.
 *
 * The anchored pattern is what keeps tags out: `release/2026-08-13-1432`
 * matches and `release/2026-08-13-1432-ios-success` does not, so a tag can
 * never be mistaken for a branch to delete.
 *
 * @param {string} name
 * @returns {ReleaseRef | null}
 */
export function parseBranchName(name) {
  const match = BRANCH_PATTERN.exec(name);
  if (!match) return null;
  const stamp = match[1] ?? '';
  if (!parseStamp(stamp)) return null;
  return { stamp };
}

/**
 * Takes a tag name apart, or returns `null` for anything that is not one.
 *
 * @param {string} name
 * @returns {ReleaseRef | null}
 */
export function parseTagName(name) {
  const outcomeMatch = TAG_PATTERN.exec(name);
  if (outcomeMatch) {
    const stamp = outcomeMatch[1] ?? '';
    if (!parseStamp(stamp)) return null;
    return {
      stamp,
      platform: /** @type {'ios' | 'android'} */ (outcomeMatch[2]),
      outcome: /** @type {'success' | 'failed'} */ (outcomeMatch[3]),
    };
  }

  const unfinishedMatch = UNFINISHED_TAG_PATTERN.exec(name);
  if (!unfinishedMatch) return null;
  const stamp = unfinishedMatch[1] ?? '';
  if (!parseStamp(stamp)) return null;
  return { stamp, outcome: 'unfinished' };
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
 * @param {Date} date
 * @param {Iterable<string>} taken existing branch names
 * @param {number} [limit] minutes to try before giving up
 */
export function availableBranchName(date, taken, limit = 60) {
  const existing = new Set(taken);
  const candidate = new Date(date.getTime());

  for (let tries = 0; tries <= limit; tries += 1) {
    const name = branchNameFor(candidate);
    if (!existing.has(name)) return name;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new ReleaseNameError(
    `Every release branch name for the next ${limit} minutes is taken. Prune the old ones first.`,
  );
}

/**
 * What one platform's half of a release did, as the tag message records it.
 *
 * @typedef {object} ReleaseDetails
 * @property {string} branch
 * @property {'ios' | 'android'} [platform] absent on an `unfinished` tag
 * @property {'success' | 'failed' | 'unfinished'} outcome
 * @property {string} commit the full SHA the build was cut from
 * @property {'store' | 'fast'} [lane]
 * @property {string} [profile] the EAS build profile
 * @property {string} [submitProfile] the EAS submit profile the lane selected
 * @property {string} [startedAt]
 * @property {string} [duration]
 * @property {number} [exitCode]
 * @property {boolean} [submitted] whether it was handed to the store
 * @property {string} [listing] what happened to the store listing
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
 * `Listing` is a field of its own rather than folded into the outcome. A
 * listing push that failed after the binary had already gone to the store does
 * not make the release a failure — the build shipped — so the outcome stays
 * `success` and this line is where the other half of the story lives.
 *
 * @param {ReleaseDetails} details
 */
export function buildTagMessage(details) {
  const headline = {
    success: 'Released',
    failed: 'Release failed',
    unfinished: 'Release never finished',
  }[details.outcome];

  const subject = details.platform
    ? `${headline}: ${details.platform} ${details.branch}`
    : `${headline}: ${details.branch}`;

  /** @type {[string, string | number | boolean | undefined][]} */
  const fields = [
    ['Platform', details.platform],
    ['Lane', details.lane],
    ['Profile', details.profile],
    ['Submit profile', details.submitProfile],
    ['Branch', details.branch],
    ['Commit', details.commit],
    ['Started', details.startedAt],
    ['Duration', details.duration],
    ['Exit code', details.exitCode],
    ['Submitted', details.submitted === undefined ? undefined : details.submitted ? 'yes' : 'no'],
    ['Listing', details.listing],
    ['EAS build', details.easBuildId],
    ['EAS log', details.easBuildUrl],
    ['Notes', details.notes],
  ];

  const body = fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label}: ${value}`);

  return [subject, '', ...body].join('\n');
}

/**
 * The `key: value` lines of a tag message, as a lookup.
 *
 * The counterpart to {@link buildTagMessage}, and the reason that format is
 * plain lines: the listing change check has to find the commit of the last
 * successful *store-lane* release, and the lane is only recorded in the
 * message. Keys are lower-cased so `Submit profile` is read as
 * `submit profile` and a caller does not have to match the capitalisation.
 *
 * Lines that are not `key: value` are ignored rather than guessed at, which
 * covers both the subject line and the blank line under it. The first
 * occurrence of a key wins, so a free-text `Notes` value that happens to
 * contain a `Lane:` line cannot overwrite the real one above it.
 *
 * @param {string} message
 * @returns {Record<string, string>}
 */
export function parseTagMessage(message) {
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of message.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = (match[1] ?? '').toLowerCase();
    if (key in fields) continue;
    fields[key] = (match[2] ?? '').trim();
  }
  return fields;
}

/**
 * The branches this prune should remove, split by why.
 *
 * @typedef {object} PrunedPlan
 * @property {string[]} failed branches where some platform did not reach a success
 * @property {string[]} unfinished branches with no outcome tag at all
 * @property {string[]} kept every release branch this prune leaves alone
 */

/**
 * Decides which release branches have outlived their usefulness.
 *
 * Three rules, in order.
 *
 * A branch is kept whatever its age when **every platform that recorded an
 * outcome for that release recorded a success**. Asking whether each platform
 * reached a success, rather than whether it ever failed, is what makes a retry
 * work without special handling: a run tagged `ios-failed` and later
 * `ios-success` is a commit that shipped.
 *
 * A branch younger than `keepDays` is kept, successful or not, because a
 * recent failure is still being looked into.
 *
 * Everything else goes, sorted into the two reasons so the caller can tell the
 * operator which it did and, for the unfinished ones, write the tag that has
 * to exist before the branch can be deleted without losing the commit.
 *
 * One accepted ambiguity: a release stopped after iOS succeeded leaves only an
 * `ios-success` tag, which is indistinguishable from a deliberate iOS-only
 * release, so it is kept. Pruning decides which commits stay convenient to
 * reach rather than which survive, so keeping it is harmless and not worth
 * extra bookkeeping to prevent.
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
 * Every outcome tagged against each release, keyed by stamp and then by
 * platform.
 *
 * A platform can carry more than one outcome: a retry that reused the branch
 * leaves both a failure and a success, and the rule has to see both to decide
 * on the strength of the success.
 *
 * The platform-less `unfinished` tag is deliberately not indexed here. It says
 * only that an earlier prune already stood in for a run that reported nothing,
 * which leaves the release exactly as unreported as it was.
 *
 * @param {Iterable<string>} tags
 * @returns {Map<string, Map<string, Set<string>>>}
 */
function indexOutcomesByRun(tags) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const byRun = new Map();

  for (const tag of tags) {
    const parsed = parseTagName(tag);
    if (!parsed || !parsed.outcome || !parsed.platform) continue;
    const byPlatform = byRun.get(parsed.stamp) ?? new Map();
    const seen = byPlatform.get(parsed.platform) ?? new Set();
    seen.add(parsed.outcome);
    byPlatform.set(parsed.platform, seen);
    byRun.set(parsed.stamp, byPlatform);
  }

  return byRun;
}

/**
 * Which list of the plan a branch belongs in, or `null` for a name this module
 * does not recognise and will therefore not touch.
 *
 * @param {string} branch
 * @param {Map<string, Map<string, Set<string>>>} outcomesByRun
 * @param {Date} now
 * @param {number} keepDays
 * @returns {'kept' | 'failed' | 'unfinished' | null}
 */
function classifyBranch(branch, outcomesByRun, now, keepDays) {
  const parsed = parseBranchName(branch);
  if (!parsed) return null;

  const started = parseStamp(parsed.stamp);
  if (!started) return null;

  const byPlatform = outcomesByRun.get(parsed.stamp) ?? new Map();
  const reported = [...byPlatform.values()];
  if (reported.length > 0 && reported.every((outcomes) => outcomes.has('success'))) {
    return 'kept';
  }

  const ageDays = (now.getTime() - started.getTime()) / MS_PER_DAY;
  if (ageDays < keepDays) return 'kept';

  return reported.length === 0 ? 'unfinished' : 'failed';
}
