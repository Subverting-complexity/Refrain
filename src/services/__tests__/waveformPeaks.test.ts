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

/** A reader that also records how many bytes it has handed out. */
function countingReader(bytes: Uint8Array) {
  const inner = createBufferReader(bytes);
  let bytesRead = 0;
  return {
    reader: {
      size: inner.size,
      readAt(offset: number, length: number) {
        const chunk = inner.readAt(offset, length);
        bytesRead += chunk.length;
        return chunk;
      },
    },
    read: () => bytesRead,
  };
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

  it('returns an empty array for a zero bucket count (empty peaks)', () => {
    const samples = Array.from({ length: 400 }, (_, i) =>
      Math.sin((i / 400) * Math.PI * 2),
    );
    const peaks = computePeaks(readerFor(createWavBuffer(samples)), 0);
    expect(peaks).toEqual([]);
  });

  it('does not overflow the argument limit for a large bucket count', () => {
    const samples = Array.from({ length: 2000 }, (_, i) =>
      Math.sin((i / 2000) * Math.PI * 2),
    );
    const largeBucketCount = 200_000;

    let peaks: number[] = [];
    expect(() => {
      peaks = computePeaks(
        readerFor(createWavBuffer(samples)),
        largeBucketCount,
      );
    }).not.toThrow();

    expect(peaks).toHaveLength(largeBucketCount);
    peaks.forEach((p) => {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(1);
    });
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

/**
 * Past a certain length, reading every byte of a file to draw two hundred bars
 * is not worth what it costs. The scan is synchronous and runs on the JS
 * thread, so on a phone-sized engine a full-length track froze everything for
 * seconds — including the callbacks that report the audio has finished
 * loading, which made a slow *waveform* look like slow *audio*.
 *
 * Beyond that length each bucket is measured from a few short windows spread
 * across it instead. These are the tests for the two properties that matters:
 * the work stops growing with the file, and a bar still reports its own span.
 */
describe('computePeaks on a track too long to read whole', () => {
  // A bucket over 2048 frames is past the point where reading it whole is
  // worth the wait; these are four times that.
  const FRAMES_PER_BUCKET = 8000;
  const BUCKETS = 4;
  const AMPLITUDES = [0.25, 0.5, 1, 0.125];

  function longWav(): ArrayBuffer {
    const samples: number[] = [];
    for (const amplitude of AMPLITUDES) {
      for (let i = 0; i < FRAMES_PER_BUCKET; i++) samples.push(amplitude);
    }
    return createWavBuffer(samples);
  }

  it('reports each WAV bucket at its own amplitude', () => {
    const peaks = computePeaks(readerFor(longWav()), BUCKETS);

    // A bucket of constant amplitude samples to exactly the figure a full
    // scan would produce, so the sampling is visible only in what it costs.
    expect(peaks).toHaveLength(BUCKETS);
    peaks.forEach((peak, index) => {
      expect(peak).toBeCloseTo(AMPLITUDES[index], 4);
    });
  });

  it('examines a small fraction of a long WAV', () => {
    const bytes = new Uint8Array(longWav());
    const { reader, read } = countingReader(bytes);

    computePeaks(reader, BUCKETS);

    // Four windows of 512 frames per bucket at two bytes a frame, plus the
    // header walk — against 64KB of audio data.
    expect(read()).toBeLessThan(bytes.length / 3);
  });

  it('still reads a short WAV in full', () => {
    // Small enough that the exact scan is cheap, so it is kept: the sampling
    // is a concession to length, not a change of algorithm.
    const bytes = new Uint8Array(createWavBuffer([0.5, -0.5, 0.25, -0.25]));
    const { reader, read } = countingReader(bytes);

    computePeaks(reader, 2);

    expect(read()).toBeGreaterThanOrEqual(8);
  });

  // Almost every real track takes this path, because almost every real track
  // is a compressed file of more than a couple of megabytes.
  const BYTES_PER_BUCKET = 10000;
  const LEVELS = [64, 128, 255, 32];

  function longCompressed(): Uint8Array {
    const bytes = new Uint8Array(BYTES_PER_BUCKET * LEVELS.length);
    LEVELS.forEach((level, index) => {
      bytes.fill(
        level,
        index * BYTES_PER_BUCKET,
        (index + 1) * BYTES_PER_BUCKET,
      );
    });
    return bytes;
  }

  it('reports each compressed bucket at its own byte magnitude', () => {
    const peaks = computePeaks(createBufferReader(longCompressed()), BUCKETS);

    expect(peaks).toHaveLength(BUCKETS);
    peaks.forEach((peak, index) => {
      expect(peak).toBeCloseTo(LEVELS[index] / 255, 4);
    });
  });

  it('examines a small fraction of a long compressed file', () => {
    const bytes = longCompressed();
    const { reader, read } = countingReader(bytes);

    computePeaks(reader, BUCKETS);

    // Four 2KB windows per bucket against 10KB of bucket, plus the dozen
    // bytes the WAV check reads before giving up on the format.
    expect(read()).toBeLessThan(bytes.length);
    expect(read()).toBeLessThanOrEqual(4 * 2048 * BUCKETS + 64);
  });

  /**
   * The bound is on the work per bucket, not on the file: doubling the track
   * must not double the reading. This is the property that turns a load time
   * which grew with the track into one that does not.
   */
  it('does not read more from a file twice the length', () => {
    const single = longCompressed();
    const doubled = new Uint8Array(single.length * 2);
    doubled.set(single, 0);
    doubled.set(single, single.length);

    const a = countingReader(single);
    const b = countingReader(doubled);
    computePeaks(a.reader, BUCKETS);
    computePeaks(b.reader, BUCKETS);

    expect(b.read()).toBe(a.read());
  });
});
