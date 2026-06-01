import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { CountdownConfig } from '../../types';
import { CountdownSettings } from '../CountdownSettings';

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
        bodySmall: { fontSize: 14, color: '#e8f5f0' },
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
    duration: { type: 'bars', bars: 1 },
    bpm: 120,
    ...overrides,
  };
}

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
  it('renders toggle when disabled', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig(), onChange);
    expect(findByText(tree.root, 'Countdown')).toHaveLength(1);
    expect(
      findByLabel(tree.root, 'Countdown off').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('toggles enabled state', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig(), onChange);
    const toggle = findByLabel(tree.root, 'Countdown off')[0]!;
    act(() => {
      toggle.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it('shows mode and duration when enabled', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    expect(findByText(tree.root, 'Silent')).toHaveLength(1);
    expect(findByText(tree.root, 'Metronome')).toHaveLength(1);
    expect(findByText(tree.root, '1 bar')).toHaveLength(1);
    expect(findByText(tree.root, '2 bars')).toHaveLength(1);
  });

  it('switches mode to metronome', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    const metronomeChip = findByLabel(tree.root, 'metronome')[0];
    act(() => {
      metronomeChip.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'metronome' }),
    );
  });

  it('switches duration preset', () => {
    const onChange = jest.fn();
    const tree = renderSettings(defaultConfig({ enabled: true }), onChange);
    const twoBarsChip = findByLabel(tree.root, '2 bars')[0];
    act(() => {
      twoBarsChip.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: { type: 'bars', bars: 2 },
      }),
    );
  });

  it('shows BPM input in metronome mode', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({ enabled: true, mode: 'metronome' }),
      onChange,
    );
    expect(findAllByLabel(tree.root, 'BPM').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show BPM input in silent mode', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({ enabled: true, mode: 'silent' }),
      onChange,
    );
    expect(findAllByLabel(tree.root, 'BPM')).toHaveLength(0);
  });

  it('updates BPM', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({ enabled: true, mode: 'metronome', bpm: 120 }),
      onChange,
    );
    const bpmInput = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'BPM' &&
        node.props.onChangeText != null,
    )[0];
    act(() => {
      bpmInput.props.onChangeText('100');
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ bpm: 100 }),
    );
  });
});
