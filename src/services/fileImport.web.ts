import * as Crypto from 'expo-crypto';

import { AudioFormat, ImportErrorCode, ImportOutcome, Track } from '../types';
import { getObjectUrl, putBlob } from './webBlobStore.web';

/**
 * Web implementation of audio import. Native uses `expo-file-system`'s
 * `File` API, which is unavailable in the browser. Here the user picks a
 * file with a DOM `<input type=file>`, the bytes are persisted as a Blob in
 * IndexedDB (see `webBlobStore.web`), and the returned `Track.uri` is a
 * `blob:` object URL so the track is immediately playable. The canonical
 * persisted uri (`idb://<id>`) is written by `trackStore.web`.
 */

const ACCEPT = 'audio/*,.mp3,.wav,.aac,.m4a';

const EXTENSION_TO_FORMAT: Record<string, AudioFormat> = {
  mp3: 'mp3',
  wav: 'wav',
  aac: 'aac',
  m4a: 'm4a',
};

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function parseFormat(filename: string): AudioFormat | null {
  return EXTENSION_TO_FORMAT[getExtension(filename)] ?? null;
}

export function isSupportedFilename(filename: string): boolean {
  return parseFormat(filename) !== null;
}

function makeError(error: ImportErrorCode, message: string): ImportOutcome {
  return { success: false, error, message };
}

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
  const format = parseFormat(originalFilename);
  if (!format) {
    return makeError(
      'unsupported_format',
      `Unsupported format: ${getExtension(originalFilename)}`,
    );
  }

  const id = Crypto.randomUUID();

  try {
    await putBlob(id, blob);
    const uri = (await getObjectUrl(id)) ?? `idb://${id}`;

    const track: Track = {
      id,
      filename: originalFilename,
      uri,
      format,
      durationMs: estimateDurationMs(fileSizeBytes, format),
      durationEstimated: true,
      fileSizeBytes,
      importedAt: Date.now(),
    };

    return { success: true, track };
  } catch {
    return makeError('copy_failed', 'Failed to save file to browser storage');
  }
}

function estimateDurationMs(bytes: number, format: AudioFormat): number {
  const bitrateMap: Record<AudioFormat, number> = {
    mp3: 192_000,
    aac: 128_000,
    m4a: 128_000,
    wav: 1_411_000,
  };
  const bitsPerMs = bitrateMap[format] / 1000;
  return Math.round((bytes * 8) / bitsPerMs);
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

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish(input.files && input.files.length > 0 ? input.files[0] : null);
    });
    // `cancel` fires in modern browsers when the dialog is dismissed.
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();
  });
}
