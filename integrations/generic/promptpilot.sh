#!/usr/bin/env bash
# Source this file in ~/.bashrc or ~/.zshrc:
#   source "/path/to/PromptEnhancer/integrations/generic/promptpilot.sh"

PROMPTPILOT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"

enhance() {
  local prompt="$*"
  local cli="$PROMPTPILOT_ROOT/apps/cli/dist/index.js"
  local output

  if [[ -f "$cli" ]]; then
    output="$(node "$cli" enhance "$prompt")" || return 1
  else
    output="$(npx --yes @promptpilot/cli enhance "$prompt")" || return 1
  fi

  printf '%s\n' "$output"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$output" | pbcopy
    printf '\n[PromptPilot] Copied to clipboard.\n'
  elif command -v xclip >/dev/null 2>&1; then
    printf '%s' "$output" | xclip -selection clipboard
    printf '\n[PromptPilot] Copied to clipboard.\n'
  fi
}

alias /enhance='enhance'

