import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { darkTheme } from '../../theme';
import { PlayerErrorBanner } from '../PlayerErrorBanner';

jest.mock('../../hooks/useTheme');

function render(
  props: React.ComponentProps<typeof PlayerErrorBanner>,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<PlayerErrorBanner {...props} />);
  });
  return tree;
}

function textContents(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((c): c is string => typeof c === 'string');
}

describe('PlayerErrorBanner', () => {
  it('renders the headline in the error color', () => {
    const tree = render({ message: 'Unable to load this track' });
    const headline = tree.root
      .findAllByType(Text)
      .find((n) => n.props.children === 'Unable to load this track');
    expect(headline).toBeDefined();
    const flat = Object.assign({}, ...[headline!.props.style].flat());
    expect(flat.color).toBe(darkTheme.colors.error);
  });

  it('renders the detail caption when provided', () => {
    const tree = render({
      message: 'Track missing',
      detail: 'Go back and import it again.',
    });
    expect(textContents(tree)).toContain('Go back and import it again.');
  });

  it('omits the caption when detail is absent or null', () => {
    const tree = render({ message: 'Track missing', detail: null });
    expect(textContents(tree)).toEqual(['Track missing']);
  });

  it('clamps the detail text when a line limit is given', () => {
    const tree = render({
      message: 'Unable to load this track',
      detail: 'A very long underlying error message',
      detailNumberOfLines: 2,
    });
    const detail = tree.root
      .findAllByType(Text)
      .find(
        (n) => n.props.children === 'A very long underlying error message',
      )!;
    expect(detail.props.numberOfLines).toBe(2);
    expect(detail.props.ellipsizeMode).toBe('tail');
  });
});
