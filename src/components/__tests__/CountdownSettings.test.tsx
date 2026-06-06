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

  it('shows BPM input in silent mode with bar-based duration', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({
        enabled: true,
        mode: 'silent',
        duration: { type: 'bars', bars: 1 },
      }),
      onChange,
    );
    expect(findAllByLabel(tree.root, 'BPM').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show BPM input in silent mode with seconds-based duration', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({
        enabled: true,
        mode: 'silent',
        duration: { type: 'seconds', seconds: 3 },
      }),
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

  it('shows BPM range hint', () => {
    const onChange = jest.fn();
    const tree = renderSettings(
      defaultConfig({ enabled: true, mode: 'metronome' }),
      onChange,
    );
    expect(findByText(tree.root, '1–300')).toHaveLength(1);
  });

  it('shows error state when BPM input is empty', () => {
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
      bpmInput.props.onChangeText('');
    });
    const inputStyle = bpmInput.props.style;
    const flatStyle = Array.isArray(inputStyle)
      ? Object.assign({}, ...inputStyle)
      : inputStyle;
    expect(flatStyle.borderColor).toBe('#f87171');
  });

  it('shows error state when BPM input is out of range', () => {
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
      bpmInput.props.onChangeText('999');
    });
    const inputStyle = bpmInput.props.style;
    const flatStyle = Array.isArray(inputStyle)
      ? Object.assign({}, ...inputStyle)
      : inputStyle;
    expect(flatStyle.borderColor).toBe('#f87171');
  });

  it('clears error when valid BPM is entered after invalid', () => {
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
      bpmInput.props.onChangeText('999');
    });
    act(() => {
      bpmInput.props.onChangeText('120');
    });
    const inputStyle = bpmInput.props.style;
    const flatStyle = Array.isArray(inputStyle)
      ? Object.assign({}, ...inputStyle)
      : inputStyle;
    expect(flatStyle.borderColor).toBe('#2d4a40');
  });

  it('blur with out-of-range value clamps to 300', () => {
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
      bpmInput.props.onChangeText('999');
    });
    act(() => {
      bpmInput.props.onBlur();
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 300 }),
    );
  });

  it('blur with value of 0 clamps to 1', () => {
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
      bpmInput.props.onChangeText('0');
    });
    act(() => {
      bpmInput.props.onBlur();
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 1 }),
    );
  });

  it('blur with empty value reverts to last valid BPM without re-calling onChange', () => {
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
      bpmInput.props.onChangeText('');
    });
    const callCountBeforeBlur = onChange.mock.calls.length;
    act(() => {
      bpmInput.props.onBlur();
    });
    expect(onChange.mock.calls.length).toBe(callCountBeforeBlur);
  });
});
