import {
  EXTENSION_TO_FORMAT,
  displayFilename,
  estimateDurationMs,
  getExtension,
  isSupportedFilename,
  makeError,
  normaliseMimeType,
  parseFormat,
  parseMimeType,
  unsupportedFormatMessage,
} from '../fileImport.shared';

describe('getExtension', () => {
  it('returns lowercase extension', () => {
    expect(getExtension('song.MP3')).toBe('mp3');
  });

  it('returns last extension for multi-dot filenames', () => {
    expect(getExtension('my.song.wav')).toBe('wav');
  });

  it('returns empty string when no extension', () => {
    expect(getExtension('noext')).toBe('');
  });
});

describe('parseFormat', () => {
  it.each(['mp3', 'wav', 'aac', 'm4a'] as const)('parses .%s', (ext) => {
    expect(parseFormat(`file.${ext}`)).toBe(ext);
  });

  it('is case-insensitive', () => {
    expect(parseFormat('file.WAV')).toBe('wav');
  });

  it('returns null for unsupported extensions', () => {
    expect(parseFormat('file.flac')).toBeNull();
    expect(parseFormat('noext')).toBeNull();
  });

  // A bare index lookup reaches the prototype chain, so these resolved to a
  // truthy non-format that `?? null` let through. Only all-lowercase keys are
  // reachable — `getExtension` lowercases, so `.toString` arrives as
  // `tostring` and misses the prototype anyway (see below).
  it.each(['constructor', '__proto__'])(
    'returns null for the inherited Object.prototype key .%s',
    (key) => {
      expect(parseFormat(`mix.${key}`)).toBeNull();
    },
  );

  // Pins the lowercasing that makes the mixed-case prototype keys unreachable,
  // so a future change to getExtension can't quietly widen the hole.
  it.each(['toString', 'valueOf', 'hasOwnProperty'])(
    'returns null for the mixed-case prototype key .%s',
    (key) => {
      expect(parseFormat(`mix.${key}`)).toBeNull();
    },
  );
});

describe('isSupportedFilename', () => {
  it('accepts supported formats', () => {
    expect(isSupportedFilename('a.mp3')).toBe(true);
    expect(isSupportedFilename('a.wav')).toBe(true);
    expect(isSupportedFilename('a.aac')).toBe(true);
    expect(isSupportedFilename('a.m4a')).toBe(true);
  });

  it('rejects unsupported formats', () => {
    expect(isSupportedFilename('a.flac')).toBe(false);
    expect(isSupportedFilename('noext')).toBe(false);
  });

  // This is the share-intent guard: a name clearing it reaches importFromUri
  // and lands a track whose duration estimate is NaN.
  it('rejects filenames whose extension names an Object.prototype key', () => {
    expect(isSupportedFilename('mix.constructor')).toBe(false);
    expect(isSupportedFilename('mix.__proto__')).toBe(false);
  });
});

describe('normaliseMimeType', () => {
  it('lowercases and trims', () => {
    expect(normaliseMimeType('  Audio/MPEG ')).toBe('audio/mpeg');
  });

  it('drops parameters', () => {
    expect(normaliseMimeType('audio/mpeg; charset=binary')).toBe('audio/mpeg');
  });

  it('returns empty for anything not type-shaped', () => {
    expect(normaliseMimeType(undefined)).toBe('');
    expect(normaliseMimeType(null)).toBe('');
    expect(normaliseMimeType('')).toBe('');
    expect(normaliseMimeType('audio')).toBe('');
  });
});

describe('parseMimeType', () => {
  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/mp3', 'mp3'],
    ['audio/x-wav', 'wav'],
    ['audio/vnd.wave', 'wav'],
    ['audio/x-aac', 'aac'],
    ['audio/mp4', 'm4a'],
    ['audio/x-m4a', 'm4a'],
    ['audio/mp4a-latm', 'm4a'],
  ])('parses %s as %s', (mime, format) => {
    expect(parseMimeType(mime)).toBe(format);
  });

  it('returns null for types the app cannot play', () => {
    expect(parseMimeType('audio/flac')).toBeNull();
    expect(parseMimeType('application/octet-stream')).toBeNull();
    expect(parseMimeType('')).toBeNull();
    expect(parseMimeType(undefined)).toBeNull();
  });

  it('returns null for an inherited Object.prototype key', () => {
    expect(parseMimeType('constructor')).toBeNull();
    expect(parseMimeType('__proto__')).toBeNull();
  });
});

describe('displayFilename', () => {
  it('keeps a name that carries a recognised extension', () => {
    expect(displayFilename('My Song.mp3', 'mp3')).toBe('My Song.mp3');
  });

  it('percent-decodes a name before storing it', () => {
    expect(displayFilename('My%20Song.mp3', 'mp3')).toBe('My Song.mp3');
  });

  // The Play Store rejection: an Android document id is what the picker
  // returns as the name, and it must never be shown as a track title.
  it.each(['audio:1000000033', 'msf:42', '9f2c1b', ''])(
    'replaces the document id %s with a readable label',
    (name) => {
      expect(displayFilename(name, 'wav')).toBe('Imported track.wav');
    },
  );

  it('replaces a name whose extension is not one we play', () => {
    expect(displayFilename('clip.flac', 'mp3')).toBe('Imported track.mp3');
  });
});

describe('unsupportedFormatMessage', () => {
  it('names the extension when there is one', () => {
    expect(unsupportedFormatMessage('clip.flac')).toBe(
      'Unsupported format: flac',
    );
  });

  it('names the declared type when the name carries no extension', () => {
    expect(unsupportedFormatMessage('audio:1000000033', 'audio/flac')).toBe(
      'Unsupported format: audio/flac',
    );
  });

  // The message in Google's rejection screenshot ended at the colon, which
  // told the reader nothing about why the import failed.
  it('never ends at the colon when nothing is known', () => {
    const message = unsupportedFormatMessage('9f2c1b', '');
    expect(message).toBe('Unsupported audio format');
    expect(message).not.toMatch(/:\s*$/);
  });
});

describe('makeError', () => {
  it('returns an ImportOutcome with success false', () => {
    const result = makeError('file_not_found', 'gone');
    expect(result).toEqual({
      success: false,
      error: 'file_not_found',
      message: 'gone',
    });
  });
});

describe('estimateDurationMs', () => {
  it('returns a positive number for all formats', () => {
    for (const fmt of Object.values(EXTENSION_TO_FORMAT)) {
      expect(estimateDurationMs(1_000_000, fmt)).toBeGreaterThan(0);
    }
  });

  it('estimates wav shorter than mp3 for the same byte size', () => {
    const mp3 = estimateDurationMs(1_000_000, 'mp3');
    const wav = estimateDurationMs(1_000_000, 'wav');
    expect(wav).toBeLessThan(mp3);
  });

  it('scales proportionally with byte size', () => {
    const small = estimateDurationMs(500_000, 'mp3');
    const large = estimateDurationMs(1_000_000, 'mp3');
    expect(Math.abs(large - small * 2)).toBeLessThanOrEqual(1);
  });
});
