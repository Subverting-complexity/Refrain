#!/usr/bin/env node
/**
 * Records every store release attempt as one branch and a tag per platform.
 *
 * `tools/ps/ReleaseBranch.ps1` calls this from `tools/ps/Deploy.ps1`: `start`
 * once before the first build, `finish` once per platform as that platform
 * finishes, `stop` if the release ends before every selected platform reported,
 * and `prune` (which `finish` and `stop` run for you) to clear out branches
 * nobody needs any more. It is a separate Node tool rather than PowerShell so
 * the naming and retention rules can be unit-tested, and so the same commands
 * work if a release is ever driven from somewhere other than a Windows console.
 *
 * `tools/lib/release-branch.mjs` explains the naming scheme and why the
 * outcome lives on a tag instead of in the branch name,
 * `tools/lib/release-branch-prune.mjs` holds the rule that decides whether a
 * candidate branch may actually be deleted, and `tools/lib/release-listing.mjs`
 * holds the rule that decides whether a store listing needs pushing. This file
 * is the side effects: git, the filesystem, and the console.
 *
 * ## The run record
 *
 * One release, one branch, one open run. The run record names the **set** of
 * platforms the release covers, and survives each platform reporting until
 * either all of them have or the release stops. Keying it on platform and
 * deleting it at the first outcome, as an earlier version did, would leave the
 * second platform with no open run to tag; assuming the set is always both
 * platforms would leave a single-platform release with state that never clears.
 *
 * "The release ends" is not the same as "every platform reported". A release
 * stopped after a failure leaves a platform that was never attempted and will
 * never report, so `stop` exists to close the run without pretending that
 * platform failed: it did not fail, it was not tried, and it produced no build
 * to link a tag to.
 *
 * ## What it will not do
 *
 * It refuses to cut a release branch when tracked files have been modified. A
 * branch is a pointer to a commit, so a branch cut from a dirty tree claims a
 * commit was built that never was, and the record is then worse than no record
 * because it looks trustworthy. `--allow-dirty` exists for the rare deliberate
 * case and says so in the tag message.
 *
 * A failed push is a warning, never a failure. The deploy is the point of the
 * exercise and the bookkeeping is not allowed to stop it; the branch stays
 * local, `finish` retries the push, and the console says what to run by hand.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { capture, quietShellDeprecation } from './lib/exec.mjs';
import { configureColour, detail, fail, formatTimestamp, ok, say, warn } from './lib/format.mjs';
import {
  findRepoRoot,
  git,
  GitError,
  gitLine,
  modifiedTrackedFiles,
  refNames,
} from './lib/git.mjs';
import { parseArgs, UsageError, usage } from './lib/release-branch-options.mjs';
import { retireBranch, summarisePrune } from './lib/release-branch-prune.mjs';
import {
  assertLane,
  assertPlatform,
  availableBranchName,
  buildTagMessage,
  DEFAULT_KEEP_DAYS,
  parseTagMessage,
  parseTagName,
  REF_PREFIX,
  ReleaseNameError,
  selectPrunable,
  tagNameFor,
} from './lib/release-branch.mjs';
import {
  assertListingSelector,
  checkListingPrerequisites,
  decideListingPush,
  listingIsLive,
  LISTING_PATHS,
  ListingError,
} from './lib/release-listing.mjs';

/**
 * What `start` recorded about a release in flight.
 *
 * @typedef {object} RunState
 * @property {string} branch
 * @property {string} commit
 * @property {string} startedAt
 * @property {string} remote
 * @property {boolean} pushed
 * @property {('ios' | 'android')[]} platforms every platform this release covers
 * @property {string[]} reported the ones that have recorded an outcome so far
 * @property {'store' | 'fast'} lane
 * @property {string} [profile]
 * @property {boolean} [dirty]
 */

/** Where `start` leaves the branch it cut for `finish` and `stop` to find. */
const STATE_FILE = join('tools', 'release-state.json');

const DEFAULT_REMOTE = 'origin';

