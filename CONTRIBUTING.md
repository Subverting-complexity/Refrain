# Contributing to Refrain

Thank you for your interest in contributing to Refrain. This document explains how to get involved.

## Reporting bugs

Open a [GitHub Issue](https://github.com/Subverting-complexity/Refrain/issues) with:

- A clear description of the problem
- Steps to reproduce it
- The platform you're running on (iOS, Android, web) and the OS version
- Any relevant error messages or screenshots

## Suggesting features

Open a [GitHub Issue](https://github.com/Subverting-complexity/Refrain/issues) and describe the feature you'd like to see, why it would be useful, and how you'd expect it to work.

## Submitting changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run the checks listed below
5. Open a pull request against `main`

Pull requests require at least one approving review before they can be merged.

## Development setup

```bash
npm install
```

See the [README](README.md) for full setup instructions and prerequisites.

## Code style

This project uses ESLint and Prettier. Run both before submitting a pull request:

```bash
npm run lint
npm run format:check
```

To auto-format:

```bash
npm run format
```

## Testing

Run the test suite before submitting changes:

```bash
npm test
```

To check coverage:

```bash
npm run test:coverage
```

The project enforces coverage thresholds. Core services under `src/services/` must maintain at least 80% coverage for statements, branches, functions and lines.

## Type checking

```bash
npm run typecheck
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behaviour to adrienne.bosch7@gmail.com.
