import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { NameEntryDialog, NameEntryDialogProps } from '../NameEntryDialog';

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

function render(overrides: Partial<NameEntryDialogProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <NameEntryDialog
        title="Rename segment"
        initialName="Chorus"
        placeholder="Segment name"
        fieldAccessibilityLabel="Segment name"
        confirmAccessibilityLabel="Confirm rename"
        onConfirm={jest.fn()}
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

function input(tree: ReactTestRenderer, label = 'Segment name') {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

describe('NameEntryDialog', () => {
  it('pre-fills the field with the initial name', () => {
    const tree = render({ initialName: 'Verse' });
    expect(input(tree).props.value).toBe('Verse');
  });

  it('autofocuses the field so the keyboard opens on the name', () => {
    const tree = render();
    expect(input(tree).props.autoFocus).toBe(true);
  });

  // Every caller seeds an existing name, so typing should replace it whole
  // rather than append to it.
  it('selects the pre-filled name on focus', () => {
    const tree = render();
    expect(input(tree).props.selectTextOnFocus).toBe(true);
  });

  it('shows the caller-supplied placeholder', () => {
    const tree = render({ placeholder: 'Track name' });
    expect(input(tree).props.placeholder).toBe('Track name');
  });

  it('applies the caller-supplied accessibility labels', () => {
    const tree = render({
      fieldAccessibilityLabel: 'New segment name',
      confirmAccessibilityLabel: 'Confirm save new segment',
    });
    expect(input(tree, 'New segment name')).toBeDefined();
    expect(byLabel(tree, 'Confirm save new segment')).toBeDefined();
  });

  it('confirms with the trimmed name', () => {
    const onConfirm = jest.fn();
    const tree = render({ onConfirm });

    act(() => input(tree).props.onChangeText('  Bridge  '));
    act(() => byLabel(tree, 'Confirm rename').props.onPress());

    expect(onConfirm).toHaveBeenCalledWith('Bridge');
  });

  // Deciding what an empty name means is the wrapper's policy, so the shared
  // body reports it verbatim rather than guessing.
  it('confirms with an empty string when the field is blanked', () => {
    const onConfirm = jest.fn();
    const tree = render({ onConfirm });

    act(() => input(tree).props.onChangeText('   '));
    act(() => byLabel(tree, 'Confirm rename').props.onPress());

    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('confirms on submit from the keyboard', () => {
    const onConfirm = jest.fn();
    const tree = render({ onConfirm });

    act(() => input(tree).props.onChangeText('Outro'));
    act(() => input(tree).props.onSubmitEditing());

    expect(onConfirm).toHaveBeenCalledWith('Outro');
  });

  it('cancels when the Cancel button is pressed', () => {
    const onCancel = jest.fn();
    const tree = render({ onCancel });

    act(() => byLabel(tree, 'Cancel').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });

  // The documented remount contract: the draft seeds once, so a prop change on
  // a mounted dialog must not discard what the user is typing.
  it('does not re-seed the draft when initialName changes mid-edit', () => {
    const tree = render({ initialName: 'Chorus' });

    act(() => input(tree).props.onChangeText('My edit'));
    act(() => {
      tree.update(
        <NameEntryDialog
          title="Rename segment"
          initialName="Something else"
          placeholder="Segment name"
          fieldAccessibilityLabel="Segment name"
          confirmAccessibilityLabel="Confirm rename"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });

    expect(input(tree).props.value).toBe('My edit');
  });
});
