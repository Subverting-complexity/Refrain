import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { FolderListItem } from '../FolderListItem';

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

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

function iconNames(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByProps({ size: 20 })
    .filter((node) => typeof node.type !== 'string')
    .map((node) => node.props.name as string);
}

// Each pressable shows up once per layer it renders through, so collapse the
// matches to the distinct labels actually on offer.
function labels(renderer: ReactTestRenderer): string[] {
  return [
    ...new Set(
      renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel as string),
    ),
  ];
}

describe('FolderListItem as a folder', () => {
  it('reads as a folder, with its track count', () => {
    const renderer = render(<FolderListItem name="Scales" trackCount={4} />);

    const row = renderer.root.findByProps({
      accessibilityLabel: 'Scales folder, 4 tracks',
    });
    expect(row.props.accessibilityHint).toBe('Tap to open folder');
    act(() => renderer.unmount());
  });

  it('says "1 track" rather than "1 tracks"', () => {
    const renderer = render(<FolderListItem name="Scales" trackCount={1} />);

    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Scales folder, 1 track',
      }).length,
    ).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it('uses the folder glyph by default', () => {
    const renderer = render(<FolderListItem name="Scales" trackCount={0} />);

    expect(iconNames(renderer)).toContain('folder');
    act(() => renderer.unmount());
  });

  it('opens on press', () => {
    const onPress = jest.fn();
    const renderer = render(
      <FolderListItem name="Scales" trackCount={0} onPress={onPress} />,
    );

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Scales folder, 0 tracks' })
        .props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('offers rename and delete when the caller supplies them', () => {
    const renderer = render(
      <FolderListItem
        name="Scales"
        trackCount={0}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(labels(renderer)).toEqual(
      expect.arrayContaining(['Rename Scales', 'Delete Scales']),
    );
    act(() => renderer.unmount());
  });

  // Deleting a folder is not reversible and it moves every track inside it,
  // so it is still confirmed — but the confirmation belongs to the screen,
  // which is the only place that knows how many tracks are about to move and
  // where they are going. The row asks for the delete and no more.
  it('raises the delete request rather than confirming it here', () => {
    const onDelete = jest.fn();
    const renderer = render(
      <FolderListItem name="Scales" trackCount={2} onDelete={onDelete} />,
    );

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Delete Scales' })
        .props.onPress();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Confirm delete Scales',
      }),
    ).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('opens the action sheet on long press', () => {
    const onLongPress = jest.fn();
    const renderer = render(
      <FolderListItem
        name="Scales"
        trackCount={2}
        onPress={jest.fn()}
        onLongPress={onLongPress}
      />,
    );

    const row = renderer.root.findByProps({
      accessibilityLabel: 'Scales folder, 2 tracks',
    });
    act(() => row.props.onLongPress());

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(row.props.accessibilityHint).toBe(
      'Tap to open folder, long press for more',
    );
    act(() => renderer.unmount());
  });

  it('announces and marks a pinned folder', () => {
    const renderer = render(
      <FolderListItem
        name="Scales"
        trackCount={2}
        pinned
        onPress={jest.fn()}
      />,
    );

    // Pinned rows sit above the recently-used ones, so the row has to say it
    // is pinned or its position looks arbitrary.
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Scales folder, pinned, 2 tracks',
      }).length,
    ).toBeGreaterThan(0);
    expect(
      renderer.root.findAll((n) => n.props.name === 'pin').length,
    ).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it('shows no pin marker when the folder is not pinned', () => {
    const renderer = render(
      <FolderListItem name="Scales" trackCount={2} onPress={jest.fn()} />,
    );

    expect(renderer.root.findAll((n) => n.props.name === 'pin')).toHaveLength(
      0,
    );
    act(() => renderer.unmount());
  });
});

describe('FolderListItem as a built-in entry', () => {
  it('does not read as a folder', () => {
    const renderer = render(
      <FolderListItem
        kind="builtin"
        name="Favourites"
        icon="star"
        trackCount={3}
      />,
    );

    const row = renderer.root.findByProps({
      accessibilityLabel: 'Favourites, 3 tracks',
    });
    expect(row.props.accessibilityHint).toBe('Tap to view these tracks');
    act(() => renderer.unmount());
  });

  it('shows the glyph it was given rather than a folder', () => {
    const renderer = render(
      <FolderListItem
        kind="builtin"
        name="Favourites"
        icon="star"
        trackCount={3}
      />,
    );

    expect(iconNames(renderer)).toContain('star');
    expect(iconNames(renderer)).not.toContain('folder');
    act(() => renderer.unmount());
  });

  // A saved query has nothing to rename or delete, so the swipe actions must
  // not be there to reach for.
  it('offers no swipe actions', () => {
    const renderer = render(
      <FolderListItem
        kind="builtin"
        name="Favourites"
        icon="star"
        trackCount={3}
      />,
    );

    expect(labels(renderer)).toEqual(['Favourites, 3 tracks']);
    act(() => renderer.unmount());
  });
});
