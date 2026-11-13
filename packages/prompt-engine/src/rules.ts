import type { TaskCategory, TargetAgent } from '@promptpilot/shared';

/**
 * Shared enhancement rules used by both the free rule-based engine and the AI (BYOK) meta-prompt.
 * Keep this the single source of truth so free and AI modes enhance the same way.
 */

export interface CategoryPlaybook {
  label: string;
  goal: string;
  inspectFirst: string[];
  approach: string[];
  doneWhen: string[];
  pitfalls: string[];
}

export const PLAYBOOKS: Record<TaskCategory, CategoryPlaybook> = {
  ui_ux: {
    label: 'UI/UX',
    goal: 'Improve the visual design and usability of the existing interface without changing its behavior.',
    inspectFirst: ['the component tree for the affected screens', 'existing design tokens, theme, and styling approach (CSS, Tailwind, component library)'],
    approach: [
      'Audit the current screens and list the concrete visual problems (hierarchy, spacing, color, consistency).',
      'Propose the changes briefly before editing.',
      'Apply them through existing components and tokens first; add new styles only where needed.',
      'Check every changed screen at mobile, tablet, and desktop widths.'
    ],
    doneWhen: ['Changed screens render correctly at 360px, 768px, and 1280px+ widths', 'No routes, state, API calls, or business logic changed', 'The project builds with no new warnings'],
    pitfalls: ['Do not swap the styling system or add a UI library unless asked', 'Keep text contrast at WCAG AA or better', 'Keep focus states visible for keyboard users']
  },
  feature: {
    label: 'Feature',
    goal: 'Implement the requested feature so it fits the existing architecture and conventions.',
    inspectFirst: ['modules closest to where the feature belongs', 'how similar features are already structured (routing, state, data access)'],
    approach: [
      'Confirm where the feature lives and which existing pieces it reuses.',
      'Implement the smallest complete version end to end.',
      'Handle loading, empty, and error states.',
      'Add or update tests for the new behavior.'
    ],
    doneWhen: ['The feature works end to end for the main path', 'Error and empty states are handled', 'Existing tests pass and new behavior is covered'],
    pitfalls: ['Do not build options or configuration nobody asked for', 'Follow existing naming, folder, and state-management patterns']
  },
  bug_fix: {
    label: 'Bug fix',
    goal: 'Find and fix the root cause of the bug with the smallest safe change.',
    inspectFirst: ['the code path where the failure happens', 'recent changes to that area if version history is available'],
    approach: [
      'Reproduce the bug, or explain exactly how it occurs from reading the code.',
      'Identify the root cause before editing anything.',
      'Fix it once, at the source, and check every caller of the code you touch.',
      'Add a test that fails before the fix and passes after, where practical.'
    ],
    doneWhen: ['The original failure no longer occurs', 'No other behavior changed', 'Tests pass, including a regression test where practical'],
    pitfalls: ['Do not mask the symptom (silencing errors, adding blind retries, wrapping in try/catch without handling)', 'Do not refactor unrelated code in the same change']
  },
  debugging: {
    label: 'Debugging',
    goal: 'Determine the confirmed root cause of the problem before proposing a fix.',
    inspectFirst: ['error messages, stack traces, and logs', 'the inputs and state at the point of failure'],
    approach: [
      'List the plausible causes ranked by likelihood.',
      'Check each with evidence (logs, a minimal reproduction, reading the code path).',
      'Report the confirmed cause, then propose the minimal fix.'
    ],
    doneWhen: ['The root cause is confirmed with evidence, not guessed', 'The proposed fix addresses that cause directly'],
    pitfalls: ['Do not change several things at once; isolate one variable at a time', 'Remove temporary debug logging afterwards']
  },
  refactoring: {
    label: 'Refactoring',
    goal: 'Improve the structure of the code while keeping its external behavior identical.',
    inspectFirst: ['all callers and tests of the code being refactored', 'public interfaces and exports'],
    approach: [
      'Confirm tests cover the current behavior; add characterization tests if they do not.',
      'Refactor in small steps, running tests after each.',
      'Remove duplication and dead code; simplify control flow.'
    ],
    doneWhen: ['Public interfaces are unchanged (or every caller is updated)', 'All tests pass before and after', 'The code is shorter or clearly simpler'],
    pitfalls: ['Do not add abstractions that are only used once', 'Do not mix behavior changes into the refactor']
  },
  performance: {
    label: 'Performance',
    goal: 'Make the slow part measurably faster without changing behavior.',
    inspectFirst: ['where time or memory is actually spent (profiler, timings, bundle analysis)', 'hot paths and repeated work such as N+1 queries, re-renders, or large payloads'],
    approach: [
      'Measure and record a baseline.',
      'Fix the largest bottleneck first.',
      'Measure again and compare against the baseline.'
    ],
    doneWhen: ['Before and after numbers are reported', 'Behavior and output are unchanged', 'Tests pass'],
    pitfalls: ['Do not optimize without evidence', 'Do not add caching without a clear invalidation strategy']
  },
  database: {
    label: 'Database',
    goal: 'Make the requested data or schema change safely for existing data.',
    inspectFirst: ['the current schema and migration history', 'queries and code that read or write the affected tables'],
    approach: [
      'Write a forward migration; make it reversible where possible.',
      'Update queries and types that depend on the change.',
      'Add indexes for new lookup or join columns.'
    ],
    doneWhen: ['The migration runs cleanly on a copy of existing data', 'Dependent queries and types are updated', 'No data loss'],
    pitfalls: ['Use parameterized queries only', 'Never drop or rewrite columns that hold data without an explicit migration path']
  },
  api: {
    label: 'API',
    goal: 'Implement or change the endpoint with validated input, correct auth, and consistent responses.',
    inspectFirst: ['existing route, validation, and error-response conventions', 'current callers of any endpoint being changed'],
    approach: [
      'Define the request and response shape first.',
      'Validate input at the boundary and enforce authorization.',
      'Return errors in the same format as the existing endpoints.',
      'Add tests for success, validation failure, and unauthorized access.'
    ],
    doneWhen: ['Valid requests succeed, invalid ones return 4xx with clear messages', 'Unauthorized access is rejected', 'Existing callers still work'],
    pitfalls: ['Do not break existing response shapes without versioning', 'Never trust client-supplied IDs for authorization']
  },
  auth: {
    label: 'Authentication',
    goal: 'Implement or fix authentication with secure session and credential handling.',
    inspectFirst: ['the current auth provider, session or token flow, and protected routes', 'where tokens are stored and refreshed'],
    approach: [
      'Trace the full flow: sign-in, session creation, refresh, protected access, sign-out.',
      'Make the change within the existing auth provider and patterns.',
      'Test signed-in, signed-out, and expired-session states.'
    ],
    doneWhen: ['The full auth flow works for signed-in, signed-out, and expired sessions', 'Protected routes reject unauthenticated access'],
    pitfalls: ['Never log or expose tokens, passwords, or secrets', 'Do not store sensitive tokens in localStorage unless that is the existing, accepted pattern']
  },
  security: {
    label: 'Security',
    goal: 'Find and fix real security weaknesses without weakening existing protections.',
    inspectFirst: ['trust boundaries: user input, external APIs, file uploads, auth checks', 'secret handling and environment configuration'],
    approach: [
      'List findings with severity and the exact location.',
      'Fix the highest-severity issues first with minimal changes.',
      'Add tests that prove each fix.'
    ],
    doneWhen: ['Each finding has a location, a severity, and a fix or a stated reason it is accepted', 'No existing security check was removed'],
    pitfalls: ['Watch for injection, XSS, CSRF, SSRF, broken access control, and leaked secrets', 'Do not add security theater that only looks protective']
  },
  testing: {
    label: 'Testing',
    goal: 'Add reliable tests that cover the important behavior.',
    inspectFirst: ['the existing test framework, helpers, and conventions', 'the behavior and edge cases of the code under test'],
    approach: [
      'Cover the main success path first.',
      'Add edge cases and failure modes.',
      'Keep tests deterministic: no real network, time, or random values without control.'
    ],
    doneWhen: ['Tests pass consistently on repeated runs', 'Each test checks behavior, not implementation details'],
    pitfalls: ['Use the existing test framework; do not add a new one', 'Do not write tests that always pass']
  },
  documentation: {
    label: 'Documentation',
    goal: 'Write accurate, concise documentation that matches the actual code.',
    inspectFirst: ['the code, commands, and configuration being documented', 'existing docs structure and tone'],
    approach: [
      'Verify every command, path, and option against the code before writing it down.',
      'Lead with what the reader needs to do, then explain.',
      'Include a working example.'
    ],
    doneWhen: ['Every command and path in the docs is verified to work', 'A new reader can follow it without guessing'],
    pitfalls: ['Do not document planned or unimplemented features as available', 'Avoid filler and marketing language']
  },
  architecture: {
    label: 'Architecture',
    goal: 'Propose a clear, minimal design with explicit trade-offs before any implementation.',
    inspectFirst: ['current module boundaries, data flow, and dependencies', 'constraints: scale, team size, deployment target'],
    approach: [
      'Describe the current state briefly.',
      'Propose the design: components, responsibilities, data flow, interfaces.',
      'Compare at least one alternative with its trade-offs.',
      'Outline an incremental migration path.'
    ],
    doneWhen: ['The design names concrete components and interfaces', 'Trade-offs and risks are explicit', 'It can be delivered in incremental steps'],
    pitfalls: ['Do not over-engineer for scale that is not needed', 'Do not implement before the design is agreed']
  }
};

