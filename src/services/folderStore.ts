import { Folder } from '../types';
import { getDatabase } from './database';

/**
 * Folder metadata store, single level.
 *
 * Folders no longer nest, so there is no parent to pass in and no tree to
 * walk. What replaces nesting is a two-part ordering: a pinned block the
 * reader arranges by hand, then everything else in most-recently-opened
 * order. The `parentId` and `sortOrder` columns still exist in the table but
 * nothing here reads or writes them (see `migrateFoldersSchema`).
 */

interface FolderRow {
  id: string;
  name: string;
  createdAt: number;
  pinOrder: number | null;
  lastOpenedAt: number | null;
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    pinOrder: row.pinOrder ?? null,
    lastOpenedAt: row.lastOpenedAt ?? null,
  };
}

const FOLDER_COLUMNS = ['id', 'name', 'createdAt', 'pinOrder', 'lastOpenedAt'];
const FOLDER_COLUMN_LIST = FOLDER_COLUMNS.join(', ');
const FOLDER_PLACEHOLDERS = FOLDER_COLUMNS.map(() => '?').join(', ');

/**
 * Reads every folder in display order: the pinned block first by `pinOrder`,
 * then unpinned folders by most recently opened, with folders that have never
 * been opened last and alphabetical among themselves.
 *
 * SQLite sorts NULL before everything else by default, so each clause makes
 * its NULL handling explicit rather than relying on that: unpinned folders
 * (`pinOrder IS NULL`) sort after pinned ones, and never-opened folders
 * (`lastOpenedAt IS NULL`) sort after opened ones.
 *
 * The name tiebreak is `COLLATE NOCASE` for the same kind of reason. The
 * default collation for a text column is byte order, which puts every
 * capital letter before every lowercase one — so `Zebra` would sort before
 * `anthem` here and after it on web, where the comparison is locale-aware.
 */
export function loadFolders(): Folder[] {
  const db = getDatabase();
  const rows = db.getAllSync<FolderRow>(
    `SELECT ${FOLDER_COLUMN_LIST} FROM folders
     ORDER BY
       CASE WHEN pinOrder IS NULL THEN 1 ELSE 0 END ASC,
       pinOrder ASC,
       CASE WHEN lastOpenedAt IS NULL THEN 1 ELSE 0 END ASC,
       lastOpenedAt DESC,
       name COLLATE NOCASE ASC`,
  );
  return rows.map(rowToFolder);
}

export function getFolder(id: string): Folder | null {
  const db = getDatabase();
  const row = db.getFirstSync<FolderRow>(
    `SELECT ${FOLDER_COLUMN_LIST} FROM folders WHERE id = ?`,
    id,
  );
  return row ? rowToFolder(row) : null;
}

/**
 * Creates a folder. When the caller leaves `lastOpenedAt` null it is stamped
 * from `createdAt`, so a folder made just now sorts to the top of the
 * unpinned block instead of falling to the never-opened tail. Deriving it
 * from the folder's own creation time keeps the store free of a clock read.
 */
export function insertFolder(folder: Folder): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO folders (${FOLDER_COLUMN_LIST}) VALUES (${FOLDER_PLACEHOLDERS})`,
    folder.id,
    folder.name,
    folder.createdAt,
    folder.pinOrder,
    folder.lastOpenedAt ?? folder.createdAt,
  );
}

export function renameFolder(id: string, name: string): void {
  const db = getDatabase();
  db.runSync('UPDATE folders SET name = ? WHERE id = ?', name, id);
}

/**
 * Deletes a folder and moves its tracks to Unfiled.
 *
 * With nesting gone there is no parent to hand the tracks back to, so they
 * become unfiled (`folderId = NULL`). The audio files on disk are never
 * touched: deleting a folder loses the grouping, never the recordings.
 */
export function deleteFolder(id: string): void {
  const db = getDatabase();
  db.runSync('UPDATE tracks SET folderId = NULL WHERE folderId = ?', id);
  db.runSync('DELETE FROM folders WHERE id = ?', id);
}

/**
 * Pins a folder at `pinOrder`, or unpins it when `pinOrder` is null. The
 * value is the folder's position inside the pinned block; callers that are
 * rearranging several folders at once should use `reorderPinnedFolders`.
 */
export function setFolderPinned(id: string, pinOrder: number | null): void {
  const db = getDatabase();
  db.runSync('UPDATE folders SET pinOrder = ? WHERE id = ?', pinOrder, id);
}

/**
 * Rewrites the whole pinned block in one pass: each id in `orderedIds` gets
 * its index as its `pinOrder`, and every folder not listed is unpinned. A
 * single statement per folder inside one transaction, so a half-applied
 * reorder cannot survive a failure partway through.
 */
export function reorderPinnedFolders(orderedIds: string[]): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('UPDATE folders SET pinOrder = NULL WHERE pinOrder IS NOT NULL');
    orderedIds.forEach((id, index) => {
      db.runSync('UPDATE folders SET pinOrder = ? WHERE id = ?', index, id);
    });
  });
}

/**
 * Records that a folder was opened at `at` (epoch milliseconds), which is
 * what orders the unpinned block. As with `markTrackPlayed`, the timestamp
 * comes from the caller so the write stays deterministic.
 */
export function markFolderOpened(id: string, at: number): void {
  const db = getDatabase();
  db.runSync('UPDATE folders SET lastOpenedAt = ? WHERE id = ?', at, id);
}
