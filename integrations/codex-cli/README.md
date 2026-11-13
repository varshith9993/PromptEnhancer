# PromptPilot for Codex CLI (OpenAI)

## Setup

### Option 1: Custom instructions

Add to your Codex CLI instructions file (`~/.codex/instructions.md` or project-level `AGENTS.md`):

```markdown
## /enhance command

When the user starts a message with `/enhance`, treat everything after it as a raw prompt to enhance — do NOT execute it directly.

### Parsing
- Normal text = the task for the building AI (preserve exactly)
- Text inside `///...///` = instructions for how to enhance

### Process
1. Detect the task type (UI, bug, feature, debug, refactor, perf, API, auth, security, test, docs, architecture).
2. Replace vague words with checkable criteria.
3. Output a structured prompt with: Objective, Context, Requirements, Approach, Constraints, Done when, Report back.
4. Wait for user confirmation before executing.

Only activate on `/enhance`. Normal messages should be handled normally.
```

### Option 2: CLI

```bash
npm install -g @promptpilot/cli
promptpilot enhance "your prompt" --agent codex-cli
```

### Option 3: Shell function

Add to your shell profile (see `integrations/generic/promptpilot.sh` or `PromptPilot.ps1`).
