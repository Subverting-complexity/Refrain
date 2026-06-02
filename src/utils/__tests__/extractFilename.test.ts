import { extractFilename } from '../extractFilename';

describe('extractFilename', () => {
  it('extracts filename from a simple path', () => {
    expect(extractFilename('https://example.com/song.mp3')).toBe('song.mp3');
  });

  it('strips query parameters', () => {
    expect(extractFilename('https://example.com/song.mp3?token=abc')).toBe(
      'song.mp3',
    );
  });

  it('strips fragment identifiers', () => {
    expect(extractFilename('https://example.com/song.mp3#section')).toBe(
      'song.mp3',
    );
  });

  it('strips both query parameters and fragment', () => {
    expect(
      extractFilename('https://example.com/song.mp3?token=abc#section'),
    ).toBe('song.mp3');
  });

  it('handles deeply nested paths', () => {
    expect(extractFilename('https://cdn.example.com/a/b/c/track.wav?v=2')).toBe(
      'track.wav',
    );
  });

  it('handles file:// URIs', () => {
    expect(extractFilename('file:///storage/emulated/0/song.m4a')).toBe(
      'song.m4a',
    );
  });

  it('handles content:// URIs with query params', () => {
    expect(
      extractFilename('content://com.provider/files/recording.aac?mode=r'),
    ).toBe('recording.aac');
  });

  it('returns default filename for empty path', () => {
    expect(extractFilename('')).toBe('shared-audio.mp3');
  });

  it('returns default filename for URL ending in slash', () => {
    expect(extractFilename('https://example.com/')).toBe('shared-audio.mp3');
  });

  it('handles URL with multiple query parameters', () => {
    expect(
      extractFilename(
        'https://drive.google.com/file/song.mp3?authuser=0&token=xyz',
      ),
    ).toBe('song.mp3');
  });
});
