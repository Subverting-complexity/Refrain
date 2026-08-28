/**
 * A throwaway git repository for the release tooling's integration tests.
 *
 * Not a test file itself — Jest's `testMatch` only picks up `*.test.ts`, so
 * this sits beside the two suites that share it.
 *
 * The shape it builds is a local bare "origin" and a "work" clone on `main`,
 * which is close enough to a developer's machine talking to GitHub that the
 * tooling's fetch-and-compare checks, its pushes, and its remote-tracking ref
 * lookups all behave the way they do in a real release. Everything the release
 * tools do to git is irreversible somewhere (a deleted branch, a pushed tag),
 * so these suites drive the real CLIs as child processes rather than mocking
 * git and hoping.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Repo {
  root: string;
  workDir: string;
  originDir: string;
}

/** Runs git, throwing with its output if it refuses. */
export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/** What a tool invocation did, including a non-zero exit, which is often the point. */
export interface ToolRun {
  status: number;
  output: string;
}

/**
 * Runs one of the release tools as a child process.
 *
 * A child rather than an import: these tools decide their own exit codes and
 * write their own console output, and both are part of what the deploy script
 * reads. `env` is merged over the parent's, which is how the fake `gh` gets
 * onto PATH.
 */
export function runTool(
  tool: string,
  workDir: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): ToolRun {
  try {
    // process.execPath rather than 'node': the PATH handed to the child is
    // sometimes the thing under test, and a tool that could not be spawned at
    // all would look exactly like a tool that refused.
    const output = execFileSync(
      process.execPath,
      [join(__dirname, '..', tool), ...args],
      {
        cwd: workDir,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, ...env },
      },
    );
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

export const APP_JSON = (version: string) =>
  `{\n  "expo": {\n    "name": "Refrain",\n    "version": "${version}"\n  }\n}\n`;
export const PACKAGE_JSON = (version: string) =>
  `{\n  "name": "refrain",\n  "version": "${version}",\n  "private": true\n}\n`;

/**
 * A bare origin and a work clone on `main`, seeded at `version` and pushed.
 *
 * `extraFiles` is how the listing tests get a `fastlane/` tree to diff. The
 * `tools/` directory is created because that is where the run state lives, and
 * a release that could not record itself would fail for the wrong reason.
 */
export function setupRepo(
  version = '1.0.0',
  extraFiles: Record<string, string> = {},
): Repo {
  const root = mkdtempSync(join(tmpdir(), 'refrain-release-'));
  const originDir = join(root, 'origin');
  const workDir = join(root, 'work');
  mkdirSync(originDir);
  mkdirSync(workDir);

  git(originDir, ['init', '--bare', '-q']);

  git(workDir, ['init', '-q']);
  git(workDir, ['config', 'user.email', 'test@refrain.local']);
  git(workDir, ['config', 'user.name', 'Refrain Test']);
  git(workDir, ['remote', 'add', 'origin', originDir]);

  writeFile(workDir, 'app.json', APP_JSON(version));
  writeFile(workDir, 'package.json', PACKAGE_JSON(version));
  mkdirSync(join(workDir, 'tools'), { recursive: true });
  writeFile(workDir, 'tools/.keep', '');
  for (const [path, contents] of Object.entries(extraFiles)) {
    writeFile(workDir, path, contents);
  }

  git(workDir, ['add', '-A']);
  git(workDir, ['commit', '-q', '-m', 'init']);
  git(workDir, ['branch', '-M', 'main']);
  git(workDir, ['push', '-q', '-u', 'origin', 'main']);

  return { root, workDir, originDir };
}

/** Writes a file, creating whatever directories it needs. */
export function writeFile(
  workDir: string,
  path: string,
  contents: string,
): void {
  const full = join(workDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, 'utf8');
}

/** Commits every change in the work tree and pushes it, as a merged PR would. */
export function commitAll(workDir: string, message: string): void {
  git(workDir, ['add', '-A']);
  git(workDir, ['commit', '-q', '-m', message]);
  git(workDir, ['push', '-q', 'origin', 'main']);
}

/** Local branch names under `release/`. */
export function releaseBranches(workDir: string): string[] {
  return git(workDir, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads/release/',
  ])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Tag names under `release/`, in name order. */
export function releaseTags(workDir: string): string[] {
  return git(workDir, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/tags/release/',
  ])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

/** Branch names under `release/` that reached the bare origin. */
export function remoteReleaseBranches(originDir: string): string[] {
  return git(originDir, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads/release/',
  ])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
