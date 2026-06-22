import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

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
        progress={0.5}
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

describe('SliderBar', () => {
  it('renders track, fill, and thumb', () => {
    const tree = renderBar();
    const views = tree.root.findAllByType('View' as never);
    expect(views.length).toBeGreaterThanOrEqual(3);
  });

  it('sets fill width from progress', () => {
    const tree = renderBar({ progress: 0.75 });
    const fills = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.width === '75%',
        ),
    );
    expect(fills.length).toBe(1);
  });

  it('sets thumb position from progress', () => {
    const tree = renderBar({ progress: 0.25 });
    const thumbs = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style.some(
          (s: Record<string, unknown>) => s && s.left === '25%',
        ),
    );
    expect(thumbs.length).toBe(1);
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
