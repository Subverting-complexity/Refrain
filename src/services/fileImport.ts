import { Directory, File, Paths } from 'expo-file-system';

import { ImportOutcome, Track } from '../types';
import { generateId } from '../utils/generateId';
import {
  estimateDurationMs,
  getExtension,
  makeError,
  parseFormat,
} from './fileImport.shared';

export { isSupportedFilename } from './fileImport.shared';

const SUPPORTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
];

function ensureTracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export async function pickAndImportFile(): Promise<ImportOutcome> {
  const result = await File.pickFileAsync({
    mimeTypes: SUPPORTED_MIME_TYPES,
  });

  if (result.canceled) {
    return {
      success: false,
      error: 'cancelled',
      message: 'File selection cancelled',
    };
  }

  const pickedFile = result.result;
  const filename = pickedFile.name ?? 'unknown.mp3';

  return importFromFile(pickedFile, filename);
}

export async function importFromUri(
  sourceUri: string,
  originalFilename: string,
): Promise<ImportOutcome> {
  const sourceFile = new File(sourceUri);

  if (!sourceFile.exists) {
    return makeError('file_not_found', 'Source file not found');
  }

  return importFromFile(sourceFile, originalFilename);
}

async function importFromFile(
  sourceFile: File,
  originalFilename: string,
): Promise<ImportOutcome> {
  const format = parseFormat(originalFilename);
  if (!format) {
    return makeError(
      'unsupported_format',
      `Unsupported format: ${getExtension(originalFilename)}`,
    );
  }

  // Use the shared generator rather than `Crypto.randomUUID` directly: it is
  // gated to secure contexts and throws otherwise, and here that throw would
  // escape `importFromFile` entirely (it sits ahead of the try below). The web
  // import and the segment-profile store already go through this helper.
  const id = generateId();
  const destFilename = `${id}.${format}`;

  try {
    const tracksDir = ensureTracksDir();
    const destFile = new File(tracksDir, destFilename);
    await sourceFile.copy(destFile);

    const fileSizeBytes = destFile.size;

    const track: Track = {
      id,
      filename: originalFilename,
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
