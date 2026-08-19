import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { DraggablePinnedFolderList } from '../DraggablePinnedFolderList';
import { Folder } from '../../types';

jest.mock('react-native-gesture-handler', () => {
  const mockPanInstances: Record<string, (e: any) => void>[] = [];
  const makePan = () => {
    const handlers: Record<string, (e: any) => void> = {};
    const api = {
      runOnJS: () => api,
      activateAfterLongPress: () => api,
      onStart: (f: (e: any) => void) => {
        handlers.start = f;
        return api;
      },
      onUpdate: (f: (e: any) => void) => {
        handlers.update = f;
        return api;
      },
      onFinalize: (f: (e: any) => void) => {
        handlers.finalize = f;
        return api;
      },
    };
    mockPanInstances.push(handlers);
    return api;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    __getPanInstances: () => mockPanInstances,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNGH = require('react-native-gesture-handler');

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        accent: '#7edbb8',
        accentText: '#111d1f',
        border: '#2a4a4e',
        surface: '#1a2e30',
        background: '#0f1e20',
        error: '#ff6b6b',
        errorText: '#fff',
        textPrimary: '#e0f0eb',
        textSecondary: '#8ba89e',
      },
      typography: {
        body: { color: '#e0f0eb' },
        caption: { color: '#8ba89e' },
      },
    },
  }),
}));

jest.mock('../FolderListItem', () => {
  const ReactLocal = require('react');
  const { View: ViewLocal } = require('react-native');
  return {
    FolderListItem: (props: any) =>
      ReactLocal.createElement(ViewLocal, { testID: 'folder-item', ...props }),
  };
});

function makeFolder(id: string, name: string, pinOrder: number): Folder {
  return {
    id,
    name,
    createdAt: 1000,
    pinOrder,
    lastOpenedAt: 1000,
  };
}

describe('DraggablePinnedFolderList', () => {
  beforeEach(() => {
    RNGH.__getPanInstances().length = 0;
  });

  it('renders nothing when folder list is empty', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraggablePinnedFolderList
          folders={[]}
          trackCounts={{}}
          onOpenFolder={jest.fn()}
          onOpenActions={jest.fn()}
          onDeleteFolder={jest.fn()}
          onRenameFolder={jest.fn()}
          onReorder={jest.fn()}
        />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  it('renders pinned folders in order', () => {
    const folders = [
      makeFolder('f1', 'Folder 1', 0),
      makeFolder('f2', 'Folder 2', 1),
    ];
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraggablePinnedFolderList
          folders={folders}
          trackCounts={{ f1: 3, f2: 5 }}
          onOpenFolder={jest.fn()}
          onOpenActions={jest.fn()}
          onDeleteFolder={jest.fn()}
          onRenameFolder={jest.fn()}
          onReorder={jest.fn()}
        />,
      );
    });
    const items = renderer.root
      .findAllByProps({ testID: 'folder-item' })
      .filter((node) => typeof node.type !== 'string');
    expect(items).toHaveLength(2);
    expect(items[0].props.name).toBe('Folder 1');
    expect(items[1].props.name).toBe('Folder 2');
    expect(items[0].props.trackCount).toBe(3);
    expect(items[1].props.trackCount).toBe(5);
    act(() => renderer.unmount());
  });

  it('reorders folders downward on drag gesture and releases with new order', () => {
    const folders = [
      makeFolder('f1', 'Folder 1', 0),
      makeFolder('f2', 'Folder 2', 1),
      makeFolder('f3', 'Folder 3', 2),
    ];
    const onReorder = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraggablePinnedFolderList
          folders={folders}
          trackCounts={{}}
          onOpenFolder={jest.fn()}
          onOpenActions={jest.fn()}
          onDeleteFolder={jest.fn()}
          onRenameFolder={jest.fn()}
          onReorder={onReorder}
        />,
      );
    });

    const slots = renderer.root.findAll(
      (n) => typeof n.props.onLayout === 'function',
    );
    if (slots.length > 0) {
      act(() => {
        slots[0].props.onLayout({ nativeEvent: { layout: { height: 60 } } });
      });
    }

    const panHandlers = RNGH.__getPanInstances();

    // Drag item 0 down by 70px (to index 1)
    act(() => {
      panHandlers[0].start({});
    });
    act(() => {
      panHandlers[0].update({ translationY: 70 });
    });
    act(() => {
      panHandlers[0].finalize({});
    });

    expect(onReorder).toHaveBeenCalledWith(['f2', 'f1', 'f3']);
    act(() => renderer.unmount());
  });

  it('reorders folders upward on drag gesture and releases with new order', () => {
    const folders = [
      makeFolder('f1', 'Folder 1', 0),
      makeFolder('f2', 'Folder 2', 1),
      makeFolder('f3', 'Folder 3', 2),
    ];
    const onReorder = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraggablePinnedFolderList
          folders={folders}
          trackCounts={{}}
          onOpenFolder={jest.fn()}
          onOpenActions={jest.fn()}
          onDeleteFolder={jest.fn()}
          onRenameFolder={jest.fn()}
          onReorder={onReorder}
        />,
      );
    });

    const panHandlers = RNGH.__getPanInstances();

    // Drag item 2 up by -130px (to index 0)
    act(() => {
      panHandlers[2].start({});
    });
    act(() => {
      panHandlers[2].update({ translationY: -130 });
    });
    act(() => {
      panHandlers[2].finalize({});
    });

    expect(onReorder).toHaveBeenCalledWith(['f3', 'f1', 'f2']);
    act(() => renderer.unmount());
  });

  it('does not fire onReorder if dropped back in same spot', () => {
    const folders = [
      makeFolder('f1', 'Folder 1', 0),
      makeFolder('f2', 'Folder 2', 1),
    ];
    const onReorder = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraggablePinnedFolderList
          folders={folders}
          trackCounts={{}}
          onOpenFolder={jest.fn()}
          onOpenActions={jest.fn()}
          onDeleteFolder={jest.fn()}
          onRenameFolder={jest.fn()}
          onReorder={onReorder}
        />,
      );
    });

    const panHandlers = RNGH.__getPanInstances();

    act(() => {
      panHandlers[0].start({});
    });
    act(() => {
      panHandlers[0].update({ translationY: 10 });
    });
    act(() => {
      panHandlers[0].finalize({});
    });

    expect(onReorder).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});
