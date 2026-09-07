import appConfig from '../../../app.json';
import { AUDIO_MIME_TYPES, MIME_TO_FORMAT } from '../fileImport.shared';

/**
 * `MIME_TO_FORMAT` is the single source of truth for the audio types the app
 * handles, and Android declares the same set three more times in `app.json`.
 * Those lists had already drifted once — the picker accepted six types while
 * the intent filters accepted ten, so the app could be sent a file it would
 * not let you pick — which is what these tests exist to catch.
 */

function shareIntentOptions() {
  const entry = appConfig.expo.plugins.find(
    (plugin): plugin is [string, Record<string, string[]>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-share-intent',
  );
  if (!entry) throw new Error('expo-share-intent plugin is not configured');
  return entry[1];
}

describe('Android MIME type declarations', () => {
  it('declares every accepted type on the VIEW intent filter', () => {
    const declared = appConfig.expo.android.intentFilters
      .flatMap((filter) => filter.data ?? [])
      .map((data) => data.mimeType);

    expect(new Set(declared)).toEqual(new Set(AUDIO_MIME_TYPES));
  });

  it('declares every accepted type on the share intent filter', () => {
    expect(new Set(shareIntentOptions().androidIntentFilters)).toEqual(
      new Set(AUDIO_MIME_TYPES),
    );
  });

  it('declares every accepted type on the multi-share intent filter', () => {
    expect(new Set(shareIntentOptions().androidMultiIntentFilters)).toEqual(
      new Set(AUDIO_MIME_TYPES),
    );
  });

  it('covers every format the app can play', () => {
    expect(new Set(Object.values(MIME_TO_FORMAT))).toEqual(
      new Set(['mp3', 'wav', 'aac', 'm4a']),
    );
  });

  it('lists no type twice', () => {
    expect(new Set(AUDIO_MIME_TYPES).size).toBe(AUDIO_MIME_TYPES.length);
  });
});
