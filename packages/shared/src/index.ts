export type OperatingMode = 'free' | 'byok' | 'managed';

export type TaskCategory =
  | 'ui_ux'
  | 'feature'
  | 'bug_fix'
  | 'debugging'
  | 'refactoring'
  | 'performance'
  | 'database'
  | 'api'
  | 'auth'
  | 'security'
  | 'testing'
  | 'documentation'
  | 'architecture';

export type TargetAgent =
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'antigravity'
  | 'opencode'
  | 'gemini-cli'
  | 'codex-cli'
  | 'generic';

export type IntegrationStatus = 'available' | 'beta' | 'planned' | 'experimental';

export type ContextMode = 'none' | 'basic' | 'selected_files';

export interface UserInstruction {
  id: string;
  text: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface PromptProfile {
  id: string;
  name: string;
  category: TaskCategory;
  description: string;
  systemGuidance: string;
  isBuiltin: boolean;
}

export interface ProjectContextSummary {
  mode: ContextMode;
  framework?: string;
  language?: string;
  dependencies?: string[];
  directories?: string[];
  selectedFiles?: Array<{ path: string; content: string }>;
}

export interface EnhanceRequest {
  originalPrompt: string;
  additionalInstructions?: string;
  savedInstructions?: UserInstruction[];
  profileId?: string;
  category?: TaskCategory;
  mode: OperatingMode;
  targetAgent?: TargetAgent;
  providerId?: string;
  modelId?: string;
  projectContext?: ProjectContextSummary;
}

export interface EnhanceResponse {
  originalPrompt: string;
  enhancedPrompt: string;
  mode: OperatingMode;
  category: TaskCategory;
  targetAgent: TargetAgent;
  assumptions: string[];
  disclaimer?: string;
}

export type PlanTier = 'free' | 'byok' | 'pro' | 'power';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  priceInrMonthly: number;
  requiresApiKey: boolean;
  inferencePayer: 'none' | 'user' | 'promptpilot';
  monthlyManagedRequests: number | null;
  features: string[];
}

export interface IntegrationInfo {
  id: TargetAgent;
  name: string;
  status: IntegrationStatus;
  summary: string;
  lastTested?: string;
}