/**
 * The exit code `listing-check` uses to mean "nothing to push".
 *
 * A distinct code rather than a line of output, so the caller can act on it
 * without capturing stdout — which, in PowerShell, is the difference between
 * reading an exit code and reading an array of every line this printed. Any
 * other non-zero code is a real error, and the caller pushes anyway: pushing a
 * listing that had not changed is harmless, and skipping one that had is not.
 */
const LISTING_SKIP_CODE = 20;

/**
 * Release branch names, from local refs and from one remote's tracking refs.
 *
 * Both, because a branch pushed from another machine has to count as taken
 * when a name is being chosen, and has to be considered for pruning even
 * where no local copy was ever made.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @returns {{ local: Set<string>, remote: Set<string>, all: Set<string> }}
 */
function listReleaseBranches(repoRoot, remote) {
  const local = new Set(
    refNames(repoRoot, `refs/heads/${REF_PREFIX}/`).map((ref) => ref.slice('refs/heads/'.length)),
  );
  const tracked = new Set(
    refNames(repoRoot, `refs/remotes/${remote}/${REF_PREFIX}/`).map((ref) =>
      ref.slice(`refs/remotes/${remote}/`.length),
    ),
  );

  return { local, remote: tracked, all: new Set([...local, ...tracked]) };
}

/** @param {string} repoRoot */
function listReleaseTags(repoRoot) {
  return new Set(
    refNames(repoRoot, `refs/tags/${REF_PREFIX}/`).map((ref) => ref.slice('refs/tags/'.length)),
  );
}

/**
 * The commit a ref points at, or `null` if there is no such ref.
 *
 * @param {string} repoRoot
 * @param {string} ref
 */
function resolveCommit(repoRoot, ref) {
  const result = git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    allowFailure: true,
  });
  const sha = result.output.trim();
  return result.code === 0 && sha.length > 0 ? sha : null;
}

/** @param {string} repoRoot @param {string} tag */
function tagExists(repoRoot, tag) {
  return resolveCommit(repoRoot, `refs/tags/${tag}`) !== null;
}

/**
 * The commit a branch points at, wherever it exists.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @param {string} branch
 */
function branchCommit(repoRoot, remote, branch) {
  return (
    resolveCommit(repoRoot, `refs/heads/${branch}`) ??
    resolveCommit(repoRoot, `refs/remotes/${remote}/${branch}`)
  );
}

/**
 * @param {string} repoRoot
 * @returns {RunState | null}
 */
function readState(repoRoot) {
  const path = join(repoRoot, STATE_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // A file written by the per-platform tooling this replaced was keyed by
      // platform and has no `branch` of its own. There is no honest way to
      // convert one into a release-wide record, so it is reported and ignored
      // rather than half-read.
      if (typeof parsed.branch !== 'string') {
        warn('The release state file is from the older per-platform scheme. Ignoring it.');
        detail(`Delete ${STATE_FILE} once you have checked what it holds.`);
        return null;
      }
      return /** @type {RunState} */ (parsed);
    }
  } catch {
    warn('The release state file was unreadable. Treating this as a fresh start.');
  }
  return null;
}

/**
 * @param {string} repoRoot
 * @param {RunState | null} state `null` clears the record
 */
