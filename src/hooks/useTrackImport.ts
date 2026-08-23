import { useCallback, useState } from 'react';

import { ToastVariant } from '../components/Toast';
import { pickAndImportFile } from '../services/fileImport';
import { insertTrack } from '../services/trackStore';
import { Track } from '../types';
import { errorMessage } from '../utils/errorMessage';
import { useShareIntent } from './useShareIntent';

export interface UseTrackImportOptions {
  /** Folder the new track is filed into; `null` means Unfiled. */
  destinationFolderId: string | null;
  /**
   * What that destination is called on screen. Every success message names
   * it, because an import made from the library root lands somewhere the
   * reader is not currently looking — an unnamed destination there reads as
   * an import that silently failed.
   */
  destinationName: string;
  /**
   * Whether this caller should handle system shares. Passed straight to
   * `useShareIntent`; only the focused screen should say yes.
   */
  shareEnabled?: boolean;
  /** Called once a track has been written, so the screen can show it. */
  onImported: (track: Track) => void;
  showToast: (message: string, variant?: ToastVariant) => void;
}

export interface UseTrackImportResult {
  /** True while the file picker flow is running. */
  importing: boolean;
  /**
   * Opens the system file picker and imports the chosen file.
   *
   * Returns nothing to await on purpose. Every failure is already reported to
   * the reader as a toast before this settles, so there is no outcome for a
   * caller to inspect and nothing it could usefully do with one. Both screens
   * were wrapping the awaitable form in an identical `() => void` to say
   * exactly that; the wrapper lives here now, and the promise stays internal.
   */
  handleImport: () => void;
}

/**
 * Importing a track, from either source that can produce one: the file
 * picker behind the Import button, and a file handed to the app by the
 * system share sheet or an "open with" intent.
 *
 * Both land in the same place — the folder the reader is currently inside,
 * or Unfiled when they are somewhere that is not a real folder — and both
 * report where the track went. Keeping the two paths in one hook is what
 * stops those rules from drifting apart between the library root and the
 * track view, which each import into a different destination.
 */
export function useTrackImport({
  destinationFolderId,
  destinationName,
  shareEnabled = true,
  onImported,
  showToast,
}: UseTrackImportOptions): UseTrackImportResult {
  const [importing, setImporting] = useState(false);

  const fileTrack = useCallback(
    async (track: Track): Promise<Track | null> => {
      const filed = { ...track, folderId: destinationFolderId };
      try {
        await insertTrack(filed);
      } catch (error) {
        console.error('Failed to save track to library', error);
        showToast('Failed to save track to library', 'error');
        return null;
      }
      onImported(filed);
      return filed;
    },
    [destinationFolderId, onImported, showToast],
  );

  const importFile = useCallback(async () => {
    setImporting(true);
    try {
      const result = await pickAndImportFile();
      if (result.success) {
        const filed = await fileTrack(result.track);
        if (!filed) return;
        showToast(
          `Imported ${filed.filename} to ${destinationName}`,
          'success',
        );
      } else if (result.error !== 'cancelled') {
        showToast(`Import failed: ${result.message}`, 'error');
      }
    } catch (error) {
      showToast(`Import failed: ${errorMessage(error)}`, 'error');
    } finally {
      setImporting(false);
    }
  }, [fileTrack, destinationName, showToast]);

  const handleShareImport = useCallback(
    async (track: Track) => {
      const filed = await fileTrack(track);
      if (!filed) return;
      showToast(
        `Received ${filed.filename} into ${destinationName}`,
        'success',
      );
    },
    [fileTrack, destinationName, showToast],
  );

  const handleShareError = useCallback(
    (message: string) => {
      showToast(`Share import failed: ${message}`, 'error');
    },
    [showToast],
  );

  useShareIntent({
    enabled: shareEnabled,
    onTrackImported: handleShareImport,
    onError: handleShareError,
  });

  const handleImport = useCallback(() => {
    void importFile();
  }, [importFile]);

  return { importing, handleImport };
}
