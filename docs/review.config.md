# Review Configuration — Refrain

## Repository

- Org: Subverting-complexity
- Repo: Refrain
- Default branch: main

## Labels

State labels are mutually exclusive — exactly one is applied per review.

| Label                      | Type   | Meaning                                                                     |
| -------------------------- | ------ | --------------------------------------------------------------------------- |
| `claude-reviewing`         | State  | Review in progress — prevents concurrent reviews                            |
| `claude-approved`          | State  | No remaining issues, ready for human merge                                  |
| `claude-changes-requested` | State  | Concrete problems remain that a human must address                          |
| `claude-needs-discussion`  | State  | Architectural or scope questions need human judgment                        |
| `claude-needs-re-review`   | State  | New commits pushed since last review — re-review required                   |
| `claude-review-failed`     | State  | Review could not be completed (checkout failed, PR too large)               |
| `claude-updating`          | State  | A builder agent is addressing review feedback — prevents concurrent updates |
| `claude-fixes-applied`     | Action | Claude pushed fix commits to the PR branch (sticky across runs)             |

These labels are managed by the `/github-workflow:code-review` skill
and form the single source of truth for PR review state. Claude labels
in `ClaudeProject.md` (like `claude:authored`) are separate workflow
markers that do not participate in this state machine.

## Hard Non-Compliance Gates

Any of these force a `Changes Requested` verdict regardless of all other
findings.

- Missing TypeScript types (no `any` without justification)
- Hardcoded colors or spacing values (must use theme tokens)
- Direct use of `Pressable`/`TouchableOpacity` instead of `AccessiblePressable`
- Test coverage below 80% threshold
- Formatting or lint violations

## Tech Stack Review Rules

- **Expo SDK 56** — verify new dependencies are compatible
- **expo-router** — file-based routing in `app/`; no manual route registration
- **expo-sqlite** — used for track persistence; verify migrations
- **TypeScript strict mode** — no implicit any, strict null checks

## Architecture Rules

- Services (`src/services/`) must have no React dependency
- Components (`src/components/`) — one component per file, accept `style` prop
- Hooks (`src/hooks/`) — custom hooks only, no business logic
- Domain must not import from infrastructure; strict layer boundaries

## Security Specifics

- No secrets or API keys in source
- Validate all user input at system boundaries
- Use parameterized queries for SQLite operations

## Test Expectations

- Tests co-located in `__tests__/` directories next to source
- Mock native modules (expo-file-system, expo-crypto)
- 80% coverage threshold on branches/functions/lines/statements
- Tests written alongside code, not after

## Auto-Merge on Approval

| Setting                 | Value  |
| ----------------------- | ------ |
| auto-merge-on-approval  | `true` |
| require-ci-before-merge | `true` |

- **auto-merge-on-approval** `true` — once the code-review skill approves
  a PR and posts its review comment, it squash-merges the PR
  unattended.
- **require-ci-before-merge** `true` — GitHub cannot enforce required
  status checks on this private repo (Free plan: branch protection with
  required checks returns 403), so the plugin enforces the gate instead.
  The code-review skill waits for a green CI run and **pauses** an
  approved PR that has no checks or a red/pending check, rather than
  merging it. The gating CI check is the `Quality Gate` job in
  `.github/workflows/ci.yml`.

> To switch to GitHub-enforced merge gating (and drop the
> `require-ci-before-merge` fallback), the repo must go public or move to
> GitHub Pro/Team/Enterprise, then re-run `/github-workflow:setup harden`
> to apply branch protection with the `Quality Gate` required check.

## Review Comment Footer

```
---
Reviewed at <SHA>
🤖 Reviewed with Claude Code
```

The `Reviewed at <SHA>` line is machine-parsed by future runs to detect
whether the PR has changed since the last review.
