import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enhancePromptRuleBased,
  enhancePromptWithFallback,
  inferTaskCategory,
  parseInlineInstructions,
  validateExternalBaseUrl
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

test('parseInlineInstructions extracts ///.../// block', () => {
  const parsed = parseInlineInstructions('Fix login ///Keep OAuth intact///');
  assert.equal(parsed.prompt, 'Fix login');
  assert.equal(parsed.inlineInstructions, 'Keep OAuth intact');
});

test('validateExternalBaseUrl blocks private/http URLs and allows https', () => {
  assert.equal(validateExternalBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.throws(() => validateExternalBaseUrl('http://api.openai.com/v1'));
  assert.throws(() => validateExternalBaseUrl('https://127.0.0.1:8080/v1'));
  assert.throws(() => validateExternalBaseUrl('https://localhost/v1'));
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
