/**
 * @jest-environment node
 */
import { extractPeaks } from '../waveformAnalyzer.web';

const WAV_AUDIO_FORMAT_PCM = 1;

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

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(headerSize + i * 2, Math.round(samples[i] * 32767), true);
  }

  return buffer;
}

const mockFetch = jest.fn<Promise<Response>, [string]>();

beforeEach(() => {
  jest.clearAllMocks();
  // The web analyzer reads bytes via the global fetch (works on blob: URLs).
  (globalThis as { fetch: unknown }).fetch = mockFetch;
});

function respondWith(buffer: ArrayBuffer): void {
  mockFetch.mockResolvedValue({
    arrayBuffer: () => Promise.resolve(buffer),
  } as Response);
}

describe('extractPeaks (web)', () => {
  it('fetches the object URL and extracts WAV peaks', async () => {
    const samples = Array.from({ length: 400 }, (_, i) =>
      Math.sin((i / 400) * Math.PI * 2),
    );
    respondWith(createWavBuffer(samples));

    const peaks = await extractPeaks('blob:obj/track-1', 10);

    expect(mockFetch).toHaveBeenCalledWith('blob:obj/track-1');
    expect(peaks).toHaveLength(10);
    expect(Math.max(...peaks)).toBeCloseTo(1, 1);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('derives peaks for compressed (non-WAV) bytes', async () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.abs(Math.sin(i / 100)) * 255);
    }
    respondWith(bytes.buffer);

    const peaks = await extractPeaks('blob:obj/track-2', 10);

    expect(peaks).toHaveLength(10);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('defaults to a bucket count of 200', async () => {
    const samples = Array.from({ length: 2000 }, (_, i) =>
      Math.sin((i / 2000) * Math.PI * 2),
    );
    respondWith(createWavBuffer(samples));

    const peaks = await extractPeaks('blob:obj/track-3');

    expect(peaks).toHaveLength(200);
  });

  it('propagates fetch failures to the caller', async () => {
    mockFetch.mockRejectedValue(new Error('blob revoked'));

    await expect(extractPeaks('blob:obj/missing')).rejects.toThrow(
      'blob revoked',
    );
  });
});
