# PromptPilot for Cursor

Cursor supports custom rules that apply to every prompt. Use PromptPilot as a pre-processing step.

## Setup

### Option 1: Cursor Rules file (recommended)

Create `.cursor/rules/promptpilot.mdc` in your project root:

```markdown
---
description: Enhance prompts with PromptPilot before executing
globs:
alwaysApply: false
---

When the user starts a message with `/enhance`, treat everything after `/enhance` as a raw prompt to enhance — do NOT execute it directly. Instead:

1. Parse the raw prompt:
   - Normal text = the task for the building AI
   - Text inside `///...///` = instructions for how to enhance (focus, tone, constraints)

2. Rewrite the raw prompt into a structured, implementation-ready prompt using these sections where useful:
   - **Objective**: What to accomplish (preserve the original intent exactly).
   - **Context**: What to inspect before editing.
   - **Requirements**: Concrete, checkable criteria (replace vague words like "modern", "fast", "clean" with specific acceptance criteria).
   - **Approach**: Ordered steps only when the task has genuine steps.
   - **Constraints**: What NOT to change or break.
   - **Done when**: How to verify success.
   - **Report back**: Ask for a file-by-file summary.

3. Output the enhanced prompt and wait for the user to confirm or edit before executing.

IMPORTANT: Only activate on `/enhance`. Normal messages should be handled normally.
```

### Option 2: CLI integration

Install the CLI globally:

```bash
npm install -g @promptpilot/cli
```

Then run from Cursor's terminal:

```bash
promptpilot enhance "your rough prompt here" --agent cursor
```

The enhanced prompt is printed to stdout and copied to clipboard.

### Option 3: Terminal function

Add to your shell profile (see `integrations/generic/promptpilot.sh` or `PromptPilot.ps1`):

```bash
# In Cursor's integrated terminal:
enhance "Fix the auth bug ///Keep session handling intact///"
```

