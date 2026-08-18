/* eslint-disable @typescript-eslint/no-require-imports */

// Mutable Platform mock so each test can pick the running platform.
const mockPlatform = { OS: 'web' as string };
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));

type NavLike = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

const originalNavigator = global.navigator;

function setNavigator(nav: NavLike | undefined): void {
  Object.defineProperty(global, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  jest.resetModules();
  mockPlatform.OS = 'web';
});

afterEach(() => {
  setNavigator(originalNavigator as NavLike);
});

describe('isIOSWeb', () => {
  it('returns false on native platforms', () => {
    mockPlatform.OS = 'ios';
    setNavigator({ userAgent: 'iPhone' });
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(false);
  });

  it('returns true for an iPhone user agent on web', () => {
    setNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(true);
  });

  it('returns true for iPadOS reporting a desktop UA with touch points', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(true);
  });

  it('returns false for desktop Safari on macOS (no touch)', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(false);
  });

  it('returns false for desktop Chrome on Windows', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(false);
  });

  it('returns false when navigator is undefined', () => {
    setNavigator(undefined);
    const { isIOSWeb } = require('../platform');

    expect(isIOSWeb()).toBe(false);
  });
});
