import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ChipGroup, ChipOption } from '../ChipGroup';
import { darkTheme } from '../../theme';

jest.mock('../../hooks/useTheme');

const OPTIONS: ChipOption<number>[] = [
  { label: '1s', value: 1 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
];

function renderGroup(
  props: Partial<React.ComponentProps<typeof ChipGroup<number>>> = {},
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ChipGroup
        options={OPTIONS}
        value={5}
        onChange={jest.fn()}
        accessibilityLabelPrefix="Length"
        {...props}
      />,
    );
  });
  return tree;
}

function findChip(tree: ReactTestRenderer, label: string) {
  const nodes = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  return nodes[nodes.length - 1];
}

describe('ChipGroup', () => {
  it('renders one radio chip per option with prefixed labels', () => {
    const tree = renderGroup();
    for (const label of ['Length 1s', 'Length 5s', 'Length 10s']) {
      const chip = findChip(tree, label);
      expect(chip).toBeDefined();
      expect(chip.props.accessibilityRole).toBe('radio');
    }
  });

  it('marks only the matching option as selected', () => {
    const tree = renderGroup({ value: 5 });
    expect(findChip(tree, 'Length 5s').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findChip(tree, 'Length 1s').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(findChip(tree, 'Length 10s').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('fills the selected chip with the accent and keeps the outline ring', () => {
    const tree = renderGroup({ value: 5 });
    const selected = findChip(tree, 'Length 5s');
    const flat = StyleSheet.flatten(selected.props.style({ pressed: false }));
    expect(flat.backgroundColor).toBe(darkTheme.colors.accent);
    // The ring stays `outline` in both states. The accent fill is what says
    // "on"; it cannot also be the control's boundary, because in light mode
    // it is 2.30 against the page and SC 1.4.11 wants 3:1.
    expect(flat.borderColor).toBe(darkTheme.colors.outline);
  });

  it('outlines unselected chips with the outline color', () => {
    const tree = renderGroup({ value: 5 });
    const unselected = findChip(tree, 'Length 1s');
    const flat = StyleSheet.flatten(unselected.props.style({ pressed: false }));
    expect(flat.backgroundColor).toBe('transparent');
    expect(flat.borderColor).toBe(darkTheme.colors.outline);
  });

  it('calls onChange with the pressed option value', () => {
    const onChange = jest.fn();
    const tree = renderGroup({ onChange });
    act(() => findChip(tree, 'Length 10s').props.onPress());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('uses a custom isEqual for non-primitive values', () => {
    const options: ChipOption<{ id: string }>[] = [
      { label: 'Alpha', value: { id: 'a' } },
      { label: 'Beta', value: { id: 'b' } },
    ];
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <ChipGroup
          options={options}
          value={{ id: 'b' }}
          onChange={jest.fn()}
          accessibilityLabelPrefix="Mode"
          isEqual={(a, b) => a.id === b.id}
        />,
      );
    });
    expect(findChip(tree, 'Mode Beta').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findChip(tree, 'Mode Alpha').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});
