import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { CountdownConfig } from '../../types';
import { CountdownSettings } from '../CountdownSettings';

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
        error: '#f87171',
        errorText: '#1a1a1a',
      },
      typography: {
        body: { fontSize: 16, color: '#e8f5f0' },
        bodySmall: { fontSize: 14, color: '#e8f5f0' },
        caption: { fontSize: 12, color: '#8fa89e' },
      },
    },
  }),
}));

function defaultConfig(
  overrides: Partial<CountdownConfig> = {},
): CountdownConfig {
  return {
    enabled: false,
    mode: 'silent',
    duration: { type: 'seconds', seconds: 3 },
    repeat: 'once',
    ...overrides,
  };
}

// The ToggleSwitch inside this component starts a 160ms Animated.timing on
// mount. Fake timers keep its frames off the real event loop, and the
// afterEach below unmounts and flushes so no timer survives the suite —
// otherwise a late frame fires after Jest tears down the environment and
// crashes the worker.
let trees: ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    trees.forEach((tree) => tree.unmount());
  });
  trees = [];
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

function renderSettings(
  config: CountdownConfig,
  onChange: jest.Mock,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CountdownSettings config={config} onConfigChange={onChange} />,
    );
  });
  trees.push(tree);
  return tree;
}

function findByText(root: ReactTestRenderer['root'], text: string) {
  return root.findAll(
    (node) => node.children?.includes(text) && typeof node.type === 'string',
  );
}

function findByLabel(root: ReactTestRenderer['root'], label: string) {
  return root.findAll(
    (node) =>
      node.props.accessibilityLabel === label && node.props.onPress != null,
  );
}

function findAllByLabel(root: ReactTestRenderer['root'], label: string) {
  return root.findAll((node) => node.props.accessibilityLabel === label);
}

describe('CountdownSettings', () => {
  it('renders the header label and enable toggle', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig(), onChange);
    expect(findByText(tree.root, 'Count-in')).toHaveLength(1);
    expect(
      findByLabel(tree.root, 'Count-in off').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('toggles enabled state', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig(), onChange);
    const toggle = findByLabel(tree.root, 'Count-in off')[0]!;
    act(() => {
      toggle.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it('renders mode and the seconds-based length presets inline', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    expect(findByText(tree.root, 'Silent')).toHaveLength(1);
    expect(findByText(tree.root, 'Metronome')).toHaveLength(1);
    expect(findByText(tree.root, '1s')).toHaveLength(1);
    expect(findByText(tree.root, '3s')).toHaveLength(1);
    expect(findByText(tree.root, '15s')).toHaveLength(1);
    expect(findByText(tree.root, '30s')).toHaveLength(1);
  });

  it('switches mode to metronome', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    const metronomeChip = findByLabel(tree.root, 'Mode Metronome')[0];
    act(() => {
      metronomeChip.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'metronome' }),
    );
  });

  it('switches length preset', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    const tenSecondsChip = findByLabel(tree.root, 'Length 10s')[0];
    act(() => {
      tenSecondsChip.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: { type: 'seconds', seconds: 10 },
      }),
    );
  });

  it('switches the count-in repeat scope', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    const everyLoopChip = findByLabel(tree.root, 'Count in Every loop')[0];
    act(() => {
      everyLoopChip.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ repeat: 'everyLoop' }),
    );
  });

  it('renders no BPM control — the count-in is one click per second', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({ enabled: true, mode: 'metronome' }),
      onChange,
    );
    expect(findAllByLabel(tree.root, 'BPM')).toHaveLength(0);
    expect(findByText(tree.root, 'BPM')).toHaveLength(0);
  });
});
