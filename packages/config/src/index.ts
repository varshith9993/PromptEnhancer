import type { IntegrationInfo, PlanConfig } from '@promptpilot/shared';

export const DEFAULT_PLANS: readonly PlanConfig[] = [
  {
    tier: 'free',
    name: 'Free (Rule-Based)',
    priceInrMonthly: 0,
    requiresApiKey: false,
    inferencePayer: 'none',
    monthlyManagedRequests: 0,
    features: [
      'Local rule-based prompt enhancement',
      '10 built-in task profiles & custom instructions',
      'Prompt review (Apply, Undo, Retry, Edit)',
      'CLI & web enhancer access'
    ]
  },
  {
    tier: 'byok',
    name: 'BYOK (Bring Your Own Key)',
    priceInrMonthly: 0,
    requiresApiKey: true,
    inferencePayer: 'user',
    monthlyManagedRequests: 0,
    features: [
      'Free platform access with your own API key',
      'Local OS credential storage via CLI',
      'OpenRouter, Gemini, Groq, NVIDIA NIM, OpenAI-compatible',
      'Direct provider requests without sending keys to PromptPilot'
    ]
  },
  {
    tier: 'pro',
    name: 'Pro (Managed AI)',
    priceInrMonthly: 199,
    requiresApiKey: false,
    inferencePayer: 'promptpilot',
    monthlyManagedRequests: 300,
    features: [
      'Managed AI prompt enhancement (no API key needed)',
      '300 managed AI enhancements / month',
      'Model selection & usage dashboard',
      'Priority CLI & web sync'
    ]
  },
  {
    tier: 'power',
    name: 'Power (Managed AI)',
    priceInrMonthly: 399,
    requiresApiKey: false,
    inferencePayer: 'promptpilot',
    monthlyManagedRequests: 1000,
    features: [
      'Managed AI prompt enhancement (no API key needed)',
      '1,000 managed AI enhancements / month',
      'All supported managed models',
      'Custom profiles & usage breakdown'
    ]
  }
];

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  { id: 'claude-code', name: 'Claude Code', status: 'planned', summary: 'Slash-command skill integration via /promptpilot:enhance' },
  { id: 'generic', name: 'Generic Terminal / CLI', status: 'planned', summary: 'Standalone promptpilot CLI for any terminal workflow' },
  { id: 'vscode', name: 'VS Code', status: 'planned', summary: 'Editor command & clipboard/selection workflow' },
  { id: 'cursor', name: 'Cursor', status: 'planned', summary: 'Composer & prompt enhancement integration' },
  { id: 'antigravity', name: 'Antigravity', status: 'planned', summary: 'Agent workspace prompt enhancement skill' },
  { id: 'opencode', name: 'OpenCode', status: 'planned', summary: 'CLI and agent workflow integration' },
  { id: 'gemini-cli', name: 'Gemini CLI', status: 'planned', summary: 'Terminal prompt pre-processor for Gemini CLI' },
  { id: 'codex-cli', name: 'Codex CLI', status: 'planned', summary: 'Terminal prompt pre-processor for Codex CLI' }
];

