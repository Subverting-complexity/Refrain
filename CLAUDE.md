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
4. **Tests + coverage** — `npm test -- --coverage`. Thresholds are
   enforced by `jest.config.js` over `src/**` and `app/**`:
   - `src/services/` (core business logic): **80%** on
     branches/functions/lines/statements.
   - Project-wide regression floor: **54%** statements, **57%**
     branches, **44%** functions, **55%** lines. This floor catches
     coverage regressions; raise it toward 80% as the untested
     screens and modules gain tests.

## Supplementary Files

These files provide context for specific workflows. You don't need to
read all of them every session — consult them when the topic is
relevant to what you're working on.

| File                         | When to consult                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClaudeProject.md`           | Project identity, labels, quality gate, branch convention, board config. Read at the start of any workflow command.                                               |
| `docs/review.config.md`      | Review label definitions, non-compliance gates, tech-stack review rules. Read when performing or preparing for code review.                                       |
| `.claude/ecosystem.md`       | Installed Claude Code companion tool cheat-sheet — graphify queries, cost tracking, security scanning, and codebase intelligence.                                 |
| `docs/GRAPH_REPORT.md`       | Graphify codebase knowledge-graph report — community structure and key modules. Generated; refresh with `graphify . --update`.                                    |
| `fastlane/PUBLISHING.md`     | What store publishing automates vs. what is console-only. Read before touching store metadata or running fastlane.                                                |
| `fastlane/QUESTIONNAIRES.md` | Prepared answers for every App Store Connect and Play Console questionnaire, with the code evidence behind each. Read before filling anything in a store console. |
| `docs/ui-writing-style.md`   | House style for on-screen copy and store listing text: plain, no em dashes, no personification. Read before writing UI strings or editing `fastlane/metadata/`.   |
| `docs/writing-style.md`      | House style for prose communication: updates, docs, emails, chat, tickets, release notes. Read before drafting any written communication outside of UI strings.   |
