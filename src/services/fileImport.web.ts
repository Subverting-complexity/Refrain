import { AudioFormat, ImportOutcome, Track } from '../types';
import { generateId } from '../utils/generateId';
import { SNIFF_LENGTH, sniffFormat } from './audioSniff';
import { getObjectUrl, putBlob } from './webBlobStore.web';
import {
  displayFilename,
  estimateDurationMs,
  makeError,
  parseFormat,
  parseMimeType,
  unsupportedFormatMessage,
} from './fileImport.shared';

export { isSupportedFilename } from './fileImport.shared';

/**
 * Web implementation of audio import. Native uses `expo-file-system`'s
 * `File` API, which is unavailable in the browser. Here the user picks a
 * file with a DOM `<input type=file>`, the bytes are persisted as a Blob in
 * IndexedDB (see `webBlobStore.web`), and the returned `Track.uri` is a
 * `blob:` object URL so the track is immediately playable. The canonical
 * persisted uri (`idb://<id>`) is written by `trackStore.web`.
 */

const ACCEPT = 'audio/*,.mp3,.wav,.aac,.m4a';

/**
 * Grace period after the window regains focus before a file picker with no
 * `change` event is treated as dismissed. Long enough not to race a slow
 * `change`, short enough to recover the UI quickly.
 */
const DISMISS_GRACE_MS = 1000;

/**
 * Opens a native file picker and imports the chosen audio file. Resolves to
 * `cancelled` if the user dismisses the dialog without choosing a file.
 */
export async function pickAndImportFile(): Promise<ImportOutcome> {
  const file = await openFilePicker();
  if (!file) {
    return makeError('cancelled', 'File selection cancelled');
  }
  return importBlob(file, file.name, file.size);
}

/**
 * Imports audio from a URL (e.g. a `blob:` or `http:` source) by fetching
 * it into a Blob. Exported for API parity with the native module; web share
 * intents are not exercised (see `useShareIntent`).
 */
export async function importFromUri(
  sourceUri: string,
  originalFilename: string,
): Promise<ImportOutcome> {
  let blob: Blob;
  try {
    const response = await fetch(sourceUri);
    if (!response.ok) {
      return makeError('file_not_found', 'Source file not found');
    }
    blob = await response.blob();
  } catch {
    return makeError('file_not_found', 'Source file not found');
  }
  return importBlob(blob, originalFilename, blob.size);
}

/**
 * Core import logic shared by the picker and URI paths: validates the
 * format, stores the blob in IndexedDB, and builds the Track. Pure aside
 * from the IndexedDB write, so it is the unit covered by tests.
 */
export async function importBlob(
  blob: Blob,
  originalFilename: string,
  fileSizeBytes: number,
): Promise<ImportOutcome> {
  // Same precedence as the native path, so the two cannot disagree about
  // what the app accepts: the declared type, then the extension, then the
  // container's own header. A blob fetched from a `blob:` or `http:` URL
  // often arrives with no filename worth reading.
  const format =
    parseMimeType(blob.type) ??
    parseFormat(originalFilename) ??
    (await sniffBlob(blob));

  if (!format) {
    return makeError(
      'unsupported_format',
      unsupportedFormatMessage(originalFilename, blob.type),
    );
  }

  const id = generateId();

  try {
    await putBlob(id, blob);
    const uri = (await getObjectUrl(id)) ?? `idb://${id}`;

    const track: Track = {
      id,
      filename: displayFilename(originalFilename, format),
      uri,
      format,
      durationMs: estimateDurationMs(fileSizeBytes, format),
      durationEstimated: true,
      fileSizeBytes,
      importedAt: Date.now(),
      folderId: null,
      isFavorite: false,
      lastPlayedAt: null,
    };

    return { success: true, track };
  } catch {
    return makeError('copy_failed', 'Failed to save file to browser storage');
  }
}

/**
 * The container a blob's leading bytes describe, or null. Only the header is
 * read, so identifying a large track does not pull the whole file into
 * memory. `arrayBuffer` is missing from some older test and browser
 * environments, where the answer is simply "cannot tell".
 */
async function sniffBlob(blob: Blob): Promise<AudioFormat | null> {
  try {
    const head = blob.slice(0, SNIFF_LENGTH);
    if (typeof head.arrayBuffer !== 'function') return null;
    return sniffFormat(new Uint8Array(await head.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Presents a DOM file picker and resolves with the chosen File, or null if
 * the dialog is dismissed. Thin browser-only wrapper; the importable logic
 * lives in `importBlob`.
 */
function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.style.display = 'none';

    // Some browsers (e.g. certain Safari versions) never fire `cancel` when
    // the dialog is dismissed, which would leave this promise unsettled and
    // the import spinner stuck. As a fallback, watch for the window
    // regaining focus and, if no `change` has settled within a short grace
    // period, treat the dialog as dismissed. Only used where a real `window`
    // with event support exists (the node test environment lacks it).
    const win =
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
        ? window
        : undefined;

    let settled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const onFocus = () => {
      if (dismissTimer !== undefined) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => finish(null), DISMISS_GRACE_MS);
    };

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      if (dismissTimer !== undefined) clearTimeout(dismissTimer);
      win?.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish(input.files && input.files.length > 0 ? input.files[0] : null);
    });
    // `cancel` fires in modern browsers when the dialog is dismissed.
    input.addEventListener('cancel', () => finish(null));
    win?.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
