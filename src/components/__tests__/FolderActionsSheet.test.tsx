import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { FolderActionsSheet } from '../FolderActionsSheet';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        border: '#2a4a4e',
        error: '#ff6b6b',
        textPrimary: '#e0f0eb',
      },
      typography: { body: {}, heading: {}, caption: {} },
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../CenteredDialog', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    CenteredDialog: ({
      title,
      children,
    }: {
      title: string;
      children: unknown;
    }) => ReactLocal.createElement(View, { testID: 'dialog', title }, children),
  };
});

type Props = React.ComponentProps<typeof FolderActionsSheet>;

function render(props: Partial<Props> = {}) {
  const handlers = {
    onTogglePin: jest.fn(),
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onDismiss: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FolderActionsSheet
        name="Scales"
        pinned={false}
        canMoveUp={false}
        canMoveDown={false}
        {...handlers}
        {...props}
      />,
    );
  });
  return { tree, ...handlers };
}

function row(tree: ReactTestRenderer, label: string) {
  return tree.root.find(
    (n) =>
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  );
}

function labels(tree: ReactTestRenderer): string[] {
  return [
    ...new Set(
      tree.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((n) => n.props.accessibilityLabel as string),
    ),
  ];
}

describe('FolderActionsSheet', () => {
  it('offers the same shape of menu as the track sheet', () => {
    const { tree } = render();

    expect(labels(tree)).toEqual([
      'Pin',
      'Move up',
      'Move down',
      'Rename',
      'Delete',
    ]);
  });

  it('names the action by the state it produces', () => {
    const { tree } = render({ pinned: true });
    expect(labels(tree)).toContain('Unpin');
    expect(labels(tree)).not.toContain('Pin');
  });

  // Move up/down apply only inside the pinned block — unpinned folders are
  // ordered by when they were last opened, so there is nothing to rearrange.
  it('disables both moves for an unpinned folder', () => {
    const { tree } = render({ pinned: false });

    expect(row(tree, 'Move up').props.accessibilityState.disabled).toBe(true);
    expect(row(tree, 'Move down').props.accessibilityState.disabled).toBe(true);
  });

  it('enables only the moves that have somewhere to go', () => {
    const { tree } = render({
      pinned: true,
      canMoveUp: false,
      canMoveDown: true,
    });

    expect(row(tree, 'Move up').props.accessibilityState.disabled).toBe(true);
    expect(row(tree, 'Move down').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it.each([
    ['Pin', 'onTogglePin'],
    ['Rename', 'onRename'],
    ['Delete', 'onDelete'],
  ] as const)('dismisses before running %s', (label, handler) => {
    const rendered = render();
    act(() => row(rendered.tree, label).props.onPress());

    expect(rendered[handler]).toHaveBeenCalledTimes(1);
    // The sheet closes first, so the dialog an action opens is not left
    // sitting behind it.
    expect(rendered.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('runs the moves when they are enabled', () => {
    const rendered = render({
      pinned: true,
      canMoveUp: true,
      canMoveDown: true,
    });

    act(() => row(rendered.tree, 'Move up').props.onPress());
    act(() => row(rendered.tree, 'Move down').props.onPress());

    expect(rendered.onMoveUp).toHaveBeenCalledTimes(1);
    expect(rendered.onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('titles the sheet with the folder name', () => {
    const { tree } = render();
    expect(tree.root.findByProps({ testID: 'dialog' }).props.title).toBe(
      'Scales',
    );
  });
});
