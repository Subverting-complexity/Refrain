const DEFAULT_FILENAME = 'shared-audio.mp3';

// Both separators: shared URIs mostly use `/`, but a Windows-origin or
// SMB-backed path can arrive backslash-separated, where splitting on `/`
// alone returns the entire string as the "filename".
const PATH_SEPARATOR = /[\\/]/;

/**
 * Percent-decode a path segment, falling back to the raw text. A shared URI
 * is normally encoded (`My%20Song.mp3`), and the decoded form is what the
 * library list and the player header display. A malformed sequence (a literal
 * `%` in the name, e.g. `50%.mp3`) makes `decodeURIComponent` throw, so the
 * raw segment is the fallback rather than an error.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The display filename carried by a shared/imported URI. The fragment and
 * query are stripped from the raw URI first — those delimiters are never
 * percent-encoded in a well-formed URI, so they must be removed before
 * decoding, or an encoded `%23` in the name would be decoded into a `#` and
 * then truncate the name.
 */
export function extractFilename(url: string): string {
  const withoutFragment = url.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  const filename = withoutQuery.split(PATH_SEPARATOR).pop();
  return filename ? decodeSegment(filename) : DEFAULT_FILENAME;
}
