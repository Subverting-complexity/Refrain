# Writing Style

How we communicate with the reader. This governs project updates, technical
explanations, estimates, proposals, issue summaries, documentation, emails,
chat messages, tickets, release notes, user-facing copy and any other
written communication.

It does not replace formats that exist for a specific purpose, such as
review questionnaires, compliance responses, commit messages or structured
work items. Where another document defines the required content or format,
follow that document — for on-screen strings and store listing copy, that
document is [`docs/ui-writing-style.md`](./ui-writing-style.md). This guide
still governs the tone and clarity of the writing unless the requirements
conflict.

## The one rule

Say plainly what happened, what it means and what needs to happen next.

Preserve the context and reasoning that affect the reader's understanding or
decision. Do not remove uncertainty, simplify away an important condition or
make the writer sound more confident than the available information allows.

The reader should be able to understand the message in one read. Writing
that sounds polished but requires interpretation is less useful than writing
that is direct and specific.

## Voice

The writing should sound practical, informed and human.

- Use plain language.
- Use first person where ownership matters.
- Be direct without sounding abrupt.
- Keep uncertainty where uncertainty exists.
- Explain the reasoning behind a conclusion or recommendation.
- Use contractions where they sound natural.
- Give the reader enough context to understand why something matters.
- End with the next step, decision or question where one is required.

Do not make the writing sound more formal, decisive, enthusiastic or
diplomatic than the original meaning requires.

## Golden examples

These are the reference. New writing should sound consistent with them.

### Progress update

> I have completed the first version of the reporting process, and it should
> be ready for the next release.
>
> The remaining work is to update the connection logic and move the existing
> configurations onto the new version. I estimate another 1–2 days for this,
> assuming no additional compatibility issues come up.
>
> Once that is moving through the release process, I can start on the
> remaining validation work.

### Estimate and prioritisation

> My ballpark estimate for completing the changes is around 6–8 hours for
> each configuration used across most environments, and around 2–3 hours for
> those used by only a few.
>
> This includes updating the implementation, applying the required
> configuration changes and moving each environment onto the correct
> version.
>
> There are quite a few configurations in total, so I would estimate roughly
> 40–60 hours for full completion.
>
> Would you like me to continue with this work, or should I prioritise the
> validation checks first? The validation checks would be much faster to set
> up and should give us a relatively robust safeguard in the meantime.

### Issue summary

> There were two primary issues:
>
> - Some requests were not completed. Around the time this happened, we
>   observed a significant increase in expired messages and elevated
>   resource usage. Based on this, it appears that the system was under
>   unusually high load.
> - Some requests were processed more than once. We observed timeouts while
>   the requests were being queued. Our working theory is that the original
>   requests were eventually processed, but the timeout caused them to be
>   retried, which resulted in duplicates.
>
> To address the duplicate processing, we are proposing that each request
> receive a unique identifier when it is created. Downstream services would
> then be able to recognise and ignore the same request if it is retried.

### Correction after further investigation

> There was an issue with the import process. The source had changed, which
> prevented the process from moving between the available locations.
>
> I initially thought there was no problem because the imports were
> completing without errors, and I was not aware that the source had changed
> at the time. This masked the failure because the process succeeded without
> importing the expected data.
>
> The issue has since been resolved and validated, and the fix has been
> released.

### Recommendation with a limitation

> I think there may be some misunderstanding about what the current
> framework supports.
>
> The framework can create outputs using the supported components and can be
> configured for different data arrangements. However, it does not define
> the underlying business metrics or support every part of the previous
> implementation.
>
> Because several required components are not yet supported, we cannot fully
> reproduce the existing output with the framework at present. Implementing
> the requested changes through it would probably not be useful until those
> gaps have been addressed.
>
> If I understand which teams need this and how frequently they use it, I
> can provide a more specific recommendation.

### Follow-up

> Just following up to check whether you are happy for us to go ahead and
> schedule this.
>
> If so, what time works best, and who should receive it?
>
> I have also created a work item for the remaining analysis. Once the
> underlying tracking is available, we will be able to produce a more
> detailed breakdown of where the usage is coming from.
>
> Let me know if you are happy for that work to start.

## What each example is doing

**Lead with the current position.** State what is complete, what happened or
what needs a decision before providing the supporting detail.

**Keep the reasoning.** If the conclusion depends on logs, observed
behaviour, timing, previous discussions or missing information, include that
context.

