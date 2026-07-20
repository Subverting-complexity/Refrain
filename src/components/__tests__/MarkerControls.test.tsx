import React from 'react';
import { StyleSheet } from 'react-native';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

import { MarkerControls } from '../MarkerControls';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        surface: '#1a2e30',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
        markerA: '#ffb02e',
        markerAText: '#3a2600',
        markerB: '#ff5d77',
        markerBText: '#ffffff',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
      typography: {},
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => <View {...props} />,
  };
});

function renderControls(
  props: Partial<React.ComponentProps<typeof MarkerControls>> = {},
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <MarkerControls
        status="paused"
        markerA={null}
        markerB={null}
        durationMs={120000}
        loopEnabled={true}
        placeMode="none"
        onPressA={jest.fn()}
        onPressB={jest.fn()}
        onToggleLoop={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

function findPressableByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}

function findPressableByLabelFragment(
  tree: ReactTestRenderer,
  fragment: string,
) {
  return tree.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(fragment) &&
      typeof node.props.onPress === 'function',
  );
}

function findText(tree: ReactTestRenderer, text: string) {
  return tree.root.findAll(
    (node) => node.type === 'Text' && node.props.children === text,
  );
}

function findCaption(tree: ReactTestRenderer, fragment: string) {
  return tree.root.findAll(
    (node) =>
      node.type === 'Text' &&
      typeof node.props.children === 'string' &&
      node.props.children.includes(fragment),
  );
}

