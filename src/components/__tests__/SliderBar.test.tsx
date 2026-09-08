import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, SharedValue } from 'react-native-reanimated';

import { SliderBar } from '../SliderBar';

jest.mock('react-native-gesture-handler', () => {
  const makePan = () => {
    const api = {
      runOnJS: () => api,
      minDistance: () => api,
      onBegin: () => api,
      onUpdate: () => api,
      onFinalize: () => api,
    };
    return api;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

/**
 * Shared values stand in for the hook's, since the bar is driven from the UI
 * thread rather than from props. What they hold cannot be asserted through the
 * rendered tree — an animated style resolves to an empty object under Jest —
 * so the arithmetic they feed is covered in `sliderGeometry.test.ts` and what
 * is checked here is the structure it is applied to.
 */
function shared(value: number): SharedValue<number> {
  return makeMutable(value);
}

function renderBar(
  props: Partial<React.ComponentProps<typeof SliderBar>> = {},
) {
  let tree!: ReactTestRenderer;
  const pan = (
    jest.requireMock('react-native-gesture-handler') as {
      Gesture: { Pan: () => unknown };
    }
  ).Gesture.Pan();
  act(() => {
    tree = create(
      <SliderBar
        progress={shared(0.5)}
        trackWidth={shared(200)}
        trackColor="#333"
        fillColor="#0f0"
        pan={pan as import('react-native-gesture-handler').PanGesture}
        onLayout={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

/** The Views carrying `style` as an array, which is every part of the bar. */
function styledViews(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.type === 'View' && Array.isArray(node.props.style),
  );
}

function hasStyle(
  tree: ReactTestRenderer,
  match: (style: Record<string, unknown>) => boolean,
) {
  return styledViews(tree).filter((node) =>
    node.props.style.some(
      (style: Record<string, unknown>) => style && match(style),
    ),
  );
}

describe('SliderBar', () => {
  it('renders track, fill, and thumb', () => {
    const tree = renderBar();
    const views = tree.root.findAllByType('View' as never);
    expect(views.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * The fill is laid out at full width and scaled down from its left edge, so
   * the level it shows is a draw-time transform rather than a width. A width
   * would put Yoga between the finger and the pixel on every pointer event,
   * which is the arrangement this bar was rewritten to get rid of.
   */
  it('draws the fill as a scale from the left edge, not a width', () => {
    const tree = renderBar();
    const fills = hasStyle(
      tree,
      (style) => style.transformOrigin === 'left center',
    );

    expect(fills).toHaveLength(1);
    const fillStyle = fills[0].props.style.find(
      (style: Record<string, unknown>) =>
        style && style.transformOrigin === 'left center',
    );
    // Stretched over the track it sits in, so the scale is the whole story.
    expect(fillStyle.left).toBe(0);
    expect(fillStyle.right).toBe(0);
    expect(
      fills[0].props.style.every((style: unknown) => {
        const candidate = style as Record<string, unknown> | null;
        return !candidate || candidate.width === undefined;
      }),
    ).toBe(true);
  });

  it('centres the thumb on its position rather than offsetting it', () => {
    const tree = renderBar();
    const thumbs = hasStyle(
      tree,
      (style) => typeof style.marginLeft === 'number' && style.marginLeft < 0,
    );

    expect(thumbs).toHaveLength(1);
    const thumbStyle = thumbs[0].props.style.find(
      (style: Record<string, unknown>) =>
        style && typeof style.marginLeft === 'number',
    );
    // Half its own size back, so the translation places its centre.
    expect(thumbStyle.marginLeft).toBe(-thumbStyle.width / 2);
    expect(thumbStyle.left).toBe(0);
  });

  it('applies track and fill colors', () => {
    const tree = renderBar({ trackColor: '#aaa', fillColor: '#bbb' });
    const trackNode = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.backgroundColor === '#aaa',
        ),
    );
    const fillNode = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.backgroundColor === '#bbb',
        ),
    );
    expect(trackNode.length).toBeGreaterThanOrEqual(1);
    expect(fillNode.length).toBeGreaterThanOrEqual(1);
  });

  it('forwards onLayout to the touch area', () => {
    const onLayout = jest.fn();
    const tree = renderBar({ onLayout });
    const touchArea = tree.root.findAll(
      (node) =>
        node.type === 'View' && typeof node.props.onLayout === 'function',
    );
    expect(touchArea.length).toBe(1);
    touchArea[0].props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    expect(onLayout).toHaveBeenCalled();
  });
});
