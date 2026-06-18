import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SegmentProfile } from '../../types';
import {
  SegmentProfileSheet,
  SegmentProfileSheetProps,
} from '../SegmentProfileSheet';

const mockSave = jest.fn();
const mockRename = jest.fn();
const mockRemove = jest.fn();
let mockProfiles: SegmentProfile[] = [];

jest.mock('../../hooks/useSegmentProfiles', () => ({
  useSegmentProfiles: () => ({
    profiles: mockProfiles,
    refresh: jest.fn(),
    save: mockSave,
    rename: mockRename,
    remove: mockRemove,
  }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        surface: '#111',
        textPrimary: '#fff',
        textSecondary: '#aaa',
        accent: '#0f0',
        border: '#333',
        error: '#f00',
      },
      typography: { heading: {}, body: {}, caption: {} },
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: (props: Record<string, unknown>) => <View {...props} /> };
});

function profile(id: string, name: string): SegmentProfile {
  return {
    id,
    trackId: 't1',
    name,
    markerA: 1000,
    markerB: 5000,
    loopEnabled: true,
    createdAt: 1,
  };
}

function render(overrides: Partial<SegmentProfileSheetProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SegmentProfileSheet
        trackId="t1"
        markerA={1000}
        markerB={5000}
        loopEnabled={true}
        onLoadProfile={jest.fn()}
        onClose={jest.fn()}
        {...overrides}
      />,
    );
  });
  return tree;
}

function byLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

function inputByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

function findText(tree: ReactTestRenderer, text: string) {
  return tree.root.findAll(
    (node) => node.type === 'Text' && node.children.join('') === text,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfiles = [profile('p1', 'Segment 1'), profile('p2', 'Chorus')];
});

describe('SegmentProfileSheet', () => {
  it('renders the saved profiles', () => {
    const tree = render();
    expect(byLabel(tree, 'Load segment Segment 1')).toBeDefined();
    expect(byLabel(tree, 'Load segment Chorus')).toBeDefined();
  });

  it('shows an empty state when there are no profiles', () => {
    mockProfiles = [];
    const tree = render();
    expect(findText(tree, 'No saved segments yet').length).toBe(1);
  });

  it('loads a profile and closes when a row is tapped', () => {
    const onLoadProfile = jest.fn();
    const onClose = jest.fn();
    const tree = render({ onLoadProfile, onClose });

    act(() => {
      byLabel(tree, 'Load segment Chorus').props.onPress();
    });

    expect(onLoadProfile).toHaveBeenCalledWith(profile('p2', 'Chorus'));
    expect(onClose).toHaveBeenCalled();
  });

  it('saves the current region under an edited name', () => {
    const tree = render({ markerA: 2000, markerB: 8000, loopEnabled: false });

    act(() => {
      byLabel(tree, 'Save current segment').props.onPress();
    });
    // The name input is pre-filled with the next "Segment N".
    expect(inputByLabel(tree, 'New segment name').props.value).toBe(
      'Segment 2',
    );

    act(() => {
      inputByLabel(tree, 'New segment name').props.onChangeText('Bridge');
    });
    act(() => {
      byLabel(tree, 'Confirm save segment').props.onPress();
    });

    expect(mockSave).toHaveBeenCalledWith({
      name: 'Bridge',
      markerA: 2000,
      markerB: 8000,
      loopEnabled: false,
    });
  });

  it('disables save when there is no valid A/B region', () => {
    const tree = render({ markerA: 1000, markerB: null });
    const button = byLabel(tree, 'Save current segment');
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(button.props.disabled).toBe(true);
  });

  it('renames a profile', () => {
    const tree = render();

    act(() => {
      byLabel(tree, 'Rename Chorus').props.onPress();
    });
    act(() => {
      inputByLabel(tree, 'Segment name').props.onChangeText('Chorus 2');
    });
    act(() => {
      byLabel(tree, 'Confirm rename').props.onPress();
    });

    expect(mockRename).toHaveBeenCalledWith('p2', 'Chorus 2');
  });

  it('deletes a profile after confirmation', () => {
    const tree = render();

    act(() => {
      byLabel(tree, 'Delete Segment 1').props.onPress();
    });
    act(() => {
      byLabel(tree, 'Confirm delete Segment 1').props.onPress();
    });

    expect(mockRemove).toHaveBeenCalledWith('p1');
  });
});
