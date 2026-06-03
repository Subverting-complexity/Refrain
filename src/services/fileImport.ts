import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import { AudioFormat, ImportErrorCode, ImportOutcome, Track } from '../types';

/**
 * The `expo-file-system` `File`/`Directory` API is native-only. Its web stub
 * lacks the methods the constructor calls (e.g. `validatePath`), so any
 * `new File(...)` throws on web. Guard import entry points instead of letting
 * that crash propagate (e.g. up through a share-intent deep link).
 */
const FILE_SYSTEM_SUPPORTED = Platform.OS !== 'web';

const SUPPORTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
];

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
  const ext = getExtension(filename);
  return EXTENSION_TO_FORMAT[ext] ?? null;
}

function ensureTracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export async function pickAndImportFile(): Promise<ImportOutcome> {
  if (!FILE_SYSTEM_SUPPORTED) {
    return makeError(
      'unsupported_platform',
      'File import is not supported on this platform',
    );
  }

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
  if (!FILE_SYSTEM_SUPPORTED) {
    return makeError(
      'unsupported_platform',
      'File import is not supported on this platform',
    );
  }

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

  const id = Crypto.randomUUID();
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
    };

    return { success: true, track };
  } catch {
    return makeError('copy_failed', 'Failed to copy file to app storage');
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

function makeError(error: ImportErrorCode, message: string): ImportOutcome {
  return { success: false, error, message };
}

export function isSupportedFilename(filename: string): boolean {
  return parseFormat(filename) !== null;
}
