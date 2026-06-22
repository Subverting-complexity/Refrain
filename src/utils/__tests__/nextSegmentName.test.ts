import { SegmentProfile } from '../../types';
import { nextSegmentName } from '../nextSegmentName';

function profile(name: string): SegmentProfile {
  return {
    id: name,
    trackId: 't1',
    name,
    markerA: 0,
    markerB: 1000,
    loopEnabled: true,
    createdAt: 0,
  };
}

describe('nextSegmentName', () => {
  it('starts at Segment 1 with no profiles', () => {
    expect(nextSegmentName([])).toBe('Segment 1');
  });

  it('counts past the highest Segment N name', () => {
    expect(nextSegmentName([profile('Segment 1'), profile('Segment 2')])).toBe(
      'Segment 3',
    );
  });

  it('ignores names that are not "Segment <number>"', () => {
    expect(nextSegmentName([profile('Chorus'), profile('Verse 2')])).toBe(
      'Segment 1',
    );
  });

  it('uses the max index, not the count, after a gap', () => {
    expect(nextSegmentName([profile('Segment 2'), profile('Segment 5')])).toBe(
      'Segment 6',
    );
  });
});
