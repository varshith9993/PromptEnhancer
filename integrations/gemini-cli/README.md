# PromptPilot for Gemini CLI

## Setup

### Option 1: Custom instruction file

Create `~/.gemini/config/skills/promptpilot-enhance/SKILL.md`:

```markdown
---
name: promptpilot-enhance
description: Enhance coding prompts before execution. Triggered by /enhance command.
---

When the user starts a message with `/enhance`, treat everything after it as a raw prompt to enhance — do NOT execute it directly.

## Parsing rules

- Normal text = the task for the building AI (preserve exactly)
- Text inside `///...///` = instructions telling YOU how to enhance the prompt

## Enhancement process

1. Identify the task category (UI/UX, bug fix, feature, debugging, refactoring, performance, API, auth, security, testing, docs, architecture).
2. Replace vague words with concrete criteria:
   - "modern" → consistent spacing, type hierarchy, accessible contrast
   - "fast" → measure, fix largest bottleneck, report before/after
   - "clean" → fewer visual elements, more whitespace
   - "simple" → smallest change that works, no speculative abstractions
3. Structure the prompt with these ## headings (skip empty ones):
   - Objective, Context, Requirements, Approach, Constraints, Done when, Report back
4. Always include in Constraints: keep unrelated behavior intact, do not add unnecessary dependencies.
5. Always include in Done when: project builds and existing tests pass.
6. Output ONLY the enhanced prompt. No preamble, no explanation.

IMPORTANT: Only trigger on `/enhance`. Normal messages should be handled normally.
```

### Option 2: CLI

```bash
npm install -g @promptpilot/cli
promptpilot enhance "your prompt" --agent gemini-cli
```

### Option 3: Shell function

Add to `~/.bashrc` or `~/.zshrc` (see `integrations/generic/promptpilot.sh`).
