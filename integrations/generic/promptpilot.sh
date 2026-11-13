#!/usr/bin/env bash
# Source this file in ~/.bashrc or ~/.zshrc:
#   source "/path/to/PromptEnhancer/integrations/generic/promptpilot.sh"

PROMPTPILOT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"

enhance() {
  local prompt="$1"
  local mode="${2:-free}"
  local provider="${3:-aihorde}"
  local output
  output="$(node "$PROMPTPILOT_ROOT/apps/cli/dist/index.js" enhance "$prompt" --mode "$mode" --provider "$provider")" || return 1

  printf '%s\n' "$output"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$output" | pbcopy
    printf '\n[PromptPilot] Copied to clipboard.\n'
  elif command -v xclip >/dev/null 2>&1; then
    printf '%s' "$output" | xclip -selection clipboard
    printf '\n[PromptPilot] Copied to clipboard.\n'
  fi
}

