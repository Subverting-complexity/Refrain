import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import NotFoundScreen from '../+not-found';

const mockReplace = jest.fn();
const mockScreenOptions = jest.fn();

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockScreenOptions(options);
        return ReactLocal.createElement(ReactLocal.Fragment, null);
      },
    },
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('@/src/hooks/useTheme');

function renderScreen(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<NotFoundScreen />);
  });
  return tree;
}

describe('NotFoundScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Page not found message', () => {
    const tree = renderScreen();
    expect(JSON.stringify(tree.toJSON())).toContain('Page not found');
  });

  it('sets the screen title to Not Found', () => {
    renderScreen();
    expect(mockScreenOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Not Found' }),
    );
  });

  it('renders a Go to home link with the link role', () => {
    const tree = renderScreen();
    const links = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go to home' &&
        node.props.accessibilityRole === 'link' &&
        typeof node.props.onPress === 'function',
    );
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(tree.toJSON())).toContain('Go to home');
  });

  it('navigates home when the link is pressed', () => {
    const tree = renderScreen();
    const links = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go to home' &&
        typeof node.props.onPress === 'function',
    );
    act(() => links[links.length - 1].props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
