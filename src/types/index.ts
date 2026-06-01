export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'm4a';

export interface Track {
  id: string;
  filename: string;
  uri: string;
  format: AudioFormat;
  durationMs: number;
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
}

export type WaveformPeaks = number[];

export type CountdownMode = 'silent' | 'metronome';

export type CountdownDuration =
  | { type: 'bars'; bars: 1 | 2 | 4 }
  | { type: 'seconds'; seconds: number };

export interface CountdownConfig {
  enabled: boolean;
  mode: CountdownMode;
  duration: CountdownDuration;
  bpm: number;
}

export type CountdownPhase = 'idle' | 'counting' | 'finished';

export interface CountdownState {
  phase: CountdownPhase;
  beatsRemaining: number;
  totalBeats: number;
  currentBeat: number;
}
