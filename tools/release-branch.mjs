#!/usr/bin/env node
/**
 * Records every store release attempt as a branch and an outcome tag.
 *
 * `tools/ps/ReleaseBranch.ps1` calls this at three points in a deploy:
 * `start` before the build, `finish` after it, and `prune` (which `finish`
 * runs for you) to clear out branches nobody needs any more. It is a separate
 * Node tool rather than PowerShell so the naming and retention rules can be
 * unit-tested, and so the same commands work if a release is ever driven from
 * somewhere other than a Windows console.
 *
 * `tools/lib/release-branch.mjs` explains the naming scheme and why the
 * outcome lives on a tag instead of in the branch name, and
 * `tools/lib/release-branch-prune.mjs` holds the rule that decides whether a
 * candidate branch may actually be deleted. This file is the side effects:
 * git, the filesystem, and the console.
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

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { capture } from './lib/exec.mjs';
import { configureColour, detail, fail, formatTimestamp, ok, say, warn } from './lib/format.mjs';
import { parseArgs, UsageError, usage } from './lib/release-branch-options.mjs';
import { retireBranch, summarisePrune } from './lib/release-branch-prune.mjs';
import {
  assertPlatform,
  availableBranchName,
  buildTagMessage,
  DEFAULT_KEEP_DAYS,
  REF_PREFIX,
  ReleaseNameError,
  selectPrunable,
  tagNameFor,
} from './lib/release-branch.mjs';

/** Where `start` leaves the branch it cut for `finish` to find. */
const STATE_FILE = join('tools', 'release-state.json');

const DEFAULT_REMOTE = 'origin';

/** Thrown when git itself refuses. Carries the output so the operator sees it. */
class GitError extends Error {}

/**
 * What `start` recorded about a run in flight.
 *
 * @typedef {object} RunState
 * @property {string} branch
 * @property {string} commit
 * @property {string} startedAt
 * @property {string} remote
 * @property {boolean} pushed
 * @property {string} [profile]
 * @property {boolean} [dirty]
 */

/**
 * Runs git and returns what it said.
 *
 * Quiet by default: a single `finish` asks git for a SHA, three ref lists and
 * a tag, and echoing all of that would bury the two lines the operator needs.
 *
 * @param {string} repoRoot
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [options]
 */
function git(repoRoot, args, options = {}) {
  const result = capture('git', args, { cwd: repoRoot, quiet: true, shell: false });
  if (result.code !== 0 && !options.allowFailure) {
    throw new GitError(
      `git ${args.join(' ')} failed (exit ${result.code})\n${result.output.trim()}`,
    );
  }
  return result;
}

/** @param {string} repoRoot @param {string[]} args */
function gitLine(repoRoot, args) {
  return git(repoRoot, args).output.trim();
}

/**
 * The root of the repository this is being run from.
 *
 * In a git worktree this is the worktree's own root, which is where
 * `package.json` and `tools/` live, so the state file lands beside the build
 * logs exactly as it does in a normal clone.
 */
function findRepoRoot() {
  const result = capture('git', ['rev-parse', '--show-toplevel'], { quiet: true, shell: false });
  if (result.code !== 0) {
    throw new GitError('Not inside a git repository, so there is nothing to cut a branch from.');
  }
  return result.output.trim();
}

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
  const localPrefix = `refs/heads/${REF_PREFIX}/`;
  const remotePrefix = `refs/remotes/${remote}/${REF_PREFIX}/`;

  const local = new Set(
    refNames(repoRoot, localPrefix).map((ref) => ref.slice('refs/heads/'.length)),
  );
  const tracked = new Set(
    refNames(repoRoot, remotePrefix).map((ref) => ref.slice(`refs/remotes/${remote}/`.length)),
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
 * Full ref names under a prefix.
 *
 * `%(refname)` rather than `%(refname:short)` because the short form drops
 * whichever leading segments git considers unambiguous, which is not a fixed
 * number and is exactly the sort of thing to get wrong once and then delete
 * the wrong branch over.
 *
 * @param {string} repoRoot
 * @param {string} prefix
 */
function refNames(repoRoot, prefix) {
  const result = git(repoRoot, ['for-each-ref', '--format=%(refname)', prefix]);
  return result.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

/** @param {string} repoRoot */
function readState(repoRoot) {
  const path = join(repoRoot, STATE_FILE);
  if (!existsSync(path)) return /** @type {Record<string, RunState>} */ ({});
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return /** @type {Record<string, RunState>} */ (parsed);
    }
  } catch {
    warn('The release state file was unreadable. Treating this as a fresh start.');
  }
  return /** @type {Record<string, RunState>} */ ({});
}

/**
 * @param {string} repoRoot
 * @param {Record<string, RunState>} state
 */
