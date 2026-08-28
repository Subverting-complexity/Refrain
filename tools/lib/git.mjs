/**
 * Running git for the release tooling.
 *
 * `tools/release-branch.mjs` and `tools/version-bump.mjs` are separate
 * commands with separate jobs, but both are a thin layer of policy over the
 * same four primitives: run git, take one line of its output, find the repo,
 * and refuse to touch a dirty tree.
 *
 * Deliberately not a general-purpose git wrapper. It covers what these two
 * commands need and stops there.
 */

import { capture } from './exec.mjs';

/** Thrown when git itself refuses. Carries the output so the operator sees it. */
export class GitError extends Error {}

/**
 * Runs git and returns what it said.
 *
 * Quiet by default: a single `finish` asks git for a SHA, three ref lists and
 * a tag, and echoing all of that would bury the two lines the operator needs.
 *
 * `shell: false` so arguments reach git as given. Tag messages, branch names
 * and refspecs can all contain shell metacharacters, and this runs on Windows,
 * where the quoting rules differ from POSIX.
 *
 * @param {string} repoRoot
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [options]
 */
export function git(repoRoot, args, options = {}) {
  const result = capture('git', args, { cwd: repoRoot, quiet: true, shell: false });
  if (result.code !== 0 && !options.allowFailure) {
    throw new GitError(
      `git ${args.join(' ')} failed (exit ${result.code})\n${result.output.trim()}`,
    );
  }
  return result;
}

/**
 * git's output with surrounding whitespace removed, for the many commands
 * whose whole answer is one line.
 *
 * A full trim, not a trailing one. Contrast `modifiedTrackedFiles` below,
 * which keeps leading whitespace because its output is a block of lines
 * whose first column is significant.
 *
 * @param {string} repoRoot
 * @param {string[]} args
 */
export function gitLine(repoRoot, args) {
  return git(repoRoot, args).output.trim();
}

/**
 * The root of the repository this is being run from.
 *
 * In a git worktree this is the worktree's own root, which is where
 * `package.json` and `tools/` live, so state files land beside the build logs
 * exactly as they do in a normal clone.
 *
 * @param {string} nothingToDo what there is no point doing outside a repo,
 *   completing the sentence "Not inside a git repository, so ...". Each
 *   caller says this in its own terms because the operator reading it is
 *   part-way through a specific command, not a general one.
 */
export function findRepoRoot(nothingToDo) {
  const result = capture('git', ['rev-parse', '--show-toplevel'], { quiet: true, shell: false });
  if (result.code !== 0) {
    throw new GitError(`Not inside a git repository, so ${nothingToDo}`);
  }
  return result.output.trim();
}

/**
 * Full ref names under a prefix.
 *
 * `%(refname)` rather than `%(refname:short)` because the short form drops
 * whichever leading segments git considers unambiguous, which is not a fixed
 * number and is exactly the sort of thing to get wrong once and then delete
 * the wrong branch over.
 *
 * Both release commands need this: one to choose a name no branch has taken,
 * the other to decide which branches have outlived their usefulness.
 *
 * @param {string} repoRoot
 * @param {string} prefix
 * @returns {string[]}
 */
export function refNames(repoRoot, prefix) {
  const result = git(repoRoot, ['for-each-ref', '--format=%(refname)', prefix]);
  return result.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Tracked files with uncommitted changes, one per line, or `''` when the tree
 * is clean.
 *
 * Untracked files are excluded on purpose. Both callers care about whether
 * `HEAD` describes what is on disk, and an untracked file has never been part
 * of that claim. `release-branch` warns about untracked files separately, for
 * a different reason (EAS builds committed state, so they will not ship).
 *
 * Trailing whitespace is stripped, leading whitespace is kept: porcelain
 * lines start with a two-column status field that is blank on the left for
 * an unstaged change, and both callers print these lines straight to the
 * operator. A full trim took that column off the first line only, leaving a
 * list that did not line up with itself.
 *
 * @param {string} repoRoot
 */
export function modifiedTrackedFiles(repoRoot) {
  const result = git(repoRoot, ['status', '--porcelain', '--untracked-files=no']);
  return result.output.replace(/\s+$/, '');
}
