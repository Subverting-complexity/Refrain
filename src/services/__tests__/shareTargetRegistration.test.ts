import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXTENSION_TO_FORMAT } from '../fileImport.shared';

/**
 * `app.json` is the only place that tells iOS and Android which files
 * Refrain can accept from a share sheet or an "Open with" menu. It is data,
 * not code, so nothing else in the build checks it: a format added to
 * `EXTENSION_TO_FORMAT` without a matching registration compiles, passes
 * every other test, and then silently fails to appear in the share sheet on
 * a real device. Registration also lives in three separate Android lists
 * (VIEW, SEND, SEND_MULTIPLE) that had already drifted apart once, with
 * `audio/x-wav` present in one and missing from another.
 *
 * These tests pin the registration to the supported-format table so the two
 * cannot diverge again without a failing build.
 */

/**
 * The MIME types each supported extension must be registered under on
 * Android. Each list holds the standard type first, then the non-standard
 * variants that file managers and messaging apps are known to emit for the
 * same format.
 */
const ANDROID_MIME_TYPES_BY_EXTENSION: Record<string, string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/vnd.wave'],
  aac: ['audio/aac', 'audio/x-aac'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
};

/** The iOS uniform type identifier each supported extension conforms to. */
const IOS_CONTENT_TYPES_BY_EXTENSION: Record<string, string[]> = {
  mp3: ['public.mp3'],
  wav: ['com.microsoft.waveform-audio'],
  aac: ['public.aac-audio'],
  m4a: ['public.mpeg-4-audio'],
};

interface IntentFilterDatum {
  mimeType?: string;
}

interface AndroidIntentFilter {
  action: string;
  data?: IntentFilterDatum[];
}

interface ShareIntentOptions {
  iosActivationRules?: string;
  androidIntentFilters?: string[];
  androidMultiIntentFilters?: string[];
}

interface AppConfig {
  expo: {
    ios: {
      infoPlist: {
        CFBundleDocumentTypes: { LSItemContentTypes?: string[] }[];
      };
    };
    android: {
      intentFilters: AndroidIntentFilter[];
    };
    plugins: (string | [string, Record<string, unknown>])[];
  };
}

// Read the file rather than importing it, so the test asserts against the
// artifact the Expo prebuild actually consumes.
const appConfig: AppConfig = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'app.json'), 'utf8'),
);

function shareIntentOptions(): ShareIntentOptions {
  const entry = appConfig.expo.plugins.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-share-intent',
  );
  if (!entry) {
    throw new Error('expo-share-intent plugin is not configured in app.json');
  }
  return entry[1] as ShareIntentOptions;
}

function androidViewMimeTypes(): string[] {
  const viewFilters = appConfig.expo.android.intentFilters.filter(
    (filter) => filter.action === 'VIEW',
  );
  return viewFilters.flatMap((filter) =>
    (filter.data ?? [])
      .map((datum) => datum.mimeType)
      .filter((mimeType): mimeType is string => Boolean(mimeType)),
  );
}

function iosContentTypes(): string[] {
  return appConfig.expo.ios.infoPlist.CFBundleDocumentTypes.flatMap(
    (documentType) => documentType.LSItemContentTypes ?? [],
  );
}

function sorted(mimeTypes: string[] | undefined): string[] {
  return [...(mimeTypes ?? [])].sort();
}

describe('supported formats are registered with both platforms', () => {
  it('has a registration entry for every importable extension', () => {
    // The guard that matters most: adding a format to EXTENSION_TO_FORMAT
    // without registering it here (and, through the tests below, in app.json)
    // fails rather than shipping a format the share sheet never offers.
    const supported = Object.keys(EXTENSION_TO_FORMAT).sort();
    expect(Object.keys(ANDROID_MIME_TYPES_BY_EXTENSION).sort()).toEqual(
      supported,
    );
    expect(Object.keys(IOS_CONTENT_TYPES_BY_EXTENSION).sort()).toEqual(
      supported,
    );
  });

  it.each(Object.keys(EXTENSION_TO_FORMAT))(
    'registers .%s on Android for VIEW, SEND and SEND_MULTIPLE',
    (extension) => {
      const expected = ANDROID_MIME_TYPES_BY_EXTENSION[extension];
      const options = shareIntentOptions();

      expect(androidViewMimeTypes()).toEqual(expect.arrayContaining(expected));
      expect(options.androidIntentFilters).toEqual(
        expect.arrayContaining(expected),
      );
      expect(options.androidMultiIntentFilters).toEqual(
        expect.arrayContaining(expected),
      );
    },
  );

  it.each(Object.keys(EXTENSION_TO_FORMAT))(
    'registers .%s on iOS as an openable document type',
    (extension) => {
      expect(iosContentTypes()).toEqual(
        expect.arrayContaining(IOS_CONTENT_TYPES_BY_EXTENSION[extension]),
      );
    },
  );
});

describe('Android intent registration', () => {
  it('registers the same MIME types for VIEW, SEND and SEND_MULTIPLE', () => {
    // The three lists are configured independently — VIEW under
    // android.intentFilters, the other two as expo-share-intent options — so
    // they can drift apart silently. "Open with" and "Share" should offer
    // Refrain for exactly the same set of files.
    const options = shareIntentOptions();

    expect(sorted(androidViewMimeTypes())).toEqual(
      sorted(options.androidIntentFilters),
    );
    expect(sorted(options.androidMultiIntentFilters)).toEqual(
      sorted(options.androidIntentFilters),
    );
  });

  it('registers ACTION_SEND_MULTIPLE so multi-file shares reach the app', () => {
    // expo-share-intent only emits a SEND_MULTIPLE intent filter when this
    // option is present. Without it, selecting two files in Google Files and
    // sharing does not offer Refrain, even though useShareIntent already
    // imports a list of files.
    const multiFilters = shareIntentOptions().androidMultiIntentFilters;
    expect(multiFilters?.length ?? 0).toBeGreaterThan(0);
  });

  it('does not register a wildcard audio type', () => {
    // A wildcard would put Refrain in the share sheet for formats it cannot
    // import (flac, ogg, opus), turning a clean absence from the sheet into
    // an "Unsupported audio format" error after the user has already picked
    // Refrain.
    const options = shareIntentOptions();
    const allMimeTypes = [
      ...androidViewMimeTypes(),
      ...(options.androidIntentFilters ?? []),
      ...(options.androidMultiIntentFilters ?? []),
    ];

    expect(allMimeTypes).not.toContain('audio/*');
    expect(allMimeTypes).not.toContain('*/*');
  });
});

describe('iOS share extension activation', () => {
  it('accepts shares carrying more than one audio attachment', () => {
    // The activation rule originally required `.@count == 1` on both the
    // attachment subquery and the extension-item count, so sharing two files
    // from Files did not offer Refrain at all.
    const rules = shareIntentOptions().iosActivationRules;

    expect(typeof rules).toBe('string');
    expect(rules).not.toContain('@count == 1');
    expect(rules).toContain('@count >= 1');
  });

  it('activates only for audio attachments', () => {
    expect(shareIntentOptions().iosActivationRules).toContain(
      'UTI-CONFORMS-TO "public.audio"',
    );
  });
});
