/**
 * @jest-environment node
 */
import { generateId } from '../generateId';

const mockRandomUUID = jest.fn<string, []>(() => 'uuid-1');
const mockGetRandomValues = jest.fn(
  (arr: Uint8Array) => arr.fill(0xab) as Uint8Array,
);

jest.mock('expo-crypto', () => ({
  randomUUID: (...args: []) => mockRandomUUID(...args),
  getRandomValues: (arr: Uint8Array) => mockGetRandomValues(arr),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateId', () => {
  it('returns a secure-context randomUUID when available', () => {
    expect(generateId()).toBe('uuid-1');
    expect(mockGetRandomValues).not.toHaveBeenCalled();
  });

  it('falls back to a getRandomValues UUID on insecure origins', () => {
    // `crypto.randomUUID` is gated to secure contexts and throws on plain HTTP.
    mockRandomUUID.mockImplementationOnce(() => {
      throw new TypeError('randomUUID is not a function');
    });

    const id = generateId();

    expect(mockGetRandomValues).toHaveBeenCalled();
    // Bytes filled with 0xab, with the version (4) and variant (10xx) bits
    // forced into a valid v4 UUID.
    expect(id).toBe('abababab-abab-4bab-abab-abababababab');
  });
});
