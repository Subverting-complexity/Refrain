import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { TrackListItem } from '../TrackListItem';
import { Track } from '../../types';

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  const MockSwipeable = forwardRef(
    (
      {
        children,
        renderRightActions,
        containerStyle,
      }: {
        children?: unknown;
        renderRightActions?: () => unknown;
        containerStyle?: unknown;
        friction?: number;
        rightThreshold?: number;
      },
      ref: unknown,
    ) => {
      useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return (
        <View style={containerStyle}>
          {children}
          {renderRightActions?.()}
        </View>
      );
    },
  );
  MockSwipeable.displayName = 'ReanimatedSwipeable';
  return { __esModule: true, default: MockSwipeable };
});

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        surface: '#1a2e30',
        background: '#0f1e20',
        error: '#ff6b6b',
        errorText: '#fff',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
      },
      typography: {
        body: { color: '#e0f0eb' },
        caption: { color: '#8ba89e' },
      },
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

const baseTrack: Track = {
  id: 'track-1',
  filename: 'song.mp3',
  uri: 'file:///data/tracks/track-1.mp3',
  format: 'mp3',
  durationMs: 42_000,
  durationEstimated: true,
  fileSizeBytes: 1_000_000,
  importedAt: 1700000000000,
  folderId: null,
  isFavorite: false,
  lastPlayedAt: null,
};

// Accessibility label the component generates for baseTrack (formatDuration(42_000) = "0:42")
const ESTIMATED_LABEL = 'song.mp3, ~0:42, MP3';
const ACTUAL_LABEL = 'song.mp3, 0:42, MP3';

function renderItem(
  track: Track,
  props?: Partial<React.ComponentProps<typeof TrackListItem>>,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<TrackListItem track={track} {...props} />);
  });
  return tree;
}

