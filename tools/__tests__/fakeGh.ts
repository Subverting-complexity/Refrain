/**
 * A stand-in for the GitHub CLI, so the version bump's pull-request path can
 * be tested without GitHub.
 *
 * Not a test file itself — Jest's `testMatch` only picks up `*.test.ts`.
 *
 * It emulates the three calls `tools/version-bump.mjs` makes and, for the
 * merge, does the thing GitHub would actually do to the remote: a merge commit
 * on `main`, followed by deleting the head branch. That deletion is not
 * incidental. This repository has GitHub's "automatically delete head branches"
 * turned on, so merging the pull request removes the release branch — the
 * branch whose whole job is to record what the release was built from. A fake
 * that politely left it alone would test a world we do not live in.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const GH_SCRIPT = `
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const run = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const [command, sub, target] = process.argv.slice(2);

// Stands in for gh not being installed at all. The tooling only ever learns
// that from a non-zero \`gh --version\`, and an absent binary reports the same
// way as a broken one, so this covers the branch without having to remove git
// from PATH alongside it.
if (process.env.FAKE_GH_UNAVAILABLE === '1') {
  process.stderr.write('gh is not available (fake)\\n');
  process.exit(1);
}

if (command === '--version') {
  process.stdout.write('gh version 0.0.0 (fake)\\n');
  process.exit(0);
}
if (command === 'auth' && sub === 'status') process.exit(0);
if (command === 'pr' && sub === 'create') {
  if (process.env.FAKE_GH_CREATE_FAILS === '1') {
    process.stderr.write('pull request create failed (fake)\\n');
    process.exit(1);
  }
  process.stdout.write('https://github.com/fake/fake/pull/1\\n');
  process.exit(0);
}
if (command === 'pr' && sub === 'merge') {
  if (process.env.FAKE_GH_MERGE_FAILS === '1') {
    process.stderr.write('merge refused (fake)\\n');
    process.exit(1);
  }
  const origin = run(process.cwd(), ['remote', 'get-url', 'origin']).trim();
  const scratch = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  try {
    run(process.cwd(), ['clone', '-q', origin, scratch]);
    run(scratch, ['config', 'user.email', 'gh@fake.local']);
    run(scratch, ['config', 'user.name', 'Fake GH']);
    run(scratch, ['checkout', '-q', 'main']);
    run(scratch, [
      'merge', '--no-ff', '-q',
      '-m', 'Merge pull request #1 from fake/' + target,
      'origin/' + target,
    ]);
    run(scratch, ['push', '-q', 'origin', 'main']);
    // What "automatically delete head branches" does to the release branch.
    run(scratch, ['push', '-q', 'origin', '--delete', target]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.exit(0);
}

process.stderr.write('fake gh does not implement: ' + process.argv.slice(2).join(' ') + '\\n');
process.exit(1);
`;

/**
 * Writes the fake into a directory and returns an environment that finds it
 * before the real `gh`.
 *
 * Two shims around one Node script, because the tooling reaches `gh` through a
 * shell on Windows (which resolves `gh.cmd` via PATHEXT) and directly on
 * POSIX (which needs an executable with a shebang). Writing both and letting
 * each platform pick keeps this one helper working in CI and on the machine
 * releases actually run from.
 */
export function installFakeGh(
  root: string,
  extraEnv: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const binDir = join(root, 'fakebin');
  mkdirSync(binDir, { recursive: true });

  writeFileSync(join(binDir, 'gh.js'), GH_SCRIPT, 'utf8');
  writeFileSync(
    join(binDir, 'gh'),
    `#!/bin/sh\nexec node "$(dirname "$0")/gh.js" "$@"\n`,
    'utf8',
  );
  chmodSync(join(binDir, 'gh'), 0o755);
  writeFileSync(
    join(binDir, 'gh.cmd'),
    `@echo off\r\nnode "%~dp0gh.js" %*\r\n`,
    'utf8',
  );

  return { ...pathEnv(binDir), ...extraEnv };
}

/**
 * `PATH` with `binDir` in front, with any differently-cased copy removed.
 *
 * Windows environment variables are case-insensitive but a JavaScript object's
 * keys are not, so adding `PATH` beside an inherited `Path` leaves the child
 * with two of them and no guarantee which one wins.
 */
function pathEnv(binDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== 'path') continue;
    env[key] = `${binDir}${delimiter}${value}`;
  }
  if (Object.keys(env).length === 0) env.PATH = binDir;
  return env;
}

/** Confirms the fake is reachable the way the tooling will reach it. */
export function fakeGhWorks(env: NodeJS.ProcessEnv): boolean {
  try {
    execFileSync('gh', ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}
