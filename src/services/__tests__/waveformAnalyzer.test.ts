import { extractPeaks } from '../waveformAnalyzer';

// Backing buffer for the mocked file, set per-test via setMockFile().
let mockBuffer = new ArrayBuffer(0);
// Records the lengths requested through readBytes so tests can assert the file
// is read in bounded windows rather than one giant buffer.
const mockReadBytesLengths: number[] = [];
// Asserts the streaming path never falls back to whole-file buffering.
const mockArrayBufferSpy = jest.fn();

function setMockFile(buffer: ArrayBuffer): void {
  mockBuffer = buffer;
  mockReadBytesLengths.length = 0;
}

jest.mock('expo-file-system', () => ({
  FileMode: { ReadOnly: 'r' },
  File: jest.fn().mockImplementation(() => ({
    get size() {
      return mockBuffer.byteLength;
    },
    arrayBuffer: mockArrayBufferSpy,
    open: () => {
      const bytes = new Uint8Array(mockBuffer);
      let cursor = 0;
      return {
        get offset() {
          return cursor;
        },
        set offset(value: number) {
          cursor = value;
        },
        size: bytes.length,
        readBytes: (length: number) => {
          mockReadBytesLengths.push(length);
          const end = Math.min(cursor + length, bytes.length);
          const slice = bytes.slice(cursor, end);
          cursor = end;
          return slice;
        },
        close: jest.fn(),
      };
    },
  })),
}));

const WAV_AUDIO_FORMAT_PCM = 1;
const WAV_AUDIO_FORMAT_IEEE_FLOAT = 3;

