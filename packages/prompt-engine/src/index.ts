import type {
  EnhanceRequest,
  EnhanceResponse,
  TaskCategory,
  TargetAgent
} from '@promptpilot/shared';
import { getProfileById } from './profiles.js';

export * from './profiles.js';
export * from './byok.js';

const CATEGORY_KEYWORDS: ReadonlyArray<[TaskCategory, RegExp]> = [
  ['ui_ux', /\b(ui|ux|design|layout|responsive|css|tailwind|theme|style|look)\b/i],
  ['bug_fix', /\b(fix|bug|broken|issue|error|crash|fail)\b/i],
  ['debugging', /\b(debug|trace|inspect|investigate|stack)\b/i],
  ['auth', /\b(auth|login|signup|register|session|jwt|oauth|password)\b/i],
  ['security', /\b(security|xss|csrf|ssrf|injection|sanitize|vulnerability)\b/i],
  ['performance', /\b(performance|slow|optimize|latency|bundle|memory|cache)\b/i],
  ['refactoring', /\b(refactor|clean|simplify|restructure|extract)\b/i],
  ['database', /\b(db|database|sql|postgres|prisma|drizzle|schema|migration)\b/i],
  ['api', /\b(api|endpoint|rest|route|webhook|server)\b/i],
  ['testing', /\b(test|unit|integration|e2e|coverage|spec)\b/i],
  ['documentation', /\b(doc|readme|comment|guide|docs)\b/i],
  ['architecture', /\b(architect|monorepo|structure|design doc|system)\b/i]
];

const CATEGORY_GUIDANCE: Record<TaskCategory, string[]> = {
  ui_ux: [
    'Analyze the existing component hierarchy and styling conventions before editing.',
    'Ensure responsive behavior across desktop, tablet, and mobile viewports.',
    'Reuse existing UI components and design tokens wherever possible.'
  ],
  feature: [
    'Review existing modules and conventions to integrate the feature cleanly.',
    'Handle loading, empty, and error states explicitly.'
  ],
  bug_fix: [
    'Reproduce and identify the root cause before applying a fix.',
    'Keep changes focused on the root cause without unrelated refactoring.'
  ],
  debugging: [
    'Trace the failing execution path and state transitions systematically.',
    'Report the confirmed root cause and verification steps.'
  ],
  refactoring: [
    'Preserve all existing external behavior, interfaces, and tests.',
    'Remove duplication and simplify control flow without adding unnecessary abstractions.'
  ],
  performance: [
    'Measure or identify the bottleneck before optimizing.',
    'Avoid premature complexity and verify behavior remains unchanged.'
  ],
  database: [
    'Ensure schema changes are normalized, indexed appropriately, and safe for existing data.',
    'Keep queries parameterized and handle migration edge cases.'
  ],
  api: [
    'Validate request inputs, enforce auth/authorization, and return consistent error shapes.',
    'Preserve backwards compatibility for existing callers.'
  ],
  auth: [
    'Follow secure credential, session, and token handling practices.',
    'Never expose secrets, tokens, or sensitive user data in logs or client responses.'
  ],
  security: [
    'Audit trust boundaries, input validation, and secret handling.',
    'Avoid weakening existing security checks.'
  ],
  testing: [
    'Cover primary success paths, edge cases, and failure modes.',
    'Keep tests deterministic and isolated from external state.'
  ],
  documentation: [
    'Keep documentation accurate, concise, and aligned with the actual codebase.',
    'Avoid documenting unimplemented behavior as available.'
  ],
  architecture: [
    'Evaluate trade-offs, module boundaries, and long-term maintainability.',
    'Keep the structure minimal and aligned with project conventions.'
  ]
};

export function inferTaskCategory(prompt: string): TaskCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(prompt)) {
      return category;
    }
  }
  return 'feature';
}

function cleanSentence(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function parseInlineInstructions(raw: string): {
  prompt: string;
  inlineInstructions: string;
} {
  const match = raw.match(/\/\/\/([\s\S]*?)\/\/\//);
  if (!match) {
    return { prompt: raw.trim(), inlineInstructions: '' };
  }
  const inlineInstructions = (match[1] ?? '').trim();
  const prompt = raw.replace(match[0], '').trim();
  return { prompt, inlineInstructions };
}

export function enhancePromptRuleBased(request: EnhanceRequest): EnhanceResponse {
  const parsed = parseInlineInstructions(request.originalPrompt);
  const original = parsed.prompt;
  if (!original) {
    throw new Error('Original prompt cannot be empty.');
  }

  const profile = getProfileById(request.profileId);
  const category = request.category ?? profile?.category ?? inferTaskCategory(original);
  const targetAgent: TargetAgent = request.targetAgent ?? 'generic';
  const cleanedObjective = cleanSentence(original);
  const extra = [request.additionalInstructions?.trim(), parsed.inlineInstructions]
    .filter(Boolean)
    .join(' ');
  const activeSaved = (request.savedInstructions ?? [])
    .filter((item) => item.enabled)
    .map((item) => cleanSentence(item.text))
    .filter(Boolean);

  const guidanceLines = [
    ...(profile ? [profile.systemGuidance] : []),
    ...CATEGORY_GUIDANCE[category]
  ];

  const sections: string[] = [
    `## Objective\n${cleanedObjective}`,
    `## Implementation Guidance\n${guidanceLines.map((line) => `- ${line}`).join('\n')}`
  ];

  if (extra) {
    sections.push(`## Additional Instructions\n${cleanSentence(extra)}`);
  }

  const constraints = [
    'Preserve all existing functionality, routes, and business logic unless explicitly asked to change them.',
    'Avoid modifying unrelated files or introducing unnecessary dependencies.',
    ...activeSaved
  ];
  sections.push(`## Constraints\n${constraints.map((line) => `- ${line}`).join('\n')}`);

  sections.push(
    '## Verification\n- Verify the project builds and passes relevant typechecks/tests.\n- Summarize the files changed and any remaining gaps.'
  );

  return {
    originalPrompt: request.originalPrompt,
    enhancedPrompt: sections.join('\n\n'),
    mode: 'free',
    category,
    targetAgent,
    assumptions: [
      `Inferred task category: ${category}`,
      `Formatted for target agent: ${targetAgent}`
    ],
    disclaimer:
      'Generated locally using PromptPilot Free Rule-Based mode (no AI inference or automatic codebase inspection).'
  };
}

