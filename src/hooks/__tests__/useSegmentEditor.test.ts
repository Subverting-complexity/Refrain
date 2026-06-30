import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { SegmentProfile } from '../../types';
import { useSegmentEditor, UseSegmentEditor } from '../useSegmentEditor';

let lastResult: UseSegmentEditor;

function TestComponent({
  markerA,
  markerB,
}: {
  markerA: number | null;
  markerB: number | null;
}) {
  lastResult = useSegmentEditor(markerA, markerB);
  return null;
}

function render(markerA: number | null, markerB: number | null) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(TestComponent, { markerA, markerB }));
  });
  return {
    tree,
    update: (a: number | null, b: number | null) =>
      act(() => {
        tree.update(createElement(TestComponent, { markerA: a, markerB: b }));
      }),
  };
}

function profile(
  markerA: number | null,
  markerB: number | null,
): SegmentProfile {
  return {
    id: 'p1',
    trackId: 't1',
    name: 'Verse',
    markerA,
    markerB,
    loopEnabled: true,
    createdAt: 1,
  };
}

describe('useSegmentEditor', () => {
  it('starts with nothing loaded and not dirty', () => {
    render(1000, 5000);
    expect(lastResult.loadedId).toBeNull();
    expect(lastResult.isDirty).toBe(false);
  });

  it('marks a segment loaded without it being dirty', () => {
    const { update } = render(1000, 5000);

    act(() => lastResult.markLoaded(profile(1000, 5000)));
    update(1000, 5000);

    expect(lastResult.loadedId).toBe('p1');
    expect(lastResult.isDirty).toBe(false);
  });

  it('becomes dirty when marker A moves from the loaded value', () => {
    const { update } = render(1000, 5000);

    act(() => lastResult.markLoaded(profile(1000, 5000)));
    update(2000, 5000);

    expect(lastResult.isDirty).toBe(true);
  });

  it('becomes dirty when marker B moves from the loaded value', () => {
    const { update } = render(1000, 5000);

    act(() => lastResult.markLoaded(profile(1000, 5000)));
    update(1000, 6000);

    expect(lastResult.isDirty).toBe(true);
  });

  it('is never dirty while no segment is loaded', () => {
    const { update } = render(1000, 5000);
    update(9999, 9999);
    expect(lastResult.isDirty).toBe(false);
  });

  it('clears the loaded identity', () => {
    const { update } = render(1000, 5000);

    act(() => lastResult.markLoaded(profile(1000, 5000)));
    update(2000, 5000);
    expect(lastResult.isDirty).toBe(true);

    act(() => lastResult.clearLoaded());
    update(2000, 5000);

    expect(lastResult.loadedId).toBeNull();
    expect(lastResult.isDirty).toBe(false);
  });
});
