import { withAlpha } from '../color';

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
