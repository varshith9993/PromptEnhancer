import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enhancePromptRuleBased,
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
