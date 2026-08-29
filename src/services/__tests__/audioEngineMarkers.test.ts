// Direct tests for the debounced marker persistence.
//
// The debounce timer used to sit among the audio engine's module variables,
// so exercising it meant loading a track through the expo-audio mock and
// watching the store from the outside. As its own unit it can be driven with
// fake timers and a stubbed store, which makes the cases that matter cheap to
// state: what a burst of changes collapses into, what a flush rescues, and
// what happens when the store refuses to answer.

import { ActiveMarkers } from '../../types';
import {
  MARKER_SAVE_DEBOUNCE_MS,
  createMarkerPersistence,
} from '../audioEngineMarkers';
import * as markerStore from '../markerStore';

jest.mock('../markerStore', () => ({
  setActiveMarkers: jest.fn(),
  getActiveMarkers: jest.fn(),
}));

const setActiveMarkers = markerStore.setActiveMarkers as jest.Mock;
const getActiveMarkers = markerStore.getActiveMarkers as jest.Mock;

const MARKERS: ActiveMarkers = {
  markerA: 1000,
  markerB: 4000,
  loopEnabled: true,
};

/** A persistence unit over mutable test state, so a test can move the markers. */
function harness(trackId: string | null = 'track-1') {
  const state = { trackId, markers: { ...MARKERS } };
  const persistence = createMarkerPersistence({
    getTrackId: () => state.trackId,
    getMarkers: () => state.markers,
  });
  return { state, persistence };
}

beforeEach(() => {
  jest.useFakeTimers();
  setActiveMarkers.mockReset();
  getActiveMarkers.mockReset();
  setActiveMarkers.mockReturnValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('writing', () => {
  it('sends the current markers to the store', () => {
    const { persistence } = harness();

    persistence.schedule();
    persistence.flush();

    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', MARKERS);
  });

  it('does nothing when the load carried no track id', () => {
    const { persistence } = harness(null);

    persistence.schedule();
    persistence.flush();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);

    expect(setActiveMarkers).not.toHaveBeenCalled();
  });

  // The web store returns a promise, so a rejection has to be caught rather
  // than left to escape: an unhandled rejection is a crash on some runtimes,
  // and losing a marker position is a much smaller harm than that.
  //
  // Asserting that `flush()` does not throw would prove nothing, because
  // `settle` turns every synchronous throw into a rejected promise, so it
  // cannot throw whatever the store does. What has to be observed is the
  // rejection going unhandled, which means listening for it.
  it('does not let a rejecting store escape as an unhandled rejection', async () => {
    jest.useRealTimers();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      setActiveMarkers.mockRejectedValue(new Error('quota exceeded'));
      const { persistence } = harness();

      persistence.schedule();
      persistence.flush();
      // One macrotask: long enough for the microtask queue to drain and for
      // the process to emit `unhandledRejection` if nothing caught it.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
  });

  it('swallows a store that throws synchronously', () => {
    setActiveMarkers.mockImplementation(() => {
      throw new Error('database is locked');
    });
    const { persistence } = harness();

    expect(() => {
      persistence.schedule();
      persistence.flush();
    }).not.toThrow();
  });
});

describe('schedule', () => {
  it('writes once the debounce window has passed', () => {
    const { persistence } = harness();

    persistence.schedule();
    expect(setActiveMarkers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);
    expect(setActiveMarkers).toHaveBeenCalledTimes(1);
    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', MARKERS);
  });

  // A marker drag fires changes at the drag-throttle cadence. Coalescing them
  // is the whole point of the debounce.
  it('collapses a burst of changes into a single write', () => {
    const { persistence } = harness();

    persistence.schedule();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS - 50);
    persistence.schedule();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS - 50);
    persistence.schedule();
    expect(setActiveMarkers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);
    expect(setActiveMarkers).toHaveBeenCalledTimes(1);
  });

  it('writes the final value of a burst, never a stale one', () => {
    const { state, persistence } = harness();

    persistence.schedule();
    state.markers = { markerA: 2000, markerB: 8000, loopEnabled: false };
    persistence.schedule();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);

    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', {
      markerA: 2000,
      markerB: 8000,
      loopEnabled: false,
    });
  });

  it('does nothing when the track has no id', () => {
    const { persistence } = harness(null);

    persistence.schedule();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);

    expect(setActiveMarkers).not.toHaveBeenCalled();
  });
});

describe('the track a queued write belongs to', () => {
  // The engine flushes before it swaps tracks, so this should not arise. The
  // module still has to defend it: writing one track's markers under another
  // track's id corrupts both rows, and does it silently.
  it('drops a queued write when the loaded track changed under the timer', () => {
    const { state, persistence } = harness('track-1');

    persistence.schedule();
    state.trackId = 'track-2';
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);

    expect(setActiveMarkers).not.toHaveBeenCalled();
  });

  it('still writes when the same track is loaded when the timer fires', () => {
    const { persistence } = harness('track-1');

    persistence.schedule();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);

    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', MARKERS);
  });
});

describe('flush', () => {
  // Called before the loaded track is torn down, so a change made inside the
  // debounce window is persisted for the outgoing track rather than lost.
  it('writes a pending change immediately', () => {
    const { persistence } = harness();

    persistence.schedule();
    persistence.flush();

    expect(setActiveMarkers).toHaveBeenCalledTimes(1);
    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', MARKERS);
  });

  it('cancels the timer, so the flushed change is not written twice', () => {
    const { persistence } = harness();

    persistence.schedule();
    persistence.flush();
    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS * 2);

    expect(setActiveMarkers).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no change is pending', () => {
    const { persistence } = harness();

    persistence.flush();

    expect(setActiveMarkers).not.toHaveBeenCalled();
  });
});

describe('restore', () => {
  it('returns the saved markers for the track', async () => {
    getActiveMarkers.mockReturnValue(MARKERS);
    const { persistence } = harness();

    await expect(persistence.restore('track-1')).resolves.toEqual(MARKERS);
    expect(getActiveMarkers).toHaveBeenCalledWith('track-1');
  });

  it('resolves a promise from the web store', async () => {
    getActiveMarkers.mockResolvedValue(MARKERS);
    const { persistence } = harness();

    await expect(persistence.restore('track-1')).resolves.toEqual(MARKERS);
  });

  it('returns null for a track with no saved row', async () => {
    getActiveMarkers.mockReturnValue(undefined);
    const { persistence } = harness();

    await expect(persistence.restore('track-1')).resolves.toBeNull();
  });

  // Best-effort: a failed read leaves the track with its post-load defaults.
  it('returns null when the store rejects', async () => {
    getActiveMarkers.mockRejectedValue(new Error('unreadable'));
    const { persistence } = harness();

    await expect(persistence.restore('track-1')).resolves.toBeNull();
  });

  it('returns null when the store throws synchronously', async () => {
    getActiveMarkers.mockImplementation(() => {
      throw new Error('database is locked');
    });
    const { persistence } = harness();

    await expect(persistence.restore('track-1')).resolves.toBeNull();
  });
});

describe('instances', () => {
  // A factory rather than free functions precisely so the timer is not shared:
  // a test that could not start from a fresh one would be reading the
  // leftovers of whichever test ran before it.
  it('do not share a debounce timer', () => {
    const first = harness('track-1');
    const second = harness('track-2');

    first.persistence.schedule();
    second.persistence.flush();

    expect(setActiveMarkers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MARKER_SAVE_DEBOUNCE_MS);
    expect(setActiveMarkers).toHaveBeenCalledTimes(1);
    expect(setActiveMarkers).toHaveBeenCalledWith('track-1', MARKERS);
  });
});
