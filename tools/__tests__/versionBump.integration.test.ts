/**
 * End-to-end proof for `tools/version-bump.mjs`'s git side effects: the
 * branch-cut-commit-merge-push sequence, its refusals, and — the property
 * that actually matters here — that running the deploy scripts for iOS and
 * then Android in the same sitting bumps the version exactly once.
 *
 * `tools/__tests__/versionBump.test.ts` covers the pure arithmetic and text
 * editing in isolation. None of that proves the tool behaves correctly
 * against real git, and the double-bump property specifically can only be
 * observed by actually running the CLI twice against a real repository and
 * checking what landed. So this spawns the real tool as a child process
 * against a throwaway repo with a local bare "origin", the same way a
 * developer's machine and the real `origin` relate to each other.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOL_PATH = join(__dirname, '..', 'version-bump.mjs');

const APP_JSON = (version: string) =>
  `{\n  "expo": {\n    "name": "Refrain",\n    "version": "${version}"\n  }\n}\n`;
const PACKAGE_JSON = (version: string) =>
  `{\n  "name": "refrain",\n  "version": "${version}",\n  "private": true\n}\n`;

interface Repo {
  root: string;
  workDir: string;
  originDir: string;
}

/** Runs git, throwing with its output if it refuses. */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/** Runs the tool itself, tolerating a non-zero exit (refusals are the point of half these tests). */
function runBump(
  workDir: string,
  args: string[],
): { status: number; output: string } {
  try {
    const output = execFileSync('node', [TOOL_PATH, 'bump', ...args], {
      cwd: workDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

/**
 * A throwaway repo with a local bare "origin" and a "work" clone on `main`,
 * seeded with `app.json` / `package.json` at `1.0.0` and pushed. Mirrors a
 * developer's machine talking to the real GitHub remote closely enough for
 * `version-bump.mjs`'s fetch-and-compare check to behave the same way.
 */
function setupRepo(): Repo {
  const root = mkdtempSync(join(tmpdir(), 'refrain-version-bump-'));
  const originDir = join(root, 'origin');
  const workDir = join(root, 'work');
  mkdirSync(originDir);
  mkdirSync(workDir);

  git(originDir, ['init', '--bare', '-q']);

  git(workDir, ['init', '-q']);
  git(workDir, ['config', 'user.email', 'test@refrain.local']);
  git(workDir, ['config', 'user.name', 'Refrain Test']);
  git(workDir, ['remote', 'add', 'origin', originDir]);

  writeFileSync(join(workDir, 'app.json'), APP_JSON('1.0.0'), 'utf8');
  writeFileSync(join(workDir, 'package.json'), PACKAGE_JSON('1.0.0'), 'utf8');
  git(workDir, ['add', '-A']);
  git(workDir, ['commit', '-q', '-m', 'init']);
  git(workDir, ['branch', '-M', 'main']);
  git(workDir, ['push', '-q', '-u', 'origin', 'main']);

  return { root, workDir, originDir };
}

function readVersions(workDir: string): { app: string; pkg: string } {
  const app = JSON.parse(readFileSync(join(workDir, 'app.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf8'));
  return { app: app.expo.version, pkg: pkg.version };
}

function bumpCommitCount(workDir: string): number {
  const log = git(workDir, ['log', '--format=%s']);
  return log
    .split(/\r?\n/)
    .filter((line) => line.startsWith('chore(release): bump version to'))
    .length;
}

describe('version-bump.mjs (integration)', () => {
  let repo: Repo;

  afterEach(() => {
    rmSync(repo.root, { recursive: true, force: true });
  });

  it('bumps app.json and package.json together and pushes main', () => {
    repo = setupRepo();

    const result = runBump(repo.workDir, ['--level', 'minor']);

    expect(result.status).toBe(0);
    expect(readVersions(repo.workDir)).toEqual({ app: '1.1.0', pkg: '1.1.0' });
    expect(bumpCommitCount(repo.workDir)).toBe(1);
    // Pushed: local main and origin/main must point at the same commit.
    const local = git(repo.workDir, ['rev-parse', 'main']).trim();
    const upstream = git(repo.workDir, ['rev-parse', 'origin/main']).trim();
    expect(local).toBe(upstream);
    // The throwaway branch does not linger.
    expect(git(repo.workDir, ['branch', '--list', 'version-bump/1.1.0'])).toBe(
      '',
    );
  });

  it('does not bump twice when iOS and Android deploy back to back', () => {
    // The scenario this whole test file exists for: BuildAndDeployiOS.cmd
    // bumps, then BuildAndDeployAndroidStore.cmd runs its own bump call a
    // moment later against the same checkout. Refrain must ship the same
    // version to both stores, not 1.1.0 to one and 1.2.0 to the other.
    repo = setupRepo();

    const first = runBump(repo.workDir, ['--level', 'minor']);
    expect(first.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');

    const second = runBump(repo.workDir, ['--level', 'minor']);

    expect(second.status).toBe(0);
    expect(second.output).toMatch(/Already at 1\.1\.0.*Nothing to bump/);
    expect(readVersions(repo.workDir)).toEqual({ app: '1.1.0', pkg: '1.1.0' });
    expect(bumpCommitCount(repo.workDir)).toBe(1);
  });

  it('is not fooled by a different bump level on the second call', () => {
    // -Patch on one platform and the default minor on the other should still
    // resolve to "already bumped, skip" rather than stacking a second bump on
    // top at the differing level.
    repo = setupRepo();

    runBump(repo.workDir, ['--level', 'minor']);
    const second = runBump(repo.workDir, ['--level', 'patch']);

    expect(second.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');
    expect(bumpCommitCount(repo.workDir)).toBe(1);
  });

  it('bumps again once a real commit lands on top of a skipped bump', () => {
    // The gate must not be permanently sticky: once something new merges to
    // main, the next deploy has something new to release and should bump.
    repo = setupRepo();

    runBump(repo.workDir, ['--level', 'minor']);
    expect(readVersions(repo.workDir).app).toBe('1.1.0');

    writeFileSync(
      join(repo.workDir, 'readme.md'),
      'unrelated change\n',
      'utf8',
    );
    git(repo.workDir, ['add', '-A']);
    git(repo.workDir, ['commit', '-q', '-m', 'docs: add a readme']);
    git(repo.workDir, ['push', '-q', 'origin', 'main']);

    const result = runBump(repo.workDir, ['--level', 'minor']);

    expect(result.status).toBe(0);
    expect(readVersions(repo.workDir).app).toBe('1.2.0');
    expect(bumpCommitCount(repo.workDir)).toBe(2);
  });

  it('refuses a dirty working tree', () => {
    repo = setupRepo();
    writeFileSync(
      join(repo.workDir, 'app.json'),
      APP_JSON('1.0.0') + '\n',
      'utf8',
    );

    const result = runBump(repo.workDir, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('Tracked files have been modified');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });

  it('refuses to run anywhere but the base branch', () => {
    repo = setupRepo();
    git(repo.workDir, ['checkout', '-q', '-b', 'feature/x']);

    const result = runBump(repo.workDir, ['--level', 'minor']);

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

    const result = runBump(repo.workDir, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('is not in sync with');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });

  it('refuses when a same-named bump branch already exists', () => {
    // Simulates a previous run that failed partway through, after cutting the
    // branch but before cleaning it up.
    repo = setupRepo();
    git(repo.workDir, ['branch', 'version-bump/1.1.0']);

    const result = runBump(repo.workDir, ['--level', 'minor']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('version-bump/1.1.0 already exists');
    expect(readVersions(repo.workDir).app).toBe('1.0.0');
  });
});
