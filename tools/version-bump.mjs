#!/usr/bin/env node
/**
 * Bumps the release version and lands it on `main` before a store deploy.
 *
 * `tools/ps/VersionBump.ps1` calls this once, at the top of
 * `BuildAndDeployiOS.ps1` and `BuildAndDeployAndroidStore.ps1`, before the
 * release branch is cut (see `tools/release-branch.mjs`) — so the version
 * this commits is the one the release branch, and the store build, actually
 * carries.
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
 * ## The branch-and-merge
 *
 * The bump is written on a throwaway branch (`version-bump/<next>`) cut from
 * `HEAD`, committed there, fast-forward merged into the base branch, and the
 * throwaway branch is then deleted. A fast-forward merge is possible only
 * because nothing else can have landed on the base branch between the branch
 * being cut and the merge happening a moment later in the same run — if that
 * ever stops being true (a concurrent release, a push in between) the
 * fast-forward simply refuses, and this tool fails loudly rather than
 * inventing a merge commit.
 *
 * ## Running twice in a row
 *
 * `BuildAndDeployiOS.cmd` and `BuildAndDeployAndroidStore.cmd` each call this
 * independently, so shipping both platforms for the same version in one
 * sitting calls it twice. The second call is a no-op rather than a second
 * bump: before doing anything else, it checks whether `HEAD`'s own commit is
 * already a bump this tool wrote (see `bumpCommitVersion` in
 * `tools/lib/version-bump.mjs`), and if so, stops there. Nothing can have
 * landed on the base branch between the two calls except that commit itself,
 * so there is nothing new to release yet.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { configureColour, detail, fail, ok, say, warn } from './lib/format.mjs';
import { findRepoRoot, git, GitError, gitLine, modifiedTrackedFiles } from './lib/git.mjs';
import {
  bumpCommitMessage,
  bumpCommitVersion,
  bumpVersion,
  LEVELS,
  replaceVersionField,
  VersionError,
} from './lib/version-bump.mjs';

const DEFAULT_REMOTE = 'origin';
const DEFAULT_BASE = 'main';
const DEFAULT_LEVEL = 'minor';

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
    } else {
      throw new UsageError(`Unknown option '${arg}'.`);
    }
    index += 1;
  }

  return options;
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

  // Makes a second run in the same sitting a no-op instead of a second bump.
  // If HEAD is already the commit this tool wrote for a bump, nothing has
  // landed on the base branch since -- there is nothing new to release, so
  // there is nothing to bump. This is what lets BuildAndDeployiOS.cmd and
  // BuildAndDeployAndroidStore.cmd both call in without either one needing to
  // know the other already ran: the second call sees its own commit sitting
  // at HEAD and stops here. The moment a real commit lands on top of it, HEAD
  // stops being a bump commit and the next deploy bumps again as normal.
  const headSubject = gitLine(repoRoot, ['log', '-1', '--format=%s']);
  const alreadyAt = bumpCommitVersion(headSubject);
  if (alreadyAt) {
    ok(`Already at ${alreadyAt} (${headSubject}). Nothing to bump.`);
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

  const current = readCurrentVersion(repoRoot);
  const next = bumpVersion(current, options.level);
  const branch = `version-bump/${next}`;

  if (gitLine(repoRoot, ['branch', '--list', branch]).length > 0) {
    fail(`${branch} already exists. A previous bump may have failed partway through.`);
    detail(`Delete it by hand once you've checked what it holds: git branch -D ${branch}`);
    return 1;
  }

  ok(`Bumping ${current} -> ${next} (${options.level})`);

  git(repoRoot, ['checkout', '-b', branch]);
  writeVersion(repoRoot, next);
  git(repoRoot, ['add', APP_JSON, PACKAGE_JSON]);
  git(repoRoot, ['commit', '-m', bumpCommitMessage(next)]);
  ok(`Committed on ${branch}`);

  git(repoRoot, ['checkout', options.base]);
  git(repoRoot, ['merge', '--ff-only', branch]);
  git(repoRoot, ['branch', '-d', branch]);
  ok(`Merged into ${options.base}`);

  const pushed = git(repoRoot, ['push', options.remote, options.base], { allowFailure: true });
  if (pushed.code === 0) {
    ok(`Pushed ${options.base} to ${options.remote}`);
  } else {
    warn(`Could not push ${options.base} to ${options.remote}. The commit is local only.`);
    detail(`git push ${options.remote} ${options.base}`);
  }

  return 0;
}

/** @param {string[]} argv */
function main(argv) {
  configureColour({});

  const [command, ...rest] = argv;
  if (command !== 'bump') {
    fail(`Unknown command '${command ?? ''}'. Expected: bump.`);
    say();
    say(
      'Usage: node tools/version-bump.mjs bump [--level patch|minor|major] [--base main] [--remote origin]',
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
    if (error instanceof GitError || error instanceof VersionError) {
      fail(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
