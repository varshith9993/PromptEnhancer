---
name: promptpilot-enhance
description: Enhance a rough developer prompt using PromptPilot (supports ///additional instructions///) and present it for review before executing.
---

# PromptPilot Enhance Skill

When the user asks to enhance a prompt or uses `/promptpilot-enhance`:

1. Extract the original prompt and any `///...///` inline instructions.
2. Run the PromptPilot CLI in the workspace:
   ```bash
   node apps/cli/dist/index.js enhance "<user prompt>" --agent antigravity
   ```
   To use a free no-key LLM or BYOK provider instead of rule-based mode:
   ```bash
   node apps/cli/dist/index.js enhance "<user prompt>" --mode byok --provider pollinations --agent antigravity
   ```
3. Show the enhanced prompt to the user so they can **Apply**, **Edit**, **Retry**, or **Undo** it.
4. Never execute the enhanced coding instructions automatically until the user confirms.

