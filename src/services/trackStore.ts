import { File, Paths } from 'expo-file-system';

import { Track } from '../types';

function getStoreFile(): File {
  return new File(Paths.document, 'tracks.json');
}

function getTmpFile(): File {
  return new File(Paths.document, 'tracks.json.tmp');
}

export async function loadTracks(): Promise<Track[]> {
  const file = getStoreFile();
  if (!file.exists) return [];

  try {
    return JSON.parse(await file.text());
  } catch {
    return [];
  }
}

export async function saveTracks(tracks: Track[]): Promise<void> {
  const tmp = getTmpFile();
  tmp.write(JSON.stringify(tracks));
  await tmp.move(getStoreFile());
}
