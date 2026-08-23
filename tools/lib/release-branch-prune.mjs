/**
 * The decision a prune makes about one branch: tag it, push the tag, and only
 * then delete it — or keep it and say why.
 *
 * This is the one rule in the release tooling whose mistakes cannot be undone
 * by running the command again. `tools/lib/release-branch.mjs` already keeps
 * the rule that decides *which* branches are candidates, for exactly that
 * reason. This file keeps the rule that decides whether a candidate may
 * actually be removed, which is a separate question.
 *
 * Nothing here runs git. Every git action arrives as a function on
 * {@link PruneOperations}, so a test can hand it a refusing push or an
 * unresolvable ref and watch what it decides. `tools/release-branch.mjs`
 * supplies the real implementations and keeps the side effects.
 */

import { buildTagMessage, parseBranchName, tagNameFor } from './release-branch.mjs';

/**
 * What happened to one branch, and — when it survived — why.
 *
 * A plain boolean is not enough to report honestly: a branch kept because it
 * is checked out and a branch kept because its tag would not push are
 * different problems, and only one of them will fix itself.
 *
 * @typedef {'retired' | 'checked-out' | 'unresolved' | 'tag-unpushed'} RetireOutcome
 */

/**
 * Everything a prune needs to do that touches git, the filesystem or the
 * console, as functions it can be handed.
 *
 * @typedef {object} PruneOperations
 * @property {(ref: string) => string | null} resolveCommit the commit a full
 *   ref name points at, or `null` when there is no such ref
 * @property {(tag: string) => boolean} tagExists
 * @property {(ref: string, options: { dryRun: boolean }) => boolean} pushRef
 *   pushes one full ref name, reporting a refusal rather than raising it
 * @property {(tag: string, commit: string, message: string) => void} writeAnnotatedTag
 * @property {(branch: string) => void} deleteBranch removes the branch
 *   wherever it exists, locally and on the remote
 * @property {(message: string) => void} warn
 * @property {(message: string) => void} detail
 * @property {(message: string) => void} ok
 */

/**
 * What every branch in one prune needs to know about the run doing it.
 *
 * @typedef {object} PruneContext
 * @property {string} remote
 * @property {boolean} dryRun
 * @property {string} current the checked-out branch, which is never deleted
 * @property {Set<string>} unfinished branches with no outcome tag of their own
 * @property {PruneOperations} operations
 */

/**
 * Makes sure a branch's tag is written and on the remote, then deletes the
 * branch.
 *
 * Three things stop a deletion. The checked-out branch is never deleted;
 * neither is a branch whose commit cannot be resolved, because a branch this
 * cannot tag is a branch it must not remove; and neither is a branch whose
 * outcome tag could not be pushed, because until the tag is on the remote the
 * branch may be the run's only remote record. A kept branch is a warning
 * rather than a failure, and the next prune tries it again.
 *
 * @param {PruneContext} context
 * @param {string} branch
 * @returns {RetireOutcome} What happened, so the summary can report what the
 *   prune did rather than what it set out to do.
 */
export function retireBranch(context, branch) {
  const { operations } = context;

  if (branch === context.current) {
    operations.warn(`${branch} is checked out, so it is being left alone.`);
    return 'checked-out';
  }

  const commit =
    operations.resolveCommit(`refs/heads/${branch}`) ??
    operations.resolveCommit(`refs/remotes/${context.remote}/${branch}`);
  if (!commit) {
    operations.warn(`${branch} resolves to no commit, so it is being left alone.`);
    return 'unresolved';
  }

  const isUnfinished = context.unfinished.has(branch);
  const tag = tagNameFor(branch, isUnfinished ? 'unfinished' : 'failed');
  if (isUnfinished) writeUnfinishedTag(context, branch, commit, tag);

  // Whichever tag stands in for this branch has to be on the remote before the
  // branch leaves it, or a failed attempt whose tag never pushed loses its only
  // remote record at exactly the moment the branch is deleted. Pushing a tag
  // the remote already has costs one round trip and succeeds. A push that
  // fails means that invariant does not hold, so the branch is kept for a
  // later prune to retry — deleting it now would be the exact loss the push
  // exists to prevent. (In a dry run pushRef reports success without pushing.)
  if (context.dryRun || operations.tagExists(tag)) {
    const pushed = operations.pushRef(`refs/tags/${tag}`, { dryRun: context.dryRun });
    if (!pushed) {
      operations.warn(`${branch} is being kept until ${tag} can be pushed to ${context.remote}.`);
      return 'tag-unpushed';
    }
  }

  if (context.dryRun) {
    operations.detail(`would delete ${branch}`);
    return 'retired';
  }

  operations.deleteBranch(branch);
  return 'retired';
}

/**
 * Writes the tag that stands in for a run which never reported an outcome,
 * unless an earlier prune already wrote it.
 *
 * @param {PruneContext} context
 * @param {string} branch
 * @param {string} commit
 * @param {string} tag
 */
export function writeUnfinishedTag(context, branch, commit, tag) {
  const { operations } = context;

  if (operations.tagExists(tag)) return;
  if (context.dryRun) {
    operations.detail(`would tag ${tag}`);
    return;
  }

  const parsed = parseBranchName(branch);
  operations.writeAnnotatedTag(
    tag,
    commit,
    buildTagMessage({
      branch,
      platform: parsed?.platform ?? 'ios',
      outcome: 'unfinished',
      commit,
      notes: 'No outcome was ever recorded. The run did not reach its own ending.',
    }),
  );
  operations.ok(`Tagged ${tag} before removing the branch`);
}

/** How each reason for keeping a branch is worded in the summary. */
const KEPT_REASONS = /** @type {const} */ ([
  ['checked-out', 'checked out'],
  ['unresolved', 'resolving to no commit'],
  ['tag-unpushed', 'whose tag could not be pushed'],
]);

/**
 * The line a prune prints when it is done.
 *
 * Counted from what actually happened rather than from what was listed, and
 * the branches that survived are broken down by why. A prune that kept a
 * branch because it is checked out and one that kept a branch because the
 * remote refused the tag are describing different problems to whoever reads
 * the log, and only the second one is worth waiting out.
 *
 * @param {readonly RetireOutcome[]} outcomes one per branch this prune tried
 * @param {number} keepDays
 */
export function summarisePrune(outcomes, keepDays) {
  const count = (/** @type {RetireOutcome} */ outcome) =>
    outcomes.filter((each) => each === outcome).length;

  const kept = KEPT_REASONS.map(([outcome, phrase]) => [count(outcome), phrase])
    .filter(([total]) => Number(total) > 0)
    .map(([total, phrase]) => `${total} ${phrase}`);

  return (
    `Pruned ${count('retired')} branch(es) older than ${keepDays} days. Their tags are kept.` +
    (kept.length > 0 ? ` Kept ${kept.join(', ')}.` : '')
  );
}
