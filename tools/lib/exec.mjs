/**
 * Child-process helpers for the release tooling.
 *
 * The only genuinely awkward part of shelling out portably is Windows: since
 * the CVE-2024-27980 fix, Node refuses to spawn a `.cmd` shim (which is what
 * `npm` and `npx` are on Windows) unless `shell` is set. So on Windows we go
 * through the shell and quote the command line ourselves — the command as
 * well as its arguments, since `cmd` splits both the same way; on POSIX we
 * spawn directly and let the kernel do the argument passing.
 */

import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

/**
 * Stops Node printing DEP0190 over the top of a release.
 *
 * Node warns once per process that arguments passed with `shell: true` are
 * "not escaped, only concatenated". That is a fair warning about the general
 * case and not about this one: {@link quoteForShell} quotes both the command
 * and every argument before they reach `cmd`, which is the whole reason that
 * function exists. Shelling out is not optional either — since the
 * CVE-2024-27980 fix, Node will not spawn the `.cmd` shims that `bundle` and
 * `gh` are on Windows without it.
 *
 * So the warning is noise an operator cannot act on, printed in the middle of
 * a release. It is filtered by name and text rather than by turning warnings
 * off, so anything else Node has to say still gets through. The default
 * listener has to be removed first: adding a listener does not replace it.
 *
 * Called by the tool entry points rather than on import, so importing a
 * module for a unit test does not change the test runner's warning behaviour.
 */
export function quietShellDeprecation() {
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    const isShellArgsWarning =
      warning.name === 'DeprecationWarning' && /shell option true/.test(warning.message);
    if (isShellArgsWarning) return;
    process.stderr.write(`${warning.name}: ${warning.message}\n`);
  });
}

/**
 * Wraps an argument in double quotes when `cmd.exe` would otherwise split
 * or interpret it. `%` and `!` are included because `cmd` expands `%VAR%`
 * (and `!VAR!` under delayed expansion) *before* the child process sees
 * the command line, and Node sets `windowsVerbatimArguments` when
 * `shell: true`, so nothing downstream protects them.
 *
 * This is deliberately not a general-purpose `cmd.exe` escaper. Quoting
 * alone cannot protect every metacharacter — `cmd` counts quotes to decide
 * what is quoted, so an embedded `"` needs `^` escaping outside quotes to
 * be fully safe. Every argument this tooling passes is a fixed literal
 * (`tag`, `-a`, a branch name, `-F`, a temp file path), so the quoting here
 * covers the arguments that exist rather than every argument imaginable.
 *
 * Exported for unit testing: this is the one piece whose behaviour cannot
 * be exercised on the platform the tests run on.
 *
 * @param {string} arg
 */
