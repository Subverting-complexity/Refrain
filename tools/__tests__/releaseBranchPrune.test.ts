/**
 * The rule that decides whether a release branch may actually be deleted.
 *
 * `selectPrunable` decides which branches are candidates. What happens to a
 * candidate afterwards is the half that can lose a commit: the tags that stand
 * in for a deleted branch have to be on the remote *before* the branch leaves
 * it, or a failed release whose tag never pushed loses its only remote record
 * at the exact moment the branch goes.
 *
 * "Tags" plural is the part this file gained. One release branch carries a tag
 * per platform, plus a retry's second tag on the same platform, so a rule that
 * confirmed one of them and deleted the branch would strand the rest.
 *
 * So the cases below are mostly about refusing to delete. Every git action
 * arrives as a function on the context, which is what lets a test hand this a
 * push that refuses or a ref that resolves to nothing without a repository to
 * set up or a remote to reach.
 */

import {
  retireBranch,
  summarisePrune,
  type PruneContext,
  type PruneOperations,
  type RetireOutcome,
} from '../lib/release-branch-prune.mjs';

const BRANCH = 'release/2026-08-13-1432';
const IOS_TAG = `${BRANCH}-ios-failed`;
const ANDROID_TAG = `${BRANCH}-android-success`;
const UNFINISHED_TAG = `${BRANCH}-unfinished`;

/** Every operation as a spy, with the answers a healthy repository gives. */
function operations(
  overrides: Partial<PruneOperations> = {},
): jest.Mocked<PruneOperations> {
  return {
    resolveCommit: jest.fn((ref: string) =>
      ref.startsWith('refs/heads/')
        ? 'c0ffee1234567890c0ffee1234567890c0ffee12'
        : null,
    ),
    tagExists: jest.fn(() => true),
    pushRef: jest.fn(() => true),
    writeAnnotatedTag: jest.fn(),
    deleteBranch: jest.fn(),
    warn: jest.fn(),
    detail: jest.fn(),
    ok: jest.fn(),
    ...overrides,
  } as jest.Mocked<PruneOperations>;
}

function context(
  ops: PruneOperations,
  overrides: Partial<Omit<PruneContext, 'operations'>> = {},
): PruneContext {
  return {
    remote: 'origin',
    dryRun: false,
    current: 'main',
    unfinished: new Set<string>(),
    tagsByBranch: new Map([[BRANCH, [IOS_TAG]]]),
    operations: ops,
    ...overrides,
  };
}

