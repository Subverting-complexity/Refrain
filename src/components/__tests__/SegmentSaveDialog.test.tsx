import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  SegmentSaveDialog,
  SegmentSaveDialogProps,
} from '../SegmentSaveDialog';

jest.mock('../../hooks/useTheme');

function render(overrides: Partial<SegmentSaveDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SegmentSaveDialog
        loadedName={null}
        suggestedName="Segment 3"
        onOverride={jest.fn()}
        onSaveNew={jest.fn()}
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
      node.props.accessibilityLabel === 'New segment name' &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

describe('SegmentSaveDialog', () => {
  it('offers the choice step when a dirty segment is loaded', () => {
    const onOverride = jest.fn();
    const tree = render({ loadedName: 'Verse', onOverride });

    expect(byLabel(tree, 'Override loaded segment')).toBeDefined();
    expect(input(tree)).toBeUndefined();

    act(() => byLabel(tree, 'Override loaded segment').props.onPress());
    expect(onOverride).toHaveBeenCalled();
  });

  it('reveals the name field after choosing "Save as new"', () => {
    const onSaveNew = jest.fn();
    const tree = render({ loadedName: 'Verse', onSaveNew });

    act(() => byLabel(tree, 'Save as new segment').props.onPress());
    expect(input(tree).props.value).toBe('Segment 3');

    act(() => input(tree).props.onChangeText('Bridge'));
    act(() => byLabel(tree, 'Confirm save new segment').props.onPress());

    expect(onSaveNew).toHaveBeenCalledWith('Bridge');
  });

  it('opens straight to the name field when nothing is loaded', () => {
    const onSaveNew = jest.fn();
    const tree = render({ loadedName: null, onSaveNew });

    expect(input(tree).props.value).toBe('Segment 3');
    act(() => byLabel(tree, 'Confirm save new segment').props.onPress());

    expect(onSaveNew).toHaveBeenCalledWith('Segment 3');
  });

  it('falls back to the suggested name when the field is blanked', () => {
    const onSaveNew = jest.fn();
    const tree = render({
      loadedName: null,
      suggestedName: 'Segment 5',
      onSaveNew,
    });

    act(() => input(tree).props.onChangeText('   '));
    act(() => byLabel(tree, 'Confirm save new segment').props.onPress());

    expect(onSaveNew).toHaveBeenCalledWith('Segment 5');
  });

  it('cancels from the choice step', () => {
    const onCancel = jest.fn();
    const tree = render({ loadedName: 'Verse', onCancel });

    act(() => byLabel(tree, 'Cancel').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });
});
