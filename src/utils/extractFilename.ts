const DEFAULT_FILENAME = 'shared-audio.mp3';

export function extractFilename(url: string): string {
  const withoutFragment = url.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  const filename = withoutQuery.split('/').pop();
  return filename || DEFAULT_FILENAME;
}
