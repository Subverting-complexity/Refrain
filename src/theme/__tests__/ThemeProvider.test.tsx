import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useTheme } from '../../hooks/useTheme';
import { ThemeContextValue, ThemeProvider } from '../ThemeProvider';

let mockScheme: 'light' | 'dark' | null = 'dark';
// Mock just the useColorScheme hook submodule. Spreading the whole
// react-native module eagerly evaluates its lazy native-backed getters
// (FlatList, fetch, DevMenu) and blows up under jest-expo.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme,
}));

const mockGetColorMode = jest.fn();
const mockSetColorMode = jest.fn();
jest.mock('../../services/themeStore', () => ({
  getColorMode: () => mockGetColorMode(),
  setColorMode: (mode: string) => mockSetColorMode(mode),
}));

let resolveHydration: () => void;
const mockHydrate = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      resolveHydration = resolve;
    }),
);
jest.mock('../../services/settingsStore', () => ({
  hydrateSettings: () => mockHydrate(),
}));

let ctx: ThemeContextValue;
function Consumer() {
  ctx = useTheme();
  return null;
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(ThemeProvider, null, createElement(Consumer)));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = 'dark';
  mockGetColorMode.mockReturnValue('system');
});

describe('ThemeProvider', () => {
  it('seeds colorMode from the persisted store', () => {
    mockGetColorMode.mockReturnValue('light');
    render();

    expect(ctx.colorMode).toBe('light');
    expect(ctx.theme.dark).toBe(false);
  });

  it('resolves "system" against the live system scheme', () => {
    mockGetColorMode.mockReturnValue('system');

    mockScheme = 'dark';
    render();
    expect(ctx.theme.dark).toBe(true);

    mockScheme = 'light';
    render();
    expect(ctx.theme.dark).toBe(false);
  });

  it('persists and reflects a new mode when setColorMode is called', () => {
    mockGetColorMode.mockReturnValue('system');
    render();

    act(() => {
      ctx.setColorMode('dark');
    });

    expect(mockSetColorMode).toHaveBeenCalledWith('dark');
    expect(ctx.colorMode).toBe('dark');
    expect(ctx.theme.dark).toBe(true);
  });

  it('reapplies the persisted mode once web hydration resolves (#163)', async () => {
    // Cold web load: the synchronous seed misses the still-empty cache and
    // reads the default, then hydration fills it in.
    mockGetColorMode.mockReturnValueOnce('system').mockReturnValue('light');
    render();
    expect(ctx.colorMode).toBe('system');

    await act(async () => {
      resolveHydration();
      await Promise.resolve();
    });

    expect(ctx.colorMode).toBe('light');
    expect(ctx.theme.dark).toBe(false);
  });
});
