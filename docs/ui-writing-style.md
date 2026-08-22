# UI Writing Style

How Refrain talks to the reader. This governs **every string the app puts on
a screen** — settings explanations, toasts, empty states, dialog bodies,
accessibility labels and error messages — and the **App Store / Play Store
listing copy** in `fastlane/metadata/` (description, subtitle, promotional
text, release notes, keywords).

It does not govern code comments, commit messages, pull request bodies, or
anything written in chat. Those have their own audience and their own
conventions, set by [`docs/writing-style.md`](./writing-style.md).

Ported from a sibling app's writing guide; the rules are general, the
examples below are Refrain's own.

## The one rule

**Say plainly what the thing does.** Name the options. Use the words that are
on the screen. Do not characterise, do not personify, do not be clever.

The reader opening an explanation has a specific question and wants it
answered in one read. Writing that is enjoyable to compose is usually writing
that makes them read it twice.

## Golden examples

These are the reference. New copy should be indistinguishable from them.

### Count-in timer

> Plays a short lead-in before playback starts, so you're ready when the loop
> begins.
>
> The count-in runs once, before the first pass. It does not repeat on later
> passes through the loop.

### Precise skip

> Jumps forward or back by a fixed interval: 1, 3, 5, 10, 15, or 30 seconds,
> or 1 or 5 minutes.
>
> The interval applies to both skip buttons equally. Skipping past the start
> or end of your loop stops at that edge instead of going further.

### Saved segments

> Stores the A and B points of the current loop so you can reload it later
> without resetting the markers.
>
> A saved segment keeps its own name and position in the library. Deleting
> the source track also removes any segments saved from it.

## What each of those is doing

**Name every option, in the order it's offered.** "1, 3, 5, 10, 15, or 30
seconds" lists the actual skip intervals in order. A reader choosing between
options needs each one named, not a characterisation of the choice as a
whole.

**Use the feature's exact label.** If the button says Count-in, the
explanation says count-in. Never a synonym, never a description standing in
for the name.

**Describe the mechanism, not the feeling.** "Stops at that edge instead of
wrapping" is right. "Gently comes to rest at the edge" is wrong, because
nothing gently rests, and the reader now has to work out what that means.

**Give numbers where numbers exist.** "1, 3, 5, 10, 15, or 30 seconds" — a
range the reader can see on the control should be stated in the same units
the control uses.

**Second sentence or paragraph for the limits and the edge cases.** The first
sentence says what the thing does. The second says what happens at the
edges, what it does not apply to, or what it costs. Two short sentences beat
one dense one.

## Never write

**No personification.** A loop does not want anything, a marker does not
travel, a track does not settle. The marker moves, the loop repeats,
playback starts.

**No em dashes.** Use a full stop, a comma, or a new sentence. An em dash
almost always joins two thoughts that read better apart.

**No metaphor or wordplay.** "Never lose your place" is not an explanation
of what a bookmark does.

**No inversion or literary word order.** "How far the skip buttons move
through the track, in seconds" reads as an answer. A sentence built the other
way round reads as an essay.

**No restating the feature's own label.** A row called Count-in timer does
not open an explanation beginning "Count-in timer plays…". The reader can
see the label.

**No sentence fragments as headlines.** Write full sentences.

## Platform differences

Where a feature behaves differently on one platform, split the string rather
than writing one string that tries to cover both. A reader on Android should
not read a sentence about an iOS-only control.

## Verify before you write

Copy is a claim about behaviour, and a confident sentence about the wrong
behaviour is worse than no sentence. Read the module that owns the behaviour
before describing it — for store copy, check the "Feature check" section of
[`fastlane/PUBLISHING.md`](../fastlane/PUBLISHING.md), which lists exactly
what Refrain has and does not have (no tempo/speed or pitch change, for
example). Where you cannot confirm a claim, say less rather than guessing.

## Accessibility labels follow the same rules

A screen reader label is copy. It is built from the same vocabulary the
visible text uses, so the two cannot disagree. `AccessiblePressable`'s
`accessibilityLabel` prop is where this applies in Refrain: the spoken name
should match the same plain, unpersonified wording as the visible label next
to it.
