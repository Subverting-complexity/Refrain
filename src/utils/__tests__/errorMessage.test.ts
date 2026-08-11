/**
 * @jest-environment node
 */
import { errorMessage } from '../errorMessage';

describe('errorMessage', () => {
  it('uses an Error message', () => {
    expect(errorMessage(new Error('disk full'))).toBe('disk full');
  });

  it('uses a thrown string', () => {
    expect(errorMessage('raw failure')).toBe('raw failure');
  });

  it('falls back for an Error with an empty message', () => {
    // An empty banner reads as a bug, not a failure.
    expect(errorMessage(new Error(''))).toBe('Unknown error');
  });

  it('falls back for an empty string', () => {
    expect(errorMessage('')).toBe('Unknown error');
  });

  it('falls back for a non-Error, non-string value', () => {
    // Rendering these directly would show "[object Object]".
    expect(errorMessage({ code: 500 })).toBe('Unknown error');
    expect(errorMessage(null)).toBe('Unknown error');
    expect(errorMessage(undefined)).toBe('Unknown error');
  });
});