function writeState(repoRoot, state) {
  writeFileSync(join(repoRoot, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
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
 * @param {string} ref full ref name, e.g. `refs/heads/release/ios/...`
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
 * Cuts the branch for a run about to start, and pushes it straight away.
 *
 * Straight away, so that a run which never comes back still left a record. A
 * branch pushed now and tagged later needs no rename, which is the whole
 * reason the outcome is not in the branch name.
 *
 * The branch is created without checking it out. The build has to run from the
 * working tree as it stands, and switching branches under it would at best be
 * a surprise and at worst lose somebody's place.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function start(options) {
  const repoRoot = findRepoRoot();
  const platform = assertPlatform(options.platform ?? '');
  const remote = options.remote ?? DEFAULT_REMOTE;

  const modified = gitLine(repoRoot, ['status', '--porcelain', '--untracked-files=no']);
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
    warn('Building from a dirty tree. The tag will say so.');
  }

  const untracked = gitLine(repoRoot, ['ls-files', '--others', '--exclude-standard']);
  if (untracked.length > 0) {
    warn('Untracked files are present. EAS builds committed state, so these will not ship.');
  }

  const commit = gitLine(repoRoot, ['rev-parse', 'HEAD']);
  const branches = listReleaseBranches(repoRoot, remote);
  const branch = availableBranchName(platform, new Date(), branches.all);

  git(repoRoot, ['branch', branch, commit]);
  ok(`Cut ${branch} at ${commit.slice(0, 8)}`);

  const pushed = pushRef(repoRoot, remote, `refs/heads/${branch}`);
  if (pushed) ok(`Pushed to ${remote}`);

  const state = readState(repoRoot);
  state[platform] = {
    branch,
    commit,
    startedAt: formatTimestamp(new Date()),
    remote,
    pushed,
    profile: options.profile,
    dirty: modified.length > 0,
  };
  writeState(repoRoot, state);

  return 0;
}

/**
 * Tags the branch with how the run ended, then prunes.
 *
 * Missing state is a warning rather than an error. It means the deploy started
 * before this tooling existed, or `start` refused and the caller carried on;
 * neither is a reason to report a successful release as a failure.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function finish(options) {
  const repoRoot = findRepoRoot();
  const platform = assertPlatform(options.platform ?? '');
  // The parser has already refused anything but these two, so this narrows a
  // string to the outcome type rather than deciding anything. Failure is the
  // safer of the two to land on if that ever stops being true.
  const outcome = options.outcome === 'success' ? 'success' : 'failed';

  const state = readState(repoRoot);
  const run = state[platform];
  if (!run) {
    warn(`No release branch is open for ${platform}, so there is nothing to tag.`);
    return 0;
  }

  const remote = options.remote ?? run.remote ?? DEFAULT_REMOTE;
  const tag = tagNameFor(run.branch, outcome);

  if (tagExists(repoRoot, tag)) {
    warn(`${tag} already exists. Leaving it as it is.`);
  } else {
    const notes = [run.dirty ? 'Built from a dirty working tree.' : '', options.notes ?? '']
      .filter((part) => part.length > 0)
      .join(' ');

    writeAnnotatedTag(
      repoRoot,
      tag,
      run.commit,
      buildTagMessage({
        branch: run.branch,
        platform,
        outcome,
        commit: run.commit,
        profile: run.profile,
        startedAt: run.startedAt,
        duration: options.duration,
        exitCode: options.exitCode,
        submitted: options.submitted,
        easBuildId: options.easBuildId,
        easBuildUrl: options.easBuildUrl,
        notes: notes.length > 0 ? notes : undefined,
      }),
    );
    ok(`Tagged ${tag}`);
  }

  // A branch whose push failed at the start gets one more try now, so an
  // outage that lasted a build does not cost the record.
  if (!run.pushed) pushRef(repoRoot, remote, `refs/heads/${run.branch}`);
  pushRef(repoRoot, remote, `refs/tags/${tag}`);

  delete state[platform];
  writeState(repoRoot, state);

  if (!options.noPrune) {
    prune({ ...options, command: 'prune', remote });
  }
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
 * Removes failed and unfinished release branches past the keep window.
 *
 * An unfinished branch is tagged before it is deleted. That ordering is the
 * point rather than a nicety: a failed run's commit is already pinned by its
 * tag, but an unfinished run has no tag at all, and if the release was cut
 * from a branch that has since been deleted then this ref is the only thing
 * holding the commit. Tag first and the deletion cannot lose anything.
 *
 * @param {import('./lib/release-branch-options.mjs').ReleaseOptions} options
 */
function prune(options) {
  const repoRoot = findRepoRoot();
  const remote = options.remote ?? DEFAULT_REMOTE;
  const keepDays = options.keepDays ?? DEFAULT_KEEP_DAYS;

  const branches = listReleaseBranches(repoRoot, remote);
  const plan = selectPrunable({
    branches: branches.all,
    tags: listReleaseTags(repoRoot),
    now: new Date(),
    keepDays,
  });

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

/** @param {string[]} argv */
function main(argv) {
  configureColour({});

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
    return prune(options);
  } catch (error) {
    if (error instanceof GitError || error instanceof ReleaseNameError) {
      fail(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
