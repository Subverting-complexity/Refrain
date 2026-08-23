/**
 * The git primitives shared by `tools/release-branch.mjs` and
 * `tools/version-bump.mjs`.
 *
 * Both tools used to carry their own copy of every function here. The point of
 * the tests is the behaviour a caller relies on and could not see for itself:
 * that a non-zero exit becomes a `GitError` carrying git's own output unless
 * the caller opted out, that arguments reach git without going through a
 * shell, and that the dirty-tree check ignores untracked files.
 */

jest.mock('../lib/exec.mjs', () => ({ capture: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { capture } = require('../lib/exec.mjs');
const {
  findRepoRoot,
  git,
  GitError,
  gitLine,
  modifiedTrackedFiles,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../lib/git.mjs');

type CaptureResult = { code: number; output: string; timedOut?: boolean };

function nextCapture(result: CaptureResult) {
  (capture as jest.Mock).mockReturnValueOnce(result);
}

function lastCall() {
  return (capture as jest.Mock).mock.calls.at(-1);
}

beforeEach(() => {
  (capture as jest.Mock).mockReset();
});

describe('git', () => {
  it('returns the captured result on success', () => {
    nextCapture({ code: 0, output: 'abc123\n' });
    expect(git('/repo', ['rev-parse', 'HEAD'])).toEqual({
      code: 0,
      output: 'abc123\n',
    });
  });

  it('spawns git directly rather than through a shell', () => {
    nextCapture({ code: 0, output: '' });
    git('/repo', ['tag', '-a', 'release/ios/x', '-F', 'msg.txt']);

    const [command, args, options] = lastCall();
    expect(command).toBe('git');
    expect(args).toEqual(['tag', '-a', 'release/ios/x', '-F', 'msg.txt']);
    expect(options).toMatchObject({ cwd: '/repo', quiet: true, shell: false });
  });

  it('throws a GitError naming the command and carrying git output', () => {
    nextCapture({ code: 128, output: 'fatal: not a valid ref\n' });
    expect(() => git('/repo', ['rev-parse', 'nope'])).toThrow(GitError);

    nextCapture({ code: 128, output: 'fatal: not a valid ref\n' });
    expect(() => git('/repo', ['rev-parse', 'nope'])).toThrow(
      /git rev-parse nope failed \(exit 128\)[\s\S]*fatal: not a valid ref/,
    );
  });

  it('hands a failure back to the caller when allowFailure is set', () => {
    nextCapture({ code: 1, output: 'rejected\n' });
    expect(
      git('/repo', ['push', 'origin', 'main'], { allowFailure: true }),
    ).toEqual({ code: 1, output: 'rejected\n' });
  });
});

describe('gitLine', () => {
  it('trims the trailing newline git puts on a one-line answer', () => {
    nextCapture({ code: 0, output: '  abc123  \n' });
    expect(gitLine('/repo', ['rev-parse', 'HEAD'])).toBe('abc123');
  });

  it('still throws on failure, since there is no line to return', () => {
    nextCapture({ code: 1, output: 'boom\n' });
    expect(() => gitLine('/repo', ['rev-parse', 'HEAD'])).toThrow(GitError);
  });
});

describe('findRepoRoot', () => {
  it('returns the toplevel path', () => {
    nextCapture({ code: 0, output: '/repo\n' });
    expect(findRepoRoot('there is nothing to do.')).toBe('/repo');
  });

  it('explains what the caller cannot do when there is no repository', () => {
    nextCapture({ code: 128, output: 'fatal: not a git repository\n' });
    expect(() => findRepoRoot('there is no version to bump.')).toThrow(
      'Not inside a git repository, so there is no version to bump.',
    );
  });
});

describe('modifiedTrackedFiles', () => {
  it('asks git to leave untracked files out', () => {
    nextCapture({ code: 0, output: '' });
    modifiedTrackedFiles('/repo');
    expect(lastCall()[1]).toEqual([
      'status',
      '--porcelain',
      '--untracked-files=no',
    ]);
  });

  it('is empty for a clean tree', () => {
    nextCapture({ code: 0, output: '\n' });
    expect(modifiedTrackedFiles('/repo')).toBe('');
  });

  it('returns the porcelain lines when tracked files have changed', () => {
    nextCapture({ code: 0, output: ' M app.json\n M package.json\n' });
    expect(modifiedTrackedFiles('/repo')).toBe(' M app.json\n M package.json');
  });
});
