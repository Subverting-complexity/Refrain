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

| Purpose                | Label                    |
| ---------------------- | ------------------------ |
| status-ready           | `status/ready`           |
| needs-refinement       | `status/needs-refinement`|
| status-in-progress     | `status/in-progress`     |
| status-parked          | `status/parked`          |
| status-blocked         | `status/blocked`         |
| status-in-review       | `status/in-review`       |
| status-needs-attention | `status/needs-attention` |

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
| ready-gate       | `both`              |
| agent-gating     | `disabled`          |
| refinement-skill | `feature-discovery` |

- **ready-gate** `both` — a story is pickable only when it carries the
  `status/ready` label **and** sits in the board's `Ready` column.
- **agent-gating** `disabled` — Claude may pick any ready story without a
  separate human approval label.
- **refinement-skill** `feature-discovery` — used to refine a
  `status/needs-refinement` story when it reaches the front of the queue.

## Session Budget

| Setting       | Value |
| ------------- | ----- |
| stale-timeout | `8h`  |

The `stale-timeout` controls how long an assigned issue can go without
a branch or PR before `pick-story` reclaims it.

Agent sessions should target ~100k tokens. One story per session.
Commit and push early so progress survives session boundaries.

## Story Template

Issues should include these sections at minimum:

1. **Context** — What this is about and why it matters
2. **Requirements** — Acceptance criteria and constraints
3. **Notes** (optional) — Dependencies, references, edge cases

## Issue Prefixes

| Type         | Prefix    |
| ------------ | --------- |
| Story        | `[STORY]` |
| Bug          | `[BUG]`   |
| Architecture | `[ARCH]`  |
| Tech Debt    | `[DEBT]`  |

## Project Board

| Setting         | Value                            |
| --------------- | -------------------------------- |
| project-number  | `7`                              |
| project-node-id | `PVT_kwDODj6aos4BZOQd`           |
| project-title   | `Refrain`                        |
| status-field-id | `PVTSSF_lADODj6aos4BZOQdzhUOfOE` |

### Status Options

| Purpose         | Status      | Option ID  |
| --------------- | ----------- | ---------- |
| col-backlog     | Todo        | `ee4b8f56` |
| col-ready       | Ready       | `38864860` |
| col-in-progress | In Progress | `bc8d792a` |
| col-in-review   | In Review   | `66276e02` |
| col-blocked     | Blocked     | `98abf0db` |
| col-done        | Done        | `6b4c0f2d` |

## Bundled Skills

These skills are bundled with the plugin and available as `/github-workflow:*`:

| Skill                              | Used in          |
| ---------------------------------- | ---------------- |
| /github-workflow:code-architect    | Planning         |
| /github-workflow:structured-coding | Implementation   |
| /github-workflow:code-review       | Review and audit |
| /github-workflow:grill-me          | Plan validation  |
| /github-workflow:feature-discovery | Backlog creation |
| /github-workflow:repo-scaffolding  | Project setup    |
