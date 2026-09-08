import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { PLAYHEAD_TICK_MS, usePlayheadValue } from '../usePlayheadValue';

let playhead: ReturnType<typeof usePlayheadValue>;

function TestComponent({
  positionMs,
  isPlaying,
}: {
  positionMs: number;
  isPlaying: boolean;
}) {
  playhead = usePlayheadValue(positionMs, isPlaying);
  return null;
}

function render(positionMs: number, isPlaying: boolean) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { positionMs, isPlaying }));
  });
  return {
    tree,
    update: (nextPosition: number, nextPlaying = isPlaying) =>
      act(() => {
        tree.update(
          createElement(TestComponent, {
            positionMs: nextPosition,
            isPlaying: nextPlaying,
          }),
        );
      }),
  };
}

/**
 * Let a glide finish. A timing animation is driven from the UI runtime's frame
 * loop, which under Jest advances on real timers, so the settled value is only
 * readable after it has run.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PLAYHEAD_TICK_MS * 3));
  });
}

describe('usePlayheadValue', () => {
  it('starts at the position it is given', () => {
    render(4200, false);
    expect(playhead.value).toBe(4200);
  });

  it('jumps to a new position when the transport is stopped', () => {
    const { update } = render(0, false);

    update(3000);

    // Nothing to interpolate towards when nothing is playing: a scrub has to
    // land where it was dropped.
    expect(playhead.value).toBe(3000);
  });

  it('jumps rather than glides for a seek', async () => {
    const { update } = render(1000, true);

    // Far more than a tick's worth of movement, so this is a seek and not the
    // engine's next report. Gliding it would draw the playhead crossing
    // ground the audio never played.
    update(60000);
    await settle();

    expect(playhead.value).toBe(60000);
  });

  it('jumps backwards for a loop rewind', () => {
    const { update } = render(9000, true);

    update(2000);

    expect(playhead.value).toBe(2000);
  });

  it('glides forward across an ordinary playback report', async () => {
    const { update } = render(1000, true);

    // One tick's worth of movement while playing: the gap between reports is
    // what gets filled in, so the value does not arrive immediately.
    update(1100);
    expect(playhead.value).toBeLessThan(1100);

    await settle();
    expect(playhead.value).toBe(1100);
  });

  it('does not glide a repeated position', () => {
    const { update } = render(5000, true);

    update(5000);

    expect(playhead.value).toBe(5000);
  });
});
