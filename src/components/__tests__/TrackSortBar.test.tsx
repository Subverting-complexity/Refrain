import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { TrackSortBar } from '../TrackSortBar';
import { SortOption } from '../../types';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      dark: true,
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        textPrimary: '#e0f0eb',
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

function render(
  value: SortOption,
  props: Partial<React.ComponentProps<typeof TrackSortBar>> = {},
): { tree: ReactTestRenderer; onChange: jest.Mock } {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TrackSortBar value={value} onChange={onChange} {...props} />,
    );
  });
  return { tree, onChange };
}

/** The chip whose accessibility label starts with the given noun. */
function chip(tree: ReactTestRenderer, label: string) {
  return tree.root.find(
    (n) =>
      n.props.accessibilityRole === 'button' &&
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(`${label},`) &&
      typeof n.props.onPress === 'function',
  );
}

const ADDED_DESC: SortOption = { key: 'added', direction: 'desc' };

describe('TrackSortBar', () => {
  it('marks exactly one chip active', () => {
    const { tree } = render(ADDED_DESC);

    expect(chip(tree, 'Added').props.accessibilityState.selected).toBe(true);
    for (const label of ['Played', 'Name', 'Length']) {
      expect(chip(tree, label).props.accessibilityState.selected).toBe(false);
    }
  });

  it('reverses when the active chip is tapped', () => {
    const { tree, onChange } = render(ADDED_DESC);

    act(() => chip(tree, 'Added').props.onPress());

    expect(onChange).toHaveBeenCalledWith({ key: 'added', direction: 'asc' });
  });

  // The rule this exists to protect: tapping Name after Added descending
  // must not silently produce Z to A.
  it('switches to an inactive chip at its own natural direction', () => {
    const { tree, onChange } = render(ADDED_DESC);

    act(() => chip(tree, 'Name').props.onPress());

    expect(onChange).toHaveBeenCalledWith({ key: 'name', direction: 'asc' });
  });

  it.each([
    ['Played', { key: 'played', direction: 'desc' }],
    ['Length', { key: 'length', direction: 'desc' }],
  ] as const)('starts %s at its natural direction', (label, expected) => {
    const { tree, onChange } = render({ key: 'name', direction: 'asc' });

    act(() => chip(tree, label).props.onPress());

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  // Labels are static nouns. A chip that rewrote itself to "Longest first"
  // and back would make the row jump about and force a re-read.
  it('keeps a static noun label whichever way the sort runs', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const { tree } = render({ key: 'length', direction });
      expect(chip(tree, 'Length').props.accessibilityLabel).toContain(
        'Length,',
      );
    }
  });

  it('announces the direction and what a tap will do', () => {
    const { tree } = render({ key: 'length', direction: 'desc' });

    expect(chip(tree, 'Length').props.accessibilityLabel).toBe(
      'Length, sorted longest first, double tap to reverse',
    );
    expect(chip(tree, 'Name').props.accessibilityLabel).toBe(
      'Name, double tap to sort A to Z',
    );
  });

  it('shows a chevron on the active chip only, pointing with the direction', () => {
    const { tree } = render({ key: 'added', direction: 'asc' });

    expect(
      tree.root.findAll((n) => n.props.name === 'chevron-up').length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.name === 'chevron-down')).toEqual(
      [],
    );
  });

  describe('the favourites filter', () => {
    function star(tree: ReactTestRenderer) {
      return tree.root.findAll(
        (n) =>
          n.props.accessibilityRole === 'button' &&
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('favourites') &&
          typeof n.props.onPress === 'function',
      );
    }

    // Hidden inside the Favourites view, where every row is already starred
    // and the filter would do nothing.
    it('is absent unless the caller asks for it', () => {
      const { tree } = render(ADDED_DESC, { showFavoritesFilter: false });
      expect(star(tree)).toHaveLength(0);
    });

    it('toggles and says which state a tap produces', () => {
      const onToggleFavorites = jest.fn();
      const { tree } = render(ADDED_DESC, {
        showFavoritesFilter: true,
        onToggleFavorites,
      });

      expect(star(tree)[0].props.accessibilityLabel).toBe(
        'Show favourites only',
      );
      act(() => star(tree)[0].props.onPress());
      expect(onToggleFavorites).toHaveBeenCalledTimes(1);
    });

    it('reads as filtering when it is on', () => {
      const { tree } = render(ADDED_DESC, {
        showFavoritesFilter: true,
        favoritesOnly: true,
        onToggleFavorites: jest.fn(),
      });

      expect(star(tree)[0].props.accessibilityLabel).toBe(
        'Showing favourites only, double tap to show all tracks',
      );
      expect(star(tree)[0].props.accessibilityState.selected).toBe(true);
    });
  });
});
