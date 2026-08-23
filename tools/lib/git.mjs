/**
 * Running git for the release tooling.
 *
 * `tools/release-branch.mjs` and `tools/version-bump.mjs` are separate
 * commands with separate jobs, but both are a thin layer of policy over the
 * same four primitives: run git, take one line of its output, find the repo,
 * and refuse to touch a dirty tree. Each used to carry its own copy of all
 * four. They were identical, which is the problem: a fix to the quoting, the
 * error text or the failure handling landed in one and not the other, and
 * nothing pointed that out.
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
 * and refspecs all contain characters a shell would take an interest in, and
 * this runs on Windows where the quoting rules are not the ones most of us
 * carry in our heads.
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
 * git's output with the trailing newline taken off, for the many commands
 * whose whole answer is one line.
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
 * Tracked files with uncommitted changes, one per line, or `''` when the tree
 * is clean.
 *
 * Untracked files are excluded on purpose. Both callers care about whether
 * `HEAD` describes what is on disk, and an untracked file has never been part
 * of that claim. `release-branch` warns about untracked files separately, for
 * a different reason (EAS builds committed state, so they will not ship).
 *
 * Only the trailing newline is trimmed, not leading whitespace: porcelain
 * lines start with a two-column status field that is blank on the left for
 * an unstaged change, and both callers print these lines straight to the
 * operator. Trimming the block as a whole took that column off the first line
 * only, leaving a list that did not line up with itself.
 *
 * @param {string} repoRoot
 */
export function modifiedTrackedFiles(repoRoot) {
  const result = git(repoRoot, ['status', '--porcelain', '--untracked-files=no']);
  return result.output.replace(/\s+$/, '');
}
