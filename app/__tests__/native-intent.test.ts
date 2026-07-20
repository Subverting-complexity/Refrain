import { redirectSystemPath } from '../+native-intent';

const mockGetShareExtensionKey = jest.fn(() => 'refrainShareKey');

jest.mock('expo-share-intent', () => ({
  getShareExtensionKey: () => mockGetShareExtensionKey(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetShareExtensionKey.mockReturnValue('refrainShareKey');
});

describe('redirectSystemPath', () => {
  it('redirects the share-extension dataUrl link to the library screen', () => {
    expect(
      redirectSystemPath({
        path: 'refrain://dataUrl=refrainShareKey#media',
        initial: true,
      }),
    ).toBe('/');
  });

  it('passes ordinary deep links through unchanged', () => {
    expect(
      redirectSystemPath({
        path: 'refrain://player?trackId=abc',
        initial: false,
      }),
    ).toBe('refrain://player?trackId=abc');
  });

  it('falls back to the library screen if key resolution throws', () => {
    mockGetShareExtensionKey.mockImplementation(() => {
      throw new Error('no scheme');
    });

    expect(
      redirectSystemPath({ path: 'refrain://anything', initial: false }),
    ).toBe('/');
  });
});