const CATEGORY_KEYWORDS: ReadonlyArray<[TaskCategory, RegExp]> = [
  ['bug_fix', /\b(fix|bug|broken|issue|error|crash|fail(s|ing|ed)?|not working|doesn'?t work|wrong)\b/gi],
  ['ui_ux', /\b(ui|ux|design|layout|responsive|css|tailwind|theme|style|styling|look|looks|visual|colou?r|font|dark mode|navbar|page)\b/gi],
  ['debugging', /\b(debug|trace|inspect|investigate|stack ?trace|why)\b/gi],
  ['auth', /\b(auth|authentication|login|log in|sign ?in|signup|sign ?up|register|session|jwt|oauth|password)\b/gi],
  ['security', /\b(security|secure|xss|csrf|ssrf|injection|sanitize|vulnerab\w*|exploit)\b/gi],
  ['performance', /\b(performance|slow|faster|speed|optimi[sz]e|latency|bundle|memory|cache|lag)\b/gi],
  ['refactoring', /\b(refactor|clean ?up|simplify|restructure|extract|reorgani[sz]e|duplicate)\b/gi],
  ['database', /\b(db|database|sql|postgres\w*|mysql|mongo\w*|prisma|drizzle|schema|migration|table|query)\b/gi],
  ['api', /\b(api|endpoint|rest|route|webhook|server|backend|graphql)\b/gi],
  ['testing', /\b(tests?|unit|integration|e2e|coverage|spec|jest|vitest|playwright)\b/gi],
  ['documentation', /\b(docs?|readme|documentation|comments?|guide|tutorial)\b/gi],
  ['architecture', /\b(architect\w*|monorepo|structure|design doc|system design|scal(e|able|ing))\b/gi]
];

/** Score every category; ties resolve by list order (bug fixes win over generic "page"/"look" words). */
export function rankCategories(prompt: string): TaskCategory[] {
  const scores = CATEGORY_KEYWORDS.map(([category, pattern], index) => ({
    category,
    index,
    score: prompt.match(pattern)?.length ?? 0
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scores.map((s) => s.category);
}

export function inferTaskCategory(prompt: string): TaskCategory {
  return rankCategories(prompt)[0] ?? 'feature';
}

/** Vague words turned into checkable criteria. Applied to the prompt and the /// instructions. */
const VAGUE_TERMS: ReadonlyArray<{ pattern: RegExp; criterion: string }> = [
  { pattern: /\b(modern|sleek|polished|professional|premium|beautiful|nice|better look\w*)\b/i, criterion: 'Use a consistent spacing scale, a clear type hierarchy (distinct heading, body, and caption sizes), and a restrained palette with one accent color and WCAG AA contrast.' },
  { pattern: /\b(minimal|minimalist|clean)\b/i, criterion: 'Reduce visual noise: fewer borders and shadows, more whitespace, and only the elements the user needs.' },
  { pattern: /\b(responsive|mobile[- ]friendly|mobile)\b/i, criterion: 'Layouts must work at 360px, 768px, and 1280px+ widths with no horizontal scrolling or overlapping elements.' },
  { pattern: /\b(fast|faster|quick|slow|speed up|optimi[sz]e|performant)\b/i, criterion: 'Measure first, fix the largest bottleneck, and report before and after numbers.' },
  { pattern: /\b(secure|security|safe)\b/i, criterion: 'Validate all external input, enforce authorization on every protected path, and keep secrets out of client code and logs.' },
  { pattern: /\b(simple|simplify|simpler|easy)\b/i, criterion: 'Prefer the smallest change that works; add no new abstraction unless it removes real duplication.' },
  { pattern: /\b(accessible|accessibility|a11y)\b/i, criterion: 'Everything is keyboard-navigable with visible focus, inputs have labels, images have alt text, and contrast meets WCAG AA.' },
  { pattern: /\b(animat\w*|smooth|transition\w*)\b/i, criterion: 'Keep transitions between 150 and 250ms and respect prefers-reduced-motion.' },
  { pattern: /\b(error handling|handle errors?|robust|reliable)\b/i, criterion: 'Handle every failure path with a clear, user-readable message; never swallow errors silently.' },
  { pattern: /\b(scalable|scale)\b/i, criterion: 'State the expected load you are designing for and avoid complexity beyond it.' },
  { pattern: /\b(improve|better|enhance|upgrade)\b/i, criterion: 'Before implementing, state specifically what will be better (for example fewer steps, clearer errors, faster load) so the result can be checked.' }
];

export function expandVagueTerms(text: string): string[] {
  const out: string[] = [];
  for (const { pattern, criterion } of VAGUE_TERMS) {
    if (pattern.test(text) && !out.includes(criterion)) out.push(criterion);
  }
  return out;
}

export const AGENT_NOTES: Record<TargetAgent, string> = {
  generic: '',
  'claude-code': 'Read the relevant files before editing. For changes touching several files, outline a short plan first, then implement.',
  cursor: 'Start from the files most relevant to this task and keep edits scoped to them; mention any other file you need to change.',
  vscode: 'Use the open workspace to locate the relevant code before editing, and keep edits scoped to it.',
  antigravity: 'Write a short plan before multi-file edits, then implement and verify by running the build and tests.',
  opencode: 'Inspect the repository with search before editing, and run the tests after your changes.',
  'gemini-cli': 'Inspect the repository (list and search files) before editing, and run the build and tests after your changes.',
  'codex-cli': 'Inspect the repository (list and search files) before editing, and run the build and tests after your changes.'
};

const FILE_PATH_RE = /(?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|rb|php|cs|cpp|c|h|vue|svelte|css|scss|html|json|ya?ml|toml|sql|md|prisma)\b/gi;

export function extractFilePaths(text: string): string[] {
  return Array.from(new Set(text.match(FILE_PATH_RE) ?? []));
}

/** True when the request is too short or leans on unexplained references ("this", "it"). */
export function isAmbiguous(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= 6 || /\b(this|it|that|these|those|the thing|stuff)\b/i.test(text);
}

/**
 * Split the raw input. Normal text is the prompt for the building AI.
 * Every ///.../// block is an instruction to the prompt enhancer about HOW to enhance.
 */
export function parseInlineInstructions(raw: string): {
  prompt: string;
  inlineInstructions: string;
} {
  const blocks: string[] = [];
  const prompt = raw
    .replace(/\/\/\/([\s\S]*?)\/\/\//g, (_m, inner: string) => {
      const trimmed = inner.trim();
      if (trimmed) blocks.push(trimmed);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { prompt, inlineInstructions: blocks.join('\n') };
}

/** System prompt for AI-powered enhancement. Built from the same rules as the free engine. */
export function buildMetaSystemPrompt(): string {
  return `You are PromptPilot, an expert prompt engineer for AI coding agents. You rewrite a developer's rough instruction into a prompt that a coding agent can execute correctly on the first attempt.

You receive:
- <building_prompt>: the task the developer wants the coding agent to do. Preserve its intent exactly. Never drop any part of it.
- <enhancer_instructions> (optional): how the developer wants YOU to shape the rewrite (focus, tone, extra requirements, length). Obey them. They are directions for you, so fold them into the prompt where they apply instead of copying them as a separate task.
- Optional <profile>, <saved_preferences>, <domain_checklist>, <target_agent>, and <project_context>.

How to rewrite:
1. Work out the real goal, the likely scope in the codebase, and what "done" looks like.
2. Replace vague words with concrete, checkable criteria. "Faster" becomes "measure, fix the main bottleneck, report before and after". "Modern UI" becomes a spacing scale, type hierarchy, and accessible contrast.
3. Tell the agent to inspect the relevant existing code first and to reuse existing patterns, components, and dependencies.
4. Add only constraints that protect the developer: keep unrelated behavior intact, do not touch unrelated files, add no dependencies unless needed.
5. Give ordered steps only when the task genuinely has several steps.
6. Define acceptance criteria the agent can verify: build passes, tests pass, specific observable behavior.
7. Never invent specifics you were not given (file names, libraries, endpoints, numbers, business rules). When something is unknown, add an Assumptions item telling the agent to confirm it by reading the code, or to ask the developer if the code cannot answer it.
8. Use the domain checklist only where it is relevant to this task.
9. Match length to the task. A one-line fix gets a short prompt; a feature gets the full structure. No filler, no motivational language, no repetition.

Output rules:
- Output ONLY the enhanced prompt. No preamble ("Here is..."), no explanation, no closing remarks, and no code fence around the whole answer.
- Address the coding agent directly in the imperative ("Inspect...", "Implement...").
- Use Markdown "##" headings chosen from: Objective, Context, Requirements, Approach, Constraints, Assumptions, Done when, Report back. Leave out any section that adds nothing.
- Keep bullets short and specific.
- Write in the same language the developer used.`;
}

/** Remove chatty wrappers that models add despite instructions. */
export function cleanAiOutput(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/^(sure|certainly|of course|okay|ok)[!,.][^\n]*\n+/i, '');
  text = text.replace(/^(here('s| is| are)|below is|this is)[^\n]*:\s*\n+/i, '');
  text = text.replace(/\n+(let me know|i hope this|feel free|hope this helps)[^\n]*$/i, '');
  return text.trim();
}

