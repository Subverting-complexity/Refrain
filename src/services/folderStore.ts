import { Folder } from '../types';
import { getDatabase } from './database';

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  sortOrder: number;
}

function rowToFolder(row: FolderRow): Folder {
  return { ...row };
}

export function loadFolders(parentId: string | null): Folder[] {
  const db = getDatabase();
  const rows = db.getAllSync<FolderRow>(
    parentId === null
      ? 'SELECT * FROM folders WHERE parentId IS NULL ORDER BY sortOrder ASC, name ASC'
      : 'SELECT * FROM folders WHERE parentId = ? ORDER BY sortOrder ASC, name ASC',
    ...(parentId === null ? [] : [parentId]),
  );
  return rows.map(rowToFolder);
}

export function getFolder(id: string): Folder | null {
  const db = getDatabase();
  const row = db.getFirstSync<FolderRow>(
    'SELECT * FROM folders WHERE id = ?',
    id,
  );
  return row ? rowToFolder(row) : null;
}

export function insertFolder(folder: Folder): void {
  const db = getDatabase();
  db.runSync(
    'INSERT INTO folders (id, name, parentId, createdAt, sortOrder) VALUES (?, ?, ?, ?, ?)',
    folder.id,
    folder.name,
    folder.parentId,
    folder.createdAt,
    folder.sortOrder,
  );
}

export function renameFolder(id: string, name: string): void {
  const db = getDatabase();
  db.runSync('UPDATE folders SET name = ? WHERE id = ?', name, id);
}

export function deleteFolder(id: string): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE tracks SET folderId = (SELECT parentId FROM folders WHERE id = ?) WHERE folderId = ?',
    id,
    id,
  );
  db.runSync(
    'UPDATE folders SET parentId = (SELECT parentId FROM folders WHERE id = ?) WHERE parentId = ?',
    id,
    id,
  );
  db.runSync('DELETE FROM folders WHERE id = ?', id);
}

export function updateFolderSortOrder(id: string, sortOrder: number): void {
  const db = getDatabase();
  db.runSync('UPDATE folders SET sortOrder = ? WHERE id = ?', sortOrder, id);
}
