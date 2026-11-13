---
description: Enhance a rough coding instruction using PromptPilot before executing it
argument-hint: "<prompt> ///optional additional instructions///"
---

Run PromptPilot CLI to enhance the user's instruction:

```bash
node "$PROMPTPILOT_DIR/apps/cli/dist/index.js" enhance "$ARGUMENTS" --agent claude-code
```

If `PROMPTPILOT_DIR` is not set, replace `$PROMPTPILOT_DIR` with the path to your local `PromptEnhancer` repository.

Present the enhanced prompt to the user for review (Apply, Edit, or Undo). Do NOT execute the enhanced coding instructions until the user confirms.

