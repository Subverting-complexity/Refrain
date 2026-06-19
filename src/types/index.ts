export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'm4a';

export interface Track {
  id: string;
  filename: string;
  uri: string;
  format: AudioFormat;
  durationMs: number;
  durationEstimated: boolean;
  fileSizeBytes: number;
  importedAt: number;
}

export interface ImportResult {
  success: true;
  track: Track;
}

export interface ImportError {
  success: false;
  error: ImportErrorCode;
  message: string;
}

export type ImportOutcome = ImportResult | ImportError;

export type ImportErrorCode =
  | 'cancelled'
  | 'unsupported_format'
  | 'file_not_found'
  | 'copy_failed'
  | 'metadata_failed';

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  positionMs: number;
  durationMs: number;
  markerA: number | null;
  markerB: number | null;
  /**
   * Whether A/B looping is active. When true and both markers are set,
   * playback rewinds to A on reaching B. Toggling this off keeps the
   * markers but lets playback run straight through them.
   */
  loopEnabled: boolean;
  /** App-level playback volume in the range 0..1. */
  volume: number;
  /** Human-readable reason the track failed to load/play. Set only when status is 'error'. */
  lastError?: string;
}

/**
 * The active A/B loop marker set persisted per track. Mirrors the marker
 * fields of {@link PlaybackState}; `null` markers mean "unset". Named segment
 * profiles are layered on top of this same store later.
 */
export interface ActiveMarkers {
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
}

/**
 * A named, saved A/B segment for a single track. Wraps an {@link ActiveMarkers}
 * set with an identity (`id`), the owning track (`trackId`), a user-facing
 * `name`, and a `createdAt` timestamp used for stable ordering. Persisted
 * alongside the active markers in the per-track store.
 */
export interface SegmentProfile {
  id: string;
  trackId: string;
  name: string;
  markerA: number | null;
  markerB: number | null;
  loopEnabled: boolean;
  createdAt: number;
}

/**
 * The caller-supplied fields when saving a new {@link SegmentProfile}. The
 * store generates `id` and `createdAt` and derives `trackId` from its argument.
 */
export type SegmentProfileInput = Pick<
  SegmentProfile,
  'name' | 'markerA' | 'markerB' | 'loopEnabled'
>;

export type WaveformPeaks = number[];

export type CountdownMode = 'silent' | 'metronome';

export type CountdownDuration =
  | { type: 'bars'; bars: 1 | 2 | 4 }
  | { type: 'seconds'; seconds: number };

/**
 * When the count-in fires. `once` plays it before the first play only
 * (the original behaviour); `everyLoop` also replays it each time the A/B
 * loop rewinds to A, so every pass through the loop gets a lead-in.
 */
export type CountdownRepeat = 'once' | 'everyLoop';

export interface CountdownConfig {
  enabled: boolean;
  mode: CountdownMode;
  duration: CountdownDuration;
  repeat: CountdownRepeat;
}

export type CountdownPhase = 'idle' | 'counting' | 'finished';

export interface CountdownState {
  phase: CountdownPhase;
  beatsRemaining: number;
  totalBeats: number;
  currentBeat: number;
  /**
   * Number to display in the overlay. The count-in ticks once per second, so
   * this equals `beatsRemaining` — the seconds left before playback.
   */
  displayValue: number;
}
