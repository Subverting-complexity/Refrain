import { createElement, StrictMode } from 'react';
import { Platform } from 'react-native';
import { create, act } from 'react-test-renderer';

import { useShareIntent } from '../useShareIntent';
import { ImportOutcome, Track } from '../../types';

const mockGetInitialURL = jest.fn<Promise<string | null>, []>();
const mockRemove = jest.fn();
let urlListener: ((event: { url: string }) => void) | undefined;

jest.mock('expo-linking', () => ({
  getInitialURL: () => mockGetInitialURL(),
  addEventListener: (_event: string, handler: (e: { url: string }) => void) => {
    urlListener = handler;
    return { remove: mockRemove };
  },
}));

const mockImportFromUri = jest.fn<Promise<ImportOutcome>, [string, string]>();
const mockIsSupportedFilename = jest.fn<boolean, [string]>();

jest.mock('../../services/fileImport', () => ({
  importFromUri: (...args: [string, string]) => mockImportFromUri(...args),
  isSupportedFilename: (...args: [string]) => mockIsSupportedFilename(...args),
}));

function makeTrack(id: string): Track {
  return {
    id,
    filename: 'song.mp3',
    uri: `file:///tracks/${id}.mp3`,
    format: 'mp3',
    durationMs: 1000,
    durationEstimated: true,
    fileSizeBytes: 1234,
    importedAt: 0,
  };
}

const onTrackImported = jest.fn();
const onError = jest.fn();

function TestComponent() {
  useShareIntent({ onTrackImported, onError });
  return null;
}

// Lets the getInitialURL promise and the chained importFromUri promise settle.
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  urlListener = undefined;
  mockIsSupportedFilename.mockReturnValue(true);
  Platform.OS = 'ios';
});

describe('useShareIntent', () => {
  it('imports a shared initial URL once on a normal single mount', async () => {
    mockGetInitialURL.mockResolvedValue('refrain://share/song.mp3');
    mockImportFromUri.mockResolvedValue({
      success: true,
      track: makeTrack('a'),
    });

    await act(async () => {
      create(createElement(TestComponent));
    });
    await flushMicrotasks();

    expect(mockImportFromUri).toHaveBeenCalledTimes(1);
    expect(onTrackImported).toHaveBeenCalledTimes(1);
  });

  it('imports a given initial URL once even when the mount effect runs twice', async () => {
    mockGetInitialURL.mockResolvedValue('refrain://share/song.mp3');
    mockImportFromUri.mockResolvedValue({
      success: true,
      track: makeTrack('a'),
    });

    // StrictMode double-invokes the mount effect in dev (mount → cleanup →
    // mount), reproducing the duplicate-import path the guard defends against.
    await act(async () => {
      create(createElement(StrictMode, null, createElement(TestComponent)));
    });
    await flushMicrotasks();

    // The effect ran more than once, so the shared link was resolved twice...
    expect(mockGetInitialURL.mock.calls.length).toBeGreaterThan(1);
    // ...but the guard let it import only once.
    expect(mockImportFromUri).toHaveBeenCalledTimes(1);
    expect(onTrackImported).toHaveBeenCalledTimes(1);
  });

  it('still imports each foreground share that arrives via the url event', async () => {
    mockGetInitialURL.mockResolvedValue(null);
    mockImportFromUri
      .mockResolvedValueOnce({ success: true, track: makeTrack('a') })
      .mockResolvedValueOnce({ success: true, track: makeTrack('b') });

    await act(async () => {
      create(createElement(TestComponent));
    });
    await flushMicrotasks();

    await act(async () => {
      urlListener?.({ url: 'refrain://share/first.mp3' });
    });
    await flushMicrotasks();
    await act(async () => {
      urlListener?.({ url: 'refrain://share/second.mp3' });
    });
    await flushMicrotasks();

    expect(mockImportFromUri).toHaveBeenCalledTimes(2);
    expect(onTrackImported).toHaveBeenCalledTimes(2);
  });

  it('does nothing on web', async () => {
    Platform.OS = 'web';
    mockGetInitialURL.mockResolvedValue('refrain://share/song.mp3');

    await act(async () => {
      create(createElement(TestComponent));
    });
    await flushMicrotasks();

    expect(mockGetInitialURL).not.toHaveBeenCalled();
    expect(mockImportFromUri).not.toHaveBeenCalled();
  });
});
