/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '\\.(wav|mp3|aac|m4a)$': '<rootDir>/src/__mocks__/audioFileMock.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
  ],
  coverageThreshold: {
    // Project-wide regression floor. Set just below the current measured
    // numbers so coverage can't silently slip across src/ and app/. Raise
    // these toward 80% as the untested screens/modules gain tests.
    global: {
      statements: 54,
      branches: 57,
      functions: 44,
      lines: 55,
    },
    // Core business logic is held to a stricter bar.
    'src/services/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
