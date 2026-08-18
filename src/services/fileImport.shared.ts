import { AudioFormat, ImportErrorCode, ImportOutcome } from '../types';

export const EXTENSION_TO_FORMAT: Record<string, AudioFormat> = {
  mp3: 'mp3',
  wav: 'wav',
  aac: 'aac',
  m4a: 'm4a',
};

export function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function parseFormat(filename: string): AudioFormat | null {
  const extension = getExtension(filename);
  // Own properties only. A bare index reaches the prototype chain, so an
  // extension naming an `Object.prototype` member — `mix.constructor`,
  // `mix.__proto__` — resolved to a truthy non-format that `?? null` let
  // through. That cleared `isSupportedFilename` (the share-intent guard) and
  // then produced a NaN duration, since `bitrateMap[format]` is undefined.
  if (!Object.prototype.hasOwnProperty.call(EXTENSION_TO_FORMAT, extension)) {
    return null;
  }
  return EXTENSION_TO_FORMAT[extension];
}

export function isSupportedFilename(filename: string): boolean {
  return parseFormat(filename) !== null;
}

export function makeError(
  error: ImportErrorCode,
  message: string,
): ImportOutcome {
  return { success: false, error, message };
}

export function estimateDurationMs(bytes: number, format: AudioFormat): number {
  const bitrateMap: Record<AudioFormat, number> = {
    mp3: 192_000,
    aac: 128_000,
    m4a: 128_000,
    wav: 1_411_000,
  };
  const bitsPerMs = bitrateMap[format] / 1000;
  return Math.round((bytes * 8) / bitsPerMs);
}
