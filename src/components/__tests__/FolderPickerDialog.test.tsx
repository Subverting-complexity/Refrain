import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { FolderPickerDialog } from '../FolderPickerDialog';
import { Folder } from '../../types';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        background: '#0f1e20',
        border: '#2a4a4e',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
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

jest.mock('../DialogButton', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    DialogButton: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) =>
      ReactLocal.createElement(View, {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress,
      }),
  };
});

const folders: Folder[] = [
  {
    id: 'f-1',
    name: 'Scales',
    createdAt: 1,
    pinOrder: null,
    lastOpenedAt: 1,
  },
];

function render(
  props: Partial<React.ComponentProps<typeof FolderPickerDialog>>,
) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <FolderPickerDialog
        folders={folders}
        currentFolderId={null}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
        {...props}
      />,
    );
  });
  return renderer;
}

// Each pressable shows up once per layer it renders through, so collapse the
// matches to the distinct labels actually on offer.
function labels(renderer: ReactTestRenderer): string[] {
  return [
    ...new Set(
      renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel as string),
    ),
  ];
}

describe('FolderPickerDialog', () => {
  it('offers the library root and every folder', () => {
    const renderer = render({});

    expect(labels(renderer)).toEqual(
      expect.arrayContaining(['Library root (no folder)', 'Scales']),
    );
    act(() => renderer.unmount());
  });

  it('reports which destination the track is already in', () => {
    const renderer = render({ currentFolderId: 'f-1' });

    const option = renderer.root.findByProps({ accessibilityLabel: 'Scales' });
    expect(option.props.accessibilityState).toEqual({ selected: true });
    act(() => renderer.unmount());
  });

  // Without this a reader who has made no folders yet is offered only the
  // root they are already in — a picker that cannot answer its own question.
  describe('making a folder from the picker', () => {
    it('offers it when the screen can handle it', () => {
      const onCreateFolder = jest.fn();
      const renderer = render({ onCreateFolder });

      const option = renderer.root.findByProps({
        accessibilityLabel: 'New folder',
      });
      act(() => option.props.onPress());

      expect(onCreateFolder).toHaveBeenCalledTimes(1);
      act(() => renderer.unmount());
    });

    it('leaves it out when the screen does not', () => {
      const renderer = render({});

      expect(labels(renderer)).not.toContain('New folder');
      act(() => renderer.unmount());
    });
  });
});
