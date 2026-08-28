/**
 * End-to-end proof for `tools/version-bump.mjs`'s git side effects: the
 * commit-push-pull-request-merge sequence, its refusals, its rollback, and —
 * the property that actually matters here — that re-running a release after a
 * partial failure rebuilds at the same version rather than bumping again.
 *
 * `tools/__tests__/versionBump.test.ts` covers the pure arithmetic and text
 * editing in isolation. None of that proves the tool behaves correctly against
 * real git, and the no-second-bump property specifically can only be observed
 * by running the CLI twice against a real repository and checking what landed.
 * So this spawns the real tool as a child process against a throwaway repo
 * with a local bare "origin", the same way a developer's machine and the real
 * `origin` relate to each other.
 *
 * The GitHub half is a fake `gh` on PATH (see `fakeGh.ts`) that performs a
 * real merge commit on the remote and then deletes the head branch, which is
 * what this repository's "automatically delete head branches" setting does.
 * The bump's own re-push of the release branch is the thing that keeps the
 * release record from disappearing in the middle of a release, so it is worth
 * a test that reproduces the deletion rather than assuming it away.
 */

import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { fakeGhWorks, installFakeGh } from './fakeGh';
import {
  APP_JSON,
  git,
  releaseBranches,
  remoteReleaseBranches,
  runTool,
  setupRepo,
  writeFile,
  type Repo,
} from './releaseRepo';

function runBump(repo: Repo, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return runTool(
    'version-bump.mjs',
    repo.workDir,
    ['bump', ...args],
    installFakeGh(repo.root, extraEnv),
  );
}

