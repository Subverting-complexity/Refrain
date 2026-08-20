# Project Configuration

Settings for the `github-workflow` plugin. All commands and the
execute skill read this file.

## Identity

| Setting        | Value                   |
| -------------- | ----------------------- |
| org            | `Subverting-complexity` |
| repo           | `Refrain`               |
| default-branch | `main`                  |

## Package Manager

`npm`

## Quality Gate

Command to run before each commit:

```
npm run typecheck && npm run lint && npm run format:check && npm test -- --coverage
```

## Branch Convention

Pattern for feature branches:

```
feature/{number}/{short-description}
```

## Label Map

Map workflow purposes to your repository's actual label names.

### Priority

| Purpose           | Label               |
| ----------------- | ------------------- |
| priority-critical | `priority/critical` |
| priority-high     | `priority/high`     |
| priority-medium   | `priority/medium`   |
| priority-low      | `priority/low`      |

### Type

Type labels control mode filtering. `/github-workflow:execute` (default)
picks the highest-priority issue regardless of type; `--mode feature`
picks stories only; `--mode maintenance` picks from bug/security/debt/arch.

| Purpose       | Label           |
| ------------- | --------------- |
| type-story    | `type/story`    |
| type-bug      | `type/bug`      |
| type-security | `type/security` |
| type-debt     | `type/debt`     |
| type-arch     | `type/arch`     |

### Status

The issue-lifecycle state set. Every issue carries exactly one.

| Purpose                | Label                     |
| ---------------------- | ------------------------- |
| status-ready           | `status/ready`            |
| needs-refinement       | `status/needs-refinement` |
| status-in-progress     | `status/in-progress`      |
| status-parked          | `status/parked`           |
| status-blocked         | `status/blocked`          |
| status-in-review       | `status/in-review`        |
| status-needs-attention | `status/needs-attention`  |

### Claude

Simple markers applied by workflow commands. These are **not** the
review state labels — those are defined in `docs/review.config.md`
and managed by the code-review skill.

| Purpose         | Label             | Applied by   |
| --------------- | ----------------- | ------------ |
| claude-authored | `claude:authored` | finish-story |
| claude-blocked  | `claude:blocked`  | block-story  |

## Workflow Settings

| Setting          | Value               |
| ---------------- | ------------------- |
| ready-gate       | `none`              |
| agent-gating     | `disabled`          |
| refinement-skill | `feature-discovery` |

- **ready-gate** `none` — the workflow is **not** gated on a ready
  signal. A story is pickable regardless of whether it carries the
  `status/ready` label or sits in the board's `Ready` column. Pick the
  highest-priority open, unassigned issue and start it — the only
  exclusions are issues that are `status/blocked` or carry
  `status/needs-refinement` (and, when `agent-gating` is `enabled`,
  issues lacking the `claude-ready` label). Set this to `label`,
  `board-column`, or `both` to re-enable gating on the ready signal.
- **agent-gating** `disabled` — Claude may pick any ready story without a
  separate human approval label.
- **refinement-skill** `feature-discovery` — used to refine a
  `status/needs-refinement` story when it reaches the front of the queue.

## Issue Prefixes

| Type         | Prefix    |
| ------------ | --------- |
| Story        | `[STORY]` |
| Bug          | `[BUG]`   |
| Architecture | `[ARCH]`  |
| Tech Debt    | `[DEBT]`  |

