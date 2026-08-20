import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  SegmentRenameDialog,
  SegmentRenameDialogProps,
} from '../SegmentRenameDialog';

jest.mock('../../hooks/useTheme');

function render(overrides: Partial<SegmentRenameDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SegmentRenameDialog
        currentName="Chorus"
        onSave={jest.fn()}
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

function input(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Segment name' &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

describe('SegmentRenameDialog', () => {
  it('pre-fills the field with the current name', () => {
    const tree = render({ currentName: 'Verse' });
    expect(input(tree).props.value).toBe('Verse');
  });

  it('saves the trimmed new name', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('  Bridge  '));
    act(() => byLabel(tree, 'Confirm rename').props.onPress());

    expect(onSave).toHaveBeenCalledWith('Bridge');
  });

  it('cancels instead of saving when the field is blanked', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => input(tree).props.onChangeText('   '));
    act(() => byLabel(tree, 'Confirm rename').props.onPress());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels when the Cancel button is pressed', () => {
    const onCancel = jest.fn();
    const tree = render({ onCancel });

    act(() => byLabel(tree, 'Cancel').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });
});
