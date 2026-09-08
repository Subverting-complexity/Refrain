import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { PlaybackState, PlaybackStatus } from '../../types';
import {
  PLAYHEAD_TICK_MS,
  shouldGlide,
  usePlayheadValue,
} from '../usePlayheadValue';

const IDLE: PlaybackState = {
  status: 'paused',
  positionMs: 0,
  durationMs: 180000,
  markerA: null,
  markerB: null,
  loopEnabled: true,
  volume: 1,
};

/**
 * A stand-in for the audio engine: the same subscribe/getState pair the hook
 * takes, with a `report` that publishes a snapshot the way the engine does.
 */
function fakeEngine(initial: Partial<PlaybackState> = {}) {
  let state: PlaybackState = { ...IDLE, ...initial };
  const listeners = new Set<(next: PlaybackState) => void>();

  return {
    getState: (): PlaybackState => state,
    subscribe: (onChange: (next: PlaybackState) => void): (() => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    report(positionMs: number, status: PlaybackStatus = state.status): void {
      state = { ...state, positionMs, status };
      for (const listener of listeners) listener(state);
    },
    listenerCount: (): number => listeners.size,
  };
}

let playhead: ReturnType<typeof usePlayheadValue>;

function TestComponent({ engine }: { engine: ReturnType<typeof fakeEngine> }) {
  playhead = usePlayheadValue(engine.subscribe, engine.getState);
  return null;
}

function render(engine: ReturnType<typeof fakeEngine>) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(TestComponent, { engine }));
  });
  return {
    tree,
    report: (positionMs: number, status?: PlaybackStatus) =>
      act(() => {
        engine.report(positionMs, status);
      }),
    unmount: () => act(() => tree.unmount()),
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

describe('shouldGlide', () => {
  it('glides a report that follows on from the last one', () => {
    expect(shouldGlide(1000, 1100, true)).toBe(true);
  });

  it('does not glide while stopped', () => {
    expect(shouldGlide(1000, 1100, false)).toBe(false);
  });

  it('does not glide backwards, so a loop rewind lands', () => {
    expect(shouldGlide(9000, 2000, true)).toBe(false);
  });

  it('does not glide a jump larger than a few ticks, so a seek lands', () => {
    expect(shouldGlide(1000, 60000, true)).toBe(false);
  });

  it('does not glide a repeated position', () => {
    expect(shouldGlide(5000, 5000, true)).toBe(false);
  });
});

describe('usePlayheadValue', () => {
  it("starts at the engine's current position", () => {
    render(fakeEngine({ positionMs: 4200 }));

    expect(playhead.value).toBe(4200);
  });

  it('jumps to a new position when the transport is stopped', () => {
    const engine = fakeEngine({ status: 'paused' });
    const { report } = render(engine);

    report(3000);

    // Nothing to interpolate towards when nothing is playing: a scrub has to
    // land where it was dropped.
    expect(playhead.value).toBe(3000);
  });

  it('jumps rather than glides for a seek', async () => {
    const engine = fakeEngine({ status: 'playing', positionMs: 1000 });
    const { report } = render(engine);

    // Far more than a tick's worth of movement, so this is a seek and not the
    // engine's next report. Gliding it would draw the playhead crossing ground
    // the audio never played.
    report(60000);
    await settle();

    expect(playhead.value).toBe(60000);
  });

  it('jumps backwards for a loop rewind', () => {
    const engine = fakeEngine({ status: 'playing', positionMs: 9000 });
    const { report } = render(engine);

    report(2000);

    expect(playhead.value).toBe(2000);
  });

  it('glides forward across an ordinary playback report', async () => {
    const engine = fakeEngine({ status: 'playing', positionMs: 1000 });
    const { report } = render(engine);

    // One tick's worth of movement while playing: the gap between reports is
    // what gets filled in, so the value does not arrive immediately.
    report(1100);
    expect(playhead.value).toBeLessThan(1100);

    await settle();
    expect(playhead.value).toBe(1100);
  });

  it('unsubscribes on unmount', () => {
    const engine = fakeEngine();
    const { unmount } = render(engine);
    expect(engine.listenerCount()).toBe(1);

    unmount();

    expect(engine.listenerCount()).toBe(0);
  });
});
