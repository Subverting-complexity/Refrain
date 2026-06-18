import * as Crypto from 'expo-crypto';

/**
 * Builds a v4 UUID from cryptographically-secure random bytes. Unlike
 * `crypto.randomUUID`, `getRandomValues` is available on insecure origins, so
 * this works when the web build is served over plain HTTP (e.g. a LAN address
 * on a phone) where `randomUUID` is `undefined`.
 */
function uuidV4FromRandomBytes(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generates a random v4 UUID. Prefers `Crypto.randomUUID`, but that throws on
 * insecure origins (it is gated to secure contexts). Rather than let the throw
 * escape, fall back to a UUID built from `getRandomValues`, which has no
 * secure-context requirement. Shared by track import and the segment-profile
 * store so id generation stays consistent across the app.
 */
export function generateId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return uuidV4FromRandomBytes();
  }
}
