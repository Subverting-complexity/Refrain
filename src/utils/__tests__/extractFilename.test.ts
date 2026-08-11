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

  // Regression for #187: backslash-separated paths used to return the whole
  // string, and percent-encoded names reached the UI still encoded.
  describe('backslash separators', () => {
    it('splits on backslashes', () => {
      expect(extractFilename('content:\\path\\song.mp3')).toBe('song.mp3');
    });

    it('splits on mixed separators, taking the last segment', () => {
      expect(extractFilename('file:///music\\albums/track.wav')).toBe(
        'track.wav',
      );
    });

    it('strips query params from a backslash path', () => {
      expect(extractFilename('content:\\files\\recording.aac?mode=r')).toBe(
        'recording.aac',
      );
    });
  });

  describe('percent-encoding', () => {
    it('decodes encoded spaces', () => {
      expect(extractFilename('content://com.provider/My%20Song.mp3')).toBe(
        'My Song.mp3',
      );
    });

    it('decodes an encoded hash without truncating the name', () => {
      expect(extractFilename('file:///music/Track%20%231.mp3')).toBe(
        'Track #1.mp3',
      );
    });

    it('decodes non-ASCII names', () => {
      expect(extractFilename('file:///music/Caf%C3%A9.m4a')).toBe('Café.m4a');
    });

    it('falls back to the raw segment on malformed encoding', () => {
      expect(extractFilename('file:///music/50%.mp3')).toBe('50%.mp3');
      expect(extractFilename('file:///music/%E0%A4%A.wav')).toBe(
        '%E0%A4%A.wav',
      );
    });

    it('still defaults when the path has no final segment', () => {
      expect(extractFilename('content:\\path\\')).toBe('shared-audio.mp3');
    });
  });
});
