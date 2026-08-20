import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { TrackRenameDialog } from '../TrackRenameDialog';

jest.mock('../../hooks/useTheme');

function render(
  overrides: Partial<React.ComponentProps<typeof TrackRenameDialog>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TrackRenameDialog
        currentFilename="song.mp3"
        onSave={jest.fn()}
        onCancel={jest.fn()}
        {...overrides}
      />,
    );
  });
  return tree;
}

function input(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Track name' &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

function saveButton(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Confirm rename song.mp3' &&
      typeof node.props.onPress === 'function',
  )[0];
}

function cancelButton(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Cancel' &&
      typeof node.props.onPress === 'function',
  )[0];
}

describe('TrackRenameDialog', () => {
  it('pre-fills the field with the base name, not the extension', () => {
    const tree = render({ currentFilename: 'Practice take.wav' });
    expect(input(tree).props.value).toBe('Practice take');
  });

  it('saves the new base name with the original extension reattached', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('Warm up'));
    act(() => saveButton(tree).props.onPress());

    expect(onSave).toHaveBeenCalledWith('Warm up.mp3');
  });

  it('keeps only the final extension of a multi-dot filename', () => {
    const onSave = jest.fn();
    const tree = render({ currentFilename: 'live.take.2.wav', onSave });

    act(() => input(tree).props.onChangeText('Solo'));
    act(() =>
      tree.root
        .findAll(
          (node) =>
            node.props.accessibilityLabel ===
              'Confirm rename live.take.2.wav' &&
            typeof node.props.onPress === 'function',
        )[0]
        .props.onPress(),
    );

    expect(onSave).toHaveBeenCalledWith('Solo.wav');
  });

  it('sanitizes a name containing path separators', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('sub/dir'));
    act(() => saveButton(tree).props.onPress());

    expect(onSave).toHaveBeenCalledWith('sub dir.mp3');
  });

  it('cancels instead of saving a nameless track when the field is blanked', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => input(tree).props.onChangeText('   '));
    act(() => saveButton(tree).props.onPress());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // A no-op save would still fire a write and a "Renamed to…" toast, which
  // reads as though something changed.
  it('cancels instead of saving when the name is unchanged', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => saveButton(tree).props.onPress());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('treats a name differing only in surrounding whitespace as unchanged', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => input(tree).props.onChangeText('  song  '));
    act(() => saveButton(tree).props.onPress());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when the Cancel button is pressed', () => {
    const onCancel = jest.fn();
    const tree = render({ onCancel });

    act(() => cancelButton(tree).props.onPress());

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saves on submit from the keyboard', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('Bridge'));
    act(() => input(tree).props.onSubmitEditing());

    expect(onSave).toHaveBeenCalledWith('Bridge.mp3');
  });
});
