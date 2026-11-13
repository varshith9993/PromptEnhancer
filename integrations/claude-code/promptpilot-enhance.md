---
description: Trigger PromptPilot ONLY when the user invokes /promptpilot-enhance (or /enhance). Normal text is the building prompt; ///.../// instructs the prompt-enhancing AI how to enhance it.
argument-hint: "<building prompt> ///how to enhance it///"
---

Trigger this workflow ONLY when the user explicitly invokes this slash command.

Run PromptPilot CLI to enhance the user's instruction (normal text = prompt for the building AI; `///...///` = instructions for how the prompt-enhancing AI should rewrite it):

```bash
node "$PROMPTPILOT_DIR/apps/cli/dist/index.js" enhance "$ARGUMENTS" --agent claude-code
```

For no-key LLM enhancement via AI Horde, add `--mode byok --provider aihorde`.

Present the enhanced prompt to the user for review (Apply, Edit, Retry, or Undo). Do NOT execute the enhanced coding instructions until the user confirms.
