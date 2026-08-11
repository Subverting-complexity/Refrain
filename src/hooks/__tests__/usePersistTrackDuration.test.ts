import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { updateTrackDuration } from '../../services/trackStore';
import { usePersistTrackDuration } from '../usePersistTrackDuration';

jest.mock('../../services/trackStore', () => ({
  updateTrackDuration: jest.fn(),
}));

const mockUpdate = updateTrackDuration as jest.MockedFunction<
  typeof updateTrackDuration
>;

interface Props {
  trackId: string | null;
  durationMs: number;
}

function TestComponent({ trackId, durationMs }: Props) {
  usePersistTrackDuration(trackId, durationMs);
  return null;
}

function render(props: Props) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, props));
  });
  return {
    update: (next: Props) =>
      act(() => {
        tree.update(createElement(TestComponent, next));
      }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePersistTrackDuration', () => {
  it('persists the duration once it is known', () => {
    const api = render({ trackId: 't1', durationMs: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();

    api.update({ trackId: 't1', durationMs: 12345 });

    expect(mockUpdate).toHaveBeenCalledWith('t1', 12345);
  });

  it('writes only once per track as the duration settles', () => {
    const api = render({ trackId: 't1', durationMs: 12345 });
    api.update({ trackId: 't1', durationMs: 12400 });
    api.update({ trackId: 't1', durationMs: 12401 });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a track id', () => {
    render({ trackId: null, durationMs: 12345 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // #168: expo-router can reuse the component instance across tracks, so the
  // guard has to reset or the second track never records its duration.
  it('persists again when the track changes on a reused instance', () => {
    const api = render({ trackId: 't1', durationMs: 12345 });
    api.update({ trackId: 't2', durationMs: 6789 });

    expect(mockUpdate).toHaveBeenCalledWith('t1', 12345);
    expect(mockUpdate).toHaveBeenCalledWith('t2', 6789);
  });

  it('retries on the next update when the write fails synchronously', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new Error('sqlite is unhappy');
    });
    const api = render({ trackId: 't1', durationMs: 12345 });

    // Let the rejected settle() promise reach its catch before re-rendering.
    await act(async () => {});
    api.update({ trackId: 't1', durationMs: 12400 });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith('t1', 12400);
  });

  it('retries on the next update when the write rejects', async () => {
    mockUpdate.mockReturnValueOnce(
      Promise.reject(new Error('web store is unhappy')) as ReturnType<
        typeof updateTrackDuration
      >,
    );
    const api = render({ trackId: 't1', durationMs: 12345 });

    await act(async () => {});
    api.update({ trackId: 't1', durationMs: 12400 });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
