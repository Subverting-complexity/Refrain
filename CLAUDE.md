# Refrain

Audio looper app built with Expo (SDK 56) + TypeScript + expo-router.

## Commands

- `npm run web` — start Expo dev server for web
- `npm run ios` — start on iOS
- `npm run android` — start on Android
- `npm run lint` — run ESLint
- `npm run format` — run Prettier

## Project Structure

- `app/` — Expo Router file-based routes
- `src/components/` — reusable UI components
- `src/hooks/` — custom React hooks
- `src/services/` — business logic (no React dependency)
- `src/theme/` — theme tokens and ThemeProvider
- `src/types/` — shared TypeScript types
- `src/utils/` — utility functions
- `assets/` — fonts, images, audio assets

## Conventions

- **Theme**: always use `useTheme()` hook — never hardcode colors
- **Accessibility**: use `AccessiblePressable` for all pressable elements (enforces 44x44pt min touch target)
- **Components**: one component per file, co-located types, accept `style` prop overrides
- **Services**: pure modules with no React dependency
- **TypeScript**: strict mode enabled
