import { extractPeaks } from '../waveformAnalyzer';

const mockArrayBuffer = jest.fn<Promise<ArrayBuffer>, []>();

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: mockArrayBuffer,
  })),
}));

function createWavBuffer(samples: number[], bitsPerSample = 16): ArrayBuffer {
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
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    if (bytesPerSample === 2) {
      view.setInt16(headerSize + i * 2, Math.round(samples[i] * 32767), true);
    } else if (bytesPerSample === 1) {
      view.setUint8(headerSize + i, Math.round(samples[i] * 127 + 128));
    } else if (bytesPerSample === 4) {
      view.setInt32(
        headerSize + i * 4,
        Math.round(samples[i] * 2147483647),
        true,
      );
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
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples));

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
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples, 8));

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
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
    });

    it('returns minimum amplitude for silent audio', async () => {
      const samples = new Array(200).fill(0);
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples));

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
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples, 32));

      const peaks = await extractPeaks('file:///test.wav', 10);

      expect(peaks).toHaveLength(10);
      expect(Math.max(...peaks)).toBeCloseTo(1, 1);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('uses default bucket count of 200', async () => {
      const samples = Array.from({ length: 2000 }, (_, i) =>
        Math.sin((i / 2000) * Math.PI * 2),
      );
      mockArrayBuffer.mockResolvedValue(createWavBuffer(samples));

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
      mockArrayBuffer.mockResolvedValue(bytes.buffer);

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

      mockArrayBuffer.mockResolvedValue(bytes.buffer.slice(0));
      const peaks1 = await extractPeaks('file:///test.mp3', 10);

      mockArrayBuffer.mockResolvedValue(bytes.buffer.slice(0));
      const peaks2 = await extractPeaks('file:///test.mp3', 10);

      expect(peaks1).toEqual(peaks2);
    });

    it('falls back to compressed parsing for truncated WAV', async () => {
      const buffer = new ArrayBuffer(20);
      mockArrayBuffer.mockResolvedValue(buffer);

      const peaks = await extractPeaks('file:///test.wav', 5);

      expect(peaks).toHaveLength(5);
      peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });
  });
});
