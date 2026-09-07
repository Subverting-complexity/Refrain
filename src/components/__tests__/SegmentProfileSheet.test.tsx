import React from 'react';
import { Modal } from 'react-native';
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
   * The sheet is a Modal, and on Android every Modal is its own window, so a
   * dialog rendered inside it nested one window in another: mismatched bounds
   * and two competing hardware-back handlers (#316). The dialogs belong to the
   * player now, as siblings of this sheet.
   */
  describe('nested modals', () => {
    it('renders exactly one modal — its own', () => {
      const tree = render();
      expect(tree.root.findAllByType(Modal).length).toBe(1);
    });

    it('opens no dialog of its own when rename is tapped', () => {
      const tree = render();

      act(() => {
        byLabel(tree, 'Rename Chorus').props.onPress();
      });

      expect(tree.root.findAllByType(Modal).length).toBe(1);
      expect(inputByLabel(tree, 'Segment name')).toBeUndefined();
    });

    it('opens no dialog of its own when delete is tapped', () => {
      const tree = render();

      act(() => {
        byLabel(tree, 'Delete Segment 1').props.onPress();
      });

      expect(tree.root.findAllByType(Modal).length).toBe(1);
      expect(byLabel(tree, 'Confirm delete Segment 1')).toBeUndefined();
    });
  });
});
