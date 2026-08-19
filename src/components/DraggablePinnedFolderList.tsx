import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useLatestRef } from '../hooks/useLatestRef';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { Folder } from '../types';
import { FolderListItem } from './FolderListItem';

export interface DraggablePinnedFolderListProps {
  folders: Folder[];
  trackCounts: Record<string, number>;
  onOpenFolder: (folder: Folder) => void;
  onOpenActions: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => void;
  onReorder: (orderedIds: string[]) => void;
  style?: ViewStyle;
}

interface DraggableItemProps {
  folder: Folder;
  index: number;
  trackCount: number;
  isDragging: boolean;
  draggedIndex: number | null;
  hoverIndex: number | null;
  itemHeight: number;
  onOpenFolder: (folder: Folder) => void;
  onOpenActions: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => void;
  onBeginDrag: (index: number) => void;
  onMoveDrag: (offsetY: number) => void;
  onEndDrag: () => void;
}

function DraggableItem({
  folder,
  index,
  trackCount,
  isDragging,
  draggedIndex,
  hoverIndex,
  itemHeight,
  onOpenFolder,
  onOpenActions,
  onDeleteFolder,
  onRenameFolder,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
}: DraggableItemProps) {
  const { theme } = useTheme();
  const startRef = useLatestRef(() => onBeginDrag(index));
  const moveRef = useLatestRef((offsetY: number) => onMoveDrag(offsetY));
  const endRef = useLatestRef(() => onEndDrag());

  const panGesture = useMemo(() => {
    return (
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(300)
        // eslint-disable-next-line react-hooks/refs -- gesture handler callback
        .onStart(() => startRef.current())
        // eslint-disable-next-line react-hooks/refs -- gesture handler callback
        .onUpdate((e) => moveRef.current(e.translationY))
        // eslint-disable-next-line react-hooks/refs -- gesture handler callback
        .onFinalize(() => endRef.current())
    );
  }, [startRef, moveRef, endRef]);

  let displacementY = 0;
  if (draggedIndex !== null && hoverIndex !== null && !isDragging) {
    if (draggedIndex < hoverIndex) {
      if (index > draggedIndex && index <= hoverIndex) {
        displacementY = -itemHeight;
      }
    } else if (draggedIndex > hoverIndex) {
      if (index >= hoverIndex && index < draggedIndex) {
        displacementY = itemHeight;
      }
    }
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.itemWrapper,
          !isDragging &&
            displacementY !== 0 && {
              transform: [{ translateY: displacementY }],
            },
          isDragging && styles.draggingItem,
          isDragging && {
            shadowColor: theme.colors.textPrimary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 999,
          },
        ]}
      >
        <FolderListItem
          name={folder.name}
          trackCount={trackCount}
          pinned
          onPress={() => onOpenFolder(folder)}
          onOpenActions={() => onOpenActions(folder)}
          onDelete={() => onDeleteFolder(folder)}
          onRename={() => onRenameFolder(folder)}
          style={styles.listItem}
        />
      </View>
    </GestureDetector>
  );
}

export function DraggablePinnedFolderList({
  folders,
  trackCounts,
  onOpenFolder,
  onOpenActions,
  onDeleteFolder,
  onRenameFolder,
  onReorder,
  style,
}: DraggablePinnedFolderListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [itemHeight, setItemHeight] = useState(60);

  const handleLayoutItem = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > 0) {
      setItemHeight(height);
    }
  }, []);

  const handleBeginDrag = useCallback((index: number) => {
    setDraggedIndex(index);
    setHoverIndex(index);
    setDragOffsetY(0);
  }, []);

  const handleMoveDrag = useCallback(
    (offsetY: number) => {
      setDragOffsetY(offsetY);
      if (draggedIndex === null) return;
      const height = itemHeight || 60;
      const indexDelta = Math.round(offsetY / height);
      const targetIndex = Math.max(
        0,
        Math.min(folders.length - 1, draggedIndex + indexDelta),
      );
      setHoverIndex(targetIndex);
    },
    [draggedIndex, folders.length, itemHeight],
  );

  const handleEndDrag = useCallback(() => {
    if (
      draggedIndex !== null &&
      hoverIndex !== null &&
      draggedIndex !== hoverIndex
    ) {
      const nextFolders = [...folders];
      const [moved] = nextFolders.splice(draggedIndex, 1);
      nextFolders.splice(hoverIndex, 0, moved);
      onReorder(nextFolders.map((f) => f.id));
    }
    setDraggedIndex(null);
    setHoverIndex(null);
    setDragOffsetY(0);
  }, [draggedIndex, hoverIndex, folders, onReorder]);

  if (folders.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {folders.map((folder, index) => {
        const isDragging = draggedIndex === index;
        return (
          <View
            key={folder.id}
            onLayout={index === 0 ? handleLayoutItem : undefined}
            style={[
              styles.slot,
              isDragging && {
                transform: [{ translateY: dragOffsetY }],
                zIndex: 999,
              },
            ]}
          >
            <DraggableItem
              folder={folder}
              index={index}
              trackCount={trackCounts[folder.id] ?? 0}
              isDragging={isDragging}
              draggedIndex={draggedIndex}
              hoverIndex={hoverIndex}
              itemHeight={itemHeight}
              onOpenFolder={onOpenFolder}
              onOpenActions={onOpenActions}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              onBeginDrag={handleBeginDrag}
              onMoveDrag={handleMoveDrag}
              onEndDrag={handleEndDrag}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  slot: {
    width: '100%',
  },
  itemWrapper: {
    width: '100%',
  },
  draggingItem: {
    opacity: 0.95,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
});
