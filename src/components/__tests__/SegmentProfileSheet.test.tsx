import React from 'react';
import { Modal, Platform, Text as RNText } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SegmentProfile } from '../../types';
import {
  SegmentProfileSheet,
  SegmentProfileSheetProps,
} from '../SegmentProfileSheet';

jest.mock('../../hooks/useTheme');

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: (props: Record<string, unknown>) => <View {...props} /> };
});

// Stub the toggle so this suite tests the sheet's prop wiring, not the
// SnippetPreviewSettings animation (which would otherwise leak a timer).
jest.mock('../SnippetPreviewSettings', () => {
  const { View } = require('react-native');
  return {
    SnippetPreviewSettings: ({
      enabled,
      onChange,
    }: {
      enabled: boolean;
      onChange: (next: boolean) => void;
    }) => (
      <View
        accessibilityRole="switch"
        accessibilityLabel={`Snippet preview ${enabled ? 'on' : 'off'}`}
        onPress={() => onChange(!enabled)}
      />
    ),
  };
});

function profile(id: string, name: string): SegmentProfile {
  return {
    id,
    trackId: 't1',
    name,
    markerA: 1000,
    markerB: 5000,
    loopEnabled: true,
    createdAt: 1,
  };
}

const PROFILES = [profile('p1', 'Segment 1'), profile('p2', 'Chorus')];

function render(overrides: Partial<SegmentProfileSheetProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SegmentProfileSheet
        profiles={PROFILES}
        onLoadProfile={jest.fn()}
        onRequestRename={jest.fn()}
        onRequestDelete={jest.fn()}
        snippetPreviewEnabled={false}
        onSnippetPreviewChange={jest.fn()}
        onClose={jest.fn()}
        {...overrides}
      />,
    );
  });
  return tree;
}

function byLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

function inputByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onChangeText === 'function',
  )[0];
}

function findText(tree: ReactTestRenderer, text: string) {
  return tree.root.findAll(
    (node) => node.type === 'Text' && node.children.join('') === text,
  );
}

describe('SegmentProfileSheet', () => {
  it('renders the saved profiles', () => {
    const tree = render();
    expect(byLabel(tree, 'Load segment Segment 1')).toBeDefined();
    expect(byLabel(tree, 'Load segment Chorus')).toBeDefined();
  });

  it('shows an empty state when there are no profiles', () => {
    const tree = render({ profiles: [] });
    expect(findText(tree, 'No saved segments yet').length).toBe(1);
  });

  it('hosts the snippet-preview toggle at the top', () => {
    const onSnippetPreviewChange = jest.fn();
    const tree = render({
      snippetPreviewEnabled: false,
      onSnippetPreviewChange,
    });

    const toggle = byLabel(tree, 'Snippet preview off');
    expect(toggle).toBeDefined();

    act(() => toggle.props.onPress());
    expect(onSnippetPreviewChange).toHaveBeenCalledWith(true);
  });

  it('has no save control — saving lives in the player now', () => {
    const tree = render();
    expect(byLabel(tree, 'Save current segment')).toBeUndefined();
  });

  it('loads a profile and closes when a row is tapped', () => {
    const onLoadProfile = jest.fn();
    const onClose = jest.fn();
    const tree = render({ onLoadProfile, onClose });

    act(() => {
      byLabel(tree, 'Load segment Chorus').props.onPress();
    });

    expect(onLoadProfile).toHaveBeenCalledWith(profile('p2', 'Chorus'));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks the player to rename a profile', () => {
    const onRequestRename = jest.fn();
    const tree = render({ onRequestRename });

    act(() => {
      byLabel(tree, 'Rename Chorus').props.onPress();
    });

    expect(onRequestRename).toHaveBeenCalledWith(profile('p2', 'Chorus'));
  });

  it('asks the player to delete a profile', () => {
    const onRequestDelete = jest.fn();
    const tree = render({ onRequestDelete });

    act(() => {
      byLabel(tree, 'Delete Segment 1').props.onPress();
    });

    expect(onRequestDelete).toHaveBeenCalledWith(profile('p1', 'Segment 1'));
  });

  /**
   * The sheet holds no dialog state of its own any more: tapping rename or
   * delete reports the intent and nothing else. The player decides whether a
   * dialog exists; this sheet only places the one it is handed.
   */
  describe('dialogs', () => {
    it('renders exactly one modal — its own — when handed no dialog', () => {
      const tree = render();
      expect(tree.root.findAllByType(Modal).length).toBe(1);
    });

    it('opens nothing of its own when rename is tapped', () => {
      const tree = render();

      act(() => {
        byLabel(tree, 'Rename Chorus').props.onPress();
      });

      expect(tree.root.findAllByType(Modal).length).toBe(1);
      expect(inputByLabel(tree, 'Segment name')).toBeUndefined();
    });

    it('opens nothing of its own when delete is tapped', () => {
      const tree = render();

      act(() => {
        byLabel(tree, 'Delete Segment 1').props.onPress();
      });

      expect(tree.root.findAllByType(Modal).length).toBe(1);
      expect(byLabel(tree, 'Confirm delete Segment 1')).toBeUndefined();
    });

    /**
     * Where the dialog may be mounted is forced in opposite directions by the
     * two platforms. Android renders each Modal as its own window, so a dialog
     * inside the sheet nests one window in another (#316). iOS presents a
     * Modal from the nearest view controller up the responder chain, so two
     * sibling Modals both resolve to the root one — already presenting the
     * sheet — and UIKit refuses the second, which would leave the dialog
     * silently absent.
     */
    describe('placement', () => {
      let replacedPlatform: ReturnType<typeof jest.replaceProperty> | undefined;

      afterEach(() => {
        replacedPlatform?.restore();
        replacedPlatform = undefined;
      });

      const dialog = <RNText>Dialog body</RNText>;

      /** Every node rendering the dialog's marker text, under `root`. */
      function dialogNodes(root: {
        findAll: (
          predicate: (node: { type: unknown; children: unknown[] }) => boolean,
        ) => unknown[];
      }) {
        return root.findAll(
          (node) =>
            node.type === 'Text' &&
            (node.children as string[]).join('') === 'Dialog body',
        );
      }

      /**
       * Renders on `os` and reports whether the dialog came out inside the
       * sheet's Modal or as a sibling of it.
       */
      function placementOn(os: 'ios' | 'android' | 'web'): 'inside' | 'beside' {
        replacedPlatform = jest.replaceProperty(Platform, 'OS', os);
        const tree = render({ dialog });

        // Rendered exactly once, wherever it landed.
        expect(dialogNodes(tree.root).length).toBe(1);
        // The sheet is still a single Modal either way.
        const modals = tree.root.findAllByType(Modal);
        expect(modals.length).toBe(1);

        return dialogNodes(modals[0]).length > 0 ? 'inside' : 'beside';
      }

      it('mounts the dialog beside the sheet on Android', () => {
        expect(placementOn('android')).toBe('beside');
      });

      it('mounts the dialog inside the sheet on iOS', () => {
        expect(placementOn('ios')).toBe('inside');
      });

      it('leaves web where iOS is', () => {
        expect(placementOn('web')).toBe('inside');
      });
    });
  });
});
