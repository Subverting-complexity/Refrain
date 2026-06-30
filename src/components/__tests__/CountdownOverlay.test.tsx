import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { CountdownState } from '../../types';
import { CountdownOverlay } from '../CountdownOverlay';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#111d1f',
        accent: '#7edbb8',
      },
    },
  }),
}));

function makeState(overrides: Partial<CountdownState> = {}): CountdownState {
  return {
    phase: 'counting',
    beatsRemaining: 3,
    totalBeats: 4,
    currentBeat: 1,
    displayValue: 3,
    ...overrides,
  };
}

function renderOverlay(
  state: CountdownState,
  onCancel?: () => void,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CountdownOverlay countdownState={state} onCancel={onCancel} />,
    );
  });
  return tree;
}

describe('CountdownOverlay', () => {
  it('renders nothing when idle', () => {
    const tree = renderOverlay(makeState({ phase: 'idle' }));
    expect(tree.toJSON()).toBeNull();
  });

  it('renders nothing when finished', () => {
    const tree = renderOverlay(makeState({ phase: 'finished' }));
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the displayValue during countdown', () => {
    const tree = renderOverlay(makeState());
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('3');
  });

  it('shows seconds remaining for a seconds-type countdown (displayValue differs from beatsRemaining)', () => {
    // 3s at 120 BPM = 6 beats, but displayValue is 3 (seconds)
    const tree = renderOverlay(
      makeState({ beatsRemaining: 6, totalBeats: 6, displayValue: 3 }),
    );
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('3');
    expect(JSON.stringify(json)).not.toContain('"6"');
  });

  it('renders GO when displayValue is 0', () => {
    const tree = renderOverlay(makeState({ displayValue: 0 }));
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('GO');
  });

  it('has accessibility label', () => {
    const tree = renderOverlay(makeState({ displayValue: 2 }));
    const container = tree.root.findByProps({ accessibilityRole: 'alert' });
    expect(container.props.accessibilityLabel).toBe('Countdown: 2');
  });

  describe('cancel target', () => {
    it('exposes a cancel button when onCancel is provided', () => {
      const onCancel = jest.fn();
      const tree = renderOverlay(makeState(), onCancel);
      const button = tree.root.findByProps({ accessibilityRole: 'button' });
      expect(button.props.accessibilityLabel).toBe('Cancel count-in');
    });

    it('calls onCancel when the overlay is pressed', () => {
      const onCancel = jest.fn();
      const tree = renderOverlay(makeState(), onCancel);
      const button = tree.root.findByProps({ accessibilityRole: 'button' });
      act(() => {
        button.props.onPress();
      });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('still announces the countdown via the alert live region when cancellable', () => {
      const tree = renderOverlay(makeState({ displayValue: 2 }), jest.fn());
      const alert = tree.root.findByProps({ accessibilityRole: 'alert' });
      expect(alert.props.accessibilityLabel).toBe('Countdown: 2');
    });

    it('renders a non-interactive overlay (no button) when onCancel is absent', () => {
      const tree = renderOverlay(makeState());
      expect(
        tree.root.findAllByProps({ accessibilityRole: 'button' }),
      ).toHaveLength(0);
    });
  });
});
