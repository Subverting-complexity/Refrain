import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useTrackSource, TrackSource } from '../useTrackSource';
import { Track } from '../../types';

const mockGetTrack = jest.fn();

jest.mock('../../services/trackStore', () => ({
  getTrack: (id: string) => mockGetTrack(id),
}));

let lastResult: TrackSource;

function TestComponent(props: {
  trackId: string | null;
  fallbackUri: string | null;
  fallbackFilename: string | null;
}) {
  lastResult = useTrackSource(
    props.trackId,
    props.fallbackUri,
    props.fallbackFilename,
  );
  return null;
}

async function render(props: {
  trackId: string | null;
  fallbackUri?: string | null;
  fallbackFilename?: string | null;
}): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(TestComponent, {
        trackId: props.trackId,
        fallbackUri: props.fallbackUri ?? null,
        fallbackFilename: props.fallbackFilename ?? null,
      }),
    );
  });
  return tree;
}

const storedTrack: Track = {
  id: 't1',
  filename: 'stored.mp3',
  uri: 'blob:fresh-object-url',
  format: 'mp3',
  durationMs: 1_000,
  durationEstimated: false,
  fileSizeBytes: 100,
  importedAt: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTrack.mockResolvedValue(storedTrack);
});

describe('useTrackSource', () => {
  it('prefers the freshly resolved uri over the one passed in the route', async () => {
    await render({ trackId: 't1', fallbackUri: 'blob:stale-from-route' });

    expect(mockGetTrack).toHaveBeenCalledWith('t1');
    expect(lastResult.uri).toBe('blob:fresh-object-url');
    expect(lastResult.filename).toBe('stored.mp3');
    expect(lastResult.isResolving).toBe(false);
    expect(lastResult.isMissing).toBe(false);
  });

  it('withholds a uri while the lookup is in flight so the stale one is never loaded', async () => {
    let settle!: (track: Track | null) => void;
    mockGetTrack.mockReturnValue(
      new Promise<Track | null>((resolve) => {
        settle = resolve;
      }),
    );

    await render({ trackId: 't1', fallbackUri: 'blob:stale-from-route' });

    expect(lastResult.isResolving).toBe(true);
    expect(lastResult.uri).toBeNull();

    await act(async () => {
      settle(storedTrack);
    });

    expect(lastResult.isResolving).toBe(false);
    expect(lastResult.uri).toBe('blob:fresh-object-url');
  });

  it('reports the track as missing when it is not in the library and no fallback exists', async () => {
    mockGetTrack.mockResolvedValue(null);

    await render({ trackId: 'gone' });

    expect(lastResult.uri).toBeNull();
    expect(lastResult.isMissing).toBe(true);
    expect(lastResult.isResolving).toBe(false);
  });

  it('falls back to the route uri when the track is not in the library', async () => {
    mockGetTrack.mockResolvedValue(null);

    await render({
      trackId: 'gone',
      fallbackUri: 'file:///deep/link.mp3',
      fallbackFilename: 'link.mp3',
    });

    expect(lastResult.uri).toBe('file:///deep/link.mp3');
    expect(lastResult.filename).toBe('link.mp3');
    expect(lastResult.isMissing).toBe(false);
  });

  it('falls back to the route uri when the store read rejects', async () => {
    mockGetTrack.mockRejectedValue(new Error('db unavailable'));

    await render({ trackId: 't1', fallbackUri: 'file:///fallback.mp3' });

    expect(lastResult.uri).toBe('file:///fallback.mp3');
    expect(lastResult.isMissing).toBe(false);
  });

  it('falls back to the route uri when the store throws synchronously', async () => {
    mockGetTrack.mockImplementation(() => {
      throw new Error('native store blew up');
    });

    await render({ trackId: 't1', fallbackUri: 'file:///fallback.mp3' });

    expect(lastResult.uri).toBe('file:///fallback.mp3');
  });

  it('accepts a synchronous store result (the native API is not a promise)', async () => {
    mockGetTrack.mockReturnValue({ ...storedTrack, uri: 'file:///native.mp3' });

    await render({ trackId: 't1' });

    expect(lastResult.uri).toBe('file:///native.mp3');
  });

  it('uses the route params verbatim when there is no track id', async () => {
    await render({
      trackId: null,
      fallbackUri: 'file:///adhoc.mp3',
      fallbackFilename: 'adhoc.mp3',
    });

    expect(mockGetTrack).not.toHaveBeenCalled();
    expect(lastResult.uri).toBe('file:///adhoc.mp3');
    expect(lastResult.filename).toBe('adhoc.mp3');
    expect(lastResult.isMissing).toBe(false);
  });

  it('reports missing when there is neither a track id nor a route uri', async () => {
    await render({ trackId: null });

    expect(lastResult.isMissing).toBe(true);
  });

  it('re-resolves when the track id changes, ignoring the previous result', async () => {
    const tree = await render({ trackId: 't1' });
    expect(lastResult.uri).toBe('blob:fresh-object-url');

    mockGetTrack.mockResolvedValue({
      ...storedTrack,
      id: 't2',
      uri: 'blob:second-track',
      filename: 'second.mp3',
    });

    await act(async () => {
      tree.update(
        createElement(TestComponent, {
          trackId: 't2',
          fallbackUri: null,
          fallbackFilename: null,
        }),
      );
    });

    expect(mockGetTrack).toHaveBeenLastCalledWith('t2');
    expect(lastResult.uri).toBe('blob:second-track');
    expect(lastResult.filename).toBe('second.mp3');
  });

  it('drops a late result for a track the screen has already navigated away from', async () => {
    let settleFirst!: (track: Track | null) => void;
    mockGetTrack.mockReturnValueOnce(
      new Promise<Track | null>((resolve) => {
        settleFirst = resolve;
      }),
    );

    const tree = await render({ trackId: 't1' });

    mockGetTrack.mockResolvedValue({
      ...storedTrack,
      id: 't2',
      uri: 'blob:second-track',
    });
    await act(async () => {
      tree.update(
        createElement(TestComponent, {
          trackId: 't2',
          fallbackUri: null,
          fallbackFilename: null,
        }),
      );
    });
    expect(lastResult.uri).toBe('blob:second-track');

    // The first track's lookup lands after the switch — it must not win.
    await act(async () => {
      settleFirst({ ...storedTrack, uri: 'blob:first-track' });
    });

    expect(lastResult.uri).toBe('blob:second-track');
  });
});
