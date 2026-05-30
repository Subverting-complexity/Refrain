# Refrain

Audio looper app built with Expo (SDK 56) + TypeScript + expo-router.

## Commands

- `npm run web` — start Expo dev server for web
- `npm run ios` — start on iOS
- `npm run android` — start on Android
- `npm run lint` — run ESLint
- `npm run format` — run Prettier (write)
- `npm run format:check` — check Prettier formatting (CI)
- `npm test` — run Jest tests
- `npm run test:coverage` — run tests with coverage report
- `npm run typecheck` — run TypeScript type checking

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
- **Spacing**: use `spacing` tokens from `src/theme` — never hardcode px values for padding/margin
- **Icons**: use `@expo/vector-icons` (Ionicons) — never emoji text as icons
- **TypeScript**: strict mode enabled
- **Testing**: co-locate tests in `__tests__/` dirs next to source; mock native modules (expo-file-system, expo-crypto)

## Quality Gate (CI)

All checks must pass on PRs to `main`:

1. **Type check** — `npm run typecheck`
2. **Lint** — `npm run lint`
3. **Format** — `npm run format:check`
4. **Tests + coverage** — `npm test -- --coverage` (80% threshold on branches/functions/lines/statements)
