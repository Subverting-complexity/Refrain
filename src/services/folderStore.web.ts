import { Folder } from '../types';
import {
  deleteStoredFolder,
  getAllStoredFolders,
  getAllStoredTracks,
  getStoredFolder,
  getStoredFoldersByParent,
  putStoredFolder,
  putStoredTrack,
  StoredFolder,
} from './database.web';

function toFolder(row: StoredFolder): Folder {
  return { ...row };
}

function toStored(folder: Folder): StoredFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    sortOrder: folder.sortOrder,
  };
}

export async function loadFolders(parentId: string | null): Promise<Folder[]> {
  const rows = await getStoredFoldersByParent(parentId);
  const folders = rows.map(toFolder);
  folders.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  return folders;
}

export async function getFolder(id: string): Promise<Folder | null> {
  const row = await getStoredFolder(id);
  return row ? toFolder(row) : null;
}

export async function insertFolder(folder: Folder): Promise<void> {
  await putStoredFolder(toStored(folder));
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const row = await getStoredFolder(id);
  if (!row) return;
  await putStoredFolder({ ...row, name });
}

export async function deleteFolder(id: string): Promise<void> {
  const folder = await getStoredFolder(id);
  if (!folder) return;

  const allTracks = await getAllStoredTracks();
  for (const track of allTracks) {
    if (track.folderId === id) {
      await putStoredTrack({ ...track, folderId: folder.parentId });
    }
  }

  const allFolders = await getAllStoredFolders();
  for (const child of allFolders) {
    if (child.parentId === id) {
      await putStoredFolder({ ...child, parentId: folder.parentId });
    }
  }

  await deleteStoredFolder(id);
}

export async function updateFolderSortOrder(
  id: string,
  sortOrder: number,
): Promise<void> {
  const row = await getStoredFolder(id);
  if (!row) return;
  await putStoredFolder({ ...row, sortOrder });
}
