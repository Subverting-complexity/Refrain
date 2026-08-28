// Direct tests for the loop, monitor and skip arithmetic.
//
// These rules used to live inside `audioEngine.ts`, reading their inputs off
// module scope, so the only way to check any of them was to drive the whole
// engine through the expo-audio mock and infer the maths from what the player
// was asked to do. Several of them exist because of a specific way the
// playhead once got stuck, and a case like "marker B sits past the end of a
// re-imported track" was expensive to set up that way and easy to leave
// untested. As plain functions of their arguments they can be stated as a
// table, which is what this file does.
//
// The engine's own suites still cover what it *does* with these answers.

import { SkipPreference } from '../skipIntervalStore';
import {
  MONITOR_HALF_WINDOW_MS,
  computeMonitorWindow,
  loopBoundaryAction,
  monitorBounds,
  reconcileMarkersToDuration,
  regionBounds,
  skipBounds,
  skipTargetMs,
  trackLoopBounds,
  usableMarkerA,
} from '../audioEngineBounds';

describe('regionBounds', () => {
  it('is the A..B region when both markers are set and ordered', () => {
    expect(
      regionBounds({ markerA: 1000, markerB: 4000, durationMs: 10000 }),
    ).toEqual({
      a: 1000,
      b: 4000,
    });
  });

  it('is null when either marker is missing', () => {
    expect(
      regionBounds({ markerA: 1000, markerB: null, durationMs: 10000 }),
    ).toBeNull();
    expect(
      regionBounds({ markerA: null, markerB: 4000, durationMs: 10000 }),
    ).toBeNull();
    expect(
      regionBounds({ markerA: null, markerB: null, durationMs: 10000 }),
    ).toBeNull();
  });

  it('is null when A is not before B', () => {
    expect(
      regionBounds({ markerA: 4000, markerB: 4000, durationMs: 10000 }),
    ).toBeNull();
    expect(
      regionBounds({ markerA: 5000, markerB: 4000, durationMs: 10000 }),
    ).toBeNull();
  });

  // A track re-imported over the same id from a shorter file keeps its saved
  // markers. Left alone, the playhead could never reach B, so the loop never
  // rewound and play() started at the very end and finished immediately: the
  // Play button looked dead with nothing explaining why.
  it('clamps a B past the end of the track back to the end', () => {
    expect(
      regionBounds({ markerA: 1000, markerB: 99000, durationMs: 10000 }),
    ).toEqual({
      a: 1000,
      b: 10000,
    });
  });

  it('is null when both markers are past the end of the track', () => {
    expect(
      regionBounds({ markerA: 20000, markerB: 99000, durationMs: 10000 }),
    ).toBeNull();
  });

  it('leaves B alone while the duration is still unknown', () => {
    expect(
      regionBounds({ markerA: 1000, markerB: 99000, durationMs: 0 }),
    ).toEqual({
      a: 1000,
      b: 99000,
    });
  });
});

describe('trackLoopBounds', () => {
  it('loops the whole track when the loop is armed and no A is set', () => {
    expect(
      trackLoopBounds({ loopEnabled: true, markerA: null, durationMs: 10000 }),
    ).toEqual({
      a: 0,
      b: 10000,
    });
  });

  it('loops from A to the end when only A is set', () => {
    expect(
      trackLoopBounds({ loopEnabled: true, markerA: 2500, durationMs: 10000 }),
    ).toEqual({
      a: 2500,
      b: 10000,
    });
  });

  it('is null when the loop is disarmed', () => {
    expect(
      trackLoopBounds({ loopEnabled: false, markerA: 2500, durationMs: 10000 }),
    ).toBeNull();
  });

  // A zero-length "region" would trap the playhead at 0.
  it('is null before the duration is known', () => {
    expect(
      trackLoopBounds({ loopEnabled: true, markerA: null, durationMs: 0 }),
    ).toBeNull();
  });

  it('falls back to the start when A is past the end', () => {
    expect(
      trackLoopBounds({ loopEnabled: true, markerA: 20000, durationMs: 10000 }),
    ).toEqual({
      a: 0,
      b: 10000,
    });
  });
});

describe('usableMarkerA', () => {
  it('is A when it lands inside the track', () => {
    expect(usableMarkerA({ markerA: 2500, durationMs: 10000 })).toBe(2500);
  });

  it('is the start when there is no A', () => {
    expect(usableMarkerA({ markerA: null, durationMs: 10000 })).toBe(0);
  });

  // Used as a loop start, an unreachable A gives an inverted region: every
  // status update rewinds past the end, finishes immediately and rewinds
  // again, spinning at the update rate.
  it('is the start when A is at or past the end', () => {
    expect(usableMarkerA({ markerA: 10000, durationMs: 10000 })).toBe(0);
    expect(usableMarkerA({ markerA: 20000, durationMs: 10000 })).toBe(0);
  });

  it('trusts A while the duration is still unknown', () => {
    expect(usableMarkerA({ markerA: 20000, durationMs: 0 })).toBe(20000);
  });
});

