import { clampRatio, thumbOffsetPx } from '../sliderGeometry';

describe('clampRatio', () => {
  it('passes a position inside the track through unchanged', () => {
    expect(clampRatio(0)).toBe(0);
    expect(clampRatio(0.25)).toBe(0.25);
    expect(clampRatio(1)).toBe(1);
  });

  it('clamps a position dragged past either end', () => {
    expect(clampRatio(-0.4)).toBe(0);
    expect(clampRatio(1.8)).toBe(1);
  });

  // A duration of zero divides to NaN upstream, and a scale of NaN blanks the
  // fill rather than emptying it.
  it('reads a value that is not a number as the start of the track', () => {
    expect(clampRatio(Number.NaN)).toBe(0);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampRatio(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('thumbOffsetPx', () => {
  it('places the thumb proportionally along the measured track', () => {
    expect(thumbOffsetPx(0, 200)).toBe(0);
    expect(thumbOffsetPx(0.5, 200)).toBe(100);
    expect(thumbOffsetPx(1, 200)).toBe(200);
  });

  it('keeps the thumb on the track for a position outside it', () => {
    expect(thumbOffsetPx(-1, 200)).toBe(0);
    expect(thumbOffsetPx(2, 200)).toBe(200);
  });

  // Before the first layout, so the thumb starts at the left edge rather than
  // somewhere arbitrary.
  it('parks the thumb at zero until the track has been measured', () => {
    expect(thumbOffsetPx(0.5, 0)).toBe(0);
    expect(thumbOffsetPx(0.5, Number.NaN)).toBe(0);
  });
});
