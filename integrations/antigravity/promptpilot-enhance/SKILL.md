---
name: promptpilot-enhance
description: Trigger ONLY when the user explicitly invokes /enhance or /promptpilot-enhance. Normal text is the prompt for the building AI; ///.../// tells the prompt-enhancing AI how to enhance it.
---

# PromptPilot Enhance Skill

Only activate this skill when the user explicitly invokes `/enhance` or `/promptpilot-enhance`. Do not intercept normal coding requests.

1. Keep normal text as the prompt for the building AI, and treat any `///...///` block as instructions for how to enhance that prompt.
2. Run the PromptPilot CLI:
   ```bash
   node apps/cli/dist/index.js enhance "<user prompt>" --agent antigravity
   ```
   For free no-key LLM enhancement via AI Horde:
   ```bash
   node apps/cli/dist/index.js enhance "<user prompt>" --mode byok --provider aihorde --agent antigravity
   ```
3. Present the enhanced prompt for user review (**Apply**, **Edit**, **Retry**, or **Undo**).
4. Never execute the enhanced coding instructions automatically until the user confirms.
