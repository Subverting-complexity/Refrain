# Project Configuration

Settings for the `github-workflow` plugin. All commands and the
execute skill read this file.

## Identity

| Setting        | Value                    |
| -------------- | ------------------------ |
| org            | `Subverting-complexity`  |
| repo           | `Refrain`                |
| default-branch | `main`                   |

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
| priority-critical | `priority/critical`  |
| priority-high     | `priority/high`      |
| priority-medium   | `priority/medium`    |
| priority-low      | `priority/low`       |

### Type

| Purpose    | Label         |
| ---------- | ------------- |
| type-story | `type/story`  |
| type-bug   | `type/bug`    |
| type-debt  | `type/debt`   |
| type-arch  | `type/arch`   |

### Status

| Purpose        | Label              |
| -------------- | ------------------ |
| status-ready   | `status/ready`     |
| status-blocked | `status/blocked`   |

### Claude

Simple markers applied by workflow commands. These are **not** the
review state labels — those are defined in `docs/review.config.md`
and managed by the code-review skill.

| Purpose          | Label              | Applied by       |
| ---------------- | ------------------ | ---------------- |
| claude-authored  | `claude:authored`  | finish-story     |
| claude-blocked   | `claude:blocked`   | block-story      |

## Session Budget

| Setting       | Value    |
| ------------- | -------- |
| stale-timeout | `8h`     |

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

| Setting             | Value                                              |
| ------------------- | -------------------------------------------------- |
| project-number      | `7`                                                |
| project-node-id     | `PVT_kwDODj6aos4BZOQd`                            |
| status-field-id     | `PVTSSF_lADODj6aos4BZOQdzhUOfOE`                  |

### Status Options

| Status      | Option ID  |
| ----------- | ---------- |
| Todo        | `f75ad846` |
| In Progress | `47fc9ee4` |
| Done        | `98236657` |

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
