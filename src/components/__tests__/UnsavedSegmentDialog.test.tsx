import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  UnsavedSegmentDialog,
  UnsavedSegmentDialogProps,
} from '../UnsavedSegmentDialog';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        surface: '#111',
        textPrimary: '#fff',
        textSecondary: '#aaa',
        accent: '#0f0',
        accentText: '#000',
        error: '#f00',
        border: '#333',
      },
      typography: { heading: {}, body: {} },
    },
  }),
}));

function render(overrides: Partial<UnsavedSegmentDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <UnsavedSegmentDialog
        profileName="Verse"
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        onCancel={jest.fn()}
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

describe('UnsavedSegmentDialog', () => {
  it('fires onSave', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });
    act(() => byLabel(tree, 'Save segment changes').props.onPress());
    expect(onSave).toHaveBeenCalled();
  });

  it('fires onDiscard', () => {
    const onDiscard = jest.fn();
    const tree = render({ onDiscard });
    act(() => byLabel(tree, 'Discard segment changes').props.onPress());
    expect(onDiscard).toHaveBeenCalled();
  });

  it('fires onCancel', () => {
    const onCancel = jest.fn();
    const tree = render({ onCancel });
    act(() => byLabel(tree, 'Cancel').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });
});
