import { contrastRatio, luminance, mix, withAlpha } from '../color';

describe('withAlpha', () => {
  it('appends a full-opacity byte for alpha 1', () => {
    expect(withAlpha('#7edbb8', 1)).toBe('#7edbb8ff');
  });

  it('appends a zero byte for alpha 0', () => {
    expect(withAlpha('#7edbb8', 0)).toBe('#7edbb800');
  });

  it('pads single-digit bytes to two characters', () => {
    // 0.02 * 255 = 5.1 → 0x05, which must not collapse to a 7-char colour.
    expect(withAlpha('#7edbb8', 0.02)).toBe('#7edbb805');
  });

  it('rounds to the nearest byte', () => {
    expect(withAlpha('#000000', 0.5)).toBe('#00000080');
  });

  // Callers compose tiers arithmetically (a base plus a scaled amplitude), so
  // an out-of-range sum has to land on the end of the range, not wrap.
  it('clamps alpha above 1', () => {
    expect(withAlpha('#7edbb8', 1.4)).toBe('#7edbb8ff');
  });

  it('clamps alpha below 0', () => {
    expect(withAlpha('#7edbb8', -0.3)).toBe('#7edbb800');
  });
});

// The contrast suite in src/theme only ever asserts `ratio >= threshold`,
// so a formula that returned inflated numbers would satisfy every one of
// those assertions while hiding real failures. These anchor the function
// to values that are fixed by the spec rather than by the palette.
describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 10);
    expect(luminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('weights green far above blue', () => {
    // The WCAG coefficients themselves: 0.7152 against 0.0722.
    expect(luminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(luminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('uses the linear segment below the 0.03928 threshold', () => {
    // 10/255 = 0.0392, just under it, so the value is c/12.92 and not the
    // gamma curve. Getting this branch wrong barely moves mid-tones and
    // would go unnoticed without an assertion on it.
    expect(luminance('#0a0a0a')).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it('rejects anything that is not a six-digit hex', () => {
    // An eight-digit value is the dangerous one: it would otherwise parse
    // as the opaque colour and overstate contrast. `withAlpha` makes them.
    expect(luminance(withAlpha('#7edbb8', 0.12))).toBeNaN();
    expect(luminance('#fff')).toBeNaN();
    expect(luminance('rgba(0, 0, 0, 0.5)')).toBeNaN();
  });

  it('accepts a hex with or without the leading hash', () => {
    expect(luminance('7edbb8')).toBe(luminance('#7edbb8'));
  });
});

describe('contrastRatio', () => {
  it('is 21 for black against white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#3fae87', '#3fae87')).toBeCloseTo(1, 10);
  });

  it('does not depend on the order of its arguments', () => {
    expect(contrastRatio('#12241e', '#dfeee7')).toBeCloseTo(
      contrastRatio('#dfeee7', '#12241e'),
      10,
    );
  });

  it('never reports below 1', () => {
    // The formula divides the lighter by the darker, so the floor holds
    // whichever way round the pair is passed.
    expect(contrastRatio('#ffffff', '#000000')).toBeGreaterThanOrEqual(1);
    expect(contrastRatio('#7edbb8', '#111d1f')).toBeGreaterThanOrEqual(1);
  });
});

describe('mix', () => {
  it('is the start colour at 0 and the end colour at 1', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('blends each channel independently', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#204060', '#60a0e0', 0.5)).toBe('#4070a0');
  });

  // Callers hand it an amplitude or a ratio, so it clamps rather than
  // asking every one of them to guard the ends itself.
  it('clamps a fraction outside 0..1', () => {
    expect(mix('#000000', '#ffffff', -3)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 42)).toBe('#ffffff');
  });

  it('keeps two-digit channels zero-padded', () => {
    expect(mix('#000000', '#0f0f0f', 1)).toBe('#0f0f0f');
    expect(mix('#000000', '#101010', 0.5)).toBe('#080808');
  });

  it('accepts a hex without its leading hash', () => {
    expect(mix('000000', 'ffffff', 1)).toBe('#ffffff');
  });

  // Same rejection as `luminance`: a plausible-looking wrong colour is
  // worse than an obviously wrong one.
  it('treats anything that is not a six-digit hex as black', () => {
    expect(mix('#fff', '#ffffff', 0)).toBe('#000000');
    expect(mix('#ffffff', 'rgb(0,0,0)', 1)).toBe('#000000');
    expect(mix('#7edbb8ff', '#ffffff', 0)).toBe('#000000');
  });
});
