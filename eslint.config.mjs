import expoConfig from 'eslint-config-expo/flat.js';

export default [
  // Never lint local git worktrees under .claude/ — they are stale repo
  // copies. A clean CI checkout has no such directory.
  { ignores: ['.claude/**'] },
  ...expoConfig,
  {
    // Hook tests capture a hook's return value by assigning it to a module-level
    // variable from inside a `TestComponent` (the standard renderHook harness).
    // `react-hooks/globals` targets render-correctness in app code and flags
    // that capture as reassigning an outside variable — a false positive for
    // test harnesses, so it's disabled for test files only.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'react-hooks/globals': 'off',
    },
  },
  {
    // Reanimated shared values are mutable on purpose: `value.value = x` is how
    // a worklet moves something on the UI thread, and the holder object is
    // stable across renders precisely so it can be written from outside one.
    // `react-hooks/immutability` comes from the React Compiler, which models
    // anything reaching a hook — including a dependency array — as frozen, so
    // it reports every one of those writes. Listed file by file rather than
    // switched off repo-wide, so the exemption stays with the code that owns
    // shared values and any new file has to opt in deliberately.
    files: [
      'src/components/DraggablePinnedFolderList.tsx',
      'src/hooks/useSliderGesture.ts',
      'src/hooks/useUiDragThrottle.ts',
      'src/hooks/useWaveformGesture.ts',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  {
    // The Jest setup file runs in the test environment but sits outside the
    // test-file globs above, so it needs the `jest` global declared here.
    files: ['jest.setup.js'],
    languageOptions: {
      globals: { jest: 'readonly' },
    },
  },
];
