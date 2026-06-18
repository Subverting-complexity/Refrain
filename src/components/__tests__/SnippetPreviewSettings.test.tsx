import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SnippetPreviewSettings } from '../SnippetPreviewSettings';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#111d1f',
        surface: '#1a2e28',
        accent: '#7edbb8',
        accentText: '#0a1612',
        textPrimary: '#e8f5f0',
        textSecondary: '#8fa89e',
        border: '#2d4a40',
      },
      typography: {
        body: { fontSize: 16, color: '#e8f5f0' },
      },
    },
  }),
}));

function render(enabled: boolean, onChange: jest.Mock): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SnippetPreviewSettings enabled={enabled} onChange={onChange} />,
    );
  });
  return tree;
}

function getSwitch(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'switch',
  )[0];
}

describe('SnippetPreviewSettings', () => {
  it('renders the labelled toggle', () => {
    const tree = render(true, jest.fn());

    const labels = tree.root
      .findAll((node) => node.type === 'Text')
      .map((n) => n.props.children);
    expect(labels).toContain('Snippet preview');
  });

  it('reflects the on state in the switch accessibility props', () => {
    const tree = render(true, jest.fn());
    const toggle = getSwitch(tree);

    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    expect(toggle.props.accessibilityLabel).toBe('Snippet preview on');
  });

  it('reflects the off state in the switch accessibility props', () => {
    const tree = render(false, jest.fn());
    const toggle = getSwitch(tree);

    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    expect(toggle.props.accessibilityLabel).toBe('Snippet preview off');
  });

  it('emits the negated value when pressed', () => {
    const onChange = jest.fn();
    const tree = render(true, onChange);

    act(() => getSwitch(tree).props.onPress());

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('turns the preview on when pressed while off', () => {
    const onChange = jest.fn();
    const tree = render(false, onChange);

    act(() => getSwitch(tree).props.onPress());

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('accepts a style prop override', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <SnippetPreviewSettings
          enabled
          onChange={jest.fn()}
          style={{ marginTop: 20 }}
        />,
      );
    });

    const styled = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.marginTop === 20,
        ),
    );
    expect(styled.length).toBeGreaterThan(0);
  });
});