describe('reconcileMarkersToDuration', () => {
  it('reports no change when both markers fit inside the track', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: 1000,
        markerB: 4000,
        durationMs: 10000,
      }),
    ).toEqual({ markerA: 1000, markerB: 4000, changed: false });
  });

  // A loop end the reader never chose is a worse guess than no loop end.
  it('drops a B past the end rather than pinning it there', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: 1000,
        markerB: 99000,
        durationMs: 10000,
      }),
    ).toEqual({ markerA: 1000, markerB: null, changed: true });
  });

  it('drops an A at or past the end, since it can no longer start anything', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: 10000,
        markerB: null,
        durationMs: 10000,
      }),
    ).toEqual({ markerA: null, markerB: null, changed: true });
  });

  it('drops both when both are out of range', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: 20000,
        markerB: 99000,
        durationMs: 10000,
      }),
    ).toEqual({ markerA: null, markerB: null, changed: true });
  });

  // Markers are restored during load, before any duration has been reported.
  it('changes nothing before the duration is known', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: 20000,
        markerB: 99000,
        durationMs: 0,
      }),
    ).toEqual({
      markerA: 20000,
      markerB: 99000,
      changed: false,
    });
  });

  // `changed` is what tells the caller a save is owed, and it is not the same
  // question as whether the markers came back null.
  it('reports no change when the markers were already empty', () => {
    expect(
      reconcileMarkersToDuration({
        markerA: null,
        markerB: null,
        durationMs: 10000,
      }),
    ).toEqual({
      markerA: null,
      markerB: null,
      changed: false,
    });
  });
});

describe('monitorBounds', () => {
  it('presents an active window as loop bounds', () => {
    expect(
      monitorBounds({
        monitorActive: true,
        monitorWindow: { start: 1000, end: 5000 },
      }),
    ).toEqual({ a: 1000, b: 5000 });
  });

  it('is null while the monitor is idle', () => {
    expect(
      monitorBounds({
        monitorActive: false,
        monitorWindow: { start: 1000, end: 5000 },
      }),
    ).toBeNull();
    expect(
      monitorBounds({ monitorActive: true, monitorWindow: null }),
    ).toBeNull();
  });
});

describe('computeMonitorWindow', () => {
  it('spans two seconds either side of the marker being dragged', () => {
    expect(computeMonitorWindow({ centerMs: 5000, durationMs: 60000 })).toEqual(
      {
        start: 5000 - MONITOR_HALF_WINDOW_MS,
        end: 5000 + MONITOR_HALF_WINDOW_MS,
      },
    );
  });

  it('clamps to the start of the track', () => {
    expect(computeMonitorWindow({ centerMs: 500, durationMs: 60000 })).toEqual({
      start: 0,
      end: 2500,
    });
  });

  it('clamps to the end of the track', () => {
    expect(
      computeMonitorWindow({ centerMs: 59500, durationMs: 60000 }),
    ).toEqual({
      start: 57500,
      end: 60000,
    });
  });

  // The very first preview can land before any status update has reported a
  // duration; the window still has to be a non-empty, ordered range.
  it('falls back to the raw window end when the duration is unknown', () => {
    expect(computeMonitorWindow({ centerMs: 5000, durationMs: 0 })).toEqual({
      start: 3000,
      end: 7000,
    });
  });

  it('stays ordered when the whole window sits past a short track', () => {
    const window = computeMonitorWindow({ centerMs: 30000, durationMs: 1000 });
    expect(window.start).toBeLessThanOrEqual(window.end);
    expect(window).toEqual({ start: 1000, end: 1000 });
  });
});

describe('skipBounds', () => {
  it('is the A..B region when one is set', () => {
    expect(
      skipBounds({ markerA: 1000, markerB: 4000, durationMs: 10000 }),
    ).toEqual({
      lo: 1000,
      hi: 4000,
    });
  });

  it('is the whole track when no complete region is set', () => {
    expect(
      skipBounds({ markerA: 1000, markerB: null, durationMs: 10000 }),
    ).toEqual({
      lo: 0,
      hi: 10000,
    });
  });
});

