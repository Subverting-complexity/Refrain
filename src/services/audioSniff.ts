import { AudioFormat } from '../types';

/**
 * Bytes needed to recognise every container the app accepts. The longest
 * check reads the MPEG-4 `ftyp` box, which ends at byte 8; 12 leaves room
 * for the `WAVE` marker at byte 8 too.
 */
export const SNIFF_LENGTH = 12;

function matches(bytes: Uint8Array, offset: number, ascii: string): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * The audio container a file's leading bytes describe, or null when they
 * describe nothing the app can play.
 *
 * This is the last resort behind the declared MIME type and the filename
 * extension. It exists because Android's Storage Access Framework hands back
 * opaque document URIs carrying no usable name, and some document providers
 * report every file they hold as `application/octet-stream`. Without a look
 * at the bytes, those imports fail even though the file is an ordinary MP3.
 */
export function sniffFormat(head: Uint8Array): AudioFormat | null {
  // RIFF....WAVE
  if (matches(head, 0, 'RIFF') && matches(head, 8, 'WAVE')) return 'wav';

  // An ID3v2 tag only ever fronts MPEG audio among the formats we accept.
  if (matches(head, 0, 'ID3')) return 'mp3';

  // MPEG-4 container: the `ftyp` box always starts at byte 4. Both .m4a and
  // AAC-in-MP4 land here, and both play through the same decoder, so the
  // brand that follows does not need reading.
  if (matches(head, 4, 'ftyp')) return 'm4a';

  // A bare frame with no tag in front of it. Byte 1 carries the tail of the
  // 11-bit sync word plus the version and layer bits, and it is the layer
  // bits that separate ADTS AAC (layer 00) from MP3 (layer III, 01).
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    const layer = head[1] & 0x06;
    if (layer === 0x00) return 'aac';
    if (layer === 0x02) return 'mp3';
  }

  return null;
}
