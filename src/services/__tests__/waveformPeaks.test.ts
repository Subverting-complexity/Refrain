import { computePeaks, createBufferReader } from '../waveformPeaks';

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

function readerFor(buffer: ArrayBuffer) {
  return createBufferReader(new Uint8Array(buffer));
}

describe('createBufferReader', () => {
  it('reports the byte length as size', () => {
    const reader = createBufferReader(new Uint8Array([1, 2, 3, 4]));
    expect(reader.size).toBe(4);
  });

  it('reads a sub-range as a view of the original bytes', () => {
    const reader = createBufferReader(new Uint8Array([10, 20, 30, 40, 50]));
    expect(Array.from(reader.readAt(1, 3))).toEqual([20, 30, 40]);
  });

  it('clamps reads that run past the end to the available bytes', () => {
    const reader = createBufferReader(new Uint8Array([1, 2, 3]));
    expect(Array.from(reader.readAt(2, 10))).toEqual([3]);
  });

  it('returns an empty view for an out-of-range offset', () => {
    const reader = createBufferReader(new Uint8Array([1, 2, 3]));
    expect(reader.readAt(99, 4).length).toBe(0);
  });

  it('treats a negative offset as the start of the buffer', () => {
    const reader = createBufferReader(new Uint8Array([7, 8, 9]));
    expect(Array.from(reader.readAt(-5, 2))).toEqual([7, 8]);
  });

  it('returns an empty view for a non-positive length', () => {
    const reader = createBufferReader(new Uint8Array([1, 2, 3]));
    expect(reader.readAt(0, 0).length).toBe(0);
    expect(reader.readAt(0, -3).length).toBe(0);
  });
});

describe('computePeaks', () => {
  it('extracts normalized peaks from a 16-bit WAV buffer', () => {
    const samples = Array.from({ length: 400 }, (_, i) =>
      Math.sin((i / 400) * Math.PI * 2),
    );
    const peaks = computePeaks(readerFor(createWavBuffer(samples)), 10);

    expect(peaks).toHaveLength(10);
    expect(Math.max(...peaks)).toBeCloseTo(1, 1);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('decodes 32-bit IEEE float WAV as float, not Int32', () => {
    const samples = Array.from({ length: 400 }, (_, i) => {
      const amp = i < 200 ? 1 : 0.25;
      return amp * Math.sin((i / 20) * Math.PI * 2);
    });
    const peaks = computePeaks(
      readerFor(createWavBuffer(samples, 32, WAV_AUDIO_FORMAT_IEEE_FLOAT)),
      4,
    );

    const firstHalf = (peaks[0] + peaks[1]) / 2;
    const secondHalf = (peaks[2] + peaks[3]) / 2;
    expect(firstHalf).toBeGreaterThan(secondHalf * 2);
  });

  it('returns minimum amplitude for silent audio', () => {
    const peaks = computePeaks(
      readerFor(createWavBuffer(new Array(200).fill(0))),
      5,
    );
    peaks.forEach((p) => expect(p).toBeCloseTo(0.1, 5));
  });

  it('falls back to compressed derivation for non-WAV bytes', () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.abs(Math.sin(i / 100)) * 255);
    }
    const peaks = computePeaks(createBufferReader(bytes), 10);

    expect(peaks).toHaveLength(10);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('falls back to compressed parsing for a truncated WAV', () => {
    const peaks = computePeaks(readerFor(new ArrayBuffer(20)), 5);
    expect(peaks).toHaveLength(5);
  });

  it('defaults to a bucket count of 200', () => {
    const samples = Array.from({ length: 2000 }, (_, i) =>
      Math.sin((i / 2000) * Math.PI * 2),
    );
    const peaks = computePeaks(readerFor(createWavBuffer(samples)));
    expect(peaks).toHaveLength(200);
  });

  it('produces identical peaks for the same bytes (web/native parity)', () => {
    const samples = Array.from({ length: 400 }, (_, i) =>
      Math.sin((i / 400) * Math.PI * 2),
    );
    const buffer = createWavBuffer(samples);
    const a = computePeaks(readerFor(buffer), 10);
    const b = computePeaks(readerFor(buffer), 10);
    expect(a).toEqual(b);
  });
});
