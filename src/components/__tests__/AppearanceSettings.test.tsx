import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ColorMode } from '../../theme';
import { AppearanceSettings } from '../AppearanceSettings';

jest.mock('../../hooks/useTheme');

function render(value: ColorMode, onChange: jest.Mock): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<AppearanceSettings value={value} onChange={onChange} />);
  });
  return tree;
}

function findByText(root: ReactTestRenderer['root'], text: string) {
  return root.findAll(
    (node) => node.children?.includes(text) && typeof node.type === 'string',
  );
}

// The pressable chip is the outermost node carrying both the label and an
// onPress handler.
function findChip(root: ReactTestRenderer['root'], label: string) {
  return root.findAll(
    (node) =>
      node.props.accessibilityLabel === label && node.props.onPress != null,
  )[0]!;
}

describe('AppearanceSettings', () => {
  it('renders a chip for each mode', () => {
    const tree = render('system', jest.fn());

    expect(findByText(tree.root, 'System')).toHaveLength(1);
    expect(findByText(tree.root, 'Light')).toHaveLength(1);
    expect(findByText(tree.root, 'Dark')).toHaveLength(1);
  });

  it('marks the active mode as selected', () => {
    const tree = render('dark', jest.fn());

    expect(
      findChip(tree.root, 'Appearance Dark').props.accessibilityState,
    ).toEqual({
      selected: true,
    });
    expect(
      findChip(tree.root, 'Appearance Light').props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it('calls onChange with the chosen mode', () => {
    const onChange = jest.fn();
    const tree = render('system', onChange);

    act(() => {
      findChip(tree.root, 'Appearance Light').props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith('light');
  });
});
