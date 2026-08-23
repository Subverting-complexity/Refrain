import { Folder } from '../types';
import { generateId } from '../utils/generateId';

/**
 * Builds the record for a brand-new folder, ready to hand to `insertFolder`.
 *
 * Platform-neutral, so it lives here rather than in `folderStore` /
 * `folderStore.web` — the same split `markerStoreHelpers` exists for.
 *
 * `lastOpenedAt` is seeded from `createdAt` rather than left null, which is
 * the whole reason this is a function and not a literal at each call site.
 * `insertFolder` applies exactly that default when it writes the row, so a
 * caller holding null would be holding a value the database does not have:
 * `loadFolders` sorts null `lastOpenedAt` to the never-opened tail, so the
 * folder would sit at the bottom of the list until the next reload silently
 * moved it up. Two screens create folders and only one of them had this
 * written down.
 */
export function newFolder(name: string, now: number = Date.now()): Folder {
  return {
    id: generateId(),
    name,
    createdAt: now,
    pinOrder: null,
    lastOpenedAt: now,
  };
}