function createWavBuffer(
  samples: number[],
  bitsPerSample = 16,
  audioFormat: number = WAV_AUDIO_FORMAT_PCM,
): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = 44100;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, audioFormat, true); // 1 = PCM, 3 = IEEE float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  const isFloat = audioFormat === WAV_AUDIO_FORMAT_IEEE_FLOAT;
  for (let i = 0; i < samples.length; i++) {
    if (bytesPerSample === 2) {
      view.setInt16(headerSize + i * 2, Math.round(samples[i] * 32767), true);
    } else if (bytesPerSample === 1) {
      view.setUint8(headerSize + i, Math.round(samples[i] * 127 + 128));
    } else if (bytesPerSample === 4) {
      if (isFloat) {
        view.setFloat32(headerSize + i * 4, samples[i], true);
      } else {
        view.setInt32(
          headerSize + i * 4,
          Math.round(samples[i] * 2147483647),
          true,
        );
      }
    }
  }

  return buffer;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('extractPeaks', () => {
  describe('WAV files', () => {
    it('extracts peaks from a 16-bit WAV file', async () => {
      const samples = Array.from({ length: 400 }, (_, i) =>
        Math.sin((i / 400) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(peaks).toHaveLength(10);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('extracts peaks from an 8-bit WAV file', async () => {
      const samples = Array.from({ length: 200 }, (_, i) =>
        Math.sin((i / 200) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples, 8));

      const peaks = await extractPeaks('file:///test.wav', 5);

      expect(peaks).toHaveLength(5);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('normalizes peaks so the maximum is 1', async () => {
      const samples = Array.from({ length: 400 }, (_, i) =>
        Math.sin((i / 400) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
    });

    it('returns minimum amplitude for silent audio', async () => {
      const samples = new Array(200).fill(0);
      setMockFile(createWavBuffer(samples));

      const peaks = await extractPeaks('file:///test.wav', 5);

      expect(peaks).toHaveLength(5);
      peaks.forEach((p) => {
        expect(p).toBeCloseTo(0.1, 5);
      });
    });

    it('extracts peaks from a 32-bit WAV file', async () => {
      const samples = Array.from({ length: 400 }, (_, i) =>
        Math.sin((i / 400) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples, 32));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(peaks).toHaveLength(10);
      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('extracts peaks from a 32-bit IEEE float WAV file', async () => {
      const samples = Array.from({ length: 400 }, (_, i) =>
        Math.sin((i / 400) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples, 32, WAV_AUDIO_FORMAT_IEEE_FLOAT));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(peaks).toHaveLength(10);
      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('decodes float samples as float, not as Int32', async () => {
      // Reading these float bytes as Int32 yields wildly different RMS peaks.
      // A correct float decode tracks the |sin| envelope: a louder first half
      // (amplitude 1) and a quieter second half (amplitude 0.25).
      const samples = Array.from({ length: 400 }, (_, i) => {
        const amp = i < 200 ? 1 : 0.25;
        return amp * Math.sin((i / 20) * Math.PI * 2);
      });
      setMockFile(createWavBuffer(samples, 32, WAV_AUDIO_FORMAT_IEEE_FLOAT));

      const peaks = await extractPeaks('file:///test.wav', 4);

      // First-half buckets should be clearly louder than second-half buckets.
      const firstHalf = (peaks[0] + peaks[1]) / 2;
      const secondHalf = (peaks[2] + peaks[3]) / 2;
      expect(firstHalf).toBeGreaterThan(secondHalf * 2);
    });

    it('falls back to compressed derivation for unsupported audio format', async () => {
      // WAVE_FORMAT_EXTENSIBLE (0xFFFE) is not decoded directly; the analyzer
      // must fall back gracefully rather than emit garbage or throw.
      const samples = Array.from({ length: 400 }, (_, i) =>
        Math.sin((i / 400) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples, 16, 0xfffe));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(peaks).toHaveLength(10);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('uses default bucket count of 200', async () => {
      const samples = Array.from({ length: 2000 }, (_, i) =>
        Math.sin((i / 2000) * Math.PI * 2),
      );
      setMockFile(createWavBuffer(samples));

      const peaks = await extractPeaks('file:///test.wav');

      expect(peaks).toHaveLength(200);
    });
  });

  describe('compressed formats', () => {
    it('derives peaks from non-WAV file byte content', async () => {
      const bytes = new Uint8Array(1000);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.abs(Math.sin(i / 100)) * 255);
      }
      setMockFile(bytes.buffer);

      const peaks = await extractPeaks('file:///test.mp3', 10);

      expect(peaks).toHaveLength(10);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('produces consistent results for the same data', async () => {
      const bytes = new Uint8Array(500);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = i % 256;
      }

      setMockFile(bytes.buffer.slice(0));
      const peaks1 = await extractPeaks('file:///test.mp3', 10);

      setMockFile(bytes.buffer.slice(0));
      const peaks2 = await extractPeaks('file:///test.mp3', 10);

      expect(peaks1).toEqual(peaks2);
    });

    it('falls back to compressed parsing for truncated WAV', async () => {
      const buffer = new ArrayBuffer(20);
      setMockFile(buffer);

      const peaks = await extractPeaks('file:///test.wav', 5);

      expect(peaks).toHaveLength(5);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('streaming (large files)', () => {
    // 16-bit samples → ~400 KB of audio data, larger than one read window.
    const READ_WINDOW_BYTES = 256 * 1024;

    it('never reads more than one window at a time and skips arrayBuffer', async () => {
      const samples = Array.from({ length: 200_000 }, (_, i) =>
        Math.sin((i / 1000) * Math.PI * 2),
      );
      const buffer = createWavBuffer(samples);
      expect(buffer.byteLength).toBeGreaterThan(READ_WINDOW_BYTES);
      setMockFile(buffer);

      const peaks = await extractPeaks('file:///big.wav', 200);

      expect(peaks).toHaveLength(200);
      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });

      // Whole-file buffering must not be used.
      expect(mockArrayBufferSpy).not.toHaveBeenCalled();
      // Every individual read stays within the bounded window.
      mockReadBytesLengths.forEach((len) => {
        expect(len).toBeLessThanOrEqual(READ_WINDOW_BYTES);
      });
      // The data region spanned more than one window, proving streaming.
      const dataReads = mockReadBytesLengths.filter((len) => len > 1024);
      expect(dataReads.length).toBeGreaterThan(1);
    });

    it('produces identical peaks whether or not the data spans windows', async () => {
      // A bucket count that divides evenly so the small and large signals,
      // built from the same per-bucket pattern, yield matching RMS peaks.
      const bucketCount = 100;
      const pattern = (i: number, period: number) =>
        Math.sin((i / period) * Math.PI * 2);

      const small = Array.from({ length: bucketCount * 50 }, (_, i) =>
        pattern(Math.floor(i / 50), bucketCount),
      );
      setMockFile(createWavBuffer(small));
      const smallPeaks = await extractPeaks('file:///small.wav', bucketCount);

      const large = Array.from({ length: bucketCount * 2000 }, (_, i) =>
        pattern(Math.floor(i / 2000), bucketCount),
      );
      const largeBuffer = createWavBuffer(large);
      expect(largeBuffer.byteLength).toBeGreaterThan(READ_WINDOW_BYTES);
      setMockFile(largeBuffer);
      const largePeaks = await extractPeaks('file:///large.wav', bucketCount);

      largePeaks.forEach((p, i) => {
        expect(p).toBeCloseTo(smallPeaks[i], 5);
      });
    });

    it('streams compressed files in bounded windows', async () => {
      const bytes = new Uint8Array(READ_WINDOW_BYTES * 2 + 5000);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.abs(Math.sin(i / 500)) * 255);
      }
      setMockFile(bytes.buffer);

      const peaks = await extractPeaks('file:///big.mp3', 200);

      expect(peaks).toHaveLength(200);
      expect(mockArrayBufferSpy).not.toHaveBeenCalled();
      mockReadBytesLengths.forEach((len) => {
        expect(len).toBeLessThanOrEqual(READ_WINDOW_BYTES);
      });
      const dataReads = mockReadBytesLengths.filter((len) => len > 1024);
      expect(dataReads.length).toBeGreaterThan(1);
    });
  });
});
