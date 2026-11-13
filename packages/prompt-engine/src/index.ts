import type { EnhanceRequest, EnhanceResponse, TargetAgent } from '@promptpilot/shared';
import { getProfileById } from './profiles.js';
import {
  AGENT_NOTES,
  PLAYBOOKS,
  expandVagueTerms,
  extractFilePaths,
  inferTaskCategory,
  isAmbiguous,
  parseInlineInstructions,
  rankCategories
} from './rules.js';

export * from './profiles.js';
export * from './byok.js';
export {
  PLAYBOOKS,
  buildMetaSystemPrompt,
  cleanAiOutput,
  expandVagueTerms,
  inferTaskCategory,
  parseInlineInstructions,
  rankCategories
} from './rules.js';

function cleanSentence(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
const numbered = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
const unique = (lines: string[]) => Array.from(new Set(lines.filter(Boolean)));

export function enhancePromptRuleBased(request: EnhanceRequest): EnhanceResponse {
  const parsed = parseInlineInstructions(request.originalPrompt);
  const original = parsed.prompt;
  if (!original) {
    throw new Error('Original prompt cannot be empty.');
  }

  const profile = getProfileById(request.profileId);
  const ranked = rankCategories(original);
  const category = request.category ?? profile?.category ?? inferTaskCategory(original);
  const playbook = PLAYBOOKS[category];
  // A secondary domain (e.g. auth inside a bug fix) contributes its pitfalls too.
  const secondary = ranked.find((c) => c !== category);
  const targetAgent: TargetAgent = request.targetAgent ?? 'generic';

  const directives = unique(
    [parsed.inlineInstructions, request.additionalInstructions?.trim() ?? '']
      .flatMap((block) => block.split(/\n+/))
      .map(cleanSentence)
  );
  const savedRules = (request.savedInstructions ?? [])
    .filter((item) => item.enabled)
    .map((item) => cleanSentence(item.text))
    .filter(Boolean);

  const sections: string[] = [];

  // Objective: the user's words first (never discarded), then the concrete goal.
  sections.push(`## Objective\n${cleanSentence(original)}\n${playbook.goal}`);

  // Context: what to read before touching code.
  const contextLines: string[] = [];
  const files = extractFilePaths(original);
  if (files.length) contextLines.push(`Start with the files mentioned: ${files.join(', ')}.`);
  const ctx = request.projectContext;
  if (ctx && ctx.mode !== 'none') {
    if (ctx.language || ctx.framework) {
      contextLines.push(`Stack: ${[ctx.language, ctx.framework].filter(Boolean).join(', ')}.`);
    }
    if (ctx.selectedFiles?.length) {
      contextLines.push(`Provided files: ${ctx.selectedFiles.map((f) => f.path).join(', ')}.`);
    }
  }
  contextLines.push(`Before editing, inspect ${playbook.inspectFirst.join(', and ')}.`);
  if (AGENT_NOTES[targetAgent]) contextLines.push(AGENT_NOTES[targetAgent]);
  sections.push(`## Context\n${bullets(contextLines)}`);

  // Requirements: the user's own details plus vague words made checkable.
  const requirements = unique([...directives, ...expandVagueTerms(`${original} ${directives.join(' ')}`)]);
  if (requirements.length) sections.push(`## Requirements\n${bullets(requirements)}`);

    // Approach: profile guidance leads, then the category playbook.
    const approach = unique([...(profile ? [profile.systemGuidance] : []), ...playbook.approach]);
    sections.push(`## Approach\n${numbered(approach)}`);

    const constraints = unique([
      'Keep all existing functionality, routes, and business logic intact unless the task requires changing them.',
      'Do not modify unrelated files or add dependencies unless they are necessary.',
      ...playbook.pitfalls,
      ...(secondary ? PLAYBOOKS[secondary].pitfalls.slice(0, 1) : []),
      ...savedRules
    ]);
    sections.push(`## Constraints\n${bullets(constraints)}`);

    if (isAmbiguous(original) && !files.length) {
      sections.push(
        '## Assumptions\n- The request is brief, so locate the relevant code by searching the codebase first.\n- If several places could match, pick the most likely one and say which you chose. Ask before making broad or destructive changes.'
      );
    }

    sections.push(`## Done when\n${bullets([...playbook.doneWhen, 'The project builds and existing tests pass.'])}`);
    sections.push('## Report back\nSummarize what you changed and why (file by file), how you verified it, and anything left unresolved.');

    return {
      originalPrompt: request.originalPrompt,
      enhancedPrompt: sections.join('\n\n'),
      mode: 'free',
      category,
      targetAgent,
      assumptions: [
        `Inferred task category: ${playbook.label}`,
        ...(secondary ? [`Secondary domain: ${PLAYBOOKS[secondary].label}`] : []),
        `Formatted for target agent: ${targetAgent}`
      ],
      disclaimer:
      'Generated locally by the free rule-based engine. It structures your request with proven templates; it does not read your code or use AI.'
  };
  }