**Separate facts from interpretations.** State what was observed before
describing what it appears to mean.

**Preserve uncertainty.** Use phrases such as "I think", "it looks like",
"it appears" and "probably" and "our working theory" when the conclusion has
not been confirmed.

**Give numbers where numbers exist.** Include dates, ranges, versions,
percentages, quantities and estimates when they help the reader understand
the scale or timing.

**Use ranges for estimates.** A range such as 6–8 hours is usually more
honest and useful than false precision. Explain what the estimate includes
and identify any meaningful dependency.

**Explain cause and effect.** Do not only say that something failed. Explain
what happened, why it appears to have happened and what the impact was.

**Keep the chronology clear.** Where timing matters, explain what happened
first, what changed and what happened afterwards.

**State the limitation.** If a proposal does not cover every case, say which
part remains unsupported or uncertain.

**Finish with the next step.** Make it clear whether work is continuing,
waiting for information or dependent on a decision.

## Facts, interpretations and recommendations

Do not present all statements with the same level of certainty.

### Confirmed fact

Use direct language when the information has been verified.

> The deployment completed successfully, but no records were imported.
>
> The issue has been resolved and validated.
>
> The updated version will be included in the next release.

### Evidence-based interpretation

Use qualified language when the evidence supports a conclusion but does not
prove it.

> Based on the timing and the available logs, it appears that the requests
> were delayed by elevated system load.
>
> It looks like the process selected an older run instead of the most
> recent one.
>
> The change is probably what allowed the backlog to start processing.

### Working theory

Make it clear when the explanation is still being investigated.

> Our working theory is that the original request completed after the
> timeout, but the retry caused the same work to be processed again.
>
> I think the successful status may have masked the missing output.

### Recommendation

Present recommendations as recommendations, not as settled decisions.

> My suggestion would be to complete the validation check first because it
> is faster to implement and should provide useful coverage while the
> remaining work continues.
>
> I think the more robust option is to analyse both the generated output and
> the underlying changes.

Where information is missing, ask for it instead of filling the gap with an
assumption.

## Structure

Use structure when it helps the reader scan the message.

### Short messages

Use short paragraphs. Each paragraph should normally cover one point.

> I have completed the initial update and validated it in the test
> environment.
>
> The remaining work depends on the new configuration being available. Once
> that is in place, I estimate another 2–3 hours to complete the rollout.
>
> Do you know when the configuration will be ready?

### Messages covering several topics

Use simple, descriptive headings.

> **Current Progress**
>
> The first version is complete and is moving through the release process.
>
> **Remaining Work**
>
> The existing configurations still need to be migrated. I estimate this
> will take 1–2 days.
>
> **Next Steps**
>
> Would you prefer that I continue with the migration, or should I start on
> the validation work?

Do not use headings to make a short message look more substantial. Do not
repeat the same information under the heading and again in the paragraph.

### Parallel information

Use bullets when the reader needs to compare several items, issues or
actions.

- Name each item clearly.
- Keep equivalent information in the same order.
- Use complete sentences when the bullet contains reasoning.
- Use short fragments only for compact lists such as names, statuses or
  estimates.
- Do not force a paragraph into bullets if the reasoning depends on the
  previous sentence.

### Longer explanations

Use this order where applicable:

1. Current position or outcome.
2. Relevant background.
3. Evidence or observed behaviour.
4. Likely explanation.
5. Impact.
6. Proposed action.
7. Remaining question or dependency.

Not every message needs all seven parts. Include only the parts that are
relevant, but do not remove context that changes the meaning.

## Estimates

An estimate should explain the scope behind the number.

Include:

- The estimated range.
- What the estimate includes.
- Any work already included elsewhere.
- Dependencies that could materially change it.
- Whether the estimate is per item or for the full task.
- Whether it is a ballpark estimate or based on completed analysis.

> I would estimate around 4–5 hours to build the initial check. This
> includes comparing the recent results, applying a configurable tolerance
> and adding a failure notification.
>
> It does not include resolving any data issues the check identifies.

Avoid exact estimates where the work is still uncertain.

Do not quietly change an estimate into a commitment. "I estimate 2–3 days"
and "this will be complete in 2–3 days" do not mean the same thing.

## Technical explanations

Explain technical issues in terms of behaviour and impact.

