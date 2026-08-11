import {
  clampToBounds,
  markerBounds,
  MIN_MARKER_GAP_MS,
} from '../markerBounds';

const DURATION = 120000;

describe('markerBounds', () => {
  describe('marker A', () => {
    it('spans the whole track when B is unset', () => {
      expect(markerBounds('A', 5000, null, DURATION)).toEqual({
        minMs: 0,
        maxMs: DURATION,
      });
    });

    it('stops just before B so the A < B invariant holds', () => {
      expect(markerBounds('A', 5000, 8000, DURATION)).toEqual({
        minMs: 0,
        maxMs: 8000 - MIN_MARKER_GAP_MS,
      });
    });

    it('never yields a negative upper bound for a B at the very start', () => {
      expect(markerBounds('A', 0, 0, DURATION)).toEqual({
        minMs: 0,
        maxMs: 0,
      });
    });
  });

  describe('marker B', () => {
    it('spans the whole track when A is unset', () => {
      expect(markerBounds('B', null, 8000, DURATION)).toEqual({
        minMs: 0,
        maxMs: DURATION,
      });
    });

    it('starts just after A so the A < B invariant holds', () => {
      expect(markerBounds('B', 5000, 8000, DURATION)).toEqual({
        minMs: 5000 + MIN_MARKER_GAP_MS,
        maxMs: DURATION,
      });
    });

    it('collapses to the track end when A sits at the last millisecond', () => {
      expect(markerBounds('B', DURATION, DURATION, DURATION)).toEqual({
        minMs: DURATION,
        maxMs: DURATION,
      });
    });
  });

  it('never returns a range with minMs above maxMs', () => {
    for (const marker of ['A', 'B'] as const) {
      for (const durationMs of [0, 1, DURATION]) {
        for (const a of [null, 0, 5000, DURATION]) {
          for (const b of [null, 0, 5000, DURATION]) {
            const { minMs, maxMs } = markerBounds(marker, a, b, durationMs);
            expect(minMs).toBeLessThanOrEqual(maxMs);
          }
        }
      }
    }
  });

  it('treats an unknown duration as a zero-length track', () => {
    expect(markerBounds('B', null, null, 0)).toEqual({ minMs: 0, maxMs: 0 });
    expect(markerBounds('A', null, null, -1)).toEqual({ minMs: 0, maxMs: 0 });
  });
});

describe('clampToBounds', () => {
  it('passes through a value inside the range', () => {
    expect(clampToBounds(5000, { minMs: 0, maxMs: 10000 })).toBe(5000);
  });

  it('clamps below the lower bound', () => {
    expect(clampToBounds(-500, { minMs: 0, maxMs: 10000 })).toBe(0);
  });

  it('clamps above the upper bound', () => {
    expect(clampToBounds(99999, { minMs: 0, maxMs: 10000 })).toBe(10000);
  });
});