describe('MarkerControls', () => {
  it('renders A and B buttons', () => {
    const tree = renderControls();
    expect(findText(tree, 'A').length).toBeGreaterThanOrEqual(1);
    expect(findText(tree, 'B').length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Set' for an unset marker and a time for a set one", () => {
    const tree = renderControls({ markerA: 65000, markerB: null });
    expect(findText(tree, '1:05').length).toBe(1);
    expect(findText(tree, 'Set').length).toBe(1);
  });

  it("shows 'Tap wave' on the armed button", () => {
    const tree = renderControls({ placeMode: 'A' });
    expect(findText(tree, 'Tap wave').length).toBe(1);
  });

  it('labels the A button to edit or remove once A is set', () => {
    const tree = renderControls({ markerA: 5000, markerB: null });
    expect(
      findPressableByLabelFragment(tree, 'Edit or remove').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('labels an unset button to place that marker', () => {
    const tree = renderControls({ markerA: 5000, markerB: null });
    expect(
      findPressableByLabel(tree, 'Place loop end').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('calls onPressA when the A button is pressed', () => {
    const onPressA = jest.fn();
    const tree = renderControls({ onPressA });
    act(() => {
      findPressableByLabel(tree, 'Place loop start')[0].props.onPress();
    });
    expect(onPressA).toHaveBeenCalled();
  });

  it('calls onPressB when the B button is pressed', () => {
    const onPressB = jest.fn();
    const tree = renderControls({ markerA: 1000, onPressB });
    act(() => {
      findPressableByLabel(tree, 'Place loop end')[0].props.onPress();
    });
    expect(onPressB).toHaveBeenCalled();
  });

  it('disables the B button until A is set', () => {
    const tree = renderControls({ markerA: null, markerB: null });
    const b = findPressableByLabel(tree, 'Place loop end')[0];
    expect(b.props.disabled).toBe(true);
  });

  it('enables the B button once A is set', () => {
    const tree = renderControls({ markerA: 1000, markerB: null });
    const b = findPressableByLabel(tree, 'Place loop end')[0];
    expect(b.props.disabled).toBe(false);
  });

  it('labels the armed button to cancel placement', () => {
    const tree = renderControls({ placeMode: 'A' });
    expect(
      findPressableByLabel(tree, 'Cancel placing loop start').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the loop toggle', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });

    expect(
      findPressableByLabel(tree, 'Turn loop off').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('keeps the loop toggle enabled without a complete region', () => {
    // Looping no longer needs both markers: no markers loops the whole
    // track, A alone loops from A to the end.
    const tree = renderControls({ markerA: 1000, markerB: null });

    const toggle = findPressableByLabel(tree, 'Turn loop off')[0];
    expect(toggle.props.disabled).toBe(false);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it('disables the loop toggle while no track is loaded', () => {
    const tree = renderControls({ status: 'idle' });

    const toggle = findPressableByLabel(tree, 'Turn loop on')[0];
    expect(toggle.props.disabled).toBe(true);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  it('enables and checks the loop toggle when both markers set and looping', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop off')[0];
    expect(toggle.props.disabled).toBe(false);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it('shows the loop toggle unchecked when looping is off', () => {
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: false,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop on')[0];
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  it('calls onToggleLoop with the negated state when pressed', () => {
    const onToggleLoop = jest.fn();
    const tree = renderControls({
      markerA: 1000,
      markerB: 5000,
      loopEnabled: true,
      onToggleLoop,
    });

    const toggle = findPressableByLabel(tree, 'Turn loop off')[0];
    act(() => {
      toggle.props.onPress();
    });

    expect(onToggleLoop).toHaveBeenCalledWith(false);
  });

  it('shows no resting caption once a region is set', () => {
    expect(
      findCaption(
        renderControls({ markerA: 1000, markerB: 5000, loopEnabled: true }),
        'Looping',
      ),
    ).toHaveLength(0);
    expect(findCaption(renderControls(), 'Tap A to start a loop')).toHaveLength(
      0,
    );
  });

  it('captions only the arming state', () => {
    expect(
      findCaption(renderControls({ placeMode: 'A' }), 'drop A').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findCaption(renderControls({ placeMode: 'B' }), 'drop B after A').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('hides the arming caption when playback is idle', () => {
    const tree = renderControls({ status: 'idle', placeMode: 'A' });
    expect(findCaption(tree, 'drop A')).toHaveLength(0);
  });

  it('renders Save and Clear squares', () => {
    const tree = renderControls();
    expect(
      findPressableByLabel(tree, 'Save segment').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findPressableByLabel(tree, 'Clear loop markers').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('enables Save only with a full region and a save handler', () => {
    const onSave = jest.fn();
    const noHandler = renderControls({ markerA: 1000, markerB: 5000 });
    expect(
      findPressableByLabel(noHandler, 'Save segment')[0].props.disabled,
    ).toBe(true);

    const partial = renderControls({ markerA: 1000, onSave });
    expect(
      findPressableByLabel(partial, 'Save segment')[0].props.disabled,
    ).toBe(true);

    const ready = renderControls({ markerA: 1000, markerB: 5000, onSave });
    const save = findPressableByLabel(ready, 'Save segment')[0];
    expect(save.props.disabled).toBe(false);
    act(() => save.props.onPress());
    expect(onSave).toHaveBeenCalled();
  });

  it('enables Clear once A is set and calls onClear', () => {
    const onClear = jest.fn();
    const empty = renderControls({ onClear });
    expect(
      findPressableByLabel(empty, 'Clear loop markers')[0].props.disabled,
    ).toBe(true);

    const set = renderControls({ markerA: 1000, onClear });
    const clear = findPressableByLabel(set, 'Clear loop markers')[0];
    expect(clear.props.disabled).toBe(false);
    act(() => clear.props.onPress());
    expect(onClear).toHaveBeenCalled();
  });

  it('tints the A button border with the marker A color when set', () => {
    const tree = renderControls({ markerA: 1000 });

    const button = findPressableByLabelFragment(tree, 'Loop start 0:01')[0];
    // The button's style is a press-state function; resolve it unpressed.
    const flat = StyleSheet.flatten(button.props.style({ pressed: false }));
    expect(flat.borderColor).toBe('#ffb02e');
  });

  it('opens the time editor sheet when the A tile is pressed with A set', () => {
    const onEditA = jest.fn();
    const tree = renderControls({ markerA: 5000, onEditA });
    const aTile = findPressableByLabelFragment(tree, 'Loop start 0:05')[0];
    act(() => {
      aTile.props.onPress();
    });
    // Sheet should be rendered — look for the close button label
    expect(
      findPressableByLabel(tree, 'Close marker editor').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('opens the time editor sheet when the B tile is pressed with B set', () => {
    const onEditB = jest.fn();
    const tree = renderControls({ markerA: 1000, markerB: 5000, onEditB });
    const bTile = findPressableByLabelFragment(tree, 'Loop end 0:05')[0];
    act(() => {
      bTile.props.onPress();
    });
    expect(
      findPressableByLabel(tree, 'Close marker editor').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('still calls onPressA to arm placement when A is not set', () => {
    const onPressA = jest.fn();
    const tree = renderControls({ markerA: null, onPressA });
    act(() => {
      findPressableByLabel(tree, 'Place loop start')[0].props.onPress();
    });
    expect(onPressA).toHaveBeenCalled();
  });

  it('calls onRemoveA and closes the sheet when Remove is pressed for A', () => {
    const onRemoveA = jest.fn();
    const onEditA = jest.fn();
    const tree = renderControls({ markerA: 5000, onEditA, onRemoveA });
    // Open the sheet
    act(() => {
      findPressableByLabelFragment(tree, 'Loop start 0:05')[0].props.onPress();
    });
    // Press Remove
    act(() => {
      findPressableByLabel(
        tree,
        'Remove loop start and end',
      )[0].props.onPress();
    });
    expect(onRemoveA).toHaveBeenCalled();
    // Sheet should be gone
    expect(findPressableByLabel(tree, 'Close marker editor')).toHaveLength(0);
  });

  it('accepts style prop override', () => {
    const tree = renderControls({ style: { marginTop: 10 } });
    const container = tree.root.children[0];
    const flatStyle = (
      container as { props: { style: Record<string, unknown>[] } }
    ).props.style;
    const hasMargin = flatStyle.some(
      (s: Record<string, unknown>) => s && s.marginTop === 10,
    );
    expect(hasMargin).toBe(true);
  });
});