Name the relevant component, process or state when it is important. Avoid
replacing exact names with synonyms, especially when the reader may need to
find the same item elsewhere.

A useful technical explanation normally answers:

- What was expected?
- What actually happened?
- What evidence was observed?
- What caused it, or what appears to have caused it?
- What was affected?
- What has been changed?
- How was the change validated?
- What remains uncertain?

Do not include implementation detail only to make the explanation sound
technical. Include it when it supports the conclusion or helps the reader
evaluate the proposed change.

## Problems and incidents

State the outcome before the investigation history.

> Some scheduled messages were not sent, and some users received
> duplicates.

Then separate each issue where the causes differ.

Distinguish between:

- A process completing successfully.
- A process producing the expected output.
- A fix being implemented.
- A fix being validated.
- A fix being released.

These are separate states and should not be treated as interchangeable.

Where the root cause is not confirmed, say so. Do not turn a correlation
into a fact.

## Corrections

When correcting an earlier statement:

1. State the corrected position.
2. Explain what caused the earlier misunderstanding if it is relevant.
3. State the current status.
4. Do not become defensive or over-explain.

> There was an issue with the extraction. I initially thought it was working
> because the process completed successfully, but I had not checked the
> resulting data. The failure has since been resolved and the output has
> been validated.

Do not hide the correction behind vague language such as "there may have
been some confusion" when the earlier statement was simply wrong.

## Questions and decisions

Keep open questions open.

Do not replace:

> Would you prefer that I continue with the migration, or should I complete
> the reporting work first?

with:

> I will continue with the migration because this is the best approach.

If the writer is weighing options, preserve the options and the reason for
asking.

Where a recommendation is included, keep it separate from the decision.

> Would you like me to do this work, and should it be prioritised over the
> current task? My suggestion would be to do this first because it is much
> faster to set up.

Ask specific questions. "What are your thoughts?" is useful only when the
reader genuinely has enough context to respond. If the decision concerns
timing, scope, priority or ownership, name it.

## Follow-ups

A follow-up should say what is waiting and what response is needed.

> Just following up to check whether you are happy for us to proceed. If so,
> what date works best, and who should be included?

Where there have been several unanswered requests, state the sequence
factually. Do not exaggerate or remove the context that explains why the
follow-up matters.

> I initially asked for future discussions to be moved into the shared
> channel. In the later messages, I specifically asked for the current issue
> and its solution to be shared there. I have followed up twice since then,
> but nothing has been posted.

If the pattern is the concern, explain the pattern and why it matters.

## Disagreement and concern

Be direct about the concern without overstating it.

> My concern is that most of the validation responsibility currently falls
> on the reviewer, which adds significant overhead if every result needs to
> be checked manually.
>
> I know these incidents may not seem urgent individually, but they appear
> to point to a broader issue with ownership and follow-through.

Do not weaken a legitimate concern into generic diplomatic language. Do not
strengthen it into an accusation that the evidence does not support.

Describe actions and outcomes before interpreting behaviour.

## Exact wording

Use the exact name, label or term that appears in the system, document or
process.

If an option is called Weekly, write Weekly. If a work item has a specific
title or identifier, use that title or identifier. If a status is called
Completed, do not replace it with Done unless the distinction does not
matter.

This prevents the writing from drifting away from what the reader can see.

## Project-specific context

Explain project-specific context once, in the place where it is needed.

Do not repeat the same background in every update. However, do not remove it
when the message may be read independently or when it affects the decision.

A useful test is whether the reader could misunderstand the recommendation
without the context. If so, keep it.

References such as work item numbers, release names and file names should
be included when they help the reader find the related work. They should
not replace an explanation of what the work actually covers.

## Platform, environment and audience differences

Where behaviour or instructions differ by platform, environment, client or
audience, separate the wording.

Do not write one broad statement that forces every reader to work out which
part applies to them.

> In the hosted environment, the change is applied automatically.
>
> For local environments, the package needs to be updated manually before
> the new configuration can be used.

Use the source that owns the distinction. Do not recreate a list manually if
it already exists elsewhere and may change independently.

## Verify before writing

Writing is a claim about what happened or how something behaves. A
specific, confident sentence about the wrong behaviour is worse than a
shorter sentence that accurately reflects what is known.

Before stating a technical fact:

- Check the implementation, logs, source data or document that owns the
  behaviour.
