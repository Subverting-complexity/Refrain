import {
  DEFAULT_WAVEFORM_HEIGHT,
  waveformHeightForViewport,
} from '../waveformLayout';

describe('waveformHeightForViewport', () => {
  it('scales the surface to the viewport', () => {
    expect(waveformHeightForViewport(1000)).toBe(280);
  });

  it('never goes below the floor on a short viewport', () => {
    expect(waveformHeightForViewport(400)).toBe(DEFAULT_WAVEFORM_HEIGHT);
  });

  it('stops growing on a tall one', () => {
    expect(waveformHeightForViewport(4000)).toBe(340);
  });

  /**
   * The reason this is clamped and rounded rather than raw. Android reports a
   * metric change for every inset and soft-keyboard event, and the component
   * that reads the viewport only absorbs them if nearly all of them come back
   * as the height already in use.
   */
  it('returns the same height either side of a small metric change', () => {
    expect(waveformHeightForViewport(900)).toBe(waveformHeightForViewport(901));
  });
});
