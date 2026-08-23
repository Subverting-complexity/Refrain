# Refrain

An audio looper app for musicians. Import audio files, visualise waveforms, set markers and segments, and loop through sections to practise or perform.

Built with Expo and React Native for iOS, Android and web.

## Features

- **Audio import** - import audio files from your device or via the share sheet (MP3, WAV, AAC, M4A)
- **Waveform visualisation** - see the waveform of your audio with interactive scrubbing
- **Markers and segments** - place markers, define named segments, and save segment profiles
- **Countdown and count-in** - configurable countdown before playback starts
- **Folders** - organise tracks into folders
- **Looping** - loop any segment or the full track
- **Skip intervals** - jump forward or backward by a configurable interval
- **Appearance settings** - light and dark theme support

## Getting started

### Prerequisites

- Node.js >= 22.13 (see `.nvmrc`)
- npm
- For iOS: Xcode and CocoaPods
- For Android: Android Studio and an Android SDK

### Install

```bash
npm install
```

### Run

```bash
# Start the Expo dev server
npm start

# Platform-specific
npm run ios
npm run android
npm run web
```

## Project structure

```
app/           Expo Router screens and layouts
src/
  components/  Reusable UI components
  hooks/       Custom React hooks
  services/    Business logic and persistence (SQLite on native, IndexedDB on web)
  theme/       Theme provider and tokens
  types/       TypeScript type definitions
  utils/       Pure utility functions
assets/        App icons, splash screen, fonts
```

## Tech stack

- **Framework**: Expo SDK 56, React Native 0.85
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based)
- **Audio**: expo-audio
- **Persistence**: expo-sqlite (native), IndexedDB (web)
- **Animations**: React Native Reanimated
- **Testing**: Jest with jest-expo

## Scripts

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `npm start`             | Start the Expo dev server      |
| `npm test`              | Run the test suite             |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint`          | Lint with ESLint               |
| `npm run format`        | Format with Prettier           |
| `npm run format:check`  | Check formatting               |
| `npm run typecheck`     | Type-check with TypeScript     |

## Licence

[MIT](LICENSE)
