/**
 * Splitting a track's display filename into the part the user may edit and the
 * part that must survive a rename untouched.
 *
 * `Track.filename` is display metadata only — the audio itself is stored at
 * `tracks/<id>.<format>` and the format is its own column — so a rename must
 * carry the extension through verbatim. Letting the user drop or change it
 * would leave the name on screen disagreeing with the track's recorded format
 * while the file on disk stayed exactly where it was.
 */

// Path separators and control characters. A display filename is never used to
// build a path, but one containing a separator would render as a directory in
// the library row and the player title, and control characters would render as
// nothing at all — so both are folded to a space before the name is kept.
const UNSAFE_NAME_CHARS = /[\\/]|\p{Cc}/gu;

const WHITESPACE_RUN = /\s+/g;

/**
 * The editable part of a filename: everything before the final dot.
 *
 * A name with no dot, or one whose only dot leads it (`.hidden`), has no
 * extension to protect, so the whole string is the base name.
 */
export function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/**
 * The extension of a filename including its leading dot, or an empty string
 * when there is none. Complement of {@link getBaseName}: the two always
 * concatenate back to the original filename.
 */
export function getExtensionWithDot(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot) : '';
}

/**
 * Normalizes a user-typed base name: folds path separators and control
 * characters to spaces, collapses whitespace runs, and trims. An empty result
 * means the user cleared the field — what that means is the caller's policy.
 */
export function sanitizeBaseName(input: string): string {
  return input
    .replace(UNSAFE_NAME_CHARS, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

/**
 * Rebuilds `filename` around a new base name, preserving the original
 * extension. The base name is sanitized first; an empty one yields an empty
 * string rather than a bare extension, so callers can treat `''` as "no name
 * was given" without having to re-check.
 */
export function withBaseName(filename: string, baseName: string): string {
  const safeBase = sanitizeBaseName(baseName);
  if (!safeBase) return '';
  return `${safeBase}${getExtensionWithDot(filename)}`;
}