describe('TrackListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes ~ in accessibility label when duration is estimated', () => {
    const tree = renderItem(baseTrack);
    const pressable = tree.root.findByProps({
      accessibilityLabel: ESTIMATED_LABEL,
    });
    expect(pressable.props.accessibilityLabel).toContain('~');
  });

  it('omits ~ from accessibility label when duration is actual', () => {
    const track = { ...baseTrack, durationEstimated: false };
    const tree = renderItem(track);
    const pressable = tree.root.findByProps({
      accessibilityLabel: ACTUAL_LABEL,
    });
    expect(pressable.props.accessibilityLabel).not.toContain('~');
  });

  // The confirm dialog's action buttons, once the dialog is open. Empty
  // arrays mean the dialog is not shown.
  function findConfirmButton(tree: ReactTestRenderer) {
    return tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Confirm delete song.mp3' &&
        typeof node.props.onPress === 'function',
    );
  }
  function findCancelButton(tree: ReactTestRenderer) {
    return tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Cancel delete' &&
        typeof node.props.onPress === 'function',
    );
  }

  describe('long press', () => {
    it('shows the confirmation dialog when long-pressed with onDelete provided', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      expect(findConfirmButton(tree).length).toBeGreaterThanOrEqual(1);
      expect(findCancelButton(tree).length).toBeGreaterThanOrEqual(1);
    });

    it('does not show the dialog when long-pressed without onDelete', () => {
      const tree = renderItem(baseTrack);

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      expect(findConfirmButton(tree)).toHaveLength(0);
    });

    it('calls onDelete with the track id when the Delete button is confirmed', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });
      act(() => {
        findConfirmButton(tree)[0].props.onPress();
      });

      expect(onDelete).toHaveBeenCalledWith('track-1');
      // Confirming dismisses the dialog.
      expect(findConfirmButton(tree)).toHaveLength(0);
    });

    it('does not call onDelete when Cancel is tapped', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });
      act(() => {
        findCancelButton(tree)[0].props.onPress();
      });

      expect(onDelete).not.toHaveBeenCalled();
      expect(findConfirmButton(tree)).toHaveLength(0);
    });
  });

  describe('swipe-to-delete action', () => {
    it('renders a swipe delete button when onDelete is provided', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      expect(deleteBtn).toBeDefined();
    });

    it('shows the confirmation dialog when the swipe delete button is pressed', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });

      expect(findConfirmButton(tree).length).toBeGreaterThanOrEqual(1);
    });

    it('calls onDelete with the track id after confirming via swipe', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });
      act(() => {
        findConfirmButton(tree)[0].props.onPress();
      });

      expect(onDelete).toHaveBeenCalledWith('track-1');
    });

    it('does not call onDelete when swipe-delete Cancel is tapped', () => {
      const onDelete = jest.fn();
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });
      act(() => {
        findCancelButton(tree)[0].props.onPress();
      });

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe('swipe-to-rename action', () => {
    // The rename dialog's field and Save button, once it is open. Empty
    // arrays mean the dialog is not shown.
    function findRenameField(tree: ReactTestRenderer) {
      return tree.root.findAll(
        (node) =>
          node.props.accessibilityLabel === 'Track name' &&
          typeof node.props.onChangeText === 'function',
      );
    }
    function findRenameSave(tree: ReactTestRenderer) {
      return tree.root.findAll(
        (node) =>
          node.props.accessibilityLabel === 'Confirm rename song.mp3' &&
          typeof node.props.onPress === 'function',
      );
    }

    function openRename(tree: ReactTestRenderer) {
      act(() => {
        tree.root
          .findByProps({ accessibilityLabel: 'Rename song.mp3' })
          .props.onPress();
      });
    }

    it('renders a swipe rename button when onRename is provided', () => {
      const tree = renderItem(baseTrack, { onRename: jest.fn() });

      expect(
        tree.root.findByProps({ accessibilityLabel: 'Rename song.mp3' }),
      ).toBeDefined();
    });

    it('renders no rename button when onRename is omitted', () => {
      const tree = renderItem(baseTrack, { onDelete: jest.fn() });

      expect(
        tree.root.findAll(
          (node) => node.props.accessibilityLabel === 'Rename song.mp3',
        ),
      ).toHaveLength(0);
    });

    it('opens the rename dialog seeded with the base name', () => {
      const tree = renderItem(baseTrack, { onRename: jest.fn() });

      openRename(tree);

      expect(findRenameField(tree)[0].props.value).toBe('song');
    });

    it('calls onRename with the id and the extension-preserving filename', () => {
      const onRename = jest.fn();
      const tree = renderItem(baseTrack, { onRename });

      openRename(tree);
      act(() => findRenameField(tree)[0].props.onChangeText('Practice take'));
      act(() => findRenameSave(tree)[0].props.onPress());

      expect(onRename).toHaveBeenCalledWith('track-1', 'Practice take.mp3');
      // Saving dismisses the dialog.
      expect(findRenameField(tree)).toHaveLength(0);
    });

    it('does not call onRename when the dialog is cancelled', () => {
      const onRename = jest.fn();
      const tree = renderItem(baseTrack, { onRename });

      openRename(tree);
      act(() => {
        tree.root
          .findAll(
            (node) =>
              node.props.accessibilityLabel === 'Cancel' &&
              typeof node.props.onPress === 'function',
          )[0]
          .props.onPress();
      });

      expect(onRename).not.toHaveBeenCalled();
      expect(findRenameField(tree)).toHaveLength(0);
    });

    it('does not call onRename when the name is left unchanged', () => {
      const onRename = jest.fn();
      const tree = renderItem(baseTrack, { onRename });

      openRename(tree);
      act(() => findRenameSave(tree)[0].props.onPress());

      expect(onRename).not.toHaveBeenCalled();
      expect(findRenameField(tree)).toHaveLength(0);
    });

    it('re-seeds the field from the current filename on each open', () => {
      const onRename = jest.fn();
      const tree = renderItem(baseTrack, { onRename });

      openRename(tree);
      act(() => findRenameField(tree)[0].props.onChangeText('Discarded edit'));
      act(() => {
        tree.root
          .findAll(
            (node) =>
              node.props.accessibilityLabel === 'Cancel' &&
              typeof node.props.onPress === 'function',
          )[0]
          .props.onPress();
      });
      openRename(tree);

      expect(findRenameField(tree)[0].props.value).toBe('song');
    });

    it('offers both actions when rename and delete are wired up', () => {
      const tree = renderItem(baseTrack, {
        onRename: jest.fn(),
        onDelete: jest.fn(),
      });

      expect(
        tree.root.findByProps({ accessibilityLabel: 'Rename song.mp3' }),
      ).toBeDefined();
      expect(
        tree.root.findByProps({ accessibilityLabel: 'Delete song.mp3' }),
      ).toBeDefined();
    });
  });

  describe('accessibility hint', () => {
    it('includes swipe left in the hint when both onPress and onDelete are given', () => {
      const onDelete = jest.fn();
      const onPress = jest.fn();
      const tree = renderItem(baseTrack, { onDelete, onPress });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toContain('swipe left');
    });

    it('sets hint for play only when no onDelete is given', () => {
      const onPress = jest.fn();
      const tree = renderItem(baseTrack, { onPress });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toBe('Tap to play');
    });

    it('names both swipe targets when rename and delete are wired up', () => {
      const tree = renderItem(baseTrack, {
        onPress: jest.fn(),
        onRename: jest.fn(),
        onDelete: jest.fn(),
      });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toBe(
        'Tap to play, swipe left to rename or delete, long press to delete',
      );
    });

    // The hint must not advertise a gesture the row does not wire up.
    it('names only rename when delete is not wired up', () => {
      const tree = renderItem(baseTrack, {
        onPress: jest.fn(),
        onRename: jest.fn(),
      });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toBe(
        'Tap to play, swipe left to rename',
      );
    });

    it('capitalizes the hint when the row is not tappable', () => {
      const tree = renderItem(baseTrack, { onRename: jest.fn() });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toBe('Swipe left to rename');
    });

    it('omits the hint entirely when no action is wired up', () => {
      const tree = renderItem(baseTrack);

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      expect(pressable.props.accessibilityHint).toBeUndefined();
    });
  });
});