- Confirm that comments and documentation are still current.
- Check whether later changes have altered the original behaviour.
- Confirm that a successful status also produced the expected output.
- Check whether the behaviour differs by environment or configuration.
- Confirm dates, versions, estimates and identifiers.
- Distinguish between what was observed and what was inferred.

Where a claim cannot be confirmed, say less or state the uncertainty.

## Avoiding AI tells

The writing should not sound generated, inflated or artificially balanced.

Avoid:

- Generic openings such as "I hope this message finds you well" unless they
  are genuinely appropriate.
- Empty transitions such as "Furthermore", "Moreover" and "It is worth
  noting" where the sentence works without them.
- Repeating the same conclusion in the introduction, every section and the
  final paragraph.
- Turning every point into a three-part list.
- Giving every section the same length and sentence structure.
- Adding a summary to a short message that is already clear.
- Using polished-sounding phrases that add no information.
- Adding confidence, enthusiasm or reassurance that was not present in the
  source.
- Ending every paragraph with a broad statement about efficiency,
  reliability or alignment.
- Explaining obvious benefits after the practical impact has already been
  stated.
- Overusing contrast structures such as "This is not only about X, but also
  about Y."
- Using rhetorical questions when a direct question is needed.
- Writing in a detached corporate voice when first person would be clearer.
- Replacing specific observations with general business language.
- Adding recommendations that the writer did not make.
- Removing qualifications to make the answer sound cleaner.
- Excessive bold text, decorative headings or formatting that makes a
  straightforward message look like a report.
- Perfectly symmetrical wording where the underlying information is not
  symmetrical.

Do not avoid a useful word only because it sometimes appears in generated
writing. Words such as "robust", "ensure", "streamline" and "align" are
acceptable when they express the intended meaning. The problem is vague or
repetitive use, not the word itself.

## Never write

**No em dashes.** Use a full stop, comma, colon or new sentence.

**No invented certainty.** Do not change "it appears" to "this proves"
unless the evidence supports that conclusion.

**No invented uncertainty.** Do not add "possibly" or "perhaps" to a
confirmed fact merely to sound cautious.

**No missing context.** Do not remove information that explains a decision,
concern, estimate or question.

**No silent change of intent.** Do not turn an open question into a
recommendation, a recommendation into a decision or an estimate into a
commitment.

**No inflated language.** Avoid phrases such as "transformative solution",
"seamless experience", "critical milestone", "game-changing improvement" or
"significant value proposition" unless those claims are both necessary and
supported.

**No unnecessary personification.** Systems do not want, understand,
decide, struggle or refuse. State what the system does.

**No metaphor or wordplay in explanations.** The reader needs the behaviour
explained, not characterised.

**No vague ownership.** Use "I", "we", the team name or the responsible
component where ownership matters.

**No unsupported cause.** If the evidence only shows that two events
happened at the same time, describe the relationship as a possibility or
working theory.

**No synonym drift.** Use the same term for the same thing throughout the
message.

**No restating a heading.** A section called Remaining Work should start
with the remaining work, not "The remaining work is as follows" unless that
wording improves the sentence.

**No unnecessary conclusion.** Stop once the update, reasoning and required
next step are clear.

## Accessibility and clarity

Accessible writing follows the same rules as visible writing.

- Use the same terminology across visible labels, spoken labels and
  supporting explanations.
- Make the purpose of an action clear without relying only on its position
  or visual appearance.
- Use descriptive link text rather than "click here".
- Do not communicate status through colour alone.
- Keep error messages specific about what failed and what the reader can do
  next.
- Avoid unexplained abbreviations where the audience may not know them.
- Use sentence structures that remain understandable when read aloud.

## Final check

Before sending, check:

- Is the current position clear in the first paragraph?
- Are confirmed facts separated from interpretations?
- Has the original level of uncertainty been preserved?
- Is every important name, date, version and estimate accurate?
- Does the reasoning explain how the conclusion was reached?
- Are relevant limitations and dependencies included?
- Has any context affecting the decision been removed?
- Is the next step or question clear?
- Are the options still open where the writer intended them to be open?
- Has any recommendation been added or strengthened?
- Is anything repeated without adding information?
- Does the wording sound like a person explaining the situation to a
  colleague?
- Are there any em dashes, inflated phrases or unnecessary summaries?
- Could the reader understand the message correctly in one read?
