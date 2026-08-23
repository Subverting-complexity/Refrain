import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  CreateFolderDialog,
  CreateFolderDialogProps,
} from '../CreateFolderDialog';

jest.mock('../../hooks/useTheme');

function render(overrides: Partial<CreateFolderDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CreateFolderDialog
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
      node.props.accessibilityLabel === 'Folder name' &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

describe('CreateFolderDialog', () => {
  it('opens on an empty field', () => {
    expect(input(render()).props.value).toBe('');
  });

  // The shared NameEntryDialog says Save; naming something that does not
  // exist yet has to say Create.
  it('labels the confirm button Create rather than Save', () => {
    const tree = render();
    const labels = tree.root
      .findAll((node) => typeof node.props.label === 'string')
      .map((node) => node.props.label);

    expect(labels).toContain('Create');
    expect(labels).not.toContain('Save');
  });

  it('creates the folder under the trimmed name', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('  Scales  '));
    act(() => byLabel(tree, 'Create folder').props.onPress());

    expect(onSave).toHaveBeenCalledWith('Scales');
  });

  it('creates on submit from the keyboard', () => {
    const onSave = jest.fn();
    const tree = render({ onSave });

    act(() => input(tree).props.onChangeText('Etudes'));
    act(() => input(tree).props.onSubmitEditing());

    expect(onSave).toHaveBeenCalledWith('Etudes');
  });

  // Unlike the rename dialogs, an empty name here is a mis-tap rather than a
  // change of mind: the dialog stays open instead of dismissing.
  it('does nothing on an empty or whitespace-only name', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => byLabel(tree, 'Create folder').props.onPress());
    act(() => input(tree).props.onChangeText('   '));
    act(() => byLabel(tree, 'Create folder').props.onPress());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('dismisses on Cancel without creating anything', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const tree = render({ onSave, onCancel });

    act(() => input(tree).props.onChangeText('Scales'));
    act(() => byLabel(tree, 'Cancel').props.onPress());

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
  // The rename dialogs select their seeded name on focus. This one starts
  // empty, so the same setting would only discard what the reader had typed
  // if they refocused the field.
  it('does not select on focus, so a refocus cannot wipe a half-typed name', () => {
    expect(input(render()).props.selectTextOnFocus).toBe(false);
  });
});
