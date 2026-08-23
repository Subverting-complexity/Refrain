/**
 * Semver arithmetic for the release version bump, and the surgical text edit
 * that lands it in `app.json` / `package.json`.
 *
 * `replaceVersionField` is the one worth being suspicious of: it edits raw
 * file text rather than parsing and re-serialising JSON, specifically so a
 * bump cannot change anything Prettier would otherwise flag. That trade only
 * holds if it refuses a file shaped differently than expected rather than
 * guessing, so most of its cases are about refusing.
 */

import {
  bumpCommitMessage,
  bumpCommitVersion,
  bumpVersion,
  formatSemver,
  LEVELS,
  parseSemver,
  replaceVersionField,
  VersionError,
} from '../lib/version-bump.mjs';

describe('parseSemver', () => {
  it('reads a plain major.minor.patch version', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseSemver(' 1.2.3 ')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('refuses a pre-release suffix rather than dropping it', () => {
    expect(() => parseSemver('1.2.3-beta.1')).toThrow(VersionError);
  });

  it('refuses build metadata rather than dropping it', () => {
    expect(() => parseSemver('1.2.3+build.5')).toThrow(VersionError);
  });

  it('refuses anything shorter or longer than three parts', () => {
    expect(() => parseSemver('1.2')).toThrow(VersionError);
    expect(() => parseSemver('1.2.3.4')).toThrow(VersionError);
  });
});

describe('formatSemver', () => {
  it('joins the three parts back together', () => {
    expect(formatSemver({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
  });
});

describe('bumpVersion', () => {
  it('bumps the patch and leaves the rest alone', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('bumps the minor and zeroes the patch', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps the major and zeroes minor and patch', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('accepts exactly the three levels it advertises', () => {
    expect(LEVELS).toEqual(['patch', 'minor', 'major']);
  });

  it('refuses a level it does not know', () => {
    // @ts-expect-error deliberately wrong level
    expect(() => bumpVersion('1.2.3', 'skip')).toThrow(VersionError);
  });

  it('refuses an unparseable version before touching the level', () => {
    expect(() => bumpVersion('not-a-version', 'minor')).toThrow(VersionError);
  });
});

describe('replaceVersionField', () => {
  it('replaces the one version field and leaves everything else untouched', () => {
    const original =
      '{\n  "name": "refrain",\n  "version": "1.0.0",\n  "private": true\n}\n';
    expect(replaceVersionField(original, '1.1.0')).toBe(
      '{\n  "name": "refrain",\n  "version": "1.1.0",\n  "private": true\n}\n',
    );
  });

  it('preserves indentation and trailing newline exactly', () => {
    const original = '{"version": "1.0.0"}\n';
    expect(replaceVersionField(original, '2.0.0')).toBe(
      '{"version": "2.0.0"}\n',
    );
  });

  it('refuses a file with no version field', () => {
    expect(() => replaceVersionField('{ "name": "refrain" }', '1.1.0')).toThrow(
      VersionError,
    );
  });

  it('refuses a file with more than one version field, rather than guessing', () => {
    const withTwo = '{ "version": "1.0.0", "nested": { "version": "9.9.9" } }';
    expect(() => replaceVersionField(withTwo, '1.1.0')).toThrow(VersionError);
  });

  it('tolerates the field appearing with different spacing', () => {
    expect(replaceVersionField('{"version":"1.0.0"}', '1.1.0')).toBe(
      '{"version": "1.1.0"}',
    );
  });
});

describe('bumpCommitMessage / bumpCommitVersion', () => {
  it('round-trips: what one writes, the other reads back', () => {
    expect(bumpCommitVersion(bumpCommitMessage('1.3.0'))).toBe('1.3.0');
  });

  it('is what stops a second deploy in the same sitting from bumping again', () => {
    // BuildAndDeployiOS.cmd and BuildAndDeployAndroidStore.cmd each call the
    // bump independently. This is the check tools/version-bump.mjs makes
    // against HEAD's own commit subject before doing anything else -- if it
    // stopped recognising its own commit, the second platform would bump a
    // second time and iOS and Android would ship different versions.
    expect(bumpCommitVersion('chore(release): bump version to 2.0.0')).toBe(
      '2.0.0',
    );
  });

  it('does not mistake an unrelated commit for one of its own', () => {
    expect(
      bumpCommitVersion('fix: correct the marker snap tolerance'),
    ).toBeNull();
    expect(
      bumpCommitVersion('chore(release): bump version to main'),
    ).toBeNull();
    expect(bumpCommitVersion('')).toBeNull();
  });

  it('is not fooled by a message that merely mentions a bump in passing', () => {
    // Anchored, not just matched: a commit that talks about the bump tool
    // must not be read as the bump commit itself.
    expect(
      bumpCommitVersion(
        'docs: explain chore(release): bump version to 1.0.0 in the README',
      ),
    ).toBeNull();
  });
});
