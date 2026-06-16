import expoConfig from 'eslint-config-expo/flat.js';

export default [
  // Never lint local git worktrees under .claude/ — they are stale repo
  // copies. A clean CI checkout has no such directory.
  { ignores: ['.claude/**'] },
  ...expoConfig,
];
