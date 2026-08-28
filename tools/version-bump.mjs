#!/usr/bin/env node
/**
 * Bumps the release version and lands it on `main` before a store deploy.
 *
 * `tools/ps/VersionBump.ps1` calls this once per release, from
 * `tools/ps/Deploy.ps1`, before anything is built — so the version this
 * commits is the one the release branch, and both store builds, actually
 * carry.
 *
 * `app.json`'s `expo.version` is the version that reaches the store listing;
 * `package.json`'s `version` is conventional npm bookkeeping. Both are
 * bumped together in one commit so they cannot drift.
 *
 * Native build numbers (iOS `CFBundleVersion`, Android `versionCode`) are a
 * separate concern and are not touched here: `eas.json` sets
 * `appVersionSource: "remote"` with `autoIncrement: true` on the production
 * profile, so EAS itself assigns and increments those remotely on every
 * production build. A local field for either would be ignored under that
 * setting, so writing one here would be dead weight at best and misleading
 * at worst.
 *
 * ## The bump lands through a pull request
 *
 * The bump is committed on the **release branch** (`release/<timestamp>`, the
 * name `tools/release-branch.mjs` would choose), pushed, opened as a pull
 * request against the base branch, and merged immediately.
 *
 * Three deliberate choices in that sentence:
 *
 * - **Through a pull request rather than a direct push.** A direct push works
 *   only while the repository does not require a pull request before merging.
 *   Turn that protection on and the push is rejected, the bump is left as a
 *   local-only commit, and every later run refuses to start because local and
 *   remote have diverged. This flow already complies if that day comes.
 * - **The release branch is the pull request's source.** Cutting the release
 *   branch from the bump commit is what makes it name exactly what is about to
 *   be built. A separate throwaway bump branch cut from the same commit would
 *   be a second name for the same ref with no distinct job.
 * - **Merged immediately, not armed with `--auto`.** `gh pr merge --auto`
 *   returns as soon as the merge is *armed*, which leaves an asynchronous gap
 *   in which the release could ship a version the base branch never received.
 *   With no required reviews and no required checks, an immediate merge either
 *   succeeds or fails on the spot.
 *
 * A squash merge is not used: it would put a *content twin* of the release
 * branch's commit on the base branch rather than an ancestor of it, so a
 * hotfix cut from the release branch would no longer merge back into a history
 * that recognises it. A merge commit keeps the bump commit reachable.
 *
 * ## Running twice in a row
 *
 * A retry after a partial failure (iOS shipped, Android did not) re-runs the
 * same entry point, and must rebuild the failed platform at the *same*
 * version. So before doing anything else this checks whether the bump is
 * already on the base branch — either as `HEAD` itself, or as the branch that
 * `HEAD`'s merge commit brought in — and if so, stops there. See
 * `landedBumpVersion` in `tools/lib/version-bump.mjs`. The moment a real
 * commit lands on top, the base branch has something new to release and the
 * next deploy bumps again as normal.
 *
 * ## What it will not do
 *
 * It refuses to run anywhere but the base branch (`main` by default), and it
 * refuses a dirty working tree with no override. A version bump that lands on
 * `main` automatically is not a place for `--allow-dirty`: unlike the release
 * branch, which only ever points at an existing commit, this tool creates a
 * new one, and an override would risk sweeping unrelated local changes into
 * it. Commit, stash, or discard them first.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { capture, quietShellDeprecation } from './lib/exec.mjs';
import { configureColour, detail, fail, ok, say, warn } from './lib/format.mjs';
import {
  findRepoRoot,
  git,
  GitError,
  gitLine,
  modifiedTrackedFiles,
  refNames,
} from './lib/git.mjs';
import { availableBranchName, REF_PREFIX, ReleaseNameError } from './lib/release-branch.mjs';
import {
  bumpCommitMessage,
  bumpPullRequestBody,
  bumpPullRequestTitle,
  bumpVersion,
  landedBumpVersion,
  LEVELS,
  replaceVersionField,
  VersionError,
} from './lib/version-bump.mjs';

const DEFAULT_REMOTE = 'origin';
const DEFAULT_BASE = 'main';
const DEFAULT_LEVEL = 'minor';

/** Long enough for a slow network, short enough that a hung `gh` is not a wall. */
const GH_TIMEOUT_MS = 120_000;

const APP_JSON = 'app.json';
const PACKAGE_JSON = 'package.json';

/** Thrown for a command line this module cannot make sense of. */
class UsageError extends Error {}