function writeState(repoRoot, state) {
  const path = join(repoRoot, STATE_FILE);
  if (state === null) {
    if (existsSync(path)) rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Writes an annotated tag, with the message passed through a file.
 *
 * Through a file rather than through `-m` because the message is several
 * lines and this runs on Windows, where a child process is spawned through
 * `cmd` and a multi-line argument is not something quoting reliably survives.
 * A temp file has no such problem and is removed either way.
 *
 * @param {string} repoRoot
 * @param {string} tag
 * @param {string} commit
 * @param {string} message
 */
function writeAnnotatedTag(repoRoot, tag, commit, message) {
  const dir = mkdtempSync(join(tmpdir(), 'refrain-release-'));
  const messagePath = join(dir, 'tag-message.txt');
  try {
    writeFileSync(messagePath, message, 'utf8');
    git(repoRoot, ['tag', '-a', tag, commit, '-F', messagePath]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Pushes one ref, reporting a refusal rather than raising it.
 *
 * The explicit `src:dst` refspec keeps this independent of whatever
 * `push.default` and `push.autoSetupRemote` are set to on the machine.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @param {string} ref full ref name, e.g. `refs/heads/release/2026-08-13-1432`
 * @param {{ dryRun?: boolean }} [options]
 */
function pushRef(repoRoot, remote, ref, options = {}) {
  if (options.dryRun) {
    detail(`would push ${ref} to ${remote}`);
    return true;
  }
  const result = git(repoRoot, ['push', remote, `${ref}:${ref}`], { allowFailure: true });
  if (result.code === 0) return true;

  warn(`Could not push ${ref} to ${remote}. The local ref is there and is unchanged.`);
  detail(`git push ${remote} ${ref}:${ref}`);
  const reason = result.output.trim().split(/\r?\n/).slice(-3).join('\n');
  if (reason) detail(reason);
  return false;
}

/**
 * A release branch that already names the commit about to be built, or `null`.
 *
 * This is what makes a retry after a partial failure reuse the branch rather
 * than cut a second one at the same commit, which is the duplication this
 * scheme exists to remove. Two shapes count, and they are the only two the
 * tooling creates:
 *
 * - the branch points at `HEAD` — a fast-lane release, or a store-lane one
 *   whose bump has not been merged into a distinct commit;
 * - `HEAD` is the merge commit that landed the bump, and the branch points at
 *   the bump commit it merged. The version bump commits on the release branch
 *   and lands it by pull request, so this is the ordinary store-lane shape.
 *
 * Nothing looser. Matching on tree contents or ancestry would let a revert, or
 * an unrelated release from months ago, be adopted as this release's record.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @param {Iterable<string>} branches
 * @param {string} head
 * @returns {string | null}
 */
function reusableBranch(repoRoot, remote, branches, head) {
  const parents = gitLine(repoRoot, ['rev-list', '--parents', '-n', '1', 'HEAD'])
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(1);
  const merged = parents.length > 1 ? parents[1] : null;

  // Newest first, so a repository that somehow holds two candidates adopts the
  // one this release most likely just created.
  const candidates = [...branches].sort().reverse();
  for (const branch of candidates) {
    const commit = branchCommit(repoRoot, remote, branch);
    if (!commit) continue;
    if (commit === head || (merged && commit === merged)) return branch;
  }
  return null;
}

/**
 * Cuts the branch for a release about to start, and pushes it straight away.
 *
 * Straight away, so that a release which never comes back still left a record.
 * A branch pushed now and tagged later needs no rename, which is the whole
 * reason the outcome is not in the branch name.
 *
 * The branch is created without checking it out. The build has to run from the
 * working tree as it stands, and switching branches under it would at best be
 * a surprise and at worst lose somebody's place.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function start(options) {
  const repoRoot = findRepoRoot('there is nothing to cut a branch from.');
  const platforms = options.platforms ?? [];
  const lane = assertLane(options.lane ?? 'store');
  const remote = options.remote ?? DEFAULT_REMOTE;

  const open = readState(repoRoot);
  if (open) {
    warn(`A release is already open on ${open.branch}. Closing it before starting this one.`);
    detail(`Platforms that never reported: ${unreported(open).join(', ') || 'none'}`);
  }

  const modified = modifiedTrackedFiles(repoRoot);
  if (modified.length > 0) {
    if (!options.allowDirty) {
      fail('Tracked files have been modified, so a release branch would name a commit');
      fail('that is not what gets built. Commit or stash these first:');
      say();
      modified.split(/\r?\n/).forEach((line) => detail(line));
      say();
      detail('Pass --allow-dirty to record the attempt anyway.');
      return 1;
    }
    warn('Building from a dirty tree. The tags will say so.');
  }

  const untracked = gitLine(repoRoot, ['ls-files', '--others', '--exclude-standard']);
  if (untracked.length > 0) {
    warn('Untracked files are present. EAS builds committed state, so these will not ship.');
  }

  const commit = gitLine(repoRoot, ['rev-parse', 'HEAD']);
  const branches = listReleaseBranches(repoRoot, remote);
  const existing = reusableBranch(repoRoot, remote, branches.all, commit);

  let branch;
  if (existing) {
    branch = existing;
    ok(`Reusing ${branch}, which already names ${commit.slice(0, 8)}`);
  } else {
    branch = availableBranchName(new Date(), branches.all);
    git(repoRoot, ['branch', branch, commit]);
    ok(`Cut ${branch} at ${commit.slice(0, 8)}`);
  }

  // Pushed even when reused: the version bump's own merge deletes the branch
  // from the remote where "automatically delete head branches" is on, and a
  // push of a ref the remote already has costs one round trip and succeeds.
  const pushed = pushRef(repoRoot, remote, `refs/heads/${branch}`);
  if (pushed) ok(`Pushed to ${remote}`);

  writeState(repoRoot, {
    branch,
    commit: branchCommit(repoRoot, remote, branch) ?? commit,
    startedAt: formatTimestamp(new Date()),
    remote,
    pushed,
    platforms,
    reported: [],
    lane,
    profile: options.profile,
    dirty: modified.length > 0,
  });

  ok(`Release open on ${branch}: ${lane} lane, ${platforms.join(' then ') || 'no platforms'}`);
  return 0;
}

/**
 * The platforms a release covers that have not reported an outcome.
 *
 * @param {RunState} state
 */
function unreported(state) {
  const reported = new Set(state.reported ?? []);
  return (state.platforms ?? []).filter((platform) => !reported.has(platform));
}

/**
 * Tags one platform's outcome on the release branch.
 *
 * Missing state is a warning rather than an error. It means the deploy started
 * before this tooling existed, or `start` refused and the caller carried on;
 * neither is a reason to report a successful release as a failure.
 *
 * The run record is kept until every selected platform has reported, so a
 * release that dies during the second build has already recorded the first
 * platform's result and can still record the second.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function finish(options) {
  const repoRoot = findRepoRoot('there is no release branch to tag.');
  const platform = assertPlatform(options.platform ?? '');
  // The parser has already refused anything but these two, so this narrows a
  // string to the outcome type rather than deciding anything. Failure is the
  // safer of the two to land on if that ever stops being true.
  const outcome = options.outcome === 'success' ? 'success' : 'failed';

  const state = readState(repoRoot);
  if (!state) {
    warn(`No release is open, so there is nothing to tag ${platform} on.`);
    return 0;
  }

  const remote = options.remote ?? state.remote ?? DEFAULT_REMOTE;
  const tag = tagNameFor(state.branch, platform, outcome);

  if (!(state.platforms ?? []).includes(platform)) {
    warn(`${platform} is not one of this release's platforms (${state.platforms.join(', ')}).`);
    detail('Tagging it anyway; the record is more useful than the tidy set.');
  }

  if (tagExists(repoRoot, tag)) {
    // Expected rather than alarming: this release reused a branch that already
    // carries this platform's outcome, which is what happens when the same
    // commit is built twice with the same result. A tag is written once, when
    // the answer is already known, so the first one stands.
    warn(`${tag} already exists. Leaving it as it is.`);
  } else {
    const notes = [state.dirty ? 'Built from a dirty working tree.' : '', options.notes ?? '']
      .filter((part) => part.length > 0)
      .join(' ');

    writeAnnotatedTag(
      repoRoot,
      tag,
      state.commit,
      buildTagMessage({
        branch: state.branch,
        platform,
        outcome,
        commit: state.commit,
        lane: state.lane,
        profile: state.profile,
        submitProfile: options.submitProfile,
        startedAt: state.startedAt,
        duration: options.duration,
        exitCode: options.exitCode,
        submitted: options.submitted,
        listing: options.listing,
        easBuildId: options.easBuildId,
        easBuildUrl: options.easBuildUrl,
        notes: notes.length > 0 ? notes : undefined,
      }),
    );
    ok(`Tagged ${tag}`);
  }

  // A branch whose push failed at the start gets one more try now, so an
  // outage that lasted a build does not cost the record.
  if (!state.pushed) state.pushed = pushRef(repoRoot, remote, `refs/heads/${state.branch}`);
  pushRef(repoRoot, remote, `refs/tags/${tag}`);

  const reported = new Set([...(state.reported ?? []), platform]);
  const next = { ...state, remote, reported: [...reported] };
  const outstanding = unreported(next);

  if (outstanding.length > 0) {
    writeState(repoRoot, next);
    detail(`Release still open on ${state.branch}, waiting on ${outstanding.join(', ')}.`);
    return 0;
  }

  writeState(repoRoot, null);
  ok(`Release closed on ${state.branch}. Every selected platform reported.`);
  if (!options.noPrune) prune({ ...options, command: 'prune', remote });
  return 0;
}

/**
 * Closes a release that ended before every selected platform reported.
 *
 * A platform that was never attempted is deliberately not tagged. It did not
 * fail, so recording it as failed would be untrue, and it produced no build to
 * link to. A stopped release is legible from what is there: a failure tag on
 * one platform, no tag on the other.
 *
 * Called unconditionally at the end of a deploy, so the case where every
 * platform already reported is a no-op rather than an error.
 *
 * It is a no-op down to the prune as well. `finish` already prunes when the
 * last selected platform reports, and this runs a moment later on every
 * release, so pruning here regardless would scan every ref and print a second
 * summary for work that has just been done. There is a release to close, or
 * there is nothing to do; `prune` is its own command for the other case.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function stop(options) {
  const repoRoot = findRepoRoot('there is no release to close.');
  const state = readState(repoRoot);
  const remote = options.remote ?? state?.remote ?? DEFAULT_REMOTE;

  if (!state) {
    detail('No release is open, so there is nothing to close.');
    return 0;
  }

  const outstanding = unreported(state);
  if (outstanding.length === 0) {
    ok(`Closed ${state.branch}.`);
  } else {
    warn(`${state.branch} ended early. Never attempted: ${outstanding.join(', ')}.`);
    detail('Those platforms are left untagged: they did not fail, they were not tried.');
    detail(`Retry with: Deploy.cmd -Platform ${outstanding.join(',')}`);
  }
  writeState(repoRoot, null);

  if (!options.noPrune) return prune({ ...options, command: 'prune', remote });
  return 0;
}

/**
 * The git, filesystem and console work a prune needs, bound to one repository
 * and one remote.
 *
 * Handing these to {@link retireBranch} as functions rather than letting it
 * call git itself is what makes the deletion rule testable: a test can supply
 * a push that refuses or a ref that resolves to nothing and watch what the
 * rule decides, without a repository to set up or a remote to reach.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @param {{ local: Set<string>, remote: Set<string> }} branches
 * @returns {import('./lib/release-branch-prune.mjs').PruneOperations}
 */
function pruneOperations(repoRoot, remote, branches) {
  return {
    resolveCommit: (ref) => resolveCommit(repoRoot, ref),
    tagExists: (tag) => tagExists(repoRoot, tag),
    pushRef: (ref, options) => pushRef(repoRoot, remote, ref, options),
    writeAnnotatedTag: (tag, commit, message) => writeAnnotatedTag(repoRoot, tag, commit, message),
    deleteBranch: (branch) => deleteBranch(repoRoot, remote, branches, branch),
    warn,
    detail,
    ok,
  };
}

/**
 * Every outcome tag each release branch carries, keyed by branch name.
 *
 * A release can have several — one per platform, plus a retry's second tag on
 * the same platform — and all of them have to be on the remote before the
 * branch is deleted.
 *
 * @param {Iterable<string>} tags
 * @returns {Map<string, string[]>}
 */
function indexTagsByBranch(tags) {
  /** @type {Map<string, string[]>} */
  const byBranch = new Map();
  for (const tag of tags) {
    const parsed = parseTagName(tag);
    if (!parsed?.platform) continue;
    const branch = `${REF_PREFIX}/${parsed.stamp}`;
    byBranch.set(branch, [...(byBranch.get(branch) ?? []), tag]);
  }
  return byBranch;
}

/**
 * Removes failed and unfinished release branches past the keep window.
 *
 * An unfinished branch is tagged before it is deleted. That ordering is the
 * point rather than a nicety: a failed release's commit is already pinned by
 * its platform tags, but an unfinished one has no tag at all, and if the
 * release was cut from a branch that has since been deleted then this ref is
 * the only thing holding the commit. Tag first and the deletion cannot lose
 * anything.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function prune(options) {
  const repoRoot = findRepoRoot('there are no release branches to prune.');
  const remote = options.remote ?? DEFAULT_REMOTE;
  const keepDays = options.keepDays ?? DEFAULT_KEEP_DAYS;

  const branches = listReleaseBranches(repoRoot, remote);
  const tags = listReleaseTags(repoRoot);
  const plan = selectPrunable({ branches: branches.all, tags, now: new Date(), keepDays });

  const doomed = [...plan.failed, ...plan.unfinished];
  if (doomed.length === 0) {
    if (plan.kept.length > 0) {
      detail(`${plan.kept.length} release branch(es) kept, none past ${keepDays} days.`);
    }
    return 0;
  }

  /** @type {import('./lib/release-branch-prune.mjs').PruneContext} */
  const context = {
    remote,
    dryRun: options.dryRun,
    current: gitLine(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    unfinished: new Set(plan.unfinished),
    tagsByBranch: indexTagsByBranch(tags),
    operations: pruneOperations(repoRoot, remote, branches),
  };

  // Summarised from what actually happened to each branch, not from what was
  // listed. `retireBranch` keeps a branch whose tag could not be pushed, and a
  // summary naming the doomed list would report those as pruned.
  const outcomes = doomed.map((branch) => retireBranch(context, branch));

  say();
  detail(summarisePrune(outcomes, keepDays));
  return 0;
}

/**
 * Deletes a branch wherever it exists, locally and on the remote.
 *
 * A remote deletion that fails is a warning: the local one has already
 * happened, and the next prune will try the remote again.
 *
 * @param {string} repoRoot
 * @param {string} remote
 * @param {{ local: Set<string>, remote: Set<string> }} branches
 * @param {string} branch
 */
function deleteBranch(repoRoot, remote, branches, branch) {
  if (branches.local.has(branch)) {
    git(repoRoot, ['branch', '-D', branch]);
  }
  if (branches.remote.has(branch)) {
    const deleted = git(repoRoot, ['push', remote, '--delete', branch], {
      allowFailure: true,
    });
    if (deleted.code !== 0) warn(`Could not delete ${branch} from ${remote}.`);
  }
  ok(`Removed ${branch}`);
}

/**
 * The commit of the last store-lane release that left the store listing showing
 * its own content, for one platform.
 *
 * Read from the outcome tags rather than from a file, because the tags are the
 * only record that survives a pruned branch and a fresh clone. Neither the lane
 * nor the listing result is in the tag *name*, so each candidate's message is
 * read until one qualifies — newest first, so that is usually one extra git
 * call.
 *
 * A successful *binary* is not enough. The listing push can fail after the
 * binary has already shipped, which deliberately leaves the outcome a success,
 * and `-Listing off` skips it outright. Diffing against either would find no
 * listing change since and skip the push, and the store page would stay on the
 * old copy release after release. See {@link listingIsLive}.
 *
 * @param {string} repoRoot
 * @param {'ios' | 'android'} platform
 * @returns {{ tag: string, commit: string } | null}
 */
function lastStoreRelease(repoRoot, platform) {
  const candidates = [...listReleaseTags(repoRoot)]
    .map((tag) => ({ tag, parsed: parseTagName(tag) }))
    .filter(({ parsed }) => parsed?.platform === platform && parsed?.outcome === 'success')
    .sort((left, right) => (left.parsed?.stamp ?? '').localeCompare(right.parsed?.stamp ?? ''))
    .reverse();

  for (const { tag } of candidates) {
    const message = git(repoRoot, ['for-each-ref', '--format=%(contents)', `refs/tags/${tag}`], {
      allowFailure: true,
    });
    if (message.code !== 0) continue;
    const fields = parseTagMessage(message.output);
    // A tag written before lanes existed has no Lane line. Treating it as a
    // store release is the safe reading: those releases all went to the store.
    if ((fields.lane ?? 'store') !== 'store') continue;
    if (!listingIsLive(fields.listing)) continue;
    const commit = resolveCommit(repoRoot, `refs/tags/${tag}`);
    if (commit) return { tag, commit };
  }

  return null;
}

/**
 * Decides whether one platform's store listing needs pushing, and says so
 * through its exit code.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function listingCheck(options) {
  const repoRoot = findRepoRoot('there is no listing to check.');
  const platform = assertPlatform(options.platform ?? '');
  const lane = assertLane(options.lane ?? 'store');
  const selector = assertListingSelector(options.listing ?? 'auto');

  const previous =
    lane === 'store' && selector === 'auto' ? lastStoreRelease(repoRoot, platform) : null;
  const changedPaths = previous
    ? git(repoRoot, [
        'diff',
        '--name-only',
        previous.commit,
        'HEAD',
        '--',
        ...LISTING_PATHS[platform],
      ])
        .output.split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];

  const decision = decideListingPush({
    platform,
    selector,
    lane,
    previousCommit: previous?.commit ?? null,
    changedPaths,
  });

  if (previous) detail(`Comparing against ${previous.tag}`);
  changedPaths.forEach((path) => detail(path));

  if (decision.push) {
    ok(`${platform} listing ${decision.reason}`);
    return 0;
  }
  detail(`${platform} listing ${decision.reason}`);
  return LISTING_SKIP_CODE;
}

/**
 * Checks the listing toolchain and credentials before the first build.
 *
 * Before, not at the point of use: a missing App Store Connect key should fail
 * the run in seconds rather than after a build has been paid for and shipped.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function listingPreflight(options) {
  const repoRoot = findRepoRoot('there is no listing configuration to check.');
  const lane = assertLane(options.lane ?? 'store');
  const selector = assertListingSelector(options.listing ?? 'auto');

  if (lane !== 'store' || selector === 'off') {
    detail(`No listing push this run (${lane} lane, --listing ${selector}). Nothing to check.`);
    return 0;
  }

  const bundler = capture('bundle', ['--version'], { quiet: true, timeoutMs: 30_000 });
  const { ok: passed, problems } = checkListingPrerequisites({
    platforms: options.platforms ?? [],
    env: process.env,
    hasBundler: bundler.code === 0,
    hasDefaultPlayKey: existsSync(join(repoRoot, 'pc-api-key.json')),
    // Resolved against the repository root rather than the current directory,
    // because that is where fastlane runs from and therefore how it will read a
    // relative path out of `.env`. `resolve` rather than `join`, so an absolute
    // path is left as the absolute path it already is.
    fileExists: (path) => existsSync(resolve(repoRoot, path)),
  });

  if (passed) {
    ok('The listing toolchain and credentials are in place.');
    return 0;
  }

  fail('The store listing cannot be pushed with the current setup:');
  problems.forEach((problem) => detail(problem));
  say();
  detail(
    options.listingOnly
      ? 'See fastlane/PUBLISHING.md. Nothing else in this run depends on it, so nothing was done.'
      : 'See fastlane/PUBLISHING.md, or re-run with -Listing off to ship the binary only.',
  );
  return 1;
}

/** @param {string[]} argv */
function main(argv) {
  configureColour({});
  quietShellDeprecation();

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    fail(error.message);
    say();
    say(usage());
    return 2;
  }

  if (options.command === 'help') {
    say(usage());
    return 0;
  }

  try {
    if (options.command === 'start') return start(options);
    if (options.command === 'finish') return finish(options);
    if (options.command === 'stop') return stop(options);
    if (options.command === 'listing-check') return listingCheck(options);
    if (options.command === 'listing-preflight') return listingPreflight(options);
    return prune(options);
  } catch (error) {
    if (
      error instanceof GitError ||
      error instanceof ReleaseNameError ||
      error instanceof ListingError
    ) {
      fail(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
