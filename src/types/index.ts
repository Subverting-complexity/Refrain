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
}

export type WaveformPeaks = number[];
