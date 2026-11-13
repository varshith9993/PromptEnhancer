import type { PromptProfile } from '@promptpilot/shared';

export const BUILTIN_PROFILES: readonly PromptProfile[] = [
  {
    id: 'quick-fix',
    name: 'Quick Fix',
    category: 'bug_fix',
    description: 'Minimal, targeted fix without altering unrelated code.',
    systemGuidance: 'Focus on the smallest safe fix. Reproduce the failure, patch the root cause, and verify.',
    isBuiltin: true
  },
  {
    id: 'feature-dev',
    name: 'Feature Development',
    category: 'feature',
    description: 'End-to-end feature implementation following existing patterns.',
    systemGuidance: 'Inspect existing modules first, integrate cleanly, and cover loading, empty, and error states.',
    isBuiltin: true
  },
  {
    id: 'ui-ux-redesign',
    name: 'UI/UX Redesign',
    category: 'ui_ux',
    description: 'Visual hierarchy, responsive layout, and accessible controls.',
    systemGuidance: 'Audit existing components and tokens, preserve routes/state, and ensure desktop/mobile responsiveness.',
    isBuiltin: true
  },
  {
    id: 'debugging',
    name: 'Debugging',
    category: 'debugging',
    description: 'Systematic root-cause tracing before editing.',
    systemGuidance: 'Trace state and execution flow to confirm the root cause before proposing or applying edits.',
    isBuiltin: true
  },
  {
    id: 'code-refactoring',
    name: 'Code Refactoring',
    category: 'refactoring',
    description: 'Simplify structure while preserving external behavior.',
    systemGuidance: 'Keep public interfaces and tests intact. Remove duplication without adding speculative abstractions.',
    isBuiltin: true
  },
  {
    id: 'architecture-planning',
    name: 'Architecture Planning',
    category: 'architecture',
    description: 'Module boundaries, data flow, and trade-off analysis.',
    systemGuidance: 'Propose concrete module boundaries, data schemas, and trade-offs before implementation.',
    isBuiltin: true
  },
  {
    id: 'performance-optimization',
    name: 'Performance Optimization',
    category: 'performance',
    description: 'Targeted bottleneck removal with measurable verification.',
    systemGuidance: 'Identify the measured bottleneck first, optimize the hot path, and verify behavior is unchanged.',
    isBuiltin: true
  },
  {
    id: 'security-review',
    name: 'Security Review',
    category: 'security',
    description: 'Trust boundaries, input validation, auth, and secret hygiene.',
    systemGuidance: 'Check input validation, auth/authz checks, secret exposure, and injection/SSRF risks.',
    isBuiltin: true
  },
  {
    id: 'testing',
    name: 'Testing',
    category: 'testing',
    description: 'Deterministic unit/integration tests for core paths and edge cases.',
    systemGuidance: 'Write deterministic tests covering happy paths, invalid inputs, and boundary conditions.',
    isBuiltin: true
  },
  {
    id: 'documentation',
    name: 'Documentation',
    category: 'documentation',
    description: 'Accurate docs matched to the actual codebase.',
    systemGuidance: 'Document only verified commands, paths, and behavior observed in the repository.',
    isBuiltin: true
  }
];

export function getProfileById(profileId?: string): PromptProfile | undefined {
  if (!profileId) return undefined;
  return BUILTIN_PROFILES.find((p) => p.id === profileId);
}

