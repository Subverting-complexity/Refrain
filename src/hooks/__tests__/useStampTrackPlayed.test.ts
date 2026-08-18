import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { useStampTrackPlayed } from '../useStampTrackPlayed';
import { markTrackPlayed } from '../../services/trackStore';
import { PlaybackStatus } from '../../types';

jest.mock('../../services/trackStore', () => ({
  markTrackPlayed: jest.fn(),
}));

const mockMark = markTrackPlayed as jest.MockedFunction<typeof markTrackPlayed>;

interface Props {
  trackId: string | null;
  status: PlaybackStatus;
}

function TestComponent({ trackId, status }: Props) {
  useStampTrackPlayed(trackId, status);
  return null;
}

function render(trackId: string | null, status: PlaybackStatus) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, { trackId, status }));
  });
  return {
    rerender: (next: Props) =>
      act(() => {
        tree.update(createElement(TestComponent, next));
      }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useStampTrackPlayed', () => {
  // Opening the player is deliberately not the trigger. Refrain is a looper:
  // you pass through several tracks deciding what to work on, and if opening
  // the screen counted, "recently played" would degrade into "recently
  // tapped".
  it.each(['idle', 'loading', 'paused', 'error'] as const)(
    'does not stamp for status %p',
    (status) => {
      render('track-1', status);
      expect(mockMark).not.toHaveBeenCalled();
    },
  );

  it('stamps once when playback starts', () => {
    render('track-1', 'playing');
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(mockMark).toHaveBeenCalledWith('track-1', 1_700_000_000_000);
  });

  it('does not stamp again when a loop pauses and resumes', () => {
    const { rerender } = render('track-1', 'playing');
    rerender({ trackId: 'track-1', status: 'paused' });
    rerender({ trackId: 'track-1', status: 'playing' });
    rerender({ trackId: 'track-1', status: 'paused' });
    rerender({ trackId: 'track-1', status: 'playing' });

    // A twenty-minute practice session is one play, not one per rewind.
    expect(mockMark).toHaveBeenCalledTimes(1);
  });

  it('stamps the next track when the player switches', () => {
    const { rerender } = render('track-1', 'playing');
    rerender({ trackId: 'track-2', status: 'playing' });

    expect(mockMark).toHaveBeenCalledTimes(2);
    expect(mockMark).toHaveBeenLastCalledWith('track-2', 1_700_000_000_000);
  });

  it('does nothing without a track id', () => {
    render(null, 'playing');
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('swallows a failed write rather than surfacing it', async () => {
    mockMark.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    // A track that plays but is not stamped has still played, so the failure
    // must never reach the player.
    expect(() => render('track-1', 'playing')).not.toThrow();
    await Promise.resolve();
  });

  it('does not retry a failed write on every later loop rewind', async () => {
    mockMark.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    const { rerender } = render('track-1', 'playing');
    await Promise.resolve();
    rerender({ trackId: 'track-1', status: 'paused' });
    rerender({ trackId: 'track-1', status: 'playing' });

    expect(mockMark).toHaveBeenCalledTimes(1);
  });
});
