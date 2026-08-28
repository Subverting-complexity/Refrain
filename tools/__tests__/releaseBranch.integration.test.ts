/**
 * End-to-end proof for `tools/release-branch.mjs`'s git and filesystem side
 * effects: the branch it cuts, the tags it writes, and the run record that has
 * to survive one platform reporting and clear when the release ends.
 *
 * The run record is why this file exists. Its rules read simply enough —
 * "clear when every selected platform has reported, and also when the release
 * stops early" — and every way of getting them wrong looks the same from the
 * outside: a release state file left behind, and the *next* release finding a
 * run already in flight. That is a failure a unit test on a pure function
 * cannot see, because the bug is in the sequence rather than in any one
 * decision. So this drives the real CLI against a throwaway repository with a
 * local bare "origin", one command at a time, in the order a deploy makes them.
 *
 * `releaseBranch.test.ts` covers the naming and retention rules in isolation,
 * and `releaseBranchPrune.test.ts` covers the deletion rule.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  commitAll,
  git,
  releaseBranches,
  releaseTags,
  remoteReleaseBranches,
  runTool,
  setupRepo,
  writeFile,
  type Repo,
  type ToolRun,
} from './releaseRepo';

const IOS_LISTING = 'fastlane/metadata/en-US/description.txt';
const ANDROID_LISTING = 'fastlane/metadata/android/en-US/full_description.txt';

const LISTING_FILES = {
  [IOS_LISTING]: 'Loop a passage until it is yours.\n',
  [ANDROID_LISTING]: 'Loop a passage until it is yours.\n',
};

/** The exit code `listing-check` uses for "nothing to push". */
const SKIP = 20;

function run(repo: Repo, args: string[]): ToolRun {
  return runTool('release-branch.mjs', repo.workDir, args);
}

function statePath(repo: Repo): string {
  return join(repo.workDir, 'tools', 'release-state.json');
}

