import { Folder } from '../types';
import {
  deleteStoredFolder,
  getAllStoredFolders,
  getAllStoredTracks,
  getStoredFolder,
  putStoredFolder,
  putStoredFolders,
  putStoredTrack,
  StoredFolder,
} from './database.web';

/**
 * Web folder store, single level. Mirrors `folderStore` on native, but over
 * IndexedDB: there is no query language, so the ordering and filtering SQL
 * does on native is done here in memory.
 */

function toFolder(row: StoredFolder): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    pinOrder: row.pinOrder ?? null,
    lastOpenedAt: row.lastOpenedAt ?? null,
  };
}

function toStored(folder: Folder): StoredFolder {
  return {
    id: folder.id,
    name: folder.name,
    createdAt: folder.createdAt,
    pinOrder: folder.pinOrder,
    lastOpenedAt: folder.lastOpenedAt,
  };
}

/**
 * Reads every folder in display order: the pinned block first by `pinOrder`,
 * then unpinned folders by most recently opened, with folders that have never
 * been opened last and alphabetical among themselves.
 */
export async function loadFolders(): Promise<Folder[]> {
  const rows = await getAllStoredFolders();
  const folders = rows.map(toFolder);
  folders.sort((a, b) => {
    const aPinned = a.pinOrder !== null;
    const bPinned = b.pinOrder !== null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && a.pinOrder !== b.pinOrder) {
      return a.pinOrder! - b.pinOrder!;
    }
    const aOpened = a.lastOpenedAt !== null;
    const bOpened = b.lastOpenedAt !== null;
    if (aOpened !== bOpened) return aOpened ? -1 : 1;
    if (aOpened && bOpened && a.lastOpenedAt !== b.lastOpenedAt) {
      return b.lastOpenedAt! - a.lastOpenedAt!;
    }
    return a.name.localeCompare(b.name);
  });
  return folders;
}

export async function getFolder(id: string): Promise<Folder | null> {
  const row = await getStoredFolder(id);
  return row ? toFolder(row) : null;
}

/**
 * Creates a folder. When the caller leaves `lastOpenedAt` null it is stamped
 * from `createdAt`, so a folder made just now sorts to the top of the
 * unpinned block instead of falling to the never-opened tail.
 */
export async function insertFolder(folder: Folder): Promise<void> {
  await putStoredFolder({
    ...toStored(folder),
    lastOpenedAt: folder.lastOpenedAt ?? folder.createdAt,
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const row = await getStoredFolder(id);
  if (!row) return;
  await putStoredFolder({ ...row, name });
}

/**
 * Deletes a folder and moves its tracks to Unfiled.
 *
 * With nesting gone there is no parent to hand the tracks back to, so they
 * become unfiled (`folderId` null). The audio blobs are never touched:
 * deleting a folder loses the grouping, never the recordings.
 */
export async function deleteFolder(id: string): Promise<void> {
  // The tracks are re-homed whether or not the folder record is still
  // there. Returning early on a missing folder would strand any track that
  // still carried its id: such a track shows up in no view at all, since
  // its folder id is not null so it is not unfiled, and there is no folder
  // left to open. The native implementation re-homes unconditionally too.
  const allTracks = await getAllStoredTracks();
  for (const track of allTracks) {
    if (track.folderId === id) {
      await putStoredTrack({ ...track, folderId: null });
    }
  }

  await deleteStoredFolder(id);
}

/**
 * Pins a folder at `pinOrder`, or unpins it when `pinOrder` is null. Callers
 * rearranging several folders at once should use `reorderPinnedFolders`.
 */
export async function setFolderPinned(
  id: string,
  pinOrder: number | null,
): Promise<void> {
  const row = await getStoredFolder(id);
  if (!row) return;
  await putStoredFolder({ ...row, pinOrder });
}

/**
 * Rewrites the whole pinned block in one pass: each id in `orderedIds` gets
 * its index as its `pinOrder`, and every folder not listed is unpinned.
 */
export async function reorderPinnedFolders(
  orderedIds: string[],
): Promise<void> {
  const rows = await getAllStoredFolders();
  const position = new Map(orderedIds.map((id, index) => [id, index]));
  const changed: StoredFolder[] = [];
  for (const row of rows) {
    const pinOrder = position.get(row.id) ?? null;
    if ((row.pinOrder ?? null) === pinOrder) continue;
    changed.push({ ...row, pinOrder });
  }
  await putStoredFolders(changed);
}

/**
 * Records that a folder was opened at `at` (epoch milliseconds), which is
 * what orders the unpinned block.
 */
export async function markFolderOpened(id: string, at: number): Promise<void> {
  const row = await getStoredFolder(id);
  if (!row) return;
  await putStoredFolder({ ...row, lastOpenedAt: at });
}