describe('retireBranch', () => {
  it('deletes a branch once its tag is on the remote', () => {
    const ops = operations();

    expect(retireBranch(context(ops), BRANCH)).toBe('retired');
    expect(ops.pushRef).toHaveBeenCalledWith(`refs/tags/${IOS_TAG}`, {
      dryRun: false,
    });
    expect(ops.deleteBranch).toHaveBeenCalledWith(BRANCH);
  });

  it("confirms every one of a release's tags before deleting the branch", () => {
    // A release carries one tag per platform. Confirming only the first would
    // leave the branch's remaining remote record depending on a push that was
    // never checked.
    const ops = operations();
    const withBoth = context(ops, {
      tagsByBranch: new Map([[BRANCH, [IOS_TAG, ANDROID_TAG]]]),
    });

    expect(retireBranch(withBoth, BRANCH)).toBe('retired');
    expect(ops.pushRef).toHaveBeenCalledWith(`refs/tags/${IOS_TAG}`, {
      dryRun: false,
    });
    expect(ops.pushRef).toHaveBeenCalledWith(`refs/tags/${ANDROID_TAG}`, {
      dryRun: false,
    });
  });

  it('keeps the branch when any one of its tags will not push', () => {
    // Until every tag is on the remote the branch may be the only remote
    // record of part of the release, so deleting it now would be the exact
    // loss the push exists to prevent.
    const ops = operations({
      pushRef: jest.fn((ref: string) => ref !== `refs/tags/${ANDROID_TAG}`),
    });
    const withBoth = context(ops, {
      tagsByBranch: new Map([[BRANCH, [IOS_TAG, ANDROID_TAG]]]),
    });

    expect(retireBranch(withBoth, BRANCH)).toBe('tag-unpushed');
    expect(ops.deleteBranch).not.toHaveBeenCalled();
    expect(ops.warn).toHaveBeenCalledWith(
      expect.stringContaining('is being kept until'),
    );
  });

  it('keeps a branch it was given no tag for', () => {
    // `selectPrunable` only calls a release failed when some platform tagged
    // an outcome, so an empty list means the caller and the rule disagree.
    // Deleting would leave the commit with nothing pinning it.
    const ops = operations();

    expect(
      retireBranch(context(ops, { tagsByBranch: new Map() }), BRANCH),
    ).toBe('unresolved');
    expect(ops.deleteBranch).not.toHaveBeenCalled();
  });

  it('never deletes the checked-out branch', () => {
    const ops = operations();

    expect(retireBranch(context(ops, { current: BRANCH }), BRANCH)).toBe(
      'checked-out',
    );
    expect(ops.deleteBranch).not.toHaveBeenCalled();
    expect(ops.pushRef).not.toHaveBeenCalled();
  });

  it('keeps a branch whose commit it cannot resolve', () => {
    // A branch this cannot tag is a branch it must not remove: with no commit
    // there is nothing to write the standing-in tag at.
    const ops = operations({ resolveCommit: jest.fn(() => null) });

    expect(retireBranch(context(ops), BRANCH)).toBe('unresolved');
    expect(ops.deleteBranch).not.toHaveBeenCalled();
    expect(ops.writeAnnotatedTag).not.toHaveBeenCalled();
  });

  it('falls back to the remote-tracking ref for a branch never fetched locally', () => {
    const ops = operations({
      resolveCommit: jest.fn((ref: string) =>
        ref === `refs/remotes/origin/${BRANCH}` ? 'abc1234' : null,
      ),
    });

    expect(retireBranch(context(ops), BRANCH)).toBe('retired');
    expect(ops.resolveCommit).toHaveBeenNthCalledWith(
      1,
      `refs/heads/${BRANCH}`,
    );
    expect(ops.resolveCommit).toHaveBeenNthCalledWith(
      2,
      `refs/remotes/origin/${BRANCH}`,
    );
  });

  it('tags an unfinished branch before deleting it, never after', () => {
    // The whole safety argument: a failed release's commit is already pinned
    // by its platform tags, but an unfinished one has no tag at all, so if the
    // release was cut from a branch since deleted this ref is the only thing
    // holding the commit.
    const order: string[] = [];
    const ops = operations({
      tagExists: jest.fn(() => false),
      writeAnnotatedTag: jest.fn(() => {
        order.push('tag');
      }),
      deleteBranch: jest.fn(() => {
        order.push('delete');
      }),
    });

    expect(
      retireBranch(context(ops, { unfinished: new Set([BRANCH]) }), BRANCH),
    ).toBe('retired');
    expect(order).toEqual(['tag', 'delete']);
    expect(ops.writeAnnotatedTag).toHaveBeenCalledWith(
      UNFINISHED_TAG,
      expect.any(String),
      expect.stringContaining('Release never finished'),
    );
  });

  it('names no platform on the tag it writes for an unfinished release', () => {
    // Nothing reported, so naming a platform would claim that platform failed.
    const ops = operations({ tagExists: jest.fn(() => false) });
    retireBranch(context(ops, { unfinished: new Set([BRANCH]) }), BRANCH);

    expect(ops.writeAnnotatedTag).toHaveBeenCalledWith(
      UNFINISHED_TAG,
      expect.any(String),
      expect.not.stringContaining('Platform:'),
    );
  });

  it('does not rewrite an unfinished tag an earlier prune already left', () => {
    const ops = operations();

    expect(
      retireBranch(context(ops, { unfinished: new Set([BRANCH]) }), BRANCH),
    ).toBe('retired');
    expect(ops.writeAnnotatedTag).not.toHaveBeenCalled();
    expect(ops.deleteBranch).toHaveBeenCalledWith(BRANCH);
  });

  it('skips the push for a failure whose tag is not there to push', () => {
    // Nothing to push and nothing lost by deleting: this is the odd case of a
    // tag removed by hand between the listing and the deletion.
    const ops = operations({ tagExists: jest.fn(() => false) });

    expect(retireBranch(context(ops), BRANCH)).toBe('retired');
    expect(ops.pushRef).not.toHaveBeenCalled();
    expect(ops.deleteBranch).toHaveBeenCalledWith(BRANCH);
  });

  describe('in a dry run', () => {
    it('reports what it would do and touches nothing', () => {
      const ops = operations();
      const outcome = retireBranch(context(ops, { dryRun: true }), BRANCH);

      expect(outcome).toBe('retired');
      expect(ops.deleteBranch).not.toHaveBeenCalled();
      expect(ops.writeAnnotatedTag).not.toHaveBeenCalled();
      expect(ops.detail).toHaveBeenCalledWith(`would delete ${BRANCH}`);
    });

    it('says it would tag an unfinished branch rather than tagging it', () => {
      const ops = operations({ tagExists: jest.fn(() => false) });
      retireBranch(
        context(ops, { dryRun: true, unfinished: new Set([BRANCH]) }),
        BRANCH,
      );

      expect(ops.writeAnnotatedTag).not.toHaveBeenCalled();
      expect(ops.detail).toHaveBeenCalledWith(`would tag ${UNFINISHED_TAG}`);
    });

    it('checks the push even for a tag that does not exist yet', () => {
      // A dry run has not written the tag, so `tagExists` says no for every
      // unfinished branch. Asking anyway is what makes the rehearsal cover the
      // same steps the real prune takes.
      const ops = operations({ tagExists: jest.fn(() => false) });
      retireBranch(
        context(ops, { dryRun: true, unfinished: new Set([BRANCH]) }),
        BRANCH,
      );

      expect(ops.pushRef).toHaveBeenCalledWith(`refs/tags/${UNFINISHED_TAG}`, {
        dryRun: true,
      });
    });
  });
});

describe('summarisePrune', () => {
  const outcomes = (...values: RetireOutcome[]) => summarisePrune(values, 30);

  it('counts what happened, not what was listed', () => {
    expect(outcomes('retired', 'retired')).toBe(
      'Pruned 2 branch(es) older than 30 days. Their tags are kept.',
    );
  });

  it('says why each surviving branch survived', () => {
    // Three different problems, and only one of them will fix itself: a
    // checked-out branch needs somebody to switch away, an unresolvable one
    // needs looking at, and a refused push is worth simply waiting out.
    expect(
      outcomes('retired', 'checked-out', 'unresolved', 'tag-unpushed'),
    ).toBe(
      'Pruned 1 branch(es) older than 30 days. Their tags are kept.' +
        ' Kept 1 checked out, 1 resolving to no commit, 1 whose tag could not be pushed.',
    );
  });

  it('says nothing about kept branches when there are none', () => {
    expect(outcomes('retired')).not.toContain('Kept');
  });

  it('reports a prune that deleted nothing at all', () => {
    expect(outcomes('tag-unpushed')).toBe(
      'Pruned 0 branch(es) older than 30 days. Their tags are kept.' +
        ' Kept 1 whose tag could not be pushed.',
    );
  });

  it('quotes the keep window it was run with', () => {
    expect(summarisePrune(['retired'], 90)).toContain('older than 90 days');
  });
});
