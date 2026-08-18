import {
  getBaseName,
  getExtensionWithDot,
  sanitizeBaseName,
  withBaseName,
} from '../filenameParts';

describe('getBaseName', () => {
  it('returns the part before the final dot', () => {
    expect(getBaseName('song.mp3')).toBe('song');
  });

  it('keeps interior dots in the base name', () => {
    expect(getBaseName('live.take.2.wav')).toBe('live.take.2');
  });

  it('returns the whole name when there is no extension', () => {
    expect(getBaseName('song')).toBe('song');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    expect(getBaseName('.hidden')).toBe('.hidden');
  });

  it('returns an empty string for an empty filename', () => {
    expect(getBaseName('')).toBe('');
  });
});

describe('getExtensionWithDot', () => {
  it('returns the extension including its dot', () => {
    expect(getExtensionWithDot('song.mp3')).toBe('.mp3');
  });

  it('returns only the final extension', () => {
    expect(getExtensionWithDot('live.take.2.wav')).toBe('.wav');
  });

  it('returns an empty string when there is no extension', () => {
    expect(getExtensionWithDot('song')).toBe('');
  });

  it('returns an empty string for a leading-dot name', () => {
    expect(getExtensionWithDot('.hidden')).toBe('');
  });

  // The pair is a true split: whatever the shape of the input, rejoining the
  // two halves has to reproduce it, or a rename could not be lossless.
  it.each(['song.mp3', 'live.take.2.wav', 'song', '.hidden', 'song.', ''])(
    'recomposes %p from its base name and extension',
    (filename) => {
      expect(getBaseName(filename) + getExtensionWithDot(filename)).toBe(
        filename,
      );
    },
  );
});

describe('sanitizeBaseName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeBaseName('  Practice take  ')).toBe('Practice take');
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeBaseName('Practice    take')).toBe('Practice take');
  });

  it('folds path separators to a space so a name cannot read as a path', () => {
    expect(sanitizeBaseName('etc/passwd')).toBe('etc passwd');
    expect(sanitizeBaseName('C:\\Windows\\System32')).toBe(
      'C: Windows System32',
    );
  });

  it('strips control characters', () => {
    expect(sanitizeBaseName('Take\u00001\u0007')).toBe('Take 1');
  });

  it('returns an empty string for a whitespace-only name', () => {
    expect(sanitizeBaseName('   ')).toBe('');
  });
});

describe('withBaseName', () => {
  it('swaps the base name and keeps the extension', () => {
    expect(withBaseName('song.mp3', 'Practice take')).toBe('Practice take.mp3');
  });

  it('keeps only the final extension of a multi-dot name', () => {
    expect(withBaseName('live.take.2.wav', 'Solo')).toBe('Solo.wav');
  });

  it('appends no extension when the original had none', () => {
    expect(withBaseName('song', 'Solo')).toBe('Solo');
  });

  it('sanitizes the incoming base name', () => {
    expect(withBaseName('song.mp3', '  a/b  ')).toBe('a b.mp3');
  });

  // Returning '' rather than '.mp3' is what lets callers treat an emptied
  // field as "no rename" without re-deriving whether anything was typed.
  it('returns an empty string rather than a bare extension when the name is blank', () => {
    expect(withBaseName('song.mp3', '   ')).toBe('');
  });
});
