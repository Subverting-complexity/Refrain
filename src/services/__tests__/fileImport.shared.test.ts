import {
  EXTENSION_TO_FORMAT,
  estimateDurationMs,
  getExtension,
  isSupportedFilename,
  makeError,
  parseFormat,
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
