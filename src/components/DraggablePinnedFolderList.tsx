import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useSharedNumber } from '../hooks/useSharedNumber';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';
import { Folder } from '../types';
import { FolderListItem } from './FolderListItem';

/** Sentinel for "no row is being dragged", since shared values hold numbers. */
const NO_ROW = -1;

/** Height used until the first row has been measured. */
const DEFAULT_ITEM_HEIGHT = 60;

/** How long a row takes to slide out of the dragged row's way. */
const SHIFT_MS = 160;

/** How long a press must be held before the drag takes over from the scroll. */
const LONG_PRESS_MS = 300;

/**
 * The shared values every row reads to decide where it sits. One set per list,
 * created by the list and handed down, so a drag is resolved entirely on the UI
 * thread: the row under the finger follows it, and the rows it displaces slide
 * aside, without React rendering between one pointer event and the next.
 */
interface DragState {
  /** Index of the row being dragged, or {@link NO_ROW}. */
  draggedIndex: SharedValue<number>;
  /** Index the dragged row would land on if released now, or {@link NO_ROW}. */
  hoverIndex: SharedValue<number>;
  /** How far the dragged row has moved from its slot, in pixels. */
  offsetY: SharedValue<number>;
  /** Measured row height, which is also the displacement step. */
  itemHeight: SharedValue<number>;
}

interface DraggableItemProps {
  folder: Folder;
  index: number;
  trackCount: number;
  /**
   * Whether this row is the one under the finger. React state, not a shared
   * value, because it only decides the lift styling — shadow and stacking —
   * which changes twice per drag rather than per pointer event.
   */
  isDragging: boolean;
  drag: DragState;
  folderCount: number;
  onOpenFolder: (folder: Folder) => void;
  onOpenActions: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => void;
  onBeginDrag: (index: number) => void;
  onEndDrag: (draggedIndex: number, hoverIndex: number) => void;
}

/**
 * One pinned folder row, with the long-press drag that reorders the list.
 *
 * The gesture handlers are worklets, so they run on the UI thread. The previous
 * version ran them on the JS thread and called `setState` with the finger's
 * offset on every pointer event, which meant a full render and layout pass of
 * the whole list per event — on Android, where touches arrive at up to 120Hz,
 * that is more renders per second than the device can commit.
 *
 * Memoised, so the two renders a drag does cause (picking the row up and
 * putting it down) do not rebuild the rows that were not involved.
 */
const DraggableItem = React.memo(function DraggableItem({
  folder,
  index,
  trackCount,
  isDragging,
  drag,
  folderCount,
  onOpenFolder,
  onOpenActions,
  onDeleteFolder,
  onRenameFolder,
  onBeginDrag,
  onEndDrag,
}: DraggableItemProps) {
  const { theme } = useTheme();
  const { draggedIndex, hoverIndex, offsetY, itemHeight } = drag;
  const count = useSharedNumber(folderCount);

  // A long-press drag rather than the immediate Pan the sliders and waveform
  // share, so this does not use `usePanGesture`: it activates on a hold and
  // works in translation, not position.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          'worklet';
          draggedIndex.value = index;
          hoverIndex.value = index;
          offsetY.value = 0;
          runOnJS(onBeginDrag)(index);
        })
        .onUpdate((e) => {
          'worklet';
          offsetY.value = e.translationY;
          if (draggedIndex.value === NO_ROW) return;
          const step = itemHeight.value || DEFAULT_ITEM_HEIGHT;
          const target = Math.max(
            0,
            Math.min(
              count.value - 1,
              draggedIndex.value + Math.round(e.translationY / step),
            ),
          );
          // Only write when the landing slot actually changes, so the rows that
          // have to move are told once per boundary crossed rather than once
          // per pointer event.
          if (hoverIndex.value !== target) hoverIndex.value = target;
        })
        .onFinalize(() => {
          'worklet';
          const from = draggedIndex.value;
          const to = hoverIndex.value;
          // Cleared before the reorder is applied: the list is about to be
          // rebuilt in the new order, so every row belongs at rest in its own
          // slot and any leftover displacement would be drawn against the
          // wrong folder.
          draggedIndex.value = NO_ROW;
          hoverIndex.value = NO_ROW;
          offsetY.value = 0;
          runOnJS(onEndDrag)(from, to);
        }),
    [
      onBeginDrag,
      onEndDrag,
      index,
      count,
      draggedIndex,
      hoverIndex,
      offsetY,
      itemHeight,
    ],
  );

  // Where this row sits: under the finger if it is the one being dragged, one
  // step aside if the dragged row is passing through its slot, home otherwise.
  // Resolved on the UI thread every frame, so none of it costs a render.
  const slide = useAnimatedStyle(() => {
    const dragged = draggedIndex.value;
    if (dragged === index) {
      return { transform: [{ translateY: offsetY.value }] };
    }
    if (dragged === NO_ROW) {
      return { transform: [{ translateY: 0 }] };
    }
    const hover = hoverIndex.value;
    const step = itemHeight.value || DEFAULT_ITEM_HEIGHT;
    let shift = 0;
    if (dragged < hover) {
      if (index > dragged && index <= hover) shift = -step;
    } else if (dragged > hover) {
      if (index >= hover && index < dragged) shift = step;
    }
    return {
      transform: [{ translateY: withTiming(shift, { duration: SHIFT_MS }) }],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.itemWrapper,
          isDragging && styles.draggingItem,
          isDragging && {
            shadowColor: theme.colors.textPrimary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 999,
          },
          slide,
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
      </Animated.View>
    </GestureDetector>
  );
});

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
  // The only React state a drag touches, and only at its two ends: which row is
  // lifted, so it can carry a shadow and sit above its neighbours. Everything
  // that moves is in the shared values below.
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const draggedIndexValue = useSharedValue(NO_ROW);
  const hoverIndexValue = useSharedValue(NO_ROW);
  const offsetY = useSharedValue(0);
  const itemHeight = useSharedValue(DEFAULT_ITEM_HEIGHT);

  const drag = useMemo<DragState>(
    () => ({
      draggedIndex: draggedIndexValue,
      hoverIndex: hoverIndexValue,
      offsetY,
      itemHeight,
    }),
    [draggedIndexValue, hoverIndexValue, offsetY, itemHeight],
  );

  const handleLayoutItem = useCallback(
    (e: LayoutChangeEvent) => {
      const { height } = e.nativeEvent.layout;
      if (height > 0) itemHeight.value = height;
    },
    [itemHeight],
  );

  const handleBeginDrag = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleEndDrag = useCallback(
    (from: number, to: number) => {
      setDraggedIndex(null);
      if (from === NO_ROW || to === NO_ROW || from === to) return;
      const next = [...folders];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next.map((f) => f.id));
    },
    [folders, onReorder],
  );

  if (folders.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {folders.map((folder, index) => (
        <View
          key={folder.id}
          onLayout={index === 0 ? handleLayoutItem : undefined}
          style={[styles.slot, draggedIndex === index && styles.liftedSlot]}
        >
          <DraggableItem
            folder={folder}
            index={index}
            trackCount={trackCounts[folder.id] ?? 0}
            isDragging={draggedIndex === index}
            drag={drag}
            folderCount={folders.length}
            onOpenFolder={onOpenFolder}
            onOpenActions={onOpenActions}
            onDeleteFolder={onDeleteFolder}
            onRenameFolder={onRenameFolder}
            onBeginDrag={handleBeginDrag}
            onEndDrag={handleEndDrag}
          />
        </View>
      ))}
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
  liftedSlot: {
    zIndex: 999,
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
