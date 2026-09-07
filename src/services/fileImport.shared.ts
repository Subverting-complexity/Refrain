import { AudioFormat, ImportErrorCode, ImportOutcome } from '../types';

export const EXTENSION_TO_FORMAT: Record<string, AudioFormat> = {
  mp3: 'mp3',
  wav: 'wav',
  aac: 'aac',
  m4a: 'm4a',
};

/**
 * Every MIME type a platform is known to report for the four formats the app
 * accepts. One name per format is not enough: Android document providers,
 * the media store and the share sheet each pick a different spelling for the
 * same file, and a type missing from this map is a file the app refuses.
 *
 * This is the single source of truth for the audio types the app handles.
 * The Android intent filter in `app.json` must list exactly these keys —
 * `fileImport.mimeTypes.test.ts` fails if the two drift apart.
 */
export const MIME_TO_FORMAT: Record<string, AudioFormat> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-mpeg': 'mp3',
  'audio/mpeg3': 'mp3',
  'audio/x-mpeg-3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/aacp': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mp4a-latm': 'm4a',
};

/** The accepted MIME types, in the order `MIME_TO_FORMAT` declares them. */
export const AUDIO_MIME_TYPES = Object.keys(MIME_TO_FORMAT);

/**
 * Filename used when nothing recoverable came back with the file. Android's
 * Storage Access Framework returns document URIs whose last segment is an
 * opaque id (`audio:1000000033`, `msf:42`), and that id must never reach the
 * library as a track name.
 */
export const FALLBACK_TRACK_NAME = 'Imported track';

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

/**
 * The bare type name from a MIME header, lowercased with any parameters
 * stripped (`audio/mpeg; charset=binary` → `audio/mpeg`). Returns an empty
 * string when there is nothing type-shaped to read, so callers can tell
 * "no type given" from "a type we do not accept".
 */
export function normaliseMimeType(mimeType: string | null | undefined): string {
  const bare = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  return bare.includes('/') ? bare : '';
}

/**
 * The format a declared MIME type names, or null when it names none.
 *
 * On Android this is the only trustworthy signal the picker returns: the
 * file's name is derived from the document URI, which carries no extension
 * for most providers.
 */
export function parseMimeType(
  mimeType: string | null | undefined,
): AudioFormat | null {
  const bare = normaliseMimeType(mimeType);
  if (!Object.prototype.hasOwnProperty.call(MIME_TO_FORMAT, bare)) {
    return null;
  }
  return MIME_TO_FORMAT[bare];
}

export function isSupportedFilename(filename: string): boolean {
  return parseFormat(filename) !== null;
}

/**
 * Percent-decode a name, falling back to the raw text. A malformed sequence
 * (a literal `%` in the name, e.g. `50%.mp3`) makes `decodeURIComponent`
 * throw, and the raw name is a better answer there than an error.
 */
export function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The name to store against an imported track.
 *
 * A name is kept only when it carries an extension the app recognises.
 * Everything else is an Android document id rather than a filename — the
 * picker derives the name from the URI, so `audio:1000000033` is what a
 * media-provider pick actually produces — and a neutral label reads far
 * better in the library than the id does.
 */
export function displayFilename(name: string, format: AudioFormat): string {
  const decoded = decodeName(name.trim());
  return isSupportedFilename(decoded)
    ? decoded
    : `${FALLBACK_TRACK_NAME}.${format}`;
}

/**
 * The message shown when a file cannot be played.
 *
 * Names whatever is actually known about the file. The extension is the most
 * recognisable handle when there is one; the declared type is the next best.
 * Neither is guaranteed on Android, and a bare `Unsupported format:` with
 * nothing after the colon — which is what a picked document URI used to
 * produce — tells the reader nothing at all.
 */
export function unsupportedFormatMessage(
  filename: string,
  mimeType?: string | null,
): string {
  const extension = getExtension(decodeName(filename));
  if (extension) return `Unsupported format: ${extension}`;

  const bare = normaliseMimeType(mimeType);
  if (bare) return `Unsupported format: ${bare}`;

  return 'Unsupported audio format';
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
