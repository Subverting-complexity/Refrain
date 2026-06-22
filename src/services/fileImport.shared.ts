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
  return EXTENSION_TO_FORMAT[getExtension(filename)] ?? null;
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
