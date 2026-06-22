import React from 'react';
import { Alert } from 'react-native';
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

  describe('long press', () => {
    it('shows a confirmation alert when long-pressed with onDelete provided', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Delete Track',
        'Remove "song.mp3" from library?',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ]),
      );
    });

    it('does not show an alert when long-pressed without onDelete', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack);

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('calls onDelete with the track id when the Delete button is confirmed', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      const deleteBtn = buttons.find((b) => b.text === 'Delete');

      act(() => {
        deleteBtn?.onPress?.();
      });

      expect(onDelete).toHaveBeenCalledWith('track-1');
    });

    it('does not call onDelete when Cancel is tapped', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const pressable = tree.root.findByProps({
        accessibilityLabel: ESTIMATED_LABEL,
      });

      act(() => {
        pressable.props.onLongPress();
      });

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      const cancelBtn = buttons.find((b) => b.text === 'Cancel');

      act(() => {
        cancelBtn?.onPress?.();
      });

      expect(onDelete).not.toHaveBeenCalled();
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

    it('shows a confirmation alert when the swipe delete button is pressed', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Delete Track',
        'Remove "song.mp3" from library?',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ]),
      );
    });

    it('calls onDelete with the track id after confirming via swipe', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      const confirmBtn = buttons.find((b) => b.text === 'Delete');

      act(() => {
        confirmBtn?.onPress?.();
      });

      expect(onDelete).toHaveBeenCalledWith('track-1');
    });

    it('does not call onDelete when swipe-delete Cancel is tapped', () => {
      const onDelete = jest.fn();
      const alertSpy = jest.spyOn(Alert, 'alert');
      const tree = renderItem(baseTrack, { onDelete });

      const deleteBtn = tree.root.findByProps({
        accessibilityLabel: 'Delete song.mp3',
      });

      act(() => {
        deleteBtn.props.onPress();
      });

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      const cancelBtn = buttons.find((b) => b.text === 'Cancel');

      act(() => {
        cancelBtn?.onPress?.();
      });

      expect(onDelete).not.toHaveBeenCalled();
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
  });
});
