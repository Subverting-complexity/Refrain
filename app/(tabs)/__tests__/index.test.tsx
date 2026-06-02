import React from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import LibraryScreen from '../index';
import { loadTracks } from '@/src/services/trackStore';
import { Track } from '@/src/types';

jest.mock('@/src/services/trackStore', () => ({
  loadTracks: jest.fn(),
  insertTrack: jest.fn(),
  deleteTrack: jest.fn(),
}));

jest.mock('@/src/services/fileImport', () => ({
  pickAndImportFile: jest.fn(),
}));

jest.mock('@/src/hooks/useShareIntent', () => ({
  useShareIntent: jest.fn(),
}));

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: { background: '#000', accent: '#0f0', accentText: '#000' },
      typography: { heading: {}, body: {}, caption: {} },
    },
  }),
}));

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      ReactLocal.useEffect(() => {
        cb();
      }, [cb]);
    },
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/src/components/ImportButton', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return { ImportButton: () => ReactLocal.createElement(View) };
});

jest.mock('@/src/components/TrackListItem', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return { TrackListItem: () => ReactLocal.createElement(View) };
});

const mockLoadTracks = loadTracks as jest.MockedFunction<typeof loadTracks>;

const sampleTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///song.mp3',
  format: 'mp3',
  durationMs: 1000,
  durationEstimated: false,
  fileSizeBytes: 2048,
  importedAt: 0,
};

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<LibraryScreen />);
  });
  return renderer;
}

describe('LibraryScreen load/refresh failure announcements', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  it('announces a failure when the initial load rejects', async () => {
    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));

    const renderer = await renderScreen();

    expect(announceSpy).toHaveBeenCalledWith('Failed to load library');
    act(() => renderer.unmount());
  });

  it('does not announce a failure when the initial load succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);

    const renderer = await renderScreen();

    expect(announceSpy).not.toHaveBeenCalledWith('Failed to load library');
    act(() => renderer.unmount());
  });

  it('announces a failure when pull-to-refresh rejects', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockLoadTracks.mockRejectedValueOnce(new Error('db read failed'));
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;

    await act(async () => {
      await onRefresh();
    });

    expect(announceSpy).toHaveBeenCalledWith('Failed to refresh library');
    expect(announceSpy).not.toHaveBeenCalledWith('Library refreshed');
    act(() => renderer.unmount());
  });

  it('announces success when pull-to-refresh succeeds', async () => {
    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const renderer = await renderScreen();

    mockLoadTracks.mockResolvedValueOnce([sampleTrack]);
    const onRefresh =
      renderer.root.findByType(FlatList).props.refreshControl.props.onRefresh;

    await act(async () => {
      await onRefresh();
    });

    expect(announceSpy).toHaveBeenCalledWith('Library refreshed');
    expect(announceSpy).not.toHaveBeenCalledWith('Failed to refresh library');
    act(() => renderer.unmount());
  });
});
