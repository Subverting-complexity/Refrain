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
    ...overrides,
  };
}

function renderOverlay(state: CountdownState): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<CountdownOverlay countdownState={state} />);
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

  it('renders beat count during countdown', () => {
    const tree = renderOverlay(makeState());
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('3');
  });

  it('renders GO when beatsRemaining is 0', () => {
    const tree = renderOverlay(makeState({ beatsRemaining: 0 }));
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('GO');
  });

  it('has accessibility label', () => {
    const tree = renderOverlay(makeState({ beatsRemaining: 2 }));
    const container = tree.root.findByProps({ accessibilityRole: 'alert' });
    expect(container.props.accessibilityLabel).toBe('Countdown: 2');
  });
});