/**
 * The version this repository is currently at, read from `app.json`.
 *
 * `app.json` rather than `package.json`, because `expo.version` is the one
 * that ships to the store and is therefore the source of truth; a caller who
 * has let the two drift apart is warned rather than blocked, since the bump
 * about to happen will bring them back into line either way.
 *
 * @param {string} repoRoot
 */
function readCurrentVersion(repoRoot) {
  const appJson = JSON.parse(readFileSync(join(repoRoot, APP_JSON), 'utf8'));
  const packageJson = JSON.parse(readFileSync(join(repoRoot, PACKAGE_JSON), 'utf8'));

  const appVersion = appJson?.expo?.version;
  if (typeof appVersion !== 'string') {
    throw new VersionError(`${APP_JSON} has no expo.version to bump.`);
  }
  if (typeof packageJson?.version === 'string' && packageJson.version !== appVersion) {
    warn(
      `${PACKAGE_JSON} is at ${packageJson.version} but ${APP_JSON} is at ${appVersion}. ` +
        `Bumping from ${appVersion} and bringing both back in line.`,
    );
  }
  return appVersion;
}

/**
 * Rewrites the `version` field in both files, in place, to `next`.
 *
 * @param {string} repoRoot
 * @param {string} next
 */
function writeVersion(repoRoot, next) {
  for (const file of [APP_JSON, PACKAGE_JSON]) {
    const path = join(repoRoot, file);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, replaceVersionField(original, next), 'utf8');
  }
}

/**
 * @typedef {object} BumpOptions
 * @property {'patch' | 'minor' | 'major'} level
 * @property {string} base
 * @property {string} remote
 * @property {string} [branch] the release branch to commit the bump on; chosen
 *   from the clock when not given
 */

/**
 * @param {string[]} argv
 * @returns {BumpOptions}
 */
function parseArgs(argv) {
  /** @type {BumpOptions} */
  const options = { level: DEFAULT_LEVEL, base: DEFAULT_BASE, remote: DEFAULT_REMOTE };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`Option '${arg}' needs a value.`);
    }

    if (arg === '--level') {
      if (!LEVELS.includes(/** @type {'patch' | 'minor' | 'major'} */ (value))) {
        throw new UsageError(`Unknown --level '${value}'. Expected ${LEVELS.join(', ')}.`);
      }
      options.level = /** @type {'patch' | 'minor' | 'major'} */ (value);
    } else if (arg === '--base') {
      options.base = value;
    } else if (arg === '--remote') {
      options.remote = value;
    } else if (arg === '--branch') {
      options.branch = value;
    } else {
      throw new UsageError(`Unknown option '${arg}'.`);
    }
    index += 1;
  }

  return options;
}

/**
 * The subject of `HEAD` and, when `HEAD` is a merge, of the branch it merged.
 *
 * @param {string} repoRoot
 * @returns {{ head: string, merged: string | null }}
 */
function headSubjects(repoRoot) {
  const head = gitLine(repoRoot, ['log', '-1', '--format=%s']);
  const parents = gitLine(repoRoot, ['rev-list', '--parents', '-n', '1', 'HEAD'])
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(1);
  const second = parents[1];
  const merged = second ? gitLine(repoRoot, ['log', '-1', '--format=%s', second]) : null;
  return { head, merged };
}

/**
 * A release branch name nothing has taken yet.
 *
 * The same rule `tools/release-branch.mjs` uses, so the branch this commits
 * the bump on is the branch that tool then adopts as the release branch —
 * which it recognises by seeing its commit as `HEAD`'s merged parent.
 *
 * @param {string} repoRoot
 * @param {string} remote
 */
function chooseReleaseBranch(repoRoot, remote) {
  const local = refNames(repoRoot, `refs/heads/${REF_PREFIX}/`).map((ref) =>
    ref.slice('refs/heads/'.length),
  );
  const tracked = refNames(repoRoot, `refs/remotes/${remote}/${REF_PREFIX}/`).map((ref) =>
    ref.slice(`refs/remotes/${remote}/`.length),
  );
  return availableBranchName(new Date(), [...local, ...tracked]);
}

/**
 * Runs `gh`, echoing what it said only when it refused.
 *
 * @param {string} repoRoot
 * @param {string[]} args
 */
function gh(repoRoot, args) {
  return capture('gh', args, { cwd: repoRoot, quiet: true, timeoutMs: GH_TIMEOUT_MS });
}

/**
 * Undoes a bump that never landed, so the next run starts from where this one
 * found things.
 *
 * A local-only bump commit left behind is exactly the wedged state this whole
 * redesign exists to remove: the base branch would have diverged from the
 * remote and every later run would refuse to start. `checkout --force` because
 * the working tree carries the rewritten version files at this point.
 *
 * @param {string} repoRoot
 * @param {string} base
 * @param {string} remote
 * @param {string} branch
 * @param {boolean} pushed whether the branch reached the remote
 */
