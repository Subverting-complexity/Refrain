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
];