function readVersions(workDir: string): { app: string; pkg: string } {
  const app = JSON.parse(readFileSync(join(workDir, 'app.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf8'));
  return { app: app.expo.version, pkg: pkg.version };
}

function bumpCommitCount(workDir: string): number {
  return git(workDir, ['log', '--format=%s'])
    .split(/\r?\n/)
    .filter((line) => line.startsWith('chore(release): bump version to'))
    .length;
}

describe('version-bump.mjs (integration)', () => {
  let repo: Repo;

  afterEach(() => {
    rmSync(repo.root, { recursive: true, force: true });
  });

  it('installs a fake gh the tooling can actually reach', () => {
    // If this fails, every other expectation in this file is testing the
    // absence of gh rather than the pull-request path.
    repo = setupRepo();
    expect(fakeGhWorks(installFakeGh(repo.root))).toBe(true);
  });

  it('bumps both files and lands them on main through a pull request', () => {
    repo = setupRepo();

    const result = runBump(repo, ['--level', 'minor']);

    expect(result.status).toBe(0);
    expect(readVersions(repo.workDir)).toEqual({ app: '1.1.0', pkg: '1.1.0' });
    expect(bumpCommitCount(repo.workDir)).toBe(1);

    // Landed: local main and origin/main agree, and the merge commit is what
    // main now points at rather than the bump commit itself.
    const local = git(repo.workDir, ['rev-parse', 'main']).trim();
    const upstream = git(repo.workDir, ['rev-parse', 'origin/main']).trim();
    expect(local).toBe(upstream);
    expect(git(repo.workDir, ['log', '-1', '--format=%s']).trim()).toContain(
      'Merge pull request',
    );
  });

  it('commits the bump on the release branch, not on a throwaway one', () => {
    // The release branch is cut from the bump commit, which is what makes it
    // name exactly what is about to be built. A separate bump branch would be
    // a second name for the same commit with no distinct job.
    repo = setupRepo();

    runBump(repo, ['--level', 'minor']);

    const branches = releaseBranches(repo.workDir);
    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(
      git(repo.workDir, [
        'log',
        '-1',
        '--format=%s',
        branches[0] as string,
      ]).trim(),
    ).toBe('chore(release): bump version to 1.1.0');
  });

  it('keeps the bump commit an ancestor of main, not a content twin', () => {
    // Not a squash: a hotfix cut from a successful release branch has to merge
    // back into a history that recognises it.
    repo = setupRepo();
    runBump(repo, ['--level', 'minor']);

    const branch = releaseBranches(repo.workDir)[0] as string;
    expect(() =>
      git(repo.workDir, ['merge-base', '--is-ancestor', branch, 'main']),
    ).not.toThrow();
  });

  it('puts the release branch back when the merge deletes it', () => {
    // GitHub deletes the head branch on merge in this repository, and the head
    // branch here is the release record. Losing it would mean a release with
    // no remote trace of what it was built from.
    repo = setupRepo();
    runBump(repo, ['--level', 'minor']);

    const branch = releaseBranches(repo.workDir)[0] as string;
    expect(remoteReleaseBranches(repo.originDir)).toEqual([branch]);
  });

  it('does not bump again on a retry after a partial failure', () => {
    // The scenario this file exists for. iOS shipped, Android failed, and the
    // operator re-runs the entry point to rebuild Android. Refrain must ship
    // one version to both stores, not 1.1.0 to one and 1.2.0 to the other.
    // The merge commit is what makes this hard: HEAD's own subject is
    // "Merge pull request #...", so the guard has to look behind it.
    repo = setupRepo();

    const first = runBump(repo, ['--level', 'minor']);
    expect(first.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');

    const second = runBump(repo, ['--level', 'minor']);

    expect(second.status).toBe(0);
    expect(second.output).toMatch(/Already at 1\.1\.0/);
    expect(readVersions(repo.workDir)).toEqual({ app: '1.1.0', pkg: '1.1.0' });
    expect(bumpCommitCount(repo.workDir)).toBe(1);
    expect(releaseBranches(repo.workDir)).toHaveLength(1);
  });

  it('is not fooled by a different bump level on the retry', () => {
    // -Patch on the retry and the default minor on the first run should still
    // resolve to "already bumped, skip" rather than stacking a second bump at
    // the differing level.
    repo = setupRepo();

    runBump(repo, ['--level', 'minor']);
    const second = runBump(repo, ['--level', 'patch']);

    expect(second.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');
    expect(bumpCommitCount(repo.workDir)).toBe(1);
  });

  it('bumps again once real work lands on top of a skipped bump', () => {
    // The gate must not be permanently sticky: once something new merges to
    // main, the next release has something new to release and should bump.
    repo = setupRepo();

    runBump(repo, ['--level', 'minor']);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');

    writeFile(repo.workDir, 'readme.md', 'unrelated change\n');
    git(repo.workDir, ['add', '-A']);
    git(repo.workDir, ['commit', '-q', '-m', 'docs: add a readme']);
    git(repo.workDir, ['push', '-q', 'origin', 'main']);

    const result = runBump(repo, ['--level', 'minor']);

    expect(result.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.2.0');
    expect(bumpCommitCount(repo.workDir)).toBe(2);
  });

  describe('when the pull request will not land', () => {
    it('stops the release rather than building an unreleased version', () => {
      repo = setupRepo();

      const result = runBump(repo, ['--level', 'minor'], {
        FAKE_GH_MERGE_FAILS: '1',
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('did not merge');
    });

    it('rolls the bump back, so the next run is not wedged', () => {
      // A local-only bump commit left behind is the exact failure this whole
      // redesign removes: main would have diverged from the remote and every
      // later run would refuse to start.
      repo = setupRepo();

      runBump(repo, ['--level', 'minor'], { FAKE_GH_MERGE_FAILS: '1' });

      expect(readVersions(repo.workDir)).toEqual({
        app: '1.0.0',
        pkg: '1.0.0',
      });
      expect(
        git(repo.workDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      ).toBe('main');
      expect(git(repo.workDir, ['rev-parse', 'main']).trim()).toBe(
        git(repo.workDir, ['rev-parse', 'origin/main']).trim(),
      );
      expect(releaseBranches(repo.workDir)).toEqual([]);
      expect(remoteReleaseBranches(repo.originDir)).toEqual([]);
    });

    it('rolls back a pull request that could not even be opened', () => {
      repo = setupRepo();

      const result = runBump(repo, ['--level', 'minor'], {
        FAKE_GH_CREATE_FAILS: '1',
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('Could not open the pull request');
      expect(releaseBranches(repo.workDir)).toEqual([]);
      expect(remoteReleaseBranches(repo.originDir)).toEqual([]);
    });

    it('leaves the next run free to bump the same version again', () => {
      // The rollback is only worth anything if the retry actually works.
      repo = setupRepo();
      runBump(repo, ['--level', 'minor'], { FAKE_GH_MERGE_FAILS: '1' });

      const retry = runBump(repo, ['--level', 'minor']);

      expect(retry.status).toBe(0);
      expect(readVersions(repo.workDir).app).toBe('1.1.0');
    });
  });

  it('refuses without a GitHub CLI to open the pull request with', () => {
    // Checked before the branch is cut: a missing gh discovered after the bump
    // commit exists means rolling back a commit that never had to be written.
    repo = setupRepo();

    const result = runBump(repo, ['--level', 'minor'], {
      FAKE_GH_UNAVAILABLE: '1',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('GitHub CLI (gh) is not available');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
    expect(releaseBranches(repo.workDir)).toEqual([]);
  });

  it('refuses a dirty working tree', () => {
    repo = setupRepo();
    writeFile(repo.workDir, 'app.json', `${APP_JSON('1.0.0')}\n`);

    const result = runBump(repo, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('Tracked files have been modified');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });

  it('refuses to run anywhere but the base branch', () => {
    repo = setupRepo();
    git(repo.workDir, ['checkout', '-q', '-b', 'feature/x']);

    const result = runBump(repo, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('Version bump only runs from main');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });

  it('refuses when main has diverged from origin/main', () => {
    repo = setupRepo();
    git(repo.workDir, [
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'local-only commit',
    ]);

    const result = runBump(repo, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('is not in sync with');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });

  it('refuses when the release branch it wants already exists', () => {
    // Simulates a previous release that failed partway through, after cutting
    // the branch but before cleaning it up.
    repo = setupRepo();
    const stamp = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const name =
      `release/${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}` +
      `-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
    git(repo.workDir, ['branch', name]);

    const result = runBump(repo, ['--level', 'minor', '--branch', name]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('already exists');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });
});
