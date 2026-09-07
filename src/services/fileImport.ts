import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { AudioFormat, ImportOutcome, Track } from '../types';
import { generateId } from '../utils/generateId';
import { SNIFF_LENGTH, sniffFormat } from './audioSniff';
import {
  AUDIO_MIME_TYPES,
  displayFilename,
  estimateDurationMs,
  makeError,
  parseFormat,
  parseMimeType,
  unsupportedFormatMessage,
} from './fileImport.shared';

export { isSupportedFilename } from './fileImport.shared';

/**
 * What the system picker will let the reader choose.
 *
 * `audio/*` leads the list on purpose. The explicit types alone left files
 * greyed out on any device whose provider spelled the type differently to
 * the six names this list used to hold, which reads as a picker that opens
 * and does nothing. Anything selected that turns out not to be playable is
 * rejected below with a message naming the format, which is a far better
 * outcome than a file the reader can see but not select.
 */
const PICKER_MIME_TYPES = ['audio/*', ...AUDIO_MIME_TYPES];

/**
 * Extension for the copy made before the format is known. A file that has to
 * be identified from its bytes must be in app storage first, because a SAF
 * `content://` document cannot be opened for reading by handle.
 */
const STAGING_EXTENSION = 'part';

function ensureTracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * The MIME type the platform reports for a file, or an empty string.
 *
 * Read defensively: `type` is backed by a content-resolver lookup on Android
 * and a UTType lookup on iOS, either of which can fail for a document whose
 * provider has already gone away. A failure here is a missing signal, not an
 * import failure — the extension and the bytes are still to come.
 */
function readMimeType(file: File): string {
  try {
    return file.type ?? '';
  } catch {
    return '';
  }
}

/**
 * The container a copied file's leading bytes describe, or null.
 *
 * Reads through a file handle rather than `bytes()` so that identifying a
 * 100MB track does not pull 100MB into memory.
 */
function sniffFile(file: File): AudioFormat | null {
  let handle: ReturnType<File['open']> | undefined;
  try {
    handle = file.open(FileMode.ReadOnly);
    return sniffFormat(handle.readBytes(SNIFF_LENGTH));
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {
      // A handle that cannot be closed has nothing left to release.
    }
  }
}

function discard(file: File): void {
  try {
    file.delete();
  } catch {
    // Best effort. A staging file left behind is wasted space, not a
    // failure the reader can act on.
  }
}

export async function pickAndImportFile(): Promise<ImportOutcome> {
  const result = await File.pickFileAsync({
    mimeTypes: PICKER_MIME_TYPES,
  });

  if (result.canceled) {
    return {
      success: false,
      error: 'cancelled',
      message: 'File selection cancelled',
    };
  }

  const pickedFile = result.result;

  // `pickedFile.name` is `basename(uri)` and nothing more — expo rebuilds the
  // picked file from its URI, discarding the provider's display name. For an
  // Android SAF document that basename is an opaque id with no extension, so
  // it is passed along as a hint rather than relied on.
  return importFromFile(
    pickedFile,
    pickedFile.name ?? '',
    readMimeType(pickedFile),
  );
}

export async function importFromUri(
  sourceUri: string,
  originalFilename: string,
  declaredMimeType?: string | null,
): Promise<ImportOutcome> {
  const sourceFile = new File(sourceUri);

  if (!sourceFile.exists) {
    return makeError('file_not_found', 'Source file not found');
  }

  return importFromFile(
    sourceFile,
    originalFilename,
    declaredMimeType || readMimeType(sourceFile),
  );
}

async function importFromFile(
  sourceFile: File,
  originalFilename: string,
  declaredMimeType: string,
): Promise<ImportOutcome> {
  // The declared type leads. On Android it is the only signal that survives
  // the picker; the extension is a URI basename that usually carries none,
  // and on iOS the two agree anyway.
  const declaredFormat =
    parseMimeType(declaredMimeType) ?? parseFormat(originalFilename);

  // Use the shared generator rather than `Crypto.randomUUID` directly: it is
  // gated to secure contexts and throws otherwise, and here that throw would
  // escape `importFromFile` entirely (it sits ahead of the try below). The web
  // import and the segment-profile store already go through this helper.
  const id = generateId();

  try {
    const tracksDir = ensureTracksDir();

    let format = declaredFormat;
    let destFile: File;

    if (format) {
      destFile = new File(tracksDir, `${id}.${format}`);
      await sourceFile.copy(destFile);
    } else {
      // Nothing named the format, so the bytes have to. Copy first: the
      // source may be a content:// document, which cannot be read by handle.
      const staged = new File(tracksDir, `${id}.${STAGING_EXTENSION}`);
      await sourceFile.copy(staged);

      format = sniffFile(staged);
      if (!format) {
        discard(staged);
        return makeError(
          'unsupported_format',
          unsupportedFormatMessage(originalFilename, declaredMimeType),
        );
      }

      destFile = new File(tracksDir, `${id}.${format}`);
      await staged.move(destFile);
    }

    const fileSizeBytes = destFile.size;

    const track: Track = {
      id,
      filename: displayFilename(originalFilename, format),
      uri: destFile.uri,
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
    return makeError('copy_failed', 'Failed to copy file to app storage');
  }
}
