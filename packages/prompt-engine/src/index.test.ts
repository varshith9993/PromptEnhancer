import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enhancePromptRuleBased,
  enhancePromptWithFallback,
  inferTaskCategory,
  parseInlineInstructions,
  validateExternalBaseUrl,
  expandVagueTerms,
  buildMetaSystemPrompt,
  cleanAiOutput,
  rankCategories
} from './index.js';

test('inferTaskCategory detects UI/UX prompts', () => {
  assert.equal(inferTaskCategory('Change the UI look'), 'ui_ux');
});

test('enhancePromptRuleBased preserves original prompt and merges instructions', () => {
  const result = enhancePromptRuleBased({
    originalPrompt: 'change the ui look',
    additionalInstructions: 'make it minimal and responsive',
    savedInstructions: [
      { id: '1', text: 'Prefer TypeScript', enabled: true, isDefault: true },
      { id: '2', text: 'Disabled rule', enabled: false, isDefault: false }
    ],
    mode: 'free',
    targetAgent: 'claude-code'
  });

  assert.equal(result.originalPrompt, 'change the ui look');
  assert.equal(result.category, 'ui_ux');
  assert.equal(result.targetAgent, 'claude-code');
  assert.match(result.enhancedPrompt, /## Objective\nChange the ui look\./);
  assert.match(result.enhancedPrompt, /Make it minimal and responsive\./);
  assert.match(result.enhancedPrompt, /Prefer TypeScript\./);
  assert.doesNotMatch(result.enhancedPrompt, /Disabled rule/);
});

test('parseInlineInstructions extracts multiple ///.../// blocks and strips /enhance prefix', () => {
  const parsed = parseInlineInstructions('/enhance Fix login ///Keep OAuth intact/// and make fast ///Do not break tests///');
  assert.equal(parsed.prompt, 'Fix login and make fast');
  assert.equal(parsed.inlineInstructions, 'Keep OAuth intact\nDo not break tests');
});

test('expandVagueTerms turns vague adjectives into concrete criteria', () => {
  const criteria = expandVagueTerms('Make this page modern, clean and fast');
  assert.ok(criteria.length >= 3);
  assert.ok(criteria.some((c) => c.includes('spacing scale')));
  assert.ok(criteria.some((c) => c.includes('whitespace')));
  assert.ok(criteria.some((c) => c.includes('Measure first')));
});

test('cleanAiOutput removes fences and chat preambles', () => {
  const raw = 'Sure! Here is the enhanced prompt:\n\n## Objective\nFix the bug.\n\nHope this helps!';
  assert.equal(cleanAiOutput(raw), '## Objective\nFix the bug.');

  const fenced = '```markdown\n## Objective\nFix it.\n```';
  assert.equal(cleanAiOutput(fenced), '## Objective\nFix it.');
});

test('buildMetaSystemPrompt returns comprehensive instructions', () => {
  const prompt = buildMetaSystemPrompt();
  assert.match(prompt, /PromptPilot/);
  assert.match(prompt, /<building_prompt>/);
  assert.match(prompt, /<enhancer_instructions>/);
});

test('rankCategories returns ranked categories', () => {
  const ranked = rankCategories('Fix the bug in the authentication database query');
  assert.ok(ranked.length >= 2);
  assert.ok(ranked.includes('bug_fix'));
  assert.ok(ranked.includes('auth'));
  assert.ok(ranked.includes('database'));
});


test('validateExternalBaseUrl allows local routers and https, blocks cloud metadata', () => {
  assert.equal(validateExternalBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(validateExternalBaseUrl('http://127.0.0.1:31415/v1'), 'http://127.0.0.1:31415/v1');
  assert.equal(validateExternalBaseUrl('http://localhost:31415/v1'), 'http://localhost:31415/v1');
  assert.throws(() => validateExternalBaseUrl('http://api.openai.com/v1'));
  assert.throws(() => validateExternalBaseUrl('https://169.254.169.254/v1'));
  assert.throws(() => validateExternalBaseUrl('https://10.0.0.1/v1'));
  assert.throws(() => validateExternalBaseUrl('ftp://127.0.0.1/v1'));
});

test('enhancePromptRuleBased rejects empty prompt', () => {
  assert.throws(() => enhancePromptRuleBased({ originalPrompt: '   ', mode: 'free' }));
});

test('enhancePromptWithFallback skips failing provider and succeeds on next', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '## Objective\nFallback worked.' } }] }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const res = await enhancePromptWithFallback(
      { originalPrompt: 'Fix auth ///Keep OAuth///', mode: 'byok' },
      [
        { providerId: 'groq', apiKey: 'k1' },
        { providerId: 'openrouter', apiKey: 'k2' }
      ]
    );
    assert.equal(res.usedProvider, 'openrouter');
    assert.equal(res.attempts.length, 2);
    assert.equal(res.attempts[0]?.ok, false);
    assert.equal(res.attempts[1]?.ok, true);
    assert.match(res.response.enhancedPrompt, /Fallback worked/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