export function quoteForShell(arg) {
  // An empty argument has nothing in it to protect and is the one that most
  // needs protecting: unquoted it is not a short argument, it is *no*
  // argument, and every argument after it shifts down one.
  if (arg === '') return '""';
  if (!/[\s"^&|<>()%!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * A command and its arguments, as `spawnSync` should be handed them on this
 * platform.
 *
 * The command needs the same protection its arguments do, and for the
 * identical reason: under `shell: true` Node sets `windowsVerbatimArguments`,
 * so `cmd` receives the whole line as typed and splits the command at the
 * first space. On POSIX both go through untouched: there is no shell, and the
 * kernel takes the argument vector as given.
 *
 * The platform is a parameter rather than a module read so this is testable
 * where this tooling actually runs its tests, which is the same reason
 * {@link quoteForShell} is exported at all.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {boolean} [windows]
 * @returns {{ command: string, args: string[] }}
 */
export function shellCommandLine(command, args, windows = isWindows) {
  if (!windows) return { command, args };
  return { command: quoteForShell(command), args: args.map(quoteForShell) };
}

/**
 * Runs a command with its output inherited by this process, and returns
 * its exit code. A command that cannot be spawned at all (missing
 * binary, for example) reports 127, matching shell convention.
 *
 * @param {string} command
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} [options]
 * @returns {number} exit code
 */
export function run(command, args = [], options = {}) {
  const line = shellCommandLine(command, args);
  const result = spawnSync(line.command, line.args, {
    stdio: 'inherit',
    shell: isWindows,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    timeout: options.timeoutMs,
  });

  if (result.error) {
    // `spawnSync` reports a timeout as an errno-style code on the error, which
    // is a Node extension the base `Error` type does not carry.
    const error = /** @type {NodeJS.ErrnoException} */ (result.error);
    if (error.code === 'ETIMEDOUT') {
      process.stdout.write(`   ${timedOutMessage(command, options.timeoutMs)}\n`);
      return 1;
    }
    process.stdout.write(`   Could not run ${command}: ${error.message}\n`);
    return 127;
  }
  if (result.signal) {
    process.stdout.write(`   ${command} terminated by signal ${result.signal}\n`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * Runs a command, echoes its combined output, and returns that output
 * alongside the exit code. Use this only where a caller has to reason about
 * *why* a command failed; `run` is the default.
 *
 * Because the output is buffered rather than streamed, nothing appears
 * until the command exits — so callers must announce what they are running
 * first, and must pass a `timeout` for anything that touches the network.
 *
 * `quiet` suppresses the echo and returns the output to the caller alone. It
 * is for plumbing rather than narration: the release-branch and
 * version-bump tools ask git for a SHA and a ref list several times per run,
 * and a echo of each would bury the two lines the operator actually needs. A
 * command that could not be spawned still reports itself, quiet or not,
 * because a missing binary is never something the caller wanted hidden.
 *
 * `shell` overrides the platform default. `git` is a real executable, so it
 * passes `shell: false` and is spawned directly.
 *
 * @param {string} command
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number, quiet?: boolean, shell?: boolean }} [options]
 * @returns {{ code: number, output: string, timedOut: boolean }}
 */
export function capture(command, args = [], options = {}) {
  const useShell = options.shell ?? isWindows;
  const line = shellCommandLine(command, args, useShell);
  const result = spawnSync(line.command, line.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    encoding: 'utf8',
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    timeout: options.timeoutMs,
    // The default 1 MB would truncate the very output a caller captured
    // this command in order to inspect.
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = combinedOutput(result);
  if (result.error) return describeSpawnFailure(command, result, output, options.timeoutMs);

  if (!options.quiet) echo(output);
  return { code: result.signal ? 1 : (result.status ?? 1), output, timedOut: false };
}

/**
 * Concatenates a captured child's streams. Note this is concatenation and
 * not interleaving: `spawnSync` hands back two finished buffers, so stderr
 * follows all of stdout rather than appearing where it was written. Fine
 * for pattern-matching the result, worth knowing when reading it.
 *
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 */
function combinedOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/**
 * Writes captured output through, newline-terminated.
 *
 * @param {string} output
 */
function echo(output) {
  if (output.length === 0) return;
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}

/**
 * The single wording for "this command was killed for taking too long".
 * Shared by {@link run} and {@link capture} because both can now be given a
 * timeout, and an operator reading one line should not have to work out
 * whether the other means the same thing.
 *
 * @param {string} command
 * @param {number | undefined} timeoutMs
 */
function timedOutMessage(command, timeoutMs) {
  return `${command} exceeded its ${timeoutMs} ms timeout`;
}

/**
 * Turns a `spawnSync` error into a capture result. A timeout surfaces as
 * `ETIMEDOUT` with whatever the command had already written still
 * available, and is reported distinctly because a caller may treat "never
 * answered" differently from "would not start".
 *
 * @param {string} command
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 * @param {string} output
 * @param {number | undefined} timeoutMs
 * @returns {{ code: number, output: string, timedOut: boolean }}
 */
function describeSpawnFailure(command, result, output, timeoutMs) {
  // `spawnSync` reports a timeout as an errno-style code on the error, which
  // is a Node extension the base `Error` type does not carry.
  const error = /** @type {NodeJS.ErrnoException | undefined} */ (result.error);
  const timedOut = error?.code === 'ETIMEDOUT';
  const message = timedOut
    ? timedOutMessage(command, timeoutMs)
    : `Could not run ${command}: ${error?.message}`;

  process.stdout.write(`   ${message}\n`);
  return { code: timedOut ? 1 : 127, output: `${output}${message}`, timedOut };
}