function rollBack(repoRoot, base, remote, branch, pushed) {
  warn('Rolling the bump back so the next run starts from a clean base.');
  git(repoRoot, ['checkout', '--force', base], { allowFailure: true });
  git(repoRoot, ['branch', '-D', branch], { allowFailure: true });
  if (pushed) {
    const deleted = git(repoRoot, ['push', remote, '--delete', branch], { allowFailure: true });
    if (deleted.code !== 0) {
      warn(`Could not delete ${branch} from ${remote}. Remove it and its pull request by hand.`);
    }
  }
}

/**
 * @param {BumpOptions} options
 * @returns {number} exit code
 */
function bump(options) {
  const repoRoot = findRepoRoot('there is no version to bump.');

  const currentBranch = gitLine(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (currentBranch !== options.base) {
    fail(`Version bump only runs from ${options.base}. Currently on ${currentBranch}.`);
    detail(
      `Check out ${options.base} first, or pass --base ${currentBranch} if that's deliberate.`,
    );
    return 1;
  }

  // Makes a retry a no-op instead of a second bump. If the bump this tool
  // wrote is already on the base branch -- as HEAD itself, or as the branch
  // HEAD's merge commit brought in -- nothing new has landed since, so there
  // is nothing new to release. This is what lets a run that shipped iOS and
  // failed on Android be retried at the same version.
  const alreadyAt = landedBumpVersion(headSubjects(repoRoot));
  if (alreadyAt) {
    ok(`Already at ${alreadyAt}. Nothing to bump.`);
    return 0;
  }

  const modified = modifiedTrackedFiles(repoRoot);
  if (modified.length > 0) {
    fail('Tracked files have been modified. A version bump commits to the base branch');
    fail('automatically, so it refuses to sweep unrelated changes in with it:');
    say();
    modified.split(/\r?\n/).forEach((line) => detail(line));
    say();
    detail('Commit or stash these first.');
    return 1;
  }

  const fetched = git(repoRoot, ['fetch', options.remote, options.base], { allowFailure: true });
  if (fetched.code === 0) {
    const local = gitLine(repoRoot, ['rev-parse', options.base]);
    const upstream = gitLine(repoRoot, ['rev-parse', `${options.remote}/${options.base}`]);
    if (local !== upstream) {
      fail(`${options.base} is not in sync with ${options.remote}/${options.base}. Pull first.`);
      return 1;
    }
  } else {
    warn(`Could not reach ${options.remote} to confirm ${options.base} is up to date. Continuing.`);
  }

  // Checked before the branch is cut rather than at the point of use: `gh`
  // missing after the bump commit exists means rolling back a commit that
  // never had to be written.
  const ghVersion = gh(repoRoot, ['--version']);
  if (ghVersion.code !== 0) {
    fail('The GitHub CLI (gh) is not available, so the bump cannot be landed by pull request.');
    detail('Install it from https://cli.github.com and run: gh auth login');
    return 1;
  }

  const current = readCurrentVersion(repoRoot);
  const next = bumpVersion(current, options.level);
  const branch = options.branch ?? chooseReleaseBranch(repoRoot, options.remote);

  if (gitLine(repoRoot, ['branch', '--list', branch]).length > 0) {
    fail(`${branch} already exists. A previous release may have failed partway through.`);
    detail(`Delete it by hand once you've checked what it holds: git branch -D ${branch}`);
    return 1;
  }

  ok(`Bumping ${current} -> ${next} (${options.level})`);

  git(repoRoot, ['checkout', '-b', branch]);
  writeVersion(repoRoot, next);
  git(repoRoot, ['add', APP_JSON, PACKAGE_JSON]);
  git(repoRoot, ['commit', '-m', bumpCommitMessage(next)]);
  ok(`Committed on ${branch}, which is this release's branch`);

  const pushed = git(
    repoRoot,
    ['push', options.remote, `refs/heads/${branch}:refs/heads/${branch}`],
    {
      allowFailure: true,
    },
  );
  if (pushed.code !== 0) {
    fail(`Could not push ${branch} to ${options.remote}, so there is nothing to open a PR from.`);
    detail(pushed.output.trim().split(/\r?\n/).slice(-3).join('\n'));
    rollBack(repoRoot, options.base, options.remote, branch, false);
    return 1;
  }
  ok(`Pushed ${branch} to ${options.remote}`);

  const created = createPullRequest(repoRoot, { branch, base: options.base, current, next });
  if (created.code !== 0) {
    fail(`Could not open the pull request for ${branch}.`);
    detail(created.output.trim().split(/\r?\n/).slice(-5).join('\n'));
    rollBack(repoRoot, options.base, options.remote, branch, true);
    return 1;
  }
  ok(`Opened a pull request from ${branch} into ${options.base}`);

  // A merge commit rather than a squash: see the header comment. Not --auto,
  // because that returns once the merge is armed rather than once it has
  // happened, and this release is about to build the version it assumes landed.
  const merged = gh(repoRoot, ['pr', 'merge', branch, '--merge', '--delete-branch=false']);
  if (merged.code !== 0) {
    fail(`The pull request for ${branch} did not merge, so this release is not going ahead.`);
    detail(merged.output.trim().split(/\r?\n/).slice(-5).join('\n'));
    rollBack(repoRoot, options.base, options.remote, branch, true);
    return 1;
  }
  ok(`Merged into ${options.base}`);

  return settleAfterMerge(repoRoot, options, branch, next);
}

/**
 * Opens the pull request, with its body passed through a file.
 *
 * Through a file for the same reason tag messages are: the body is several
 * lines, this runs on Windows, and a multi-line argument is not something
 * `cmd` quoting reliably survives.
 *
 * @param {string} repoRoot
 * @param {{ branch: string, base: string, current: string, next: string }} input
 */
function createPullRequest(repoRoot, { branch, base, current, next }) {
  const dir = mkdtempSync(join(tmpdir(), 'refrain-bump-'));
  const bodyPath = join(dir, 'pr-body.md');
  try {
    writeFileSync(bodyPath, `${bumpPullRequestBody({ current, next, branch })}\n`, 'utf8');
    return gh(repoRoot, [
      'pr',
      'create',
      '--base',
      base,
      '--head',
      branch,
      '--title',
      bumpPullRequestTitle(next),
      '--body-file',
      bodyPath,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Brings the local base branch up to the merge, and makes sure the release
 * branch survived it.
 *
 * Everything here is a warning rather than a failure. The bump has landed on
 * the remote by this point, so the release can go ahead; what is left is local
 * tidying that a person can finish by hand.
 *
 * The re-push is not belt and braces. This repository has GitHub's
 * "automatically delete head branches" turned on, so merging the pull request
 * **deletes the release branch from the remote** — the branch whose whole job
 * is to record what this release was built from. Pushing it back is what keeps
 * that record.
 *
 * @param {string} repoRoot
 * @param {BumpOptions} options
 * @param {string} branch
 * @param {string} next
 * @returns {number}
 */
function settleAfterMerge(repoRoot, options, branch, next) {
  git(repoRoot, ['checkout', options.base]);
  const fetched = git(repoRoot, ['fetch', options.remote, options.base], { allowFailure: true });
  if (fetched.code === 0) {
    const advanced = git(repoRoot, ['merge', '--ff-only', 'FETCH_HEAD'], { allowFailure: true });
    if (advanced.code === 0) {
      ok(`${options.base} is now at ${next}`);
    } else {
      warn(`Could not fast-forward ${options.base} onto the merge. Pull it by hand.`);
    }
  } else {
    warn(`Could not fetch ${options.base} after the merge. Pull it by hand.`);
  }

  const onRemote = git(repoRoot, ['ls-remote', '--heads', options.remote, branch], {
    allowFailure: true,
  });
  if (onRemote.code === 0 && onRemote.output.trim().length === 0) {
    detail(`${branch} was deleted by the merge. Pushing it back as the release record.`);
    const rePushed = git(
      repoRoot,
      ['push', options.remote, `refs/heads/${branch}:refs/heads/${branch}`],
      { allowFailure: true },
    );
    if (rePushed.code === 0) ok(`Restored ${branch} on ${options.remote}`);
    else warn(`Could not restore ${branch} on ${options.remote}. The local branch is still there.`);
  }

  return 0;
}

/** @param {string[]} argv */
function main(argv) {
  configureColour({});
  quietShellDeprecation();

  const [command, ...rest] = argv;
  if (command !== 'bump') {
    fail(`Unknown command '${command ?? ''}'. Expected: bump.`);
    say();
    say(
      'Usage: node tools/version-bump.mjs bump [--level patch|minor|major] [--base main]\n' +
        '                                       [--remote origin] [--branch release/<stamp>]',
    );
    return 2;
  }

  let options;
  try {
    options = parseArgs(rest);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    fail(error.message);
    return 2;
  }

  try {
    return bump(options);
  } catch (error) {
    if (
      error instanceof GitError ||
      error instanceof VersionError ||
      error instanceof ReleaseNameError
    ) {
      fail(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
