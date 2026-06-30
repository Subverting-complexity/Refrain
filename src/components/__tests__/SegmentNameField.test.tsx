import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SegmentNameField, SegmentNameFieldProps } from '../SegmentNameField';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        textPrimary: '#fff',
        textSecondary: '#aaa',
        border: '#333',
      },
      typography: { body: {} },
    },
  }),
}));

function render(overrides: Partial<SegmentNameFieldProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SegmentNameField
        value="Chorus"
        onChangeText={jest.fn()}
        accessibilityLabel="Segment name"
        {...overrides}
      />,
    );
  });
  return tree;
}

function input(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      typeof node.props.onChangeText === 'function' &&
      node.props.placeholder === 'Segment name',
  )[0];
}

describe('SegmentNameField', () => {
  it('renders the value and placeholder', () => {
    const tree = render({ value: 'Verse' });
    const field = input(tree);
    expect(field.props.value).toBe('Verse');
    expect(field.props.placeholder).toBe('Segment name');
  });

  it('forwards onChangeText', () => {
    const onChangeText = jest.fn();
    const tree = render({ onChangeText });

    act(() => input(tree).props.onChangeText('Bridge'));
    expect(onChangeText).toHaveBeenCalledWith('Bridge');
  });

  it('applies the custom accessibility label', () => {
    const tree = render({ accessibilityLabel: 'New segment name' });
    expect(input(tree).props.accessibilityLabel).toBe('New segment name');
  });

  it('auto-focuses', () => {
    const tree = render();
    expect(input(tree).props.autoFocus).toBe(true);
  });
});