describe('skipTargetMs', () => {
  const interval: SkipPreference = { mode: 'interval', seconds: 5 };
  const full: SkipPreference = { mode: 'full', seconds: 5 };

  it('moves the configured interval forward', () => {
    expect(
      skipTargetMs({
        direction: 1,
        fromMs: 2000,
        preference: interval,
        markerA: null,
        markerB: null,
        durationMs: 60000,
      }),
    ).toBe(7000);
  });

  it('moves the configured interval back', () => {
    expect(
      skipTargetMs({
        direction: -1,
        fromMs: 20000,
        preference: interval,
        markerA: null,
        markerB: null,
        durationMs: 60000,
      }),
    ).toBe(15000);
  });

  it('jumps to the region edge in full mode', () => {
    expect(
      skipTargetMs({
        direction: 1,
        fromMs: 2000,
        preference: full,
        markerA: 1000,
        markerB: 4000,
        durationMs: 60000,
      }),
    ).toBe(4000);
    expect(
      skipTargetMs({
        direction: -1,
        fromMs: 3000,
        preference: full,
        markerA: 1000,
        markerB: 4000,
        durationMs: 60000,
      }),
    ).toBe(1000);
  });

  it('never leaves the active region', () => {
    expect(
      skipTargetMs({
        direction: 1,
        fromMs: 3800,
        preference: interval,
        markerA: 1000,
        markerB: 4000,
        durationMs: 60000,
      }),
    ).toBe(4000);
    expect(
      skipTargetMs({
        direction: -1,
        fromMs: 1200,
        preference: interval,
        markerA: 1000,
        markerB: 4000,
        durationMs: 60000,
      }),
    ).toBe(1000);
  });

  it('never leaves the track when no region is set', () => {
    expect(
      skipTargetMs({
        direction: -1,
        fromMs: 1000,
        preference: interval,
        markerA: null,
        markerB: null,
        durationMs: 60000,
      }),
    ).toBe(0);
    expect(
      skipTargetMs({
        direction: 1,
        fromMs: 59000,
        preference: interval,
        markerA: null,
        markerB: null,
        durationMs: 60000,
      }),
    ).toBe(60000);
  });
});

describe('loopBoundaryAction', () => {
  // Playing inside an armed A..B region, one update short of the end.
  const atB = {
    isLoaded: true,
    playing: true,
    didJustFinish: false,
    positionMs: 4000,
    region: { a: 1000, b: 4000 },
    monitorActive: false,
    loopEnabled: true,
    hasCountInHandler: false,
    hasPlayer: true,
    restoringTransport: false,
  };

  it('rewinds when an armed loop reaches the end of its region', () => {
    expect(loopBoundaryAction(atB)).toBe('rewind');
  });

  it('rewinds and resumes at the natural end of the track', () => {
    // The player auto-pauses there, so this is the one restart that has to
    // press play again.
    expect(
      loopBoundaryAction({ ...atB, playing: false, didJustFinish: true }),
    ).toBe('rewind-and-resume');
  });

  it('stops at B when the loop is disarmed', () => {
    expect(loopBoundaryAction({ ...atB, loopEnabled: false })).toBe(
      'stop-at-b',
    );
  });

  it('hands off to a registered count-in instead of rewinding', () => {
    expect(loopBoundaryAction({ ...atB, hasCountInHandler: true })).toBe(
      'hand-off-to-count-in',
    );
  });

  it('lets the monitor override the loop toggle', () => {
    expect(
      loopBoundaryAction({ ...atB, monitorActive: true, loopEnabled: false }),
    ).toBe('rewind');
  });

  it('lets the monitor override a registered count-in', () => {
    expect(
      loopBoundaryAction({
        ...atB,
        monitorActive: true,
        hasCountInHandler: true,
      }),
    ).toBe('rewind');
  });

  it('does nothing before the playhead reaches the end of the region', () => {
    expect(loopBoundaryAction({ ...atB, positionMs: 3999 })).toBe('none');
  });

  it('does nothing when there is no region to leave', () => {
    expect(loopBoundaryAction({ ...atB, region: null })).toBe('none');
  });

  it('does nothing while paused short of the end', () => {
    expect(loopBoundaryAction({ ...atB, playing: false })).toBe('none');
  });

  it('does nothing before the track is loaded, or without a player', () => {
    expect(loopBoundaryAction({ ...atB, isLoaded: false })).toBe('none');
    expect(loopBoundaryAction({ ...atB, hasPlayer: false })).toBe('none');
  });

  // Without this the handler would fall through to the A/B region and issue
  // its own rewind, racing the monitor's restore seek and stealing back the
  // playhead the user had before the drag.
  it('stands aside while the monitor is restoring the transport', () => {
    expect(loopBoundaryAction({ ...atB, restoringTransport: true })).toBe(
      'none',
    );
  });
});