function readState(repo: Repo): Record<string, unknown> | null {
  const path = statePath(repo);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** Starts a release and hands back the one branch it opened. */
function startRelease(repo: Repo, platforms: string, lane = 'store'): string {
  const result = run(repo, [
    'start',
    '--platforms',
    platforms,
    '--lane',
    lane,
    '--profile',
    'production',
  ]);
  expect(result.status).toBe(0);
  const state = readState(repo);
  return String(state?.branch);
}

function finish(
  repo: Repo,
  platform: string,
  outcome: string,
  extra: string[] = [],
): ToolRun {
  return run(repo, [
    'finish',
    '--platform',
    platform,
    '--outcome',
    outcome,
    ...extra,
  ]);
}

describe('release-branch.mjs (integration)', () => {
  let repo: Repo;

  afterEach(() => {
    rmSync(repo.root, { recursive: true, force: true });
  });

  describe('start', () => {
    it('cuts one branch for the whole release and pushes it immediately', () => {
      // Immediately, so a release that never comes back still left evidence it
      // was attempted.
      repo = setupRepo();

      const branch = startRelease(repo, 'both');

      expect(branch).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{4}$/);
      expect(releaseBranches(repo.workDir)).toEqual([branch]);
      expect(remoteReleaseBranches(repo.originDir)).toEqual([branch]);
      expect(git(repo.workDir, ['rev-parse', branch]).trim()).toBe(
        git(repo.workDir, ['rev-parse', 'HEAD']).trim(),
      );
    });

    it('records the platform set the release covers, not the one building now', () => {
      repo = setupRepo();
      startRelease(repo, 'both');

      expect(readState(repo)).toMatchObject({
        platforms: ['ios', 'android'],
        reported: [],
        lane: 'store',
      });
    });

    it('records a single-platform release as covering only that platform', () => {
      repo = setupRepo();
      startRelease(repo, 'android');

      expect(readState(repo)).toMatchObject({ platforms: ['android'] });
    });

    it('leaves the working tree on the branch it was already on', () => {
      // The build runs from the tree as it stands. Switching branches under it
      // would at best be a surprise.
      repo = setupRepo();
      startRelease(repo, 'both');

      expect(
        git(repo.workDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      ).toBe('main');
    });

    it('refuses a dirty tree, because the branch would name a commit nobody built', () => {
      repo = setupRepo();
      writeFile(repo.workDir, 'app.json', '{"expo":{"version":"9.9.9"}}\n');

      const result = run(repo, ['start', '--platforms', 'ios']);

      expect(result.status).toBe(1);
      expect(result.output).toContain('Tracked files have been modified');
      expect(releaseBranches(repo.workDir)).toEqual([]);
    });

    it('records the attempt anyway when told to, and says so in the tag', () => {
      repo = setupRepo();
      writeFile(repo.workDir, 'app.json', '{"expo":{"version":"9.9.9"}}\n');

      const result = run(repo, [
        'start',
        '--platforms',
        'ios',
        '--allow-dirty',
      ]);
      expect(result.status).toBe(0);
      finish(repo, 'ios', 'success');

      const tag = releaseTags(repo.workDir)[0] as string;
      expect(
        git(repo.workDir, ['tag', '-l', '--format=%(contents)', tag]),
      ).toContain('dirty working tree');
    });
  });

  describe('finish', () => {
    it('tags the first platform before the second one has run', () => {
      // A release that dies during the second build has to have already
      // recorded the first platform's result.
      repo = setupRepo();
      const branch = startRelease(repo, 'both');

      finish(repo, 'ios', 'success');

      expect(releaseTags(repo.workDir)).toEqual([`${branch}-ios-success`]);
      expect(readState(repo)).toMatchObject({ reported: ['ios'] });
    });

    it('keeps the release open until every selected platform has reported', () => {
      // Clearing at the first outcome would leave the second platform with no
      // open run to tag.
      repo = setupRepo();
      startRelease(repo, 'both');

      finish(repo, 'ios', 'success');
      expect(readState(repo)).not.toBeNull();

      finish(repo, 'android', 'success');
      expect(readState(repo)).toBeNull();
    });

    it('closes a single-platform release as soon as that platform reports', () => {
      // Assuming the set is always both platforms would strand this state, and
      // the next release would find a run already in flight.
      repo = setupRepo();
      startRelease(repo, 'ios');

      finish(repo, 'ios', 'success');

      expect(readState(repo)).toBeNull();
    });

    it('pushes each tag as it is written', () => {
      repo = setupRepo();
      const branch = startRelease(repo, 'both');

      finish(repo, 'ios', 'success');

      expect(
        git(repo.originDir, ['tag', '-l', `${branch}-ios-success`]).trim(),
      ).toBe(`${branch}-ios-success`);
    });

    it('records the lane and the listing result in the tag message', () => {
      repo = setupRepo();
      startRelease(repo, 'ios', 'fast');

      finish(repo, 'ios', 'success', [
        '--listing',
        'not pushed: fast lane',
        '--submitted',
      ]);

      const tag = releaseTags(repo.workDir)[0] as string;
      const message = git(repo.workDir, [
        'tag',
        '-l',
        '--format=%(contents)',
        tag,
      ]);
      expect(message).toContain('Lane: fast');
      expect(message).toContain('Listing: not pushed: fast lane');
      expect(message).toContain('Submitted: yes');
    });

    it('keeps a shipped binary a success when its listing push failed', () => {
      // The build went to the store and cannot be withdrawn. Recording the
      // release as a failure would be untrue, and would change what the prune
      // rule decides about the branch.
      repo = setupRepo();
      const branch = startRelease(repo, 'ios');

      finish(repo, 'ios', 'success', [
        '--listing',
        'failed: fastlane exited 1',
      ]);

      expect(releaseTags(repo.workDir)).toEqual([`${branch}-ios-success`]);
      expect(
        git(repo.workDir, [
          'tag',
          '-l',
          '--format=%(contents)',
          `${branch}-ios-success`,
        ]),
      ).toContain('Listing: failed: fastlane exited 1');
    });

    it('says so and changes nothing when no release is open', () => {
      // The deploy may have started before this tooling existed, or `start`
      // may have refused and the caller carried on. Neither is a reason to
      // report a successful release as a failure.
      repo = setupRepo();

      const result = finish(repo, 'ios', 'success');

      expect(result.status).toBe(0);
      expect(result.output).toContain('No release is open');
      expect(releaseTags(repo.workDir)).toEqual([]);
    });
  });

  describe('stop', () => {
    it('clears the run when a release ends with a platform never attempted', () => {
      // The case most likely to strand state: Android was never tried, so it
      // will never report, and a rule that waited for it would block the next
      // release for good.
      repo = setupRepo();
      startRelease(repo, 'both');
      finish(repo, 'ios', 'failed');
      expect(readState(repo)).not.toBeNull();

      const result = run(repo, ['stop']);

      expect(result.status).toBe(0);
      expect(readState(repo)).toBeNull();
    });

    it('leaves the platform that was never attempted untagged', () => {
      // It did not fail, it was not tried, and it produced no build to link a
      // tag to. A stopped release is legible from what is there.
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'failed');
      run(repo, ['stop']);

      expect(releaseTags(repo.workDir)).toEqual([`${branch}-ios-failed`]);
    });

    it('names what was never attempted, and how to retry it', () => {
      repo = setupRepo();
      startRelease(repo, 'both');
      finish(repo, 'ios', 'failed');

      const result = run(repo, ['stop']);

      expect(result.output).toContain('Never attempted: android');
      expect(result.output).toContain('-Platform android');
    });

    it('is a no-op when every platform already reported', () => {
      // The deploy script calls it unconditionally at the end of every release.
      repo = setupRepo();
      startRelease(repo, 'ios');
      finish(repo, 'ios', 'success');

      const result = run(repo, ['stop']);

      expect(result.status).toBe(0);
      expect(readState(repo)).toBeNull();
    });

    it('is a no-op when no release was ever opened', () => {
      repo = setupRepo();
      expect(run(repo, ['stop']).status).toBe(0);
    });
  });

  describe('retrying after a partial failure', () => {
    it('reuses the release branch rather than cutting a second at the same commit', () => {
      // Two branches for one commit is the duplication this whole scheme
      // exists to remove.
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'failed');

      const retried = startRelease(repo, 'android');

      expect(retried).toBe(branch);
      expect(releaseBranches(repo.workDir)).toEqual([branch]);
    });

    it('lets the success sit beside the earlier failure', () => {
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'failed');

      startRelease(repo, 'android');
      finish(repo, 'android', 'success');

      expect(releaseTags(repo.workDir)).toEqual([
        `${branch}-android-failed`,
        `${branch}-android-success`,
        `${branch}-ios-success`,
      ]);
      expect(readState(repo)).toBeNull();
    });

    it('adopts the release branch behind the merge commit that landed the bump', () => {
      // The ordinary store-lane shape: the bump is committed on the release
      // branch and lands by pull request, so HEAD is the merge commit and the
      // release branch points at its second parent.
      repo = setupRepo();
      git(repo.workDir, ['checkout', '-q', '-b', 'release/2026-08-13-1432']);
      writeFile(repo.workDir, 'app.json', '{"expo":{"version":"1.1.0"}}\n');
      git(repo.workDir, ['add', '-A']);
      git(repo.workDir, [
        'commit',
        '-q',
        '-m',
        'chore(release): bump version to 1.1.0',
      ]);
      git(repo.workDir, ['checkout', '-q', 'main']);
      git(repo.workDir, [
        'merge',
        '--no-ff',
        '-q',
        '-m',
        'Merge pull request #1',
        'release/2026-08-13-1432',
      ]);
      git(repo.workDir, ['push', '-q', 'origin', 'main']);

      expect(startRelease(repo, 'both')).toBe('release/2026-08-13-1432');
      expect(releaseBranches(repo.workDir)).toEqual([
        'release/2026-08-13-1432',
      ]);
    });

    it('cuts a new branch once a real commit has landed on top', () => {
      // A new commit is a new thing to release, and the old branch names the
      // wrong tree for it.
      repo = setupRepo();
      const first = startRelease(repo, 'ios');
      finish(repo, 'ios', 'success');

      writeFile(repo.workDir, 'readme.md', 'something new\n');
      commitAll(repo.workDir, 'feat: something new');

      const second = startRelease(repo, 'ios');

      expect(second).not.toBe(first);
      expect(releaseBranches(repo.workDir).sort()).toEqual(
        [first, second].sort(),
      );
    });
  });

  describe('prune', () => {
    it('prunes a release where one platform never reached a success', () => {
      // The rule reads every platform that reported. Driven through the real
      // refs here rather than through `selectPrunable` alone, because the tag
      // names have to survive the round trip through git for it to hold.
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'failed');

      // keep-days 0 makes every branch old enough to consider.
      run(repo, ['prune', '--keep-days', '0']);
      expect(releaseBranches(repo.workDir)).toEqual([]);
      // Nothing is lost: the tags still pin the commit.
      expect(releaseTags(repo.workDir)).toEqual([
        `${branch}-android-failed`,
        `${branch}-ios-success`,
      ]);
    });

    it('keeps a release both platforms shipped, however old', () => {
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'success');

      run(repo, ['prune', '--keep-days', '0']);

      expect(releaseBranches(repo.workDir)).toEqual([branch]);
    });

    it('keeps a release a retry rescued', () => {
      // A successful retry promotes the branch back to kept with no special
      // handling, because the rule asks whether each platform reached a
      // success rather than whether it ever failed.
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'failed');
      startRelease(repo, 'android');
      finish(repo, 'android', 'success');

      run(repo, ['prune', '--keep-days', '0']);

      expect(releaseBranches(repo.workDir)).toEqual([branch]);
    });

    it('tags a release that never reported before deleting its branch', () => {
      repo = setupRepo();
      const branch = startRelease(repo, 'both');
      run(repo, ['stop', '--no-prune']);

      run(repo, ['prune', '--keep-days', '0']);

      expect(releaseTags(repo.workDir)).toEqual([`${branch}-unfinished`]);
      expect(releaseBranches(repo.workDir)).toEqual([]);
    });
  });

  describe('listing-check', () => {
    it('pushes when there has never been a successful store release', () => {
      repo = setupRepo('1.0.0', LISTING_FILES);

      expect(run(repo, ['listing-check', '--platform', 'ios']).status).toBe(0);
    });

    it("skips when nothing in that platform's listing changed", () => {
      repo = setupRepo('1.0.0', LISTING_FILES);
      startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'success');

      expect(run(repo, ['listing-check', '--platform', 'ios']).status).toBe(
        SKIP,
      );
    });

    it('decides the two platforms independently', () => {
      // An iOS copy change must not push the Play listing.
      repo = setupRepo('1.0.0', LISTING_FILES);
      startRelease(repo, 'both');
      finish(repo, 'ios', 'success');
      finish(repo, 'android', 'success');

      writeFile(repo.workDir, IOS_LISTING, 'A new description for Apple.\n');
      commitAll(repo.workDir, 'docs(store): reword the App Store description');

      expect(run(repo, ['listing-check', '--platform', 'ios']).status).toBe(0);
      expect(run(repo, ['listing-check', '--platform', 'android']).status).toBe(
        SKIP,
      );
    });

    it('ignores a change to something that is not listing content', () => {
      repo = setupRepo('1.0.0', LISTING_FILES);
      startRelease(repo, 'ios');
      finish(repo, 'ios', 'success');

      writeFile(repo.workDir, 'src/app.ts', 'export const x = 1;\n');
      commitAll(repo.workDir, 'feat: unrelated code');

      expect(run(repo, ['listing-check', '--platform', 'ios']).status).toBe(
        SKIP,
      );
    });

    it('compares against the last successful STORE release, not a fast-lane one', () => {
      // A fast-lane build never pushes the listing, so treating it as the
      // baseline would skip a listing change that has never been published.
      repo = setupRepo('1.0.0', LISTING_FILES);
      startRelease(repo, 'ios');
      finish(repo, 'ios', 'success');

      writeFile(
        repo.workDir,
        IOS_LISTING,
        'Changed after the store release.\n',
      );
      commitAll(repo.workDir, 'docs(store): reword');

      startRelease(repo, 'ios', 'fast');
      finish(repo, 'ios', 'success');

      expect(run(repo, ['listing-check', '--platform', 'ios']).status).toBe(0);
    });

    it('never pushes on the fast lane, even when asked directly', () => {
      repo = setupRepo('1.0.0', LISTING_FILES);

      const result = run(repo, [
        'listing-check',
        '--platform',
        'ios',
        '--lane',
        'fast',
        '--listing',
        'on',
      ]);

      expect(result.status).toBe(SKIP);
      expect(result.output).toContain('does not touch the public listing');
    });

    it('pushes regardless when told to', () => {
      repo = setupRepo('1.0.0', LISTING_FILES);
      startRelease(repo, 'ios');
      finish(repo, 'ios', 'success');

      expect(
        run(repo, ['listing-check', '--platform', 'ios', '--listing', 'on'])
          .status,
      ).toBe(0);
    });
  });

  describe('the older per-platform state file', () => {
    it('is reported and ignored rather than half-read', () => {
      // Written by the tooling this replaced, keyed by platform with no branch
      // of its own. There is no honest way to turn one into a release-wide
      // record.
      repo = setupRepo();
      writeFile(
        repo.workDir,
        'tools/release-state.json',
        JSON.stringify({ ios: { branch: 'release/ios/2026-01-01-0000' } }),
      );

      const result = finish(repo, 'ios', 'success');

      expect(result.status).toBe(0);
      expect(result.output).toContain('older per-platform scheme');
      expect(releaseTags(repo.workDir)).toEqual([]);
    });
  });
});
